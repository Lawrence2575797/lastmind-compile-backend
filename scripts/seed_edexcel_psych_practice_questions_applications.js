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
// Covers all three optional application topics (Criminological, Child,
// Health) in full, alongside the compulsory Clinical topic seeded
// separately, so the practice-question library is complete regardless
// of which option a given school actually teaches.

const mc = (options, correctIndex, explanation) => ({ markSchemeType: 'multiple_choice', markSchemeJson: { options, correctIndex, explanation } });
const points = (criteria) => ({ markSchemeType: 'points', markSchemeJson: { criteria } });
const levels = (levelsArr) => ({ markSchemeType: 'levels', markSchemeJson: { levels: levelsArr } });

const T61 = '6.1 Criminological psychology';
const T71 = '7.1 Attachment';
const T72 = '7.2 Autism';
const T81 = '8.1 Addiction';

const QUESTIONS = [
  // ───────────────────────── 6.1 Criminological psychology ─────────────────────────
  {
    subtopic: T61, concept: 'Biological explanations of criminal behaviour',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The XYY syndrome explanation of criminal behaviour proposes that an extra Y chromosome in males is linked to:\nA. Reduced height only\nB. Increased aggression and criminal behaviour\nC. Improved impulse control\nD. Colour blindness',
        ...mc(['A','B','C','D'], 1, 'The XYY syndrome explanation proposes that males with an extra Y chromosome may show increased aggression, which some researchers have linked to higher rates of criminal behaviour - though the evidence is contested.'),
        answerStructureAdvice: 'Learn XYY as specifically a chromosomal/genetic biological explanation of criminality.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Outline the role of the amygdala in biological explanations of aggression and criminal behaviour.',
        ...points([{ name: 'AO1 - reference to the amygdala\'s role in processing emotion, including fear and aggression', marks: 1 }, { name: 'AO1 - reference to abnormal amygdala functioning being linked to increased aggressive/criminal behaviour', marks: 1 }]),
        answerStructureAdvice: 'State the amygdala\'s normal function first, then the specific abnormality linked to criminal behaviour.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss biological explanations of criminal and anti-social behaviour.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of biological explanations. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of at least one biological explanation. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of more than one biological explanation (e.g. brain injury, XYY syndrome, personality). (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of more than one biological explanation. (AO1) A balanced, well-justified evaluation, e.g. weighing biological explanations against social explanations. (AO3)' },
        ]),
        answerStructureAdvice: 'Cover more than one biological explanation (e.g. brain injury AND XYY syndrome) so your Level 4 evaluation can genuinely weigh the biological approach as a whole against a social explanation.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which personality can explain criminal and anti-social behaviour, taking into account gender differences.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of personality theory. (AO1) A conclusion may be presented, but will be generic with limited support. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge and understanding, with some reference to gender differences in offending. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge and understanding, with clear reference to gender differences in offending patterns. (AO1) A well-developed, logical evaluation leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'The specification explicitly asks for gender differences to be considered here - make sure your answer directly addresses why personality-based explanations might apply differently to male and female offending.' },
    ],
  },
  {
    subtopic: T61, concept: 'Social explanations of criminal behaviour',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The self-fulfilling prophecy explanation of criminal behaviour proposes that a person becomes more likely to offend because:\nA. They inherit criminal tendencies genetically\nB. Being labelled as a "criminal" leads them to internalise and act out that label\nC. Their amygdala is structurally abnormal\nD. They have an extra Y chromosome',
        ...mc(['A','B','C','D'], 1, 'The labelling/self-fulfilling prophecy explanation proposes that once a person is labelled "criminal" or "deviant" by society, they may internalise this identity and behave in ways that confirm it, increasing further offending.'),
        answerStructureAdvice: 'This is a purely SOCIAL explanation - no biology involved, the label itself is what drives the behaviour.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one weakness of the labelling explanation of criminal behaviour.',
        ...points([{ name: 'AO1 - identifies an accurate weakness (e.g. not everyone labelled goes on to offend further)', marks: 2 }, { name: 'AO3 - justifies why this is a genuine weakness', marks: 2 }]),
        answerStructureAdvice: 'A strong weakness: the theory can\'t easily explain why many labelled individuals DON\'T go on to reoffend, suggesting other factors also matter.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss social explanations of criminal and anti-social behaviour.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of social explanations. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of labelling and/or self-fulfilling prophecy. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of social explanations. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of social explanations. (AO1) A balanced, well-justified evaluation, e.g. weighing social explanations against biological alternatives. (AO3)' },
        ]),
        answerStructureAdvice: 'Explain labelling and self-fulfilling prophecy together as a linked pair of ideas, then evaluate against a biological explanation for genuine balance.' },
      { markTariff: 20, requiresDiagram: false,
        questionText: 'Evaluate the extent to which social factors, rather than biological factors, best explain criminal and anti-social behaviour.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge of at least one social explanation. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge of social and biological explanations. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate knowledge of both approaches throughout. (AO1) A logical evaluation with reasoning throughout, leading to a judgement which may still be imbalanced. (AO3)' },
          { level: 5, marks: '17-20', descriptor: 'Demonstrates accurate and thorough knowledge of social and biological explanations throughout. (AO1) A well-developed, fully logical evaluation directly weighing both approaches, leading to a fully balanced, justified conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge is capped at 8 of the 20 marks - cover a social explanation (labelling) AND a biological one (e.g. brain injury) in real depth, then spend most of the answer directly comparing their relative explanatory power.' },
    ],
  },
  {
    subtopic: T61, concept: 'The cognitive interview',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'The cognitive interview technique aims to improve eyewitness recall mainly by:\nA. Asking leading questions to guide the witness\nB. Using memory-retrieval techniques such as mentally reinstating the context of the event\nC. Hypnotising the witness\nD. Only asking closed yes/no questions',
        ...mc(['A','B','C','D'], 1, 'The cognitive interview uses techniques such as context reinstatement (mentally recreating the environment and feelings at the time) and recalling events in a different order, to improve the accuracy and amount of information recalled without leading the witness.'),
        answerStructureAdvice: 'The cognitive interview is specifically designed to AVOID leading questions, unlike standard police interviewing.' },
      { markTariff: 3, requiresDiagram: false,
        questionText: 'Outline two techniques used in the cognitive interview.',
        ...points([{ name: 'AO1 - accurately describes one technique (e.g. context reinstatement)', marks: 1.5 }, { name: 'AO1 - accurately describes a second, different technique (e.g. recalling events in reverse order, or from a different perspective)', marks: 1.5 }]),
        answerStructureAdvice: 'Two genuinely different named techniques, each briefly but accurately described.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the use of the cognitive interview to gather eyewitness evidence.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of the cognitive interview. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of at least one technique. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of multiple techniques. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of multiple techniques. (AO1) A balanced, well-justified evaluation, e.g. weighing improved accuracy against the time/resources needed for training officers to use it properly. (AO3)' },
        ]),
        answerStructureAdvice: 'A strong evaluation point: the cognitive interview requires significantly more time and specialist training than a standard interview, which limits how widely it can realistically be used.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one weakness of the cognitive interview as a way of gathering eyewitness evidence.',
        ...points([{ name: 'AO1 - identifies an accurate weakness (e.g. it takes longer than standard interviews, requiring more police time and specialist training)', marks: 2 }, { name: 'AO3 - justifies why this is a genuine weakness', marks: 2 }]),
        answerStructureAdvice: 'Name the practical limitation clearly, then justify why it genuinely reduces how usable the technique is in real police work, not just in a research setting.' },
    ],
  },
  {
    subtopic: T61, concept: 'Treatments for offenders',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Anger management, used as a treatment for offenders, is best classified as a:\nA. Biological treatment\nB. Cognitive-behavioural treatment\nC. Social explanation\nD. Diagnostic tool',
        ...mc(['A','B','C','D'], 1, 'Anger management is a cognitive-behavioural treatment, helping offenders recognise triggers for anger and develop alternative ways of thinking about and responding to provocative situations.'),
        answerStructureAdvice: 'Anger management targets THOUGHTS and BEHAVIOUR together - hence "cognitive-behavioural".' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Outline one biological treatment for offenders.',
        ...points([{ name: 'AO1 - names a genuine biological treatment (e.g. hormone treatment, improved diet)', marks: 1 }, { name: 'AO1 - accurate brief description of how it aims to reduce offending behaviour', marks: 1 }]),
        answerStructureAdvice: 'Name the treatment precisely, then briefly explain the proposed biological mechanism behind it.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the effectiveness of a cognitive-behavioural treatment for offenders.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of a cognitive-behavioural treatment. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of the treatment. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge, including relevant supporting research on reduced reoffending. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge, including relevant research evidence. (AO1) A balanced, well-justified evaluation weighing effectiveness against a biological treatment alternative. (AO3)' },
        ]),
        answerStructureAdvice: 'Reference real research evidence on reoffending rates, then weigh this treatment\'s effectiveness against a biological alternative for genuine evaluation.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which treatments for offenders are effective at reducing reoffending, taking into account strengths and weaknesses of relevant research.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of treatments for offenders. (AO1) A conclusion may be presented, but will be generic with limited support. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge of one treatment type. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge of both a cognitive-behavioural and a biological treatment. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge of both treatment types, with reference to supporting studies. (AO1) A well-developed, logical evaluation weighing the strengths and weaknesses of the research base itself, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'The question specifically asks about the RESEARCH\'s own strengths/weaknesses - discuss issues like small sample sizes or lack of long-term follow-up in reoffending studies, not just the treatments themselves.' },
    ],
  },
  {
    subtopic: T61, concept: 'Eyewitness testimony',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: '"Weapon focus" refers to the finding that eyewitnesses to a crime involving a weapon:\nA. Remember the weapon and the perpetrator\'s face equally well\nB. Focus attention on the weapon, reducing accurate recall of other details such as the perpetrator\'s face\nC. Always misidentify the wrong suspect\nD. Cannot recall the crime at all',
        ...mc(['A','B','C','D'], 1, 'Weapon focus describes how the presence of a weapon draws an eyewitness\'s attention, reducing the accuracy of their memory for other details, such as the perpetrator\'s face.'),
        answerStructureAdvice: 'Weapon focus is about attention being DRAWN AWAY from other details, not a complete failure to remember anything.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain how post-event information can affect the reliability of eyewitness testimony.',
        ...points([{ name: 'AO1 - reference to misleading information received after an event', marks: 1 }, { name: 'AO1 - reference to this becoming incorporated into (and distorting) the witness\'s memory of the event', marks: 1 }, { name: 'AO3 - brief justification of why this reduces reliability', marks: 2 }]),
        answerStructureAdvice: 'Cover what post-event information IS, how it distorts memory, and why that matters for reliability - all three parts needed.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss factors affecting the reliability of eyewitness testimony.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of factors affecting eyewitness testimony. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of at least one factor. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of more than one factor (e.g. post-event information and weapon focus). (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of more than one factor. (AO1) A balanced, well-justified evaluation, e.g. weighing the real-world implications for the justice system. (AO3)' },
        ]),
        answerStructureAdvice: 'Cover both post-event information AND weapon focus to reach the top knowledge band, and evaluate using the real-world consequence: wrongful convictions based on inaccurate testimony.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which laboratory research into eyewitness testimony can be applied to real-world crimes.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of eyewitness testimony research. (AO1) A conclusion may be presented, but will be generic with limited support. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge, including reference to the artificial, low-stress nature of most laboratory studies. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge, including reference to ecological validity concerns. (AO1) A well-developed, logical evaluation weighing controlled laboratory findings against the emotional intensity of real crimes, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'The core tension to explore: lab studies offer good control but low realism (watching a video is nothing like witnessing a real, stressful crime), which limits how confidently findings generalise.' },
    ],
  },
  {
    subtopic: T61, concept: 'Jury decision-making',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Pre-trial publicity is most likely to affect jury decision-making by:\nA. Making jurors more objective\nB. Creating biased attitudes towards the defendant before the trial even begins\nC. Having no measurable effect at all\nD. Only affecting the judge, never the jury',
        ...mc(['A','B','C','D'], 1, 'Pre-trial publicity - negative media coverage of a case before it reaches court - has been shown to create biased attitudes in potential jurors, potentially undermining a fair trial before the evidence is even presented.'),
        answerStructureAdvice: 'Pre-trial publicity is about bias formed BEFORE the trial starts, based on media coverage rather than courtroom evidence.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Outline one characteristic of a defendant that has been found to influence jury decision-making.',
        ...points([{ name: 'AO1 - names a genuine characteristic (e.g. physical attractiveness, race, accent)', marks: 1 }, { name: 'AO1 - accurate brief description of its typical effect on jury verdicts', marks: 1 }]),
        answerStructureAdvice: 'Name the characteristic precisely, then state the direction of its typical effect (e.g. more attractive defendants tend to be judged less harshly).' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss factors influencing jury decision-making.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of jury decision-making. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of at least one factor. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of more than one factor (e.g. defendant characteristics and pre-trial publicity). (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of more than one factor. (AO1) A balanced, well-justified evaluation, e.g. weighing the implications for a fair trial. (AO3)' },
        ]),
        answerStructureAdvice: 'Cover both defendant characteristics AND pre-trial publicity, and evaluate using the real implication that these biases threaten the fairness of the justice system.' },
      { markTariff: 16, requiresDiagram: false,
        questionText: 'Evaluate the extent to which factors other than the trial evidence itself can influence a jury\'s verdict.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge of at least one non-evidence factor. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge of more than one non-evidence factor (e.g. defendant characteristics and pre-trial publicity). (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate and thorough knowledge of multiple non-evidence factors, including relevant research. (AO1) A well-developed, logical evaluation weighing how much these factors can override the evidence itself, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge is capped at 6 of the 16 marks - the bulk of the answer must weigh HOW MUCH these non-evidence factors genuinely sway real verdicts, not just list what they are.' },
    ],
  },
  // ───────────────────────── 7.1 Attachment ─────────────────────────
  {
    subtopic: T71, concept: "Bowlby's theory of attachment",
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: "According to Bowlby's theory, a child's attachment to their primary caregiver is best described as:\nA. Learned purely through feeding\nB. An innate, evolutionary process that promotes survival\nC. Identical in strength to attachments with all other adults\nD. Only forming after the age of five",
        ...mc(['A','B','C','D'], 1, "Bowlby proposed attachment is an innate, biologically programmed process that evolved because it increases an infant's chances of survival by keeping them close to a protective caregiver - not simply a learned response to feeding."),
        answerStructureAdvice: 'Bowlby\'s theory is EVOLUTIONARY - attachment is innate and adaptive, not learned like a simple habit.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: "Outline what is meant by a 'critical period' in Bowlby's theory of attachment.",
        ...points([{ name: 'AO1 - reference to a specific early time window during which attachment must form', marks: 1 }, { name: 'AO1 - reference to attachment being difficult or impossible to form if this window is missed', marks: 1 }]),
        answerStructureAdvice: 'Both facts matter: WHEN the window is, and WHAT happens if it\'s missed.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: "Discuss Bowlby's theory of attachment.",
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of Bowlby\'s theory. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of Bowlby\'s theory. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge, including concepts such as monotropy and the critical period. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of Bowlby\'s theory. (AO1) A balanced, well-justified evaluation, e.g. weighing it against Ainsworth\'s or a learning theory account of attachment. (AO3)' },
        ]),
        answerStructureAdvice: 'Include the concept of "monotropy" (one primary, uniquely important attachment) alongside the critical period to reach the top knowledge band.' },
      { markTariff: 16, requiresDiagram: false,
        questionText: "Evaluate the extent to which Bowlby's theory of attachment can explain a child's later social and emotional development.",
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge and understanding, including the internal working model concept. (AO1) Arguments developed using mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate and thorough knowledge and understanding, including the internal working model concept. (AO1) A well-developed, logical evaluation weighing supporting evidence against genuine limitations, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge is capped at 6 of the 16 marks - the "internal working model" (the idea that early attachment shapes a template for later relationships) is the key concept linking Bowlby\'s theory to later development, and most of the answer should evaluate how well-supported this claim really is.' },
    ],
  },
  {
    subtopic: T71, concept: "Ainsworth's Strange Situation and attachment types",
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: "In Ainsworth's Strange Situation, a child who shows little distress when the caregiver leaves and avoids contact when they return is classified as:\nA. Securely attached\nB. Insecure-avoidant\nC. Insecure-resistant (ambivalent)\nD. Disorganised",
        ...mc(['A','B','C','D'], 1, "Insecure-avoidant infants show little distress on separation and actively avoid the caregiver on reunion - distinct from insecure-resistant infants, who show significant distress on separation but resist comfort on reunion."),
        answerStructureAdvice: 'Learn each type by BOTH its separation AND reunion behaviour, since the classifications differ on both.' },
      { markTariff: 3, requiresDiagram: false,
        questionText: 'Outline the procedure of the Strange Situation.',
        ...points([{ name: 'AO1 - reference to a series of separations and reunions between infant and caregiver in a novel setting', marks: 1 }, { name: 'AO1 - reference to the introduction of a stranger', marks: 1 }, { name: 'AO1 - reference to the infant\'s behaviour being observed and classified based on separation/reunion responses', marks: 1 }]),
        answerStructureAdvice: 'Three distinct procedural facts - the structure, the stranger element, and what is actually being measured.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: "Discuss Ainsworth's Strange Situation as a way of measuring attachment type.",
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of the Strange Situation. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of the procedure. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of the procedure and attachment types. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of the procedure and attachment types. (AO1) A balanced, well-justified evaluation, e.g. considering cross-cultural validity. (AO3)' },
        ]),
        answerStructureAdvice: 'Cross-cultural research on whether attachment type proportions differ across cultures is the standard, strong evaluation point for this concept.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which the Strange Situation is a valid measure of attachment type across different cultures.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of cross-cultural attachment research. (AO1) A conclusion may be presented, but will be generic with limited support. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge, including reference to cross-cultural variation in attachment type proportions. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge of cross-cultural research findings. (AO1) A well-developed, logical evaluation, e.g. questioning whether the procedure itself carries a cultural (Western) bias, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'A top answer questions whether the Strange Situation itself reflects Western assumptions about ideal caregiving (e.g. independence from the caregiver), rather than assuming any cultural difference in results simply reflects "worse" attachment.' },
    ],
  },
  {
    subtopic: T71, concept: 'Deprivation',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: "Bowlby's maternal deprivation hypothesis proposed that a prolonged early separation from the primary caregiver could lead to:\nA. Improved independence with no negative effects\nB. Long-term emotional and social difficulties\nC. Increased attachment security\nD. No measurable effect on development",
        ...mc(['A','B','C','D'], 1, "Bowlby proposed that prolonged separation or disruption of the primary attachment bond, especially during the critical period, could lead to long-term emotional and social difficulties, which he termed maternal deprivation."),
        answerStructureAdvice: 'Deprivation is specifically about LOSING/DISRUPTING an already-formed bond, distinct from privation (never forming one at all).' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one weakness of research into the effects of deprivation.',
        ...points([{ name: 'AO1 - identifies an accurate weakness (e.g. confounding variables such as poverty or poor-quality substitute care)', marks: 2 }, { name: 'AO3 - justifies why this is a genuine weakness', marks: 2 }]),
        answerStructureAdvice: 'A strong weakness: it\'s hard to isolate deprivation itself from other factors (like poverty or the quality of alternative care) that often occur alongside it.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss research into the short-term and long-term effects of deprivation.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of deprivation research. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of either short-term or long-term effects. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of both short-term and long-term effects. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of both short-term and long-term effects, including how negative effects can be reduced. (AO1) A balanced, well-justified evaluation. (AO3)' },
        ]),
        answerStructureAdvice: 'Cover both the short-term distress AND longer-term effects, plus how negative effects can be reduced (e.g. through good-quality substitute care), to reach the top knowledge band.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which the negative effects of deprivation can be reduced.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of deprivation. (AO1) A conclusion may be presented, but will be generic with limited support. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge, including at least one named way of reducing negative effects (e.g. a consistent, good-quality substitute carer). (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge of ways to reduce negative effects. (AO1) A well-developed, logical evaluation weighing how fully these methods actually protect the child, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Name specific protective factors (a single consistent substitute carer, maintaining contact with the primary caregiver) and evaluate how completely they actually prevent harm, rather than assuming they fully solve the problem.' },
    ],
  },
  {
    subtopic: T71, concept: 'Privation',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Privation differs from deprivation in that privation refers to:\nA. Losing an attachment that had already formed\nB. Never forming an attachment bond in the first place\nC. Forming multiple secure attachments\nD. A brief, one-off separation from the caregiver',
        ...mc(['A','B','C','D'], 1, 'Privation refers to a complete failure to ever form an attachment bond at all, whereas deprivation refers to the loss or disruption of an attachment that had already been formed.'),
        answerStructureAdvice: 'Privation = NEVER forming a bond; deprivation = LOSING one already formed - a key distinction often mixed up.' },
      { markTariff: 2, requiresDiagram: false,
        questionText: 'Outline one effect of privation on a child\'s development.',
        ...points([{ name: 'AO1 - names a genuine effect (e.g. difficulty forming relationships, disinhibited attachment)', marks: 1 }, { name: 'AO1 - accurate further development of this effect', marks: 1 }]),
        answerStructureAdvice: 'Name the effect precisely, then briefly develop it with one further accurate detail.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss research into privation, and whether its negative effects can be reversed.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of privation research. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of privation\'s effects. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge, including reference to whether effects can be reversed with later intervention. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of privation research, including evidence on reversibility. (AO1) A balanced, well-justified evaluation. (AO3)' },
        ]),
        answerStructureAdvice: 'Directly address whether privation\'s effects CAN be reversed - the specification explicitly asks about this, so don\'t just describe the negative effects without discussing recovery potential.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which the negative effects of privation can be reversed through later intervention.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of privation and recovery. (AO1) A conclusion may be presented, but will be generic with limited support. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge, including reference to cases or research on later attachment intervention. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge of recovery evidence. (AO1) A well-developed, logical evaluation weighing genuine recovery against lasting difficulties, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'A balanced answer avoids an all-or-nothing conclusion - use evidence to show SOME recovery is possible with sensitive later care, while some difficulties (e.g. forming deep relationships) can persist.' },
    ],
  },
  {
    subtopic: T71, concept: 'Day care',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Research into day care has generally found that its effects on a child\'s development depend most heavily on:\nA. The exact number of hours spent in day care alone\nB. The quality of the day care provided\nC. The colour of the day care building\nD. Whether the child is male or female',
        ...mc(['A','B','C','D'], 1, "Research consistently suggests that the QUALITY of day care (staff ratios, staff training, consistency of carers) is a more important predictor of outcomes than simply the quantity of time spent in day care."),
        answerStructureAdvice: 'Quality, not just quantity, is the key variable research has focused on.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one advantage and one disadvantage of day care for a child\'s development.',
        ...points([{ name: 'AO1 - identifies a genuine advantage (e.g. improved social skills/peer interaction)', marks: 2 }, { name: 'AO1 - identifies a genuine disadvantage (e.g. increased aggression linked to poor-quality day care)', marks: 2 }]),
        answerStructureAdvice: 'One clear advantage and one clear disadvantage, each briefly developed - don\'t give two advantages or two disadvantages by mistake.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the advantages and disadvantages of day care for a child\'s development.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of day care research. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of advantages and/or disadvantages. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of both advantages and disadvantages. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of both advantages and disadvantages, including what makes good- versus poor-quality day care. (AO1) A balanced, well-justified evaluation. (AO3)' },
        ]),
        answerStructureAdvice: 'Explicitly link outcomes to QUALITY of day care (not day care in general) to reach the top knowledge band and produce a genuinely balanced evaluation.' },
      { markTariff: 16, requiresDiagram: false,
        questionText: 'Evaluate the extent to which day care affects a child\'s social development.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding of day care research. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge and understanding, including reference to peer interaction and/or aggression research. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate and thorough knowledge and understanding, including relevant research on both positive and negative social outcomes. (AO1) A well-developed, logical evaluation weighing quality of care as the key moderating factor, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge is capped at 6 of the 16 marks - the strongest answers make QUALITY of day care the central thread of the whole evaluation, not a side point mentioned once.' },
    ],
  },
  // ───────────────────────── 7.2 Autism ─────────────────────────
  {
    subtopic: T72, concept: 'Autism: features and explanations',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A commonly reported feature of autism is:\nA. Enhanced social communication skills compared to peers\nB. Difficulties with social communication and interaction, alongside restricted/repetitive behaviours\nC. A complete absence of any learning ability\nD. Exclusively affecting adults, never children',
        ...mc(['A','B','C','D'], 1, 'Core features of autism include difficulties with social communication and social interaction, alongside restricted, repetitive patterns of behaviour or interests.'),
        answerStructureAdvice: 'Two core feature categories to remember: social communication/interaction difficulties, AND restricted/repetitive behaviours.' },
      { markTariff: 3, requiresDiagram: false,
        questionText: 'Outline the features of autism.',
        ...points([{ name: 'AO1 - reference to difficulties with social communication and interaction', marks: 1.5 }, { name: 'AO1 - reference to restricted and repetitive patterns of behaviour or interests', marks: 1.5 }]),
        answerStructureAdvice: 'Both feature categories need covering, each with a little more than one word of description.' },
      { markTariff: 6, requiresDiagram: false,
        questionText: 'Explain one biological explanation and one other explanation for autism.',
        ...points([{ name: 'AO1 - accurate biological explanation (e.g. genetic factors, atypical brain development)', marks: 3 }, { name: 'AO1 - accurate non-biological explanation (e.g. theory of mind deficits)', marks: 3 }]),
        answerStructureAdvice: 'One clear biological explanation and one clear alternative (e.g. a cognitive explanation like theory of mind) - equal depth on both for full marks.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss therapies used to help children with autism.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of therapies for autism. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of at least one therapy. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of at least one named therapy. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of therapies for autism. (AO1) A balanced, well-justified evaluation, e.g. weighing effectiveness against individual differences between children. (AO3)' },
        ]),
        answerStructureAdvice: 'A strong evaluation point: autism varies hugely between individuals, so a therapy effective for one child may not suit another - individual differences limit any single "best" therapy claim.' },
    ],
  },
  // ───────────────────────── 8.1 Addiction ─────────────────────────
  {
    subtopic: T81, concept: 'Concepts of addiction: tolerance, dependency and withdrawal',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Tolerance to a drug refers to:\nA. Needing increasingly larger doses to achieve the same effect\nB. Experiencing unpleasant symptoms when the drug is stopped\nC. A psychological craving for the drug\nD. Complete immunity to the drug\'s effects',
        ...mc(['A','B','C','D'], 0, "Tolerance describes the body's adaptation to a drug over repeated use, meaning increasingly larger doses are needed to produce the same effect that a smaller dose once produced."),
        answerStructureAdvice: 'Tolerance is about needing MORE for the SAME effect - don\'t confuse it with withdrawal (option B).' },
      { markTariff: 2, requiresDiagram: false,
        questionText: "Outline the difference between physical and psychological dependency.",
        ...points([{ name: 'AO1 - definition of physical dependency (the body has adapted, producing physical withdrawal symptoms without the drug)', marks: 1 }, { name: 'AO1 - definition of psychological dependency (a strong mental/emotional craving for the drug)', marks: 1 }]),
        answerStructureAdvice: 'Physical = bodily adaptation and withdrawal symptoms; psychological = the mental craving - both distinct types of dependency.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the concepts of tolerance, dependency, and withdrawal in relation to drug addiction.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of these concepts. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of at least one concept. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of tolerance, dependency, and withdrawal together. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of all three concepts and how they relate to each other. (AO1) A balanced, well-justified evaluation, e.g. considering how well these concepts apply across different drugs. (AO3)' },
        ]),
        answerStructureAdvice: 'Show how the three concepts CONNECT (tolerance leads to higher doses, which increases dependency, which produces withdrawal when stopped) rather than describing them as three separate, unrelated facts.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Using an example, explain how withdrawal symptoms can maintain a pattern of drug addiction.',
        ...points([{ name: 'AO1 - reference to unpleasant physical or psychological symptoms occurring when the drug is stopped', marks: 2 }, { name: 'AO2 - applies this to a genuine example (e.g. continuing to smoke to avoid withdrawal irritability/cravings)', marks: 2 }]),
        answerStructureAdvice: 'Name the withdrawal symptoms specifically, then apply them to why avoiding those symptoms keeps the person using the drug rather than stopping.' },
    ],
  },
  {
    subtopic: T81, concept: 'Biological explanations of addiction',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: "Nicotine addiction is biologically explained mainly through its effect on:\nA. Insulin receptors in the pancreas\nB. Acetylcholine receptors, triggering dopamine release in the brain's reward pathway\nC. Melatonin production in the pineal gland\nD. Growth hormone release",
        ...mc(['A','B','C','D'], 1, "Nicotine binds to acetylcholine receptors in the brain, triggering the release of dopamine in the brain's reward pathway, which reinforces the behaviour of smoking - the core biological mechanism behind nicotine addiction."),
        answerStructureAdvice: 'Each drug in the spec (alcohol, heroin, nicotine) has its OWN specific biological mode of action - don\'t mix them up.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one biological explanation for heroin addiction, including its mode of action.',
        ...points([{ name: 'AO1 - reference to heroin binding to opioid receptors in the brain', marks: 2 }, { name: 'AO1 - reference to this triggering intense dopamine release in the reward pathway, reinforcing use', marks: 2 }]),
        answerStructureAdvice: 'Both the specific receptor mechanism AND the resulting reward-pathway effect are needed for full marks - "mode of action" specifically asks for the biological mechanism.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss biological explanations of drug addiction.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of biological explanations. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of at least one drug\'s biological explanation. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of more than one drug\'s biological explanation. (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of biological explanations across more than one drug. (AO1) A balanced, well-justified evaluation, e.g. weighing biological explanations against learning explanations. (AO3)' },
        ]),
        answerStructureAdvice: 'Cover more than one drug\'s biological mechanism (e.g. nicotine AND heroin) so your evaluation can genuinely weigh the biological approach against a learning-based alternative.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which biological factors alone can explain drug addiction, taking into account individual differences.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of biological explanations. (AO1) A conclusion may be presented, but will be generic with limited support. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge and understanding. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge and understanding, with some reference to individual differences (e.g. personality) in vulnerability to addiction. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge and understanding, with clear reference to individual differences in vulnerability. (AO1) A well-developed, logical evaluation leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'The specification explicitly asks about individual differences here - discuss why not everyone exposed to a drug becomes addicted, using personality or genetic vulnerability as your example.' },
    ],
  },
  {
    subtopic: T81, concept: 'Learning explanations of addiction',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'A learning theory explanation of alcohol addiction might propose that drinking is maintained through:\nA. Classical conditioning alone, with no role for reinforcement\nB. Negative reinforcement, as alcohol temporarily relieves stress or anxiety\nC. A structural brain abnormality present from birth\nD. An extra Y chromosome',
        ...mc(['A','B','C','D'], 1, "A learning explanation proposes that alcohol use can be negatively reinforced, because drinking temporarily relieves stress or anxiety, making the person more likely to drink again to achieve that same relief."),
        answerStructureAdvice: 'This mirrors the OCD compulsion pattern - relief from an unpleasant state (stress) is what maintains the behaviour, via negative reinforcement.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain a learning explanation for nicotine addiction, including the role of social learning.',
        ...points([{ name: 'AO1 - reference to observing and imitating role models (e.g. peers or family) who smoke', marks: 2 }, { name: 'AO1 - reference to vicarious reinforcement, e.g. seeing others gain social approval or stress relief from smoking', marks: 2 }]),
        answerStructureAdvice: 'This specifically asks for SOCIAL learning (observation/imitation/vicarious reinforcement), not just classical or operant conditioning alone.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss learning explanations of drug addiction.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of learning explanations. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of at least one learning explanation. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of more than one learning explanation (e.g. negative reinforcement and social learning). (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of learning explanations. (AO1) A balanced, well-justified evaluation, e.g. weighing learning explanations against biological ones. (AO3)' },
        ]),
        answerStructureAdvice: 'Cover more than one learning mechanism (negative reinforcement AND social learning) to reach the top knowledge band, then weigh against a biological explanation for genuine evaluation.' },
      { markTariff: 16, requiresDiagram: false,
        questionText: 'Evaluate the extent to which learning explanations, rather than biological explanations, best explain drug addiction.',
        ...levels([
          { level: 1, marks: '1-4', descriptor: 'Demonstrates isolated elements of knowledge and understanding. (AO1) A conclusion may be presented, but will be generic with limited supporting evidence. (AO3)' },
          { level: 2, marks: '5-8', descriptor: 'Demonstrates mostly accurate knowledge of at least one learning explanation. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '9-12', descriptor: 'Demonstrates accurate knowledge of learning and biological explanations. (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '13-16', descriptor: 'Demonstrates accurate and thorough knowledge of both approaches. (AO1) A well-developed, logical evaluation directly weighing both, e.g. via a combined biopsychosocial argument, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'Knowledge is capped at 6 of the 16 marks - the strongest conclusions argue neither explanation alone is sufficient, combining a biological vulnerability with a learned maintaining mechanism.' },
    ],
  },
  {
    subtopic: T81, concept: 'Treatments for addiction',
    questions: [
      { markTariff: 1, requiresDiagram: false,
        questionText: 'Aversion therapy, used to treat addiction, works by:\nA. Rewarding the person for using the addictive substance\nB. Pairing the addictive substance with an unpleasant stimulus to create a negative association\nC. Removing all memory of the addiction\nD. Increasing the person\'s tolerance to the substance',
        ...mc(['A','B','C','D'], 1, 'Aversion therapy pairs the addictive substance (e.g. alcohol) with an unpleasant stimulus (e.g. a nausea-inducing drug), using classical conditioning to create a new, negative association that reduces the desire to use the substance.'),
        answerStructureAdvice: 'Aversion therapy is a direct application of classical conditioning - creating a NEW unpleasant association to replace the pleasant one.' },
      { markTariff: 4, requiresDiagram: false,
        questionText: 'Explain one weakness of using aversion therapy to treat addiction.',
        ...points([{ name: 'AO1 - identifies an accurate weakness (e.g. high relapse rates once therapy stops, ethical concerns)', marks: 2 }, { name: 'AO3 - justifies why this is a genuine weakness', marks: 2 }]),
        answerStructureAdvice: 'High relapse rates once the unpleasant association fades (extinction) is the strongest, most commonly used weakness here.' },
      { markTariff: 8, requiresDiagram: false,
        questionText: 'Discuss the psychological strategies used in an anti-drug campaign.',
        ...levels([
          { level: 1, marks: '1-2', descriptor: 'Demonstrates isolated elements of knowledge and understanding of an anti-drug campaign. (AO1) Limited or no evaluative comment. (AO3)' },
          { level: 2, marks: '3-4', descriptor: 'Demonstrates mostly accurate knowledge of the campaign\'s strategy. (AO1) A generic evaluative point is made. (AO3)' },
          { level: 3, marks: '5-6', descriptor: 'Demonstrates accurate knowledge of the psychological principle(s) behind the campaign (e.g. fear appeals, social norms messaging). (AO1) Developed evaluation with some justification. (AO3)' },
          { level: 4, marks: '7-8', descriptor: 'Demonstrates accurate and thorough knowledge of the psychological strategy behind a named campaign. (AO1) A balanced, well-justified evaluation of its likely effectiveness. (AO3)' },
        ]),
        answerStructureAdvice: 'Name a specific psychological principle behind the campaign (e.g. using fear appeals, or correcting a false belief that "everyone" uses the drug) rather than just describing what the campaign shows.' },
      { markTariff: 12, requiresDiagram: false,
        questionText: 'Discuss the extent to which two different treatments for the same addiction are equally effective.',
        ...levels([
          { level: 1, marks: '1-3', descriptor: 'Demonstrates isolated elements of knowledge and understanding of treatments for addiction. (AO1) A conclusion may be presented, but will be generic with limited support. (AO3)' },
          { level: 2, marks: '4-6', descriptor: 'Demonstrates mostly accurate knowledge of one treatment. (AO1) Statements show some development, leading to a superficial conclusion. (AO3)' },
          { level: 3, marks: '7-9', descriptor: 'Demonstrates accurate knowledge of two treatments for the same addiction (e.g. aversion therapy and nicotine replacement therapy). (AO1) Arguments developed with mostly coherent reasoning, leading to a conclusion which may be imbalanced. (AO3)' },
          { level: 4, marks: '10-12', descriptor: 'Demonstrates accurate and thorough knowledge of both treatments, including relevant supporting studies. (AO1) A well-developed, logical evaluation directly comparing their relative effectiveness, leading to a balanced conclusion. (AO3)' },
        ]),
        answerStructureAdvice: 'The specification requires TWO treatments for the SAME drug - pick one drug (e.g. nicotine) and compare two genuinely different treatments for it directly against each other, rather than discussing treatments for different drugs.' },
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

  console.log(`Inserting ${rows.length} practice questions (Psychology Applications) across ${byConcept.size} concepts...`);
  const { error } = await supabase.from('practice_questions').insert(rows);
  if (error) { console.error('Insert failed:', JSON.stringify(error)); process.exit(1); }
  console.log('Done.');
}

main();
