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
  const values = await chrome.storage.session.get(["warRoomStatus", "browserIngestSecret"]);
  const status = (values.warRoomStatus ?? {}) as WarRoomStatus;
  (document.querySelector("#page") as HTMLElement).textContent = mark(status.draftPageDetected);
  (document.querySelector("#server") as HTMLElement).textContent = mark(status.serverConnected);
  (document.querySelector("#observer") as HTMLElement).textContent = mark(status.observerActive);
  (document.querySelector("#last-event") as HTMLElement).textContent = status.lastEvent ?? status.error ?? "No pick observed yet";
  (document.querySelector("#secret") as HTMLInputElement).value =
    typeof values.browserIngestSecret === "string" ? values.browserIngestSecret : "";
}

document.querySelector("form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const secret = (document.querySelector("#secret") as HTMLInputElement).value.trim();
  void chrome.storage.session.set({ browserIngestSecret: secret }).then(render);
});

void render();
