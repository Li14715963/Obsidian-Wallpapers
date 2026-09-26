import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = ["main.js", "manifest.json", "styles.css", "LICENSE", "THIRD_PARTY_NOTICES.md"];

function getVaultArgument(args) {
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--help" || args[i] === "-h") {
      console.log('Usage: npm run deploy -- --vault "<absolute-vault-path>"');
      process.exit(0);
    }
    if (args[i] === "--vault") {
      if (!args[i + 1] || args[i + 1].startsWith("--")) {
        throw new Error("--vault requires an absolute path.");
      }
      return args[i + 1];
    }
    if (args[i].startsWith("--vault=")) return args[i].slice("--vault=".length);
    throw new Error(`Unknown argument: ${args[i]}`);
  }
  throw new Error('Pass the destination explicitly: npm run deploy -- --vault "<absolute-vault-path>"');
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

try {
  const vaultArgument = getVaultArgument(process.argv.slice(2));
  if (!path.isAbsolute(vaultArgument)) throw new Error("Vault path must be absolute.");

  const vaultRoot = path.resolve(vaultArgument);
  const vaultConfig = path.join(vaultRoot, ".obsidian");
  if (!existsSync(vaultConfig) || !statSync(vaultConfig).isDirectory()) {
    throw new Error(`Not an Obsidian vault: ${vaultRoot} (expected a .obsidian directory).`);
  }

  const manifestPath = path.join(projectRoot, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error("Missing manifest.json.");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (typeof manifest.id !== "string" || !/^[a-z0-9-]+$/.test(manifest.id)) {
    throw new Error("manifest.json must contain a valid lowercase plugin id.");
  }

  for (const file of files) {
    if (!existsSync(path.join(projectRoot, file))) {
      throw new Error(`Missing ${file}; run "npm run build" first.`);
    }
  }

  const targetDir = path.join(vaultConfig, "plugins", manifest.id);
  mkdirSync(targetDir, { recursive: true });
  const legacyData = path.join(vaultConfig, "plugins", "nexus-wallpaper", "data.json");
  const targetData = path.join(targetDir, "data.json");
  if (manifest.id === "obsidian-wallpaper" && !existsSync(targetData) && existsSync(legacyData)) {
    copyFileSync(legacyData, targetData);
    if (sha256(legacyData) !== sha256(targetData)) throw new Error("Settings migration SHA-256 mismatch.");
    console.log("Migrated legacy nexus-wallpaper settings. Disable the old plugin before enabling obsidian-wallpaper.");
  }
  for (const file of files) {
    const source = path.join(projectRoot, file);
    const target = path.join(targetDir, file);
    copyFileSync(source, target);
    const sourceHash = sha256(source);
    const targetHash = sha256(target);
    console.log(`${file}: ${sourceHash} ${sourceHash === targetHash ? "[ok]" : "[MISMATCH]"}`);
    if (sourceHash !== targetHash) throw new Error(`SHA-256 mismatch after copying ${file}.`);
  }

  console.log(`Deployed to ${targetDir}`);
  console.log("Existing data.json is left untouched. Reload the plugin in Obsidian to activate it.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
