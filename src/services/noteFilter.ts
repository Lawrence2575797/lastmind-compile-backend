// Turns a node's/edge's own already-cached lesson text (encoding_content's
// explanation, link_teaching_content) into a revision note by stripping
// lesson-NARRATION phrasing - never an AI call, since a note is just the
// same ground-truth content the student already learned from, minus the
// framing that only made sense while being TAUGHT it for the first time.
// KNOWLEDGE_MAP_ENCODING_LESSON_PROMPT's own rule 1a explicitly asks for
// an opening "Building on X, ..." orientation sentence - real, intended
// content in the LESSON, but not something worth keeping in a NOTE. Pure
// string processing: it only strips a fixed, known set of sentence-opening
// connective phrases and never rewrites or removes actual content.
const TEACHING_OPENER_PATTERNS: RegExp[] = [
  /^building on [^,]+,\s*/i,
  /^following on from [^,]+,\s*/i,
  /^continuing (on )?from [^,]+,\s*/i,
  /^having (covered|learned|seen|studied) [^,]+,\s*/i,
  /^now that (you'?ve|you have|we'?ve|we have)[^,]*,\s*/i,
  /^as (you'?ve|you have|we'?ve|we have) (already )?(seen|covered|learned|discussed)[^,]*,\s*/i,
  /^recall(ing)? that\s+/i,
  /^remember(ing)? that\s+/i,
  /^as (a )?(quick )?(reminder|recap)[^,]*,\s*/i,
  /^let'?s (now )?(look at|explore|consider|move on to)\s+/i,
  /^we'?ll (now )?(look at|explore|consider)\s+/i,
  /^we will (now )?(explore|look at|consider)\s+/i,
  /^in this (lesson|section|step),?\s*/i,
  /^moving on(,| from [^,]+,)?\s*/i,
  /^next,\s*(we'?ll|we will|let'?s)?\s*/i,
];

function capitalizeFirst(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// At most one opener stripped per paragraph - a real opener never stacks
// two of these back to back, and re-checking after a strip risks eating
// into genuine content that just happens to start with an innocent word.
function stripParagraphOpener(paragraph: string): string {
  let text = paragraph.trim();
  for (const pattern of TEACHING_OPENER_PATTERNS) {
    if (pattern.test(text)) {
      text = text.replace(pattern, '');
      break;
    }
  }
  return capitalizeFirst(text.trim());
}

// Splits on blank lines - this app's own paragraph convention throughout
// (see the frontend's splitIntoParagraphs) - so each paragraph's own
// opener is checked independently, not just the very first line of the
// whole explanation. A bullet/numbered list line (rule 1d's markdown
// lists) never matches any opener pattern, so list content always passes
// through untouched.
export function filterTeachingLanguage(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => stripParagraphOpener(p))
    .filter((p) => p.length > 0);
}
