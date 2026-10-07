import { callClaudeJSON, MODELS } from './claudeClient';
import { supabaseAdmin } from './supabaseAdmin';
import { CONVERSATION_PROMPT } from '../constants/conversationPrompt';
import { describeCortexError } from './cortexService';

export interface ConversationTurn { role: 'user' | 'assistant'; content: string }
export interface ConversationResult {
  reply: string;
  translation: string;
  newWords: { word: string; meaning: string }[];
  correction: string | null;
  note: string | null;
  known: number;
}

const LANGUAGE_PATTERN = /^[A-Za-z][A-Za-z '\-]{1,30}$/;
export function validLanguage(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return LANGUAGE_PATTERN.test(s) ? s : null;
}

// What this student has actually learned of the language: the topics of every lesson they have completed in a subject of that name.
// The topic labels carry the words themselves ("Question words: come, dove"), which is what the conversation is built from.
export async function learnedMaterial(userId: string, language: string): Promise<string[]> {
  const learned: string[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabaseAdmin.from('concept_reviews').select('concept_id').eq('user_id', userId).range(from, from + 999);
    if (error) throw error;
    (data || []).forEach((r: any) => learned.push(r.concept_id as string));
    if (!data || data.length < 1000) break;
  }
  const labels: string[] = [];
  for (let i = 0; i < learned.length; i += 150) {
    const chunk = learned.slice(i, i + 150);
    const { data, error } = await supabaseAdmin.from('knowledge_map_nodes').select('label, concept_id').ilike('subject', language).in('concept_id', chunk);
    if (error) throw error;
    (data || []).forEach((r: any) => { if (r.label && !labels.includes(r.label)) labels.push(String(r.label)); });
  }
  return labels;
}

function parseTurn(raw: string): Omit<ConversationResult, 'known'> | null {
  const text = (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const first = text.indexOf('{'), last = text.lastIndexOf('}');
  let obj: any = null;
  if (first !== -1 && last > first) { try { obj = JSON.parse(text.slice(first, last + 1)); } catch { obj = null; } }
  if (!obj || typeof obj.reply !== 'string' || !obj.reply.trim()) return text && !text.startsWith('{') ? { reply: text.slice(0, 600), translation: '', newWords: [], correction: null, note: null } : null;
  const clean = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
  const newWords = (Array.isArray(obj.newWords) ? obj.newWords : [])
    .map((w: any) => ({ word: clean(w && w.word, 60) || '', meaning: clean(w && w.meaning, 80) || '' }))
    .filter((w: { word: string; meaning: string }) => w.word && w.meaning)
    .slice(0, 3);
  return { reply: obj.reply.trim().slice(0, 700), translation: clean(obj.translation, 700) || '', newWords, correction: clean(obj.correction, 300), note: clean(obj.note, 400) };
}

export async function conversationTurn(userId: string, language: string, history: ConversationTurn[], message: string): Promise<ConversationResult> {
  const labels = await learnedMaterial(userId, language);
  const material = labels.length
    ? labels.slice(-260).map((l) => `- ${l}`).join('\n')
    : '(they have not completed any lessons in this language yet: use only the very simplest greetings and say so in the note)';
  const userContent = [
    `Language: ${language}`,
    `What the student has learned:\n${material}`,
    history.length ? `Conversation so far:\n${history.slice(-14).map((h) => `${h.role === 'user' ? 'Student' : 'You'}: ${String(h.content).slice(0, 500)}`).join('\n')}` : 'The conversation has not started: open it.',
    message ? `Student's latest message: ${message.slice(0, 600)}` : 'Open the conversation now.',
  ].join('\n\n');

  const attempts = [MODELS.chat, MODELS.chat];
  const details: string[] = [];
  for (const model of attempts) {
    try {
      const raw = await callClaudeJSON({ model, systemPrompt: CONVERSATION_PROMPT, userContent, temperature: 0.6, maxTokens: 700, userId, meteredReason: 'cortex-conversation' });
      const parsed = parseTurn(raw);
      if (parsed) return { ...parsed, known: labels.length };
      details.push(`${model} returned nothing usable`);
    } catch (err) {
      details.push(describeCortexError(err));
      console.error('LastMind: conversation turn failed.', err);
    }
  }
  throw new Error(details.join(' | ').slice(0, 400) || 'no reply');
}
