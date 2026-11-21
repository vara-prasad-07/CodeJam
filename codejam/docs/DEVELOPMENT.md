# CodeJam

VS Code collaboration with repository context, Nexconn chat/audio, Firestore discussions and decisions, Firebase sign-in, and reviewed Gemini drafts.

## Share the installed extension

Version 1.0.1 defaults to `https://codejam-vdmp.onrender.com`. A fresh installation needs no API URL setup. Install the VSIX, open the project folder, sign in with your own account, then join using the room invitation. An existing explicit `codejam.apiUrl` setting overrides the bundled default; reset it to use the hosted URL.

For local backend development, set `codejam.apiUrl` to `http://127.0.0.1:3000` in that development window.

## Run next time

From the outer **CodeJam** folder:

```powershell
npm --prefix codejam install
npm --prefix codejam run compile
npm --prefix codejam run server
```

Keep the backend running. In **Run and Debug**, select **CodeJam - Two People** and press **F5**. For only the second independent window:

```powershell
npm --prefix codejam run test:person2
```

In each development window open the project checkout and run **CodeJam: Open Full View**. Sign in with **different Firebase accounts**. Create a room in A, copy its invitation, and join in B. Both windows use the same backend. Changing a display name does not create another account. Inside the inner `codejam` folder omit `--prefix codejam`. Restart the backend after `.env` changes.

## Credentials

The backend reads **server/.env**; keep your existing values private. See [the template](../server/.env.example).

| Setting | Purpose |
| --- | --- |
| `NEXCONN_APP_KEY`, `NEXCONN_APP_SECRET` | Nexconn identities, groups, chat and calls |
| `NEXCONN_REGION` | SG (default), NA or SA; match your application |
| `apiKey`, `authDomain`, `projectId`, `appId` | Firebase web configuration; uppercase `FIREBASE_*` equivalents supported |
| `GEMINI_API_KEY` | Private AI drafts |
| `GEMINI_MODEL` | Optional text model; otherwise discovered automatically |
| `HOST`, `PORT` | Defaults to 127.0.0.1:3000 |

Current Firebase, Nexconn and Gemini credentials passed live integration testing. Database access additionally requires the private service-account credential described below. Enable Email/Password and Google in Firebase Authentication. Add **localhost** to Authentication > Settings > Authorized domains for Google. Enable audio calling for the Nexconn application if needed.

Google opens your browser at `http://localhost:3000/signin`. Complete the popup and return to VS Code. A short-lived one-time request transfers the verified identity. The extension saves its own opaque session in VS Code SecretStorage, never your password. Sessions expire after 30 days.

## Features

- Room setup (header sliders): create/join rooms, expiring invitations and renewal, and account-based room restoration. Click the project name for repository identity, branch, latest commit/author/time and working-tree status.
- Chat: actual Nexconn SDK send/receive, cloud history pagination, replies, mentions (`@First_Last`), selected code and failed-send draft retention. Sidebar/full view share one SDK connection.
- Discussions: dedicated tab with open/resolved filters, persistent threads, independent drafts, replies, resolve/reopen, reactions, path/lines/branch/commit, revision warnings, saved excerpt versus working-copy diff and local file opening. Start a discussion through a message's More actions.
- Decisions: propose a choice from a discussion, review and accept it with a rationale, replace an accepted decision with a linked successor, and attach pull request, issue or commit URLs. Existing pins count as accepted. A replacement uses one conditional Firestore commit for both records. Decisions in a replacement chain retain their history.
- AI: ask general questions with no project context or opt into code, messages and local Git diff. Message actions include the specific source; discussions retain the root snapshot and up to 19 recent replies. General requests omit repository identity. Preview request, generate a private answer/draft, review/edit, then explicitly send under your name. Editing question/context invalidates its snapshot; late responses are matched to the active request and room. Generation never posts automatically.
- Team: recent presence with project-relative editor focus, member roster, actual call state and mini controls.
- Audio: actual Nexconn Call SDK in a separate browser page for microphone access. Separate call identities keep editor chat connected. Start/join, allow microphone and keep the tab open. VS Code mute/leave controls operate your browser session.

