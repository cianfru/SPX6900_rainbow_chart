#!/usr/bin/env bash
# Regenerate src/nyc-geo.js from OpenStreetMap. Run this ONLY when the geometry needs refreshing —
# the output is committed, so the site never calls OSM (no API key, no per-load cost, no CSP issue).
#
# © OpenStreetMap contributors, ODbL 1.0 — https://osm.org/copyright
# Nominatim asks for <=1 request/second and a real User-Agent; both are honoured below.
set -euo pipefail
UA="spx6900-rainbow-city/1.0 (one-time geometry bake)"
DIR=$(mktemp -d)
q() {  # key, query
  curl -sS --max-time 30 -H "User-Agent: $UA" \
    "https://nominatim.openstreetmap.org/search?q=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$2")&format=json&polygon_geojson=1&limit=3" \
    -o "$DIR/$1.json"
  echo "  fetched $1"
  sleep 1.2
}
# The ISLAND, not the administrative boundary: the county border runs out into both rivers.
q island          "Manhattan Island, New York, USA"
q centralpark     "Central Park, New York, USA"
q rooseveltisland "Roosevelt Island, New York, USA"
q brooklyn        "Brooklyn, New York City, New York, USA"
q queens          "Queens, New York City, New York, USA"
q bronx           "The Bronx, New York City, New York, USA"
q jerseycity      "Jersey City, New Jersey, USA"
echo "raw geojson in $DIR — now run the projection/simplify step (see git history for bake-nyc.py)"
