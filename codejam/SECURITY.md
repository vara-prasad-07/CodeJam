# Security

Never post vulnerabilities, provider credentials, bearer tokens or private code publicly. Request a private reporting channel at https://github.com/vara-prasad-07/CodeJam/issues without exploit details.

## Verified database configuration

On November 19, 2026, the deployed backend reported Admin/IAM access. Targeted tests confirmed anonymous and Firebase-authenticated direct client requests to the tested Firestore paths were denied. Admin create/read/update/query/delete and hosted account/session writes, room queries and session deletion succeeded. Temporary Firestore records and Firebase Authentication users were removed.

See `docs/DATABASE_VERIFICATION.md` for scope and limits. The stale-update conflict classification discovered during testing is fixed in local source and still needs backend redeployment. This check is not a full security audit and does not verify every API or provider setting. Earlier open rules may have exposed data before they were locked. Follow `docs/FIRESTORE_SECURITY.md` when configuring another deployment.

Before launch, also finish Google sign-in and real two-way audio acceptance checks, confirm the deployed backend includes membership repair, and configure provider quotas/abuse controls for public signups. No independent security audit has been performed.

Keep secrets in ignored local environment files or deployment secret settings. Never package the backend, `.env`, legacy data, test output or publishing credentials.
