# Changelog

## Unreleased

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
