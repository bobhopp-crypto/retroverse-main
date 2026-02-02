#!/bin/zsh
set -e

echo "== RetroVerse Main: Converting symlinks to real folders =="

# List of all symlinks that must become real copies
LINKS=(
  "design"
  "archive"
  "code"
  "docs/config"
  "docs/docs"
  "exports"
  "sites/app"
  "sites/wheel"
  "sites/site"
  "data"
  "assets"
)

for LINK in "${LINKS[@]}"; do
  if [[ ! -L "$LINK" ]]; then
    echo ""
    echo "Skipping: $LINK is not a symlink"
    continue
  fi
  TARGET=$(readlink "${LINK}")

  echo ""
  echo "-- Processing $LINK -> $TARGET --"

  echo "Removing symlink: $LINK"
  rm "$LINK"

  echo "Copying $TARGET into $LINK ..."
  LINKDIR=$(dirname "$LINK")
  LINKBASE=$(basename "$LINK")
  if [[ -n "$LINKDIR" && "$LINKDIR" != "." ]]; then
    (cd "$LINKDIR" && cp -R "$TARGET" "$LINKBASE")
  else
    cp -R "$TARGET" "$LINK"
  fi
done

echo ""
echo "== Migration Complete =="
echo "Project tree:"
find . -maxdepth 2 -type d -print
