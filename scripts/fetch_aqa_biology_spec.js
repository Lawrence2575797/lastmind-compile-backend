// Retrieve the authoritative 8461 separate-science specification, including HT content.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = 'https://www.aqa.org.uk/subjects/biology/gcse/biology-8461/specification/';
const pages = ['working-scientifically', 'subject-content/cell-biology', 'subject-content/organisation',
  'subject-content/infection-and-response', 'subject-content/bioenergetics',
  'subject-content/homeostasis-and-response', 'subject-content/inheritance-variation-and-evolution',
  'subject-content/ecology', 'mathematical-requirements', 'practical-assessment'];
function plain(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<!--[^]*?-->/g, '')
    .replace(/<\/(?:p|li|h[1-6]|tr|div)>/g, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x([a-f\d]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
async function main() {
  const sources = [];
  for (const slug of pages) {
    const url = BASE + slug;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    const html = await response.text();
    const start = html.search(/<h2\b[^>]*>\s*(?:<!--[^]*?-->\s*)?(?:3\.0|4\.[1-7]|7\.0|8\.0)/);
    if (start < 0) throw new Error(`Specification heading missing: ${url}`);
    const end = html.indexOf('</main>', start);
    if (end < 0) throw new Error(`Specification body missing: ${url}`);
    const body = html.slice(start, end).split('<script')[0];
    const text = plain(body);
    sources.push({ url, retrievedAt: new Date().toISOString(), sha256: crypto.createHash('sha256').update(text).digest('hex'), text });
    console.log(`${slug}: ${text.length} characters`);
  }
  const out = path.join(__dirname, 'aqa_biology_8461_sources.json');
  fs.writeFileSync(out, JSON.stringify({ specification: '8461', subject: 'Biology', qualification: 'GCSE Higher', examBoard: 'AQA', sources }, null, 2));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
