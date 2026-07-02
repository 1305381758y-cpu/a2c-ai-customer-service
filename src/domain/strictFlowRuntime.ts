import { buildStrictFlowReply } from "./strictFlow.js";
import type { StrictFlowInput, StrictFlowReply } from "./strictFlowTypes.js";

export type StrictFlowRuntimeContext = StrictFlowInput;

export interface StrictFlowRuntimeEngine {
  nextTurn(input: StrictFlowRuntimeContext): StrictFlowReply;
}

export function nextStrictFlowTurn(input: StrictFlowRuntimeContext): StrictFlowReply {
  return buildStrictFlowReply(input);
}

export const defaultStrictFlowRuntime: StrictFlowRuntimeEngine = {
  nextTurn: nextStrictFlowTurn
};
