// Two-call pipeline: GENERATION (per subtopic) -> VERIFICATION (whole batch)
// -> apply fixes -> validate as a DAG. Mirrors exactly what happened by
// hand in the Claude Code session that designed these prompts: generate,
// then have a separate, dedicated pass hunt for the blind-comprehension
// gaps, missing cross-links, and ordering bugs a single pass reliably
// misses.
//
// Uses YOUR OWN Anthropic API key (never Claude Code) - this is real
// production content generation for LastMind, so it must run through the
// Commercial/API terms, not a personal session.
//
// Usage: node scripts/generate_knowledge_map.js
// Requires ANTHROPIC_API_KEY in the environment (see .env.example).
// Edit SUBJECT/QUALIFICATION/EXAM_BOARD and SUBTOPICS below before running.

// override:true - a stale CLAUDE_API_KEY/Claude_API_KEY inherited from the
// parent shell's own process environment (Windows env vars are case-
// insensitive) otherwise wins over whatever this project's own .env says,
// since dotenv's default behavior never overrides an already-set variable.
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// knowledgeMapPrompts.ts is TypeScript (consumed normally by the compiled
// backend); this script runs as plain Node like every other file in
// scripts/, so it can't require() a .ts file directly without a build
// step. Extract the exported template-literal constants as text instead,
// rather than adding a TS toolchain dependency to a one-off script.
function extractPromptConstant(source, name) {
  const marker = `export const ${name} = \``;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find ${name} in knowledgeMapPrompts.ts`);
  const contentStart = start + marker.length;
  const end = source.indexOf('`;', contentStart);
  if (end === -1) throw new Error(`Could not find the end of ${name}`);
  return source.slice(contentStart, end);
}
const promptsSource = fs.readFileSync(path.join(__dirname, '../src/constants/knowledgeMapPrompts.ts'), 'utf8');
const KNOWLEDGE_MAP_GENERATION_PROMPT_BASE = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_GENERATION_PROMPT');
const KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE');
const KNOWLEDGE_MAP_COVERAGE_PROMPT = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_COVERAGE_PROMPT');
const KNOWLEDGE_MAP_VERIFICATION_PROMPT_BASE = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_VERIFICATION_PROMPT');
const KNOWLEDGE_MAP_VERIFICATION_PROMPT_PRACTICAL_CHECK = extractPromptConstant(promptsSource, 'KNOWLEDGE_MAP_VERIFICATION_PROMPT_PRACTICAL_CHECK');

// Rule 17 (and its matching verification check) only ever fires for a
// subject with real lab/fieldwork content - sending it on every subtopic
// call for a subject like Economics is pure dead input cost (and a
// standing invitation for the model to go looking for practical content
// that was never asked for). Set this per subject, not per call.
const HAS_PRACTICAL_CONTENT = false; // true for Chemistry/Biology/Physics-style specs
const KNOWLEDGE_MAP_GENERATION_PROMPT = KNOWLEDGE_MAP_GENERATION_PROMPT_BASE.replace(
  '{{PRACTICAL_RULE}}',
  HAS_PRACTICAL_CONTENT ? KNOWLEDGE_MAP_GENERATION_PROMPT_PRACTICAL_RULE : ''
);
const KNOWLEDGE_MAP_VERIFICATION_PROMPT = KNOWLEDGE_MAP_VERIFICATION_PROMPT_BASE.replace(
  '{{PRACTICAL_CHECK}}',
  HAS_PRACTICAL_CONTENT ? KNOWLEDGE_MAP_VERIFICATION_PROMPT_PRACTICAL_CHECK : ''
);

// Same env var claudeClient.ts already reads - not ANTHROPIC_API_KEY.
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Matches the draft/gate split already established by
// chainGenerationSimple + factCheck in claudeClient.ts, not
// chainGeneration + factCheck (both-Opus) - generation here is a
// structured decomposition task against explicit rules, which Sonnet
// handles reliably; verification is the precision-critical judgment call
// (is this edge actually wrong, is this really a duplicate) applied
// across the whole batch at once, where Opus's extra reasoning capacity
// earns its cost. The cost delta between the two options is trivial
// either way at this volume (roughly $1-1.50 per subject) - this is a
// quality choice, not a cost one.
const GENERATION_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const VERIFICATION_MODEL = 'claude-opus-5';
// Coverage-checking against the raw spec text is a completeness GATE,
// not a draft - same reasoning as VERIFICATION_MODEL, and the class of
// error it exists to catch (a whole named theory silently dropped) is
// exactly the kind of thing worth an unconditional Opus check regardless
// of which model drafted the subtopic.
const COVERAGE_MODEL = 'claude-opus-5';
const MAX_COVERAGE_ROUNDS = 2;

// Each of the three system prompts below is byte-identical across every
// subtopic call in a run (and across coverage-check/regenerate retries
// for the same subtopic) - wrapping it as a cached content block means
// only the FIRST call in a run pays full input price for it; every
// subsequent call within the ~5 minute cache window reads it back at a
// steep discount instead of repaying for the same ~1-2k token ruleset
// 15-20+ times per subject.
function cachedSystem(promptText) {
  return [{ type: 'text', text: promptText, cache_control: { type: 'ephemeral' } }];
}

