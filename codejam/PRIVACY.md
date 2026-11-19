# Privacy and data use

CodeJam uses `https://codejam-vdmp.onrender.com` by default. Set `codejam.apiUrl` to use another backend. That backend's operator controls database access, providers and retention.

## Data handled

- Authentication: email, display name and Firebase identifier. Email/password credentials pass over HTTPS through the backend to Firebase Authentication. CodeJam does not intentionally store passwords.
- Rooms: membership, invitations, repository identity/name, discussions, pins and reactions are stored in Firestore. Pinned decisions and thread roots retain message/code snapshots.
- Chat: messages, selected excerpts, relative file paths, lines, branch/commit, replies and mentions go through Nexconn and its configured message history.
- Presence: room members see recent project-relative file/line focus and presence. Call metadata includes participation and mute state.
- Audio: joining with microphone permission sends audio through Nexconn. CodeJam does not implement recording or transcription.
- AI: selected context shown in the preview goes to Gemini when you request generation. The draft remains private in your client until you send it. Generation does not scan the entire repository automatically.
- Sessions: app credentials use VS Code SecretStorage; the backend stores token hashes. Browser sign-in uses short-lived one-time tickets. The call tab uses sessionStorage for its limited reconnect session.

Git metadata is inspected locally for the project header. Unsent composer drafts and selected excerpts can be restored from local webview state. Signing out clears the active composer. No entire-repository upload is intentionally performed automatically.

## Providers

Hosting: Render. Authentication/database: Firebase. Messaging/audio: Nexconn. AI: Google Gemini. Provider connection data and diagnostics follow their terms. CodeJam does not implement a separate product analytics pipeline.

## Access and retention limits

The default hosted backend uses Firebase Admin credentials and IAM for database access. On November 19, 2026, targeted checks verified that anonymous and Firebase-authenticated direct client reads/writes on tested paths were denied, while Admin access and hosted account/session operations worked. CodeJam enforces room membership on its backend. Earlier prototype deployments used open rules; current restrictions do not undo any earlier exposure. Other backend operators must configure their own credentials, access rules and protections.

App sessions expire after 30 days, limited call sessions after four hours, and invitations after seven days unless renewed. Inactive presence is hidden, but records are not automatically purged. Room data, messages and decision snapshots have no application-level deletion schedule. Provider retention settings also apply.

There is no in-extension account/message deletion workflow. Ask the maintainer for a private contact through the support channel before sharing account identifiers for a removal request. Do not post personal data, credentials or private code in public issues. See SUPPORT.md.

Review selected context yourself. File exclusions and credential patterns are not a comprehensive secret scanner.
