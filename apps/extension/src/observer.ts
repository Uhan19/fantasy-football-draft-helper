import { findDraftBoard, parseVisiblePicks } from "./parser.js";

export function observeDraftBoard(onPicks: (picks: ReturnType<typeof parseVisiblePicks>) => void): MutationObserver | undefined {
  if (!document.body) return undefined;
  let timer: number | undefined;
  const scan = () => {
    const board = findDraftBoard() ?? undefined;
    onPicks(board ? parseVisiblePicks(board) : []);
  };
  const scheduleScan = () => {
    if (timer !== undefined) return;
    timer = window.setTimeout(() => { timer = undefined; scan(); }, 200);
  };
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  const interval = window.setInterval(scan, 5000);
  window.addEventListener("pagehide", () => {
    observer.disconnect(); window.clearInterval(interval); window.clearTimeout(timer);
  }, { once: true });
  scan();
  return observer;
}
