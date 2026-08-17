// One-time admin tool — prepares an exam_spec_outlines cache row for one
// subject/qualification/exam board combination. Never runs as part of the
// live app; run by hand (via ts-node) whenever a new subject/board needs
// this grounding context. See chainService.ts's restateAndCacheSpecOutline
// and SPEC_OUTLINE_RESTATE_PROMPT for what this actually does and why:
// this app never fetches or stores exam board content itself — the raw
// spec text has to be fetched and extracted OUTSIDE this app (e.g. by
// Claude fetching the board's own published PDF and extracting its text)
// and handed to this script as a local text file; only the RESTATED,
// independently-worded outline this script produces ever gets persisted.
//
// Usage:
//   npx ts-node scripts/seedSpecOutline.ts \
//     --subject "Economics" \
//     --qualification "A Level" \
//     --examBoard "Edexcel" \
//     --text ./scratch/edexcel_econ_a_raw.txt \
//     --source "Pearson Edexcel A_Level_Econ_A_Spec.pdf, Issue 2 Oct 2016 — read for topic scope only, not reproduced verbatim"
import 'dotenv/config';
import * as fs from 'fs';
import { restateAndCacheSpecOutline } from '../src/services/chainService';

function readArg(name: string): string {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    throw new Error(`Missing required argument ${flag}`);
  }
  return process.argv[idx + 1];
}

async function main() {
  const subject = readArg('subject');
  const qualification = readArg('qualification');
  const examBoard = readArg('examBoard');
  const textPath = readArg('text');
  const sourceNote = readArg('source');

  const rawExtractedText = fs.readFileSync(textPath, 'utf8');

  console.log(`Restating spec outline for ${subject} / ${qualification} / ${examBoard} (${rawExtractedText.length} chars of source text)...`);
  const outline = await restateAndCacheSpecOutline(subject, qualification, examBoard, rawExtractedText, sourceNote);

  console.log('\n--- Cached outline ---\n');
  console.log(outline);
  console.log('\n--- Done ---');
}

main().catch((err) => {
  console.error('LastMind: seedSpecOutline failed.', err);
  process.exit(1);
});
