# Support

Report reproducible bugs at https://github.com/vara-prasad-07/CodeJam/issues.

Include extension version, VS Code version, OS, reproduction steps and visible error code. Redact tokens, invitations, private code and account data. Never upload `.env` or provider keys.

For security reports or data-removal requests, ask for a private contact without including sensitive details. See SECURITY.md and PRIVACY.md.

## Troubleshooting

- Connection: confirm `codejam.apiUrl`. The hosted service may need time to wake; open its `/health` endpoint, wait for JSON and reconnect.
- Wrong backend: existing User/Workspace settings override the bundled URL. Reset the setting or enter your chosen URL explicitly.
- Google: authorize the backend hostname in Firebase, allow the popup and return to VS Code.
- Nexconn code 22406: membership is missing. Use the current backend/extension and reconnect to repair it.
- Audio: allow microphone in the browser call tab and keep it open. Calling must be enabled for the Nexconn application.

This preview has no guaranteed support response time or service-level agreement.
