# Two-person acceptance walkthrough

Start the backend and launch **CodeJam - Two People**. Use separate Firebase accounts.

1. Sign in by email/password in each window. Separately exercise Google sign-in; authorize localhost in Firebase and return to VS Code after the popup.
2. Verify repository/branch/latest commit in A. Create a room, copy its invitation and join in B. Reopen both windows and confirm room restoration.
3. Send messages both ways. Mention the other member using `@First_Last`. Confirm live receipt, mention highlighting and earlier history.
4. Select code and choose Share Selection with Team. Send it and open the reference in B. Change that file or revision and confirm the warning and saved-excerpt diff.
5. Open a discussion from the code message. Reply in B, react, pin a decision and resolve. Search the decision by text/path. Restart the backend and confirm persistence.
6. Ask @agent for a handoff. Choose context, preview, generate, edit and Send reviewed draft. B receives only the reviewed version. Close another private draft and confirm no message is posted.
7. Open Start huddle in A and allow microphone. Open the same room's huddle in B and answer/join. Check speech both ways, mute/unmute from VS Code and browser, leave and start a fresh call. Check chat still works during audio. Enable Nexconn calling if the provider reports it is unavailable.
8. Exercise a disconnected SDK send: confirm visible error and retained draft. Reconnect and retry.

## Verification record

- Automated suite: membership, persistence, provider failures, AI boundaries, SDK bridge, chat UI, transient passwords and review-before-send.
- Live passed: Firebase password identities, two Nexconn clients, code/thread history, Firestore decisions/reactions and restart, Gemini draft, separate call identities and restricted call ticket. Temporary resources cleaned up.
- Manual outstanding: Google popup, rendered visual layout, microphone permission and actual two-way audio. The computer-use host was unavailable.
- Public hosting, Marketplace upload and recorded demo video: not performed. Runnable source and local VSIX provided. This walkthrough can be used as a demo recording script.

Before public release, configure server-authenticated Firestore and locked rules, HTTPS hosting and your actual publisher identity. Current open rules do not provide production-private storage.

Dependency audit: runtime dependencies report zero known vulnerabilities. The full development toolchain still reports advisories in packaging/lint/test glob dependencies, including an advisory without an available upstream patch. Development dependencies are excluded from the VSIX.
