import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, sanitizeSettings } from "./types";
import type { NexusWallpaperSettings } from "./types";
import { isWeSource, listFolderMedia, resolveSource, resolveWeItem, weIdOf } from "./sources";
import type { ResolvedSource } from "./sources";
import { scanWallpapers } from "./we-scan";
import { MediaServer } from "./we-server";
import { WallpaperLayer } from "./layer";
import { NexusWallpaperSettingTab } from "./settings";
import { StaticSceneRenderer } from "./scene-static";

export default class NexusWallpaperPlugin extends Plugin {
  settings: NexusWallpaperSettings = DEFAULT_SETTINGS;
  private readonly weServer = new MediaServer();
  private readonly staticRenderer = new StaticSceneRenderer();
  private readonly wallpaper = new WallpaperLayer(this.weServer, this.staticRenderer);
  private applyGeneration = 0;
  private rotationTimer: number | null = null;
  private rotationIndex = 0;
  private scanning = false;

  async onload(): Promise<void> {
    this.settings = sanitizeSettings(await this.loadData());
    if (this.settings.weCache.some((item) => item.type === "scene" && !item.scenePkgPath)) {
      this.settings.weCache = scanWallpapers();
      this.settings.weScannedAt = new Date().toISOString();
      await this.saveData(this.settings);
    }

    this.addSettingTab(new NexusWallpaperSettingTab(this.app, this));

    this.addCommand({
      id: "toggle-wallpaper",
      name: "启用/停用壁纸",
      callback: async () => {
        this.settings.enabled = !this.settings.enabled;
        await this.saveSettingsAndApply();
      }
    });
    this.addCommand({
      id: "next-wallpaper",
      name: "轮播：换下一张",
      callback: () => this.advanceRotation()
    });

    this.registerDomEvent(document, "visibilitychange", () => {
      this.wallpaper.handleVisibility(this.settings);
    });
    // Theme switches can change the dark/light auto glass color; re-push the variables.
    this.registerEvent(this.app.workspace.on("css-change", () => this.reapply()));
    this.app.workspace.onLayoutReady(() => {
      this.applyAll();
      // First boot with integration enabled but nothing scanned yet.
      if (this.settings.weEnabled && this.settings.weCache.length === 0) {
        void this.scanWe();
      }
    });
  }

  onunload(): void {
    this.applyGeneration++;
    this.stopRotation();
    this.wallpaper.destroy();
    this.staticRenderer.stop();
    this.weServer.stop();
  }

  async saveSettingsAndApply(): Promise<void> {
    await this.saveData(this.settings);
    this.applyAll();
  }

  /**
   * Scans the local Steam/Wallpaper Engine install and caches the result.
   * Safe to call repeatedly; heavy work is bounded (one registry query plus
   * project.json reads).
   */
  async scanWe(): Promise<number> {
    if (this.scanning) return this.settings.weCache.length;
    this.scanning = true;
    try {
      const items = scanWallpapers();
      this.settings.weCache = items;
      this.settings.weScannedAt = new Date().toISOString();
      await this.saveData(this.settings);
      if (isWeSource(this.settings.source)) await this.applyAll();
      return items.length;
    } finally {
      this.scanning = false;
    }
  }

  /** Re-push CSS variables without rebuilding media (used on css-change). */
  private reapply(): void {
    void this.applyAll();
  }

  private async applyAll(): Promise<void> {
    const generation = ++this.applyGeneration;
    if (!this.settings.enabled) {
      this.stopRotation();
      this.wallpaper.destroy();
      return;
    }
    let source: ResolvedSource | null;
    try { source = await this.currentSource(); }
    catch (error) {
      if (generation === this.applyGeneration) new Notice(`Obsidian Wallpapers: ${String(error)}`);
      return;
    }
    if (generation !== this.applyGeneration) return;
    this.wallpaper.sync(this.settings, source);
    this.scheduleRotation();
  }

  /** Playlist folder wins over the single source; the single source is the fallback. */
  private async currentSource(): Promise<ResolvedSource | null> {
    const folder = this.settings.playlistFolder.trim();
    if (folder) {
      const files = listFolderMedia(this.app, folder);
      if (files.length > 0) {
        const file = files[this.rotationIndex % files.length];
        return resolveSource(this.app, file.path);
      }
    }
    if (isWeSource(this.settings.source)) {
      return resolveWeItem(weIdOf(this.settings.source), this.settings.weCache, this.weServer);
    }
    return resolveSource(this.app, this.settings.source);
  }

  private scheduleRotation(): void {
    this.stopRotation();
    if (!this.settings.playlistFolder.trim()) return;
    const minutes = Math.max(1, Math.round(this.settings.rotationInterval));
    this.rotationTimer = window.setInterval(() => this.advanceRotation(), minutes * 60_000);
  }

  private stopRotation(): void {
    if (this.rotationTimer !== null) {
      window.clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }

  private async advanceRotation(): Promise<void> {
    if (!this.settings.enabled || !this.settings.playlistFolder.trim()) return;
    const files = listFolderMedia(this.app, this.settings.playlistFolder);
    if (files.length === 0) return;
    this.rotationIndex = (this.rotationIndex + 1) % files.length;
    await this.applyAll();
  }

  /** Settings tab entry point for "reset playlist position on folder change". */
  resetRotation(): void {
    this.rotationIndex = 0;
  }
}
