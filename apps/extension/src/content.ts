import { observeDraftBoard } from "./observer.js";
import { leagueIdFromLocation } from "./parser.js";
import { sendPicks } from "./transport.js";

const leagueId = leagueIdFromLocation(window.location);
const seen = new Set<string>();

void chrome.storage.session.set({
  warRoomStatus: {
    draftPageDetected: Boolean(leagueId),
    serverConnected: false,
    observerActive: false
  }
});

if (leagueId) {
  const observer = observeDraftBoard((visiblePicks) => {
    const picks = visiblePicks.filter((pick) => {
      const key = `${pick.overall}:${pick.playerName}:${pick.fantasyTeamName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (picks.length === 0) return;
    void sendPicks({ leagueId, observedAt: new Date().toISOString(), picks })
      .then(() => chrome.storage.session.set({
        warRoomStatus: {
          draftPageDetected: true,
          serverConnected: true,
          observerActive: true,
          lastEvent: `Pick ${picks.at(-1)?.overall} — ${picks.at(-1)?.playerName}`
        }
      }))
      .catch((error) => chrome.storage.session.set({
        warRoomStatus: {
          draftPageDetected: true,
          serverConnected: false,
          observerActive: true,
          error: error instanceof Error ? error.message : "Local server unavailable"
        }
      }));
  });
  void chrome.storage.session.set({
    warRoomStatus: {
      draftPageDetected: true,
      serverConnected: false,
      observerActive: Boolean(observer)
    }
  });
}