// Hard spend ceiling for THIS run, checked before every API call and
// after every response - not just an estimate printed at the end. Set
// deliberately close to (not far above) the quoted estimate for this
// specific subject, since the whole point of asking for a cap is that it
// actually holds, not that it's generous. Standard (non-intro) per-token
// rates are used for the running total on purpose: if intro pricing
// applies, real spend comes in under what this tracker reports, which is
// the safe direction to be wrong in for a cap - never the other way.
// User's cap is £5 - converted to USD (this account's own billing
// currency) with a deliberate safety margin below the ~$6.35 straight
// conversion at current rates, both for exchange-rate drift and because a
// cap should hold with room to spare, not sit exactly on the line.
const SPEND_CAP_USD = 3.0;
const PRICING_PER_MTOK = {
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-opus-5': { in: 5, out: 25 },
};
let totalSpendUsd = 0;
function recordUsage(model, usage) {
  const p = PRICING_PER_MTOK[model];
  if (!p || !usage) return;
  const inTok = usage.input_tokens || 0;
  const cacheWriteTok = usage.cache_creation_input_tokens || 0;
  const cacheReadTok = usage.cache_read_input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  const cost = (inTok * p.in + cacheWriteTok * p.in * 1.25 + cacheReadTok * p.in * 0.1 + outTok * p.out) / 1e6;
  totalSpendUsd += cost;
  console.error(`  [spend] +$${cost.toFixed(4)} (${model}) -> running total $${totalSpendUsd.toFixed(4)} / $${SPEND_CAP_USD} cap`);
  if (totalSpendUsd >= SPEND_CAP_USD) {
    throw new Error(`SPEND CAP REACHED: running total $${totalSpendUsd.toFixed(4)} has hit the $${SPEND_CAP_USD} cap for this run. Stopping before starting further calls - re-run with a higher SPEND_CAP_USD if this was expected and you want to continue from the checkpoint.`);
  }
}
// Checked at the START of every call site too (not just after), so a
// chunk that's already at/over cap from a sibling call refuses to even
// start its own next API call rather than only noticing after paying for it.
function assertUnderCap() {
  if (totalSpendUsd >= SPEND_CAP_USD) {
    throw new Error(`SPEND CAP REACHED: running total $${totalSpendUsd.toFixed(4)} already at/over the $${SPEND_CAP_USD} cap - refusing to start another call.`);
  }
}

const SUBJECT = 'Spanish';
const QUALIFICATION = 'Other';
const EXAM_BOARD = '';

