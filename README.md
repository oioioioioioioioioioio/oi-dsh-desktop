# oi-dsh-desktop

[中文说明](./README.zh.md)

An open-source Electron client for DeepSeek Harness. It runs the Harness Host
inside Electron through process-local IPC, without starting `dsh web` or a
Harness HTTP/WebSocket listener.

The Harness integration is maintained separately in
[`oi-dsh-desktop-bundle`](https://github.com/oioioioioioioioioioio/oi-dsh-desktop-bundle).
This repository pins a tagged bundle release and npm installs it automatically.
The official `@deepseek-ai/dsh` package is also installed from npm and is never
copied, patched, or modified by this project.

## Run from source

Requirements:

- Windows 10 or Windows 11
- Node.js 22.19.0 or newer, with npm
- Git

```powershell
git clone https://github.com/oioioioioioioioioioio/oi-dsh-desktop.git
cd oi-dsh-desktop
npm install
npm start
```

No pnpm installation and no separate bundle checkout are required. On Windows,
`start.cmd` can also be launched from Explorer; it installs dependencies on the
first run and starts the client.

## Desktop features

- Custom native-style title bar and bundled desktop logo.
- Multiple project directories with project switching.
- Collapsible project/file sidebar with a project directory default view.
- Integrated source editor with syntax highlighting.
- Integrated Markdown preview and workspace file editing.
- Electron-native folder picker on Windows.
- Managed desktop profile under `DSH_HOME/profiles/oi-desktop`.

## Command-line options

```text
--profile <name>                 Managed profile name (default: oi-desktop)
--dsh-home <path>                Override DSH_HOME for this launch
--devtools                       Open Electron developer tools
--allow-unsupported-harness      Skip the supported Harness version check
```

Pass options through npm or the Windows launcher:

```powershell
npm start -- --devtools
.\start.cmd --devtools
```

## Development

```powershell
npm install
npm run check
```

`npm run check` runs typechecking, tests, and a production build. The generated
`lib/` directory is intentionally not committed. `npm install` retrieves the
verified HTTPS bundle archive, and `npm start` rebuilds this client before
launching it.

## License

Apache-2.0
