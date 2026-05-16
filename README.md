# Ark Sync

An Ark Sync desktop client built with **Electron**, **React**, **TypeScript**, and **Vite** ([electron-vite](https://electron-vite.org/)). It manages local or remote Ark Sync instances via the **Ark Sync REST API**, providing AI agent detection, third-party tool installation status, and **SKILLS** security scanning capabilities.

## Features

| Module | Description |
|--------|-------------|
| **Overview** | AI agent scanning, security detection summary, rule library status, risk classification stats, common AI dev tool detection |
| **Agents** | Detected AI agents/tools list; skills, memory, config paths; security audit and remediation advice for SKILL files in **Detection Detail** |
| **Local Device** | Current device name, upload/download rate, local file stats, listener/discovery status, uptime, device ID and engine version |
| **Folders** | Sync folder list and details (path, type, shared devices, rescan interval, version control, pause/edit, etc.) |
| **Remote Devices** | Peer device connection info, rate, address and connection type, compression and auto-accept policies |
| **Operations** | Settings, advanced, logs, language, restart/shutdown, help, QR code and more; multi-language support |
| **Settings** | Options consistent with underlying engine (device name, disk space, API key, auto-upgrade policy, default folders/devices, etc.) |

**Getting Started**: Click "Enter System" on the welcome page in the Electron desktop client to use the local default Ark Sync instance without needing to fill in API keys or connection config first.

## Screenshots

Screenshot files are in the **`docs/screenshots/`** directory. Below uses **GitHub Raw absolute links** (`main` branch), which should display in GitHub web, Cursor/VS Code Markdown preview (requires access to `raw.githubusercontent.com`). If you fork this repo, replace `arkcore-share/ark-sync-app` with your `user/repo`.

### Overview

<img src="https://raw.githubusercontent.com/arkcore-share/ark-sync-app/main/docs/screenshots/01-overview.png" alt="Overview" width="820" />

### Agents · List

<img src="https://raw.githubusercontent.com/arkcore-share/ark-sync-app/main/docs/screenshots/02-agents-list.png" alt="Agents List" width="820" />

### Agents · Skill Detection Detail

<img src="https://raw.githubusercontent.com/arkcore-share/ark-sync-app/main/docs/screenshots/03-agents-skill-detection.png" alt="Skill Detection Detail" width="820" />

### Local Device

<img src="https://raw.githubusercontent.com/arkcore-share/ark-sync-app/main/docs/screenshots/04-local-device.png" alt="Local Device" width="820" />

### Folders

<img src="https://raw.githubusercontent.com/arkcore-share/ark-sync-app/main/docs/screenshots/05-folders.png" alt="Folders" width="820" />

### Remote Devices

<img src="https://raw.githubusercontent.com/arkcore-share/ark-sync-app/main/docs/screenshots/06-remote-devices.png" alt="Remote Devices" width="820" />

### Operations · Language & About

<img src="https://raw.githubusercontent.com/arkcore-share/ark-sync-app/main/docs/screenshots/07-operations-language-about.png" alt="Operations and Language, About" width="820" />

### Settings · General

<img src="https://raw.githubusercontent.com/arkcore-share/ark-sync-app/main/docs/screenshots/08-settings-general.png" alt="Settings - General" width="820" />

**Undocumented features** (add screenshots to `docs/screenshots/` and append to this section as needed): Welcome/Enter System page; Settings tabs like **GUI**, **Connections**, ignored items; **Advanced**; **Logs**; **Help**; **About** (if different from Operations); **Restart/Shutdown**, **Show QR Code**, etc.

## Requirements

- [Node.js](https://nodejs.org/) (LTS recommended)
- npm

## Install Dependencies

```bash
npm install
```

## Build

| Command | Description |
|---------|-------------|
| `npm run build` | Build main process, preload, and renderer with electron-vite, output to `out/` |
| `npm run package` | Run `build` first, then package with electron-builder (scripts include domestic `ELECTRON_BUILDER_BINARIES_MIRROR`) |
| `npm run package:win` | Same as above, Windows only (NSIS installer + portable) |
| `npm run package:win:portable` | Generate **portable** single file only, no NSIS (try this first if mirror unavailable) |
| `npm run package:win:dir` | Generate **`win-unpacked` directory** only, no installer, no NSIS needed |

`package.json` electron-builder targets:

- **Windows**: NSIS, portable
- **Linux**: AppImage, deb
- **macOS**: Must be built on macOS

### Windows Packaging and `winCodeSign` / GitHub Download Failures

electron-builder calls `rcedit` when writing **ASAR integrity** and other resources, attempting to download **`winCodeSign`** from GitHub. If network cannot access `github.com` (timeout, `wsarecv`, etc.), packaging fails.

This repo sets **`signAndEditExecutable: false`** in **`build.win`** to **skip .exe resource patching**, avoiding **`winCodeSign`** download for easier packaging in China or restricted networks.

Trade-off: Executables in the installer may still show **Electron default icon**, and ASAR integrity won't be written (usually fine for desktop client use). For official signing, custom icon, or integrity resources, build in an environment with GitHub access, or manually place `winCodeSign-2.6.0.7z` in electron-builder cache and retry.

**NSIS** (`Ark Sync Setup *.exe`) downloads **`nsis-*.7z`** from `electron-builder-binaries`. If still timing out connecting to `github.com`:

- Project scripts **`package` / `package:win*`** set **`ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`**, and **`.npmrc`** configures **`electron_builder_binaries_mirror`** (for npm subprocesses).
- If mirror also fails, run **`npm run package:win:dir`** to get `release/win-unpacked/` and run the exe directly; or use **`npm run package:win:portable`** for portable version.

### Bundled Ark Sync Engine with Installer

1. Put compiled Ark Sync engine executable (or ArkSync) into **`resources/backend/`**: name it **`arksync.exe`** for Windows, **`arksync`** for Linux/macOS (see `README.md` in that directory for details). The packaged desktop client executable is **`arksync_client.exe`** (configured by `build.executableName` in `package.json`).
2. **`build.extraResources`** in **`package.json`** copies to **`resources/backend/`** during packaging.
3. **On Electron startup**, bundled program runs automatically (**`serve --no-browser`**, falls back to old params on failure), data in app **`userData/bundled-syncthing`**, default GUI **`http://127.0.0.1:8384`**. No error if no bundled file; falls back to locally installed Ark Sync engine instance.
4. Environment variables: **`SYNCWEB_DISABLE_BUNDLED_SYNCTHING=1`** disables auto-start; **`SYNCWEB_BUNDLED_GUI_ADDRESS`** changes listen address.

## Run

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev mode (`cross-env` sets `NO_SANDBOX=1`, works on Windows/Linux/macOS; mitigates Linux sandbox issues) |
| `npm run preview` | Preview built output |
| `npm run dev:win` | Same as `npm run dev` (kept for backward compatibility) |

Use `npm run dev` for daily development with full capabilities in the Electron window.

If startup shows **Electron uninstall** or missing `node_modules/electron/path.txt`, Electron binary download incomplete: run `npm run electron:install` in project root (or delete `node_modules/electron` and run `npm install` again). Repo `.npmrc` already configures domestic mirror for faster download.

## Optional Environment Variables

- **`SYNCWEB_DISABLE_GPU=1`**: Disable hardware acceleration; helps with startup issues on no-GPU or WSL environments (main process also disables hardware acceleration when detecting WSL).
- **Running as root on Linux**: Main process auto-adds `no-sandbox`, otherwise Electron may fail to start.

## Tech Stack

- Electron, electron-vite, electron-builder
- React 18, react-router-dom
- TypeScript, Vite

## License

See repository (if not stated separately, confirm with maintainers).