// Fill in with the REAL specification content for each subtopic - the
// actual named theories/concepts from the syllabus. Generation quality is
// bounded by what's given here; do not leave this to the model's own
// possibly-stale recall of the spec.
const SUBTOPICS = [
  {
    subtopic: "A1.1 Greetings, introductions and register",
    specContent: `A1.1 Greetings, introductions and register

Content - what students need to learn:
- Formal and informal greetings: buenos dias, buenas tardes, buenas noches, hola, adios, hasta luego, hasta manana.
- Introducing yourself and others: me llamo..., ¿como te llamas? (informal) / ¿como se llama? (formal), mucho gusto / encantado(a).
- Subject pronouns: yo, tu, el/ella/usted, nosotros(as), vosotros(as) (Spain) / ustedes, ellos/ellas; the formal "usted" as a distinct form of address for a stranger/elder, contrasted with informal "tu".
- Basic courtesy expressions: por favor, gracias, de nada, perdon, disculpe.
- Asking and saying where someone is from: ¿de donde eres? / ¿de donde es usted? soy de...
- Nationalities and their masculine/feminine/plural agreement (espanol/espanola/espanoles/espanolas, ingles/inglesa/ingleses/inglesas).
- Basic yes/no and question words: si, no, que, donde, cuando, por que, quien, como, cuanto.`
  },
  {
    subtopic: "A1.2 Numbers, time and dates",
    specContent: `A1.2 Numbers, time and dates

Content - what students need to learn:
- Cardinal numbers 0-100, and the pattern for numbers above 100 (cien, doscientos, mil).
- Telling the time: ¿que hora es? son las..., es la una, y cuarto/media, menos cuarto.
- Days of the week (lunes-domingo) and asking/stating what day it is.
- Months of the year and stating a date (el + number + de + month) - unlike English, Spanish uses the plain CARDINAL number even for the 1st (el uno de mayo), though "el primero" is common in Latin America.
- Seasons (la primavera, el verano, el otono, el invierno).
- Asking and giving simple ages: ¿cuantos anos tienes? tengo ... anos (using tener, not ser, for age - a common English-speaker error point).`
  },
  {
    subtopic: "A1.3 Articles, gender, plurals and agreement",
    specContent: `A1.3 Articles, gender, plurals and agreement

Content - what students need to learn:
- Noun gender: regular -o (masculine) and -a (feminine) endings, common exceptions (el dia, la mano), and -e/consonant-ending nouns that must be learned individually.
- Plural formation: add -s after a vowel, -es after a consonant, -z changes to -ces (lapiz -> lapices).
- Definite articles (el, la, los, las) and the neuter article "lo" used with adjectives to name an abstract quality (lo bueno = "the good thing/part").
- Indefinite articles (un, una, unos, unas).
- Adjective agreement with the noun in gender and number.
- Position of adjectives (generally after the noun; a small set can precede it, sometimes changing meaning - un hombre grande "a big man" vs un gran hombre "a great man").`
  },
  {
    subtopic: "A1.4 Present tense: ser, estar and regular verbs",
    specContent: `A1.4 Present tense: ser, estar and regular verbs

Content - what students need to learn:
- Present tense conjugation of ser (soy, eres, es, somos, sois, son) and its core uses: identity, nationality, characteristics, profession, time, and where an event takes place.
- Present tense conjugation of estar (estoy, estas, esta, estamos, estais, estan) and its core uses: location of people/things, temporary states/conditions (estoy cansado), and forming the progressive tense (estoy comiendo).
- THE ser/estar distinction: both translate English "to be", but ser is for permanent/defining characteristics and estar for location and temporary states - the single most important grammar contrast at this level (e.g. "es alto" = he's tall (permanent trait) vs "esta cansado" = he's tired (temporary state)).
- Present tense of regular -ar verbs (e.g. hablar: hablo, hablas, habla, hablamos, hablais, hablan).
- Present tense of regular -er verbs (e.g. comer: como, comes, come, comemos, comeis, comen).
- Present tense of regular -ir verbs (e.g. vivir: vivo, vives, vive, vivimos, vivis, viven).
- Negation with "no" placed before the conjugated verb.`
  },
  {
    subtopic: "A1.5 Family, description and common irregular verbs",
    specContent: `A1.5 Family, description and common irregular verbs

Content - what students need to learn:
- Family vocabulary (madre, padre, hermano, hermana, abuelo, abuela, hijo, hija, marido, esposa, tio, tia, primo/a) and possessive adjectives (mi/mis, tu/tus, su/sus, nuestro/a/os/as, vuestro/a/os/as).
- Describing physical appearance and personality with adjectives (alto/bajo, joven/viejo, simpatico/antipatico, etc.), always agreeing in gender/number.
- Present tense of key irregular verbs: ir (voy, vas, va, vamos, vais, van), tener (tengo, tienes, tiene, tenemos, teneis, tienen), hacer (hago, haces, hace, hacemos, haceis, hacen), poder (puedo, puedes, puede... - an o-to-ue stem change), querer (quiero, quieres, quiere... - an e-to-ie stem change), decir (digo, dices, dice...).
- Stem-changing verbs as a genuine category of their own in Spanish (e->ie: querer, pensar; o->ue: poder, dormir; e->i: pedir, servir) - the stem changes in every form except nosotros/vosotros.
- "Ir a" + infinitive for the near future (voy a comer = "I'm going to eat").
- Modal verb construction: modal verb (poder/querer/deber) + infinitive.`
  },
  {
    subtopic: "A1.6 Food, shopping and everyday requests",
    specContent: `A1.6 Food, shopping and everyday requests

Content - what students need to learn:
- Food and drink vocabulary for ordering at a cafe/restaurant (un cafe, un bocadillo, el agua, el vino, etc.) and quiero/me gustaria + noun/infinitive for polite requests.
- Quantity expressions with "de" (un poco de, un kilo de, una botella de, un vaso de).
- Shopping vocabulary and asking prices: ¿cuanto cuesta? / ¿cuanto es?
- Ordinal numbers (primero, segundo, tercero...) used in shop/menu/floor contexts, including the apocope rule where primero and tercero drop the final -o before a masculine singular noun (primer piso, tercer dia).
- Direct object nouns with common verbs (comprar, tomar, querer) in simple sentences.
- Understanding numbers used with prices/currency (euros, centimos, pesos, depending on country).`
  },
  {
    subtopic: "A2.1 Preterito indefinido (simple past)",
    specContent: `A2.1 Preterito indefinido (simple past)

Content - what students need to learn:
- Regular formation: -ar verbs (-e, -aste, -o, -amos, -asteis, -aron); -er/-ir verbs share one pattern (-i, -iste, -io, -imos, -isteis, -ieron).
- Common irregular preterites: ser and ir share the exact same forms (fui, fuiste, fue, fuimos, fuisteis, fueron) - context alone distinguishes them; tener (tuve...), hacer (hice, hiciste, hizo...), estar (estuve...), poder (pude...), decir (dije... dijeron), venir (vine...).
- Spelling-change preterites in the "yo" form only, to preserve pronunciation: -car verbs change c to qu (buscar -> busque), -gar verbs change g to gu (llegar -> llegue), -zar verbs change z to c (empezar -> empece).
- Use: a single completed action, a sequence of completed actions, or an action with a clear, defined start and end point in the past.
- Time expressions that signal preterito indefinido (ayer, la semana pasada, anoche, hace dos dias).`
  },
  {
    subtopic: "A2.2 Preterito imperfecto and its contrast with indefinido",
    specContent: `A2.2 Preterito imperfecto and its contrast with indefinido

Content - what students need to learn:
- Imperfecto formation for -ar verbs (-aba, -abas, -aba, -abamos, -abais, -aban) and -er/-ir verbs (-ia, -ias, -ia, -iamos, -iais, -ian).
- Only THREE irregular verbs in the imperfecto in the whole language: ser (era, eras, era...), ir (iba, ibas, iba...), ver (veia, veias, veia...).
- Core uses of imperfecto: habitual/repeated past actions ("used to"), ongoing background description, and describing past states (age, weather, feelings, physical description) with no defined endpoint.
- Core uses of preterito indefinido: a single completed action, a sequence of completed actions, an action with a defined start/end.
- Direct contrast: using imperfecto for the background/scene-setting and preterito indefinido for the single interrupting event within the same sentence (e.g. "mientras dormia, sono el telefono").`
  },
  {
    subtopic: "A2.3 Object pronouns and reflexive verbs",
    specContent: `A2.3 Object pronouns and reflexive verbs

Content - what students need to learn:
- Direct object pronouns (me, te, lo, la, nos, os, los, las) and their placement immediately before a conjugated verb.
- Indirect object pronouns (me, te, le, nos, os, les) and the verbs that require them (gustar, dar, decir, escribir - i.e. verbs taking "a + person").
- The construction of gustar as an inverted verb (me gusta el cafe / me gustan los libros - the THING liked is the grammatical subject, not the person who likes it).
- Reflexive verbs: formation with reflexive pronouns (me, te, se, nos, os, se) and common examples (levantarse, despertarse, lavarse, vestirse, llamarse).
- Object/reflexive pronoun placement: before a conjugated verb, or attached to the end of an infinitive, gerund, or affirmative imperative (levantarme / voy a levantarme / levantandome / ¡levantate!).
- Reflexive verbs in the preterito indefinido, conjugated normally with the reflexive pronoun still placed before the verb.`
  },
  {
    subtopic: "A2.4 Comparatives, superlatives and the future tense",
    specContent: `A2.4 Comparatives, superlatives and the future tense

Content - what students need to learn:
- Comparative of majority/minority/equality: mas...que, menos...que, tan...como (with adjectives/adverbs), tanto/a/os/as...como (with nouns).
- Irregular comparatives: mejor/peor (better/worse), mayor/menor (older/younger, or bigger/smaller).
- Relative superlative (el/la mas... de) and absolute superlative (-isimo/a/os/as ending, or muy + adjective).
- Future tense formation: ALL THREE conjugations (-ar, -er, -ir) share the exact same endings (-e, -as, -a, -emos, -eis, -an) added to the full infinitive - a genuine simplification compared to some other Romance languages, which split by conjugation.
- Key irregular future stems, formed by modifying the infinitive rather than changing the endings (tener -> tendre, poder -> podre, hacer -> hare, decir -> dire, salir -> saldre, poner -> pondre, venir -> vendre, querer -> querre, saber -> sabre).
- Future used for prediction/planning, and its use to express probability/conjecture about the present (futuro de probabilidad, e.g. "tendra treinta anos" = "he's probably thirty").`
  },
  {
    subtopic: "A2.5 Directions, travel, health and making plans",
    specContent: `A2.5 Directions, travel, health and making plans

Content - what students need to learn:
- Asking for and giving directions: ¿donde esta...?, ¿como llego a...?, todo recto, a la derecha, a la izquierda, en la esquina, enfrente de, al lado de.
- Imperative mood (informal tu-form and formal usted-form) for giving instructions/directions (gira, siga, tome).
- Travel and transport vocabulary (el tren, el avion, la estacion, el billete/boleto, la reserva) and prepositions of place/movement (a, en, de, para, por used with means of transport and destinations).
- Parts of the body and common health expressions (me duele..., tengo dolor de cabeza/estomago, me siento bien/mal).
- Making plans and invitations: ¿quieres/querrias + infinitive?, ¿te apetece...?, vamos a..., proposing and responding to a suggestion (de acuerdo, lo siento pero...).
- Time expressions for future plans (manana, la proxima semana, dentro de dos dias).`
  },
  {
    subtopic: "B1.1 Conditional mood and modal verbs in context",
    specContent: `B1.1 Conditional mood and modal verbs in context

Content - what students need to learn:
- Present conditional formation (the same irregular stems as the future tense, with endings -ia, -ias, -ia, -iamos, -iais, -ian added to the infinitive/irregular stem).
- Uses of the present conditional: polite requests (querria, podria), giving advice (deberias), expressing a wish, hedging an opinion (diria que...).
- Perfect (past) conditional formation: present conditional of haber + past participle (habria hecho, habria ido).
- Use of the perfect conditional to express an unfulfilled past wish/intention, or reported speech about a future-in-the-past event.
- Modal verbs (poder, deber, querer) in the conditional to soften requests/obligations/suggestions compared to their present-tense equivalents.
- Distinguishing when to use the present conditional versus the perfect conditional based on whether the reference point is now or a moment already in the past.`
  },
  {
    subtopic: "B1.2 Combined and complex pronouns",
    specContent: `B1.2 Combined and complex pronouns

Content - what students need to learn:
- Combining indirect object pronouns with direct object pronouns, placing the indirect one first (me lo, te la, nos los, os las).
- The special rule that third-person indirect pronouns (le, les) become "se" when combined with a third-person direct pronoun (le lo -> se lo, les la -> se la) - never "le lo"/"les la".
- Placement rules for combined pronouns: before a conjugated verb, or attached to the end of an infinitive, gerund, or affirmative imperative (se lo doy / voy a darselo / dandoselo / ¡dimelo!), with a written accent added when attaching shifts the natural stress.
- Unlike some other Romance languages, the Spanish past participle in a compound tense (with haber) NEVER changes for gender or number, regardless of any preceding object pronoun (se lo he dado - "dado" never agrees).
- "Lo" used as a neuter pronoun referring back to a whole idea or previous statement, not a specific noun (no lo se, lo entiendo).
- Working out which combined form is required from the underlying indirect + direct pairing, rather than memorising the surface forms alone.`
  },
  {
    subtopic: "B1.3 Relative pronouns and complex sentences",
    specContent: `B1.3 Relative pronouns and complex sentences

Content - what students need to learn:
- "Que" as the all-purpose relative pronoun for subject and direct object (both people and things), used with no preposition.
- "Quien/quienes" used after a preposition to refer back to a person already mentioned (la persona con quien hable).
- "El que / la que / los que / las que" and "el cual" etc. as more formal alternatives, agreeing in gender/number with their antecedent, especially useful for disambiguating which noun is being referred to.
- "Lo que" as a neuter relative meaning "what/that which", referring to an idea rather than a specific noun (no entiendo lo que dices).
- Forming complex sentences by joining two clauses with a relative pronoun, avoiding the common learner error of restating the noun instead of using the relative.
- Distinguishing restrictive relative clauses (no comma, essential information) from non-restrictive ones (comma-separated, extra information).`
  },
  {
    subtopic: "B1.4 Subjuntivo presente: formation and core triggers",
    specContent: `B1.4 Subjuntivo presente: formation and core triggers

Content - what students need to learn:
- Present subjunctive formation: -ar verbs take "opposite vowel" endings (-e, -es, -e, -emos, -eis, -en); -er/-ir verbs take -a endings (-a, -as, -a, -amos, -ais, -an).
- Common irregular present subjunctive stems (ser: sea, estar: este, ir: vaya, saber: sepa, dar: de, haber: haya), plus stem-changing verbs carrying their stem change into the subjunctive (querer -> quiera, poder -> pueda).
- The core rule: subjunctive is used in a dependent clause introduced by "que" after a main clause expressing wish, emotion, doubt, or necessity (quiero que, espero que, es importante que, dudo que), when the subject of the two clauses differs.
- Contrast with the indicative: "creo que" takes the indicative (creo que viene), but its negative "no creo que" triggers the subjunctive (no creo que venga) - a classic, genuinely important exception.
- Impersonal expressions that trigger the subjunctive (es necesario que, es posible que, ojala que).
- Recognising when NO subjunctive is needed because the subject is the same across both clauses (in which case the infinitive replaces "que + subjunctive": quiero comer, not quiero que coma, when the same person wants and eats).`
  },
  {
    subtopic: "B1.5 Passive voice and impersonal se",
    specContent: `B1.5 Passive voice and impersonal se

Content - what students need to learn:
- Passive voice formation with ser + past participle (agreeing with the subject), and the use of "por" to introduce the agent (el libro fue escrito por Cervantes).
- The "se pasiva" (passive se) construction, used when the agent is unknown/unimportant, with the verb agreeing in number with the following noun (se venden libros aqui).
- The "se impersonal" (impersonal se) construction for general statements equivalent to English "one/people/you" (en Espana se cena tarde).
- Distinguishing se pasiva from se impersonal based on whether the following noun is the grammatical subject (pasiva, always third person, agrees in number) or the construction stays fixed singular (impersonal, often with a person-referring verb).
- When the "se" construction is stylistically preferred over the ser-passive in everyday spoken/written Spanish (se pasiva/impersonal are far more common than the ser-passive, which can sound formal or translated from English).`
  },
  {
    subtopic: "B2.1 Subjuntivo pasado (imperfecto and pluscuamperfecto), and secuencia de tiempos",
    specContent: `B2.1 Subjuntivo pasado (imperfecto and pluscuamperfecto), and secuencia de tiempos

Content - what students need to learn:
- Perfect subjunctive formation: present subjunctive of haber + past participle (haya hecho), used when the subjunctive-triggering main clause is present-tense but the dependent action happened before it (creo que ya haya llegado).
- Imperfect subjunctive formation: Spanish has TWO equally correct sets of endings, -ra (hablara, hablaras, hablara...) and -se (hablase, hablases, hablase...), with -ra more common in everyday speech - used when the main clause is past-tense or conditional and the dependent action is simultaneous/ongoing (queria que vinieras).
- Pluperfect subjunctive formation: imperfect subjunctive of haber + past participle (hubiera/hubiese hecho), used for an action prior to a past-tense main clause (pensaba que ya hubiera salido).
- "Secuencia de tiempos" (sequence of tenses): which subjunctive tense is required based on the tense of the main clause and the relative timing of the dependent action.
- Recognising that the same core triggers from the present subjunctive (wish, emotion, doubt, necessity) still apply here - only the TENSE of the subjunctive changes based on time reference.`
  },
  {
    subtopic: "B2.2 Oraciones condicionales (if-clauses)",
    specContent: `B2.2 Oraciones condicionales (if-clauses)

Content - what students need to learn:
- Type 1 (real/likely condition): si + present indicative, present/future/imperative in the result clause (si llueve, me quedo en casa / si llueve, me quedare en casa).
- Type 2 (hypothetical/unlikely present-future condition): si + imperfect subjunctive, present conditional in the result clause (si tuviera tiempo, vendria) - never the conditional inside the "si" clause itself, a very common learner error.
- Type 3 (contrary-to-fact past condition): si + pluperfect subjunctive, perfect conditional in the result clause (si hubiera estudiado, habria aprobado).
- Correct pairing of clauses: the "si" clause and the result clause must use matching pairs of tenses/moods; mixing a type-2 "si" clause with a type-3 result clause is incorrect.
- Mixed hypotheticals in real usage: a past condition with a present-time consequence (si hubiera estudiado mas, ahora sabria responder), pairing pluperfect subjunctive with a present conditional.
- Contrasting these hypothetical structures with the simple "si" + indicative used for general truths/habits (si llueve, crece la hierba).`
  },
  {
    subtopic: "B2.3 Estilo indirecto (reported speech)",
    specContent: `B2.3 Estilo indirecto (reported speech)

Content - what students need to learn:
- Introducing reported speech with dijo que, explico que, pregunto si.
- Tense shifts (backshifting) when the reporting verb is in a past tense: present becomes imperfecto, preterito indefinido becomes pluscuamperfecto, future becomes present conditional.
- No backshift required when the reporting verb is in the present tense (dice que viene).
- Pronoun and possessive changes required when reporting speech from a different person's perspective (yo -> el/ella, mi -> su).
- Adverb/time-expression changes required in reported speech (hoy -> ese dia, manana -> al dia siguiente, ayer -> el dia anterior, aqui -> alli).
- Reporting yes/no questions with "si" and reporting wh-questions by keeping the question word but switching to statement word order (me pregunto donde vivia, not donde vivia yo).`
  },
  {
    subtopic: "B2.4 Gerundio, advanced connectors and register",
    specContent: `B2.4 Gerundio, advanced connectors and register

Content - what students need to learn:
- Gerundio formation (-ar to -ando, -er/-ir to -iendo), including the spelling/stem-change irregularities that carry over from the preterite (dormir -> durmiendo, leer -> leyendo, decir -> diciendo).
- Gerundio used with estar to form the present/past progressive (estoy comiendo, estaba comiendo).
- Gerundio used adverbially to express manner, cause, or a simultaneous action, without a subordinating conjunction (saliendo de casa, vi a Juan = "on leaving the house...").
- Gerundio with a pronoun attached to the end, adding a written accent (viendolo, levantandose).
- Advanced argumentative connectors: sin embargo, a pesar de que, aunque (indicative for a known fact, subjunctive for a hypothetical), por lo tanto, ademas.
- Formal written register versus spoken/informal register: preference for "usted" over "tu" in formal writing, avoidance of colloquialisms, and preference for impersonal "se" or passive constructions over direct "tu"-directed phrasing.
- Structuring a short argumentative paragraph in Spanish: stating a thesis, connecting supporting points with the connectors above, and a concluding connector (en conclusion, en resumen).`
  },
];


