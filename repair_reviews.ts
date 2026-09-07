import 'dotenv/config';
import { supabaseAdmin } from './src/services/supabaseAdmin';
import { fsrs, generatorParameters, createEmptyCard, Rating, Grade } from 'ts-fsrs';

const params = generatorParameters({ request_retention: 0.92, maximum_interval: 36500, enable_short_term: false });
const scheduler = fsrs(params) as any;

const GRADES: { name: string; rating: Grade; stability: number }[] = (
  [
    ['Again', Rating.Again],
    ['Hard', Rating.Hard],
    ['Good', Rating.Good],
    ['Easy', Rating.Easy],
  ] as const
).map(([name, rating]) => ({ name, rating, stability: scheduler.init_stability(rating) }));

function matchGrade(stability: number) {
  return GRADES.find((g) => Math.abs(g.stability - stability) < 0.01) || null;
}

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
  const { data, error } = await supabaseAdmin.from('concept_reviews').select('*').order('due', { ascending: true });
  if (error) throw error;

  let fixedExact = 0;
  let fixedApprox = 0;
  let skipped = 0;

  for (const row of data || []) {
    const isBugAffected = row.state === 1 && row.scheduled_days === 0;
    if (!isBugAffected) {
      skipped++;
      continue;
    }

    const lastReview = row.last_review ? new Date(row.last_review) : new Date(row.due);

    if (row.reps === 1) {
      const grade = matchGrade(row.stability);
      if (grade) {
        const fresh = createEmptyCard(lastReview);
        const { card: corrected } = scheduler.next(fresh, lastReview, grade.rating);
        console.log(
          `[EXACT/${grade.name}] ${row.concept_id}\n  old due=${new Date(row.due).toISOString()}\n  new due=${corrected.due.toISOString()} (scheduled_days=${corrected.scheduled_days}, state=${corrected.state})`
        );
        if (!DRY_RUN) {
          const { error: updateError } = await supabaseAdmin
            .from('concept_reviews')
            .update({
              due: corrected.due.toISOString(),
              stability: corrected.stability,
              difficulty: corrected.difficulty,
              elapsed_days: corrected.elapsed_days,
              scheduled_days: corrected.scheduled_days,
              state: corrected.state,
            })
            .eq('user_id', row.user_id)
            .eq('concept_id', row.concept_id);
          if (updateError) throw updateError;
        }
        fixedExact++;
        continue;
      }
    }

    // Multi-rep row (or an unmatched stability) — no full rating history
    // stored, so an exact replay isn't possible. Approximate using the
    // scheduler's own stability->interval formula on the ALREADY-correct
    // stored stability (short-term vs long-term scheduling doesn't change
    // how stability itself is computed, only how the due date is derived
    // from it) — clamped to at least 1 day out, same floor the real fix
    // now guarantees going forward.
    const approxDays = Math.max(1, scheduler.next_interval(row.stability, 0));
    const newDue = new Date(lastReview.getTime() + approxDays * 86400000);
    console.log(
      `[APPROX] ${row.concept_id} (reps=${row.reps}, stability=${row.stability})\n  old due=${new Date(row.due).toISOString()}\n  new due=${newDue.toISOString()} (scheduled_days=${approxDays})`
    );
    if (!DRY_RUN) {
      const { error: updateError } = await supabaseAdmin
        .from('concept_reviews')
        .update({ due: newDue.toISOString(), scheduled_days: approxDays, state: 2 })
        .eq('user_id', row.user_id)
        .eq('concept_id', row.concept_id);
      if (updateError) throw updateError;
    }
    fixedApprox++;
  }

  console.log(`\n${DRY_RUN ? '[DRY RUN] Would fix' : 'Fixed'}: ${fixedExact} exact, ${fixedApprox} approximate. Skipped (already correct): ${skipped}.`);
})();
