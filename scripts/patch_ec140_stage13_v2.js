// Second pass on stage 13 (no API calls): the 'read' steps added in the first pass sat immediately before an 'ask'
// step on the exact same term - a passive explanation slide followed by a redundant quiz on the thing it just
// explained. Folded the economic motivation straight into the 'ask' question itself instead, so there is one active
// -recall step per term (term only reveals on a correct click) rather than a read-then-ask pair, matching the same
// fix applied to stage 32 (Great Divergence).
require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Economics', QUALIFICATION = 'Undergraduate Year 1', EXAM_BOARD = 'Warwick';
const PD = 'economics:ec140_calculus_of_functions_of_two_or_more_variables:partial_derivatives_first_order_';
const TOTDIFF = 'economics:ec140_calculus_of_functions_of_two_or_more_variables:total_differential';

async function main() {
  const { data: row, error } = await db.from('derivation_generated_stages').select('compiled')
    .eq('subject', SUBJECT).eq('qualification', QUALIFICATION).eq('exam_board', EXAM_BOARD).eq('stage_index', 13).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Stage 13 not found.');
  const script = row.compiled.stage.script;

  // Remove the two passive 'read' steps entirely.
  const withoutReads = script.filter((s) => s.type !== 'read');

  // Fold their motivation into the very next 'ask' step's own question text.
  const pdAsk = withoutReads.find((s) => s.term === PD && s.type === 'ask');
  if (pdAsk) {
    pdAsk.q = "In economics we often want to know how output changes when ONE input changes and everything else stays fixed - e.g. the extra output from hiring one more worker, with capital unchanged. " + pdAsk.q;
  }
  const tdAsk = withoutReads.find((s) => s.term === TOTDIFF && s.type === 'ask');
  if (tdAsk) {
    tdAsk.q = "Real changes rarely hold everything else fixed - labour and capital often move together. " + tdAsk.q;
  }

  row.compiled.stage.script = withoutReads;
  const { error: upErr } = await db.from('derivation_generated_stages').update({ compiled: row.compiled })
    .match({ subject: SUBJECT, qualification: QUALIFICATION, exam_board: EXAM_BOARD, stage_index: 13 });
  if (upErr) throw upErr;
  console.log('Stage 13: folded read-step motivation into the ask questions, removed the redundant read steps.');
}
main().catch((e) => { console.error(e); process.exit(1); });