function stripCodeFences(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// Found live on this exact subject's real run: two coverage-check
// responses came back missing precisely their final closing '}' - every
// string properly terminated, every array properly closed, just the one
// outermost brace dropped (confirmed by counting: 3 '{' vs 2 '}' in both
// cases, nothing else off). Too small and too specific a defect to be
// max_tokens truncation (these responses were a few hundred tokens
// against a 16000 cap) - looks like an occasional real model formatting
// slip on this call shape. A plain JSON.parse has no way to recover from
// that; this repairs the one specific, common case (a handful of missing
// closers at the very end, string content itself intact) by walking the
// text tracking bracket/brace/string-quote state and appending whatever
// closers are still open, in the correct nesting order, before a final
// parse attempt. Does not attempt to fix anything IN the middle of the
// text (a truncated string value, a missing comma) - those are genuine
// truncations that should keep failing loudly, not be silently patched.
// Found live on THIS Italian run: the model second-guessed itself
// mid-response - wrote a first, flawed JSON object, a line of plain-text
// commentary ("Wait, I need to remove the invalid placeholder edge."),
// then a corrected second JSON object. stripCodeFences only strips the
// very first/last code fence, so the middle closing/opening fences and
// the commentary between the two objects survive into `text` - a bracket
// stack over the whole thing balances perfectly (both objects are
// individually well-formed), so parseJsonWithRepair's own "missing
// trailing closer" repair correctly declines to touch it, and a plain
// JSON.parse stops at the end of the FIRST object and reports "Unexpected
// non-whitespace character after JSON" for everything past it. Since a
// self-correcting model's LAST complete top-level object/array is its
// actual final answer, this scans for every top-level {...}/[...] span in
// the text and returns the last one, discarding the superseded draft and
// the commentary in between.
function extractLastJsonValue(text) {
  let depth = 0, start = -1, inString = false, escaped = false, lastSpan = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0 && start !== -1) {
        lastSpan = [start, i + 1];
        start = -1;
      }
    }
  }
  return lastSpan ? text.slice(lastSpan[0], lastSpan[1]) : text;
}

