// Live, on-demand counterpart to scripts/generate_diagram_specs.js - that
// script only ever covers whatever nodes already had a lesson row AND
// happened to match its keyword filter at the moment someone thought to run
// it (a real gap found live: "Interpreting PES values..." matched none of
// the original keywords, silently skipping every elasticity-interpretation
// concept). Rather than maintain an ever-incomplete keyword list forever,
// this runs the SAME classification prompt as part of ordinary lesson
// generation itself (see lessonGenerationService.ts's own call site) - the
// model decides per-question whether a diagram genuinely fits (see
// generateDiagramSpecForQuestion's own comment on why it needs the actual
// question, not just the concept label), so nothing needs to guess from the
// label in advance ever again. Economics-only (see its own call site) - the
// curve palette this grades against (CURVE_TYPE_LIST) is Economics-specific.
import { callClaudeJSON } from './claudeClient';
import { stripCodeFences } from './jsonParsing';
import { MECHANISTIC_DIAGRAM_SPEC_PROMPT, CURVE_TYPE_LIST } from '../constants/diagramSpecPrompts';
import type { DiagramSpec } from './diagramGradingService';

const MODEL = 'claude-sonnet-5';

function validateSpec(spec: unknown): { ok: boolean; errors: string[] } {
  const s = spec as { notDiagrammatic?: boolean; questionText?: string; curves?: { id?: string; type?: string; baseCurveId?: string }[]; shades?: { id?: string; boundedBy?: string[] }[]; labels?: { anchor?: string; text?: string }[] };
  if (s.notDiagrammatic) return { ok: true, errors: [] };
  const errors: string[] = [];
  if (!s.questionText || !s.questionText.trim()) errors.push('missing "questionText" - a diagrammatic spec must reword the question as a drawing instruction (see rule 9)');
  const curveIds = new Set<string>();
  for (const c of s.curves || []) {
    if (!c.id || !c.type) { errors.push(`curve missing id/type: ${JSON.stringify(c)}`); continue; }
    const baseTypeStr = c.type.replace(/_shift_(left|right)$/, '');
    if (!CURVE_TYPE_LIST.includes(baseTypeStr)) errors.push(`unknown curve type: ${c.type}`);
    if (c.baseCurveId && !curveIds.has(c.baseCurveId)) errors.push(`curve ${c.id} references baseCurveId "${c.baseCurveId}" before it's defined`);
    curveIds.add(c.id);
  }
  for (const shade of s.shades || []) {
    if (!Array.isArray(shade.boundedBy) || shade.boundedBy.length !== 3) { errors.push(`shade ${shade.id} boundedBy must have exactly 3 entries`); continue; }
    const axisCount = shade.boundedBy.filter((b) => b === 'price-axis' || b === 'quantity-axis').length;
    const curveCount = shade.boundedBy.filter((b) => curveIds.has(b)).length;
    if (axisCount !== 1 || curveCount !== 2) errors.push(`shade ${shade.id} boundedBy must be exactly 2 known curve ids + 1 axis, got ${JSON.stringify(shade.boundedBy)}`);
  }
  for (const l of s.labels || []) {
    if (!l.anchor) continue;
    if (l.anchor.startsWith('curve:') && !curveIds.has(l.anchor.slice(6))) errors.push(`label "${l.text}" anchors to unknown curve id`);
    if (l.anchor.startsWith('intersection:')) {
      const [a, b] = l.anchor.slice(13).split(',');
      if (!curveIds.has(a) || !curveIds.has(b)) errors.push(`label "${l.text}" intersection anchor references unknown curve id(s)`);
    }
  }
  return { ok: errors.length === 0, errors };
}

