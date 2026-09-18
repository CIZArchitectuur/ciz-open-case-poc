#!/bin/sh
set -eu

REPOSITORY=CIZDigitaliseert/ciz-regelrecht
BRANCH=feat/wet-eerst-corpus
REQUESTED_REVISION=${1:-acf3ea0}
TARGET=policy-service/src/main/resources/corpus/aanvraag-eerst
MANIFEST=policy-service/src/main/resources/corpus/aanvraag-eerst-manifest.yaml
WORK_DIR=$(mktemp -d)

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT INT TERM

gh auth status >/dev/null
COMMIT=$(gh api "repos/$REPOSITORY/commits/$REQUESTED_REVISION" --jq '.sha')
gh repo clone "$REPOSITORY" "$WORK_DIR/source" -- --no-checkout
git -C "$WORK_DIR/source" checkout --quiet "$COMMIT"

rm -rf "$TARGET"
mkdir -p "$(dirname "$TARGET")"
cp -R "$WORK_DIR/source/corpus/aanvraag-eerst" "$TARGET"

find "$TARGET" -type f -exec shasum -a 256 {} \; |
  sed "s|  $TARGET/|  |" > "$WORK_DIR/files.sha256"
FILE_COUNT=$(find "$TARGET" -type f | wc -l | tr -d ' ')
CONTENT_HASH=$(shasum -a 256 "$WORK_DIR/files.sha256" | awk '{print $1}')

{
  printf 'upstreamRepository: %s\n' "$REPOSITORY"
  printf 'sourceBranch: %s\n' "$BRANCH"
  printf 'sourceCommit: %s\n' "$COMMIT"
  printf 'retrievedAt: %s\n' "$(date -u +%Y-%m-%d)"
  printf 'sourcePath: corpus/aanvraag-eerst\n'
  printf 'fileCount: %s\n' "$FILE_COUNT"
  printf 'contentHash: %s\n' "$CONTENT_HASH"
  printf 'files:\n'
  sed 's|^  \([0-9a-f]*\)  \(.*\)$|  - path: \2\n    sha256: \1|' "$WORK_DIR/files.sha256"
} > "$MANIFEST"

printf 'Imported %s at %s (%s)\n' "$REPOSITORY" "$COMMIT" "$CONTENT_HASH"