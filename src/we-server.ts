import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import assets from "scene-assets";
import type { WeItem } from "./types";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".ogv": "video/ogg",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".gif": "image/gif", ".avif": "image/avif", ".bmp": "image/bmp", ".svg": "image/svg+xml",
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};
const LIVE_BASE = "/wallpaper-engine/scene-live";
const SCENE_RE = /^\/scene-files\/([A-Za-z0-9_-]+)\/(.+)$/;
const MEDIA_RE = /^\/media\/([A-Za-z0-9_-]+)$/;
const randomToken = (): string => crypto.randomBytes(24).toString("base64url");

/** Loopback-only service. Every served path is registered with an opaque token. */
export class MediaServer {
  readonly diagnostics: string[] = [];
  private server: http.Server | null = null;
  private port = 0;
  private files = new Map<string, string>();
  private scenes = new Map<string, string>();
  private fileTokens = new Map<string, string>();
  private sceneTokens = new Map<string, string>();
  private generation = 0;
  private starting: Promise<number> | null = null;
  private readonly html = assets.html.replace("</body>", `<script>${sceneBridge}</script></body>`);

  private ensure(): Promise<number> {
    if (this.server && this.port) return Promise.resolve(this.port);
    if (!this.starting) {
      const generation = this.generation;
      this.starting = new Promise<number>((resolve, reject) => {
        const server = http.createServer((req, res) => this.handle(req, res));
        server.once("error", (err) => { this.starting = null; reject(err); });
        server.listen(0, "127.0.0.1", () => {
          if (generation !== this.generation) { server.close(); reject(new Error("媒体服务已停止")); return; }
          this.port = (server.address() as { port: number }).port;
          this.server = server; this.starting = null; resolve(this.port);
        });
      });
    }
    return this.starting;
  }

  async urlFor(absPath: string): Promise<string | null> {
    if (!absPath || !path.isAbsolute(absPath)) return null;
    let real: string;
    try { real = fs.realpathSync(absPath); if (!fs.statSync(real).isFile()) return null; }
    catch { return null; }
    const port = await this.ensure();
    const token = this.fileTokens.get(real) ?? randomToken();
    this.files.set(token, real);
    this.fileTokens.set(real, token);
    return `http://127.0.0.1:${port}/media/${token}`;
  }

  async sceneUrlFor(item: WeItem): Promise<string | null> {
    if (!item.scenePkgPath || !path.isAbsolute(item.scenePkgPath)) return null;
    let root: string;
    try {
      const pkg = fs.realpathSync(item.scenePkgPath);
      if (!fs.statSync(pkg).isFile() || path.extname(pkg).toLowerCase() !== ".pkg") return null;
      root = fs.realpathSync(path.dirname(pkg));
      if (path.basename(root).toLowerCase() === "scenes") root = fs.realpathSync(path.dirname(root));
      if (!fs.existsSync(path.join(root, "project.json"))) return null;
    } catch { return null; }
    const port = await this.ensure();
    const token = this.sceneTokens.get(root) ?? randomToken();
    this.scenes.set(token, root);
    this.sceneTokens.set(root, token);
    const query = new URLSearchParams({ type: "scene", src: token,
      mediaBase: `http://127.0.0.1:${port}/scene-files`, muted: "true" });
    return `http://127.0.0.1:${port}${LIVE_BASE}/index.html?${query}`;
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
    const pathname = (req.url || "").split("?", 1)[0];
    if (pathname === "/diag") {
      const msg = new URL(req.url || "", `http://127.0.0.1:${this.port}`).searchParams.get("msg");
      if (msg) this.diagnostics.push(msg.slice(0, 500));
      if (this.diagnostics.length > 100) this.diagnostics.shift();
      res.writeHead(204).end(); return;
    }
    if (pathname === `${LIVE_BASE}/index.html`) return this.sendText(req, res, this.html, "text/html; charset=utf-8");
    if (pathname === `${LIVE_BASE}/assets/renderer-BlHxh0Fx.js`) return this.sendText(req, res, assets.renderer, "text/javascript; charset=utf-8");
    if (pathname === `${LIVE_BASE}/assets/modulepreload-polyfill-B5Qt9EMX.js`) return this.sendText(req, res, assets.polyfill, "text/javascript; charset=utf-8");
    const media = MEDIA_RE.exec(pathname);
    if (media) return this.sendFile(req, res, this.files.get(media[1]));
    const scene = SCENE_RE.exec(pathname);
    if (scene) {
      const root = this.scenes.get(scene[1]);
      if (!root) { res.writeHead(404).end(); return; }
      let rel: string;
      try { rel = decodeURIComponent(scene[2]).replace(/\\/g, "/"); }
      catch { res.writeHead(400).end(); return; }
      if (rel.startsWith("/") || rel.split("/").some((part) => part === ".." || part === "." || part === "" || part.includes(":"))) {
        res.writeHead(403).end(); return;
      }
      const candidate = path.resolve(root, rel);
      let real: string;
      try { real = fs.realpathSync(candidate); }
      catch { res.writeHead(404).end(); return; }
      if (!real.toLowerCase().startsWith((root + path.sep).toLowerCase())) { res.writeHead(403).end(); return; }
      return this.sendFile(req, res, real);
    }
    res.writeHead(404).end();
  }

