# Ybochat

All-in-one chat client that loads multiple messaging apps in a clean, unified window.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-blue)
![Version](https://img.shields.io/github/v/tag/Anti-Depressants-Dev-Team/Ybochat?label=version)

<p align="center">
  <img src="chat.png" width="128" alt="Ybochat icon">
</p>

## Apps

12 chat services as toggleable tabs:

| App | |
|-----|-----|
| Discord | Steam Chat |
| Cinny (Matrix) | Telegram K |
| Stoat (Matrix) | Telegram A |
| Fluxer (Matrix) | WhatsApp |
| Element (Matrix) | Wire |
| Threema | Slack |

## Features

- **Tabbed interface** — switch between apps with a click
- **Horizontal tab mode** — Chrome-style tabs in the titlebar, scrollable
- **Streamer mode** — hides the window from OBS and screen capture
- **Chrome user agent** — all webviews identify as Chrome 120, avoiding compatibility blocks
- **Scrollable sidebar** — handles any number of enabled apps
- **Settings persistence** — your app selections and layout survive restarts
- **Auto-updater** — checks GitHub Releases and installs updates with one click

## Install

### Windows
Download `Ybochat Setup x.x.x.exe` from [Releases](https://github.com/Anti-Depressants-Dev-Team/Ybochat/releases) and run the installer.

### Linux
Download the `.deb`, `.rpm`, or `.AppImage` from [Releases](https://github.com/Anti-Depressants-Dev-Team/Ybochat/releases).

```bash
# Debian/Ubuntu
sudo dpkg -i ybochat_*_amd64.deb

# Fedora/RHEL
sudo rpm -i ybochat-*.x86_64.rpm

# AppImage (any distro)
chmod +x Ybochat-*.AppImage
./Ybochat-*.AppImage
```

## Development

```bash
git clone https://github.com/Anti-Depressants-Dev-Team/Ybochat.git
cd Ybochat
npm install
npm start
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run in development mode |
| `npm run build` | Build for current OS |
| `npm run build:win` | Build Windows installer |
| `npm run icon` | Generate icons from `chat.png` |

## Tech

- [Electron](https://electronjs.org/) — desktop shell
- [electron-builder](https://www.electron.build/) — packaging and auto-update
- [electron-updater](https://www.electron.build/auto-update) — in-app updates
- [sharp](https://sharp.pixelplumbing.com/) + [to-ico](https://github.com/ssnangua/to-ico) — icon generation

## License

ISC
