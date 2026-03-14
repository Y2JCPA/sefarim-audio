#!/usr/bin/env node
/**
 * Fetch a book from Sefaria API and output cleaned text files for TTS.
 *
 * Usage: node fetch-and-clean.js <sefaria-ref> <num-chapters> <output-dir>
 * Example: node fetch-and-clean.js "Mesillat_Yesharim" 26 ../text/mesillat-yesharim
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const [,, ref, numStr, outDir] = process.argv;
if (!ref || !numStr || !outDir) {
  console.error('Usage: node fetch-and-clean.js <sefaria-ref> <num-chapters> <output-dir>');
  process.exit(1);
}

const num = parseInt(numStr, 10);
fs.mkdirSync(outDir, { recursive: true });

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function stripHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanForNarration(verses, chapterNum) {
  const header = `Chapter ${chapterNum}.\n\n`;
  const body = verses
    .map(v => stripHtml(v))
    .filter(v => v.length > 0)
    .join('\n\n');
  return header + body;
}

async function main() {
  for (let ch = 1; ch <= num; ch++) {
    const url = `https://www.sefaria.org/api/texts/${ref}.${ch}?lang=en&context=0`;
    console.log(`Fetching chapter ${ch}...`);
    try {
      const raw = await fetch(url);
      const data = JSON.parse(raw);
      let text = data.text;
      if (!text || (Array.isArray(text) && text.length === 0)) {
        console.warn(`  No English text for chapter ${ch}, skipping`);
        continue;
      }
      if (!Array.isArray(text)) text = [text];
      const cleaned = cleanForNarration(text, ch);
      const padded = String(ch).padStart(2, '0');
      const outPath = path.join(outDir, `ch${padded}.txt`);
      fs.writeFileSync(outPath, cleaned, 'utf8');
      const words = cleaned.split(/\s+/).length;
      console.log(`  ch${padded}.txt — ${words} words`);
    } catch (e) {
      console.error(`  Error on chapter ${ch}: ${e.message}`);
    }
    // small delay to be nice to Sefaria
    await new Promise(r => setTimeout(r, 300));
  }
  console.log('Done!');
}

main();
