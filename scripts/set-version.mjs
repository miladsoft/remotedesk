#!/usr/bin/env node
// Stamps a version number into every file that needs to agree on it before a
// release build: the workspace root, the desktop package, tauri.conf.json
// (the field Tauri actually reads for the shipped app version), and Cargo.toml.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error("Usage: node scripts/set-version.mjs <version>  (e.g. 1.2.3)");
  process.exit(1);
}

function setJsonVersion(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  json.version = version;
  writeFileSync(filePath, JSON.stringify(json, null, 2) + "\n");
  console.log(`  ${relativePath} -> ${version}`);
}

function setCargoVersion(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  const text = readFileSync(filePath, "utf8");
  const updated = text.replace(/^version = ".*"$/m, `version = "${version}"`);
  writeFileSync(filePath, updated);
  console.log(`  ${relativePath} -> ${version}`);
}

console.log(`Setting version to ${version}:`);
setJsonVersion("package.json");
setJsonVersion("apps/desktop/package.json");
setJsonVersion("apps/desktop/src-tauri/tauri.conf.json");
setCargoVersion("apps/desktop/src-tauri/Cargo.toml");
