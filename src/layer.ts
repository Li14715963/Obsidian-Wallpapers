import { Notice } from "obsidian";
import type { NexusWallpaperSettings } from "./types";
import type { ResolvedSource } from "./sources";

export const LAYER_ID = "nexus-wallpaper-layer";
export const SCRIM_ID = "nexus-wallpaper-scrim";
export const ACTIVE_ATTR = "data-nwp-wallpaper";
export const SIDEBAR_ATTR = "data-nwp-sidebar-glass";
export const BLUR_ATTR = "data-nwp-glass-blur";

const GLASS_VARS = [
  "--nwp-scrim-color",
  "--nwp-border-alpha",
  "--nwp-blur",
  "--nwp-saturate",
  "--nwp-glass-brightness",
  "--nwp-glass-color",
  "--nwp-glass-alpha",
  "--nwp-wallpaper-blur",
  "--nwp-media-filter",
  "--nwp-wallpaper-transform",
  "--nwp-object-fit",
  "--nwp-accent",
  "--nwp-sidebar-blur",
  "--nwp-sidebar-saturate",
  "--nwp-sidebar-alpha",
  "--nwp-sidebar-sheen",
  "--nwp-sidebar-color",
  "--nwp-sidebar-tint",
  "--nwp-content-alpha",
  "--nwp-content-plate"
] as const;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Port of dsh-wallpaper-engine's client layer model: a fixed media layer at
 * z-index -2 plus a scrim at z-index -1, both direct children of <body>, with
 * every knob pushed into --nwp-* custom properties on <body>. The glass skin
 * itself lives in styles.css, gated on body[data-nwp-wallpaper].
 */
export class WallpaperLayer {
  private layer: HTMLDivElement | null = null;
  private scrim: HTMLDivElement | null = null;
  /** The mounted element: a media element, or a wrapper with backdrop+front for contain-blur. */
  private media: HTMLElement | null = null;
  private mediaKey = "";
  private errorReportedFor = "";

  sync(settings: NexusWallpaperSettings, source: ResolvedSource | null): void {
    if (!source) {
      this.releaseMedia();
      this.removeLayers();
    } else {
      this.mountMedia(source, settings);
    }
    this.applyEffects(settings);
  }

  handleVisibility(settings: NexusWallpaperSettings): void {
    if (!settings.pauseOnHidden) return;
    for (const video of this.mediaVideos()) {
      if (document.hidden) {
        video.pause();
      } else {
        void video.play().catch(() => {});
      }
    }
  }

  destroy(): void {
    this.releaseMedia();
    this.removeLayers();
    const style = document.body.style;
    for (const name of GLASS_VARS) style.removeProperty(name);
    document.body.removeAttribute(ACTIVE_ATTR);
    document.body.removeAttribute(SIDEBAR_ATTR);
    document.body.removeAttribute(BLUR_ATTR);
  }

  private mountMedia(source: ResolvedSource, settings: NexusWallpaperSettings): void {
    if (!this.layer) {
      this.layer = document.createElement("div");
      this.layer.id = LAYER_ID;
      document.body.appendChild(this.layer);
    }
    // The DOM structure depends on the fit mode (contain-blur wraps two media
    // elements), so the key must cover it or switching modes leaks the wrapper.
    const structureKey = `${source.key}\u0000${
      source.kind !== "web" && settings.objectFit === "contain-blur" ? "pad" : "plain"
    }`;
    if (this.mediaKey !== structureKey) {
      this.releaseMedia();
      this.media = this.buildMedia(source, settings);
      this.layer.appendChild(this.media);
      this.mediaKey = structureKey;
    }
    const videos = this.mediaVideos();
    for (const video of videos) video.playbackRate = clamp(settings.playbackRate, 0.25, 4);
    if (videos.length > 0 && (!settings.pauseOnHidden || !document.hidden)) {
      for (const video of videos) void video.play().catch(() => {});
    }
  }

  /** Every <video> in the mounted media (one for plain modes, two for contain-blur). */
  private mediaVideos(): HTMLVideoElement[] {
    if (!this.media) return [];
    if (this.media instanceof HTMLVideoElement) return [this.media];
    return Array.from(this.media.querySelectorAll("video"));
  }

