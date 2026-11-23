import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

test("a failed pg_dump never leaves a publishable backup even when gzip succeeds", {
  skip: process.platform === "win32" && "validated by the Linux release workflow",
}, (t) => {
  const root = mkdtempSync(join(tmpdir(), "jobs-backup-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const docker = join(bin, "docker");
  writeFileSync(docker, '#!/bin/sh\nif [ "$1" = inspect ]; then exit 0; fi\nprintf "partial database dump\\n"\nprintf "test dump failure\\n" >&2\nexit 2\n');
  chmodSync(docker, 0o700);
  const dir = join(root, "backups");
  const script = fileURLToPath(new URL("../vps/jobs-db-backup.sh", import.meta.url));
  const syntax = spawnSync("bash", ["-n", script], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
  const result = spawnSync("bash", [script], {
    env: { ...process.env, PATH: bin + delimiter + process.env.PATH, JOBS_BACKUP_DIR: dir }, encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAILED: pg_dump failed: test dump failure/);
  assert.deepEqual(readdirSync(dir), []);
});
