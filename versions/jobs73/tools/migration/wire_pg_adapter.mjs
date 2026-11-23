#!/usr/bin/env node
/**
 * wire_pg_adapter.mjs — one-off, idempotent codemod.
 *
 * Replaces the direct Cloudflare D1 binding reads (`env.JOBS_DB`) in the Pages
 * Functions and the ingestion Worker with `getJobDb(env)`, which returns the
 * PostgreSQL gateway adapter. Adds the matching relative import once.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname, sep } from "node:path";

const ROOT = process.argv[2];
if (!ROOT) {
  console.error("usage: wire_pg_adapter.mjs <repo-root>");
  process.exit(2);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".js") || full.endsWith(".mjs")) out.push(full);
  }
  return out;
}

const targets = [
  { dir: join(ROOT, "functions", "api"), adapter: join(ROOT, "functions", "api", "_db.js") },
  { dir: join(ROOT, "workers", "ingestion", "src"), adapter: join(ROOT, "workers", "ingestion", "src", "_db.js") },
];

let changed = 0;
for (const target of targets) {
  for (const file of walk(target.dir)) {
    if (file === target.adapter) continue;
    let text = readFileSync(file, "utf8");
    const original = text;
    text = text.replace(/context\.env\?\.JOBS_DB/g, "getJobDb(context.env)");
    text = text.replace(/context\.env\.JOBS_DB/g, "getJobDb(context.env)");
    text = text.replace(/(?<![.\w])env\.JOBS_DB/g, "getJobDb(env)");
    if (text === original) continue;
    if (!/\bgetJobDb\b/.test(text)) continue;

    let rel = relative(dirname(file), target.adapter).split(sep).join("/");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    const importLine = `import { getJobDb } from "${rel}";`;
    if (!text.includes(`from "${rel}"`)) {
      const lines = text.split("\n");
      let last = -1;
      let inImport = false;
      for (let j = 0; j < lines.length; j += 1) {
        const line = lines[j];
        if (!inImport && /^\s*import[\s{*]/.test(line)) {
          inImport = true;
          last = j;
          if (/from\s+["']/.test(line) || /;\s*$/.test(line)) inImport = false;
          continue;
        }
        if (inImport) {
          last = j;
          if (/from\s+["']/.test(line) || /;\s*$/.test(line)) inImport = false;
        }
      }
      lines.splice(last + 1, 0, importLine);
      text = lines.join("\n");
    }
    writeFileSync(file, text);
    changed += 1;
    console.log(`wired ${relative(ROOT, file)} -> ${rel}`);
  }
}
console.log(`${changed} file(s) updated`);
