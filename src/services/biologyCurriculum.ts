import curriculum from '../data/aqaBiologyHigher.json';
import sources from '../data/aqaBiologySources.json';

export interface BiologyObjective {
  id: string;
  label: string;
  objective: string;
  essentialPoints: string[];
  specRefs: string[];
  kind: string;
}
const byLabel = new Map<string, BiologyObjective>(curriculum.nodes.map(node => [node.label, node]));
const rankByLabel = new Map(curriculum.nodes.map((node, rank) => [node.label, rank]));

export function isAqaBiologyHigher(subject: string, qualification: string, examBoard: string): boolean {
  return subject.trim().toLowerCase() === 'biology' && qualification.trim().toLowerCase() === 'gcse higher' && examBoard.trim().toLowerCase() === 'aqa';
}

export function biologyThemeMap(): Map<string, string> {
  return new Map(curriculum.nodes.map(node => [node.subtopic, node.theme]));
}

export function biologyCurriculumStatus() {
  return { subject: curriculum.subject, qualification: curriculum.qualification, examBoard: curriculum.examBoard,
    specification: curriculum.specification, revision: curriculum.revision, rule17: curriculum.rule17,
    nodes: curriculum.nodes.length, edges: curriculum.edges.length };
}

// The authored map is already topologically sorted. No paid AI ordering call
// should be triggered by opening the map or its Notes page.
export function biologyNodeOrder(nodes: { id: string; label: string }[]): string[] {
  return [...nodes].sort((a, b) => (rankByLabel.get(a.label) ?? Infinity) - (rankByLabel.get(b.label) ?? Infinity)).map(n => n.id);
}

export function biologySourceContext(objective: BiologyObjective): string {
  const excerpts: string[] = [];
  for (const ref of objective.specRefs) {
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const source of sources) {
      const match = new RegExp(`(?:^|\\n)${escaped}(?:\\s|$)`).exec(source.text);
      if (!match) continue;
      const tail = source.text.slice(match.index).trimStart();
      const next = tail.slice(1).search(/\n(?:4\.\d+(?:\.\d+)* |8\.2\.\d+ |WS \d\.\d )/);
      const excerpt = next >= 0 ? tail.slice(0, next + 1) : tail;
      excerpts.push(`${source.url}\n${excerpt.slice(0, 5000)}`);
      break;
    }
  }
  return excerpts.join('\n\n').slice(0, 10000);
}

export function getBiologyObjective(node: { subject: string; qualification: string; exam_board: string; label: string }): BiologyObjective | undefined {
  if (!isAqaBiologyHigher(node.subject, node.qualification, node.exam_board)) return undefined;
  return byLabel.get(node.label);
}

export const BIOLOGY_ATOMIC_LESSON_RULES = `
COURSE OVERRIDE: AQA GCSE Higher separate Biology 8461, including Higher-only and biology-only content. The supplied objective is the ENTIRE scope of this lesson. Teach exactly ONE new independently testable idea, with at most FOUR supporting points; prerequisites are already known and downstream concepts must not be introduced. Practical rule 17 remains active: a procedure lesson teaches its single specified step, a concept lesson teaches the biology, an application lesson uses the specified procedure and concept, and an evaluation critiques only its specified step.
The immediate post-reading practiceQuestion is a recall test of EVERY taught point, not an exam question that samples one detail or demands untaught transfer. Do not reveal answers in the question. Include all required defining conditions, directions, units or mechanisms in its mark scheme. Four later recallChecks must each cover the SAME complete atomic objective. For this course use four free_text checks with different wording/examples (override the generic mixed-format rule). Each asks for all taught points, but never new facts. Every question must be self-contained: supply the observations, numerical data or description needed to answer; never refer to a missing image, graph, table or apparatus diagram.
Add atomicConceptId equal to the supplied objective ID; taughtPoints is an array of 1-4 objects {id,text}, all supporting that ONE idea, not separate concepts. Add testedPointIds to practiceQuestion and each recallCheck, listing every taughtPoints ID exactly once; the question must actually elicit each listed point and the mark scheme must require each one. explanation has a hard cap of 100 words. practiceQuestion must use reading or writing modality and a words or math input.
Use AQA's scientific marking principles: credit equivalent scientifically correct wording and unambiguous phonetic spellings, accept suitable symbols/formulae, require units only where relevant and requested, reject substantive contradictory statements. Distinguish required points from acceptable alternatives. LastMind uses a binary learning check, NOT an AQA exam mark total: all essential taught points must be correct; do not award correctness just for one keyword. Do not require detailed mitosis/meiosis phases, nephron anatomy, mRNA/tRNA structure, detailed phloem loading, or the nitrogen cycle. Do not claim an original generated question is an official AQA past-paper question.`;

type AtomicQuestion = { questionText?: unknown; markScheme?: unknown; testedPointIds?: unknown; format?: unknown };
export function validateBiologyEncodingLesson(value: unknown, objective: BiologyObjective): void {
  const content = value as { atomicConceptId?: unknown; explanation?: unknown; taughtPoints?: unknown; practiceQuestion?: AtomicQuestion; recallChecks?: unknown } | null;
  if (!content || content.atomicConceptId !== objective.id) throw new Error('Biology lesson has the wrong atomic objective');
  if (typeof content.explanation !== 'string' || !content.explanation.trim() || content.explanation.trim().split(/\s+/u).length > 100) throw new Error('Biology encoding text must contain 1-100 words');
  if (!Array.isArray(content.taughtPoints) || content.taughtPoints.length < 1 || content.taughtPoints.length > 4) throw new Error('Biology lesson exceeds the four-point ceiling');
  const ids: string[] = [];
  for (const point of content.taughtPoints) {
    if (!point || typeof point.id !== 'string' || !point.id || typeof point.text !== 'string' || !point.text.trim()) throw new Error('Biology lesson has an invalid taught point');
    ids.push(point.id);
  }
  if (new Set(ids).size !== ids.length) throw new Error('Biology taught-point IDs must be unique');
  function checkQuestion(question: AtomicQuestion | undefined): void {
    if (!question || typeof question.questionText !== 'string' || !question.questionText.trim() || typeof question.markScheme !== 'string' || !question.markScheme.trim()) throw new Error('Biology recall question or mark scheme is missing');
    if (!Array.isArray(question.testedPointIds) || question.testedPointIds.length !== ids.length || new Set(question.testedPointIds).size !== ids.length || ids.some(id => !(question.testedPointIds as unknown[]).includes(id))) throw new Error('Biology recall check omits a taught point');
  }
  checkQuestion(content.practiceQuestion);
  if (!Array.isArray(content.recallChecks) || content.recallChecks.length !== 4) throw new Error('Biology lesson requires four complete recall checks');
  for (const question of content.recallChecks) {
    if (question.format !== 'free_text') throw new Error('Biology recall checks must test complete free recall');
    checkQuestion(question);
  }
}
