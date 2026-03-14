#!/usr/bin/env bash
# Generate MP3 from text files using OpenAI TTS API.
#
# Usage: ./generate-audio.sh <text-dir> <output-dir> [voice]
# Example: ./generate-audio.sh ../text/mesillat-yesharim ../books/mesillat-yesharim onyx
#
# Requires OPENAI_API_KEY in environment.

set -euo pipefail

TEXT_DIR="${1:?Usage: generate-audio.sh <text-dir> <output-dir> [voice]}"
OUT_DIR="${2:?Usage: generate-audio.sh <text-dir> <output-dir> [voice]}"
VOICE="${3:-onyx}"
MODEL="gpt-4o-mini-tts"

INSTRUCTIONS="Read this as a thoughtful narrator of a classic Jewish philosophical text. Use a measured, warm pace with clear enunciation. Pause naturally between paragraphs. This is meant to be listened to like an audiobook — engaging but not dramatic."

mkdir -p "$OUT_DIR"

for txt in "$TEXT_DIR"/ch*.txt; do
  base=$(basename "$txt" .txt)
  mp3="$OUT_DIR/${base}.mp3"

  if [ -f "$mp3" ]; then
    echo "Skipping $base (already exists)"
    continue
  fi

  echo "Generating $base..."
  chars=$(wc -c < "$txt" | tr -d ' ')
  echo "  $chars characters"

  # OpenAI TTS has a 4096 char limit per request.
  # For longer chapters, we split into chunks and concatenate.
  if [ "$chars" -gt 4000 ]; then
    echo "  Long chapter — splitting into chunks..."
    TMPDIR_CHUNKS=$(mktemp -d)
    # Split on paragraph breaks, accumulate up to ~3800 chars per chunk
    node -e "
      const fs = require('fs');
      const text = fs.readFileSync('$txt', 'utf8');
      const paras = text.split(/\n\n/);
      let chunks = [], current = '';
      for (const p of paras) {
        if ((current + '\n\n' + p).length > 3800 && current.length > 0) {
          chunks.push(current.trim());
          current = p;
        } else {
          current = current ? current + '\n\n' + p : p;
        }
      }
      if (current.trim()) chunks.push(current.trim());
      chunks.forEach((c, i) => {
        const pad = String(i).padStart(3, '0');
        fs.writeFileSync('$TMPDIR_CHUNKS/chunk_' + pad + '.txt', c);
      });
      console.log(chunks.length + ' chunks');
    "

    CHUNK_MP3S=""
    for chunk in "$TMPDIR_CHUNKS"/chunk_*.txt; do
      cbase=$(basename "$chunk" .txt)
      cmp3="$TMPDIR_CHUNKS/${cbase}.mp3"

      INPUT=$(cat "$chunk" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")

      curl -s --fail "https://api.openai.com/v1/audio/speech" \
        -H "Authorization: Bearer $OPENAI_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
          \"model\": \"$MODEL\",
          \"input\": $INPUT,
          \"voice\": \"$VOICE\",
          \"response_format\": \"mp3\",
          \"instructions\": $(echo "$INSTRUCTIONS" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
        }" \
        -o "$cmp3"

      CHUNK_MP3S="$CHUNK_MP3S|$cmp3"
      sleep 0.5
    done

    # Concatenate chunks with ffmpeg
    # Build concat list
    CONCAT_LIST="$TMPDIR_CHUNKS/concat.txt"
    echo "$CHUNK_MP3S" | tr '|' '\n' | tail -n +2 | while read f; do
      echo "file '$f'"
    done > "$CONCAT_LIST"

    ffmpeg -f concat -safe 0 -i "$CONCAT_LIST" -c copy "$mp3" -y -loglevel error
    rm -rf "$TMPDIR_CHUNKS"
    echo "  Done (concatenated chunks)"
  else
    INPUT=$(cat "$txt" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")

    curl -s --fail "https://api.openai.com/v1/audio/speech" \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      -H "Content-Type: application/json" \
      -d "{
        \"model\": \"$MODEL\",
        \"input\": $INPUT,
        \"voice\": \"$VOICE\",
        \"response_format\": \"mp3\",
        \"instructions\": $(echo "$INSTRUCTIONS" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
      }" \
      -o "$mp3"

    echo "  Done"
  fi

  sleep 0.5
done

echo "All done! Files in $OUT_DIR"
ls -lh "$OUT_DIR"/*.mp3 2>/dev/null
