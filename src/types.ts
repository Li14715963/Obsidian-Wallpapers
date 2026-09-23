export type MediaKind = "video" | "image" | "web";
/** "contain-blur" renders contain plus a blurred cover copy behind (WE-style padding). */
export type ObjectFit = "cover" | "contain" | "fill" | "contain-blur";
/** Wallpaper Engine project categories we support (application is skipped at scan time). */
export type WeType = "video" | "web" | "scene";

export interface WeItem {
  /** Stable id used in the we:// source scheme. */
  id: string;
  title: string;
  type: WeType;
  /** Absolute path of the playable file (video) or project html (web). */
  mediaPath: string;
  /** Absolute path of the preview frame (scene fallback; empty for others when absent). */
  previewPath: string;
  /** "W×H" of the preview image (scene quality hint); "" when unknown. */
  previewSize: string;
}

export interface NexusWallpaperSettings {
  /** Master switch: mounts the layer, sets body[data-nwp-wallpaper] and drives the glass skin. */
  enabled: boolean;
  /** Vault-relative media path or http(s) URL. Empty = glass-only mode over the theme canvas. */
  source: string;
  /** Vault folder; when set, its media files rotate and take precedence over `source`. */
  playlistFolder: string;
  /** Rotation interval in minutes. */
  rotationInterval: number;

  objectFit: ObjectFit;
  playbackRate: number;
  flip: boolean;

  /** Dark scrim over the wallpaper, 0-100 percent. */
  scrim: number;
  /** Hairline border strength on glass surfaces, 0-100 percent. */
  borderAlpha: number;
  /** Glass frosted blur radius, 0-60 px. */
  blur: number;
  /**
   * backdrop-filter master switch. Off = static translucent plates instead of
   * frosted blur; on some Chromium builds backdrop-filter breaks native
   * window dragging (-webkit-app-region), so this doubles as the escape hatch.
   */
  glassBlurEnabled: boolean;
  /** Glass transparency slider 0-60 (higher = more transparent), dsh mapping. */
  glassAlpha: number;
  /** Glass base tint hex; empty = auto per dark/light scheme. */
  glassColor: string;

  wallpaperBlur: number;
  wallpaperBrightness: number;
  wallpaperContrast: number;
  wallpaperSaturate: number;

  sidebarGlass: boolean;
  sidebarBlur: number;
  /** Sidebar transparency slider 0-200 (higher = more transparent), dsh mapping. */
  sidebarAlpha: number;
  sidebarColor: string;

  /** Markdown reading plate opacity, 0-100 percent. */
  contentAlpha: number;
  /** Accent hex; empty = keep the theme accent. */
  accent: string;

  pauseOnHidden: boolean;

  /** Wallpaper Engine integration master switch; off = no scanning, v1 behavior. */
  weEnabled: boolean;
  /** Last scan result, persisted to avoid scanning on every boot. */
  weCache: WeItem[];
  weScannedAt: string;
}

export const DEFAULT_SETTINGS: NexusWallpaperSettings = {
  enabled: false,
  source: "",
  playlistFolder: "",
  rotationInterval: 30,

  objectFit: "cover",
  playbackRate: 1,
  flip: false,

  scrim: 25,
  borderAlpha: 35,
  blur: 16,
  glassAlpha: 12,
  glassBlurEnabled: true,
  glassColor: "",

  wallpaperBlur: 0,
  wallpaperBrightness: 100,
  wallpaperContrast: 100,
  wallpaperSaturate: 100,

  sidebarGlass: true,
  sidebarBlur: 16,
  sidebarAlpha: 120,
  sidebarColor: "#ffffff",

  contentAlpha: 40,
  accent: "",

  pauseOnHidden: true,

  weEnabled: false,
  weCache: [],
  weScannedAt: ""
};

function clampNum(value: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(hi, Math.max(lo, n));
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function sanitizeWeCache(value: unknown): WeItem[] {
  if (!Array.isArray(value)) return [];
  const out: WeItem[] = [];
  for (const raw of value) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const type = str(r.type);
    if (type !== "video" && type !== "web" && type !== "scene") continue;
    const id = str(r.id);
    if (!id) continue;
    out.push({
      id,
      title: str(r.title, id),
      type,
      mediaPath: str(r.mediaPath),
      previewPath: str(r.previewPath),
      previewSize: str(r.previewSize)
    });
  }
  return out;
}

export function sanitizeSettings(raw: unknown): NexusWallpaperSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const fit = str(r.objectFit, "cover");
  return {
    enabled: r.enabled === true,
    source: str(r.source),
    playlistFolder: str(r.playlistFolder),
    rotationInterval: clampNum(r.rotationInterval, 1, 480, DEFAULT_SETTINGS.rotationInterval),

    objectFit: fit === "contain" || fit === "fill" || fit === "contain-blur" ? fit : "cover",
    playbackRate: clampNum(r.playbackRate, 0.25, 4, 1),
    flip: r.flip === true,

    scrim: clampNum(r.scrim, 0, 100, DEFAULT_SETTINGS.scrim),
    borderAlpha: clampNum(r.borderAlpha, 0, 100, DEFAULT_SETTINGS.borderAlpha),
    blur: clampNum(r.blur, 0, 60, DEFAULT_SETTINGS.blur),
    glassAlpha: clampNum(r.glassAlpha, 0, 60, DEFAULT_SETTINGS.glassAlpha),
    glassBlurEnabled: r.glassBlurEnabled !== false,
    glassColor: str(r.glassColor),

    wallpaperBlur: clampNum(r.wallpaperBlur, 0, 60, 0),
    wallpaperBrightness: clampNum(r.wallpaperBrightness, 0, 200, 100),
    wallpaperContrast: clampNum(r.wallpaperContrast, 0, 200, 100),
    wallpaperSaturate: clampNum(r.wallpaperSaturate, 0, 200, 100),

    sidebarGlass: r.sidebarGlass !== false,
    sidebarBlur: clampNum(r.sidebarBlur, 0, 60, DEFAULT_SETTINGS.sidebarBlur),
    sidebarAlpha: clampNum(r.sidebarAlpha, 0, 200, DEFAULT_SETTINGS.sidebarAlpha),
    sidebarColor: str(r.sidebarColor, DEFAULT_SETTINGS.sidebarColor),

    contentAlpha: clampNum(r.contentAlpha, 0, 100, DEFAULT_SETTINGS.contentAlpha),
    accent: str(r.accent),

    pauseOnHidden: r.pauseOnHidden !== false,

    weEnabled: r.weEnabled === true,
    weCache: sanitizeWeCache(r.weCache),
    weScannedAt: str(r.weScannedAt)
  };
}
