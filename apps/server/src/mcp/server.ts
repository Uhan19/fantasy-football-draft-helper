import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DraftStateStore } from "../draft/state.js";
import { getDraftState, getDraftStateInput } from "./tools/get-draft-state.js";

export function createWarRoomMcpServer(source: DraftStateStore | (() => DraftStateStore | undefined), onToolCall?: () => void): McpServer {
  const server = new McpServer({ name: "espn-fantasy-draft-war-room", version: "1.0.0" });
  server.registerTool(
    "get_draft_state",
    {
      title: "Get live ESPN fantasy draft state",
      description:
        "Return the current normalized ESPN fantasy football draft state including recent picks, the user's roster, other team rosters, upcoming user selections, and top available players. Use this whenever draft advice depends on the live board.",
      inputSchema: getDraftStateInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (input) => {
      const store = typeof source === "function" ? source() : source;
      if (!store) throw new Error("Choose a league on the local dashboard before requesting draft state");
      const result = getDraftState(store, input);
      onToolCall?.();
      return {
        content: [{ type: "text", text: JSON.stringify(result) }]
      };
    }
  );
  return server;
}
