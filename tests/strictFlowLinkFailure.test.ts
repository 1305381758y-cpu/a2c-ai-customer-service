import { describe, expect, it } from "vitest";
import { reportsLinkLoadFailure, asksHowToOpenLink } from "../src/domain/strictFlowPredicates.js";
import { countLinkLoadFailures } from "../src/services/strictFlowReply.js";

describe("strict flow registration link failure detection", () => {
  it("treats repeated Spanish access, loading and blank-page reports as the same registration-link blocker", () => {
    const messages = [
      "No puedo acceder al enlace.",
      "He desactivado el acceso a los datos de la VPN, pero sigo sin poder acceder a ellos.",
      "Todavía no puedo entrar",
      "No carga, no hay nada.",
      "He probado otros métodos, pero sigo sin poder abrirlo. Por favor, revísenlo...",
      "En blanco, no se puede cargar."
    ];

    for (const message of messages) {
      expect(reportsLinkLoadFailure(message) || asksHowToOpenLink(message), message).toBe(true);
    }

    expect(countLinkLoadFailures([
      { direction: "inbound", content: messages[0] },
      { direction: "outbound", content: "Pruebe con Chrome o Safari." },
      { direction: "inbound", content: messages[1] }
    ], messages[2])).toBe(3);
  });

  it("recognizes Chinese blank and failed-loading variants as registration-link blockers", () => {
    const messages = [
      "链接还是打不开",
      "页面加载空白",
      "没有报错，就是无法加载内容",
      "白屏，什么都没有"
    ];

    for (const message of messages) {
      expect(reportsLinkLoadFailure(message) || asksHowToOpenLink(message), message).toBe(true);
    }
  });
});
