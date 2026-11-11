#!/usr/bin/env bash
# Publish Flower Shop: push public repo, pin SHA into the catalog entry, open the catalog PR.
# Usage: scripts/publish.sh   (needs `gh auth status` OK)
set -euo pipefail
cd "$(dirname "$0")/.."
OWNER=$(gh api user -q .login); REPO=hermes-flower-shop
sed -i "s#OWNER#$OWNER#g" README.md docs/catalog-entry.draft.yaml plugin.yaml
git add -A && git commit -qm "release: point metadata at github.com/$OWNER/$REPO" || true
gh repo view "$OWNER/$REPO" >/dev/null 2>&1 || gh repo create "$OWNER/$REPO" --public --source . --remote origin --description "Flower Shop - AI business workspace plugin for Hermes Agent" 
git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
git push -u origin main
SHA=$(git rev-parse HEAD)
WORK=$(mktemp -d); gh repo fork NousResearch/hermes-agent --clone=false >/dev/null 2>&1 || true
git clone --depth 1 "https://github.com/$OWNER/hermes-agent.git" "$WORK/ha"
( cd "$WORK/ha" && git remote add upstream https://github.com/NousResearch/hermes-agent.git && git fetch --depth 1 upstream main && git checkout -B add-flower-shop upstream/main
  sed "s/0000000000000000000000000000000000000000/$SHA/g" "$OLDPWD/docs/catalog-entry.draft.yaml" | sed -e 's/ *# TODO.*$//' -e '/^image: ""/d' > plugin-catalog/flower-shop.yaml
  git add plugin-catalog/flower-shop.yaml && git commit -qm "plugin-catalog: add flower-shop" && git push -u origin add-flower-shop -f
  gh pr create --repo NousResearch/hermes-agent --head "$OWNER:add-flower-shop" --title "plugin-catalog: add flower-shop" --body-file "$OLDPWD/docs/PR_BODY.md" )
echo "repo: https://github.com/$OWNER/$REPO  sha: $SHA"
