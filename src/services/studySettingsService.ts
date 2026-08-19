import { supabaseAdmin } from './supabaseAdmin';

// How much study time a student actually has each day — the capacity
// constraint the revision-plan scheduler (revisionPlanService.ts) needs
// to know before it can allocate anything. Deliberately a single explicit
// number the student sets themselves rather than an inferred default —
// per-student daily availability varies too much (a Saturday vs. a school
// night) to guess well, and getting this wrong either wastes the plan's
// capacity or produces an unrealistically packed one.
const DEFAULT_DAILY_MINUTES_BUDGET = 90;
const MIN_DAILY_MINUTES_BUDGET = 10;
const MAX_DAILY_MINUTES_BUDGET = 12 * 60; // a generous but sane ceiling

export interface StudySettings {
  dailyMinutesBudget: number;
}

export async function getStudySettings(userId: string): Promise<StudySettings> {
  const { data, error } = await supabaseAdmin
    .from('study_settings')
    .select('daily_minutes_budget')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return { dailyMinutesBudget: DEFAULT_DAILY_MINUTES_BUDGET };
  return { dailyMinutesBudget: data.daily_minutes_budget };
}

export async function setStudySettings(userId: string, dailyMinutesBudget: number): Promise<StudySettings> {
  const clamped = Math.round(Math.min(MAX_DAILY_MINUTES_BUDGET, Math.max(MIN_DAILY_MINUTES_BUDGET, dailyMinutesBudget)));
  const { error } = await supabaseAdmin
    .from('study_settings')
    .upsert({
      user_id: userId,
      daily_minutes_budget: clamped,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
  return { dailyMinutesBudget: clamped };
}
