#!/usr/bin/env node
/**
 * Pele Yoetz - First 10 entries
 * Fetches Hebrew from Sefaria, translates via GPT-4o (modern English),
 * then generates MP3 via OpenAI TTS.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) { console.error('OPENAI_API_KEY not set'); process.exit(1); }

const TEXT_DIR = path.join(__dirname, '../text/pele-yoetz');
const AUDIO_DIR = path.join(__dirname, '../books/pele-yoetz');
fs.mkdirSync(TEXT_DIR, { recursive: true });
fs.mkdirSync(AUDIO_DIR, { recursive: true });

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'sefarim-audio/1.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse error: ' + data.slice(0,200))); }
      });
    }).on('error', reject);
  });
}

function stripHtml(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function translateToEnglish(hebrewText, topicTitle) {
  const prompt = `Translate this Hebrew passage from the Pele Yoetz (by Rabbi Eliezer Papo, 19th century) into clear, modern English. 

Guidelines:
- Write in plain, contemporary English — like you're explaining it to an educated adult today
- NOT archaic or biblical English (no "thou", "hath", "dost", "verily", etc.)
- Keep the wisdom and depth — don't water it down
- Render Talmudic and biblical quotes naturally in English, you don't need to cite the source
- Translate Hebrew/Aramaic terms with brief natural explanations the first time (e.g. "the evil inclination (yetzer hara)")
- Keep the paragraph structure
- The topic/entry title is: "${topicTitle}"

Hebrew text:
${hebrewText}

Return ONLY the translated English text, no preamble or notes.`;

  const body = JSON.stringify({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 2000
  });

  const tmpFile = `/tmp/translate_py_${Date.now()}.json`;
  fs.writeFileSync(tmpFile, body);

  const result = execSync(`curl -s https://api.openai.com/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${OPENAI_API_KEY}" \
    -d @${tmpFile}`, { maxBuffer: 5*1024*1024, timeout: 60000 }).toString();
  
  fs.unlinkSync(tmpFile);
  const resp = JSON.parse(result);
  if (resp.error) throw new Error('OpenAI error: ' + resp.error.message);
  return resp.choices[0].message.content.trim();
}

async function generateMp3(text, outPath, chapterTitle) {
  const fullText = `${chapterTitle}.\n\n${text}`;
  
  const body = JSON.stringify({
    model: 'gpt-4o-mini-tts',
    input: fullText,
    voice: 'echo',
    response_format: 'mp3',
    speed: 1.0,
    instructions: 'Read this as a thoughtful narrator of a classic Jewish ethical text. Use a measured, warm pace with clear enunciation. Pause naturally between paragraphs. This is meant to be listened to like an audiobook — engaging but not dramatic.'
  });

  const tmpFile = `/tmp/tts_req_${Date.now()}.json`;
  fs.writeFileSync(tmpFile, body);

  execSync(`curl -s https://api.openai.com/v1/audio/speech \
    -H "Authorization: Bearer ${OPENAI_API_KEY}" \
    -H "Content-Type: application/json" \
    -d @${tmpFile} \
    --output "${outPath}"`, { timeout: 120000 });
  
  fs.unlinkSync(tmpFile);
}

// Entry titles for the first 10
const ENTRY_TITLES = [
  'Love of God',
  'Love of Oneself',
  'Love of Children',
  'Love Between Husband and Wife',
  'Love of Torah Scholars and Those Who Fear God',
  'Love of Friends',
  'Mourning for the Destruction of the Temple',
  'Faith',
  'Eating and Drinking',
  'Truth'
];

async function main() {
  console.log('Fetching Pele Yoetz from Sefaria...');
  const data = await fetchUrl('https://www.sefaria.org/api/texts/Pele_Yoetz?context=0&pad=0');
  const hebrewSections = data.he || [];

  // Collect first 10 non-trivial entries
  const entries = [];
  for (let i = 0; i < hebrewSections.length && entries.length < 10; i++) {
    const section = hebrewSections[i];
    if (!section) continue;
    const raw = Array.isArray(section) ? section.join(' ') : section;
    const clean = stripHtml(raw).trim();
    if (clean.length > 50) {
      entries.push({ index: i, hebrew: clean });
    }
  }

  console.log(`Found ${entries.length} entries to process\n`);

  for (let n = 0; n < entries.length; n++) {
    const entry = entries[n];
    const title = ENTRY_TITLES[n] || `Entry ${n+1}`;
    const slug = String(n+1).padStart(2,'0');
    const txtPath = path.join(TEXT_DIR, `${slug}-${title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.txt`);
    const mp3Path = path.join(AUDIO_DIR, `${slug}-${title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.mp3`);

    if (fs.existsSync(mp3Path)) {
      const sz = fs.statSync(mp3Path).size;
      if (sz > 10000) {
        console.log(`✓ ${slug} ${title} — already done (${Math.round(sz/1024)}KB)`);
        continue;
      }
    }

    console.log(`→ [${slug}/10] Translating: ${title}...`);
    let translated;
    try {
      translated = await translateToEnglish(entry.hebrew, title);
    } catch(e) {
      console.error(`  ✗ Translation failed: ${e.message}`);
      continue;
    }

    // Save text
    const fullText = `PELE YOETZ — ${title.toUpperCase()}\n${'='.repeat(50)}\n\n${translated}`;
    fs.writeFileSync(txtPath, fullText);
    console.log(`  ✓ Translated (${translated.length} chars)`);

    // Generate audio
    console.log(`  → Generating audio...`);
    try {
      await generateMp3(translated, mp3Path, `Pele Yoetz: ${title}`);
      const sz = fs.statSync(mp3Path).size;
      console.log(`  ✓ Audio saved: ${Math.round(sz/1024)}KB\n`);
    } catch(e) {
      console.error(`  ✗ Audio failed: ${e.message}\n`);
    }

    // Brief pause between API calls
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n=== ALL DONE ===');
  console.log(`Text files: ${TEXT_DIR}`);
  console.log(`Audio files: ${AUDIO_DIR}`);
  
  // Print summary
  const mp3s = fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.mp3'));
  let totalSize = 0;
  for (const f of mp3s) {
    const sz = fs.statSync(path.join(AUDIO_DIR, f)).size;
    totalSize += sz;
    console.log(`  ${f}: ${Math.round(sz/1024)}KB`);
  }
  console.log(`Total: ${mp3s.length} files, ${Math.round(totalSize/1024)}KB`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
