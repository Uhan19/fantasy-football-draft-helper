import { describe, expect, it } from "vitest";
import { parsePickHistoryEntries, parsePickHistoryText } from "../../extension/src/parser.js";

describe("ESPN rendered practice pick history", () => {
  it("keeps round coordinates when only a partial later round is visible", () => {
    expect(parsePickHistoryEntries([
      "Ja'Marr Chase  /  CIN WR R4, P2 - Bob The AI - BUILT",
      "Ja'Marr Chase  /  CIN WR R4, P2 - Bob The AI - BUILT"
    ])).toEqual([{ round: 4, pickInRound: 2, playerName: "Ja'Marr Chase", fantasyTeamName: "Bob The AI - BUILT" }]);
  });
  it("handles joined DOM text, D/ST and dual-position players", () => {
    expect(parsePickHistoryText("Ja'Marr Chase/CINWRR1,P1-Team One")).toMatchObject({ playerName: "Ja'Marr Chase", round: 1, pickInRound: 1 });
    expect(parsePickHistoryText("Seahawks / SEA D/ST R12, P4 - Team One")).toMatchObject({ playerName: "Seahawks", round: 12 });
    expect(parsePickHistoryText("Travis Hunter / JAX WR CB R12, P5 — Team One")).toMatchObject({ playerName: "Travis Hunter", pickInRound: 5 });
  });
  it("rejects aggregate containers and invalid locations", () => {
    expect(parsePickHistoryText("Alpha / DET RB R1, P1 - One Beta / NYJ WR R1, P2 - Two")).toBeUndefined();
    expect(parsePickHistoryText("Alpha / DET RB R0, P0 - One")).toBeUndefined();
    expect(parsePickHistoryText("PICK 23 AUTO Team One")).toBeUndefined();
  });
});
