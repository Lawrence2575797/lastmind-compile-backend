// Retrieve the authoritative AQA 8462 separate-science specification.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = 'https://www.aqa.org.uk/subjects/chemistry/gcse/chemistry-8462/specification/';
const pages = ['working-scientifically', 'subject-content/atomic-structure-and-the-periodic-table',
  'subject-content/bonding-structure-and-the-properties-of-matter', 'subject-content/quantitative-chemistry',
  'subject-content/chemical-changes', 'subject-content/energy-changes',
  'subject-content/the-rate-and-extent-of-chemical-change', 'subject-content/organic-chemistry',
  'subject-content/chemical-analysis', 'subject-content/chemistry-of-the-atmosphere',
  'subject-content/using-resources', 'mathematical-requirements', 'practical-assessment'];
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
    const start = html.search(/<h2\b[^>]*>\s*(?:<!--[^]*?-->\s*)?(?:3\.0|4\.(?:1|[2-9]|10)|7\.0|8\.0)/);
    if (start < 0) throw new Error(`Specification heading missing: ${url}`);
    const end = html.indexOf('</main>', start);
    if (end < 0) throw new Error(`Specification body missing: ${url}`);
    const text = plain(html.slice(start, end).split('<script')[0]);
    sources.push({ url, retrievedAt: new Date().toISOString(), sha256: crypto.createHash('sha256').update(text).digest('hex'), text });
    console.log(`${slug}: ${text.length} characters`);
  }
  fs.writeFileSync(path.join(__dirname, 'aqa_chemistry_8462_sources.json'), JSON.stringify({ specification: '8462', subject: 'Chemistry', qualification: 'GCSE Higher', examBoard: 'AQA', sources }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