  private buildMedia(source: ResolvedSource, settings: NexusWallpaperSettings): HTMLElement {
    if (source.kind !== "web" && settings.objectFit === "contain-blur") {
      const wrapper = document.createElement("div");
      wrapper.className = "nwp-fill";
      wrapper.appendChild(this.buildBackdrop(source));
      wrapper.appendChild(this.buildFront(source));
      return wrapper;
    }
    return this.buildFront(source);
  }

  /** Blurred cover copy behind the letterboxed front (WE-style ratio padding). */
  private buildBackdrop(source: ResolvedSource): HTMLElement {
    if (source.kind === "video") {
      const video = document.createElement("video");
      video.className = "nwp-fill-backdrop";
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = source.url;
      void video.play().catch(() => {});
      return video;
    }
    const img = document.createElement("img");
    img.className = "nwp-fill-backdrop";
    img.decoding = "async";
    img.alt = "";
    img.src = source.url;
    return img;
  }

  private buildFront(source: ResolvedSource): HTMLVideoElement | HTMLImageElement | HTMLIFrameElement {
    const reportError = (): void => {
      if (this.errorReportedFor === source.key) return;
      this.errorReportedFor = source.key;
      new Notice(`Obsidian Wallpapers: 壁纸加载失败（${source.label}）`);
    };

    if (source.kind === "web") {
      const iframe = document.createElement("iframe");
      iframe.className = "nwp-media nwp-media--web";
      // Opaque origin, scripts only — web wallpapers must not reach host APIs.
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.setAttribute("scrolling", "no");
      iframe.setAttribute("tabindex", "-1");
      iframe.addEventListener("error", reportError);
      iframe.src = source.url;
      return iframe;
    }

    if (source.kind === "video") {
      const video = document.createElement("video");
      video.className = "nwp-media nwp-media--video";
      video.loop = true;
      // Muted must be set before the source for the autoplay policy to allow playback.
      video.muted = true;
      video.defaultMuted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "auto";
      video.setAttribute("disablepictureinpicture", "");
      // Respect the OS reduced-motion preference: show the first frame, don't play.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        video.autoplay = false;
        video.addEventListener("loadeddata", () => video.pause(), { once: true });
      }
      video.addEventListener("error", reportError);
      video.src = source.url;
      return video;
    }

