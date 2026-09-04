import {
  findAllMatchingSelectors,
  findFirstMatchingSelector,
  selectors
} from "./selectors.js";

export interface ObservedPick {
  overall?: number;
  round?: number;
  pickInRound?: number;
  playerName: string;
  fantasyTeamName: string;
}

interface PickHistoryEntry {
  playerName: string;
  fantasyTeamName: string;
  round: number;
  pickInRound: number;
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

export function parsePickHistoryText(value: string): PickHistoryEntry | undefined {
  const normalized = value.replace(/\s+/g, " ").trim();
  const match = normalized.match(
    /^(.+?)\s*\/\s*[A-Z]{2,4}\s*(?:QB|RB|WR|TE|K|D\/ST)(?:\s+CB)?\s*R(\d+),\s*P(\d+)\s*[-–—]\s*(.+)$/i
  );
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) return undefined;
  if (Number(match[2]) < 1 || Number(match[3]) < 1 || /R\d+,\s*P\d+/i.test(match[4])) return undefined;
  return {
    playerName: match[1].trim(),
    round: Number(match[2]),
    pickInRound: Number(match[3]),
    fantasyTeamName: match[4].trim()
  };
}

function pickText(element: Element): string {
  // Labels can contain separators absent from nested textContent.
  const label = element.getAttribute("aria-label");
  if (label && label.length < 400 && parsePickHistoryText(label)) return label;
  const raw = text(element);
  if (raw.length > 400 || !/R\d+,\s*P\d+/i.test(raw)) return "";
  if (parsePickHistoryText(raw)) return raw;
  const rendered = (element as HTMLElement).innerText;
  return rendered && parsePickHistoryText(rendered) ? rendered : "";
}

function semanticPickElements(root: ParentNode): Element[] {
  const candidates = [...root.querySelectorAll("*:not(script):not(style)")].filter((element) =>
    Boolean(pickText(element))
  );
  return candidates.filter((element) =>
    ![...element.children].some((child) => Boolean(pickText(child)))
  );
}

export function parsePickHistoryEntries(entries: readonly string[]): ObservedPick[] {
  const parsed = entries
    .map(parsePickHistoryText)
    .filter((entry): entry is PickHistoryEntry => Boolean(entry));
  if (parsed.length === 0) return [];

  const seenLocations = new Set<string>();
  const picks: ObservedPick[] = [];
  for (const entry of parsed) {
    const location = `${entry.round}:${entry.pickInRound}`;
    if (seenLocations.has(location)) continue;
    seenLocations.add(location);
    picks.push({
      round: entry.round,
      pickInRound: entry.pickInRound,
      playerName: entry.playerName,
      fantasyTeamName: entry.fantasyTeamName
    });
  }
  return picks;
}

export function findDraftBoard(): Element | null {
  const semanticRows = semanticPickElements(document);
  if (semanticRows.length > 0) {
    let container = semanticRows[0]?.parentElement ?? document.body;
    while (container.parentElement && !semanticRows.every((row) => container.contains(row))) {
      container = container.parentElement;
    }
    return container;
  }
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
  if (picks.length > 0) return picks;
  return parsePickHistoryEntries(semanticPickElements(board).map(pickText));
}

export function leagueIdFromLocation(location: Location): string | undefined {
  const query = new URLSearchParams(location.search).get("leagueId");
  if (query && /^\d+$/.test(query)) return query;
  return location.href.match(/(?:leagueId[=/]|\/leagues\/)(\d+)/i)?.[1];
}
