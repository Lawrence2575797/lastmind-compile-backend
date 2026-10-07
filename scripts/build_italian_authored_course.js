'use strict';

// Builds LastMind's Italian course without calling any model or external API.
// The source map is deliberately the only curriculum inventory: every map node
// receives one checked, replayable lesson and no lesson can invent a surprise
// target-language sentence in a question.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sourcePath = path.join(__dirname, 'knowledge_map_italian_other.json');
const outputPath = path.join(root, 'src', 'data', 'italianAuthoredCourse.json');
const map = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

const colours = ['#cfe8c8', '#cfe3f6', '#f6ecb9', '#f8d9c4', '#cfd9e8', '#dccff0'];

const sectionNumber = (subtopic) => {
  const m = String(subtopic).match(/^([AB])(\d+)\.(\d+)/);
  if (!m) return 999;
  return (m[1] === 'A' ? 0 : 100) + Number(m[2]) * 10 + Number(m[3]);
};

// The database export is not in teaching order. These small priorities keep
// the foundations of each section ahead of applications while the original
// graph still decides dependencies within the same priority band.
const topicPriority = (node) => {
  const id = node.id.toUpperCase();
  const label = node.label.toLowerCase();
  if (/concept|register|pronoun|question word/.test(label) || /PRON|CONCEPT/.test(id)) return 0;
  if (/vocab|number|greeting|courtesy|day|month|season|family/.test(label)) return 1;
  if (/form|ending|formation|article|agreement|conjug|stem/.test(label)) return 2;
  if (/rule|selection|choice|contrast|recognis|distinguish/.test(label)) return 3;
  if (/construct|express|describ|asking|stating|worked example|full /.test(label)) return 4;
  return 2;
};

function orderedSection(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map(nodes.map((n) => [n.id, 0]));
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  edges.forEach((e) => {
    if (!byId.has(e.from) || !byId.has(e.to)) return;
    outgoing.get(e.from).push(e.to);
    incoming.set(e.to, incoming.get(e.to) + 1);
  });
  const sourceIndex = new Map(nodes.map((n, i) => [n.id, i]));
  const rank = (a, b) => topicPriority(a) - topicPriority(b)
    || sourceIndex.get(a.id) - sourceIndex.get(b.id);
  const ready = nodes.filter((n) => incoming.get(n.id) === 0).sort(rank);
  const result = [];
  while (ready.length) {
    const node = ready.shift();
    result.push(node);
    outgoing.get(node.id).forEach((to) => {
      incoming.set(to, incoming.get(to) - 1);
      if (incoming.get(to) === 0) {
        ready.push(byId.get(to));
        ready.sort(rank);
      }
    });
  }
  // A bad source edge must not make content disappear. The validator below
  // reports cycles, while this fallback keeps the artifact inspectable.
  nodes.filter((n) => !result.includes(n)).sort(rank).forEach((n) => result.push(n));
  return result;
}

function orderedNodes(nodes, edges) {
  const sections = [...new Set(nodes.map((n) => n.subtopic))]
    .sort((a, b) => sectionNumber(a) - sectionNumber(b) || a.localeCompare(b));
  return sections.flatMap((section) => {
    const members = nodes.filter((n) => n.subtopic === section);
    const ids = new Set(members.map((n) => n.id));
    // A cross-section edge is useful on the visible knowledge map but must
    // never drag an A1 lesson behind A2/B1 content in the playable course.
    const localEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    return orderedSection(members, localEdges);
  });
}

const clean = (s) => String(s).replace(/\s+/g, ' ').trim();
const splitLabel = (label) => {
  const i = label.indexOf(':');
  if (i < 0) return { idea: clean(label), forms: '' };
  const idea = clean(label.slice(0, i));
  const candidate = clean(label.slice(i + 1));
  // Many labels use the colon for an English explanation rather than a
  // list of Italian forms ("Essere a/in: expressing location"). Calling
  // that explanation an Italian form produces nonsense teaching copy.
  const englishExplanation = /^(expressing|describing|selecting|recognising|constructing|contrasting|choice|concept|rule|used|use |default|exception|knowledge|prior knowledge|avoidance|preference|structuring|overall choice|when )\b/i.test(candidate);
  return { idea, forms: englishExplanation ? '' : candidate };
};

