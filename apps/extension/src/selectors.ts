export interface EspnDomSelectors {
  draftBoard: string[];
  pickRow: string[];
  playerName: string[];
  teamName: string[];
  pickNumber: string[];
}

export const selectors: EspnDomSelectors = {
  draftBoard: [
    '[data-testid*="draft-board" i]',
    '[aria-label*="draft board" i]',
    '[data-testid*="draft-history" i]',
    '[aria-label*="draft history" i]',
    '[class*="draftBoard"]',
    '[class*="draft-board"]'
  ],
  pickRow: [
    "[data-pick-number]",
    '[data-testid*="pick-row" i]',
    '[aria-label^="Pick " i]',
    '[class*="pickRow"]'
  ],
  playerName: [
    "[data-player-name]",
    '[data-testid*="player-name" i]',
    '[aria-label*="player" i]',
    '[class*="playerName"]'
  ],
  teamName: [
    "[data-team-name]",
    '[data-testid*="team-name" i]',
    '[aria-label*="team" i]',
    '[class*="teamName"]'
  ],
  pickNumber: ["[data-pick-number]", '[data-testid*="pick-number" i]', '[class*="pickNumber"]']
};

export function findFirstMatchingSelector(root: ParentNode, candidates: string[]): Element | null {
  for (const candidate of candidates) {
    const match = root.querySelector(candidate);
    if (match) return match;
  }
  return null;
}

export function findAllMatchingSelectors(root: ParentNode, candidates: string[]): Element[] {
  for (const candidate of candidates) {
    const matches = [...root.querySelectorAll(candidate)];
    if (matches.length > 0) return matches;
  }
  return [];
}
