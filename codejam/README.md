# CodeJam

A minimal VS Code workspace for project conversations, shared code, and decisions.

## View the interface

1. Open this `codejam` folder in VS Code.
2. Run `npm install` once, then press **F5** and select **Run Extension**.
3. In the Extension Development Host, click the **CodeJam** activity-bar icon, or run **CodeJam: Open Workspace** from the Command Palette.
4. For a larger canvas, run **CodeJam: Open Full View**.

If the development window is already running, stop debugging and press F5 again to load extension manifest changes.

## Try it

- Send local messages, reply, and pin messages to **Decisions**.
- Select code in an editor, then use the code icon in the composer to attach it. Shared code can open the corresponding local file.
- Use **@agent** to select context, inspect the preview, edit a sample handoff, and send it to the local room.
- Switch between projects or create a local project from **Projects**.
- Use the check icon in the room header to resolve or reopen a discussion.

This is an interactive UI preview. Alex and the initial conversation/decision are sample content. Messages, projects, and pins persist through VS Code's webview state for that view; the sidebar and full view have separate preview state. Authentication, Nexconn messaging/calls, repository linking, shared persistence, and live AI are not connected yet. No credentials are needed to preview the interface.

The UI uses VS Code theme colors, keyboard focus states, responsive layouts, and a restricted webview content security policy. The current webview uses plain HTML/CSS/JavaScript and requires no frontend runtime dependencies.

## Build

`npm run compile` checks types, lints the extension, and builds `dist/extension.js`.
