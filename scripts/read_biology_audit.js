const fs = require('fs');
const raw = fs.readFileSync('scripts/aqa_biology_build/source-coverage-audit.json.txt', 'utf8');
// Only the narrative summary was truncated; preserve complete structured findings.
const end = raw.lastIndexOf(',\n"summary"');
if (end < 0) throw new Error('Cannot recover complete finding arrays');
const audit = JSON.parse(raw.slice(raw.indexOf('{'), end) + '}');
fs.writeFileSync('scripts/aqa_biology_build/recovered-findings.json', JSON.stringify({ ...audit, summaryTruncated: true }, null, 2));
audit.issues.forEach((x, i) => console.log(`${i}: ${x.id}\n${x.fix || x.problem}\n`));