function parseJsonWithRepair(text, context) {
  try {
    return JSON.parse(text);
  } catch (firstErr) {
    const stack = [];
    let inString = false;
    let escaped = false;
    for (const ch of text) {
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') {
        if (stack[stack.length - 1] === ch) stack.pop();
      }
    }
    if (!inString && stack.length) {
      const repaired = text + stack.reverse().join('');
      try {
        const parsed = JSON.parse(repaired);
        console.error(`  [repair] ${context}: response was missing ${stack.length} trailing closer(s) - repaired and parsed successfully`);
        return parsed;
      } catch (secondErr) {
        // fall through to the last-JSON-value repair below
      }
    }
    try {
      const parsed = JSON.parse(extractLastJsonValue(text));
      console.error(`  [repair] ${context}: response contained multiple JSON values (likely a self-corrected draft) - used the last one and parsed successfully`);
      return parsed;
    } catch (thirdErr) {
      throw firstErr; // neither repair worked - surface the ORIGINAL error, not a repaired one
    }
  }
}

async function generateSubtopic(subtopic, specContent, missingConcepts) {
  // missingConcepts is only ever set on a coverage-driven retry (see
  // main()) - appending it rather than silently starting over means the
  // model still has every reason for the atomicity/breadth decisions it
  // already got right, plus an explicit, unmissable instruction covering
  // exactly what the coverage check found absent.
  const retryNote = missingConcepts && missingConcepts.length
    ? `\n\nA completeness check against this same specification text found that your previous attempt did not cover the following - make sure this regeneration includes proper decomposed coverage of each one (not just a one-line mention):\n${missingConcepts.map(m => `- ${m.term}: ${m.whyItMatters}`).join('\n')}`
    : '';
  // 16k (up from 8k): a dense subtopic (e.g. 4.3's market/interventionist/
  // other strategy lists) can genuinely produce more than 8k tokens of
  // nodes+edges once rules 7/8's "brainstorm 4-6 points per side" is
  // followed properly - 8k risked silently truncating valid JSON on
  // exactly the subtopics that need the most decomposition. Streamed
  // (not just a higher max_tokens) because a long non-streamed generation
  // risks the client's own request timeout, independent of the token cap.
  // thinking explicitly disabled, matching claudeClient.ts's
  // THINKS_BY_DEFAULT_MODELS handling for every other Sonnet 5/Opus 5 call
  // in this codebase: this is a rule-driven structured-JSON extraction
  // task, not one that benefits from extended reasoning, and adaptive
  // thinking is what caused the original truncation bug this comment used
  // to describe (it was burning most of a 16k budget on invisible
  // reasoning before writing a single character of the actual JSON).
  // max_tokens now only has to cover the actual output.
  assertUnderCap();
  const stream1 = client.messages.stream({
    model: GENERATION_MODEL,
    max_tokens: 32000,
    thinking: { type: 'disabled' },
    system: cachedSystem(KNOWLEDGE_MAP_GENERATION_PROMPT),
    messages: [{
      role: 'user',
      content: `Subject: ${SUBJECT}\nQualification: ${QUALIFICATION}\nExam board: ${EXAM_BOARD}\nSubtopic: ${subtopic}\n\nReal specification content:\n${specContent}${retryNote}`,
    }],
  });
  stream1.on('error', (e) => console.error('STREAM ERROR EVENT:', e));
  stream1.on('streamEvent', (e) => { if (e.type === 'message_delta' || e.type === 'message_stop') console.error('STREAM EVENT:', JSON.stringify(e)); });
  const resp = await stream1.finalMessage();
  console.error('stop_reason:', resp.stop_reason, ' usage:', JSON.stringify(resp.usage));
  recordUsage(GENERATION_MODEL, resp.usage);
  const debugPath = path.join(__dirname, `debug_generation_${safeId(subtopic)}.txt`);
  const textBlock1 = resp.content.find(b => b.type === 'text');
  if (!textBlock1) {
    fs.writeFileSync(debugPath, JSON.stringify(resp, null, 2));
    throw new Error(`No text block in response for subtopic "${subtopic}" - stop_reason: ${resp.stop_reason}, full response dumped to ${debugPath}`);
  }
  const text = textBlock1.text;
  const cleaned = stripCodeFences(text);
  try {
    return parseJsonWithRepair(cleaned, `generate ${subtopic}`);
  } catch (err) {
    fs.writeFileSync(debugPath, cleaned);
    console.error(`JSON parse failed for subtopic "${subtopic}" - raw response written to ${debugPath}`);
    throw err;
  }
}

