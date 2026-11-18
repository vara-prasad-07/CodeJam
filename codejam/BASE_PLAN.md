# Base implementation and review

## Scope

1. Connect and Git metadata based on `screen_main.png`.
2. Working chat, replies, code references, team membership and room switching based on `screen-1.png`.
3. Dark blue/green design from the provided palette.
4. **Nexconn Chat SDK** for live message send/receive and cloud history; Nexconn Server API for tokens, group creation and joining. Credentials are loaded from `server/.env`. No local messaging fallback.
5. App Secret stays on the backend. A single SDK client is shared between sidebar/full view; membership and invitations are checked before adding Nexconn group members.
6. JSON stores development identity/room metadata only. Supabase Auth/metadata, Gemini, calls, decisions and screen-2 remain in the original `../plan.md` roadmap.

## Review

- Start `npm run server`, compile, F5 and open a real Git checkout in the Extension Development Host.
- Confirm Git metadata and the NEXCONN LIVE status.
- Create a room, send text and code, reply, and open a shared file.
- Use a second VS Code profile to join by invitation and send in both directions.
- Reload the client and verify Nexconn cloud history returns.
- Open sidebar/full view together; their conversations should agree.
- Stop the backend or disconnect the network and verify errors/drafts are handled without a local success fallback.
- Review this base before screen-2.

## Verified

- Type checks, lint and production bundle pass.
- Eleven automated backend/SDK/Git/DOM tests pass.
- Live credentials issued tokens and connected two real Nexconn SDK clients.
- Live group creation/join, message send/receive, code metadata, replies, cloud history and fresh-client history restoration passed; temporary test group was cleaned up.
- Actual VS Code visual QA remains unverified because native/browser UI access was unavailable.