  private sendText(req: http.IncomingMessage, res: http.ServerResponse, body: string, type: string): void {
    const data = Buffer.from(body, "utf8");
    res.writeHead(200, { "Content-Type": type, "Content-Length": data.length,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(req.method === "HEAD" ? undefined : data);
  }

  private sendFile(req: http.IncomingMessage, res: http.ServerResponse, filePath?: string): void {
    if (!filePath) { res.writeHead(404).end(); return; }
    let size: number;
    try { const stat = fs.statSync(filePath); if (!stat.isFile()) throw new Error(); size = stat.size; }
    catch { res.writeHead(404).end(); return; }
    let start = 0, end = size - 1, code = 200;
    const range = req.headers.range;
    if (range) {
      const match = typeof range === "string" ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
      if (!match || (!match[1] && !match[2])) { res.writeHead(416, { "Content-Range": `bytes */${size}` }).end(); return; }
      if (!match[1]) {
        const suffix = Number(match[2]);
        if (!Number.isSafeInteger(suffix) || suffix < 1) { res.writeHead(416, { "Content-Range": `bytes */${size}` }).end(); return; }
        start = Math.max(0, size - suffix);
      } else { start = Number(match[1]); if (match[2]) end = Number(match[2]); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start || size === 0) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` }).end(); return;
      }
      end = Math.min(end, size - 1); code = 206;
    }
    const headers: Record<string, string | number> = {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": code === 206 ? end - start + 1 : size,
      "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"
    };
    if (code === 206) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    res.writeHead(code, headers);
    if (req.method === "HEAD") { res.end(); return; }
    const stream = fs.createReadStream(filePath, code === 206 ? { start, end } : undefined);
    res.once("close", () => stream.destroy());
    stream.once("error", () => res.destroy());
    stream.pipe(res);
  }

  stop(): void {
    this.generation++;
    this.server?.closeAllConnections(); this.server?.close();
    this.server = null; this.port = 0; this.starting = null;
    this.files.clear(); this.scenes.clear();
    this.fileTokens.clear(); this.sceneTokens.clear();
  }
}

/** Runs in the isolated loopback renderer page, never in the Obsidian origin. */
const sceneBridge = `
(() => {
  const params = new URLSearchParams(location.search);
  const id = params.get('bridge'), parentOrigin = params.get('parentOrigin');
  const send = (type, detail) => parent.postMessage({ nwpScene: id, type, detail }, parentOrigin);
  window.addEventListener('message', (event) => {
    if (event.source !== parent || event.origin !== parentOrigin || event.data?.nwpScene !== id) return;
    const wp = window.__wp;
    if (!wp) return;
    const { command, value } = event.data;
    if (command === 'pause') wp.pause();
    if (command === 'resume') wp.resume();
    if (command === 'fit') wp.setFit(value);
    if (command === 'fps') wp.setSceneFps(value);
    if (command === 'pointer') wp.pushPointer(value.x, value.y, 0, 0);
  });
  let ready = false, silenceApplied = false, lastRunning = performance.now();
  send('boot', { origin: location.origin });
  const timer = setInterval(() => {
    if (!silenceApplied && window.__wp) { window.__wp.setVolume(0); silenceApplied = true; }
    const stats = window.__wpStats?.frame();
    const paused = window.__wp?.getState()?.paused;
    if (paused || document.hidden) { lastRunning = performance.now(); return; }
    if (!ready) send('trace', { stats, wp: !!window.__wp, canvas: !!document.querySelector('canvas') });
    if (stats?.running && stats.fps > 0) {
      lastRunning = performance.now();
      if (!ready) {
        const projection = window.__scene?.general?.orthogonalprojection;
        ready = true; send('ready', { ...stats, aspect: projection?.width / projection?.height });
      }
    }
    if (ready && performance.now() - lastRunning > 20000) { send('stalled', stats); lastRunning = performance.now(); }
  }, 500);
  window.addEventListener('pagehide', () => clearInterval(timer));
  window.addEventListener('error', e => send('error', e.message));
  window.addEventListener('unhandledrejection', e => send('error', String(e.reason)));
})();`;
