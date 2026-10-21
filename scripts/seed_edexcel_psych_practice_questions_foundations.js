require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT = 'Psychology';
const QUALIFICATION = 'A-Level';
const EXAM_BOARD = 'Edexcel';

function clean(s) { return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function conceptId(subtopic, concept) { return `${clean(SUBJECT)}:${clean(subtopic)}:${clean(concept)}`; }

// Original content written for LastMind - no question, scenario, or level
// descriptor is copied from any real Edexcel past paper or mark scheme.
// The mark scheme STRUCTURE (AO1/AO2/AO3 splits per tariff, number of
// levels, mark bands, the AO1 cap on 16/20-mark essays) reflects the
// REAL, researched Edexcel Psychology (9PS0) conventions, confirmed
// directly against real published mark schemes - facts about how the
// exam works, not copyrightable expression. All wording is independent.

const mc = (options, correctIndex, explanation) => ({ markSchemeType: 'multiple_choice', markSchemeJson: { options, correctIndex, explanation } });
const points = (criteria) => ({ markSchemeType: 'points', markSchemeJson: { criteria } });
const levels = (levelsArr) => ({ markSchemeType: 'levels', markSchemeJson: { levels: levelsArr } });

const T11 = '1.1 Obedience';
const T12 = '1.2 Prejudice';
const T21 = '2.1 Memory';
const T31 = '3.1 Biological explanations of aggression';
const T41 = '4.1 Learning theories and behaviour';

const QUESTIONS = [
  // ───────────────────────── 1.1 Obedience ─────────────────────────
  {
    subtopic: T11, concept: 'Theories of obedience: agency theory and social impact theory',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'According to agency theory, a person moves into which state when they believe responsibility for their actions has shifted to an authority figure?\nA. Agentic state\nB. Autonomic state\nC. Dissonant state\nD. Cognitive state',
        ...mc(['A','B','C','D'], 0, 'Agency theory proposes that obeying an authority figure involves shifting from an autonomous state (acting on one\'s own values) into an agentic state, where the person sees themselves as an agent carrying out someone else\'s wishes and no longer feels personally responsible.'),
        answerStructureAdvice: 'Marked right or wrong - the agentic/autonomous distinction is the whole idea behind agency theory.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Outline social impact theory as an explanation of obedience.',
        ...points([{ name: 'AO1 - identifies at least one factor (strength, immediacy, or number of sources/targets)', marks: 1 }, { name: 'AO1 - accurate further detail on how that factor affects the likelihood of obedience', marks: 1 }]),
        answerStructureAdvice: 'Knowledge only - name a factor from social impact theory and explain briefly how it changes obedience, no evaluation needed here.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one weakness of agency theory as an explanation of obedience.',
        ...points([{ name: 'AO1 - identifies an accurate weakness of agency theory', marks: 2 }, { name: 'AO3 - justifies why this is a genuine weakness', marks: 2 }]),
        answerStructureAdvice: 'Name the weakness clearly first (AO1), then spend equal effort justifying WHY it undermines the theory (AO3) - both halves are worth the same.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss agency theory as an explanation of obedience.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of agency theory. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge and understanding of agency theory. (AO1) A generic evaluative point is made, with limited justification. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge and understanding of agency theory. (AO1) Evaluation is developed with some justification, but may be one-sided. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge and understanding of agency theory. (AO1) A balanced, well-justified evaluation is presented, considering more than one angle. (AO3)' },
        ]),
        answerStructureAdvice: 'AO1 and AO3 are worth 4 marks each here - explain agency theory accurately, then evaluate it (e.g. against research support or an alternative explanation) with equal depth.' },
    ],
  },
  {
    subtopic: T11, concept: "Milgram's research into obedience",
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'In Milgram\'s original obedience study, what percentage of participants continued to the maximum 450 volts?\nA. 0%\nB. 35%\nC. 65%\nD. 100%',
        ...mc(['A','B','C','D'], 2, 'Milgram (1963) found that 65% of participants continued to administer shocks all the way to the maximum 450-volt level, a far higher rate of obedience than most people predicted beforehand.'),
        answerStructureAdvice: 'A factual recall question - learn this figure precisely, it\'s the single most quoted statistic from the study.' },
      { markTariff: 3, requiresDiagram: false,
        questionText: 'Outline the procedure of Milgram\'s original obedience study.',
        ...points([{ name: 'AO1 - identifies the participant/confederate/experimenter set-up and the fake shock generator', marks: 1 }, { name: 'AO1 - identifies the learning task and the escalating shock levels', marks: 1 }, { name: 'AO1 - identifies the experimenter\'s verbal prods used to encourage continuation', marks: 1 }]),
        answerStructureAdvice: 'Knowledge only, three distinct procedural details for the three marks - don\'t repeat the same point in different words.' },
      { markTariff: 6, requiresDiagram: false,
        questionText: 'A new employee is told by their manager to falsify a safety inspection report, even though they know it is wrong to do so. Using this scenario, explain how the presence of an authority figure might increase the employee\'s obedience, and evaluate how well Milgram\'s research explains this behaviour.',
        ...points([{ name: 'AO2 - applies the role of a legitimate authority figure to the manager/employee scenario', marks: 3 }, { name: 'AO3 - evaluates using Milgram\'s findings/variations (e.g. the proximity or uniform variations) to judge how well this explains the scenario', marks: 3 }]),
        answerStructureAdvice: 'Both halves must engage with the SCENARIO specifically - a generic description of Milgram\'s study without reference to the employee/manager situation won\'t earn the application or evaluation marks.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'A soldier is ordered by a senior officer to carry out an action they personally believe is morally wrong. Assess the extent to which Milgram\'s research into obedience can explain the soldier\'s behaviour in this scenario.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of Milgram\'s research. (AO1) Limited or no application to the scenario. (AO2) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge and understanding of Milgram\'s research. (AO1) Some application to the soldier scenario, though it may be generic. (AO2) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge and understanding of Milgram\'s research, including at least one variation study. (AO1) Clear application to the specific features of the scenario. (AO2) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge of Milgram\'s research, including relevant variation studies. (AO1) Sustained, precise application throughout to the soldier scenario. (AO2) A balanced, well-justified evaluation leading to a clear assessment. (AO3)' },
        ]),
        answerStructureAdvice: 'This is an even three-way split (4 marks each for AO1/AO2/AO3) - make sure your answer clearly signals all three: explain the research, apply it explicitly to the soldier, and evaluate how well it really fits.' },
    ],
  },
  {
    subtopic: T11, concept: 'Factors affecting obedience and resistance to obedience',
    questions: [
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Identify one factor that could increase resistance to obedience, and justify your answer.',
        ...points([{ name: 'AO2 - identifies a genuine factor (e.g. peer support, a disobedient model, personality)', marks: 1 }, { name: 'AO3 - justifies why this factor would increase resistance', marks: 1 }]),
        answerStructureAdvice: 'The classic "identify one mark, justify one mark" pattern - name the factor precisely, then add one sentence saying why it works.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one weakness of research into factors affecting obedience.',
        ...points([{ name: 'AO1 - identifies an accurate weakness (e.g. low ecological validity, individual differences not fully controlled)', marks: 2 }, { name: 'AO3 - justifies why this is a genuine weakness', marks: 2 }]),
        answerStructureAdvice: 'Name a real methodological or theoretical weakness, then justify it fully - don\'t just assert it\'s a weakness without explaining why.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss factors affecting obedience and resistance to obedience.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of factors affecting obedience. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of at least one factor. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of more than one factor. (AO1) Developed evaluation with some justification, though it may be one-sided. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of more than one factor. (AO1) A balanced, well-justified evaluation weighing situational and dispositional factors. (AO3)' },
        ]),
        answerStructureAdvice: 'Cover more than one factor (e.g. proximity AND personality) so your evaluation at Level 4 can genuinely weigh situational against dispositional explanations.' },
      { markTariff: 16, requiresDiagram: false,
        questionText: 'Evaluate the extent to which individual differences, such as personality and gender, can explain resistance to obedience.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding of individual differences in obedience. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge and understanding. (AO1) Arguments developed using mostly coherent chains of reasoning leading to a conclusion, though evaluation may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate and thorough knowledge and understanding. (AO1) A well-developed, logical evaluation containing coherent chains of reasoning throughout, considering both individual differences and situational factors, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge (AO1) is capped at 6 of the 16 marks - most of your answer needs to be genuine evaluation (AO3), not a long description of personality/gender research. Bring in a situational factor as a counter-argument to properly weigh "the extent to which".' },
    ],
  },
  // ───────────────────────── 1.2 Prejudice ─────────────────────────
  {
    subtopic: T12, concept: 'Explanations of prejudice: social identity theory and realistic conflict theory',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Social identity theory proposes that prejudice arises mainly because people:\nA. Compete directly for limited real-world resources\nB. Categorise themselves into an in-group and favour it over an out-group to boost self-esteem\nC. Learn prejudiced attitudes purely through direct reinforcement\nD. Inherit prejudiced attitudes genetically',
        ...mc(['A','B','C','D'], 1, 'Social identity theory (Tajfel and Turner) argues that simply categorising people into groups is enough to trigger in-group favouritism and out-group discrimination, as people seek to boost their self-esteem through their group membership - even without any real competition for resources.'),
        answerStructureAdvice: 'Contrast this with realistic conflict theory (option A) - social identity theory doesn\'t require genuine competition, just group categorisation.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Outline social identity theory as an explanation of prejudice.',
        ...points([{ name: 'AO1 - reference to social categorisation into in-groups and out-groups', marks: 1 }, { name: 'AO1 - reference to in-group favouritism/out-group discrimination boosting self-esteem', marks: 1 }]),
        answerStructureAdvice: 'Both stages matter: categorisation happening, and WHY it leads to favouritism (self-esteem).' },
      { markTariff: 6, requiresDiagram: false,
        questionText: 'Explain and evaluate realistic conflict theory as an explanation of prejudice.',
        ...points([{ name: 'AO1 - accurate explanation of realistic conflict theory (competition for scarce resources causing intergroup hostility)', marks: 3 }, { name: 'AO3 - evaluation, e.g. using Sherif\'s research or comparing it against social identity theory', marks: 3 }]),
        answerStructureAdvice: 'Explain the theory fully first (competition over real, scarce resources), then spend equal effort evaluating it, e.g. with research evidence or a genuine limitation.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which social identity theory can explain prejudice between groups.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of social identity theory. (AO1) A conclusion may be presented, but will be generic with limited support. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge and understanding. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge and understanding. (AO1) A well-developed, logical evaluation with coherent chains of reasoning throughout, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'This is a 2-way AO1(6)+AO3(6) split - explain social identity theory in real depth, then weigh it against a genuine limitation or an alternative theory (realistic conflict theory) to reach the top band.' },
    ],
  },
  {
    subtopic: T12, concept: 'Factors affecting prejudice and discrimination',
    questions: [
      { markTariff: 3, requiresDiagram: false,
        questionText: 'Outline one factor that affects the level of prejudice a person shows.',
        ...points([{ name: 'AO1 - names a genuine factor (e.g. personality, culture, situational norms)', marks: 1 }, { name: 'AO1 - accurate further detail on this factor', marks: 1 }, { name: 'AO1 - further accurate development/example of how it affects prejudice', marks: 1 }]),
        answerStructureAdvice: 'Knowledge only, one factor developed across all three marks - depth on one factor rather than briefly naming several.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'A group of football fans from two rival towns are placed together at a shared event. Using this scenario, explain how culture or situational norms might affect the level of prejudice shown, and evaluate this explanation.',
        ...points([{ name: 'AO2 - applies a named factor (culture/situational norms) to the football fans scenario', marks: 2 }, { name: 'AO3 - evaluates how well this factor explains the scenario', marks: 2 }]),
        answerStructureAdvice: 'Reference the SPECIFIC scenario (rival football fans) directly in both halves, not prejudice in general terms.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss factors affecting prejudice and discrimination.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of factors affecting prejudice. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of at least one factor. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of more than one factor. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of more than one factor. (AO1) A balanced, well-justified evaluation weighing individual and situational/cultural factors. (AO3)' },
        ]),
        answerStructureAdvice: 'Cover both an individual-level factor (e.g. personality) and a situational/cultural one so your Level 4 evaluation can genuinely weigh them against each other.' },
      { markTariff: 20, requiresDiagram: false,
        questionText: 'Evaluate the extent to which prejudice can be explained by situational factors rather than individual differences.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge and understanding. (AO1) Arguments developed using mostly coherent chains of reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate knowledge and understanding throughout. (AO1) A logical evaluation with reasoning throughout, considering a range of situational and individual factors, leading to a judgement which may still be imbalanced. (AO3)' },
          { level: 5, marks: '17-20', descriptor: 'Demonstrates accurate and thorough knowledge and understanding throughout. (AO1) A well-developed, fully logical evaluation weighing situational factors against individual differences, leading to a fully balanced, justified conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge (AO1) is capped at 8 of the 20 marks here - the majority of your answer must be genuine, sustained evaluation directly weighing situational explanations (e.g. realistic conflict theory) against individual-difference explanations (e.g. personality), not description of either.' },
    ],
  },
  // ───────────────────────── 2.1 Memory ─────────────────────────
  {
    subtopic: T21, concept: 'The working memory model',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'In the working memory model, which component is responsible for processing visual and spatial information?\nA. Central executive\nB. Phonological loop\nC. Visuo-spatial sketchpad\nD. Episodic buffer',
        ...mc(['A','B','C','D'], 2, 'The visuo-spatial sketchpad is the working memory component responsible for holding and manipulating visual and spatial information, separate from the phonological loop\'s handling of sound-based/verbal information.'),
        answerStructureAdvice: 'Learn each component\'s specific job: central executive (attention/control), phonological loop (sound), visuo-spatial sketchpad (vision/space), episodic buffer (integration).' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Outline the role of the central executive in the working memory model.',
        ...points([{ name: 'AO1 - reference to it controlling attention and coordinating the other components', marks: 1 }, { name: 'AO1 - reference to it having very limited capacity itself', marks: 1 }]),
        answerStructureAdvice: 'Both facts are needed: what it DOES (controls/coordinates), and a limitation of it (very limited capacity).' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one weakness of the working memory model.',
        ...points([{ name: 'AO1 - identifies an accurate weakness (e.g. the central executive is vague/under-specified)', marks: 2 }, { name: 'AO3 - justifies why this is a genuine weakness', marks: 2 }]),
        answerStructureAdvice: 'The vagueness of the central executive is the most commonly cited weakness - name it precisely, then justify why an under-specified component undermines the model\'s explanatory power.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the working memory model as an explanation of short-term memory.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of the working memory model. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of at least one component. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of the model as a whole. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of all components of the model. (AO1) A balanced, well-justified evaluation, e.g. against the multi-store model or using case study evidence. (AO3)' },
        ]),
        answerStructureAdvice: 'Describe ALL the components (not just one) to reach Level 4 knowledge, and use case study evidence (e.g. brain-damaged patients) or a comparison with the multi-store model for genuine evaluation.' },
    ],
  },
  {
    subtopic: T21, concept: 'The multi-store model of memory',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'According to Miller (1956), the capacity of short-term memory is approximately:\nA. 2 items\nB. 7 (plus or minus 2) items\nC. 20 items\nD. Unlimited',
        ...mc(['A','B','C','D'], 1, 'Miller\'s "magic number" of 7 (plus or minus 2) is the classically cited capacity estimate for short-term memory in the multi-store model, distinct from the effectively unlimited capacity proposed for long-term memory.'),
        answerStructureAdvice: 'Remember the specific figure (7±2) and that it applies to STM capacity, not duration.' },
      { markTariff: 3, requiresDiagram: false,
        questionText: 'Outline the multi-store model of memory.',
        ...points([{ name: 'AO1 - identifies the three stores: sensory memory, short-term memory, long-term memory', marks: 1 }, { name: 'AO1 - reference to attention being needed to move information from sensory memory to STM', marks: 1 }, { name: 'AO1 - reference to rehearsal being needed to move information from STM to LTM', marks: 1 }]),
        answerStructureAdvice: 'Three distinct facts needed: the three stores, and the TWO processes (attention, rehearsal) that move information between them.' },
      { markTariff: 6, requiresDiagram: false,
        questionText: 'A student is trying to remember a new phone number for only a few seconds before dialling it. Using this scenario, explain how the multi-store model would account for this, and evaluate this explanation.',
        ...points([{ name: 'AO2 - applies short-term memory\'s limited duration/capacity to the phone-number scenario', marks: 3 }, { name: 'AO3 - evaluates the multi-store model\'s explanation, e.g. using evidence for a single, unitary STM store', marks: 3 }]),
        answerStructureAdvice: 'Keep referring back to the specific scenario (a brief phone number) rather than describing STM in the abstract.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Case studies of brain-damaged patients, such as HM, have been used to investigate memory. Assess the extent to which such case study evidence supports the multi-store model of memory.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of the multi-store model and/or case study evidence. (AO1) Limited or no application to case study evidence. (AO2) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge of the multi-store model. (AO1) Some application of case study evidence, though it may be generic. (AO2) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge of the multi-store model. (AO1) Clear application of specific case study evidence (e.g. HM\'s inability to form new long-term memories). (AO2) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge of the multi-store model. (AO1) Sustained, precise application of case study evidence throughout. (AO2) A balanced, well-justified assessment considering strengths and limitations of case study evidence. (AO3)' },
        ]),
        answerStructureAdvice: 'This needs all three AOs equally - explain the multi-store model, apply real case study detail (what HM specifically could/couldn\'t do), and evaluate how strong that evidence really is (e.g. the problem of generalising from one unique case).' },
    ],
  },
  {
    subtopic: T21, concept: 'Long-term memory: episodic and semantic memory',
    questions: [
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Outline the difference between episodic and semantic memory.',
        ...points([{ name: 'AO1 - definition of episodic memory (personal experiences/events, time-stamped)', marks: 1 }, { name: 'AO1 - definition of semantic memory (general knowledge/facts, not time-stamped)', marks: 1 }]),
        answerStructureAdvice: 'A precise definition of each type is enough for full marks - no examples strictly required.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: "Explain one strength of Tulving's distinction between episodic and semantic memory.",
        ...points([{ name: 'AO1 - identifies an accurate strength (e.g. case study evidence showing a double dissociation)', marks: 2 }, { name: 'AO3 - justifies why this is a genuine strength', marks: 2 }]),
        answerStructureAdvice: 'Case study evidence showing one type of memory can be damaged while the other remains intact is the classic strength to develop here.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the distinction between episodic and semantic long-term memory.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of episodic and/or semantic memory. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of both types of memory. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of both types of memory. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of both types of memory. (AO1) A balanced, well-justified evaluation using research/case study evidence. (AO3)' },
        ]),
        answerStructureAdvice: 'Describe BOTH memory types in depth before evaluating - a good evaluation weighs whether they are genuinely separate systems or simply different aspects of one long-term store.' },
      { markTariff: 16, requiresDiagram: false,
        questionText: 'Evaluate the extent to which case study evidence supports a distinction between episodic and semantic memory.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge and understanding. (AO1) Arguments developed using mostly coherent chains of reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate and thorough knowledge and understanding. (AO1) A well-developed, logical evaluation with coherent reasoning throughout, weighing the strength and the limits of case study evidence, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge is capped at 6 of the 16 marks - most of the answer must directly weigh how CONVINCING case study evidence really is (e.g. the problem of drawing general conclusions from a single unique patient) rather than just describing the case studies.' },
    ],
  },
  {
    subtopic: T21, concept: 'Reconstructive memory and schema theory',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: "Bartlett's 'War of the Ghosts' study is best known for demonstrating that memory:\nA. Has an unlimited capacity\nB. Is an exact, unaltered recording of events\nC. Is actively reconstructed and distorted to fit existing schemas\nD. Only lasts a few seconds without rehearsal",
        ...mc(['A','B','C','D'], 2, 'Bartlett found that when participants recalled the unfamiliar "War of the Ghosts" story over time, their memories became distorted to fit more closely with their own existing cultural schemas - evidence that memory is reconstructive rather than a literal recording.'),
        answerStructureAdvice: 'The core idea of reconstructive memory: recall is actively rebuilt and distorted, not simply replayed.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: "Explain one weakness of Bartlett's theory of reconstructive memory.",
        ...points([{ name: 'AO1 - identifies an accurate weakness (e.g. low control over extraneous variables in his original study)', marks: 2 }, { name: 'AO3 - justifies why this is a genuine weakness', marks: 2 }]),
        answerStructureAdvice: 'A commonly cited weakness is the lack of scientific rigour/control in Bartlett\'s original methodology - name it, then justify why that undermines the theory\'s evidence base.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: "A witness to a car accident later recalls seeing a stop sign that, according to CCTV footage, wasn't actually there. Using this scenario, discuss how schema theory could explain this distortion in the witness's memory.",
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of schema theory. (AO1) Limited or no application to the witness scenario. (AO2)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of schema theory. (AO1) Some application to the scenario, though it may be generic. (AO2)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of schema theory. (AO1) Clear application to the specific details of the witness scenario. (AO2)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of schema theory. (AO1) Sustained, precise application throughout, explaining exactly why a road-related schema would produce this specific distortion. (AO2)' },
        ]),
        answerStructureAdvice: 'This is AO1(4)+AO2(4), no AO3 required - focus on explaining schema theory AND applying it specifically to why a "road junction schema" might insert a stop sign that wasn\'t there.' },
      { markTariff: 20, requiresDiagram: false,
        questionText: 'Evaluate the extent to which reconstructive memory theory can explain errors in eyewitness testimony.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge and understanding. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate knowledge and understanding throughout. (AO1) A logical evaluation with reasoning throughout, considering more than one angle, leading to a judgement which may still be imbalanced. (AO3)' },
          { level: 5, marks: '17-20', descriptor: 'Demonstrates accurate and thorough knowledge and understanding throughout. (AO1) A well-developed, fully logical evaluation weighing reconstructive memory theory against alternative explanations of eyewitness error, leading to a fully balanced, justified conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge is capped at 8 of the 20 marks - the bulk of the answer must be sustained evaluation, ideally weighing schema-driven distortion against other factors affecting eyewitness accuracy (e.g. post-event information, weapon focus) to reach the top band.' },
    ],
  },
  // ───────────────────────── 3.1 Biological explanations of aggression ─────────────────────────
  {
    subtopic: T31, concept: 'The nervous system and synaptic transmission',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A neurotransmitter crosses which structure to pass a signal from one neuron to the next?\nA. The myelin sheath\nB. The synapse\nC. The axon terminal alone\nD. The cell body',
        ...mc(['A','B','C','D'], 1, 'The synapse (synaptic cleft) is the gap between two neurons that a neurotransmitter crosses, released from the presynaptic neuron and binding to receptors on the postsynaptic neuron.'),
        answerStructureAdvice: 'Learn the sequence: electrical signal reaches the axon terminal → neurotransmitter released → crosses the synapse → binds to receptors on the next neuron.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Outline the process of synaptic transmission.',
        ...points([{ name: 'AO1 - reference to neurotransmitter release from the presynaptic neuron', marks: 1 }, { name: 'AO1 - reference to it crossing the synapse and binding to receptors on the postsynaptic neuron', marks: 1 }]),
        answerStructureAdvice: 'Two clear stages: release, then binding on the other side - both needed for full marks.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one weakness of using the effects of recreational drugs to understand the link between neurotransmission and behaviour.',
        ...points([{ name: 'AO1 - identifies an accurate weakness (e.g. drug effects are correlational, individual differences in drug response)', marks: 2 }, { name: 'AO3 - justifies why this is a genuine weakness', marks: 2 }]),
        answerStructureAdvice: 'A strong weakness to develop: drug studies show a correlation between neurotransmitter levels and behaviour, but this doesn\'t prove the neurotransmitter alone causes the behaviour.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the role of neurotransmitters in explaining human behaviour.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of neurotransmitters. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of neurotransmitters and behaviour. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge, including a named neurotransmitter and its link to a specific behaviour. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge, including named neurotransmitters and specific behaviours. (AO1) A balanced, well-justified evaluation weighing biological explanations against alternatives. (AO3)' },
        ]),
        answerStructureAdvice: 'Name specific neurotransmitters (not just "chemicals in the brain") and a specific behaviour they\'re linked to, to reach the higher knowledge bands.' },
    ],
  },
  {
    subtopic: T31, concept: 'Brain structure and aggression',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Reduced activity in which brain area has been most strongly associated with increased aggressive behaviour?\nA. Cerebellum\nB. Prefrontal cortex\nC. Occipital lobe\nD. Primary auditory cortex',
        ...mc(['A','B','C','D'], 1, 'The prefrontal cortex is associated with impulse control and decision-making; reduced activity here has been linked in brain-scanning research to a reduced ability to inhibit aggressive impulses.'),
        answerStructureAdvice: 'Link the prefrontal cortex specifically to impulse CONTROL - reduced activity there means less inhibition of aggressive urges.' },
      { markTariff: 3, requiresDiagram: false,
        questionText: 'Outline the role of the prefrontal cortex in aggression.',
        ...points([{ name: 'AO1 - reference to the prefrontal cortex\'s normal role in impulse control/decision-making', marks: 1 }, { name: 'AO1 - reference to reduced activity being linked to increased aggression', marks: 1 }, { name: 'AO1 - reference to relevant supporting research (e.g. brain-scanning studies of violent offenders)', marks: 1 }]),
        answerStructureAdvice: 'Three distinct facts: its normal function, what happens when that function is reduced, and evidence supporting the link.' },
      { markTariff: 6, requiresDiagram: false,
        questionText: 'A man who suffered a serious head injury affecting his frontal lobe subsequently began showing uncharacteristically impulsive and aggressive behaviour. Using this scenario, explain how brain structure could account for this change, and evaluate this explanation.',
        ...points([{ name: 'AO2 - applies reduced prefrontal cortex function to the man\'s specific change in behaviour', marks: 3 }, { name: 'AO3 - evaluates this explanation, e.g. using brain-scanning evidence or considering alternative causes', marks: 3 }]),
        answerStructureAdvice: 'Keep referring to the specific scenario (a head injury causing a personality change) rather than describing brain structure and aggression in general terms.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which brain structure can explain aggressive behaviour.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of brain structure and aggression. (AO1) A conclusion may be presented, but will be generic with limited support. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge and understanding, including relevant research evidence. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge and understanding, including relevant research evidence. (AO1) A well-developed, logical evaluation weighing brain structure against other explanations, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'A 2-way AO1(6)+AO3(6) split - explain the prefrontal cortex link with real research detail, then weigh it against a non-biological explanation (e.g. social learning theory) to reach the top band.' },
    ],
  },
  {
    subtopic: T31, concept: 'Evolutionary explanations of aggression',
    questions: [
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Outline the evolutionary explanation of aggression.',
        ...points([{ name: 'AO1 - reference to aggression evolving because it increased survival/reproductive success', marks: 1 }, { name: 'AO1 - reference to a specific evolved function (e.g. competing for mates or resources)', marks: 1 }]),
        answerStructureAdvice: 'Both the general principle (natural selection favouring aggression) and one specific function are needed for full marks.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one weakness of the evolutionary explanation of aggression.',
        ...points([{ name: 'AO1 - identifies an accurate weakness (e.g. it struggles to explain modern, non-adaptive aggression)', marks: 2 }, { name: 'AO3 - justifies why this is a genuine weakness', marks: 2 }]),
        answerStructureAdvice: 'A strong weakness: much modern aggression (e.g. road rage) offers no clear survival/reproductive benefit, which the theory struggles to explain.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the evolutionary explanation of human aggression.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of the evolutionary explanation. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of the evolutionary explanation. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of the evolutionary explanation. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of the evolutionary explanation. (AO1) A balanced, well-justified evaluation, e.g. weighing it against a biological or psychodynamic alternative. (AO3)' },
        ]),
        answerStructureAdvice: 'Explain the theory\'s core logic (survival/reproductive advantage) fully, then evaluate using a real limitation or a comparison with an alternative explanation.' },
      { markTariff: 16, requiresDiagram: false,
        questionText: 'Evaluate the extent to which evolutionary theory provides a convincing explanation of human aggression.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge and understanding. (AO1) Arguments developed using mostly coherent chains of reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate and thorough knowledge and understanding. (AO1) A well-developed, logical evaluation with coherent reasoning throughout, considering the theory\'s strengths and its difficulty explaining non-adaptive modern aggression, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge is capped at 6 of the 16 marks - spend most of the answer weighing the theory\'s genuine explanatory power against its difficulty accounting for aggression that offers no survival benefit today.' },
    ],
  },
  {
    subtopic: T31, concept: "Freud's psychodynamic explanation of aggression",
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: "In Freud's structure of personality, which part operates on the 'pleasure principle', seeking immediate gratification of instinctive urges including aggression?\nA. The ego\nB. The superego\nC. The id\nD. The unconscious alone",
        ...mc(['A','B','C','D'], 2, 'The id operates on the pleasure principle, seeking immediate satisfaction of instinctive drives; the ego mediates realistically between the id and the world, while the superego represents internalised moral standards.'),
        answerStructureAdvice: 'Learn each part\'s guiding principle: id = pleasure, ego = reality, superego = morality.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: "Outline Freud's concept of catharsis in relation to aggression.",
        ...points([{ name: 'AO1 - reference to releasing built-up aggressive energy through a safe/substitute outlet', marks: 1 }, { name: 'AO1 - reference to this reducing the likelihood of the energy being expressed harmfully', marks: 1 }]),
        answerStructureAdvice: 'State both what catharsis IS (releasing energy safely) and what it\'s supposed to PREVENT (harmful expression).' },
      { markTariff: 6, requiresDiagram: false,
        questionText: "Explain and evaluate Freud's psychodynamic explanation of aggression.",
        ...points([{ name: 'AO1 - accurate explanation referencing the id, unconscious drives, and/or catharsis', marks: 3 }, { name: 'AO3 - evaluation, e.g. considering the lack of scientific testability of unconscious concepts', marks: 3 }]),
        answerStructureAdvice: 'The lack of scientific testability (unfalsifiability) of unconscious concepts is a strong, commonly used evaluation point here.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: "A man represses feelings of anger towards his employer and later behaves aggressively towards his family instead. Assess the extent to which Freud's psychodynamic explanation can account for the man's behaviour in this scenario.",
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of Freud\'s explanation. (AO1) Limited or no application to the scenario. (AO2) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge. (AO1) Some application to the scenario, though it may be generic. (AO2) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge, including relevant concepts (e.g. displacement, the unconscious). (AO1) Clear application to the specific details of the man\'s situation. (AO2) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge. (AO1) Sustained, precise application throughout, correctly identifying displacement as the mechanism at work. (AO2) A balanced, well-justified assessment. (AO3)' },
        ]),
        answerStructureAdvice: 'The concept of "displacement" (redirecting aggression from its true target to a safer one) is the key idea this scenario is testing - name it explicitly for strong application marks.' },
    ],
  },
  {
    subtopic: T31, concept: 'Hormonal explanations of aggression',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which hormone has been most consistently linked in research to increased aggressive behaviour?\nA. Insulin\nB. Testosterone\nC. Melatonin\nD. Thyroxine',
        ...mc(['A','B','C','D'], 1, 'Testosterone is the hormone most consistently studied and linked to aggressive behaviour, with research showing correlations between testosterone levels and measures of aggression in both animals and humans.'),
        answerStructureAdvice: 'Testosterone is the headline hormone for this topic - know it precisely.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one strength of the hormonal explanation of aggression.',
        ...points([{ name: 'AO1 - identifies an accurate strength (e.g. supporting correlational research, or animal studies showing castration effects)', marks: 2 }, { name: 'AO3 - justifies why this is a genuine strength', marks: 2 }]),
        answerStructureAdvice: 'Name a specific piece of supporting evidence (not just "there is research support") and justify why it strengthens the theory specifically.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the role of testosterone in explaining aggressive behaviour.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of testosterone and aggression. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge, including relevant research evidence. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge, including relevant research evidence. (AO1) A balanced, well-justified evaluation weighing correlational limitations against supporting evidence. (AO3)' },
        ]),
        answerStructureAdvice: 'A key evaluation point: most human testosterone-aggression research is correlational, so causation can\'t be firmly established - weigh this limitation against the theory\'s supporting evidence.' },
      { markTariff: 20, requiresDiagram: false,
        questionText: 'Evaluate the extent to which biological explanations, including brain structure, evolution, and hormones, can account for human aggression.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding of biological explanations. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge of at least one biological explanation. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge of more than one biological explanation. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate knowledge across brain structure, evolution, and hormones. (AO1) A logical evaluation with reasoning throughout, leading to a judgement which may still be imbalanced. (AO3)' },
          { level: 5, marks: '17-20', descriptor: 'Demonstrates accurate and thorough knowledge across all three biological explanations. (AO1) A well-developed, fully logical evaluation weighing the biological approach as a whole against non-biological explanations (e.g. social learning theory), leading to a fully balanced, justified conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge is capped at 8 of the 20 marks - cover more than one biological explanation (brain structure AND hormones, for example) and weigh the biological approach as a whole against a non-biological alternative to reach the top band.' },
    ],
  },
  // ───────────────────────── 4.1 Learning theories and behaviour ─────────────────────────
  {
    subtopic: T41, concept: 'Classical conditioning',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: "In Pavlov's research, the sound of a bell that comes to trigger salivation only after repeated pairing with food is an example of a:\nA. Unconditioned stimulus\nB. Unconditioned response\nC. Conditioned stimulus\nD. Neutral stimulus (before conditioning)",
        ...mc(['A','B','C','D'], 2, 'Before conditioning, the bell is a neutral stimulus producing no salivation; after repeated pairing with food (the unconditioned stimulus), the bell becomes a conditioned stimulus that triggers salivation (now a conditioned response) on its own.'),
        answerStructureAdvice: 'Track the bell across time: neutral stimulus (before) → conditioned stimulus (after learning has occurred).' },
      { markTariff: 2, requiresDiagram: false,
        questionText: "Outline the process of classical conditioning, using Pavlov's research as an example.",
        ...points([{ name: 'AO1 - reference to an unconditioned stimulus/response being paired with a neutral stimulus', marks: 1 }, { name: 'AO1 - reference to the neutral stimulus becoming a conditioned stimulus producing a conditioned response', marks: 1 }]),
        answerStructureAdvice: 'Both stages of the process (the pairing, and the resulting learned association) are needed for full marks.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one weakness of classical conditioning as an explanation of behaviour.',
        ...points([{ name: 'AO1 - identifies an accurate weakness (e.g. it cannot easily explain novel or creative behaviour)', marks: 2 }, { name: 'AO3 - justifies why this is a genuine weakness', marks: 2 }]),
        answerStructureAdvice: 'A commonly used weakness: classical conditioning explains simple, learned associations well, but struggles with complex or original behaviour.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'A child who was once bitten by a dog now shows fear whenever they see any dog, even friendly ones. Using this scenario, discuss how classical conditioning could explain how this phobia was acquired.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of classical conditioning. (AO1) Limited or no application to the child\'s scenario. (AO2)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of classical conditioning. (AO1) Some application to the scenario, though it may be generic. (AO2)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of classical conditioning. (AO1) Clear application to the specific details of the child\'s experience. (AO2)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of classical conditioning, including stimulus generalisation. (AO1) Sustained, precise application throughout, explaining why the fear generalised to ALL dogs. (AO2)' },
        ]),
        answerStructureAdvice: 'AO1(4)+AO2(4), no AO3 needed - the strongest answers explicitly name "stimulus generalisation" to explain why the fear spread from one dog to all dogs.' },
    ],
  },
  {
    subtopic: T41, concept: 'Operant conditioning',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Removing an unpleasant stimulus (such as a loud noise) when a desired behaviour occurs is an example of:\nA. Positive reinforcement\nB. Negative reinforcement\nC. Positive punishment\nD. Negative punishment',
        ...mc(['A','B','C','D'], 1, 'Negative reinforcement involves REMOVING something unpleasant to increase the likelihood of a behaviour - distinct from positive reinforcement, which involves ADDING something pleasant.'),
        answerStructureAdvice: 'Both reinforcement types INCREASE behaviour - positive ADDS a reward, negative REMOVES something unpleasant. Punishment always aims to DECREASE behaviour.' },
      { markTariff: 3, requiresDiagram: false,
        questionText: 'Outline the difference between positive and negative reinforcement.',
        ...points([{ name: 'AO1 - definition of positive reinforcement (adding a pleasant consequence to increase behaviour)', marks: 1 }, { name: 'AO1 - definition of negative reinforcement (removing an unpleasant consequence to increase behaviour)', marks: 1 }, { name: 'AO1 - accurate example of one or both', marks: 1 }]),
        answerStructureAdvice: 'Define both terms precisely, then add one concrete example to secure the third mark.' },
      { markTariff: 6, requiresDiagram: false,
        questionText: "A dog trainer gives a dog a treat every time it sits on command. Using this scenario, explain how operant conditioning shapes the dog's behaviour, and evaluate this explanation.",
        ...points([{ name: 'AO2 - applies positive reinforcement (the treat) to the dog-training scenario', marks: 3 }, { name: 'AO3 - evaluates the explanation, e.g. using evidence from Skinner\'s research or considering schedules of reinforcement', marks: 3 }]),
        answerStructureAdvice: 'Name the specific type of reinforcement at work (positive) and refer to the actual scenario (the treat, the sit command) throughout both halves.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss operant conditioning as an explanation of how behaviour is learned.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of operant conditioning. (AO1) A conclusion may be presented, but will be generic with limited support. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge and understanding, including relevant research (e.g. Skinner). (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge and understanding, including relevant research. (AO1) A well-developed, logical evaluation weighing operant conditioning against alternative explanations, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'A 2-way AO1(6)+AO3(6) split - cover reinforcement AND punishment in your explanation, then evaluate against a genuine limitation (e.g. it struggles to explain behaviour learned purely through observation).' },
    ],
  },
  {
    subtopic: T41, concept: 'Social learning theory',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: "In Bandura's Bobo doll studies, children who saw a model being rewarded for aggression were more likely to imitate it themselves - even without being rewarded personally. This demonstrates:\nA. Classical conditioning\nB. Operant conditioning through direct reinforcement\nC. Vicarious reinforcement\nD. Negative punishment",
        ...mc(['A','B','C','D'], 2, "Vicarious reinforcement is learning that occurs by observing someone ELSE being rewarded for a behaviour, making the observer more likely to imitate it - central to Bandura's social learning theory."),
        answerStructureAdvice: 'The key word is VICARIOUS - the child themselves wasn\'t directly rewarded, they learned from watching someone else be rewarded.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Outline the four stages of social learning: attention, retention, reproduction, and motivation.',
        ...points([{ name: 'AO1 - identifies at least three of the four stages correctly named', marks: 1 }, { name: 'AO1 - accurate brief description of what happens at one or more stages', marks: 1 }]),
        answerStructureAdvice: 'Naming the stages correctly is worth marks on its own - add brief detail on at least one stage for the second mark.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss social learning theory as an explanation of aggressive behaviour.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of social learning theory. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of social learning theory. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge, including reference to Bandura\'s Bobo doll research. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge, including specific research detail. (AO1) A balanced, well-justified evaluation, e.g. weighing it against a biological explanation of aggression. (AO3)' },
        ]),
        answerStructureAdvice: 'Reference Bandura\'s actual research findings by name for the higher knowledge bands, and weigh social learning theory against a biological alternative for strong evaluation.' },
      { markTariff: 16, requiresDiagram: false,
        questionText: 'Evaluate the extent to which social learning theory provides a better explanation of learned behaviour than classical or operant conditioning.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge of social learning theory and one other approach. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge of all relevant theories. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate and thorough knowledge of social learning theory, classical conditioning, and operant conditioning. (AO1) A well-developed, logical evaluation directly comparing all three, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge is capped at 6 of the 16 marks - the bulk of the answer must directly COMPARE social learning theory against classical and operant conditioning (e.g. its ability to explain learning without direct reinforcement) rather than describing each in isolation.' },
    ],
  },
  {
    subtopic: T41, concept: 'Explaining and treating phobias',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: "Systematic desensitisation works mainly by:\nA. Punishing the patient for showing fear\nB. Gradually pairing relaxation with increasingly feared stimuli\nC. Immediately exposing the patient to their most feared stimulus\nD. Removing the patient's memory of the original conditioning event",
        ...mc(['A','B','C','D'], 1, 'Systematic desensitisation uses a graded hierarchy of feared stimuli, gradually pairing each step with relaxation, so the learned fear response is replaced through counter-conditioning - unlike flooding, which uses immediate, full exposure.'),
        answerStructureAdvice: 'The GRADUAL, step-by-step nature (a hierarchy) is what distinguishes systematic desensitisation from flooding.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one weakness of using systematic desensitisation to treat phobias.',
        ...points([{ name: 'AO1 - identifies an accurate weakness (e.g. it can be time-consuming, or symptom substitution may occur)', marks: 2 }, { name: 'AO3 - justifies why this is a genuine weakness', marks: 2 }]),
        answerStructureAdvice: 'Name the weakness precisely, then justify why it matters in practice (e.g. a lengthy treatment reduces how practical/accessible it is).' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'A student developed a severe fear of public speaking after being humiliated during a class presentation. Using this scenario, discuss how learning theory explains the acquisition of the phobia described.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of learning theory. (AO1) Limited or no application to the student\'s scenario. (AO2)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of learning theory. (AO1) Some application to the scenario, though it may be generic. (AO2)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of classical conditioning as applied to phobia acquisition. (AO1) Clear application to the specific details of the humiliating presentation. (AO2)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of classical conditioning. (AO1) Sustained, precise application throughout, correctly identifying the humiliation as the unconditioned stimulus producing the fear response. (AO2)' },
        ]),
        answerStructureAdvice: 'AO1(4)+AO2(4) - identify the humiliating event as the unconditioned stimulus and public speaking as the (now-conditioned) trigger for fear, referring to the scenario throughout.' },
      { markTariff: 20, requiresDiagram: false,
        questionText: 'Evaluate the extent to which treatments based on learning theory are effective at treating phobias.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge of at least one treatment. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge of more than one treatment. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate knowledge of systematic desensitisation and at least one other treatment. (AO1) A logical evaluation with reasoning throughout, leading to a judgement which may still be imbalanced. (AO3)' },
          { level: 5, marks: '17-20', descriptor: 'Demonstrates accurate and thorough knowledge of multiple treatments based on learning theory. (AO1) A well-developed, fully logical evaluation weighing their relative effectiveness and limitations, leading to a fully balanced, justified conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge is capped at 8 of the 20 marks - cover more than one treatment (systematic desensitisation and one other) and spend most of the answer directly weighing their real-world effectiveness, not just describing how each works.' },
    ],
  },
];

