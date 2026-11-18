# CodeJam — Nexconn rooms and chat

CodeJam is a VS Code extension based on `screen_main.png` and `screen-1.png`. It detects local Git context, creates a real Nexconn group for each room, and uses **`@nexconn/chat` 26.2.1** to send/receive messages and load cloud history. Discussion detail (`screen-2.png`) remains deferred.

## Run

1. Open this **`codejam` folder** in VS Code and run `npm install`.
2. Configure **`codejam/server/.env`** with the Nexconn keys. Your existing `.env` is the file the server reads; keep your configured values.

```dotenv
NEXCONN_APP_KEY=your_app_key
NEXCONN_APP_SECRET=your_app_secret
# Optional; defaults to Singapore. Must match your Nexconn application.
NEXCONN_REGION=SG
PORT=3000
```

3. Run `npm run server` in a terminal inside `codejam`. Keep it running.
4. Run `npm run compile`, then press **F5 → Run Extension**.
5. In the Extension Development Host, open the **project folder you want to collaborate on**. Click the CodeJam activity icon or run **CodeJam: Open Full View**.
6. In **Connect**, enter a room name, click **Create Room**, then **Open project chat**. The header displays **NEXCONN LIVE** only when the SDK is connected.

VS Code User Settings default to:

```json
{
  "codejam.apiUrl": "http://127.0.0.1:3000",
  "codejam.displayName": "Developer"
}
```

If you previously explicitly set `codejam.apiUrl` to an empty string, change it to the backend URL. Set your display name before first connection. Use a second VS Code profile/user-data directory and another display name for a second participant. Windows sharing a profile share an identity.

## What uses Nexconn

- **User tokens:** the backend signs Nexconn's `/v4/auth/access-token/issue` request with the App Secret. The extension gets a per-user token and the public App Key; the App Secret stays in the backend process.
- **Rooms:** Create Room calls Nexconn's group creation API. Joining through an invitation adds the user to that Nexconn group through the backend. Direct SDK group joins are disabled; invitations are validated by CodeJam first.
- **Messages:** the bundled Chat SDK runs in a VS Code webview and uses `NCEngine.initialize`, `NCEngine.connect`, `GroupChannel.sendMessage`, and `MessageHandler.onMessageReceived`. The sidebar and full view share one SDK connection in the extension host bridge.
- **History:** `BaseChannel.createMessagesQuery` loads Nexconn cloud history, 50 messages at a time. Use **Load earlier messages** to paginate. Live messages arrive through the SDK; they are not polled from the backend.
- **Code/replies:** Nexconn text-message `extra` carries a versioned CodeJam payload with code excerpt, path, lines, branch, commit, reply target and client request ID. Message author is derived from the sender's user ID and room membership.

There is **no local chat fallback**. Invalid credentials, SDK/network failures and history errors produce a visible error. A send is successful only after Nexconn acknowledges it. Failed sends retain the draft. Acknowledged retries in the same SDK lifetime are deduplicated; delivery with an uncertain acknowledgement across a full client restart is not an exactly-once guarantee.

The backend stores **room/member/invitation metadata and hashed development session credentials**, not chat history or Nexconn user tokens, in ignored `server/.data/nexconn-rooms.json`. Old local-preview rooms are not converted to Nexconn groups; their earlier storage is left untouched. Create a new Nexconn room.

## Nexconn Console

Use keys from the **same Nexconn application and environment**. Enable Chat/group channels and cloud message history. The configured keys have been verified against the Singapore API (`NEXCONN_REGION=SG`). Other supported configured regions are `NA` and `SA`; both backend and SDK use the selected region.

Official references: [initialize](https://docs.nexconn.ai/chatsdk-web/init), [connect](https://docs.nexconn.ai/chatsdk-web/connection/connect), [signed API requests](https://docs.nexconn.ai/platform-chat-api/prepare-to-use-api/auth), [user token issuance](https://docs.nexconn.ai/platform-chat-api/user/register), [group creation](https://docs.nexconn.ai/platform-chat-api/group-channel/managing-channels/create-group).

`server/.env.example` is the current backend configuration template. `server/.env.hosted.example` documents future Supabase/Gemini settings; those services are not connected yet and that file is not loaded. **No Supabase or Gemini key is required for the current Nexconn chat integration.** Both remain in the original roadmap for hosted account authentication/metadata and AI.

## Invite and chat

Create a room, copy its invitation code from Connect or Team, then choose **Connect → Join with invite** in the second profile. Both profiles must use the same CodeJam backend URL and Nexconn application. The included backend listens on **127.0.0.1** for development on one machine. Remote teammates need a hosted HTTPS backend; Supabase sign-in and production account controls are still pending.

- Send with **Send** or **Ctrl / Cmd + Enter**; Enter inserts a newline.
- Select code in an editor and click the `{}` attachment icon. Review it, then send. Secret/environment files and files outside the linked repository are rejected.
- **Open in editor** opens the repository-relative reference. Chat retains the saved excerpt when your checkout differs.
- **Reply** quotes a message in the room conversation. Dedicated threads belong to the later screen-2 phase.
- Use **Rooms** to switch rooms and **Team** for actual membership and invitations. Member metadata refreshes every 10 seconds; messages arrive in real time.
- **Reconnect** obtains a fresh user token when the SDK is disconnected. If server data was reset or you need a new display name, retain your invitation code and run **CodeJam: Reset Server Session**, then rejoin.

The development session is an unverified display-name identity, not Supabase sign-in. Session credentials are held in VS Code SecretStorage. Do not expose the development API as a production account system.

## Repository detection

Git is read locally: repository root, branch, HEAD, latest commit subject/author/date and working-tree status. Nested packages, detached HEAD and empty repositories are supported. Choose among workspace folders with the top repository selector. Metadata refreshes every 10 seconds; **Refresh/Reconnect** also refreshes it. Git must be on PATH; no GitHub API token is needed.

## Verification

Use Node.js 22.16+ for the server and tests.

```powershell
npm test
npm run package
# Opt-in live Nexconn integration check using server/.env:
npm run test:nexconn
```

The eleven automated tests cover API signing, secret isolation, provider failures without fallback, group/membership routing, metadata persistence, SDK send/receive/history, acknowledged retry behavior, Git states, create/chat/join UI wiring, retained drafts, and escaped content. The live check connects two real SDK clients, creates/joins a group, sends and receives code context and replies, queries cloud history, then recreates a client to restore history. It removes its temporary group; its two test identities remain registered in the Nexconn app.

The SDK network test runs in a DOM harness. Actual VS Code visual QA remains separate; browser/native UI access was unavailable in this environment. AI, calls, decisions, reactions, rich Markdown and screen-2 remain deferred.
