// Personalizes Cortex's "learn something new" suggestion chips against
// this student's own recent activity, instead of three fixed examples
// every account sees forever. concept_reviews has no subject of its own
// (see knowledgeMapService.ts's getUnifiedKnowledgeMapForUser for the same
// join), so this reads the same way: most-recently-graded concepts first,
// joined to knowledge_map_nodes for their subject, deduped down to a
// handful of distinct recent subjects/topics.
import { supabaseAdmin } from './supabaseAdmin';
import { callClaudeJSON, MODELS } from './claudeClient';
import { parseModelJson } from './jsonParsing';
import { SUGGEST_NEXT_TOPICS_PROMPT } from '../constants/suggestNextTopicsPrompt';

// Shown to a brand-new account with no history yet, or if generation
// fails for any reason - the same three examples the chips always used
// to show, kept as the sensible fallback rather than an empty row.
const DEFAULT_SUGGESTIONS = ['the envelope theorem', 'ordering in Italian', 'supply and demand'];

export async function getSuggestedNextTopics(userId: string): Promise<string[]> {
  const { data: reviewRows, error: reviewErr } = await supabaseAdmin
    .from('concept_reviews')
    .select('concept_id, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(30);
  if (reviewErr) throw reviewErr;
  const conceptIds = [...new Set((reviewRows || []).map((r) => r.concept_id as string))];
  if (!conceptIds.length) return DEFAULT_SUGGESTIONS;

  const { data: nodeRows, error: nodeErr } = await supabaseAdmin
    .from('knowledge_map_nodes')
    .select('concept_id, subject')
    .in('concept_id', conceptIds);
  if (nodeErr) throw nodeErr;
  const subjectByConceptId = new Map((nodeRows || []).map((r: any) => [r.concept_id as string, r.subject as string]));

  // reviewRows is already ordered most-recent-first (the query above) - so
  // walking it in order and taking the first few DISTINCT subjects gives a
  // genuine recency-ranked list, not just an arbitrary set.
  const recentSubjects: string[] = [];
  for (const row of reviewRows || []) {
    const subject = subjectByConceptId.get(row.concept_id as string);
    if (subject && !recentSubjects.includes(subject)) recentSubjects.push(subject);
    if (recentSubjects.length >= 5) break;
  }
  if (!recentSubjects.length) return DEFAULT_SUGGESTIONS;

  try {
    const raw = await callClaudeJSON({
      model: MODELS.simpleQuestion,
      systemPrompt: SUGGEST_NEXT_TOPICS_PROMPT,
      userContent: `Recently studied, most recent first:\n${recentSubjects.map((s) => `- ${s}`).join('\n')}`,
      maxTokens: 300,
      temperature: 0.8,
      userId,
      meteredReason: 'suggest-next-topics',
    });
    const parsed = parseModelJson<{ suggestions?: unknown }>(raw);
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s): s is string => typeof s === 'string' && !!s.trim())
      : [];
    return suggestions.length === 3 ? suggestions : DEFAULT_SUGGESTIONS;
  } catch (err) {
    console.error('Suggest-next-topics generation failed, falling back to defaults:', err);
    return DEFAULT_SUGGESTIONS;
  }
}
