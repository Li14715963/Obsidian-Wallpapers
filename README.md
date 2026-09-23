# Nexus Wallpaper

An Obsidian desktop plugin that places an image or video behind the workspace and adds adjustable translucent glass surfaces.

- **Version:** 1.0.0
- **Author:** Lin
- **Plugin ID:** `nexus-wallpaper`
- **Minimum Obsidian version:** 1.13.0
- **Desktop only:** Yes

## Features

- Use images and videos in the vault, HTTP(S) sources, or a folder playlist.
- Adjust wallpaper fit, playback rate, flip, blur, brightness, contrast, saturation, and dimming.
- Configure the central reading surface and sidebars independently, including blur, tint, opacity, and accent color.
- Pause media while Obsidian is hidden and clean up the wallpaper layer and CSS variables when disabled.
- Optionally discover local Wallpaper Engine projects on Windows. Video projects play through a loopback media server; scene projects show their preview image; web projects are best effort.

## Build

Requirements: Node.js and npm. From this directory run:

```powershell
npm ci
npm run typecheck
npm run build
```

The build creates `main.js` beside `manifest.json` and `styles.css`.

## Install

Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/nexus-wallpaper/`, then enable **Nexus Wallpaper** in Obsidian's Community plugins settings. The plugin's settings remain in that folder's `data.json`.

On Windows, the helper script can deploy to a chosen vault after building:

```powershell
npm run deploy -- --vault "C:\path\to\your-vault"
```

The path must be absolute and point to a vault that already contains `.obsidian`. The script copies only the three plugin files and verifies each copy with SHA-256. It never overwrites `data.json`.

## Use

Open **Settings → Nexus Wallpaper**, enable the feature, then choose a vault media path, folder playlist, HTTP(S) URL, or Wallpaper Engine item. Leaving the source empty enables glass styling over the current theme background. The command palette includes **Nexus Wallpaper: 启用/停用壁纸** and **Nexus Wallpaper: 轮播：换下一张**.

## Compatibility notes

- Wallpaper Engine discovery uses Windows Steam registry and common installation paths. Its integration is optional and disabled by default.
- Wallpaper Engine scene projects display a static preview; real-time scene rendering is not included. Web projects may not load every relative resource.
- Files outside the vault are not accepted as ordinary wallpaper paths. Wallpaper Engine media is served by the plugin's local loopback server.
- The plugin uses the same ID as the Nexus Wallpaper plugin it was copied from. Installing this build in a vault updates that plugin and reuses its existing settings; do not install both copies in one vault.
- The plugin is adapted from the MIT-licensed dsh-wallpaper-engine project. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
