import type {
  MerchantAgentProfileRecord,
  MerchantConfigRecord,
  MerchantCountryRecord,
  MerchantRecord,
  ScriptFlowRuntime
} from "../repositories.js";

export type TestSnapshotData = {
  snapshotId: string;
  merchantId: string;
  merchant: MerchantRecord;
  merchantConfig: MerchantConfigRecord;
  country: MerchantCountryRecord;
  agentProfile: MerchantAgentProfileRecord;
  scriptFlow: ScriptFlowRuntime;
  productionAgentId: string;
  productionWorkflowId: string;
  productionWorkflowVersion: number;
  nodeCount: number;
  nodeIds: string[];
  nodeEdges: Array<{ from: string; to: string; condition: string }>;
  agentVersion: string;
  scriptVersion: string;
  knowledgeBaseVersion: string;
  sampleLibraryVersion: string;
  teacherTgLinks: Array<{ label: string; url: string; priority: number; rotationCount: number; status: string }>;
  runtimeRules: {
    proactiveFollowup: string;
    autoStop: string;
    handoff: string;
    promptInjectionGuard: string;
    beforeSendGuard: string;
  };
  sourceUpdatedAt: string;
  snapshotCreatedAt: string;
  configHash: string;
  productionConfigChanged?: boolean;
  validation: {
    valid: boolean;
    errors: string[];
  };
  isolation: {
    simulationMode: true;
    sendToRealA2C: false;
    notifyRealTelegram: false;
    writeProductionDatabase: false;
    consumeRealInviteCode: false;
    updateRealCustomerState: false;
    scheduleRealFollowup: false;
    applyFixToProduction: false;
  };
};
