// Builds SUBTOPICS-shaped content (matching generate_knowledge_map.js's own
// format) for GCSE Maths Foundation and Higher tier, straight from the real
// Pearson spec text - split at the document's OWN two explicit tier
// sections ("Foundation tier knowledge, skills and understanding" / pages
// 3-9, "Higher tier knowledge, skills and understanding" / pages 10-18 -
// see the spec's own "Foundation tier"/"Higher tier" paragraph explaining
// this), not inferred from bold/underline typography - the doc states
// outright that Higher tier's own section already includes everything
// (standard+underlined+bold), so each tier's SUBTOPICS content is just
// "whatever real text sits under that tier's own heading", verbatim.
//
// Subtopic boundaries are anchored on the doc's own repeated "What
// students need to learn:" marker - the line immediately before it (skipping
// blanks) is that subtopic's real heading. This is a structural anchor in
// the actual document, not a guessed heuristic.
const fs = require('fs');
const lines = fs.readFileSync(process.argv[2], 'utf8').split('\n').map((l) => l.replace(/\r$/, ''));

const FOUNDATION_START = 'Foundation tier knowledge, skills and understanding';
const HIGHER_START = 'Higher tier knowledge, skills and understanding';
const LEARN_MARKER = 'What students need to learn:';
const END_MARKERS = ['Assessment Objectives', 'Breakdown of Assessment Objectives'];

// The exact heading text also appears once in the Table of Contents as ONE
// line; the REAL section heading instead wraps across two physical lines
// ("Foundation tier knowledge, skills and" / "understanding") - a plain
// single-line exact match only ever finds the TOC copy. Checks a sliding
// 1-2 line window so both forms match, and picks the LAST occurrence
// (the TOC one always comes first).
function findLastHeadingIndex(needle) {
  let found = -1;
  for (let i = 0; i < lines.length; i++) {
    const oneLine = lines[i].trim();
    const twoLine = `${oneLine} ${(lines[i + 1] || '').trim()}`.replace(/\s+/g, ' ').trim();
    if (oneLine === needle || twoLine === needle) found = i;
  }
  return found;
}

const foundationStart = findLastHeadingIndex(FOUNDATION_START);
const higherStart = findLastHeadingIndex(HIGHER_START);
if (foundationStart === -1 || higherStart === -1) {
  console.error('Could not locate both tier section headings.', { foundationStart, higherStart });
  process.exit(1);
}
let higherEnd = lines.length;
for (let i = higherStart + 1; i < lines.length; i++) {
  const t = lines[i].trim();
  if (END_MARKERS.some((m) => t === m)) { higherEnd = i; break; }
}

const MAJOR_SECTION_RE = /^(\d)\.\s+(Number|Algebra|Ratio, [Pp]roportion.*|Geometry and [Mm]easures|Probability|Statistics)\s*$/;
const CODE_RE = /^([NARGPS]\d+)\b\s*(.*)$/;

// Repeating page footer/header boilerplate that bleeds into body text at
// every page break (found live: "Pearson Edexcel Level 1/Level 2 GCSE (9 -
// 1) in Mathematics", a bare page number, "Specification - Issue 2 - June
// 2015 ... Pearson Education Limited 2015") - stripped as noise, never real
// spec content.
const BOILERPLATE_RE = /^(Pearson Edexcel Level 1\/Level 2 GCSE|Specification - Issue 2|�\s*Pearson Education Limited|\d+)$/;

