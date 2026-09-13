// Live, on-demand counterpart to scripts/generate_diagram_specs.js - that
// script only ever covers whatever nodes already had a lesson row AND
// happened to match its keyword filter at the moment someone thought to run
// it (a real gap found live: "Interpreting PES values..." matched none of
// the original keywords, silently skipping every elasticity-interpretation
// concept). Rather than maintain an ever-incomplete keyword list forever,
// this runs the SAME classification prompt as part of ordinary lesson
// generation itself (see lessonGenerationService.ts's own call site) - the
// model decides per-concept whether a diagram genuinely applies
// (notDiagrammatic), so nothing needs to guess from the label in advance
// ever again. Economics-only (see its own call site) - the curve palette
// this grades against (CURVE_TYPE_LIST) is Economics-specific.
import { callClaudeJSON } from './claudeClient';
import { stripCodeFences } from './jsonParsing';
import { MECHANISTIC_DIAGRAM_SPEC_PROMPT, CURVE_TYPE_LIST } from '../constants/diagramSpecPrompts';
import type { DiagramSpec } from './diagramGradingService';

const MODEL = 'claude-sonnet-5';

function validateSpec(spec: unknown): { ok: boolean; errors: string[] } {
  const s = spec as { notDiagrammatic?: boolean; curves?: { id?: string; type?: string; baseCurveId?: string }[]; shades?: { id?: string; boundedBy?: string[] }[]; labels?: { anchor?: string; text?: string }[] };
  if (s.notDiagrammatic) return { ok: true, errors: [] };
  const errors: string[] = [];
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

// Returns a real DiagramSpec, null if this concept genuinely isn't
// diagrammatic, or null (logged, non-fatal) on a generation failure after
// retrying once - never throws, since a missing diagram must never block
// the lesson content it's meant to accompany. callClaudeJSON is single-shot
// (no conversation history), so a retry re-sends the concept plus the prior
// attempt's own errors inline in one fresh userContent, rather than the
// multi-turn repair generate_diagram_specs.js's standalone script does with
// the raw Anthropic SDK directly.
export async function generateDiagramSpecForConcept(label: string, userId: string): Promise<DiagramSpec | null> {
  let userContent = `Concept: ${label}`;
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
      userContent = `Concept: ${label}\n\nYour previous response was not valid JSON:\n${raw}\n\nResend the complete corrected JSON, nothing else.`;
      continue;
    }
    const validation = validateSpec(spec);
    if (validation.ok) {
      const typed = spec as { notDiagrammatic?: boolean };
      return typed.notDiagrammatic ? null : (spec as DiagramSpec);
    }
    userContent = `Concept: ${label}\n\nYour previous response had real errors:\n${JSON.stringify(spec)}\n\nErrors:\n${validation.errors.join('\n')}\n\nResend the complete corrected JSON, nothing else.`;
  }
  console.error(`LastMind: diagram spec generation gave up after retry for "${label}".`);
  return null;
}
