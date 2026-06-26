#!/usr/bin/env bash
#
# build.sh — assemble the deployable bundle in cdn-deploy/.
#
# This widget is hand-written vanilla JS with no transpile step, so "build" just
# means: copy the production files into cdn-deploy/ (the folder you drag into
# Netlify). Run this after editing idprivacy-chatbot.js or replacing the video,
# then redeploy cdn-deploy/ to Netlify.
#
# Source of truth lives at the repo root. cdn-deploy/ is generated output that is
# committed so it can be deployed by drag-and-drop.
set -euo pipefail
cd "$(dirname "$0")"

DEST="cdn-deploy"
mkdir -p "$DEST"

# Sync the widget JS (root is the edit-source) into the deploy bundle.
cp idprivacy-chatbot.js "$DEST/idprivacy-chatbot.js"

# The video (DataSafeguard-webflow_540.mp4) and _headers live in cdn-deploy/ and
# are maintained there directly — not regenerated. To refresh the video, compress
# the master (DataSafeguard-webflow_1080p.mp4) straight into cdn-deploy/.
if [ ! -f "$DEST/DataSafeguard-webflow_540.mp4" ]; then
  echo "WARNING: $DEST/DataSafeguard-webflow_540.mp4 is missing — add it before deploying." >&2
fi

echo "Built $DEST/:"
ls -lh "$DEST" | awk 'NR>1{printf "  %-8s %s\n", $5, $NF}'
echo
echo "Next: drag the cdn-deploy/ folder into your Netlify site's Deploys tab to publish."
