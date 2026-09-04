import { findDraftBoard, parseVisiblePicks } from "./parser.js";

export function observeDraftBoard(onPicks: (picks: ReturnType<typeof parseVisiblePicks>) => void): MutationObserver | undefined {
  if (!document.body) return undefined;
  let timer: number | undefined;
  const scan = () => {
    const board = findDraftBoard() ?? undefined;
    if (!board) return;
    onPicks(parseVisiblePicks(board));
  };
  const scheduleScan = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(scan, 200);
  };
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
  return observer;
}
