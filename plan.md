# CodeJam MVP Plan

## Goal and scope

Build a VS Code extension where two developers can share a blocker with code context, discuss it, review an AI handoff, and save the decision.

- **Projects:** sign in, create/join a private room by invitation, link a local Git repository, and restore the room when reopened.
- **Chat:** real Nexconn messages, replies, teammate mentions, and resolve a discussion.
- **Code sharing:** attach the selected excerpt, repository identity, relative path, line range, branch, and commit. Open the matching file; show the saved excerpt and revision if the checkout differs.
- **Decisions:** pin a message with a title and optional code reference; list saved pins.
- **AI:** `@agent` explains code, drafts an update, or prepares a debugging handoff using only selected code, diff, and messages. Preview context, then review/edit the private draft before sending.
- **Audio:** start/join a Nexconn call; use a browser call page if VS Code webview support fails.

Defer automatic code patches, repository-wide AI indexing, screen sharing, and collaborative code editing.

## Tech stack

| Part | Choice |
| --- | --- |
| Extension | TypeScript + VS Code API; local Git for revision context |
| Sidebar and draft panel | React + Vite webview |
| Chat and audio | Nexconn Chat SDK + Call SDK, subject to compatibility checks |
| Backend | Node.js + TypeScript + Express |
| Accounts and metadata | Supabase Auth (email/password) + PostgreSQL |
| AI | Gemini API; configure an available model through `.env` |
| Delivery | GitHub repository, installable `.vsix`, hosted backend and browser call page |

## Architecture

```text
VS Code extension host <-- validated messages --> React webview
  local Git/files + session storage                 |       |
                                                   |       +--> Nexconn chat/calls
                                                   v
                                             Express API
                                               |      |
                                               v      v
                                           Supabase  Gemini
```

- Extension host collects user-approved context, opens references within the linked repository, and stores sessions in VS Code SecretStorage.
- Backend verifies the signed-in user and project membership before room operations, Nexconn token issuance, pins, or AI requests. Enforce membership in the Nexconn room too.
- Supabase stores `projects`, `memberships`, expiring `invitations`, `pins`, and `discussions`; use Supabase Auth user IDs. Each project has a stable UUID, repository identity, and Nexconn room ID.
- Nexconn owns message history. Pins/discussions reference its message IDs; code attachments retain the excerpt and revision metadata.
- Send only previewed context to Gemini; exclude secrets and `.env` contents. AI output stays private until the author sends it.
- Validate webview messages, restrict its content security policy, and never expose server secrets to the webview.

## Build order

1. **Prove integrations:** connect two users and exchange real Nexconn messages inside VS Code. Test webview security requirements, code attachments/replies, and audio/microphone support. Decide the call surface here.
2. **Build the core loop:** create the sidebar, sign-in, invitations, repository linking, chat, code sharing, and revision-mismatch fallback.
3. **Persist collaboration:** save membership, room links, pins, and discussion status; restore them after restarting VS Code.
4. **Add AI drafts:** context selection/preview, backend generation, editable draft, and explicit send. Show missing-context and API failure states.
5. **Finish delivery:** wire calls, reconnect/retry states, verify unauthorized access is denied, package the extension, and record the demo.

## Required credentials and `.env`

Create a Nexconn application with chat/calls enabled, a Supabase project with email/password Auth, and a Gemini API key. Create two test accounts. These variable names are our application configuration contract.

**Backend: `apps/api/.env`**

```dotenv
PORT=3000
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
NEXCONN_APP_KEY=YOUR_APP_KEY
NEXCONN_APP_SECRET=YOUR_APP_SECRET
GEMINI_API_KEY=YOUR_GEMINI_KEY
GEMINI_MODEL=YOUR_AVAILABLE_MODEL_ID
```

**Extension development: `apps/extension/.env`**

```dotenv
CODEJAM_API_URL=http://localhost:3000
CODEJAM_CALL_URL=http://localhost:3000/call
```

The extension build must explicitly load these values; packaged builds use VS Code settings for service URLs. The backend supplies public Supabase/Nexconn configuration and per-user Nexconn tokens at runtime. User tokens are generated after login, never placed in `.env`.

Get Nexconn keys from its Console, Supabase URL/keys from project settings, and the Gemini key from Google AI Studio. Verify any additional Call SDK configuration during step 1. No GitHub API token or OAuth credentials are needed for this MVP; Git runs locally.

Commit placeholder-only `.env.example` files and ignore real `.env` files. Backend secret-key access requires explicit membership checks on every project operation.

## Final outcomes / acceptance checks

- Two accounts in separate VS Code instances exchange real messages and open shared code, including a useful revision-mismatch fallback.
- AI uses exactly the previewed context; a draft is posted only after author review.
- Rooms, membership, decisions, and discussion status survive restart; non-members cannot access them.
- Audio connects on the chosen surface; chat, AI, and call failures offer a clear retry action.
- Deliver a `.vsix`, runnable backend, database migrations, setup README, `.env.example` files, public submission repository, and a three-minute demo: **share bug -> open code -> review AI handoff -> discuss/call -> pin decision -> reopen project**.

## References

Scope: local `CodeJam_Project_Brief (1).pdf`, all five pages. Credential setup: [Nexconn](https://docs.nexconn.ai/guides/glossary/chat-glossary), [Supabase](https://supabase.com/docs/guides/getting-started/api-keys), [Gemini](https://ai.google.dev/gemini-api/docs/api-key).