function safeId(raw) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

async function checkCoverage(subtopic, specContent, nodes) {
  // 6k (up from 4k): a thin margin above what a genuinely thorough
  // missing-concepts list for a dense subtopic could need - this call's
  // output is bounded by how much the FIRST pass actually missed, so it
  // rarely approaches this, but 4k was cutting it close on worst-case
  // subtopics with several dropped named theories at once.
  assertUnderCap();
  const stream2 = client.messages.stream({
    model: COVERAGE_MODEL,
    max_tokens: 16000,
    thinking: { type: 'disabled' },
    system: cachedSystem(KNOWLEDGE_MAP_COVERAGE_PROMPT),
    messages: [{
      role: 'user',
      content: `Specification text:\n${specContent}\n\nNode labels already generated from it:\n${JSON.stringify(nodes.map(n => n.label))}`,
    }],
  });
  const resp = await stream2.finalMessage();
  recordUsage(COVERAGE_MODEL, resp.usage);
  const textBlock2 = resp.content.find(b => b.type === 'text');
  if (!textBlock2) throw new Error(`Coverage check: no text block, stop_reason: ${resp.stop_reason}`);
  try {
    return parseJsonWithRepair(stripCodeFences(textBlock2.text), `coverage ${subtopic}`).missingConcepts || [];
  } catch (err) {
    const debugPath = path.join(__dirname, `debug_coverage_${safeId(subtopic)}.txt`);
    fs.writeFileSync(debugPath, textBlock2.text);
    console.error(`Coverage JSON parse failed for "${subtopic}" - raw response written to ${debugPath}`);
    throw err;
  }
}

