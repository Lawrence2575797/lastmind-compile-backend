// Persist reservations BEFORE dispatch: interruption or concurrent calls cannot reset the cap.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'aqa_biology_build', 'budget.json');
const CAP = 4;
function load() {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { capUsd: CAP, entries: [
    // Two 60k-output Sonnet calls were interrupted when the $4 instruction arrived.
    // No completed usage response was available. Reserve above their combined
    // worst-case output ($1.80) plus byte-bounded input/cache-write cost (<$0.70).
    { name: 'interrupted-initial-two-drafts', reservedUsd: 2.5, status: 'usage-unavailable' }
  ] };
}
function save(ledger) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(ledger, null, 2)); }
function reserve(name, system, input, maxTokens, review) {
  const ledger = load();
  if (ledger.entries.some(e => e.name === name)) throw new Error(`Existing API reservation: ${name}; reconcile before retrying.`);
  // A token cannot require less than one byte. Overestimate input rather than
  // relying on an English characters/token heuristic. Cache writes cost 1.25x.
  const inputBound = Buffer.byteLength(system + input, 'utf8') + 2048;
  const reservedUsd = (inputBound * (review ? 5 : 3) * 1.25 + maxTokens * (review ? 25 : 15)) / 1e6;
  const committed = ledger.entries.reduce((s, e) => s + (e.actualUsd ?? e.reservedUsd), 0);
  if (committed + reservedUsd > CAP) throw new Error(`$4 API cap: $${committed.toFixed(3)} committed/reserved; next call needs at most $${reservedUsd.toFixed(3)}. No request sent.`);
  ledger.entries.push({ name, reservedUsd, status: 'in-flight' }); save(ledger);
}
function settle(name, usage, review) {
  const ledger = load(), entry = ledger.entries.find(e => e.name === name);
  if (!entry) throw new Error('Missing reservation');
  entry.actualUsd = ((usage.input_tokens + (usage.cache_creation_input_tokens || 0) * 1.25 + (usage.cache_read_input_tokens || 0) * 0.1) * (review ? 5 : 3) + usage.output_tokens * (review ? 25 : 15)) / 1e6;
  entry.status = 'completed'; save(ledger);
}
module.exports = { reserve, settle, load };
