import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { WeItem, WeType } from "./types";

const WE_APPID = "431960";
const VIDEO_EXTS = new Set([".mp4", ".webm", ".m4v", ".ogv"]);
const COMMON_STEAM_ROOTS = [
  "C:\\Program Files (x86)\\Steam",
  "C:\\Program Files\\Steam",
  "D:\\Steam",
  "D:\\SteamLibrary",
  "E:\\Steam",
  "E:\\SteamLibrary"
];

/**
 * Discovery flow mirrors dsh-wallpaper-engine's host (lib/index.js), reduced
 * to read-only filesystem + one registry query:
 * Steam roots (registry + common paths) -> libraryfolders.vdf libraries ->
 * WE install (wallpaper32.exe) -> workshop/myprojects project.json files.
 * defaultprojects (WE's bundled samples) is intentionally excluded — the WE
 * app itself does not list them under "installed" either.
 */
export function scanWallpapers(): WeItem[] {
  const libraries = discoverLibraries();
  const items: WeItem[] = [];
  const install = findWeInstall(libraries);
  for (const lib of libraries) {
    collectWorkshop(path.join(lib, "steamapps", "workshop", "content", WE_APPID), items);
  }
  if (install) {
    collectProjects(path.join(install, "projects", "myprojects"), items, "my-");
  }
  items.sort((a, b) => {
    const rank = (t: WeType): number => (t === "video" ? 0 : t === "web" ? 1 : 2);
    return rank(a.type) - rank(b.type) || a.title.localeCompare(b.title);
  });
  return items;
}

function discoverLibraries(): string[] {
  const roots = [...COMMON_STEAM_ROOTS];
  try {
    const out = execSync("reg query HKCU\\Software\\Valve\\Steam /v SteamPath", {
      encoding: "utf8",
      windowsHide: true,
      timeout: 4000
    });
    const match = /REG_SZ\s+(.+)/.exec(out);
    if (match) roots.push(match[1].trim());
  } catch {
    // Registry unreadable (or reg.exe missing) — common paths still cover most installs.
  }
  // Windows paths are case-insensitive and separators vary (registry reports
  // forward slashes) — dedupe case-insensitively or every library is scanned twice.
  const seen = new Set<string>();
  const libraries: string[] = [];
  for (const rootRaw of roots) {
    // The registry reports forward slashes and sometimes lowercase; Windows
    // treats all variants as the same directory, so dedupe on a normalized key.
    const root = rootRaw.replace(/\//g, "\\");
    if (!isDir(root)) continue;
    const key = root.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    libraries.push(root);
    const vdf = path.join(root, "steamapps", "libraryfolders.vdf");
    try {
      const content = fs.readFileSync(vdf, "utf8");
      for (const match of content.matchAll(/"path"\s*"([^"]+)"/g)) {
        const lib = match[1].replace(/\\\\/g, "\\").replace(/\//g, "\\");
        if (isDir(lib) && !seen.has(lib.toLowerCase())) {
          seen.add(lib.toLowerCase());
          libraries.push(lib);
        }
      }
    } catch {
      // No vdf in this root — the root itself may still be a library.
    }
  }
  return libraries;
}

function findWeInstall(libraries: string[]): string | null {
  for (const lib of libraries) {
    const install = path.join(lib, "steamapps", "common", "wallpaper_engine");
    if (fs.existsSync(path.join(install, "wallpaper32.exe"))) return install;
    if (isDir(install)) return install;
  }
  return null;
}

function collectWorkshop(workshopRoot: string, items: WeItem[]): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(workshopRoot, { withFileTypes: true }).map((e) => e.name);
  } catch {
    return;
  }
  for (const entry of entries) {
    const dir = path.join(workshopRoot, entry);
    readProject(dir, items, entry);
  }
}

function collectProjects(projectsRoot: string, items: WeItem[], prefix: string): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(projectsRoot, { withFileTypes: true }).map((e) => e.name);
  } catch {
    return;
  }
  for (const entry of entries) {
    const dir = path.join(projectsRoot, entry);
    if (!fs.statSync(dir).isDirectory()) continue;
    readProject(dir, items, prefix + entry);
  }
}

