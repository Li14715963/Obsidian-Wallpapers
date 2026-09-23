import { App, TFile, TFolder } from "obsidian";
import type { MediaKind, WeItem } from "./types";

const VIDEO_EXTS = new Set(["mp4", "webm", "m4v", "ogv"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg"]);

export interface ResolvedSource {
  /** Identity of the rendered media; a changed key rebuilds the media element. */
  key: string;
  url: string;
  kind: MediaKind;
  label: string;
}

export interface MediaUrlProvider {
  /** Registers an absolute path and returns its loopback media URL. */
  urlFor(absPath: string): Promise<string | null>;
}

export const WE_SCHEME = "we://";

export function isWeSource(ref: string): boolean {
  return ref.trim().startsWith(WE_SCHEME);
}

export function weIdOf(ref: string): string {
  return ref.trim().slice(WE_SCHEME.length);
}

/**
 * Resolves a Wallpaper Engine item to a playable source: video via its media
 * file, scene as a static preview frame, web as a project html (best-effort:
 * wallpapers relying on relative local assets may render partially).
 */
export async function resolveWeItem(id: string, cache: WeItem[], urls: MediaUrlProvider): Promise<ResolvedSource | null> {
  const item = cache.find((i) => i.id === id);
  if (!item) return null;
  if (item.type === "scene") {
    const url = await urls.urlFor(item.previewPath);
    return url ? { key: `we-scene\u0000${item.id}\u0000${item.previewPath}`, url, kind: "image", label: `${item.title}（预览帧）` } : null;
  }
  const url = await urls.urlFor(item.mediaPath);
  if (!url) return null;
  const kind: MediaKind = item.type === "web" ? "web" : "video";
  return { key: `we-${item.type}\u0000${item.id}\u0000${item.mediaPath}`, url, kind, label: item.title };
}

export function isRemoteUrl(ref: string): boolean {
  return /^https?:\/\//i.test(ref.trim());
}

export function isMediaExtension(ext: string): boolean {
  return VIDEO_EXTS.has(ext) || IMAGE_EXTS.has(ext);
}

export function extOf(ref: string): string {
  let p = ref.trim();
  const hash = p.indexOf("#");
  if (hash >= 0) p = p.slice(0, hash);
  const query = p.indexOf("?");
  if (query >= 0) p = p.slice(0, query);
  const dot = p.lastIndexOf(".");
  const slash = p.lastIndexOf("/");
  if (dot < 0 || dot < slash) return "";
  return p.slice(dot + 1).toLowerCase();
}

/** Extension-based kind guess; URLs without a known extension fall back to video. */
export function mediaKindOf(ref: string): MediaKind {
  const ext = extOf(ref);
  if (IMAGE_EXTS.has(ext)) return "image";
  return "video";
}

export function listVaultMedia(app: App): TFile[] {
  return app.vault
    .getFiles()
    .filter((f) => isMediaExtension(f.extension))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function listFolderMedia(app: App, folderPath: string): TFile[] {
  const normalized = folderPath.trim().replace(/\/+$/, "");
  if (!normalized) return [];
  const root = app.vault.getAbstractFileByPath(normalized);
  if (!(root instanceof TFolder)) return [];
  const out: TFile[] = [];
  const walk = (folder: TFolder): void => {
    for (const child of folder.children) {
      if (child instanceof TFolder) walk(child);
      else if (child instanceof TFile && isMediaExtension(child.extension)) out.push(child);
    }
  };
  walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function resolveSource(app: App, ref: string): ResolvedSource | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  if (isRemoteUrl(trimmed)) {
    const kind = mediaKindOf(trimmed);
    return { key: `${kind}\u0000${trimmed}`, url: trimmed, kind, label: trimmed };
  }
  const file = app.vault.getAbstractFileByPath(trimmed);
  if (!(file instanceof TFile) || !isMediaExtension(file.extension)) return null;
  const kind: MediaKind = VIDEO_EXTS.has(file.extension) ? "video" : "image";
  return {
    key: `${kind}\u0000${file.path}`,
    url: app.vault.getResourcePath(file),
    kind,
    label: file.path
  };
}
