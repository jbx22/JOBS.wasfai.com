# DATA_CONTRACT.md — jobs.wasfai.com

This file defines the boundary between **system-owned** paths (the future updater
may read, write, and delete) and **user-owned** paths (the updater must never
touch).  The boundary is enforced in CI by `npm run check:contract`.

When you need to add a new path to either list, update this file *first*, then
update `tools/check-contract.mjs` if the self-test or parser needs to know about
a new category.

---

## **System layer** (auto-updatable)

These paths are owned by the project.  A future auto-updater is allowed to
create, overwrite, or remove any file or directory inside them.

| Path | Kind | Notes |
|------|------|-------|
| `src/` | directory | Rust backend source |
| `public/` | directory | PWA HTML/JS/CSS/manifest/SW |
| `assets/` | directory | Fonts, templates, static media |
| `tools/` | directory | CLI helper scripts |
| `qa/` | directory | Playwright / integration tests |
| `Cargo.toml` | file | Rust manifest |
| `Cargo.lock` | file | Rust lockfile |
| `package.json` | file | Node manifest |
| `package-lock.json` | file | Node lockfile |
| `README.md` | file | Repo readme |
| `CHANGELOG.md` | file | Release changelog |
| `VERSIONS.md` | file | Version history |
| `VERSION.json` | file | Current version metadata |
| `wrangler.jsonc` | file | Cloudflare Pages config (future) |
| `functions/` | directory | Cloudflare Pages Functions (API proxy layer) |
| `workers/` | directory | Cloudflare Workers for ingestion, queues, cron, and D1 schema |
| `deploy/` | directory | Deployment scripts (future) |
| `DEPLOYMENT_HANDOFF.md` | file | Deployment handoff doc |

---

## **User layer** (NEVER auto-updated)

These paths belong to the user.  The updater must **never** read, write, move,
or delete any file or directory in this list.

| Path | Kind | Notes |
|------|------|-------|
| `data/` | directory | Live prototype SQLite DB |
| `voice-dna.md` | file | User-owned voice guardrail |
| `modes/` | directory | Future: custom prompt modes |
| `profile.yml` | file | Future: user identity profile |
| `config/` | directory | Future: user configuration |
| `cv.md` | file | Future: user CV in markdown |
| `applications.md` | file | Future: application tracker |
| `output/` | directory | Future: generated PDFs |
| `reports/` | directory | Future: evaluation reports |
| `jds/` | directory | Future: saved job descriptions |
| `interview-prep/` | directory | Future: interview prep notes |
| `voice/` | directory | Future: voice samples |
| `plugins.local/` | directory | Future: local plugins |

---

## Rules

1. **System paths only.**  The updater reads `SYSTEM_PATHS` and never writes
   outside that list.
2. **User paths are off-limits.**  The updater never reads, writes, or deletes
   anything in `USER_PATHS`.
3. **CI enforcement.**  `tools/check-contract.mjs` runs in CI and fails the
   build if any system path is a prefix of a user path (or vice-versa).  Both
   lists must be disjoint.
4. **Contract-first.**  If you need a new system or user path, update
   `DATA_CONTRACT.md` *before* touching the filesystem.
5. **Audit writer.**  If a tool genuinely needs to write to a user path (e.g. a
   CV export to `output/`), it must go through a documented `UserPathWriter`
   API that records an audit entry and the user must explicitly approve the
   write target.

---

## Examples

### ✔ No violation

- System path: `src/main.rs`
- User path: `data/prototype.sqlite`

These are independent — no prefix overlap.

### ✘ Violation (system inside user)

A contributor adds `data/templates/` to the **system** list:

- System path: `data/templates/`
- User path: `data/`

`data/` is a prefix of `data/templates/`, so the user directory would contain
system-owned files.  **Reject.**  Move templates to `assets/templates/` instead.

### ✘ Violation (user inside system)

A contributor adds `public/config.yml` to the **user** list:

- System path: `public/`
- User path: `public/config.yml`

`public/` is a prefix of `public/config.yml`, so a user-owned file would live
inside a system directory.  **Reject.**  Put user config in `config/` instead.
