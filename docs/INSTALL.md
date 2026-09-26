# Install and verify

## Build from source

Run these commands from the project root:

```powershell
npm ci
npm run typecheck
npm run build
```

The plugin files are `main.js`, `manifest.json`, and `styles.css`. The build also syncs them into the root `nexus-wallpaper/` folder, which is the ready-to-copy Obsidian plugin folder.

## Install manually

Copy the entire root `nexus-wallpaper/` folder into `<vault>/.obsidian/plugins/`, keeping any existing `data.json`, then enable **Obsidian Wallpapers** in Obsidian's Community plugins settings.

## Deploy with the helper

Pass the destination Vault explicitly. The directory must already contain `.obsidian`.

```powershell
npm run deploy -- --vault "C:\path\to\test-vault"
```

The script checks the manifest ID and build files, copies the three plugin files, and verifies the copied files with SHA-256. It does not infer a Vault from the project location and does not copy or overwrite plugin settings.

## Verify in Obsidian

Use a test Vault to check image and video sources, glass-only mode, folder rotation, settings persistence, and cleanup after disabling the plugin. After deployment, reload the plugin and inspect **Developer tools → Console** for errors. The Obsidian CLI can also reload and inspect the plugin:

Before using CLI commands, enable **Settings → General → Advanced → Command line interface** in the Obsidian instance that has the test Vault open.

```powershell
obsidian vault="<test-vault-name>" plugin:reload id=nexus-wallpaper
obsidian vault="<test-vault-name>" dev:errors
obsidian vault="<test-vault-name>" dev:console level=error
obsidian vault="<test-vault-name>" dev:screenshot path="<screenshot-path>"
```

When verifying, confirm that disabling the plugin removes its wallpaper layer, body attributes, and `--nwp-*` variables. Test Wallpaper Engine scanning only on a Windows machine with Steam and Wallpaper Engine available. Scene projects use static preview images; web projects are best effort.

## Settings compatibility

The plugin ID remains `nexus-wallpaper`, so an existing installation uses the same `data.json` settings. Keep one copy of this plugin ID per Vault.