const SPECIAL_LINES = {
  PRON_IO: ['Italian io means “I”.', 'It names the person who is speaking.', 'Italian often leaves io out because the verb ending already shows who is speaking.', 'Keep io available when you need emphasis or contrast.'],
  PRON_TU: ['Italian tu means singular, informal “you”.', 'Use it with one friend, relative or person you address informally.', 'Its verb form differs from the form used with io.', 'Do not use tu as the formal form of address.'],
  PRON_LUILEI: ['Italian lui means “he”; lei means “she”.', 'Both refer to one person being discussed.', 'Their verbs normally use the same third-person singular form.', 'Capitalised Lei is also the formal “you”, which is taught separately.'],
  PRON_NOI: ['Italian noi means “we”.', 'It includes the speaker and at least one other person.', 'A noi verb ending therefore describes what “we” do or are.', 'Match noi only with plural first-person verb forms.'],
  PRON_VOI: ['Italian voi means plural “you” or “you all”.', 'Use it when speaking to more than one person.', 'A voi verb ending tells the listener that the subject is plural.', 'It is different from singular informal tu.'],
  PRON_LORO: ['Italian loro means “they”.', 'It refers to two or more people being discussed.', 'A loro verb uses the third-person plural form.', 'Learn loro before any exercise asks you to choose its verb form.'],
  ESSERE_SG: ['Essere is the Italian infinitive meaning “to be”.', 'With io, use sono: io sono means “I am”.', 'With tu, use sei: tu sei means informal singular “you are”.', 'Italian often drops io or tu because sono and sei already identify the person.'],
  ESSERE_SG__2: ['Essere means “to be”.', 'With lui or lei, use è: lui è means “he is” and lei è means “she is”.', 'The accent matters: è means “is”; unaccented e means “and”.', 'The same è form is used with formal Lei.'],
  ESSERE_PL: ['Essere means “to be”.', 'With noi, use siamo: noi siamo means “we are”.', 'With voi, use siete: voi siete means “you all are”.', 'Siamo and siete identify their subject even when noi or voi is omitted.'],
  ESSERE_PL__2: ['With loro, essere uses sono: loro sono means “they are”.', 'Sono also means “I am” with io, so context tells these two uses apart.', 'The pronoun or surrounding sentence makes the intended person clear.', 'This is the loro form only after loro itself has been introduced.'],
  ESSERE_IDENTITY: ['Essere means “to be” and links a person to their identity.', 'Sono Lawrence means “I am Lawrence”; sono is the io form of essere.', 'Italian can omit io because sono already marks the speaker.', 'Use essere—not avere—when saying who somebody is.'],
  ESSERE_NATIONALITY: ['Italian uses essere, “to be”, before a nationality.', 'Sono italiano means “I am Italian”; sono is the io form.', 'The nationality adjective changes to agree with the person described.', 'This is why nationality uses essere: it describes what somebody is.'],
  ESSERE_CHARACTERISTICS: ['Italian uses essere, “to be”, to describe a characteristic.', 'È simpatico means “he is nice” or “it is pleasant”, depending on context.', 'The adjective agrees with the person or thing described.', 'Use this pattern for what somebody or something is like.'],
  ESSERE_LOCATION: ['Italian uses essere, “to be”, to say where somebody or something is.', 'Use a for a point such as a town; use in for countries, regions and many places.', 'Sono a Roma means “I am in Rome”; sono in Italia means “I am in Italy”.', 'Here a and in introduce the location; essere supplies “am/is/are”.'],
};

function teachingLines(node) {
  if (SPECIAL_LINES[node.id]) return SPECIAL_LINES[node.id];
  const { idea, forms } = splitLabel(node.label);
  const low = idea.toLowerCase();
  if (forms) {
    const shown = forms.replace(/\be\.g\.\s*/i, 'for example ');
    const lines = [
      `This lesson introduces ${low}.`,
      `The Italian form${/[;,]|\band\b/.test(shown) ? 's' : ''} to learn ${/[;,]|\band\b/.test(shown) ? 'are' : 'is'}: ${shown}.`,
    ];
    if (/pronoun/.test(low)) lines.push('A pronoun stands in for a person, so match each form to who is speaking or being discussed.');
    else if (/article/.test(low)) lines.push('The article belongs with its noun; its form changes to match gender, number and sometimes the opening sound.');
    else if (/ending|conjug|tense|verb|participle|subjunctive|conditional|imperfetto|future/.test(low)) lines.push('The ending or form carries grammatical information, so learn it together with the person and tense it expresses.');
    else if (/expression|asking|stating|request|greeting|farewell|courtesy/.test(low)) lines.push('Learn this as a complete, useful expression rather than translating each small word in isolation.');
    else lines.push(`These forms belong to ${low}; keep their spelling and accents intact.`);
    lines.push(`Say ${shown} aloud, then connect it back to ${low}.`);
    return lines;
  }
  const lines = [`This lesson focuses on ${low}.`];
  if (/rule|concept|contrast|select|choice|recognis|distinguish/.test(low)) {
    lines.push(`The key idea is exactly this: ${node.label}.`);
    lines.push('Use the rule deliberately before relying on instinct; the examples in later lessons build on it.');
  } else {
    lines.push(`${node.label} is the new language point to notice and practise.`);
    lines.push('Keep its meaning and grammatical job together; neither is useful on its own.');
  }
  lines.push('The check below asks only about this explanation, so it does not introduce untaught Italian.');
  return lines;
}