function parseTierBlock(startIdx, endIdx) {
  // First pass: find every "What students need to learn:" marker in range
  // and the heading line immediately before it (skipping blank lines AND
  // page boilerplate) - these are the real, structurally-anchored subtopic
  // boundaries. headingLine (not just headingText) is kept so the SECOND
  // pass can cut content precisely at the next subtopic's own heading,
  // rather than guessing a fixed line offset back from its marker.
  const markers = []; // {markerLine, headingLine, headingText, majorSection}
  let currentMajor = null;
  for (let i = startIdx + 1; i < endIdx; i++) {
    const t = lines[i].trim();
    if (!t || BOILERPLATE_RE.test(t)) continue;
    const majorMatch = MAJOR_SECTION_RE.exec(t);
    if (majorMatch) { currentMajor = t; continue; }
    if (t === LEARN_MARKER) {
      let h = i - 1;
      while (h > startIdx && (!lines[h].trim() || BOILERPLATE_RE.test(lines[h].trim()))) h--;
      markers.push({ markerLine: i, headingLine: h, headingText: lines[h].trim(), majorSection: currentMajor });
    }
  }

  // Second pass: content for subtopic k runs from just after its marker to
  // exactly the NEXT marker's own heading line (exclusive) - or endIdx for
  // the last one.
  const sections = markers.map((m, idx) => {
    const contentStart = m.markerLine + 1;
    const contentEnd = idx + 1 < markers.length ? markers[idx + 1].headingLine : endIdx;
    return { majorSection: m.majorSection, subtopic: m.headingText, contentStart, contentEnd, points: [] };
  });

  sections.forEach((s) => {
    let currentCode = null;
    let buffer = [];
    const flush = () => {
      if (currentCode && buffer.length) {
        // The page footer sometimes glues directly onto the end of the
        // last content line on a page (not isolated on its own line, so
        // the line-level BOILERPLATE_RE filter above can't catch it) -
        // stripped here as a substring instead, from wherever "Pearson
        // Edexcel Level 1/Level 2 GCSE" starts through "Pearson Education
        // Limited 2015", tolerant of the doc's own inconsistent dash
        // characters (-/–) and spacing around them.
        const FOOTER_SUBSTRING_RE = /\s*Pearson Edexcel Level 1\/Level 2 GCSE.*?Pearson Education Limited 2015\s*/g;
        const text = buffer.join(' ').replace(/\s+/g, ' ').replace(FOOTER_SUBSTRING_RE, ' ').replace(/\s+/g, ' ').trim();
        if (text) s.points.push({ code: currentCode, text });
      }
      buffer = [];
      currentCode = null;
    };
    for (let i = s.contentStart; i < s.contentEnd; i++) {
      const t = lines[i].trim();
      if (!t || BOILERPLATE_RE.test(t)) continue;
      // The NEXT subtopic's own heading line sits right before its "What
      // students need to learn:" marker, inside THIS range's tail (since
      // contentEnd was only trimmed back 1 line) - stop there rather than
      // swallow it into this subtopic's last point.
      if (MAJOR_SECTION_RE.test(t)) continue; // a major-section line can appear inside the tail too; skip, never content
      const codeMatch = CODE_RE.exec(t);
      if (codeMatch) {
        flush();
        currentCode = codeMatch[1];
        if (codeMatch[2]) buffer.push(codeMatch[2]);
        continue;
      }
      if (currentCode) buffer.push(t);
    }
    flush();
  });
  return sections;
}

const foundationSections = parseTierBlock(foundationStart, higherStart);
const higherSections = parseTierBlock(higherStart, higherEnd);

function toSubtopicsArray(sections) {
  return sections
    .filter((s) => s.points.length)
    .map((s) => ({
      subtopic: s.subtopic === s.majorSection ? s.majorSection : `${s.majorSection} – ${s.subtopic}`,
      specContent: [
        s.majorSection,
        s.subtopic,
        '',
        'Content - what students need to learn:',
        ...s.points.map((p) => `- ${p.code}: ${p.text}`),
      ].join('\n'),
    }));
}

const foundationSubtopics = toSubtopicsArray(foundationSections);
const higherSubtopics = toSubtopicsArray(higherSections);

fs.writeFileSync(process.argv[3], JSON.stringify(foundationSubtopics, null, 2));
fs.writeFileSync(process.argv[4], JSON.stringify(higherSubtopics, null, 2));

console.log('Foundation subtopics:', foundationSubtopics.length, '- total points:', foundationSubtopics.reduce((n, s) => n + (s.specContent.match(/^- /gm) || []).length, 0));
console.log('Higher subtopics:', higherSubtopics.length, '- total points:', higherSubtopics.reduce((n, s) => n + (s.specContent.match(/^- /gm) || []).length, 0));
console.log('\nFoundation subtopic list:');
foundationSubtopics.forEach((s) => console.log(' -', s.subtopic, `(${(s.specContent.match(/^- /gm) || []).length} points)`));
console.log('\nHigher subtopic list:');
higherSubtopics.forEach((s) => console.log(' -', s.subtopic, `(${(s.specContent.match(/^- /gm) || []).length} points)`));