async function verifyBatch(allNodes, allEdges) {
  // 32k (up from 8k): this is the one call that sees the ENTIRE subject
  // at once (700+ nodes for Economics) and can legitimately surface
  // dozens of issues, each carrying its own explanation plus proposed
  // new_nodes/new_edges - the single most likely call in this whole
  // pipeline to have been silently truncating its JSON output at 8k on a
  // real full-subject run. Streamed for the same request-timeout reason
  // as generateSubtopic, more so here given the larger cap.
  assertUnderCap();
  const stream3 = client.messages.stream({
    model: VERIFICATION_MODEL,
    max_tokens: 60000,
    thinking: { type: 'disabled' },
    system: cachedSystem(KNOWLEDGE_MAP_VERIFICATION_PROMPT),
    messages: [{
      role: 'user',
      content: `Subject: ${SUBJECT} (${QUALIFICATION}, ${EXAM_BOARD})\n\nNodes:\n${JSON.stringify(allNodes)}\n\nEdges:\n${JSON.stringify(allEdges)}`,
    }],
  });
  const resp = await stream3.finalMessage();
  console.error('verification stop_reason:', resp.stop_reason, ' usage:', JSON.stringify(resp.usage));
  recordUsage(VERIFICATION_MODEL, resp.usage);
  const textBlock = resp.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error(`Verification: no text block, stop_reason: ${resp.stop_reason}`);
  try {
    return parseJsonWithRepair(stripCodeFences(textBlock.text), 'verification');
  } catch (err) {
    fs.writeFileSync(path.join(__dirname, 'debug_last_verification_response.txt'), textBlock.text);
    console.error('Verification JSON parse failed - raw response written to scripts/debug_last_verification_response.txt');
    throw err;
  }
}

// Edges moved from plain [from, to] tuples to {from, to, difficulty}
// objects once difficulty scoring was added to the generation prompt -
// this normalizer accepts either shape so a verification fix's
// new_edges/remove_edges (still authored as plain [a, b] pairs in the
// verification prompt's output format, since verification only ever adds
// missing STRUCTURE, not a fresh difficulty judgment) work the same as a
// generation pass's own {from, to, difficulty} edges. A fix-added edge
// gets difficulty: null - a real value can only come from a judgment call
// against the full subtopic content, which a structural-fix pass never
// re-does; null is a valid, honest "not yet estimated" state, not a bug.
function normalizeEdge(e) {
  return Array.isArray(e) ? { from: e[0], to: e[1], difficulty: null } : e;
}

function applyFixes(nodes, edges, issues) {
  edges = edges.map(normalizeEdge);
  const nodeIds = new Set(nodes.map(n => n.id));
  const edgeKey = (e) => e.from + '->' + e.to;
  const edgeSet = new Set(edges.map(edgeKey));

  issues.forEach(issue => {
    (issue.fix?.new_nodes || []).forEach(n => {
      if (!nodeIds.has(n.id)) { nodes.push(n); nodeIds.add(n.id); }
    });
    (issue.fix?.new_edges || []).forEach(raw => {
      const e = normalizeEdge(raw);
      if (!edgeSet.has(edgeKey(e))) { edges.push(e); edgeSet.add(edgeKey(e)); }
    });
    (issue.fix?.remove_edges || []).forEach(raw => {
      const k = edgeKey(normalizeEdge(raw));
      const idx = edges.findIndex(x => edgeKey(x) === k);
      if (idx !== -1) edges.splice(idx, 1);
    });
  });
  return { nodes, edges };
}

// Same validity check used throughout the artifact this pipeline is
// replacing - a DAG with no orphaned edges, run automatically rather than
// by hand every time.
function validate(nodes, edges) {
  edges = edges.map(normalizeEdge);
  const nodeIds = new Set(nodes.map(n => n.id));
  const dupes = {};
  nodes.forEach(n => dupes[n.id] = (dupes[n.id] || 0) + 1);
  Object.entries(dupes).forEach(([id, c]) => { if (c > 1) console.warn('DUPLICATE ID:', id); });

  const bad = edges.filter(({ from, to }) => !nodeIds.has(from) || !nodeIds.has(to));
  bad.forEach(({ from, to }) => console.warn('ORPHANED EDGE:', from, '->', to));

  const adj = {};
  nodes.forEach(n => adj[n.id] = []);
  edges.forEach(({ from, to }) => { if (adj[from]) adj[from].push(to); });
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  nodes.forEach(n => color[n.id] = WHITE);
  let cyclePath = null;
  function dfs(u, path) {
    color[u] = GRAY;
    for (const v of adj[u]) {
      if (color[v] === GRAY) { cyclePath = path.concat([u, v]); return true; }
      if (color[v] === WHITE && dfs(v, path.concat([u]))) return true;
    }
    color[u] = BLACK;
    return false;
  }
  for (const n of nodes) if (color[n.id] === WHITE && dfs(n.id, [])) break;
  if (cyclePath) console.warn('CYCLE:', cyclePath.join(' -> '));

  return { valid: bad.length === 0 && !cyclePath && Object.values(dupes).every(c => c === 1) };
}

