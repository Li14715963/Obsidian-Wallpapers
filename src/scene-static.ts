import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { execFile, type ChildProcess } from "child_process";
import assets from "scene-assets";
import type { WeItem } from "./types";

const RENDERER_VERSION = `dsh-6ba2faea-${crypto.createHash("sha256").update(assets.cpu).digest("hex").slice(0, 16)}`;
const CACHE_LIMIT = 500 * 1024 * 1024;

/** CPU scene rendering occurs only in an external Node process. */
export class StaticSceneRenderer {
  private child: ChildProcess | null = null;
  private cacheDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "Obsidian-Wallpapers", "scene-cache");
  private runnerPath = path.join(this.cacheDir, `runner-${RENDERER_VERSION}.cjs`);

  async render(item: WeItem, signal: AbortSignal): Promise<string> {
    if (!item.scenePkgPath) throw new Error("未找到 scene.pkg，请重新扫描壁纸");
    const node = this.findNode();
    if (!node) throw new Error("未找到 Node.js；静态场景需要 Node.js 22 或更新版本");
    const pkg = fs.statSync(item.scenePkgPath);
    const project = fs.statSync(path.join(
      path.basename(path.dirname(item.scenePkgPath)).toLowerCase() === "scenes"
        ? path.dirname(path.dirname(item.scenePkgPath)) : path.dirname(item.scenePkgPath), "project.json"));
    const width = Math.min(2560, Math.max(1280, Math.round(window.innerWidth * devicePixelRatio)));
    const height = Math.min(2160, Math.max(720, Math.round(window.innerHeight * devicePixelRatio)));
    const hash = crypto.createHash("sha256").update(JSON.stringify([
      item.scenePkgPath, pkg.size, pkg.mtimeMs, project.mtimeMs, RENDERER_VERSION, width, height
    ])).digest("hex");
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const output = path.join(this.cacheDir, `${hash}.png`);
    if (fs.existsSync(output) && fs.statSync(output).size > 4096) return output;
    if (signal.aborted) throw new Error("已取消");
    if (!fs.existsSync(this.runnerPath) || fs.readFileSync(this.runnerPath, "utf8") !== assets.cpu) {
      fs.writeFileSync(this.runnerPath, assets.cpu, "utf8");
    }
    const tmp = `${output}.${crypto.randomBytes(5).toString("hex")}.tmp`;
    const weAssetsDir = this.findWeAssets(item.scenePkgPath);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const child = execFile(node, [this.runnerPath, item.scenePkgPath, tmp, String(width), String(height), weAssetsDir],
        { windowsHide: true, timeout: 180000, maxBuffer: 1024 * 1024 }, (error, _stdout, stderr) => {
          signal.removeEventListener("abort", abort);
          if (this.child === child) this.child = null;
          if (signal.aborted && fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
          if (settled) return;
          settled = true;
          if (error) reject(new Error((stderr || error.message).slice(0, 500)));
          else resolve();
        });
      this.child = child;
      const abort = (): void => {
        child.kill();
        signal.removeEventListener("abort", abort);
        if (!settled) { settled = true; reject(new Error("已取消")); }
    };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    }).catch((error) => { if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true }); throw error; });
    // The runner writes the complete file before exit. Rename only after successful exit.
    if (!fs.existsSync(tmp) || fs.statSync(tmp).size <= 4096) throw new Error("静态渲染输出为空");
    fs.renameSync(tmp, output);
    this.prune();
    return output;
  }

  stop(): void { this.child?.kill(); this.child = null; }

  private findNode(): string | null {
    const candidates = [process.env.NWP_NODE_PATH,
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, "nodejs", "node.exe"),
      process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "nodejs", "node.exe")];
    return candidates.find((p): p is string => !!p && fs.existsSync(p)) ?? null;
  }

  private findWeAssets(pkg: string): string {
    let dir = path.dirname(pkg);
    for (let i = 0; i < 9; i++, dir = path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, "assets", "materials"))) return dir;
    }
    const libMarker = `${path.sep}steamapps${path.sep}`;
    const index = pkg.toLowerCase().indexOf(libMarker);
    if (index >= 0) {
      const install = path.join(pkg.slice(0, index), "steamapps", "common", "wallpaper_engine");
      if (fs.existsSync(path.join(install, "assets"))) return install;
    }
    return "";
  }

  private prune(): void {
    const files = fs.readdirSync(this.cacheDir).filter((n) => n.endsWith(".png"))
      .map((n) => { const p = path.join(this.cacheDir, n); return { p, ...fs.statSync(p) }; })
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
    let size = files.reduce((sum, f) => sum + f.size, 0);
    for (const file of files) {
      if (size <= CACHE_LIMIT) break;
      fs.rmSync(file.p, { force: true }); size -= file.size;
    }
  }
}
