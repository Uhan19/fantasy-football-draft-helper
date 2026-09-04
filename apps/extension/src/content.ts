import { observeDraftBoard } from "./observer.js";
import { findDraftBoard, leagueIdFromLocation, parseVisiblePicks, type ObservedPick } from "./parser.js";
import { sendPicks } from "./transport.js";

const leagueId = leagueIdFromLocation(window.location);
const seen = new Set<string>();

interface WarRoomStatus {
  draftPageDetected: boolean;
  serverConnected: boolean;
  observerActive: boolean;
  lastEvent?: string;
  error?: string;
}

async function updateStatus(status: WarRoomStatus): Promise<void> {
  await chrome.runtime.sendMessage({ type: "UPDATE_WAR_ROOM_STATUS", status });
}

function pickKey(pick: ObservedPick): string {
  return `${pick.overall}:${pick.playerName}:${pick.fantasyTeamName}`;
}

void updateStatus({
  draftPageDetected: Boolean(leagueId),
  serverConnected: false,
  observerActive: false
});

if (leagueId) {
  const ingest = async (visiblePicks: ObservedPick[], testConnection = false): Promise<void> => {
    const picks = visiblePicks.filter((pick) => !seen.has(pickKey(pick)));
    if (picks.length === 0 && !testConnection) return;
    try {
      await sendPicks({ leagueId, observedAt: new Date().toISOString(), picks });
      for (const pick of picks) seen.add(pickKey(pick));
      await updateStatus({
        draftPageDetected: true,
        serverConnected: true,
        observerActive: true,
        lastEvent: picks.length > 0
          ? `Pick ${picks.at(-1)?.overall} — ${picks.at(-1)?.playerName}`
          : "Connected — waiting for a pick"
      });
    } catch (error) {
      await updateStatus({
        draftPageDetected: true,
        serverConnected: false,
        observerActive: true,
        error: error instanceof Error ? error.message : "Local server unavailable"
      });
      throw error;
    }
  };

  const observer = observeDraftBoard((visiblePicks) => {
    void ingest(visiblePicks).catch(() => undefined);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "RETRY_INGEST") return false;
    const board = findDraftBoard();
    const visiblePicks = board ? parseVisiblePicks(board) : [];
    void ingest(visiblePicks, true)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Local server unavailable"
      }));
    return true;
  });

  void updateStatus({
    draftPageDetected: true,
    serverConnected: false,
    observerActive: Boolean(observer)
  });
}