function conceptIdFor(subtopic, concept) { return conceptId(subtopic, concept); }

async function main() {
  const rows = [];
  for (const group of QUESTIONS) {
    for (const q of group.questions) {
      rows.push({
        concept_id: conceptIdFor(group.subtopic, group.concept),
        subject: SUBJECT, topic: group.subtopic, concept: group.concept,
        qualification: QUALIFICATION, exam_board: EXAM_BOARD,
        question_text: q.questionText, mark_tariff: q.markTariff,
        requires_diagram: q.requiresDiagram, mark_scheme_type: q.markSchemeType,
        mark_scheme_json: q.markSchemeJson, answer_structure_advice: q.answerStructureAdvice,
      });
    }
  }

  const byConcept = new Map();
  for (const r of rows) byConcept.set(r.concept, (byConcept.get(r.concept) || 0) + 1);
  let shortfall = false;
  for (const [concept, count] of byConcept) {
    if (count < 4) { console.error(`SHORTFALL: "${concept}" only has ${count} questions`); shortfall = true; }
  }
  if (shortfall) process.exit(1);

  console.log(`Inserting ${rows.length} practice questions (Psychology Foundations) across ${byConcept.size} concepts...`);
  const { error } = await supabase.from('practice_questions').insert(rows);
  if (error) { console.error('Insert failed:', JSON.stringify(error)); process.exit(1); }
  console.log('Done.');
}

main();
