import { supabaseAdmin } from './supabaseAdmin';

// Real account deletion, not just a subscription cancellation (that's a
// separate, already-existing flow via Stripe's billing portal - see
// lastmind-stripe-backend's /api/portal-for-user). Deliberately does NOT
// touch any Stripe/PayPal subscription itself - cancelling a live paid
// subscription is a distinct billing decision (immediate vs end-of-period,
// refund or not) this route has no business making unilaterally. The
// route/UI calling this must tell the student to cancel any active
// subscription separately first.
//
// Order matters: the two financial ledgers are anonymized FIRST (blank
// user_id, keep the transaction row - an audit trail isn't supposed to
// disappear just because the account did), then the two tables that
// predate this repo's migration-script convention (and whose real
// foreign-key status couldn't be verified from code - see
// PRIVACY_DATA_HANDLING.md) are explicitly, defensively deleted, and
// ONLY THEN is the actual auth user deleted - which cascades to every
// other user-owned table via the `on delete cascade` foreign keys added
// in scripts/add_cascade_delete_fks.sql. Deleting the auth user first
// would risk a FK violation prematurely aborting this function partway
// through if any of the manual steps below turned out to still be needed.
//
// This is NOT wrapped in a single database transaction (Supabase's admin
// deleteUser call goes through the Auth API, not raw SQL, so it can't
// join a SQL transaction with the steps above anyway) - but every step
// here is idempotent, so a partial failure is safely retry-able: deleting
// already-deleted rows or anonymizing already-anonymized ones is a no-op,
// so calling this again after any failure just picks up where it left off
// rather than erroring or double-acting.
export async function deleteOwnAccount(userId: string): Promise<void> {
  const anonymize = async (table: string) => {
    const { error } = await supabaseAdmin.from(table).update({ user_id: null }).eq('user_id', userId);
    if (error) throw new Error(`Failed to anonymize ${table}: ${error.message}`);
  };
  await anonymize('lock_transactions');
  await anonymize('credit_transactions');

  const deleteRows = async (table: string) => {
    const { error } = await supabaseAdmin.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`Failed to delete rows from ${table}: ${error.message}`);
  };
  // concept_reviews (FSRS history) and user_folders (folder sync) predate
  // the create_*.sql convention every other table's cascade FK was added
  // through - explicit deletes here make this function correct regardless
  // of whatever their real, unverified FK status turns out to be.
  await deleteRows('concept_reviews');
  await deleteRows('user_folders');

  const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteUserError) throw new Error(`Failed to delete auth user: ${deleteUserError.message}`);
}
