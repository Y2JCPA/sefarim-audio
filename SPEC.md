# Sefarim Audio — Spec

## What
Audiobook-style MP3s of classic Jewish hashkafa sefarim, generated from Sefaria's open API + OpenAI TTS. One MP3 per chapter. Free to listen, share, and learn from.

## Why
There's no good "books on tape" for limudei kodesh. Sefaria has the English text. Modern TTS is cheap and sounds great. Let's fix this.

## Pipeline

```
Sefaria API  →  clean text  →  OpenAI TTS  →  MP3 files  →  GitHub repo
```

1. **Pull**: Fetch English text from Sefaria API, chapter by chapter
2. **Clean**: Strip HTML, normalize quotes/dashes, add natural pauses (periods between verses), prepend "Chapter N" header, plus:
   - **G-d → God** (TTS reads "G-d" awkwardly; spell it out for narration)
   - **Strip parenthetical scripture sources** like `(Ps. 73:28)`, `(Avot 4:16)`, `(Eruvin 22:1)` — they sound unnatural when read aloud
   - **Keep descriptive parentheticals** like `(divine presence)`, `(the World to Come)` — these help the listener
3. **Generate**: Send cleaned text to OpenAI `gpt-4o-mini-tts` → MP3
4. **Store**: Save to `books/<book-slug>/chNN.mp3` in this repo

No LLM needed for processing — pure scripting.

## TTS Config
- **Model**: `gpt-4o-mini-tts` ($0.60/1M chars)
- **Voice**: `echo` — selected after testing all available voices (ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer). Runner-up: `ash`.
- **Format**: MP3, default quality
- **Speed**: 1.0 (normal)
- **Instructions**: "Read this as a thoughtful narrator of a classic Jewish philosophical text. Use a measured, warm pace with clear enunciation. Pause naturally between paragraphs. This is meant to be listened to like an audiobook — engaging but not dramatic."

## Cost Estimates
| Book | Words | Chars (est) | Cost |
|------|-------|-------------|------|
| Mesillat Yesharim | ~52,000 | ~280,000 | ~$0.17 |
| Kuzari | ~80,000? | ~430,000 | ~$0.26 |
| Sha'arei Teshuvah | ~30,000? | ~160,000 | ~$0.10 |
| Pirkei Avot | ~8,000 | ~43,000 | ~$0.03 |

## Available Books (English on Sefaria)
- ✅ Mesillat Yesharim (26 chapters) — **first book**
- ✅ Kuzari (5 essays)
- ✅ Sha'arei Teshuvah (3 gates)
- ✅ Orchot Tzaddikim (multiple gates)
- ✅ Pele Yoetz (alphabetical)
- ✅ Sefer HaChinukh (613 mitzvot)
- ✅ Pirkei Avot (6 chapters)

## Repo Structure
```
sefarim-audio/
├── SPEC.md              ← this file
├── README.md
├── scripts/
│   ├── fetch-and-clean.js  ← pull from Sefaria + strip HTML + format
│   └── generate-audio.sh   ← call OpenAI TTS, chunk long chapters, output MP3
├── text/                ← cleaned text files (for review/debugging)
│   └── mesillat-yesharim/
│       ├── ch01.txt
│       └── ...
└── books/               ← final MP3 output
    └── mesillat-yesharim/
        ├── ch01.mp3
        └── ...
```

## Git / GitHub
- **Repo**: `Y2JCPA/sefarim-audio` (private for now — MP3s are large)
- **Git LFS**: not yet installed; MP3s committed directly (each <100MB GitHub limit). Install LFS when repo grows.
- **Branch**: `main`

## Voice Testing (Completed)
Tested all 9 OpenAI voices with the same 3-sentence sample from chapter 1:
- ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer
- **Winner: `echo`** — clean, natural male narrator tone
- **Runner-up: `ash`** — also strong, slightly different character
- Onyx was the original test (full ch01 generated) but echo preferred after comparison

## Notes
- Sefaria texts are open-source (CC-BY-SA or similar) — attribution required
- Some translations are old/public domain, some are Sefaria's own
- Keep a `credits.md` per book with translator info
- MP3s will be large (~1-2 MB per chapter, ~30-50 MB per book) — consider GitHub LFS or external hosting later
- Future: build a simple web player, RSS feed for podcast apps