// Retries a transient failure (dropped connection, momentary API
// overload) with exponential backoff - discovered necessary on the real
// first full run, which died to a mid-stream ECONNRESET on subtopic 2.5
// after already paying for five subtopics' worth of generation calls.
// Does NOT retry a JSON-parse failure (that's a real content bug worth
// seeing immediately, not a flaky-network symptom) or anything already
// wrapped in its own try/catch inside generateSubtopic/checkCoverage/
// verifyBatch that writes a debug dump - only the raw network/SDK-level
// exception these three functions can also throw.
async function withRetry(fn, label, maxRetries = 4) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // 429 added after raising SUBTOPIC_CONCURRENCY made hitting a rate
      // limit a real possibility, not just a network blip - a 429 needs a
      // longer, escalating wait than a dropped connection does, since
      // retrying immediately into an active rate limit just fails again.
      const isRateLimit = err?.status === 429;
      const transient = isRateLimit || err?.cause?.code === 'ECONNRESET' || err?.status >= 500 || err?.name === 'APIConnectionError';
      if (!transient || attempt === maxRetries) throw err;
      const waitMs = isRateLimit ? 20000 * attempt : 5000 * attempt;
      console.warn(`  ! ${label} failed (attempt ${attempt}/${maxRetries}: ${err.message}) - retrying in ${waitMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}

const CHECKPOINT_PATH = path.join(__dirname, `_checkpoint_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`);

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { completedSubtopics: [], allNodes: [], allEdges: [], totalSpendUsd: 0 };
  const data = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  console.log(`Resuming from checkpoint: ${data.completedSubtopics.length}/${SUBTOPICS.length} subtopics already done, $${(data.totalSpendUsd || 0).toFixed(4)} already spent.`);
  return data;
}

function saveCheckpoint(state) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(state));
}

// One subtopic's full generate -> coverage-check -> regenerate pipeline,
// as a standalone unit safe to run concurrently with others (each only
// ever touches its own local `nodes`/`edges`, never shared state) - the
// only genuine cross-subtopic dependency in the whole pipeline is the
// FINAL verifyBatch call, which needs everything already finished, so
// nothing here needs to run sequentially.
async function processSubtopic(subtopic, specContent) {
  console.log(`Generating: ${subtopic}...`);
  let { nodes, edges } = await withRetry(() => generateSubtopic(subtopic, specContent), `generate ${subtopic}`);
  console.log(`  -> ${subtopic}: ${nodes.length} nodes, ${edges.length} edges`);

  // Coverage check against the RAW spec text - the only check in this
  // pipeline that can catch a whole named theory/model dropped entirely,
  // since it's the only one that ever sees the source text rather than
  // just the nodes already produced from it (see the comment above
  // KNOWLEDGE_MAP_COVERAGE_PROMPT for why this is a distinct failure
  // mode from anything verifyBatch below can catch).
  for (let round = 0; round < MAX_COVERAGE_ROUNDS; round++) {
    console.log(`  [${subtopic}] Checking coverage (round ${round + 1})...`);
    const missing = await withRetry(() => checkCoverage(subtopic, specContent, nodes), `coverage check ${subtopic}`);
    if (!missing.length) {
      console.log(`  -> ${subtopic}: full coverage confirmed`);
      break;
    }
    console.log(`  -> ${subtopic}: ${missing.length} concept(s) missing, regenerating: ${missing.map(m => m.term).join('; ')}`);
    ({ nodes, edges } = await withRetry(() => generateSubtopic(subtopic, specContent, missing), `regenerate ${subtopic}`));
    console.log(`  -> ${subtopic}: ${nodes.length} nodes, ${edges.length} edges after regeneration`);
  }

  nodes.forEach(n => n.subtopic = subtopic);
  return { subtopic, nodes, edges: edges.map(normalizeEdge) };
}

// Concurrency limited (not all 19 at once) to stay well clear of the
// account's own rate limits rather than guess at exactly where they are
// and find out the hard way mid-run. Lowered from 4 to 2 specifically for
// this run's hard SPEND_CAP_USD - the cap is only checked between calls,
// not mid-stream, so the worst-case overshoot once it trips is bounded by
// however many calls were already in flight in that chunk; halving
// concurrency halves that worst case, at the cost of roughly doubling
// wall-clock time.
const SUBTOPIC_CONCURRENCY = 2;

async function main() {
  const state = loadCheckpoint();
  let { allNodes, allEdges } = state;
  const done = new Set(state.completedSubtopics);
  // Seeded from the checkpoint, not left at 0 - found live on a previous
  // run: totalSpendUsd was in-memory only, so a checkpoint-resume after a
  // failure got a FRESH cap budget stacked on top of whatever the first
  // invocation had already spent, and the real total ended up well over
  // the intended cap. Persisting it here is what actually makes the cap
  // hold across a resume, not just within one invocation.
  totalSpendUsd = state.totalSpendUsd || 0;

  const remaining = SUBTOPICS.filter(s => !done.has(s.subtopic));
  for (const s of SUBTOPICS) { if (done.has(s.subtopic)) console.log(`Skipping (already done): ${s.subtopic}`); }

  let anyFailed = false;
  for (let i = 0; i < remaining.length; i += SUBTOPIC_CONCURRENCY) {
    const chunk = remaining.slice(i, i + SUBTOPIC_CONCURRENCY);
    // allSettled, not all - a genuine failure in one subtopic (e.g. a
    // real max_tokens truncation, not just a transient network blip)
    // must not throw away the OTHER subtopics in the same chunk that
    // finished fine. Promise.all would reject the whole chunk the moment
    // any one item threw, silently discarding already-done work that
    // was never given a chance to reach saveCheckpoint - exactly what
    // happened on the real run this was found on.
    const settled = await Promise.allSettled(chunk.map(s => processSubtopic(s.subtopic, s.specContent)));
    settled.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        const { subtopic, nodes, edges } = result.value;
        allNodes = allNodes.concat(nodes);
        allEdges = allEdges.concat(edges);
        done.add(subtopic);
      } else {
        anyFailed = true;
        console.error(`FAILED: ${chunk[idx].subtopic}: ${result.reason?.message || result.reason}`);
      }
    });
    saveCheckpoint({ completedSubtopics: Array.from(done), allNodes, allEdges, totalSpendUsd });
    console.log(`Checkpoint saved: ${done.size}/${SUBTOPICS.length} subtopics done.`);
  }
  if (anyFailed) {
    console.error('\nOne or more subtopics failed permanently (see FAILED lines above) - fix the underlying issue, then just re-run this script. The checkpoint means only the failed subtopic(s) get retried, nothing already-done gets re-paid for.');
    process.exit(1);
  }

  console.log(`\nVerifying batch of ${allNodes.length} nodes...`);
  let finalNodes = allNodes, finalEdges = allEdges, verified = false;
  try {
    const { issues } = await withRetry(() => verifyBatch(allNodes, allEdges), 'verification');
    console.log(`  -> ${issues.length} issue(s) found`);
    issues.forEach(i => console.log(`  [${i.type}] ${i.affected_node}: ${i.explanation}`));
    const fixed = applyFixes(allNodes, allEdges, issues);
    finalNodes = fixed.nodes;
    finalEdges = fixed.edges;
    verified = true;
  } catch (err) {
    // The spend cap is a hard promise for this run - if it trips here
    // (verification is one whole-batch Opus call, scaling with total node
    // count, so it can be the single biggest line item), the already-paid-
    // for generation work still gets written out rather than lost: an
    // unverified map is a real, usable result (same shape ingest_knowledge_map.js
    // expects), just without the whole-batch consistency pass. Re-run
    // verifyBatch by hand later (raise SPEND_CAP_USD or start a fresh
    // invocation) if that pass still matters once you're ready to spend more.
    console.error(`\nVerification did not complete (${err.message}). Writing out the generated-but-unverified map instead of losing it.`);
  }
  const result = validate(finalNodes, finalEdges);
  console.log(`\nFinal: ${finalNodes.length} nodes, ${finalEdges.length} edges, verified: ${verified}, valid DAG: ${result.valid}`);

  const outPath = `knowledge_map_${SUBJECT.toLowerCase()}_${QUALIFICATION.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`;
  fs.writeFileSync(outPath, JSON.stringify({ subject: SUBJECT, qualification: QUALIFICATION, examBoard: EXAM_BOARD, nodes: finalNodes, edges: finalEdges }, null, 2));
  console.log(`Written to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
