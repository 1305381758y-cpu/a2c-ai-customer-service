import type { FastifyReply } from "fastify";
import type { ConversationExportRecord } from "../repositories.js";
import {
  buildConversationExportFile,
  normalizeConversationExportQuery,
  type ConversationExportQuery
} from "../services/conversationExport.js";

export { normalizeConversationExportQuery, type ConversationExportQuery };

export function sendConversationExport(reply: FastifyReply, rows: ConversationExportRecord[], format: string | undefined, prefix: string) {
  const file = buildConversationExportFile(rows, format, prefix);
  return reply
    .header("Content-Type", file.contentType)
    .header("Content-Disposition", `attachment; filename="${file.filename}"`)
    .send(file.body);
}
