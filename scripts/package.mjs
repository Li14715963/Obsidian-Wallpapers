import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = ["main.js", "manifest.json", "styles.css"];
const manifest = JSON.parse(readFileSync(path.join(projectRoot, "manifest.json"), "utf8"));

if (typeof manifest.id !== "string" || !/^[a-z0-9-]+$/.test(manifest.id)) {
  throw new Error("manifest.json must contain a valid lowercase plugin id.");
}

const packageDir = path.join(projectRoot, manifest.id);
for (const file of files) {
  const source = path.join(projectRoot, file);
  if (!existsSync(source)) throw new Error(`Missing ${file}; run "npm run build" first.`);
}

mkdirSync(packageDir, { recursive: true });
for (const file of files) {
  copyFileSync(path.join(projectRoot, file), path.join(packageDir, file));
}

console.log(`Ready-to-copy Obsidian plugin folder: ${packageDir}`);