    const img = document.createElement("img");
    img.className = "nwp-media nwp-media--image";
    img.decoding = "async";
    img.draggable = false;
    img.alt = "";
    img.addEventListener("error", reportError);
    img.src = source.url;
    return img;
  }

  /** A playing <video> is a GC root: always pause, drop the source and force a load before removal. */
  private releaseMedia(): void {
    const media = this.media;
    this.media = null;
    this.mediaKey = "";
    for (const video of this.collectVideos(media)) {
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        // Detached media elements can throw on load(); removal below still releases the decoder.
      }
    }
    const iframe = media instanceof HTMLIFrameElement ? media : null;
    if (iframe) {
      try {
        iframe.contentWindow?.location.replace("about:blank");
      } catch {
        // Cross-origin (sandboxed) frame — removal below is enough.
      }
    }
    media?.remove();
  }

  private collectVideos(media: HTMLElement | null): HTMLVideoElement[] {
    if (!media) return [];
    if (media instanceof HTMLVideoElement) return [media];
    return Array.from(media.querySelectorAll("video"));
  }

  private removeLayers(): void {
    this.layer?.remove();
    this.layer = null;
    this.scrim?.remove();
    this.scrim = null;
  }

  /**
   * Port of dsh-wallpaper-engine applyEffects(): the single mapping from
   * settings to CSS custom properties. Identity values stay "none"/unset so
   * the compositor does not keep permanent filter layers alive.
   */
  private applyEffects(s: NexusWallpaperSettings): void {
    const body = document.body;
    const style = body.style;

    style.setProperty("--nwp-scrim-color", `rgba(0, 0, 0, ${clamp(s.scrim, 0, 100) / 100})`);
    style.setProperty("--nwp-border-alpha", String(clamp(s.borderAlpha, 0, 100) / 100));

    const blur = clamp(s.blur, 0, 60);
    style.setProperty("--nwp-blur", `${blur}px`);
    style.setProperty("--nwp-saturate", String(1.15 + blur * 0.028));
    style.setProperty("--nwp-glass-brightness", "1.04");

    const dark = !body.hasClass("theme-light");
    style.setProperty("--nwp-glass-color", s.glassColor.trim() || (dark ? "#0d1524" : "#ffffff"));
    style.setProperty(
      "--nwp-glass-alpha",
      String(Math.max(0.03, 0.25 - (clamp(s.glassAlpha, 0, 60) / 60) * 0.22))
    );

    const wallpaperBlur = clamp(s.wallpaperBlur, 0, 60);
    style.setProperty("--nwp-wallpaper-blur", `${wallpaperBlur}px`);
    const filterUntouched =
      wallpaperBlur === 0 &&
      s.wallpaperBrightness === 100 &&
      s.wallpaperContrast === 100 &&
      s.wallpaperSaturate === 100;
    style.setProperty(
      "--nwp-media-filter",
      filterUntouched
        ? "none"
        : `blur(${wallpaperBlur}px) brightness(${clamp(s.wallpaperBrightness, 0, 200) / 100}) ` +
            `contrast(${clamp(s.wallpaperContrast, 0, 200) / 100}) saturate(${clamp(s.wallpaperSaturate, 0, 200) / 100})`
    );
    style.setProperty("--nwp-wallpaper-transform", composeTransform(wallpaperBlur, s.flip));
    style.setProperty("--nwp-object-fit", s.objectFit === "contain-blur" ? "contain" : s.objectFit);
    style.setProperty("--nwp-accent", s.accent.trim() || "var(--interactive-accent, #7c9cff)");

    const sidebarBlur = clamp(s.sidebarBlur, 0, 60);
    style.setProperty("--nwp-sidebar-blur", `${sidebarBlur}px`);
    style.setProperty("--nwp-sidebar-saturate", String(1.15 + sidebarBlur * 0.028));
    const sidebarAlpha = clamp(s.sidebarAlpha, 0, 200);
    const alpha = Math.max(0.015, 0.32 - (sidebarAlpha / 200) * 0.305);
    style.setProperty("--nwp-sidebar-alpha", String(alpha));
    style.setProperty("--nwp-sidebar-sheen", String(Math.min(1, alpha / 0.2236)));
    style.setProperty("--nwp-sidebar-color", s.sidebarColor.trim() || "#ffffff");
    style.setProperty("--nwp-sidebar-tint", `${20 + ((200 - sidebarAlpha) / 200) * 28}%`);

    style.setProperty("--nwp-content-alpha", `${clamp(s.contentAlpha, 0, 100)}%`);
    // Without blur, thin plates get unreadable — raise the no-blur floor.
    style.setProperty("--nwp-content-plate", `${Math.max(clamp(s.contentAlpha, 0, 100), 72)}%`);

    body.setAttribute(ACTIVE_ATTR, "on");
    if (s.sidebarGlass) body.setAttribute(SIDEBAR_ATTR, "on");
    else body.removeAttribute(SIDEBAR_ATTR);
    if (s.glassBlurEnabled) body.setAttribute(BLUR_ATTR, "on");
    else body.setAttribute(BLUR_ATTR, "off");

    if (!this.scrim) {
      this.scrim = document.createElement("div");
      this.scrim.id = SCRIM_ID;
      document.body.appendChild(this.scrim);
    }
    // Inline value as well as the variable: keeps the compositor path immediate.
    this.scrim.style.background = `rgba(0, 0, 0, ${clamp(s.scrim, 0, 100) / 100})`;
  }
}

/** Blur needs a slight upscale to hide the frosted edge fringe; identity stays "none". */
function composeTransform(wallpaperBlur: number, flip: boolean): string {
  const scale = 1 + wallpaperBlur * 0.006;
  const parts: string[] = [];
  if (scale !== 1) parts.push(`scale(${scale})`);
  if (flip) parts.push("scaleX(-1)");
  return parts.length > 0 ? parts.join(" ") : "none";
}
