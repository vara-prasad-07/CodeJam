# Security

Never post vulnerabilities, provider credentials, bearer tokens or private code publicly. Request a private reporting channel at https://github.com/vara-prasad-07/CodeJam/issues without exploit details.

## Public release blocker

The updated backend uses Firebase Admin credentials and IAM for Firestore REST requests. Deploying this code alone does not close previously open Firestore rules. Configure the private Render secret, verify reads/writes, then deploy the deny-all client rules in `server/firestore.rules`. Follow `docs/FIRESTORE_SECURITY.md`. Until the deployed migration is verified, direct database exposure remains a public release blocker.

Before launch, also finish Google sign-in and real two-way audio acceptance checks, confirm the deployed backend includes membership repair, and configure provider quotas/abuse controls for public signups. No independent security audit has been performed.

Keep secrets in ignored local environment files or deployment secret settings. Never package the backend, `.env`, legacy data, test output or publishing credentials.
