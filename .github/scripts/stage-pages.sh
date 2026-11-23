#!/usr/bin/env bash
set -euo pipefail

# Compile in the checkout. Publish from a separate directory so Pages supplies its
# production bindings and Wrangler does not send a replacement binding list.
root=$(git rev-parse --show-toplevel)
stage=$(mktemp -d "${RUNNER_TEMP:?}/jobs-pages.XXXXXXXX")
cd "$root"
mkdir "$stage/site"
cp -a public/. "$stage/site/"
./node_modules/.bin/wrangler pages functions build functions \
  --outdir "$stage/worker" --output-routes-path "$stage/site/_routes.json" \
  --compatibility-date 2026-07-11 --compatibility-flags nodejs_compat
mv "$stage/worker/index.js" "$stage/site/_worker.js"
# Future multi-module builds must be packaged explicitly.
rmdir "$stage/worker"
node -e '
  const fs = require("node:fs");
  const routes = JSON.parse(fs.readFileSync(process.argv[1]));
  if (routes.version !== 1 || !routes.include.includes("/*")) throw Error("Pages routing must include the app and API");
' "$stage/site/_routes.json"
echo "PAGES_STAGE=$stage" >> "${GITHUB_ENV:?}"
