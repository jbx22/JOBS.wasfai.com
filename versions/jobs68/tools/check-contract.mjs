#!/usr/bin/env node
// JOBS.wasfai.com — DATA_CONTRACT.md boundary checker
//
// Usage:
//   node tools/check-contract.mjs              # real run
//   CHECK_CONTRACT_SELFTEST=1 node tools/check-contract.mjs  # self-test
//
// Reads DATA_CONTRACT.md, extracts SYSTEM_PATHS and USER_PATHS,
// checks for prefix overlaps, and optionally walks the working tree
// for files in user paths that may need attention.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const CONTRACT_PATH = join(REPO_ROOT, "DATA_CONTRACT.md");

// ---- parser ----------------------------------------------------------------

/**
 * Normalize a repo-relative path:
 *   backslash → forward slash
 *   strip leading ./
 *   strip trailing /  (directories don't need them for prefix checks)
 */
function norm(p) {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}

/**
 * Read DATA_CONTRACT.md and return { system: string[], user: string[] }.
 * Handles both table rows (| `path` | ...) and bullet lists (* `path` or - `path`).
 */
function parseContract(filePath) {
  const text = readFileSync(filePath, "utf-8");
  const lines = text.split(/\r?\n/);

  const result = { system: [], user: [] };
  let current = null;

  const headerRe = /\*\*(System layer|User layer)\*\*/;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const hdr = line.match(headerRe);
    if (hdr) {
      current = hdr[1] === "System layer" ? "system" : "user";
      continue;
    }

    // Stop at next major section (## header)
    if (/^## /.test(line) && !/layer/i.test(line)) {
      current = null;
      continue;
    }

    if (!current) continue;

    // Table row: | `path` | ...
    const tableMatch = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (tableMatch) {
      result[current].push(norm(tableMatch[1]));
      continue;
    }

    // Bullet: * `path` or - `path`
    const bulletMatch = line.match(/^[\*\-]\s+`([^`]+)`/);
    if (bulletMatch) {
      result[current].push(norm(bulletMatch[1]));
      continue;
    }
  }

  return result;
}

// ---- prefix-overlap check --------------------------------------------------

/**
 * Return true if `a` is a filesystem prefix of `b`.
 * "a is a prefix of b" means b is either equal to a or starts with a/.
 */
function isPrefix(a, b) {
  if (a === b) return true;
  return b.startsWith(a + "/");
}

/**
 * Find all violations between two path lists.
 * Returns an array of { sys, usr } objects.
 */
function findOverlaps(systemPaths, userPaths) {
  const violations = [];
  for (const s of systemPaths) {
    for (const u of userPaths) {
      if (isPrefix(s, u) || isPrefix(u, s)) {
        violations.push({ sys: s, usr: u });
      }
    }
  }
  return violations;
}

// ---- self-test -------------------------------------------------------------

function selftest() {
  let passed = 0;
  let failed = 0;

  function assert(cond, label) {
    if (cond) {
      passed++;
      console.log(`  PASS: ${label}`);
    } else {
      failed++;
      console.error(`  FAIL: ${label}`);
    }
  }

  console.log("SELFTEST: check-contract.mjs\n");

  // Scenario 1: clean tree — no overlaps
  {
    const sys = ["src", "public", "assets", "tools", "qa", "Cargo.toml"];
    const usr = ["data", "voice-dna.md", "output", "cv.md", "profile.yml"];
    const violations = findOverlaps(sys, usr);
    assert(violations.length === 0, "clean tree — no violations");
  }

  // Scenario 2: system path is prefix of a user path
  {
    const sys = ["src", "public"];
    const usr = ["data", "src/user-notes"];
    const violations = findOverlaps(sys, usr);
    assert(
      violations.length === 1 &&
        violations[0].sys === "src" &&
        violations[0].usr === "src/user-notes",
      "system prefix of user path (src/ vs src/user-notes)"
    );
  }

  // Scenario 3: user path is prefix of a system path
  {
    const sys = ["public/secret.md", "assets"];
    const usr = ["public", "data"];
    const violations = findOverlaps(sys, usr);
    assert(
      violations.length === 1 &&
        violations[0].sys === "public/secret.md" &&
        violations[0].usr === "public",
      "user prefix of system path (public/ vs public/secret.md)"
    );
  }

  // Scenario 4: no false positive for similar-but-different names
  {
    const sys = ["src"];
    const usr = ["src-data"];
    const violations = findOverlaps(sys, usr);
    assert(violations.length === 0, "similar names without path overlap (src vs src-data)");
  }

  // Scenario 5: exact match
  {
    const sys = ["data"];
    const usr = ["data"];
    const violations = findOverlaps(sys, usr);
    assert(violations.length === 1, "exact match counts as overlap");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0;
}

// ---- soft-check: files in user paths --------------------------------------

/**
 * Walk the repo tree (skip node_modules, target, .git, versions) and
 * report any file whose repo-relative path falls inside a user path.
 * Does NOT fail — only prints warnings.
 */
function softCheckUserPaths(userPaths) {
  const warnings = [];
  const skipDirs = new Set(["node_modules", "target", ".git", "versions"]);

  function walk(dir, relPrefix) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (skipDirs.has(ent.name)) continue;
      const full = join(dir, ent.name);
      const rel = relPrefix ? relPrefix + "/" + ent.name : ent.name;
      const nrel = norm(rel);

      if (ent.isDirectory()) {
        walk(full, rel);
      } else {
        // Check if this file falls under any user path
        for (const up of userPaths) {
          if (isPrefix(up, nrel)) {
            warnings.push(rel);
            break;
          }
        }
      }
    }
  }

  walk(REPO_ROOT, "");

  if (warnings.length > 0) {
    console.warn("WARNING: files found in USER_PATHS (verify they are gitignored):");
    for (const w of warnings) {
      console.warn(`  ${w}`);
    }
  }
}

// ---- main ------------------------------------------------------------------

function main() {
  // Self-test mode
  if (process.env.CHECK_CONTRACT_SELFTEST === "1") {
    const ok = selftest();
    process.exit(ok ? 0 : 1);
  }

  // Check that DATA_CONTRACT.md exists
  if (!existsSync(CONTRACT_PATH)) {
    console.error(`VIOLATION: DATA_CONTRACT.md not found at ${CONTRACT_PATH}`);
    process.exit(1);
  }

  const { system, user } = parseContract(CONTRACT_PATH);

  if (system.length === 0 && user.length === 0) {
    console.error("VIOLATION: no paths found in DATA_CONTRACT.md — is the format correct?");
    process.exit(1);
  }

  const violations = findOverlaps(system, user);

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`VIOLATION: system path \`${v.sys}\` overlaps with user path \`${v.usr}\``);
    }
    process.exit(1);
  }

  // Soft check
  softCheckUserPaths(user);

  console.log(`OK: contract holds (${system.length} system paths, ${user.length} user paths)`);
}

main();
