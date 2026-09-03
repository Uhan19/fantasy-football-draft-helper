import {
  findAllMatchingSelectors,
  findFirstMatchingSelector,
  selectors
} from "./selectors.js";

export interface ObservedPick {
  overall: number;
  playerName: string;
  fantasyTeamName: string;
}

function text(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function pickNumber(row: Element): number | undefined {
  const direct = row.getAttribute("data-pick-number")
    ?? findFirstMatchingSelector(row, selectors.pickNumber)?.getAttribute("data-pick-number");
  if (direct && /^\d+$/.test(direct)) return Number(direct);
  const semantic = row.getAttribute("aria-label") ?? text(findFirstMatchingSelector(row, selectors.pickNumber));
  const match = semantic.match(/(?:overall|pick)\s*#?\s*(\d+)/i);
  return match?.[1] ? Number(match[1]) : undefined;
}

export function findDraftBoard(): Element | null {
  return findFirstMatchingSelector(document, selectors.draftBoard);
}

export function parseVisiblePicks(board: Element): ObservedPick[] {
  const picks: ObservedPick[] = [];
  for (const row of findAllMatchingSelectors(board, selectors.pickRow)) {
    const overall = pickNumber(row);
    const playerName = row.getAttribute("data-player-name")
      ?? text(findFirstMatchingSelector(row, selectors.playerName));
    const fantasyTeamName = row.getAttribute("data-team-name")
      ?? text(findFirstMatchingSelector(row, selectors.teamName));
    if (overall && playerName && fantasyTeamName) picks.push({ overall, playerName, fantasyTeamName });
  }
  return picks;
}

export function leagueIdFromLocation(location: Location): string | undefined {
  const query = new URLSearchParams(location.search).get("leagueId");
  if (query && /^\d+$/.test(query)) return query;
  return location.href.match(/(?:leagueId[=/]|\/leagues\/)(\d+)/i)?.[1];
}
