import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "../config.js";
import { openDb, type Db } from "../db.js";
import { Repositories } from "../repositories.js";
import { ConversationEngine } from "./conversationEngine.js";
import { createConversationApplication } from "./conversationApplication.js";
import { appConfigForMerchant } from "./runtimeConfig.js";
import type { TestSnapshotData } from "./testSnapshotTypes.js";

type Workspace = { repos: Repositories; engine: ConversationEngine; merchantId: string };

export class TestSimulationStore {
  private readonly db: Db;
  private readonly workspaces = new Map<string, Workspace>();

  constructor(databaseUrl: string, private readonly config: AppConfig) {
    this.db = openDb(databaseUrl);
    this.db.sqlite.exec(`CREATE TABLE IF NOT EXISTS test_simulation_workspaces (snapshot_id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, country_id TEXT NOT NULL, flow_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  }

  getWorkspace(snapshot: TestSnapshotData, productionRepos?: Repositories): Workspace {
    const existing = this.workspaces.get(snapshot.snapshotId);
    if (existing) return existing;
    const runtimeConfig = productionRepos
      ? appConfigForMerchant(this.config, productionRepos.getMerchantConfig(snapshot.merchantId))
      : this.config;
    const row = this.db.sqlite.prepare("SELECT merchant_id, country_id, flow_id FROM test_simulation_workspaces WHERE snapshot_id = ?").get(snapshot.snapshotId) as { merchant_id: string; country_id: string; flow_id: number } | undefined;
    if (row) {
      const repos = new Repositories(this.db);
      const workspace = { repos, engine: new ConversationEngine(createConversationApplication(repos, runtimeConfig)), merchantId: row.merchant_id };
      this.workspaces.set(snapshot.snapshotId, workspace);
      return workspace;
    }

    const merchantId = `simulation:${snapshot.snapshotId}`;
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchants (id, name, status) VALUES (?, ?, 'active')").run(merchantId, `测试快照：${snapshot.merchant.name}`);
    const repos = new Repositories(this.db);
    const country = repos.createMerchantCountry(merchantId, {
      code: snapshot.country.code,
      name: snapshot.country.name,
      defaultLanguage: snapshot.country.defaultLanguage,
      platformRegisterUrl: snapshot.country.platformRegisterUrl,
      tgRegisterGuideUrl: snapshot.country.tgRegisterGuideUrl,
      requirePlatformAccount: snapshot.country.requirePlatformAccount,
      requirePhone: snapshot.country.requirePhone,
      requireTelegram: snapshot.country.requireTelegram,
      requireWhatsApp: snapshot.country.requireWhatsApp
    });
    repos.patchMerchantConfig(merchantId, {
      a2cAccountPhone: "simulation-a2c",
      smartReplyEnabled: true,
      trainingSimulationEnabled: true,
      strictScriptFlowEnabled: true,
      platformRegisterUrl: snapshot.merchantConfig.platformRegisterUrl,
      tgRegisterGuideUrl: snapshot.merchantConfig.tgRegisterGuideUrl,
      registrationTutorialImageUrl: snapshot.merchantConfig.registrationTutorialImageUrl,
      sessionPrice: 0,
      balance: 0
    });
    repos.patchMerchantAgentProfile(merchantId, { ...snapshot.agentProfile });
    let flow = repos.createScriptFlow(merchantId, {
      name: snapshot.scriptFlow.flow.name,
      countryId: country.id,
      sourceFilename: "production-snapshot",
      steps: snapshot.scriptFlow.steps.map((step) => ({
        ...step,
        countryId: country.id,
        flowId: undefined
      }))
    });
    // The production flow identity is recorded by the immutable snapshot.
    // The isolated database uses its own local primary keys so multiple
    // snapshots of the same production flow cannot collide with each other.
    if (Number.isInteger(snapshot.productionWorkflowVersion) && snapshot.productionWorkflowVersion > 0) {
      this.db.sqlite.prepare("UPDATE script_flows SET version = ? WHERE id = ? AND merchant_id = ?").run(snapshot.productionWorkflowVersion, flow.flow.id, merchantId);
      flow = repos.getScriptFlow(flow.flow.id, merchantId)!;
    }
    repos.enableScriptFlow(flow.flow.id, merchantId, "测试快照");
    const account = repos.syncMerchantA2CAccounts(merchantId, [{ apiPhone: "simulation-a2c", verifiedName: "模拟客服" }])[0];
    repos.createInviteCodeForA2CAccount(account.id, { code: "SIMULATED-INVITE", registerUrl: snapshot.merchantConfig.platformRegisterUrl, status: "available", countryId: country.id }, merchantId);
    for (const link of snapshot.teacherTgLinks) {
      repos.createTeacherTgLink(merchantId, country.id, { label: link.label, url: link.url, priority: link.priority, rotationCount: link.rotationCount, status: link.status });
    }
    this.db.sqlite.prepare("INSERT INTO test_simulation_workspaces(snapshot_id, merchant_id, country_id, flow_id) VALUES (?, ?, ?, ?)").run(snapshot.snapshotId, merchantId, country.id, flow.flow.id);
    // Reuse the production merchant's AI provider in memory so simulation
    // exercises the real translation path without persisting API keys in the
    // snapshot or the isolated test database.
    const workspace = { repos, engine: new ConversationEngine(createConversationApplication(repos, runtimeConfig)), merchantId };
    this.workspaces.set(snapshot.snapshotId, workspace);
    return workspace;
  }
}

export function ensureSqliteParent(databaseUrl: string): void {
  if (databaseUrl === ":memory:") return;
  mkdirSync(dirname(resolve(databaseUrl)), { recursive: true });
}
