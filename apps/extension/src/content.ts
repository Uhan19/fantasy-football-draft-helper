import { observeDraftBoard } from "./observer.js";
import { findDraftBoard, leagueIdFromLocation, parseVisiblePicks, type ObservedPick } from "./parser.js";
import { sendPicks } from "./transport.js";

const leagueId = /\/football\/draft\/?$/.test(window.location.pathname)
  ? leagueIdFromLocation(window.location) : undefined;
const seen = new Set<string>();
let lastSentAt = 0;
let retryAfter = 0;
let inFlight: Promise<void> | undefined;

interface WarRoomStatus {
  draftPageDetected: boolean;
  serverConnected: boolean;
  observerActive: boolean;
  detectedPicks?: number;
  acceptedPicks?: number;
  lastEvent?: string;
  error?: string;
}

async function updateStatus(status: WarRoomStatus): Promise<void> {
  await chrome.runtime.sendMessage({ type: "UPDATE_WAR_ROOM_STATUS", status }).catch(() => undefined);
}

function pickKey(pick: ObservedPick): string {
  return `${pick.overall ?? `${pick.round}:${pick.pickInRound}`}:${pick.playerName}:${pick.fantasyTeamName}`;
}

void updateStatus({
  draftPageDetected: Boolean(leagueId),
  serverConnected: false,
  observerActive: false
});

if (leagueId) {
  const ingest = async (visiblePicks: ObservedPick[], testConnection = false): Promise<void> => {
    if (inFlight) {
      await inFlight.catch(() => undefined);
      if (!testConnection) return;
    }
    if (!testConnection && Date.now() < retryAfter) return;
    const picks = visiblePicks.filter((pick) => !seen.has(pickKey(pick)));
    if (picks.length === 0 && !testConnection && Date.now() - lastSentAt < 10_000) return;
    inFlight = (async () => {
      try {
        const result = await sendPicks({ leagueId, observedAt: new Date().toISOString(), picks,
          diagnostics: { detectedPicks: visiblePicks.length, observerActive: true } });
        lastSentAt = Date.now();
        retryAfter = result.unresolved.length ? Date.now() + 5000 : 0;
        for (const index of result.acceptedIndices) {
          const pick = picks[index];
          if (pick) seen.add(pickKey(pick));
        }
        await updateStatus({
          draftPageDetected: true,
          serverConnected: true,
          observerActive: true,
          detectedPicks: visiblePicks.length,
          acceptedPicks: seen.size,
          lastEvent: result.unresolved.length
            ? `${result.unresolved.length} picks need attention: ${result.unresolved[0]?.reason}`
            : `${visiblePicks.length} visible · ${seen.size} accepted this session`
        });
      } catch (error) {
        retryAfter = Date.now() + 5000;
        await updateStatus({
          draftPageDetected: true,
          serverConnected: false,
          observerActive: true,
          error: error instanceof Error ? error.message : "Local server unavailable"
        });
        throw error;
      }
    })();
    try { await inFlight; } finally { inFlight = undefined; }
  };

  observeDraftBoard((visiblePicks) => {
    void ingest(visiblePicks).catch(() => undefined);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "RETRY_INGEST") return false;
    const board = findDraftBoard();
    const visiblePicks = board ? parseVisiblePicks(board) : [];
    void ingest(visiblePicks, true)
      .then(() => sendResponse({ ok: true, detectedPicks: visiblePicks.length, acceptedPicks: seen.size }))
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Local server unavailable"
      }));
    return true;
  });
}
