#!/usr/bin/env bash
# Downloads the Salamander Grand Piano samples published by Tone.js and prepares them
# for the browser piano: mono, 8 s with a 1.5 s fade-out, 64 kbps MP3.
# Needs curl and ffmpeg. Output: public/samples/piano/.
set -euo pipefail
cd "$(dirname "$0")/.."

SOURCE=https://tonejs.github.io/audio/salamander
OUT=public/samples/piano
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

names="A0"
for octave in 1 2 3 4 5 6 7; do
  names="$names C$octave Ds$octave Fs$octave A$octave"
done
names="$names C8"

for name in $names; do
  curl -fsSL -o "$TMP/$name.mp3" "$SOURCE/$name.mp3"
  ffmpeg -loglevel error -y -i "$TMP/$name.mp3" -ac 1 -t 8 -af "afade=t=out:st=6.5:d=1.5" -b:a 64k "$OUT/$name.mp3"
done
echo "Wrote $(ls "$OUT"/*.mp3 | wc -l) samples to $OUT"
