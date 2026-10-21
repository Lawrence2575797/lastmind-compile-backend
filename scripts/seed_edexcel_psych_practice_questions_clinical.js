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
// The disorder chosen to represent "one other disorder" in Topic 5 is
// OCD (the spec allows OCD, anorexia nervosa, or unipolar depression -
// OCD is used here as the single most commonly taught choice, for a
// complete and coherent set rather than three thinner ones).

const mc = (options, correctIndex, explanation) => ({ markSchemeType: 'multiple_choice', markSchemeJson: { options, correctIndex, explanation } });
const points = (criteria) => ({ markSchemeType: 'points', markSchemeJson: { criteria } });
const levels = (levelsArr) => ({ markSchemeType: 'levels', markSchemeJson: { levels: levelsArr } });

const T51 = '5.1 Diagnosis and classification';
const T52 = '5.2 Schizophrenia';
const T53 = '5.3 Obsessive-compulsive disorder (OCD)';

const QUESTIONS = [
  // ───────────────────────── 5.1 Diagnosis and classification ─────────────────────────
  {
    subtopic: T51, concept: 'Diagnosis and classification of mental disorders',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which of the following is NOT one of the four criteria (the "4 Ds") commonly used to define abnormality?\nA. Deviance\nB. Dysfunction\nC. Distress\nD. Determinism',
        ...mc(['A','B','C','D'], 3, 'The commonly cited criteria are deviance (differing from social norms), dysfunction (interfering with daily life), distress (causing suffering), and danger (posing a risk to self or others) - determinism is a separate debate in psychology, not one of these four.'),
        answerStructureAdvice: 'Learn the four Ds precisely: deviance, dysfunction, distress, danger.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Outline one strength of using a classification system such as the DSM or ICD to diagnose mental disorders.',
        ...points([{ name: 'AO1 - identifies a genuine strength (e.g. standardised criteria improving reliability across clinicians)', marks: 1 }, { name: 'AO1 - accurate further development of this strength', marks: 1 }]),
        answerStructureAdvice: 'Name the strength precisely (e.g. improved consistency between different clinicians), then briefly develop why that matters.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the reliability and validity of classification systems used to diagnose mental disorders.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of reliability and/or validity in diagnosis. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of reliability and/or validity. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of both reliability and validity in diagnosis. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of both reliability and validity in diagnosis. (AO1) A balanced, well-justified evaluation, e.g. considering cultural or clinician differences in diagnosis. (AO3)' },
        ]),
        answerStructureAdvice: 'Cover BOTH reliability (do different clinicians agree?) and validity (does the diagnosis actually reflect a real, distinct disorder?) to reach the top knowledge band.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which cultural factors can affect the diagnosis of mental disorders.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of cultural factors in diagnosis. (AO1) A conclusion may be presented, but will be generic with limited support. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge and understanding, including a specific example of cultural variation in diagnosis rates. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge and understanding, including specific research/statistics on cultural variation. (AO1) A well-developed, logical evaluation leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'A 2-way AO1(6)+AO3(6) split - use a specific example of cultural bias in diagnosis rates (e.g. differing schizophrenia diagnosis rates across cultural groups) rather than discussing "culture" in the abstract.' },
    ],
  },
  // ───────────────────────── 5.2 Schizophrenia ─────────────────────────
  {
    subtopic: T52, concept: 'Symptoms and features of schizophrenia',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A person with schizophrenia who believes their thoughts are being placed into their mind by an external force is experiencing:\nA. A hallucination\nB. Thought insertion\nC. Disordered thinking\nD. A negative symptom',
        ...mc(['A','B','C','D'], 1, 'Thought insertion is a specific positive symptom of schizophrenia where the person believes thoughts that are not their own have been placed into their mind - distinct from hallucinations (false sensory perceptions).'),
        answerStructureAdvice: 'Learn each named symptom precisely - thought insertion, hallucinations, delusions, and disordered thinking are all distinct.' },
      { markTariff: 3, requiresDiagram: false,
        questionText: 'Outline two symptoms of schizophrenia.',
        ...points([{ name: 'AO1 - accurately describes one symptom (e.g. hallucinations)', marks: 1.5 }, { name: 'AO1 - accurately describes a second, different symptom (e.g. delusions or disordered thinking)', marks: 1.5 }]),
        answerStructureAdvice: 'Two genuinely DIFFERENT symptoms, each briefly but accurately described.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the symptoms and features of schizophrenia.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of schizophrenia\'s symptoms. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of at least one symptom. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of multiple symptoms. (AO1) Developed evaluation with some justification, e.g. considering diagnostic difficulty. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of multiple symptoms. (AO1) A balanced, well-justified evaluation, e.g. weighing the reliability of diagnosing based on subjective symptom reports. (AO3)' },
        ]),
        answerStructureAdvice: 'Describe multiple named symptoms accurately, then evaluate a genuine issue such as the difficulty of reliably diagnosing based on symptoms that vary widely between patients.' },
      { markTariff: 6, requiresDiagram: false,
        questionText: 'A patient tells their doctor they can hear voices commenting on their actions, and believes their neighbours are plotting against them. Using this scenario, explain which symptoms of schizophrenia are being described, and evaluate how useful these symptoms are for reaching a reliable diagnosis.',
        ...points([{ name: 'AO2 - correctly identifies the symptoms in the scenario (auditory hallucinations and a delusion of persecution)', marks: 3 }, { name: 'AO3 - evaluates the reliability of diagnosing based on these self-reported symptoms', marks: 3 }]),
        answerStructureAdvice: 'Name both symptoms precisely using the correct terminology (hallucination, delusion) before evaluating - vague descriptions like "hearing things" won\'t earn full application marks.' },
    ],
  },
  {
    subtopic: T52, concept: 'Biological explanations of schizophrenia',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The dopamine hypothesis of schizophrenia proposes that symptoms are linked to:\nA. Too little dopamine activity in the brain\nB. Excess dopamine activity in certain brain pathways\nC. A complete absence of dopamine receptors\nD. Abnormally low levels of testosterone',
        ...mc(['A','B','C','D'], 1, 'The dopamine hypothesis proposes that schizophrenia symptoms, particularly positive symptoms like hallucinations and delusions, are linked to excess (overactive) dopamine transmission in certain brain pathways.'),
        answerStructureAdvice: 'The dopamine hypothesis is specifically about EXCESS dopamine activity, not a deficiency.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one strength of the dopamine hypothesis as an explanation of schizophrenia.',
        ...points([{ name: 'AO1 - identifies an accurate strength (e.g. antipsychotic drugs that block dopamine reduce symptoms)', marks: 2 }, { name: 'AO3 - justifies why this is genuine supporting evidence', marks: 2 }]),
        answerStructureAdvice: 'The effectiveness of dopamine-blocking antipsychotic drugs is the classic piece of supporting evidence to develop here.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss one biological explanation, other than the dopamine hypothesis, for schizophrenia.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of a biological explanation (e.g. genetic vulnerability). (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of the explanation. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge, including relevant research (e.g. twin/adoption study evidence for a genetic component). (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge, including relevant research evidence. (AO1) A balanced, well-justified evaluation weighing genetic vulnerability against environmental triggers. (AO3)' },
        ]),
        answerStructureAdvice: 'Genetic vulnerability (supported by twin/adoption study evidence showing higher concordance in identical twins) is the standard second biological explanation to use here.' },
      { markTariff: 16, requiresDiagram: false,
        questionText: 'Evaluate the extent to which biological factors can explain schizophrenia.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge of at least one biological explanation. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge of more than one biological explanation. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate and thorough knowledge of the dopamine hypothesis and genetic vulnerability together. (AO1) A well-developed, logical evaluation weighing biological explanations against non-biological alternatives, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge is capped at 6 of the 16 marks - cover both the dopamine hypothesis AND genetic vulnerability, then spend most of the answer weighing them against a non-biological explanation to reach the top band.' },
    ],
  },
  {
    subtopic: T52, concept: 'Non-biological explanations of schizophrenia',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: '"Expressed emotion" as a non-biological explanation of relapse in schizophrenia refers to:\nA. A patient\'s own emotional intelligence\nB. High levels of criticism, hostility, or over-involvement shown by a patient\'s family\nC. A type of antipsychotic medication\nD. A structural abnormality in the brain',
        ...mc(['A','B','C','D'], 1, 'Expressed emotion refers to a family environment high in criticism, hostility, or emotional over-involvement, which research has linked to higher rates of relapse in patients with schizophrenia.'),
        answerStructureAdvice: 'Expressed emotion is specifically about the FAMILY\'S emotional climate towards the patient, not the patient\'s own emotions.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Outline the family dysfunction explanation of schizophrenia.',
        ...points([{ name: 'AO1 - reference to a disturbed family communication style or high expressed emotion', marks: 1 }, { name: 'AO1 - reference to this contributing to the development or relapse of symptoms', marks: 1 }]),
        answerStructureAdvice: 'State both WHAT the family factor is, and its proposed EFFECT on the patient.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss a non-biological explanation for schizophrenia.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of a non-biological explanation. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of the explanation. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge, including relevant research on expressed emotion and relapse. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge, including relevant research. (AO1) A balanced, well-justified evaluation, e.g. considering the direction of cause and effect between family stress and symptoms. (AO3)' },
        ]),
        answerStructureAdvice: 'A strong evaluation point: it\'s hard to establish whether family dysfunction CAUSES relapse, or whether living with a family member\'s symptoms itself causes family stress (reverse causality).' },
      { markTariff: 20, requiresDiagram: false,
        questionText: 'Evaluate the extent to which non-biological factors, rather than biological factors, best explain schizophrenia.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge of at least one non-biological explanation. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge of non-biological and biological explanations. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate knowledge of both approaches throughout. (AO1) A logical evaluation with reasoning throughout, leading to a judgement which may still be imbalanced. (AO3)' },
          { level: 5, marks: '17-20', descriptor: 'Demonstrates accurate and thorough knowledge of non-biological and biological explanations throughout. (AO1) A well-developed, fully logical evaluation directly weighing both approaches, e.g. via a diathesis-stress model combining genetic vulnerability with environmental triggers, leading to a fully balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge is capped at 8 of the 20 marks - the strongest answers argue that neither approach alone is sufficient, using the diathesis-stress model (biological vulnerability combined with an environmental trigger like family stress) as the balanced conclusion.' },
    ],
  },
  {
    subtopic: T52, concept: 'Treatments for schizophrenia',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Antipsychotic drugs used to treat schizophrenia typically work by:\nA. Increasing dopamine activity in the brain\nB. Blocking dopamine receptors in the brain\nC. Increasing testosterone levels\nD. Removing the amygdala\'s function entirely',
        ...mc(['A','B','C','D'], 1, 'Antipsychotic drugs work mainly by blocking dopamine receptors, reducing the excess dopamine activity thought to underlie symptoms - directly following from the dopamine hypothesis.'),
        answerStructureAdvice: 'This links straight back to the dopamine hypothesis - antipsychotics work by blocking the excess activity the hypothesis describes.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one weakness of using antipsychotic drugs to treat schizophrenia.',
        ...points([{ name: 'AO1 - identifies an accurate weakness (e.g. significant side effects, or symptoms returning if medication stops)', marks: 2 }, { name: 'AO3 - justifies why this is a genuine weakness', marks: 2 }]),
        answerStructureAdvice: 'Side effects (or the drug only managing symptoms rather than curing the underlying cause) are the strongest weaknesses to develop here.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the use of cognitive behavioural therapy (CBT) as a psychological treatment for schizophrenia.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of CBT for schizophrenia. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of CBT. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of how CBT helps patients manage delusional beliefs/challenge distorted thinking. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of CBT for schizophrenia. (AO1) A balanced, well-justified evaluation, e.g. comparing its effectiveness to antipsychotic medication. (AO3)' },
        ]),
        answerStructureAdvice: 'Explain how CBT helps patients identify and challenge the distorted thinking behind delusions/hallucinations, then evaluate it against drug treatment for genuine comparison.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which combining biological and psychological treatments is more effective than using either alone for schizophrenia.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of treatments for schizophrenia. (AO1) A conclusion may be presented, but will be generic with limited support. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge of one treatment type. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge of both biological and psychological treatments. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge of both treatment types. (AO1) A well-developed, logical evaluation weighing combined treatment against either alone, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'A 2-way AO1(6)+AO3(6) split - explain both antipsychotics AND CBT, then evaluate the case for combining them (medication managing symptoms while therapy addresses thinking patterns) against using either alone.' },
    ],
  },
  // ───────────────────────── 5.3 OCD ─────────────────────────
  {
    subtopic: T53, concept: 'Symptoms and features of OCD',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'In OCD, a compulsion is best described as:\nA. An intrusive, unwanted thought\nB. A repetitive behaviour or mental act performed to reduce anxiety caused by an obsession\nC. A hallucination\nD. A delusion of persecution',
        ...mc(['A','B','C','D'], 1, 'A compulsion is a repetitive behaviour or mental act (e.g. checking, washing) performed to reduce the anxiety generated by an obsession - the intrusive thought itself is the obsession, a separate feature.'),
        answerStructureAdvice: 'Keep obsession (the thought) and compulsion (the behaviour done in response) clearly separate.' },
      { markTariff: 3, requiresDiagram: false,
        questionText: 'Outline the symptoms and features of OCD.',
        ...points([{ name: 'AO1 - accurate description of obsessions (intrusive, unwanted thoughts)', marks: 1.5 }, { name: 'AO1 - accurate description of compulsions (repetitive behaviours/mental acts reducing anxiety)', marks: 1.5 }]),
        answerStructureAdvice: 'Both obsessions AND compulsions need describing - most answers only cover one and lose marks.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the symptoms and features of OCD.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of OCD\'s symptoms. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of obsessions and/or compulsions. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of both obsessions and compulsions. (AO1) Developed evaluation with some justification, e.g. considering how symptoms vary between patients. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of both obsessions and compulsions. (AO1) A balanced, well-justified evaluation, e.g. weighing the reliability of diagnosis given this symptom variation. (AO3)' },
        ]),
        answerStructureAdvice: 'Describe both symptom types with real detail, then evaluate a genuine issue such as how much OCD symptoms vary between individuals, making consistent diagnosis harder.' },
      { markTariff: 6, requiresDiagram: false,
        questionText: 'A person spends several hours a day checking that the front door is locked, despite already knowing it is, and feels intense anxiety if prevented from checking. Using this scenario, explain which features of OCD are being shown, and evaluate how these features affect daily functioning.',
        ...points([{ name: 'AO2 - correctly identifies the compulsion (checking) and the anxiety-reduction function it serves', marks: 3 }, { name: 'AO3 - evaluates the impact on daily functioning as part of the dysfunction criterion for diagnosis', marks: 3 }]),
        answerStructureAdvice: 'Use the correct terminology (compulsion) rather than just describing the behaviour, and link the time spent/distress explicitly to the "dysfunction" criterion for diagnosing a disorder.' },
    ],
  },
  {
    subtopic: T53, concept: 'Biological explanations of OCD',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Which neurotransmitter has been most closely linked to OCD, with drugs that increase its activity often used as a treatment?\nA. Dopamine\nB. Serotonin\nC. Insulin\nD. Melatonin',
        ...mc(['A','B','C','D'], 1, 'Low levels of serotonin activity have been linked to OCD, and drugs that increase serotonin availability (SSRIs) are a common biological treatment - distinct from the dopamine hypothesis used for schizophrenia.'),
        answerStructureAdvice: 'Don\'t mix this up with schizophrenia\'s dopamine hypothesis - OCD\'s biological explanation centres on serotonin.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one strength of the serotonin explanation of OCD.',
        ...points([{ name: 'AO1 - identifies an accurate strength (e.g. SSRIs increasing serotonin reduce OCD symptoms in many patients)', marks: 2 }, { name: 'AO3 - justifies why this is genuine supporting evidence', marks: 2 }]),
        answerStructureAdvice: 'The effectiveness of SSRIs (which increase serotonin) is the standard supporting evidence to develop.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the genetic explanation of OCD.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of the genetic explanation. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of the genetic explanation. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge, including relevant twin/family study evidence. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge, including relevant research evidence. (AO1) A balanced, well-justified evaluation weighing genetic vulnerability against environmental triggers. (AO3)' },
        ]),
        answerStructureAdvice: 'Reference twin/family study evidence showing higher rates of OCD among relatives of sufferers, then weigh this against the fact that concordance is never 100%, showing environment also plays a role.' },
      { markTariff: 16, requiresDiagram: false,
        questionText: 'Evaluate the extent to which biological factors can explain OCD.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge of at least one biological explanation. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge of more than one biological explanation. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate and thorough knowledge of the serotonin and genetic explanations together. (AO1) A well-developed, logical evaluation weighing biological explanations against non-biological alternatives, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge is capped at 6 of the 16 marks - cover both the serotonin AND genetic explanations, then weigh the biological approach as a whole against a non-biological alternative for the top band.' },
    ],
  },
  {
    subtopic: T53, concept: 'Non-biological explanations of OCD',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A behavioural (learning theory) explanation of OCD proposes that compulsions are maintained through:\nA. Classical conditioning alone\nB. Negative reinforcement, as the compulsion temporarily reduces anxiety\nC. Vicarious reinforcement from observing others\nD. A structural brain abnormality',
        ...mc(['A','B','C','D'], 1, 'The behavioural explanation proposes compulsions are negatively reinforced - performing the compulsive behaviour temporarily removes the anxiety caused by the obsession, making the compulsion more likely to be repeated.'),
        answerStructureAdvice: 'This is a direct application of negative reinforcement from operant conditioning (Topic 4) - the anxiety relief IS the reinforcement.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Outline the behavioural (learning theory) explanation of OCD.',
        ...points([{ name: 'AO1 - reference to an obsession causing anxiety', marks: 1 }, { name: 'AO1 - reference to the compulsion being negatively reinforced by reducing that anxiety', marks: 1 }]),
        answerStructureAdvice: 'Both stages needed: the anxiety-causing obsession, and the reinforcement mechanism maintaining the compulsion.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the cognitive explanation of OCD.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of the cognitive explanation. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of the cognitive explanation. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge, e.g. reference to an inflated sense of responsibility for harm. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of the cognitive explanation. (AO1) A balanced, well-justified evaluation, e.g. weighing it against the behavioural explanation. (AO3)' },
        ]),
        answerStructureAdvice: 'The cognitive explanation centres on distorted thinking, such as an inflated sense of personal responsibility for preventing harm - explain this clearly before evaluating.' },
      { markTariff: 20, requiresDiagram: false,
        questionText: 'Evaluate the extent to which non-biological factors, rather than biological factors, best explain OCD.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge of at least one non-biological explanation. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge of non-biological and biological explanations. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate knowledge of both approaches throughout. (AO1) A logical evaluation with reasoning throughout, leading to a judgement which may still be imbalanced. (AO3)' },
          { level: 5, marks: '17-20', descriptor: 'Demonstrates accurate and thorough knowledge of non-biological and biological explanations throughout. (AO1) A well-developed, fully logical evaluation directly weighing both approaches, leading to a fully balanced, justified conclusion, e.g. via a diathesis-stress model. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge is capped at 8 of the 20 marks - cover both a cognitive/behavioural explanation and a biological one, and use a combined (diathesis-stress) argument for the most balanced top-band conclusion.' },
    ],
  },
  {
    subtopic: T53, concept: 'Treatments for OCD',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Exposure and Response Prevention (ERP), used to treat OCD, involves:\nA. Avoiding all situations that trigger obsessions\nB. Gradually exposing the patient to anxiety-triggering situations while preventing the compulsive response\nC. Prescribing SSRIs alongside no other treatment\nD. Removing the amygdala surgically',
        ...mc(['A','B','C','D'], 1, 'ERP is a behavioural therapy that gradually exposes patients to situations that trigger their obsessions, while preventing them from carrying out the usual compulsive response, so the anxiety extinguishes over time.'),
        answerStructureAdvice: 'The KEY feature is preventing the compulsion during exposure - this is what breaks the negative reinforcement cycle.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one weakness of using SSRIs to treat OCD.',
        ...points([{ name: 'AO1 - identifies an accurate weakness (e.g. side effects, or relapse if medication is stopped)', marks: 2 }, { name: 'AO3 - justifies why this is a genuine weakness', marks: 2 }]),
        answerStructureAdvice: 'A strong weakness: SSRIs manage symptoms rather than address the underlying cause, so symptoms can return once medication stops.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the use of Exposure and Response Prevention (ERP) as a treatment for OCD.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of ERP. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of ERP. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of how ERP works, linking to the behavioural explanation of OCD. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of ERP. (AO1) A balanced, well-justified evaluation, e.g. comparing its effectiveness and drop-out rates to drug treatment. (AO3)' },
        ]),
        answerStructureAdvice: 'Link ERP explicitly back to the behavioural explanation (it directly targets the negative reinforcement cycle), then evaluate a real issue such as high patient drop-out due to the distress of exposure.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which a combination of drug treatment and ERP is more effective than either alone for treating OCD.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of treatments for OCD. (AO1) A conclusion may be presented, but will be generic with limited support. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge of one treatment type. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge of both SSRIs and ERP. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge of both treatment types. (AO1) A well-developed, logical evaluation weighing combined treatment against either alone, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'A 2-way AO1(6)+AO3(6) split - explain both SSRIs AND ERP, then evaluate the case that reduced anxiety from medication can make ERP\'s exposure sessions more tolerable, supporting combined treatment.' },
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

  console.log(`Inserting ${rows.length} practice questions (Psychology Clinical) across ${byConcept.size} concepts...`);
  const { error } = await supabase.from('practice_questions').insert(rows);
  if (error) { console.error('Insert failed:', JSON.stringify(error)); process.exit(1); }
  console.log('Done.');
}

main();
