import type { FastifyInstance } from "fastify";
import { requireUser } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { Repositories } from "./repositories.js";
import type { ConversationEngine } from "./services/conversationEngine.js";
import { registerConversationIngressRoutes } from "./http/conversationIngressRoutes.js";
import { registerAdminUserRoutes } from "./http/adminUserRoutes.js";
import { registerAuthRoutes } from "./http/authRoutes.js";
import { registerAdminDashboardRoutes } from "./http/adminDashboardRoutes.js";
import { registerAdminTrainingRoutes } from "./http/adminTrainingRoutes.js";
import { registerAdminScriptFlowRoutes } from "./http/adminScriptFlowRoutes.js";
import { registerMerchantScriptFlowRoutes } from "./http/merchantScriptFlowRoutes.js";
import { registerMerchantTrainingRoutes } from "./http/merchantTrainingRoutes.js";
import { registerMerchantTrainingSimulatorRoutes } from "./http/merchantTrainingSimulatorRoutes.js";
import { registerMerchantCustomerRoutes } from "./http/merchantCustomerRoutes.js";
import { registerMerchantIntentLearningRoutes } from "./http/merchantIntentLearningRoutes.js";
import { registerAdminConversationRoutes } from "./http/adminConversationRoutes.js";
import { registerMerchantConversationRoutes } from "./http/merchantConversationRoutes.js";
import { registerMerchantSettingsRoutes, registerStaticFrontendRoute } from "./http/merchantSettingsRoutes.js";
import { registerTelegramWebhookRoutes } from "./http/merchantTelegramRoutes.js";
import { registerAdminMerchantRoutes } from "./http/adminMerchantRoutes.js";
import { registerInternalMaintenanceRoutes } from "./http/internalMaintenanceRoutes.js";
import { registerAiCallStatsRoutes } from "./http/aiCallStatsRoutes.js";
import { registerOperationAuditRoutes } from "./http/operationAuditRoutes.js";
import { TestSnapshotRepository } from "./services/testSnapshotRepository.js";
import { TestSimulationStore } from "./services/testSimulationStore.js";

export function registerRoutes(app: FastifyInstance, deps: { config: AppConfig; repos: Repositories; conversationEngine: ConversationEngine; testSnapshots: TestSnapshotRepository; testSimulationStore: TestSimulationStore }): void {
  const adminOnly = requireUser(deps.config, deps.repos, ["platform_admin"]);
  const merchantRoles = requireUser(deps.config, deps.repos, ["platform_admin", "merchant_admin", "merchant_operator"]);
  const merchantAdmins = requireUser(deps.config, deps.repos, ["platform_admin", "merchant_admin"]);

  app.get("/health", async () => ({ ok: true }));

  registerAuthRoutes(app, deps);
  registerOperationAuditRoutes(app, { repos: deps.repos, adminOnly, merchantAdmins });

  registerAdminDashboardRoutes(app, { repos: deps.repos, adminOnly });

  registerAdminMerchantRoutes(app, { repos: deps.repos, adminOnly });
  registerMerchantSettingsRoutes(app, { config: deps.config, repos: deps.repos, adminOnly, merchantRoles, merchantAdmins });
  registerAdminUserRoutes(app, { repos: deps.repos, adminOnly });
  registerAdminTrainingRoutes(app, { repos: deps.repos, adminOnly });
  registerAdminScriptFlowRoutes(app, { repos: deps.repos, adminOnly });
  registerAdminConversationRoutes(app, { config: deps.config, repos: deps.repos, adminOnly });
  registerMerchantTrainingRoutes(app, { config: deps.config, repos: deps.repos, merchantRoles, merchantAdmins });
  registerMerchantTrainingSimulatorRoutes(app, { repos: deps.repos, conversationEngine: deps.conversationEngine, merchantRoles, adminOnly, testSnapshots: deps.testSnapshots, testSimulationStore: deps.testSimulationStore });
  registerMerchantCustomerRoutes(app, { repos: deps.repos, merchantRoles, merchantAdmins });
  registerMerchantIntentLearningRoutes(app, { repos: deps.repos, merchantRoles, merchantAdmins });
  registerMerchantScriptFlowRoutes(app, { repos: deps.repos, merchantRoles, merchantAdmins });
  registerMerchantConversationRoutes(app, { config: deps.config, repos: deps.repos, merchantRoles, merchantAdmins, testSnapshots: deps.testSnapshots, testSimulationStore: deps.testSimulationStore });
  registerAiCallStatsRoutes(app, { repos: deps.repos, adminOnly });

  registerInternalMaintenanceRoutes(app, { config: deps.config, repos: deps.repos });
  registerConversationIngressRoutes(app, deps);
  registerTelegramWebhookRoutes(app, deps);
  registerStaticFrontendRoute(app);
}
