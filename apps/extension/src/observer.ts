import { findDraftBoard, parseVisiblePicks } from "./parser.js";

export function observeDraftBoard(onPicks: (picks: ReturnType<typeof parseVisiblePicks>) => void): MutationObserver | undefined {
  if (!document.body) return undefined;
  let timer: number | undefined;
  let boardObserver: MutationObserver | undefined;
  let activeBoard: Element | undefined;
  const scan = () => {
    const board = activeBoard ?? findDraftBoard() ?? undefined;
    if (!board) return;
    if (board !== activeBoard) {
      activeBoard = board;
      boardObserver?.disconnect();
      boardObserver = new MutationObserver(scheduleScan);
      boardObserver.observe(board, { childList: true, subtree: true });
    }
    onPicks(parseVisiblePicks(board));
  };
  const scheduleScan = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(scan, 200);
  };
  const observer = new MutationObserver(() => {
    if (!activeBoard) scheduleScan();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
  return observer;
}
