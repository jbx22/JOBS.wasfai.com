#!/usr/bin/env node
// JOBS.wasfai.com — version bumper
//
// Usage:
//   node tools/bump-version.js "short description of changes"
//   node tools/bump-version.js --patch "tiny fix"
//   node tools/bump-version.js --major "big redesign"
//
// What it does:
//   1. Reads VERSION.json (creates jobs1 if missing).
//   2. Computes the next sequential version (jobs{N}).
//   3. Copies the current source tree into versions/jobs{N}/.
//   4. Writes VERSION.json, appends CHANGELOG.md, updates VERSIONS.md.
//   5. Appends an entry to memory/YYYY-MM-DD.md.

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const mode = (args.find((a) => a.startsWith("--")) || "--minor").replace(
  /^--/,
  "",
);
const description =
  args.find((a) => !a.startsWith("--")) || "update";

const VERSION_FILE = path.join(ROOT, "VERSION.json");
const CHANGELOG_FILE = path.join(ROOT, "CHANGELOG.md");
const VERSIONS_INDEX = path.join(ROOT, "VERSIONS.md");
const VERSIONS_DIR = path.join(ROOT, "versions");

const SNAPSHOT_PATHS = [
  "public",
  "src",
  "assets",
  "Cargo.toml",
  "Cargo.lock",
  "package.json",
  "package-lock.json",
  "README.md",
  "tools",
  "qa",
  "index.html",
  "manifest.webmanifest",
  "sw.js",
];

function loadVersion() {
  if (fs.existsSync(VERSION_FILE) && !process.env.FORCE_NEXT) {
    return JSON.parse(fs.readFileSync(VERSION_FILE, "utf-8"));
  }
  return { current: 0, lastDescription: "", lastAt: "" };
}

function saveVersion(data) {
  fs.writeFileSync(VERSION_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function nextVersion(current) {
  if (mode === "major") {
    const major = Math.floor((current + 9) / 10) * 10;
    return Math.max(major, current + 1);
  }
  return current + 1;
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTree(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function snapshot(version) {
  const tag = `jobs${version}`;
  const dest = path.join(VERSIONS_DIR, tag);
  if (fs.existsSync(dest)) {
    throw new Error(`Version ${tag} already exists at ${dest}`);
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const item of SNAPSHOT_PATHS) {
    const from = path.join(ROOT, item);
    if (!fs.existsSync(from)) continue;
    const to = path.join(dest, item);
    const stat = fs.statSync(from);
    if (stat.isDirectory()) copyTree(from, to);
    else copyFile(from, to);
  }
  return dest;
}

function appendChangelog(version, description, at) {
  const existing = fs.existsSync(CHANGELOG_FILE) ? fs.readFileSync(CHANGELOG_FILE, "utf-8") : "";
  const header = existing.startsWith("# Changelog") ? existing : "# Changelog\n\n" + existing;
  const entry = `## jobs${version} — ${at}\n\n- ${description}\n\n`;
  fs.writeFileSync(CHANGELOG_FILE, header + entry, "utf-8");
}

function updateVersionsIndex(versions) {
  const lines = [
    "# JOBS.wasfai.com — Versions Index",
    "",
    "Sequential snapshots of the project. Each version is a frozen copy of the source tree at the time of the bump.",
    "",
    "| Version | Date | Description |",
    "| --- | --- | --- |",
  ];
  for (const v of versions.reverse()) {
    lines.push(`| jobs${v.n} | ${v.at} | ${v.description} |`);
  }
  fs.writeFileSync(VERSIONS_INDEX, lines.join("\n") + "\n", "utf-8");
}

function appendMemory(version, description, at) {
  const today = new Date().toISOString().slice(0, 10);
  const memFile = path.join(ROOT, "memory", `${today}.md`);
  if (!fs.existsSync(path.dirname(memFile))) {
    fs.mkdirSync(path.dirname(memFile), { recursive: true });
  }
  const sep = fs.existsSync(memFile) ? "\n" : "";
  const entry = `${sep}## jobs${version} — ${at}\n\n- ${description}\n`;
  fs.appendFileSync(memFile, entry, "utf-8");
}

function main() {
  const data = loadVersion();
  const version = nextVersion(data.current);
  const at = new Date().toISOString().slice(0, 16).replace("T", " ");
  const dest = snapshot(version);
  saveVersion({
    current: version,
    lastDescription: description,
    lastAt: at,
    history: [
      ...(data.history || []),
      { n: version, description, at },
    ],
  });
  appendChangelog(version, description, at);
  updateVersionsIndex(data.history ? [...data.history, { n: version, description, at }] : [{ n: version, description, at }]);
  appendMemory(version, description, at);
  console.log(`Bumped to jobs${version} → ${path.relative(ROOT, dest)}`);
  try {
    const sha = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
    if (sha) console.log(`Git HEAD: ${sha}`);
  } catch (e) {
    // not a git repo
  }
}

main();
