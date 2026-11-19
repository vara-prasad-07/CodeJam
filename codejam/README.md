# CodeJam Workspace

Team conversations, shared code and decisions beside your editor.

CodeJam brings repository-aware chat, code discussions, searchable decisions, reviewed AI drafts and audio huddles into VS Code. Open the sidebar for quick updates or use **CodeJam: Open Full View** for more space.

**Early preview:** the hosted backend uses Admin/IAM database access, and direct Firestore client access was verified as denied on November 19, 2026. This targeted check is not a full security audit. Read [Privacy](PRIVACY.md) and [Security](SECURITY.md) before connecting.

## Start collaborating

1. Install CodeJam and open your project folder in VS Code.
2. Run **CodeJam: Open Workspace** or click the CodeJam activity icon.
3. Sign in with email/password or Continue with Google.
4. Create a room and share its invitation. Your teammate signs in with their own account and joins using that invitation.

CodeJam connects to `https://codejam-vdmp.onrender.com` by default. Hosted-service users need no API keys or local backend. An existing `codejam.apiUrl` setting overrides this default.

## Keep code in context

Use **Chat**, **Discussions**, **Decisions**, and **Team** to move around your room. Click the room name to switch rooms or create/join another. The sliders button opens **Room setup**.

Click the project name beside CodeJam for your Git branch, latest commit, and working-tree state. Select code in the editor and choose **Share Selection with Team** to send a reference with relative path, line range, branch, revision and selected excerpt. The message composer starts at one line, grows as you type, and sends with **Ctrl / ⌘ + Enter**.

Open a reference in your checkout. When your revision differs, inspect the saved excerpt and working-copy diff. Opening a reference does not execute snippets or edit files.

## Turn conversations into decisions

- Exchange messages, replies and mentions through Nexconn Chat.
- Open a message's **More actions** to start a discussion, save a decision, or ask AI. Find open and resolved conversations in **Discussions**.
- Reply, react and resolve or reopen a discussion.
- Pin a decision and search by title, text or path.
- Reopen rooms and load earlier cloud history.

Mention names containing spaces with underscores: `@First_Last`.

## Review AI drafts before sharing

Ask `@agent` or choose the AI action on a message. Select code, room/discussion messages and optional local Git diff. Preview context, generate a private Gemini draft, then review/edit before explicitly sending under your name. Generation never posts automatically.

Context goes to Gemini when you generate. File-name and credential-pattern checks are limited: review everything you select before sending.

## Talk through a problem

Open Team and start or join an audio huddle. A browser tab uses Nexconn Call to request microphone permission. Keep the tab open during the call. Mute or leave from the browser or extension controls.

## Requirements and settings

- VS Code 1.146.0 or later, internet access and a Firebase account created through CodeJam.
- Git for repository metadata/diffs. Basic room use also works in a non-Git folder.
- A browser with microphone support for huddles.
- Teammates connected to the same backend.

| Setting | Default | Purpose |
| --- | --- | --- |
| `codejam.apiUrl` | `https://codejam-vdmp.onrender.com` | Hosted or self-hosted backend URL |
| `codejam.displayName` | `Developer` | Fallback setup/legacy name; signed-in profile names take precedence |

Local developers can set the API URL to `http://127.0.0.1:3000`. Provider secrets belong on the backend, never in extension settings.

## Preview limits

The free hosted service can take time to wake after inactivity. Wait a minute and reconnect after a timeout. Presence updates periodically. Rooms support 50 members; metadata queries return up to 500 records per collection. Password reset and account deletion are not available inside the extension.

Chat arrives live through Nexconn. While CodeJam is visible, room metadata and presence refresh every 30 seconds, and room lists refresh once a minute. Background database polling pauses when all CodeJam views are hidden or sign-in is required. Quota errors pause automatic refresh for at least ten minutes, with longer delays after repeated failures; use Reconnect/Retry to explicitly retry. An exhausted Firestore quota still requires the quota to reset or be increased.

Google popup, rendered layout and real two-way audio still need the maintainer's final manual acceptance pass. Read the privacy disclosure before sharing code, messages or account data.

[Support](SUPPORT.md) | [Security](SECURITY.md) | [Development](docs/DEVELOPMENT.md) | [Release history](CHANGELOG.md)

## License

CodeJam source is available under the [MIT license](LICENSE.txt). Bundled third-party SDKs retain their own licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md). The MIT license does not grant rights to third-party services or SDKs.

## Earlier preview installations

The extension identifier is now `CodeJam.codejam-workspace`. If you installed the earlier `CodeJam.codejam` preview, uninstall it before installing this build, then sign in again with the same account. Your existing rooms remain on the backend.