Use **Share Selection with Team** in the editor context menu or attach selected code from the composer. Environment/private-key file selection is blocked. Diff context excludes common credential filenames. Review the preview yourself: these checks are not a comprehensive secret scanner. Shared references never execute code or modify files.

## Data and access

Firestore stores accounts, hashed application sessions, rooms/membership, discussions, pins, reactions, presence and call controls/state. Nexconn stores chat history and message payloads. Firestore retains pinned/thread-root snapshots so context survives history pagination. Gemini receives selected context on generation.

Existing Nexconn metadata from `server/.data/nexconn-rooms.json` migrates once before the first database-backed request; the original stays untouched. Without a legacy file, startup never reads or writes the migration marker in Firestore. With a file, concurrent requests share an import attempt; failures defer database requests with Retry-After (at least ten minutes for quota errors), while `/health`, auth configuration and browser assets remain available. Partial imports resume without overwriting existing records. `/health` is a liveness check, not proof of database availability.

Existing development sessions can **Link an account** to retain identity/memberships. Already established Firebase accounts retain their own identity; there is no automatic account merge. Pre-Nexconn preview rooms are not converted.

**Database authentication:** Firestore now requires backend Admin/IAM credentials using `GOOGLE_APPLICATION_CREDENTIALS`; web configuration alone is insufficient for database access. Keep the service-account JSON private and outside the repository. Follow [FIRESTORE_SECURITY.md](FIRESTORE_SECURITY.md) to configure Render and deploy locked rules in the correct order. Existing open deployed rules remain unsafe until explicitly replaced and tested. Remote use also needs HTTPS, `codejam.apiUrl`, matching `CODEJAM_PUBLIC_URL` and an authorized Firebase domain.

No automatic local database or messaging fallback exists. Acknowledged sends are deduplicated within a client lifetime; uncertain acknowledgements across a reload are not an exactly-once guarantee. Presence refreshes every 30 seconds while the workspace is visible and expires after 90 seconds without an update. Metadata queries cap at 500 records per collection; rooms support 50 members.

## Verification and packaging

Database polling is separated from WebSocket chat delivery. The extension checks room metadata every 30 seconds and room membership every 60 seconds only while a workspace view is visible. Network/server failures back off from one minute; quota failures back off from ten minutes, capped at 30 minutes unless the server requests a longer delay. Manual retry bypasses the background cooldown. Account/backend changes reset the schedule.

The browser huddle checks remote controls every ten seconds in a call, with heartbeats no more often than every 20 seconds. Idle visible call pages check every 30 seconds; idle hidden pages stop checking. Active audio continues checking while hidden. Call participants expire after 90 seconds without a successful heartbeat. Quota/server failures pause automatic checks without ending Nexconn audio; local mute and leave remain available.

Deploy backend changes and rebuild `server/public/call.js` to update browser huddles and structured quota responses. Installing the extension VSIX updates editor polling independently, including recognition of the older backend's `Firestore RESOURCE_EXHAUSTED` message. Local tests use fake clocks and mocked providers without consuming live quotas.

```powershell
npm run compile
npm test
npm run test:nexconn
npm run test:project
npm run vsix
```

Automated tests cover membership, persistence, failures, AI context boundaries, SDK bridging and UI flow. Opt-in live tests consume provider quota. `test:project` creates disposable Firebase accounts, an isolated Firestore namespace and a temporary Nexconn group, verifies actual chat/thread history, decisions, Gemini and backend restart, then cleans up. It does not place an audio call.

Install the generated VSIX through **Extensions > ... > Install from VSIX**. Run the backend separately. The VSIX in the outer artifacts folder excludes credentials, backend files and test data. The package is unpublished; `codejam-team` is a local package publisher identifier.

See [DEMO.md](DEMO.md) for acceptance steps. Google popup, rendered layout and two-way microphone/audio still need manual verification because computer/browser access was unavailable. Public hosting, Marketplace publication and demo video upload have not been performed.

## Native voice messages

See [the recorder implementation notes](../native/README.md). Native helper compilation is independent from extension packaging. Voice controls bypass the backend refresh queue so Stop/Discard do not wait on HTTP polling. Nexconn upload/delivery tests use mocked providers; the Windows microphone smoke test is local-only. Cross-platform CI builds need microphone testing on real systems before release.
