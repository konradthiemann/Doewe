import { describe, expect, it } from "vitest";

import { decideFlushStep } from "./outbox";

describe("decideFlushStep", () => {
  it.each([
    // Erfolg → Eintrag entfernen
    [200, "remove"],
    [201, "remove"],
    [204, "remove"],
    // Netz weg → anhalten (Reihenfolge wahren, später erneut)
    ["network-error", "halt"],
    // Server wackelt → anhalten
    [500, "halt"],
    [502, "halt"],
    [503, "halt"],
    // Session abgelaufen → anhalten + Re-Login-Signal
    [401, "halt-auth"],
    // Endgültige Ablehnungen → verwerfen + Nutzer informieren
    [400, "drop"],
    [403, "drop"],
    [404, "drop"],
    [409, "drop"],
    [422, "drop"]
  ] as const)("Status %s → %s", (status, expected) => {
    expect(decideFlushStep(status).action).toBe(expected);
  });
});