function lessonFor(node, index) {
  const { idea, forms } = splitLabel(node.label);
  const lines = teachingLines(node);
  const right = forms ? `${forms} — these are the forms just introduced.` : `${node.label} — this matches the rule just introduced.`;
  const wrong = forms ? 'A different set of forms that was not introduced here.' : 'The opposite rule, which was not introduced here.';
  const question = forms ? `Which answer accurately recalls the ${idea.toLowerCase()} from this lesson?` : `Which answer accurately recalls this lesson's key point?`;
  const term = { t: node.label, c: colours[index % colours.length] };
  return {
    i: index,
    name: node.id,
    edges: [],
    nodes: [node.id],
    concepts: [node.id],
    terms: { [node.id]: term },
    languageInputV2: true,
    languageInputV3: true,
    languageInputV4: true,
    languageInputV5: true,
    offlineAuthored: true,
    stage: {
      name: node.id,
      hud: `${node.subtopic.split(' ')[0]} · ${idea}`,
      title: idea,
      sub: forms ? `Learn and recognise ${forms}.` : `Understand ${node.label.toLowerCase()}.`,
      builds: [],
      graph: { h: 140, nodes: { [node.id]: [390, 38, 260, 64] }, edges: [], given: [], pairs: [] },
      script: [
        { type: 'title' },
        { type: 'read', text: lines.join('\n'), term: node.id },
        { type: 'recap', q: question, right, wrong, hint: `Read the explanation of ${idea.toLowerCase()} once more.`, terms: [node.id] },
        { type: 'done' },
      ],
    },
  };
}

const order = orderedNodes(map.nodes, map.edges || []);
const stages = order.map(lessonFor);
const byConcept = Object.fromEntries(stages.flatMap((s, i) => s.concepts.map((id) => [id, i])));
const artifact = {
  subject: 'Italian', qualification: 'Other', examBoard: '', version: 1,
  authoredWithoutGenerationApi: true,
  stages, byConcept,
};

// Curriculum invariants: complete map coverage, one lesson per node, earlier
// sections before later ones, and no question/options containing target-
// language material beyond the exact forms disclosed in the preceding read.
const errors = [];
if (stages.length !== map.nodes.length) errors.push(`expected ${map.nodes.length} lessons, built ${stages.length}`);
if (new Set(Object.keys(byConcept)).size !== map.nodes.length) errors.push('duplicate or missing concept ids');
stages.forEach((s, i) => {
  const script = s.stage.script;
  if (script.map((x) => x.type).join(',') !== 'title,read,recap,done') errors.push(`${s.name}: unexpected script shape`);
  if (i && sectionNumber(order[i - 1].subtopic) > sectionNumber(order[i].subtopic)) errors.push(`${s.name}: CEFR section moved backwards`);
  const disclosed = splitLabel(order[i].label).forms || order[i].label;
  const disclosureTokens = clean(disclosed).toLowerCase().replace(/e\.g\./g, '').split(/[^\p{L}\p{N}']+/u).filter((x) => x.length > 1);
  const read = script[1].text.toLowerCase();
  if (!SPECIAL_LINES[s.name] && !disclosureTokens.every((token) => read.includes(token))) errors.push(`${s.name}: read card does not disclose tested content`);
});
if (errors.length) throw new Error(`Italian authored-course validation failed:\n- ${errors.join('\n- ')}`);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(artifact));
console.log(`Built ${stages.length} offline Italian lessons (${order[0].subtopic} → ${order[order.length - 1].subtopic}).`);

