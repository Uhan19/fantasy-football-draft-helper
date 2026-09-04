const endpoint = "http://127.0.0.1:8787/internal/browser/picks";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "UPDATE_WAR_ROOM_STATUS") {
    void chrome.storage.session
      .set({ warRoomStatus: message.status })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false, error: "Could not update extension status" }));
    return true;
  }

  if (message?.type !== "INGEST_PICKS") return false;
  void (async () => {
    const { browserIngestSecret } = await chrome.storage.session.get("browserIngestSecret");
    if (typeof browserIngestSecret !== "string" || !browserIngestSecret) {
      sendResponse({ ok: false, error: "Set the local ingest secret in the extension popup" });
      return;
    }
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Draft-Secret": browserIngestSecret
        },
        body: JSON.stringify(message.payload)
      });
      sendResponse(response.ok
        ? { ok: true }
        : { ok: false, error: `Local server returned HTTP ${response.status}` });
    } catch {
      sendResponse({ ok: false, error: "Could not reach the local draft server" });
    }
  })();
  return true;
});
