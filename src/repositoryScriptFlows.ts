import type { Db } from "./db.js";
import { parseJsonObject } from "./repositoryJson.js";
import { mapScriptFlow, mapScriptFlowStep, mapScriptFlowVersion } from "./repositoryScriptFlowMappers.js";
import { normalizeScriptFlowStep, normalizeScriptFlowStepValue } from "./repositoryScriptFlowSteps.js";
import { normalizeScriptFlowStatus } from "./repositoryStatuses.js";
import { booleanPatchValue } from "./repositoryPatchValues.js";
import type { ScriptFlowRecord, ScriptFlowRuntime, ScriptFlowStepRecord, ScriptFlowVersionRecord } from "./repositoryTypes.js";

export class ScriptFlowRepository {
  constructor(
    private readonly db: Db,
    private readonly countries: {
      defaultCountryId: (merchantId: string) => string;
      validCountryId: (merchantId: string, countryId: string) => string;
    }
  ) {}

  list(filters: { merchantId?: string; countryId?: string; status?: string } = {}): ScriptFlowRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("sf.merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.countryId) {
      clauses.push("sf.country_id = ?");
      params.push(filters.countryId);
    }
    if (filters.status) {
      clauses.push("sf.status = ?");
      params.push(filters.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.sqlite
      .prepare(`
        SELECT sf.*, co.code AS country_code, co.name AS country_name, COUNT(s.id) AS step_count
        FROM script_flows sf
        LEFT JOIN merchant_countries co ON co.id = sf.country_id
        LEFT JOIN script_flow_steps s ON s.flow_id = sf.id
        ${where}
        GROUP BY sf.id
        ORDER BY sf.active DESC, sf.updated_at DESC, sf.id DESC
      `)
      .all(...params)
      .map((row) => mapScriptFlow(row as Record<string, unknown>));
  }

  get(id: number, merchantId?: string): ScriptFlowRuntime | undefined {
    const where = merchantId ? "WHERE sf.id = ? AND sf.merchant_id = ?" : "WHERE sf.id = ?";
    const row = this.db.sqlite.prepare(`
      SELECT sf.*, co.code AS country_code, co.name AS country_name,
        (SELECT COUNT(*) FROM script_flow_steps s WHERE s.flow_id = sf.id) AS step_count
      FROM script_flows sf
      LEFT JOIN merchant_countries co ON co.id = sf.country_id
      ${where}
    `).get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return { flow: mapScriptFlow(row), steps: this.listSteps(id, merchantId) };
  }

  getActive(merchantId: string, countryId?: string): ScriptFlowRuntime | undefined {
    const row = this.db.sqlite.prepare(`
      SELECT sf.*, co.code AS country_code, co.name AS country_name,
        (SELECT COUNT(*) FROM script_flow_steps s WHERE s.flow_id = sf.id) AS step_count
      FROM script_flows sf
      LEFT JOIN merchant_countries co ON co.id = sf.country_id
      WHERE sf.merchant_id = ? AND sf.active = 1 AND sf.status = 'active'
        AND (? = '' OR sf.country_id = ?)
      ORDER BY CASE WHEN sf.country_id = ? THEN 0 ELSE 1 END, sf.updated_at DESC
      LIMIT 1
    `).get(merchantId, countryId || "", countryId || "", countryId || "") as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return { flow: mapScriptFlow(row), steps: this.listSteps(Number(row.id), merchantId) };
  }

  create(merchantId: string, input: {
    name: string;
    countryId?: string;
    sourceFilename?: string;
    steps?: Array<Record<string, unknown>>;
    createdBy?: string;
  }): ScriptFlowRuntime {
    const name = input.name.trim();
    if (!name) throw new Error("话本名称不能为空");
    const countryId = this.countries.validCountryId(merchantId, input.countryId || "") || this.countries.defaultCountryId(merchantId);
    this.db.sqlite.exec("BEGIN");
    try {
      this.db.sqlite
        .prepare(`
          INSERT INTO script_flows (merchant_id, country_id, name, status, active, source_filename)
          VALUES (?, ?, ?, 'draft', 0, ?)
        `)
        .run(merchantId, countryId, name, input.sourceFilename || "");
      const flow = this.db.sqlite.prepare("SELECT id FROM script_flows WHERE id = last_insert_rowid()").get() as { id: number };
      const steps = input.steps || [];
      steps.forEach((step, index) => this.insertStep(flow.id, merchantId, countryId, step, index + 1));
      this.db.sqlite.exec("COMMIT");
      this.saveVersion(flow.id, merchantId, "创建话本", input.createdBy || "");
      return this.get(flow.id, merchantId)!;
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  listSteps(flowId: number, merchantId?: string): ScriptFlowStepRecord[] {
    const where = merchantId ? "WHERE flow_id = ? AND merchant_id = ?" : "WHERE flow_id = ?";
    return this.db.sqlite
      .prepare(`
        SELECT *
        FROM script_flow_steps
        ${where}
        ORDER BY sort_order ASC, id ASC
      `)
      .all(flowId, ...(merchantId ? [merchantId] : []))
      .map((row) => mapScriptFlowStep(row as Record<string, unknown>));
  }

  patch(id: number, merchantId: string | undefined, patch: Record<string, unknown>, userName = ""): ScriptFlowRuntime | undefined {
    const flow = this.get(id, merchantId);
    if (!flow) return undefined;
    const allowed: Record<string, string> = {
      name: "name",
      status: "status",
      countryId: "country_id"
    };
    const entries = Object.entries(patch).filter(([key]) => key in allowed);
    if (entries.length) {
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      const values = entries.map(([key, value]) => {
        if (key === "status") return normalizeScriptFlowStatus(value);
        if (key === "countryId") return this.countries.validCountryId(flow.flow.merchantId, String(value || "")) || flow.flow.countryId;
        return String(value ?? "");
      });
      const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
      this.db.sqlite.prepare(`UPDATE script_flows SET ${assignments}, updated_at = CURRENT_TIMESTAMP ${where}`).run(...values, id, ...(merchantId ? [merchantId] : []));
      this.saveVersion(id, flow.flow.merchantId, "修改话本基础信息", userName);
    }
    return this.get(id, merchantId);
  }

  enable(id: number, merchantId?: string, userName = ""): ScriptFlowRuntime | undefined {
    const flow = this.get(id, merchantId);
    if (!flow) return undefined;
    this.db.sqlite.exec("BEGIN");
    try {
      this.db.sqlite.prepare("UPDATE script_flows SET active = 0, status = CASE WHEN status = 'active' THEN 'draft' ELSE status END WHERE merchant_id = ?").run(flow.flow.merchantId);
      this.db.sqlite.prepare("UPDATE script_flows SET active = 1, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      this.db.sqlite.exec("COMMIT");
      this.saveVersion(id, flow.flow.merchantId, "启用话本", userName);
      return this.get(id, merchantId);
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  delete(id: number, merchantId?: string): boolean {
    const flow = this.get(id, merchantId);
    if (!flow) return false;
    if (flow.flow.active) throw new Error("当前启用的话本不能直接删除，请先启用其他话本或停用该话本");
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const result = this.db.sqlite.prepare(`DELETE FROM script_flows ${where}`).run(id, ...(merchantId ? [merchantId] : []));
    return result.changes > 0;
  }

  createStep(flowId: number, merchantId: string | undefined, input: Record<string, unknown>, userName = ""): ScriptFlowStepRecord | undefined {
    const flow = this.get(flowId, merchantId);
    if (!flow) return undefined;
    const maxOrder = this.db.sqlite.prepare("SELECT COALESCE(MAX(sort_order), 0) AS value FROM script_flow_steps WHERE flow_id = ?").get(flowId) as { value: number };
    this.insertStep(flowId, flow.flow.merchantId, flow.flow.countryId, input, Number(maxOrder.value || 0) + 1);
    this.bump(flowId, flow.flow.merchantId, "新增流程节点", userName);
    return this.listSteps(flowId, merchantId).at(-1);
  }

  patchStep(id: number, merchantId: string | undefined, patch: Record<string, unknown>, userName = ""): ScriptFlowStepRecord | undefined {
    const existing = this.getStep(id, merchantId);
    if (!existing) return undefined;
    const allowed: Record<string, string> = {
      flowCode: "flow_code",
      flowName: "flow_name",
      flowStep: "flow_step",
      goal: "goal",
      triggerCondition: "trigger_condition",
      customerExpressions: "customer_expressions",
      standardReply: "standard_reply",
      collectInfo: "collect_info",
      sendLink: "send_link",
      sendInvite: "send_invite",
      nextCondition: "next_condition",
      nextFlowCode: "next_flow_code",
      nextFlowStep: "next_flow_step",
      forbidden: "forbidden",
      notes: "notes",
      sortOrder: "sort_order",
      enabled: "enabled"
    };
    const entries = Object.entries(patch).filter(([key]) => key in allowed);
    if (entries.length) {
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      const values = entries.map(([key, value]) => normalizeScriptFlowStepValue(key, value));
      const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
      this.db.sqlite.prepare(`UPDATE script_flow_steps SET ${assignments}, updated_at = CURRENT_TIMESTAMP ${where}`).run(...values, id, ...(merchantId ? [merchantId] : []));
      this.bump(existing.flowId, existing.merchantId, "修改流程节点", userName);
    }
    return this.getStep(id, merchantId);
  }

  deleteStep(id: number, merchantId?: string, userName = ""): boolean {
    const step = this.getStep(id, merchantId);
    if (!step) return false;
    const references = this.db.sqlite
      .prepare(`
        SELECT id FROM script_flow_steps
        WHERE flow_id = ? AND id != ? AND enabled = 1
          AND ((next_flow_step != '' AND next_flow_step = ?) OR (next_flow_code != '' AND next_flow_code = ?))
        LIMIT 1
      `)
      .get(step.flowId, id, step.flowStep, step.flowCode) as { id: number } | undefined;
    if (references) throw new Error("有其他节点引用了这个节点，请先修改下一步条件后再删除");
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const result = this.db.sqlite.prepare(`DELETE FROM script_flow_steps ${where}`).run(id, ...(merchantId ? [merchantId] : []));
    if (result.changes > 0) this.bump(step.flowId, step.merchantId, "删除流程节点", userName);
    return result.changes > 0;
  }

  duplicateStep(id: number, merchantId?: string, userName = ""): ScriptFlowStepRecord | undefined {
    const step = this.getStep(id, merchantId);
    if (!step) return undefined;
    return this.createStep(step.flowId, merchantId, {
      ...step,
      flowCode: `${step.flowCode}_copy`,
      flowName: `${step.flowName || step.flowCode} 副本`,
      sortOrder: step.sortOrder + 1
    }, userName);
  }

  listVersions(flowId: number, merchantId?: string): ScriptFlowVersionRecord[] {
    const where = merchantId ? "WHERE flow_id = ? AND merchant_id = ?" : "WHERE flow_id = ?";
    return this.db.sqlite
      .prepare(`
        SELECT id, flow_id, merchant_id, version, note, created_by, created_at
        FROM script_flow_versions
        ${where}
        ORDER BY version DESC, id DESC
      `)
      .all(flowId, ...(merchantId ? [merchantId] : []))
      .map((row) => mapScriptFlowVersion(row as Record<string, unknown>));
  }

  restoreVersion(flowId: number, versionId: number, merchantId?: string, userName = ""): ScriptFlowRuntime | undefined {
    const flow = this.get(flowId, merchantId);
    if (!flow) return undefined;
    const where = merchantId ? "WHERE id = ? AND flow_id = ? AND merchant_id = ?" : "WHERE id = ? AND flow_id = ?";
    const version = this.db.sqlite.prepare(`SELECT * FROM script_flow_versions ${where}`).get(versionId, flowId, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    if (!version) return undefined;
    const snapshot = parseJsonObject(version.snapshot_json);
    const steps = Array.isArray(snapshot.steps) ? snapshot.steps as Array<Record<string, unknown>> : [];
    this.db.sqlite.exec("BEGIN");
    try {
      this.db.sqlite.prepare("DELETE FROM script_flow_steps WHERE flow_id = ?").run(flowId);
      steps.forEach((step, index) => this.insertStep(flowId, flow.flow.merchantId, flow.flow.countryId, step, index + 1));
      this.db.sqlite.exec("COMMIT");
      this.bump(flowId, flow.flow.merchantId, `恢复版本 ${version.version}`, userName);
      return this.get(flowId, merchantId);
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  private insertStep(flowId: number, merchantId: string, countryId: string, input: Record<string, unknown>, fallbackOrder: number): void {
    const flowCode = String(input.flowCode ?? input.flow_code ?? input["流程编号"] ?? "").trim() || `step_${fallbackOrder}`;
    const flowStep = normalizeScriptFlowStep(String(input.flowStep ?? input.flow_step ?? input["流程步骤"] ?? flowCode));
    const standardReply = String(input.standardReply ?? input.standard_reply ?? input["客服标准话术"] ?? input.content ?? "").trim();
    if (!standardReply) throw new Error(`流程 ${flowCode} 缺少客服标准话术`);
    this.db.sqlite
      .prepare(`
        INSERT INTO script_flow_steps
          (flow_id, merchant_id, country_id, flow_code, flow_name, flow_step, goal, trigger_condition, customer_expressions,
           standard_reply, collect_info, send_link, send_invite, next_condition, next_flow_code, next_flow_step,
           forbidden, notes, sort_order, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        flowId,
        merchantId,
        countryId,
        flowCode,
        String(input.flowName ?? input.flow_name ?? input["流程名称"] ?? "").trim(),
        flowStep,
        String(input.goal ?? input["当前节点目标"] ?? input["本节点目标"] ?? "").trim(),
        String(input.triggerCondition ?? input.trigger_condition ?? input["触发条件"] ?? "").trim(),
        String(input.customerExpressions ?? input.customer_expressions ?? input["客户常见表达"] ?? "").trim(),
        standardReply,
        String(input.collectInfo ?? input.collect_info ?? input["需要收集的信息"] ?? "").trim(),
        booleanPatchValue(input.sendLink ?? input.send_link ?? input["是否发链接"], false),
        booleanPatchValue(input.sendInvite ?? input.send_invite ?? input["是否发邀请码"], false),
        String(input.nextCondition ?? input.next_condition ?? input["下一步条件"] ?? "").trim(),
        String(input.nextFlowCode ?? input.next_flow_code ?? input["下一流程编号"] ?? "").trim(),
        normalizeScriptFlowStep(String(input.nextFlowStep ?? input.next_flow_step ?? "")),
        String(input.forbidden ?? input["禁止事项"] ?? "").trim(),
        String(input.notes ?? input["备注"] ?? "").trim(),
        Number(input.sortOrder ?? input.sort_order ?? input["排序"] ?? fallbackOrder),
        booleanPatchValue(input.enabled ?? input["启用"], true)
      );
  }

  private getStep(id: number, merchantId?: string): ScriptFlowStepRecord | undefined {
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const row = this.db.sqlite.prepare(`SELECT * FROM script_flow_steps ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    return row ? mapScriptFlowStep(row) : undefined;
  }

  private bump(flowId: number, merchantId: string, note: string, userName = ""): void {
    this.db.sqlite
      .prepare("UPDATE script_flows SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?")
      .run(flowId, merchantId);
    this.saveVersion(flowId, merchantId, note, userName);
  }

  private saveVersion(flowId: number, merchantId: string, note: string, userName = ""): void {
    const flow = this.get(flowId, merchantId);
    if (!flow) return;
    const snapshot = JSON.stringify({
      flow: flow.flow,
      steps: flow.steps
    });
    this.db.sqlite
      .prepare(`
        INSERT INTO script_flow_versions (flow_id, merchant_id, version, snapshot_json, note, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(flowId, merchantId, flow.flow.version, snapshot, note, userName);
  }
}
