import { supabaseAdmin } from './supabaseAdmin';

// A student's opt-in identity for peer tutoring — separate from any other
// per-account table (tutees, folders) since this one specifically gates
// whether a user can be matched to help others or ask for help. Off by
// default: nobody is matchable just by having an account, only once they
// explicitly opt in. School-restricted matching isn't part of this table
// yet (see the plan's "Deferred" section) — this stays deliberately thin
// until that's added.
const MAX_NAME_LENGTH = 40;

export interface TutoringProfile {
  displayName: string | null;
  tutoringOptIn: boolean;
}

export async function getTutoringProfile(userId: string): Promise<TutoringProfile> {
  const { data, error } = await supabaseAdmin
    .from('tutoring_profiles')
    .select('display_name, tutoring_opt_in')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return { displayName: null, tutoringOptIn: false };
  return { displayName: data.display_name, tutoringOptIn: !!data.tutoring_opt_in };
}

export async function setTutoringProfile(userId: string, displayName: string | null, tutoringOptIn: boolean): Promise<TutoringProfile> {
  const trimmedName = displayName ? displayName.trim().slice(0, MAX_NAME_LENGTH) : null;
  const { error } = await supabaseAdmin
    .from('tutoring_profiles')
    .upsert({
      user_id: userId,
      display_name: trimmedName,
      tutoring_opt_in: tutoringOptIn,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
  return { displayName: trimmedName, tutoringOptIn };
}
