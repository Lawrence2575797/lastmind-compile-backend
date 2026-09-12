import { supabaseAdmin } from './supabaseAdmin';

// Real account deletion, not just a subscription cancellation (that's a
// separate, already-existing flow via Stripe's billing portal - see
// lastmind-stripe-backend's /api/portal-for-user). Deliberately does NOT
// touch any Stripe subscription itself - cancelling a live paid
// subscription is a distinct billing decision (immediate vs end-of-period,
// refund or not) this route has no business making unilaterally. The
// route/UI calling this must tell the student to cancel any active
// subscription separately first.
//
// Order: the two financial ledgers are anonymized FIRST (blank user_id,
// keep the transaction row - an audit trail isn't supposed to disappear
// just because the account did) - resilient to a single table failing
// (see anonymize's own comment), then every table needing an explicit
// delete is handled, and ONLY THEN is the actual auth user deleted -
// which cascades to every other user-owned table via the `on delete
// cascade` foreign keys added in scripts/add_cascade_delete_fks.sql.
//
// This is NOT wrapped in a single database transaction (Supabase's admin
// deleteUser call goes through the Auth API, not raw SQL, so it can't
// join a SQL transaction with the steps above anyway) - but every step
// here is idempotent, so a partial failure is safely retry-able: deleting
// already-deleted rows or anonymizing already-anonymized ones is a no-op,
// so calling this again after any failure just picks up where it left off
// rather than erroring or double-acting.
export async function deleteOwnAccount(userId: string): Promise<void> {
  // Deliberately non-fatal, same "never let this step abort the real
  // operation" convention as lockService.ts's own recordTransaction -
  // anonymizing a financial ledger is a nice-to-have privacy improvement
  // on top of erasure, not the erasure itself. A REAL, previously-hidden
  // bug found by live-testing this function: lock_transactions doesn't
  // actually exist in production (scripts/create_lock_transactions.sql
  // was apparently never run) - anonymize() used to throw on that missing
  // table, which aborted this ENTIRE function before it deleted anything
  // at all, including the auth user itself. A missing/erroring ledger
  // table must never be able to block a student's actual right to
  // erasure again.
  const anonymize = async (table: string) => {
    const { error } = await supabaseAdmin.from(table).update({ user_id: null }).eq('user_id', userId);
    if (error) console.error(`LastMind: failed to anonymize ${table} during account deletion (non-fatal, deletion continues).`, error);
  };
  await anonymize('lock_transactions');
  await anonymize('credit_transactions');

  const deleteRows = async (table: string) => {
    const { error } = await supabaseAdmin.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`Failed to delete rows from ${table}: ${error.message}`);
  };
  // concept_reviews (FSRS history), user_folders (folder sync),
  // chain_lesson_progress (older per-chain lesson progress) and review_log
  // (FSRS grading audit trail) predate the create_*.sql convention every
  // other table's cascade FK was added through - explicit deletes here
  // make this function correct regardless of whatever their real,
  // unverified FK status turns out to be. knowledge_map_node_note_edits/
  // knowledge_map_edge_note_edits (a student's own edits to a compiled
  // note) were added with no FK at all - same treatment. Privacy policy
  // claim this exists to make true: no row-level personal learning data
  // survives account deletion, only what's explicitly anonymized above.
  await deleteRows('concept_reviews');
  await deleteRows('user_folders');
  await deleteRows('chain_lesson_progress');
  await deleteRows('review_log');
  await deleteRows('knowledge_map_node_note_edits');
  await deleteRows('knowledge_map_edge_note_edits');

  const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteUserError) throw new Error(`Failed to delete auth user: ${deleteUserError.message}`);
}
