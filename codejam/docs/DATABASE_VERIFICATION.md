# Database verification - November 19, 2026

Target: `https://codejam-vdmp.onrender.com`, using its configured Firebase project. The private JSON file was read only by Firebase Admin for local token acquisition; it was not copied into the repository or package, or printed. Its path was provided by the owner.

## Passed live checks

- Hosted `/health`: HTTP 200, database `firestore`, `databaseAccess: server-iam`.
- Anonymous list/read requests on `codejam_rooms` and an isolated security-check document: HTTP 403 PERMISSION_DENIED.
- Anonymous isolated document write: HTTP 403 PERMISSION_DENIED.
- Direct requests with a temporary Firebase user's ID token: room list and isolated write denied with HTTP 403 PERMISSION_DENIED.
- Firebase Admin: create/read a random temporary document, update with its saved version, query by a unique ID, delete and confirm absence.
- A stale-version update was rejected by Firestore. Its HTTP 400 FAILED_PRECONDITION response exposed an adapter classification bug; the local fix maps this specific version-precondition failure to HTTP 409 so existing concurrency retries work. Other FAILED_PRECONDITION errors remain service errors. A regression test and a live repeat passed.
- Hosted backend: sign in with a disposable Firebase account, verify its persisted app account and hashed session document via Admin, query its empty room list, log out and verify session removal.

Temporary Firestore check/account/session documents and both temporary Firebase Authentication accounts were deleted. No existing room or user content was changed. The hosted sign-in check may provision a test identity with Nexconn; no Nexconn group, message or call was created by this check.

## Remaining work

Push/redeploy `server/firestore.mjs` and its regression test to apply the conflict-classification fix to the hosted backend. The database access checks already passed on the current deployment; this is a separate concurrency-handling correction.

These are targeted functional/access checks, not an independent security audit. They do not prove historical data was never accessed under earlier open rules, or audit every API, IAM role, rate limit or provider. Google popup, actual two-way audio and rendered visual acceptance remain manual release checks. See DEMO.md and PUBLISHING.md.