// Returns { spec, questionText }, null if this question genuinely isn't
// diagrammatic, or null (logged, non-fatal) on a generation failure after
// retrying once - never throws, since a missing diagram must never block
// the lesson content it's meant to accompany. Needs the ACTUAL practice
// question (not just the concept label) - a real bug found live: the
// standalone batch script (generate_diagram_specs.js) only ever sent the
// bare label, so it happily attached a curve-drawing diagram to "a rise in
// price from £10 to £11 causes quantity supplied to rise from 100 to 200 -
// calculate the PES value", a plain numeric-calculation question with no
// diagram answer at all - swapping its text answer box for a drawing
// canvas left it genuinely unanswerable. See this prompt's own opening
// paragraph: diagrammatic-ness is a property of the QUESTION being
// answered, not the concept in the abstract. callClaudeJSON is single-shot
// (no conversation history), so a retry re-sends everything plus the prior
// attempt's own errors inline in one fresh userContent, rather than the
// multi-turn repair the standalone script does with the raw Anthropic SDK
// directly.
//
// The returned questionText is a SECOND real bug fix, found live: the
// main lesson-generation pass writes its practice question before this
// classification ever runs, so it has no way to know in advance whether
// the concept will turn out diagrammatic - it always writes a "describe/
// explain in words" question by default. Once this DOES classify as
// diagrammatic, the student ends up looking at an interactive drawing
// canvas underneath a question that still says "describe how to
// construct..." - see MECHANISTIC_DIAGRAM_SPEC_PROMPT's own rule 9,
// which rewords it into an actual drawing instruction. The caller
// (lessonGenerationService.ts) overwrites the original questionText with
// this one whenever a real spec comes back.
// Cheap gate in front of the model call: the classification call costs real
// Locks (~70) on every Economics lesson, but most concepts (definitions,
// scarcity, methodology, macro objectives...) never have a drawable curve
// diagram. Only concepts whose own text is about something that IS drawn on
// this tool's palette (supply/demand, costs, market failure, AD/AS, etc.)
// reach the model, which still makes the final per-question call.
const DIAGRAM_HINT_PATTERN = /supply|demand|equilibrium|curve|diagram|graph|draw|shift|surplus|shortage|excess|marginal|average (?:total |fixed |variable )?cost|total (?:cost|revenue)|revenue|production possibilit|\bppf\b|\bppc\b|externalit|\btax|subsid|price (?:ceiling|floor)|maximum price|minimum price|monopol|oligopol|competit|aggregate|\bad\/as\b|phillips|lorenz|tariff|quota|exchange rate|deadweight|welfare|elasticit|labour market|wage|loanable|money market|\blras\b|\bsras\b|output gap/i;

export function likelyNeedsDiagram(label: string, explanation: string, questionText: string): boolean {
  return DIAGRAM_HINT_PATTERN.test(`${label} ${explanation} ${questionText}`);
}

export async function generateDiagramSpecForQuestion(
  label: string,
  explanation: string,
  questionText: string,
  markScheme: string,
  userId: string
): Promise<{ spec: DiagramSpec; questionText: string } | null> {
  if (!likelyNeedsDiagram(label, explanation, questionText)) return null; // no model call, no Locks
  const context = `Concept: ${label}\n\nExplanation: ${explanation}\n\nPractice question: ${questionText}\n\nMark scheme: ${markScheme}`;
  let userContent = context;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await callClaudeJSON({
        model: MODEL,
        systemPrompt: MECHANISTIC_DIAGRAM_SPEC_PROMPT,
        userContent,
        maxTokens: 2000,
        userId,
        meteredReason: 'knowledge-map-v2-diagram-spec',
      });
    } catch (err) {
      console.error(`LastMind: diagram spec generation failed for "${label}".`, err);
      return null;
    }
    let spec: unknown;
    try {
      spec = JSON.parse(stripCodeFences(raw));
    } catch {
      userContent = `${context}\n\nYour previous response was not valid JSON:\n${raw}\n\nResend the complete corrected JSON, nothing else.`;
      continue;
    }
    const validation = validateSpec(spec);
    if (validation.ok) {
      const typed = spec as { notDiagrammatic?: boolean; questionText?: string };
      if (typed.notDiagrammatic) return null;
      // Strip questionText back out of the geometry object itself - it's
      // returned alongside DiagramSpec for the caller to overwrite the
      // question with, not part of the grading spec stored under it.
      const { questionText: rewordedQuestionText, ...geometry } = spec as { questionText: string } & DiagramSpec;
      return { spec: geometry as DiagramSpec, questionText: rewordedQuestionText };
    }
    userContent = `${context}\n\nYour previous response had real errors:\n${JSON.stringify(spec)}\n\nErrors:\n${validation.errors.join('\n')}\n\nResend the complete corrected JSON, nothing else.`;
  }
  console.error(`LastMind: diagram spec generation gave up after retry for "${label}".`);
  return null;
}
