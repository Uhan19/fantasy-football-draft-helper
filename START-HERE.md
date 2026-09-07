# Start here — War Room for Mac

War Room shows your ESPN fantasy draft in a local dashboard. It reads the board and your roster; you still make every pick in ESPN.

## First time

1. **Download and unzip the project.** Keep the entire folder together. You do not need Git.
2. **Double-click `Start War Room.command`.** It opens Terminal and a setup page in your browser. If Node.js is missing, the launcher opens the [Node.js download page](https://nodejs.org/en/download). Install the LTS version (22 or newer), then double-click the launcher again.
3. **Click “Install required files.”** This downloads the project’s dependencies once. It does not install a global package manager.
4. **Paste your own ESPN draft-room link.** The setup page finds your league, season, and team. Private leagues also need the two ESPN cookies described in the expandable help on that page.
5. **Click “Save settings,” then “Start War Room.”** Open the dashboard when the server is running. ESPN may take a few seconds to respond.

Keep the launcher's Terminal window open during the draft. Closing the browser tab does not stop War Room. Use “Stop programs started here,” or press Control-C in that Terminal window, to stop the programs this launcher started.

If macOS blocks the downloaded launcher, review the download source and use Apple's normal approval flow for opening software you trust. The project does not disable macOS security checks. A native signed Mac installer is not included yet.

## Next time

Double-click **Start War Room.command**, then click **Start War Room**. Your settings are remembered. Empty password fields mean “keep the saved value”; you do not need to paste the same key again.

To join a new mock draft, use **Connect a draft** in the dashboard. It checks the new league before switching and saves your choice.

## Add an assistant (optional)

You can use the dashboard without an assistant, tunnel, or OpenAI key.

To let your connected assistant read the draft:

1. Expand **Connect your assistant** on the setup page. Follow its links to create or select a tunnel and get an OpenAI runtime API key in the same organization. Your account needs **Tunnels Read + Use**.
2. Download the Mac tunnel client from [OpenAI tunnel settings](https://platform.openai.com/settings/organization/tunnels). Unpack the download and put the `tunnel-client` executable in the project's **tools** folder. Existing installations on your PATH also work.
3. Save the tunnel ID and runtime key in the setup page. Existing `.env` values named `CONTROL_PLANE_TUNNEL_ID` and `CONTROL_PLANE_API_KEY` are loaded automatically.
4. Start War Room, then click **Start assistant connection**.
5. Add/select the tunnel-backed app in your assistant using [OpenAI's connection instructions](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels). Ask it to read your draft. **Tool request received** shows that an MCP client reached the local server; it does not identify which client made the request.

A tunnel process starting does not prove the full connection works. A successful draft read is the final check. Tunnel account setup and the Mac binary download are still manual; the launcher does not create accounts or issue keys.

## If something needs attention

| What you see | What to do |
| --- | --- |
| Node.js is missing | Install Node.js LTS, version 22 or newer, and reopen the launcher. |
| Required files could not install | Check your internet connection and that you can write to the project folder, then try again. |
| ESPN needs attention | Check the league link and season. For a private league, confirm both ESPN cookies are current. More details appear in the draft dashboard's Connections page. |
| A server is running in another Terminal | Open its dashboard, or stop it in its original Terminal before changing settings through this setup page. The launcher does not stop unrelated processes. |
| API key is already saved | Leave its password field blank. No `export` command or Terminal paste is needed. |
| Assistant connection stops | Check the key, tunnel ID, Tunnels permissions, and whether another tunnel is already using its default port. The dashboard remains usable. |
| The setup page is offline | Reopen Start War Room.command. If port 8786 belongs to another program, close that program before reopening setup. |

Settings are stored locally in `.env`, which is ignored by Git. Treat that file as private. Share a clean repository download, not a copy of your working folder with `.env` and `data` included. Saving through setup preserves existing variable values but rewrites `.env` comments and formatting.

For developer commands, extension fallback setup, custom tunnel profiles, and architecture, see [README.md](README.md). The simplified assistant launcher uses the saved tunnel ID and runtime key directly; advanced enterprise proxy/mTLS profiles should continue using `tunnel-client run --profile …`.
