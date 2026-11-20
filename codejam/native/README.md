# Native voice recorder

CodeJam's webview provides the controls. `VoiceRecorder` in the desktop extension host starts this helper only after an explicit Record action. The helper captures 16 kHz mono PCM16 WAV from the default microphone, or the selected device, for at most 60 seconds. It has no networking code.

The extension loads a stopped recording into memory for preview and removes its temporary directory immediately. Discard, successful send, view disposal and sign-out release the in-memory recording. Live capture is cancelled when its owner view hides. The helper also stops when its parent's stdin closes and removes its incomplete recording. System microphone permissions still apply; CodeJam does not change them.

## Build the helper, not the extension

Run `npm run build:recorder` in `codejam` from a C compiler environment. Windows uses an MSVC developer shell (`cl`); macOS/Linux use `cc`. `CC` and `RECORDER_ARCH` select another compiler or a cross-compilation target. This command does not run esbuild, vsce, or create a VSIX.

Output is `native/bin/<platform>-<arch>/recorder[.exe]` with a SHA-256 checksum. The extension verifies the bundled binary before its first use. Windows x64 can also use the bundled ia32 WinMM helper when an x64 helper is absent. A locally compiled ia32 helper is included and has been tested on Windows x64. No package manager or compiler is required on users' computers.

`.github/workflows/native-recorder.yml` builds Windows x64/arm64, macOS x64/arm64, and Linux x64/arm64 helpers. Download and extract each matching tar archive into `codejam/native/bin` before preparing a universal release. Tar archives preserve Unix executable permissions. The workflow does not build, publish, or deploy the extension. These other platforms require actual microphone/permission testing before claiming support.

The runtime selects a matching OS/CPU helper automatically. Missing helpers and remote extension hosts fail with an explanation rather than trying to record from a remote server. This first implementation supports local desktop workspaces; WSL/SSH/Codespaces require a future local companion extension. Do not change `extensionKind` to fix recording: CodeJam's Git and filesystem operations must stay next to the workspace.

## Helper protocol

- `--version`: no-device smoke test.
- `--list`: one JSON object listing capture devices; never starts capture.
- `--record <owned-temporary-wav-path> <-1|device-index>`: `-1` means the system default microphone.
- Stdout emits JSON lines: `ready`, bounded `progress` (duration/peak), `complete`, or `error`.
- A byte on stdin stops and finalizes the WAV. EOF means the parent disappeared; stop and delete the file. Closing/killing the helper releases the microphone.

The destination room/thread and retry ID live in the extension, not in caller-supplied upload data. The original text/code draft is separate. Nexconn `Helper.createSendHDVoiceMessageParams` and `GroupChannel.sendMediaMessage` handle media upload and delivery. Voice bytes are never put in Firestore, VS Code webview persisted state, or the backend session store. Voice URLs/durations can be retained in discussion/decision snapshots.

Vendored miniaudio is pinned to tag `0.11.24` from https://github.com/mackron/miniaudio and used under its MIT No Attribution license option. See `vendor/MINIAUDIO-LICENSE` and `../licenses/MINIAUDIO.txt`.