function readProject(dir: string, items: WeItem[], id: string): void {
  const jsonPath = path.join(dir, "project.json");
  if (!fs.existsSync(jsonPath)) return;
  let raw = "";
  try {
    raw = fs.readFileSync(jsonPath, "utf8");
  } catch {
    return;
  }
  let project: Record<string, unknown>;
  try {
    project = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return;
  }
  const type = classify(project, dir);
  if (!type) return;

  const file = typeof project.file === "string" ? project.file : "";
  let mediaPath = file ? projectFile(dir, file) : "";
  if (type === "video" && (!mediaPath || !fs.existsSync(mediaPath))) {
    mediaPath = findFirst(dir, VIDEO_EXTS);
  }
  if (type !== "scene" && !mediaPath) return;
  const scenePkgPath = type === "scene"
    ? ["scene.pkg", "scenes/scene.pkg", "gifscene.pkg"].map((p) => projectFile(dir, p))
        .find((p) => !!p) ?? ""
    : "";

  const previewName = typeof project.preview === "string" ? project.preview : "";
  let previewPath = previewName ? projectFile(dir, previewName) : "";
  if (!previewPath || !fs.existsSync(previewPath)) {
    previewPath = findFirst(dir, new Set([".jpg", ".jpeg", ".png", ".gif"]));
  }

  items.push({
    id,
    title: typeof project.title === "string" && project.title.trim() ? project.title : id,
    type,
    mediaPath,
    scenePkgPath,
    previewPath,
    previewSize: previewPath ? imageDimensions(previewPath) : ""
  });
}

/** Workshop previews are square thumbnails (192-1024 px); surface the size so
 * users can tell scene quality apart before picking. Handles GIF/PNG/JPEG headers. */
function imageDimensions(p: string): string {
  try {
    const buf = fs.readFileSync(p);
    if (buf.length > 10 && buf.toString("latin1", 0, 3) === "GIF") {
      return `${buf.readUInt16LE(6)}×${buf.readUInt16LE(8)}`;
    }
    if (buf.length > 24 && buf.toString("latin1", 1, 4) === "PNG") {
      return `${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)}`;
    }
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let off = 2;
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) {
          off++;
          continue;
        }
        const marker = buf[off + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return `${buf.readUInt16BE(off + 7)}×${buf.readUInt16BE(off + 5)}`;
        }
        off += 2 + buf.readUInt16BE(off + 2);
      }
    }
  } catch {
    return "";
  }
  return "";
}

function classify(project: Record<string, unknown>, dir: string): WeType | null {
  const declared = typeof project.type === "string" ? project.type.toLowerCase() : "";
  if (declared === "application") return null;
  if (declared === "video" || declared === "web" || declared === "scene") return declared;
  const file = typeof project.file === "string" ? project.file.toLowerCase() : "";
  if (file.endsWith(".html") || file.endsWith(".htm")) return "web";
  if (file.endsWith(".pkg")) return "scene";
  if (VIDEO_EXTS.has(path.extname(file))) return "video";
  // No usable declaration: inspect the directory (one level).
  try {
    for (const entry of fs.readdirSync(dir)) {
      const ext = path.extname(entry).toLowerCase();
      if (VIDEO_EXTS.has(ext)) return "video";
      if (ext === ".pkg") return "scene";
    }
  } catch {
    return null;
  }
  return null;
}

function findFirst(dir: string, exts: Set<string>): string {
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (exts.has(path.extname(entry).toLowerCase())) {
        const file = projectFile(dir, entry);
        if (file) return file;
      }
    }
  } catch {
    return "";
  }
  return "";
}

/** Project metadata cannot register files outside its own directory, including symlinks. */
function projectFile(dir: string, name: string): string {
  if (!name || path.isAbsolute(name) || name.includes(":")) return "";
  try {
    const root = fs.realpathSync(dir);
    const real = fs.realpathSync(path.resolve(root, name));
    return real.toLowerCase().startsWith((root + path.sep).toLowerCase()) && fs.statSync(real).isFile() ? real : "";
  } catch { return ""; }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
