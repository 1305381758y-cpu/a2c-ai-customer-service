import { api } from "../app/api.js";
import type { A2CAccount, SimulatorResponse } from "../types.js";

export type SimulatorMessageInput = {
  customerPhone: string;
  nickname: string;
  a2cAccountPhone?: string;
  content: string;
  msgType?: string;
};

export async function loadSimulatorA2CAccounts(): Promise<A2CAccount[]> {
  return (await api<{ rows: A2CAccount[] }>("/api/merchant/a2c/accounts")).rows || [];
}

export async function sendSimulatorMessage(input: SimulatorMessageInput): Promise<SimulatorResponse> {
  return await api<SimulatorResponse>("/api/merchant/training-simulator/messages", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      a2cAccountPhone: input.a2cAccountPhone || undefined,
      msgType: input.msgType || "text"
    })
  });
}
