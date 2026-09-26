import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = ["main.js", "manifest.json", "styles.css", "LICENSE", "THIRD_PARTY_NOTICES.md"];
const manifest = JSON.parse(readFileSync(path.join(projectRoot, "manifest.json"), "utf8"));

if (typeof manifest.id !== "string" || !/^[a-z0-9-]+$/.test(manifest.id)) {
  throw new Error("manifest.json must contain a valid lowercase plugin id.");
}

const packageDirs = [path.join(projectRoot, manifest.id), path.join(projectRoot, "release", manifest.id)];
for (const file of files) {
  const source = path.join(projectRoot, file);
  if (!existsSync(source)) throw new Error(`Missing ${file}; run "npm run build" first.`);
}

for (const packageDir of packageDirs) {
  mkdirSync(packageDir, { recursive: true });
  for (const file of files) {
    copyFileSync(path.join(projectRoot, file), path.join(packageDir, file));
  }
  console.log(`Ready-to-copy Obsidian plugin folder: ${packageDir}`);
}
