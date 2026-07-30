import type { Db } from "./db.js";
import type { Conversation, TeacherTgLinkRecord } from "./repositoryTypes.js";

function mapTeacherTgLink(row: Record<string, unknown>): TeacherTgLinkRecord {
  return {
    id: Number(row.id ?? 0),
    merchantId: String(row.merchant_id ?? "default"),
    countryId: String(row.country_id ?? ""),
    label: String(row.label ?? ""),
    url: String(row.url ?? ""),
    priority: Number(row.priority ?? 0),
    rotationCount: Math.max(1, Number(row.rotation_count ?? 1) || 1),
    assignedCount: Number(row.assigned_count ?? 0),
    status: String(row.status ?? "active") === "disabled" ? "disabled" : "active",
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

export class TeacherTgLinkRepository {
  constructor(private readonly db: Db) {}

  list(merchantId: string, countryId = ""): TeacherTgLinkRecord[] {
    const rows = this.db.sqlite.prepare(`
      SELECT *
      FROM teacher_tg_links
      WHERE merchant_id = ? AND (? = '' OR country_id = ?)
      ORDER BY priority DESC, id ASC
    `).all(merchantId, countryId, countryId) as Record<string, unknown>[];
    return rows.map(mapTeacherTgLink);
  }

  create(merchantId: string, countryId: string, input: Record<string, unknown>): TeacherTgLinkRecord {
    const url = String(input.url ?? "").trim();
    if (!url) throw new Error("老师TG链接不能为空");
    const result = this.db.sqlite.prepare(`
      INSERT INTO teacher_tg_links (merchant_id, country_id, label, url, priority, rotation_count, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      merchantId,
      countryId,
      String(input.label ?? "").trim(),
      url,
      Number(input.priority ?? 0) || 0,
      Math.max(1, Number(input.rotationCount ?? input.rotation_count ?? 1) || 1),
      String(input.status ?? "active") === "disabled" ? "disabled" : "active"
    );
    return this.get(Number(result.lastInsertRowid), merchantId)!;
  }

  importMany(merchantId: string, countryId: string, input: Record<string, unknown>): { imported: number; rows: TeacherTgLinkRecord[] } {
    const priority = Number(input.priority ?? 0) || 0;
    const rotationCount = Math.max(1, Number(input.rotationCount ?? 1) || 1);
    const urls = String(input.urls ?? input.url ?? "")
      .split(/[\n,，\s]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
    let imported = 0;
    const insert = this.db.sqlite.prepare(`
      INSERT INTO teacher_tg_links (merchant_id, country_id, label, url, priority, rotation_count, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `);
    this.db.sqlite.exec("BEGIN");
    try {
      for (const url of urls) {
        insert.run(merchantId, countryId, "", url, priority, rotationCount);
        imported += 1;
      }
      this.db.sqlite.exec("COMMIT");
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
    return { imported, rows: this.list(merchantId, countryId) };
  }

  patch(id: number, merchantId: string, patch: Record<string, unknown>): TeacherTgLinkRecord | undefined {
    const allowed: Record<string, string> = {
      label: "label",
      url: "url",
      priority: "priority",
      rotationCount: "rotation_count",
      assignedCount: "assigned_count",
      status: "status"
    };
    const entries = Object.entries(patch).filter(([key]) => key in allowed);
    if (entries.length) {
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      const values = entries.map(([key, value]) => {
        if (key === "priority" || key === "assignedCount") return Number(value ?? 0) || 0;
        if (key === "rotationCount") return Math.max(1, Number(value ?? 1) || 1);
        if (key === "status") return String(value) === "disabled" ? "disabled" : "active";
        return String(value ?? "").trim();
      });
      this.db.sqlite.prepare(`UPDATE teacher_tg_links SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?`).run(...values, id, merchantId);
    }
    return this.get(id, merchantId);
  }

  delete(id: number, merchantId: string): boolean {
    const result = this.db.sqlite.prepare("DELETE FROM teacher_tg_links WHERE id = ? AND merchant_id = ?").run(id, merchantId);
    return Number(result.changes ?? 0) > 0;
  }

  get(id: number, merchantId: string): TeacherTgLinkRecord | undefined {
    const row = this.db.sqlite.prepare("SELECT * FROM teacher_tg_links WHERE id = ? AND merchant_id = ?").get(id, merchantId) as Record<string, unknown> | undefined;
    return row ? mapTeacherTgLink(row) : undefined;
  }

  assignForConversation(conversation: Conversation, fallbackUrl = ""): TeacherTgLinkRecord | undefined {
    if (conversation.assignedTeacherTgLinkUrl) {
      return {
        id: conversation.assignedTeacherTgLinkId ?? 0,
        merchantId: conversation.merchantId,
        countryId: conversation.countryId,
        label: "",
        url: conversation.assignedTeacherTgLinkUrl,
        priority: 0,
        rotationCount: 1,
        assignedCount: 0,
        status: "active",
        createdAt: "",
        updatedAt: ""
      };
    }

    const inviteAssignment = this.db.sqlite.prepare(`
      SELECT invite_source, invite_code_id
      FROM a2c_invite_assignments
      WHERE merchant_id = ? AND conversation_id = ? AND status IN ('reserved', 'used')
      LIMIT 1
    `).get(conversation.merchantId, conversation.id) as { invite_source: string; invite_code_id: number } | undefined;
    const configuredBindingCount = inviteAssignment ? Number((this.db.sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM invite_code_teacher_tg_links
      WHERE merchant_id = ? AND invite_source = ? AND invite_code_id = ?
    `).get(conversation.merchantId, inviteAssignment.invite_source, inviteAssignment.invite_code_id) as { count?: number } | undefined)?.count ?? 0) : 0;
    const boundRows = inviteAssignment ? this.db.sqlite.prepare(`
      SELECT t.*, b.id AS binding_id, b.assigned_count AS binding_assigned_count
      FROM invite_code_teacher_tg_links b
      JOIN teacher_tg_links t ON t.id = b.teacher_tg_link_id AND t.merchant_id = b.merchant_id
      WHERE b.merchant_id = ? AND b.invite_source = ? AND b.invite_code_id = ?
        AND b.status = 'active' AND t.status = 'active' AND t.country_id = ?
      ORDER BY t.priority DESC, t.id ASC
    `).all(conversation.merchantId, inviteAssignment.invite_source, inviteAssignment.invite_code_id, conversation.countryId) as Array<Record<string, unknown>> : [];
    const boundLinks = boundRows.map((row) => ({
      link: { ...mapTeacherTgLink(row), assignedCount: Number(row.binding_assigned_count ?? 0) },
      bindingId: Number(row.binding_id)
    }));
    const selectedBound = boundLinks.length
      ? boundLinks.find((item) => item.link.id === this.pickNext(boundLinks.map((item) => item.link))?.id)
      : undefined;
    const links = selectedBound || configuredBindingCount > 0 ? [] : this.list(conversation.merchantId, conversation.countryId).filter((item) => item.status === "active" && item.url);
    const selected = selectedBound?.link ?? this.pickNext(links);
    const effectiveFallbackUrl = configuredBindingCount > 0 ? "" : fallbackUrl;
    if (!selected && !effectiveFallbackUrl) return undefined;
    const id = selected?.id ?? null;
    const url = selected?.url || effectiveFallbackUrl;
    this.db.sqlite.prepare(`
      UPDATE conversations
      SET assigned_teacher_tg_link_id = ?, assigned_teacher_tg_link_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id, url, conversation.id);
    conversation.assignedTeacherTgLinkId = selected?.id;
    conversation.assignedTeacherTgLinkUrl = url;
    if (selected) {
      this.db.sqlite.prepare("UPDATE teacher_tg_links SET assigned_count = assigned_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(selected.id);
      if (selectedBound) {
        this.db.sqlite.prepare("UPDATE invite_code_teacher_tg_links SET assigned_count = assigned_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(selectedBound.bindingId);
      }
      return { ...selected, assignedCount: selected.assignedCount + 1 };
    }
    return {
      id: 0,
      merchantId: conversation.merchantId,
      countryId: conversation.countryId,
      label: "",
      url,
      priority: 0,
      rotationCount: 1,
      assignedCount: 0,
      status: "active",
      createdAt: "",
      updatedAt: ""
    };
  }

  private pickNext(links: TeacherTgLinkRecord[]): TeacherTgLinkRecord | undefined {
    if (!links.length) return undefined;
    const sequence = links
      .sort((a, b) => b.priority - a.priority || a.id - b.id)
      .flatMap((link) => Array.from({ length: Math.max(1, link.rotationCount) }, () => link));
    const totalAssigned = links.reduce((sum, link) => sum + link.assignedCount, 0);
    return sequence[totalAssigned % sequence.length];
  }
}
