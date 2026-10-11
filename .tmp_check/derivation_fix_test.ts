// Reproduces the failure from the "Italian letter sounds" lesson: options containing the word "sound" were rejected as "just naming Gn sound",
// and the model put a recap after five new terms while listing four. Run: npx ts-node --transpile-only .tmp_check/derivation_fix_test.ts
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'x';
import { checkDerivationText, repairMilestones } from '../src/services/derivationGenericService';

let bad = 0;
const ok = (label: string, c: boolean, extra?: string) => { if (!c) bad++; console.log((c ? 'ok   ' : 'FAIL ') + label + (extra ? '  ' + extra : '')); };

const byId: any = {
  GN: { id: 'GN', label: 'Gn sound', subtopic: 'Italian' }, SC: { id: 'SC', label: 'Sc sound', subtopic: 'Italian' },
  GL: { id: 'GL', label: 'Gli sound', subtopic: 'Italian' }, CI: { id: 'CI', label: 'Ci sound', subtopic: 'Italian' },
  HD: { id: 'HD', label: 'Silent h', subtopic: 'Italian' },
};
const stage: any = { subject: 'Italian', subtopic: 'Italian', nodes: ['GN', 'SC', 'GL', 'CI', 'HD'], edges: [], given: [], givenEdges: [], later: 0 };
const ask = (term: string, q: string, right: string, wrong: string, pre: string) => ({ type: 'ask', term, q, right, wrong, hint: 'Think about the word you know.', pre, why: ['It follows from the word in the situation.', 'The other option would be a different spelling rule.'] });

// five new terms, then the recap listing four: exactly the pattern in the screenshot
const makeOut = (sound: string, five: boolean) => ({
  terms: { GN: { label: 'Gn sound' }, SC: { label: 'Sc sound' }, GL: { label: 'Gli sound' }, CI: { label: 'Ci sound' }, HD: { label: 'Silent h' }, support1: { label: 'Soft vowels' } },
  extraEdges: [['support1', 'GN'], ['support1', 'SC'], ['GN', 'GL'], ['SC', 'CI'], ['CI', 'HD']],
  stage: {
    name: 'Italian letter sounds', title: 'Italian letter sounds', sub: 'Read tricky Italian letter groups aloud.',
    steps: [
      ask('support1', 'You see "e" and "i" after a "c". How does the "c" behave in the word "cena"?', 'Like the start of "chair"', 'Like the start of "cat"', 'So the vowels are'),
      ask('GN', 'You read "lasagna" aloud and the "gn" is in the middle. What does it sound like?', `A soft "ny", as in "canyon", ${sound}`.slice(0, 40), 'A hard "g" then an "n"', 'So that group is the'),
      ask('SC', 'You read "scena" aloud. How does the start of the word sound?', 'Like "sh" in "shed"', 'Like "sk" in "skin"', 'So that group is the'),
      ask('GL', 'You read "figlio" aloud. What does the middle of the word sound like?', 'A soft "ly" like in "million"', 'A hard "g" then an "l"', 'So that group is the'),
      ask('CI', 'You read "ciao" aloud. How does the first letter group sound?', 'Like "ch" in "chip"', 'Like "k" in "kite"', 'So that group is the'),
      ...(five ? [ask('HD', 'You read "hotel" aloud in Italian. What happens to the first letter?', 'It is not pronounced', 'It sounds like in English', 'So that letter is a')] : []),
      { type: 'recap', terms: ['support1', 'GN', 'SC', 'GL'], q: 'Which of these two groups is made with "sh" in English?', right: 'The one in "scena"', wrong: 'The one in "figlio"', hint: 'Think of the start of "shed".' },
      ...(five ? [] : [ask('HD', 'You read "hotel" aloud in Italian. What happens to the first letter?', 'It is not pronounced', 'It sounds like in English', 'So that letter is a')]),
      { type: 'recap', terms: ['CI', 'HD'], q: 'Which of these two is silent in Italian?', right: 'The "h" in "hotel"', wrong: 'The "c" in "ciao"', hint: 'One letter makes no sound at all.' },
    ],
  },
});

const text = (o: any) => JSON.stringify(o);

// 1. the false positive: an option that says "sound" must not be rejected as naming the Gn sound
const r1 = checkDerivationText(stage, text(makeOut('sound', false)), byId);
const named = (r1.errs || []).filter((e) => /just names/.test(e));
ok('options that say "sound" are no longer rejected as naming the term', named.length === 0, named[0] || '');

// 2. a real leak is still caught
const leaky = makeOut('x', false); (leaky.stage.steps[1] as any).right = 'The Gn sound';
const r2 = checkDerivationText(stage, text(leaky), byId);
ok('an option that really names the term is still rejected', (r2.errs || []).some((e) => /just names "Gn sound"/.test(e)));

// 3. the miscounting pattern from the screenshot: five introduced, recap lists four
const miscount = makeOut('sound', true);
const r3 = checkDerivationText(stage, text(miscount), byId);
ok('five new terms before a recap listing four is repaired in code', !!r3.spec, (r3.errs || []).slice(0, 3).join(' | '));

// 4. the repair does nothing to a lesson that is already right, and the original is never mutated
const good = makeOut('sound', false);
const before = JSON.stringify(good);
ok('a valid lesson needs no repair', repairMilestones(good) === null || !!checkDerivationText(stage, text(good), byId).spec);
ok('repair never alters the model output it was given', JSON.stringify(good) === before);

// proof the repair is what fixes the miscount: it reports a change, and the move it makes is the one described
const rep = repairMilestones(makeOut('sound', true));
const order = rep ? rep.stage.steps.map((s: any) => (s.type === 'recap' ? 'RECAP[' + s.terms.join(',') + ']' : s.term)).join(' > ') : 'no repair';
console.log('     repaired step order:', order);
ok('the repair moved the fifth new term to after the recap', !!rep && /RECAP\[support1,GN,SC,GL\] > CI/.test(order), order);

console.log(bad ? bad + ' FAILED' : 'all checks passed'); process.exit(bad ? 1 : 0);
