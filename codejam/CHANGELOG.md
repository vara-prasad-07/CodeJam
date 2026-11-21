# Changelog

## 1.0.17

- Remove default webview side padding and the inset header shell so the interface fills the panel.
- Simplify the header to flat rows and underline navigation; remove nested gradients, decorative borders and excess spacing.

## 1.0.16

- Redesign the workspace header with rounded surfaces, a blue/cyan project mark, a clearer room selector and segmented navigation.
- Match composer, menu and code-card corner radii, with compact-sidebar and high-contrast layouts.

## 1.0.15

- Add a subtle blue/cyan light that travels around the message composer's border, with reduced-motion and high-contrast fallbacks.

## 1.0.14

- Remember a local project folder per room, account and backend, including forks and different checkout paths; select a folder when Git identity is ambiguous.
- Open shared code only after finding its exact excerpt in the local file, relocating moved lines and checking function context when available.
- Fall back to a read-only shared snapshot for missing, changed, ambiguous, unlinked or unsafe references, with optional local-file comparison.

## 1.0.13

- Play the CodeJam intro when opening a workspace, hold the final logo while NexConn connects, and fade into the loaded workspace.
- Keep sign-in and connection recovery accessible, with a static logo fallback and reduced-motion support.

## 1.0.12

- Fix invisible voice-message waveform bars by defining their heights in the stylesheet, compatible with VS Code's webview security policy. Improve waveform contrast.
- Make message actions compact with individual hover highlights instead of an outer box.

## 1.0.11

- Replace the browser voice-message controls with a compact player featuring play/pause, seekable waveform-style progress, elapsed/total time, playback speeds and retryable playback errors.
- Add private message translation into English, Hindi and Telugu through Nexconn. Start new accounts in English and remember the language selected when translating.
- Support older backends without the language-preference endpoint by remembering the preference locally per account.
- Improve visibility of message actions, emoji choices and sharing controls with stronger contrast, larger buttons and clear focus states.

## 1.0.10

- Move Agent context permissions into the composer and generate private inline answers with `@agent` + Enter. Remember permissions per account, room and checkout; share answers only through **Share with room**.
- Add missing-context checks, private retryable errors, request cancellation, stale-response protection and duplicate-share handling.
- Prevent duplicate room names, add owner-only room deletion and member removal, and add **Exit room** with ownership transfer. Send chat messages with Enter and insert new lines with Shift+Enter.

## 1.0.9

Add native desktop voice recording with a default/selectable microphone, local preview, explicit send/discard, upload progress, and Nexconn voice delivery and history. Preserve text drafts and room/thread destinations, limit clips to 1?60 seconds, and stop capture when the owning view hides or closes.

Tighten workspace density: compact brand and room rows, smaller section headings, consistent control sizing, and reduced spacing across chat, setup, decisions, team and AI dialogs.

## 1.0.8

Allow general AI questions without selecting project context. Make context optional in Ask AI, omit repository metadata from question-only requests, and show unavailable/empty sources. Preserve source-specific and discussion-root context, invalidate edited previews, and ignore stale AI responses after a room switch. Keep answers private until review and explicit send.

Keep backend HTTP startup independent of Firestore availability. Skip cloud migration-marker access when no legacy file exists; defer required legacy imports with shared attempts and retry backoff, preserving existing records and partial progress. Keep liveness/configuration endpoints available during database quota outages while data endpoints return errors.

## 1.0.7

Throttle huddle database checks and heartbeats, stop checks in hidden idle call tabs, and back off after service/quota errors while keeping local call controls available.

Reduce Firestore polling: refresh room lists once a minute and room metadata/presence every 30 seconds, pause while all views are hidden or sign-in is required, and back off on quota/service failures. Keep Nexconn chat live during a metadata outage. Return quota-specific errors and Retry-After from the backend.

Redesign the workspace around Chat, Discussions, Decisions and Team. Add a compact composer that grows with its draft, a room picker with invitations, focused message actions, discussion filters, and repository details on demand. Preserve room/thread drafts and scroll position, add dialog focus restoration and Escape handling, and refresh all workspace surfaces for narrow sidebars and full view.

## 1.0.6

Change the Marketplace display name to CodeJam Workspace after CodeJam was rejected as already taken. Keep publisher CodeJam and internal name codejam-workspace.

## 1.0.5

Use the new internal extension name `codejam-workspace` after the previous `codejam` Marketplace entry was removed. Keep the visible name CodeJam and publisher CodeJam. This changes extension identity; uninstall an earlier CodeJam build before installing this one and sign in again. Existing account rooms remain on the backend.

## 1.0.4

Recognize Firestore HTTP 400 FAILED_PRECONDITION version conflicts so concurrent metadata updates can retry. Record live database-access verification and update privacy/security disclosures to reflect the Admin/IAM migration.

## 1.0.3

Add server-only Firebase Admin/IAM authentication, fail-closed credential handling, a deny-all client rules file, and the Render secret-file migration guide. Deployed rules must still be changed and verified explicitly.

License CodeJam source under MIT and use the registered `CodeJam` publisher identifier. Third-party SDK licenses remain separate.

## 1.0.2

Prepare the Marketplace listing, PNG icon, user-facing setup guide, privacy/support/security disclosures, bundled license notices, release guide and runtime-only package allowlist. Keep development docs and release artifacts outside the extension package.

## 1.0.1

Default to the hosted CodeJam backend so fresh VSIX installations can connect without configuration. Keep the API URL setting available for local development or another backend.

## 1.0.0

Firebase sign-in and Firestore persistence; Nexconn chat, threaded code discussions and browser audio; searchable decisions; reviewed Gemini drafts; repository reference/diff actions; team presence; independent two-person launcher and local VSIX packaging.
