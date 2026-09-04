interface WarRoomStatus {
  draftPageDetected?: boolean;
  serverConnected?: boolean;
  observerActive?: boolean;
  lastEvent?: string;
  error?: string;
}

function mark(value?: boolean): string {
  return value ? "✓" : "○";
}

async function render(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const key = `warRoomStatus:${tab?.id ?? "unknown"}`;
  const values = await chrome.storage.session.get(key);
  const status = (values[key] ?? {}) as WarRoomStatus;
  (document.querySelector("#page") as HTMLElement).textContent = mark(status.draftPageDetected);
  (document.querySelector("#server") as HTMLElement).textContent = mark(status.serverConnected);
  (document.querySelector("#observer") as HTMLElement).textContent = mark(status.observerActive);
  (document.querySelector("#last-event") as HTMLElement).textContent = status.error ?? status.lastEvent ?? "No pick observed yet";
}

document.querySelector("form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    const secret = (document.querySelector("#secret") as HTMLInputElement).value.trim();
    const button = document.querySelector("button") as HTMLButtonElement;
    const saveStatus = document.querySelector("#save-status") as HTMLElement;
    button.disabled = true;
    saveStatus.textContent = "Saving…";
    saveStatus.dataset.state = "pending";

    try {
      await chrome.storage.session.set({ browserIngestSecret: secret });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("Open the ESPN draft tab and try again");
      const response = await chrome.tabs.sendMessage(tab.id, { type: "RETRY_INGEST" });
      if (!response?.ok) throw new Error(response?.error ?? "Could not reach the local draft server");
      saveStatus.textContent = `Saved and connected — ${response.detectedPicks ?? 0} visible picks, ${response.acceptedPicks ?? 0} accepted`;
      saveStatus.dataset.state = "success";
    } catch (error) {
      saveStatus.textContent = `Secret saved. ${error instanceof Error ? error.message : "Connection check failed"}`;
      saveStatus.dataset.state = "error";
    } finally {
      button.disabled = false;
      await render();
    }
  })();
});

void render();
chrome.storage.onChanged.addListener(() => { void render(); });
