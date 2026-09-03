import { describe, expect, it } from "vitest";
import { EspnAuthenticationError, EspnClient } from "../src/espn/client.js";

function clientWith(response: Response): EspnClient {
  return new EspnClient({
    leagueId: "12345678",
    season: 2026,
    fetchImpl: async () => response
  });
}

describe("ESPN client diagnostics", () => {
  it("uses ESPN's current read host", async () => {
    let requestedUrl = "";
    const client = new EspnClient({
      leagueId: "12345678",
      season: 2026,
      fetchImpl: async (input) => {
        requestedUrl = String(input);
        return Response.json({ settings: {} });
      }
    });
    await client.getSettings();
    const url = new URL(requestedUrl);
    expect(url.hostname).toBe("lm-api-reads.fantasy.espn.com");
    expect(url.searchParams.get("view")).toBe("mSettings");
  });

  it("names the view when ESPN returns HTML", async () => {
    const client = clientWith(
      new Response("<html>login</html>", {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      })
    );
    await expect(client.getDraftDetail()).rejects.toThrow(
      /view mDraftDetail returned text\/html; charset=utf-8 instead of JSON without a redirect/
    );
  });

  it("classifies authorization failures", async () => {
    const client = clientWith(new Response("Forbidden", { status: 403 }));
    await expect(client.getSettings()).rejects.toBeInstanceOf(EspnAuthenticationError);
  });
});
