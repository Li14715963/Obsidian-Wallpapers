import http from "http";
import fs from "fs";
import path from "path";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8"
};

const TOKEN_RE = /^\/media\/([A-Za-z0-9_-]+)$/;

/**
 * Loopback-only media server for files outside the vault (Wallpaper Engine
 * media): the app:// page cannot load file:/// subresources, so we serve
 * registered absolute paths over 127.0.0.1 with byte-range support (required
 * for video seeking). Only tokens registered via urlFor() resolve — arbitrary
 * forged tokens get a 404, so nothing beyond WE media is reachable.
 */
export class MediaServer {
  private server: http.Server | null = null;
  private port = 0;
  private tokens = new Map<string, string>();
  private starting: Promise<number> | null = null;

  /**
   * listen() binds asynchronously — server.address() is null until the
   * "listening" event, so startup is promise-based and deduplicated.
   */
  private ensure(): Promise<number> {
    if (this.server && this.port) return Promise.resolve(this.port);
    if (!this.starting) {
      this.starting = new Promise<number>((resolve, reject) => {
        const server = http.createServer((req, res) => this.handle(req, res));
        server.once("error", (err) => {
          this.starting = null;
          reject(err);
        });
        server.listen(0, "127.0.0.1", () => {
          this.port = (server.address() as { port: number }).port;
          this.server = server;
          this.starting = null;
          resolve(this.port);
        });
      });
    }
    return this.starting;
  }

  /** Registers an absolute path and returns its loopback media URL. */
  async urlFor(absPath: string): Promise<string | null> {
    const normalized = absPath.trim();
    if (!normalized) return null;
    const port = await this.ensure();
    const token = Buffer.from(normalized, "utf8").toString("base64url");
    this.tokens.set(token, normalized);
    return `http://127.0.0.1:${port}/media/${token}`;
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    const match = TOKEN_RE.exec(req.url || "");
    const filePath = match ? this.tokens.get(match[1]) : undefined;
    if (!filePath) {
      res.writeHead(404).end();
      return;
    }
    let size = 0;
    try {
      size = fs.statSync(filePath).size;
    } catch {
      res.writeHead(404).end();
      return;
    }
    const contentType = MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    const rangeMatch = /^bytes=(\d*)-(\d*)$/.exec(
      typeof req.headers.range === "string" ? req.headers.range : ""
    );
    if (rangeMatch) {
      let start = rangeMatch[1] === "" ? 0 : parseInt(rangeMatch[1], 10);
      let end = rangeMatch[2] === "" ? size - 1 : parseInt(rangeMatch[2], 10);
      if (start >= size || end < start) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
        return;
      }
      end = Math.min(end, size - 1);
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Type": contentType
      });
      fs.createReadStream(filePath, { start, end }).on("error", () => res.destroy()).pipe(res);
      return;
    }
    res.writeHead(200, {
      "Content-Length": size,
      "Accept-Ranges": "bytes",
      "Content-Type": contentType
    });
    fs.createReadStream(filePath).on("error", () => res.destroy()).pipe(res);
  }

  stop(): void {
    if (!this.server) return;
    try {
      this.server.closeAllConnections();
    } catch {
      // closeAllConnections is unavailable on very old Node; close() below still applies.
    }
    this.server.close();
    this.server = null;
    this.port = 0;
    this.starting = null;
    this.tokens.clear();
  }
}
