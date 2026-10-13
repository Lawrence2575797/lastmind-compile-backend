"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startEncodingLesson = startEncodingLesson;
exports.fetchExpectedSolution = fetchExpectedSolution;
exports.submitEncodingAnswer = submitEncodingAnswer;
exports.generateNotesFromLesson = generateNotesFromLesson;
const claudeClient_1 = require("./claudeClient");
const chainService_1 = require("./chainService");
const reviewService_1 = require("./reviewService");
const wikimediaService_1 = require("./wikimediaService");
const supabaseAdmin_1 = require("./supabaseAdmin");
const encodingLessonPrompts_1 = require("../constants/encodingLessonPrompts");
function stripCodeFences(text) {
    return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}
// Belt-and-suspenders against stray prose around the JSON body (e.g. a
// model narrating its self-check reasoning before settling into the
// output despite "Output ONLY valid JSON" instructions) — falls back to
// the outermost {...} span if a direct parse fails.
function extractJsonObject(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start)
        return text;
    return text.slice(start, end + 1);
}
async function callJSON(systemPrompt, userContent, model, temperature = 0, maxTokens) {
    const raw = await (0, claudeClient_1.callClaudeJSON)({ model, systemPrompt, userContent, temperature, maxTokens });
    const cleaned = stripCodeFences(raw);
    try {
        return JSON.parse(cleaned);
    }
    catch {
        try {
            return JSON.parse(extractJsonObject(cleaned));
        }
        catch (err) {
            // Logged raw so a truncated/malformed response (the most likely
            // cause of a parse failure here) is actually diagnosable after the
            // fact, instead of just surfacing as an opaque 500 to the client.
            console.error('LastMind: encoding lesson call returned invalid JSON.', { raw });
            throw err;
        }
    }
}
// Chains cached before the "derivable" field existed default to: a node
// with no prerequisites of its own can't be derived from anything else in
// the chain, so it's treated as non-derivable; anything with prerequisites
// is treated as derivable — matches the field's own intent without forcing
// every existing cached chain to regenerate.
function resolveDerivable(node) {
    if (typeof node.derivable === 'boolean')
        return node.derivable;
    return (node.depends_on || []).length > 0;
}
function clean(s) {
    return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}
// Loose (not exact) match — chain node labels and the student's own page
// titles for the "same" concept are independently generated free text
// (e.g. "Budget line" vs "The budget constraint"), so exact equality would
// miss most real matches. False negatives here just fall back to the
// existing title-only heuristic (unchanged behavior); false positives are
// harmless too — force-teaching a prerequisite that genuinely was already
// known just makes that beat mildly redundant, never wrong.
function normalizeForMatch(s) {
    return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function matchesUnfinishedSibling(nodeLabel, siblingConcepts) {
    const normNode = normalizeForMatch(nodeLabel);
    if (!normNode)
        return false;
    return siblingConcepts.some((s) => {
        if (s.done)
            return false;
        const normSib = normalizeForMatch(s.label);
        return !!normSib && (normSib === normNode || normSib.includes(normNode) || normNode.includes(normSib));
    });
}
const DIAGRAM_LOOKUP_TIMEOUT_MS = 8000;
async function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    }
    finally {
        clearTimeout(timer);
    }
}
function buildAttribution(artist, licenseShortName) {
    if (artist && licenseShortName)
        return `${artist} — ${licenseShortName}, via Wikimedia Commons`;
    if (artist)
        return `${artist}, via Wikimedia Commons`;
    return 'Via Wikimedia Commons';
}
/**
 * Looks up (or fetches + verifies + caches) a diagram for one concept, keyed
 * by concept + qualification + exam board so only the first student per
 * combination pays the search+vision cost — everyone after gets an instant
 * cache hit, including a cached "nothing suitable" negative. Never throws:
 * any failure just means no diagram, since a missing diagram is harmless
 * but a wrong one would actively mislead a student.
 */
async function getOrFetchDiagram(conceptKey, qualification, examBoard, subject, targetLabel, searchQuery) {
    const diagramKey = `${conceptKey}::${clean(qualification)}::${clean(examBoard)}`;
    const { data: cached, error: cacheError } = await supabaseAdmin_1.supabaseAdmin
        .from('encoding_diagrams')
        .select('diagram')
        .eq('diagram_key', diagramKey)
        .maybeSingle();
    if (!cacheError && cached) {
        return cached.diagram ?? null;
    }
    const candidates = await (0, wikimediaService_1.searchWikimediaImages)(searchQuery, 5);
    if (!candidates.length) {
        await supabaseAdmin_1.supabaseAdmin.from('encoding_diagrams').insert({ diagram_key: diagramKey, diagram: null });
        return null;
    }
    const fetched = await Promise.allSettled(candidates.map((c) => (0, wikimediaService_1.fetchImageAsBase64)(c.thumbUrl)));
    const usable = candidates
        .map((c, i) => ({ candidate: c, image: fetched[i].status === 'fulfilled' ? fetched[i].value : null }))
        .filter((x) => x.image);
    if (!usable.length) {
        // Transient (network/size) failure across every candidate, not a
        // definitive "no suitable diagram exists" verdict — don't cache this,
        // let the next student's request try again fresh.
        return null;
    }
    const raw = await (0, claudeClient_1.callClaudeJSONWithImages)({
        model: claudeClient_1.MODELS.diagnosticTree,
        systemPrompt: encodingLessonPrompts_1.DIAGRAM_VERIFICATION_PROMPT,
        userText: [
            `Subject: ${subject}`,
            `Qualification: ${qualification || 'unspecified'}`,
            `Exam board: ${examBoard || 'unspecified'}`,
            `Target concept this diagram is meant to illustrate: ${targetLabel}`,
        ].join('\n'),
        images: usable.map((u, i) => ({
            mediaType: u.image.mediaType,
            base64Data: u.image.base64Data,
            label: `Candidate ${i}: ${u.candidate.title}`,
        })),
        temperature: 0.2,
        maxTokens: 512,
    });
    let parsedVerdict;
    try {
        parsedVerdict = JSON.parse(stripCodeFences(raw));
    }
    catch (err) {
        console.error('LastMind: diagram verification call returned invalid JSON.', { raw });
        return null;
    }
    if (parsedVerdict.chosenIndex === null || parsedVerdict.chosenIndex === undefined || !usable[parsedVerdict.chosenIndex]) {
        await supabaseAdmin_1.supabaseAdmin.from('encoding_diagrams').insert({ diagram_key: diagramKey, diagram: null });
        return null;
    }
    const chosen = usable[parsedVerdict.chosenIndex].candidate;
    const diagram = {
        diagramUrl: chosen.thumbUrl,
        diagramCaption: parsedVerdict.caption || '',
        diagramAttribution: buildAttribution(chosen.artist, chosen.licenseShortName),
    };
    await supabaseAdmin_1.supabaseAdmin.from('encoding_diagrams').insert({ diagram_key: diagramKey, diagram });
    return diagram;
}
/**
 * Walks the drafted steps in order, sending a genuinely independent
 * verification/repair call — fresh eyes, no memory of why the first pass
 * was unsure — for any step the batch generation itself flagged as
 * "confident: false" after its own inline self-check. Only ever runs on a
 * cache miss (see startEncodingLesson), and only for the (hopefully rare)
 * steps actually flagged — most concepts trigger zero extra calls here.
 * Mutates the flagged steps' text/checkQuestion in place when a genuine
 * revision comes back.
 */
async function repairUncertainSteps(steps, subject, qualification, examBoard) {
    const establishedSoFar = [];
    for (const step of steps) {
        if (step.confident === false) {
            try {
                const result = await callJSON(encodingLessonPrompts_1.STEP_DERIVABILITY_CHECK_PROMPT, [
                    `Subject: ${subject}`,
                    `Qualification: ${qualification || 'unspecified'}`,
                    `Exam board: ${examBoard || 'unspecified'}`,
                    `Established so far, in order: ${JSON.stringify(establishedSoFar)}`,
                    `Flagged step — type: ${step.type}, text: ${step.text}${step.checkQuestion ? `, checkQuestion: ${step.checkQuestion}` : ''}${step.requiresCalculation ? `, requiresCalculation: true, expectedSolution: ${step.expectedSolution || ''}` : ''}`,
                ].join('\n'), claudeClient_1.MODELS.diagnosticTree, 0.2);
                if (result.needsRevision) {
                    if (result.revisedText)
                        step.text = result.revisedText;
                    if (step.type === 'explain' && result.revisedCheckQuestion)
                        step.checkQuestion = result.revisedCheckQuestion;
                    if (step.requiresCalculation && result.revisedExpectedSolution)
                        step.expectedSolution = result.revisedExpectedSolution;
                }
            }
            catch (err) {
                // A failed repair attempt just means the original (self-flagged-
                // uncertain) draft ships as-is — never block the whole lesson on
                // this being a best-effort quality pass, not a hard requirement.
                console.error('LastMind: step derivability repair failed, keeping original draft.', err);
            }
        }
        establishedSoFar.push({ label: step.label, text: step.text });
    }
}
/**
 * Starts a first-time "encoding" lesson. Shape: a novelty hook fact, a
 * short knowledge-check of the target concept's DIRECT prerequisites only
 * (assumed prior knowledge — verified, not re-taught), a scene + derivation
 * of the target concept itself, then 1-3 steps exploring its real
 * implications/trade-offs. Distant/foundational chain nodes are neither
 * tested nor individually walked — they're passed to the generation call
 * as background context only, so the lesson doesn't re-teach material
 * covered in earlier lessons or drift into testing prerequisites far from
 * the actual new content.
 *
 * `siblingConcepts` — the OTHER page titles (+ completion status) in the
 * same folder/subfolder as this lesson's own page — exists specifically so
 * a close prerequisite that happens to be one of the student's OWN
 * not-yet-completed pages gets taught inline rather than silently assumed
 * known just because it wasn't named in THIS page's own title (e.g. an
 * "Optimal choice" lesson assuming "Budget line" was already covered, when
 * the student's own Budget line page hadn't been done yet). See
 * matchesUnfinishedSibling. Always safe to omit/pass empty — falls back to
 * the original title-only heuristic.
 *
 * The generated content (hook fact + steps, including any resolved
 * diagram) is cached per concept+qualification+exam board (extended with a
 * forced-prerequisite fingerprint only when siblingConcepts actually forced
 * something — the common, well-ordered case keeps the exact same cache key
 * as before), same pattern as dependency_chains/encoding_diagrams — only
 * the first student to hit a given lesson IN A GIVEN teaching situation
 * pays for generation; everyone else gets an instant cache hit. The chain
 * fetch itself now always runs (even on a cache hit) since the close
 * prerequisites it reveals are needed to compute the cache key in the
 * first place — it's a fast, independently-cached read, not an LLM call,
 * so this costs one extra DB round trip per lesson start, not a Claude call.
 */
async function startEncodingLesson(conceptKey, subject, topic, concept, qualification = '', examBoard = '', siblingConcepts = []) {
    const chainResult = await (0, chainService_1.getOrGenerateChain)(conceptKey, subject, topic, concept);
    if (!chainResult.chain) {
        throw new Error('Could not generate a dependency chain for this concept.');
    }
    const chain = chainResult.chain;
    const target = chain.nodes[chain.nodes.length - 1];
    const closeIds = new Set((target.depends_on || []).map((d) => d.node_id));
    const closeNodes = chain.nodes.filter((n) => closeIds.has(n.id)).slice(0, 3);
    const coveredIds = new Set([...closeNodes.map((n) => n.id), target.id]);
    const backgroundNodes = chain.nodes.filter((n) => !coveredIds.has(n.id));
    const forcedNodeIds = closeNodes.filter((n) => matchesUnfinishedSibling(n.label, siblingConcepts)).map((n) => n.id).sort();
    const contentKey = forcedNodeIds.length
        ? `${conceptKey}::${clean(qualification)}::${clean(examBoard)}::forced_${forcedNodeIds.join('_')}`
        : `${conceptKey}::${clean(qualification)}::${clean(examBoard)}`;
    const { data: cachedContent, error: cacheError } = await supabaseAdmin_1.supabaseAdmin
        .from('encoding_lesson_content')
        .select('hook_fact, steps')
        .eq('content_key', contentKey)
        .maybeSingle();
    let hookFact;
    let cachedSteps;
    if (!cacheError && cachedContent) {
        hookFact = cachedContent.hook_fact;
        cachedSteps = cachedContent.steps;
    }
    else {
        const generated = await generateEncodingLessonContent(conceptKey, subject, topic, concept, qualification, examBoard, chain, target, closeNodes, backgroundNodes, forcedNodeIds);
        hookFact = generated.hookFact;
        cachedSteps = generated.steps;
        await supabaseAdmin_1.supabaseAdmin.from('encoding_lesson_content').insert({ content_key: contentKey, hook_fact: hookFact, steps: cachedSteps });
    }
    if (!cachedSteps.length) {
        throw new Error('Could not generate lesson content for this concept.');
    }
    // Strip expectedSolution — the client holds and round-trips `state`
    // wholesale on every submit, so anything in here is visible in the
    // network response. Grading re-fetches the cache row by contentKey
    // instead (see submitEncodingAnswer).
    const steps = cachedSteps.map(({ expectedSolution, ...step }) => step);
    const state = { conceptKey, subject, steps, currentIndex: 0, anyWeakSoFar: false, contentKey };
    return { done: false, hookFact, step: steps[0], state };
}
// The actual generation path — only ever runs on a cache miss, see
// startEncodingLesson above (which already fetched the chain and computed
// closeNodes/backgroundNodes/forcedNodeIds to build the cache key).
async function generateEncodingLessonContent(conceptKey, subject, topic, concept, qualification, examBoard, chain, target, closeNodes, backgroundNodes, forcedNodeIds) {
    const targetDerivable = resolveDerivable(target);
    const forcedIds = new Set(forcedNodeIds);
    const batch = await callJSON(encodingLessonPrompts_1.ENCODING_LESSON_BATCH_PROMPT, [
        `Subject: ${subject}`,
        `Topic: ${topic || 'unspecified'}`,
        `Qualification: ${qualification || 'unspecified'}`,
        `Exam board: ${examBoard || 'unspecified'}`,
        `Target concept (this exact lesson — every step must build toward THIS, not a related or more general concept): ${target?.label || concept}`,
        `Original lesson title, exactly as the student named it (may explicitly name more than one idea together, e.g. "X and Y" — use this to judge whether a close prerequisite below is actually one of THIS lesson's own named topics, not just background from an earlier lesson): ${concept}`,
        `Target concept is derivable from its close prerequisites: ${targetDerivable}`,
        `closePrerequisites, in order (for each: write a "check" step UNLESS it's named in the original lesson title above OR forceTeach is true, in which case teach it properly instead — see instructions): ${JSON.stringify(closeNodes.map((n) => ({ nodeId: n.id, label: n.label, forceTeach: forcedIds.has(n.id) })))}`,
        `backgroundContext (already covered earlier — reference only, do not test, do not write a step): ${JSON.stringify(backgroundNodes.map((n) => ({ nodeId: n.id, label: n.label })))}`,
    ].join('\n'), claudeClient_1.MODELS.diagnosticTree, 0.4, 
    // A concept whose close prerequisites are explicitly named in the
    // lesson's own title (e.g. "Indifference curves and MRS") gets those
    // promoted to full derive/explain beats rather than a single check
    // step each — combined with the per-step self-check now baked into
    // this prompt (longer, revised text on every beat), a content-heavy
    // multi-beat lesson can comfortably exceed 4096 output tokens and get
    // truncated mid-JSON. This only runs once per concept (cache miss),
    // so the extra headroom costs nothing at scale.
    8192);
    const nodesById = new Map(chain.nodes.map((n) => [n.id, n]));
    const draftSteps = (batch.steps || []).map((s) => ({
        nodeId: s.nodeId,
        label: nodesById.get(s.nodeId)?.label || (s.type === 'implication' ? `${target.label} — implications` : s.nodeId),
        type: s.type,
        text: s.text,
        checkQuestion: s.checkQuestion,
        // Implication steps carry a synthetic, non-chain nodeId (see prompt
        // rule 8) — they're still testing the SAME target concept at greater
        // depth, so they must diagnose against the lesson's own conceptKey
        // too, not that meaningless slug (which the drill-down couldn't have
        // resolved a cached chain for anyway).
        diagnosisConceptKey: s.nodeId === target.id || s.type === 'implication' ? conceptKey : s.nodeId,
        confident: s.confident,
        requiresCalculation: !!s.requiresCalculation,
        expectedSolution: s.requiresCalculation ? s.expectedSolution : undefined,
    }));
    await repairUncertainSteps(draftSteps, subject, qualification, examBoard);
    // expectedSolution is kept here — this is the CACHED shape (see
    // CachedEncodingStep) — and stripped later, once, right before anything
    // reaches the client (startEncodingLesson). Only "confident" (a
    // generation-time self-check artifact, meaningless afterward) is
    // dropped at this point.
    const steps = draftSteps.map(({ confident, ...step }) => step);
    if (steps.length && batch.diagram?.needed && batch.diagram.searchQuery) {
        const diagram = await withTimeout(getOrFetchDiagram(conceptKey, qualification, examBoard, subject, target.label, batch.diagram.searchQuery).catch((err) => {
            console.error('LastMind: diagram lookup failed, proceeding without one.', err);
            return null;
        }), DIAGRAM_LOOKUP_TIMEOUT_MS);
        if (diagram) {
            // The LAST target-derivation beat, not the first — a multi-beat
            // target (see ENCODING_LESSON_BATCH_PROMPT point 4, "break it into
            // as many sequential beats as the concept genuinely requires") often
            // has earlier beats establishing a piece of reasoning before the
            // full picture (the thing the diagram actually shows) comes together
            // at the end. Attaching it to whichever beat happened to be first
            // showed the diagram at a point in the lesson that hadn't earned it
            // yet — visually unrelated to what was being asked right then.
            const targetSteps = steps.filter((s) => s.nodeId === target.id && (s.type === 'derive' || s.type === 'explain'));
            const targetStep = targetSteps[targetSteps.length - 1];
            if (targetStep)
                targetStep.diagram = diagram;
        }
    }
    return { hookFact: batch.hookFact, steps };
}
// Re-fetches a calculation step's verified solution from the content
// cache — never round-tripped through the client (see CachedEncodingStep).
// Used both at grading time (below) and by the math error-localization
// diagnostic entry (diagnosticOrchestrator.ts's startMathDiagnosis), which
// needs the same ground truth to find where a student's working actually
// went wrong. null on any miss (cache row gone/changed since the lesson
// started, or the step somehow has none) — callers fall back rather than
// failing outright.
async function fetchExpectedSolution(contentKey, stepIndex) {
    const { data, error } = await supabaseAdmin_1.supabaseAdmin
        .from('encoding_lesson_content')
        .select('steps')
        .eq('content_key', contentKey)
        .maybeSingle();
    if (error || !data)
        return null;
    const cachedSteps = data.steps;
    return cachedSteps[stepIndex]?.expectedSolution || null;
}
/**
 * Advances the lesson by one step. ALWAYS advances, regardless of the
 * answer's quality — this is a first-exposure lesson, not a gate, and a
 * student who gets stuck re-litigating one step with an AI grader can't
 * actually finish the lesson. Every step type is graded (one combined
 * call for verdict + feedback) — "check"/"scene"/"derive"/"implication"
 * against the prompt text itself, "explain" against its checkQuestion
 * (this is brand-new content with nothing for FSRS to have already
 * confirmed, so this is the only check that a thin/misunderstood
 * explanation doesn't silently become the shaky foundation for later
 * steps). The verdict only affects: (a) the feedback shown alongside that
 * step, and (b) the FSRS grade recorded for the whole concept once the
 * lesson finishes — any weak step drops the whole lesson to a lower grade,
 * which is exactly what surfaces it sooner in future spaced-repetition
 * sessions, rather than blocking progress now.
 */
async function submitEncodingAnswer(userId, state, answer, dontKnow = false) {
    const currentStep = state.steps[state.currentIndex];
    if (!currentStep) {
        return { done: true, state };
    }
    // "I don't know" is an unambiguous verdict — skip the grading call
    // entirely (real cost saved every time this is used) rather than asking
    // Claude to grade an empty/absent answer.
    let correct;
    let feedback;
    const gradingPrompt = currentStep.type === 'explain' ? (currentStep.checkQuestion || currentStep.text) : currentStep.text;
    if (dontKnow) {
        correct = false;
        feedback = null;
    }
    else if (currentStep.requiresCalculation) {
        // Ground-truth-backed grading — the generation step already verified
        // this has a clean, correct solution (see ENCODING_LESSON_BATCH_PROMPT
        // rule 1c); check the student's own working against it rather than
        // judging plausibility alone. Sonnet, not Haiku, here specifically —
        // reliably judging numeric/algebraic equivalence is worth the step up.
        const expectedSolution = await fetchExpectedSolution(state.contentKey, state.currentIndex);
        if (expectedSolution) {
            const check = await callJSON(encodingLessonPrompts_1.ENCODING_MATH_ANSWER_CHECK_PROMPT, `Concept/step: ${currentStep.label}\nQuestion: ${gradingPrompt}\nVerified correct solution (reference only, never shown to the student): ${expectedSolution}\nStudent's working: ${answer}`, claudeClient_1.MODELS.diagnosticTree, 0.1);
            correct = check.correct;
            feedback = check.feedback;
        }
        else {
            // Cache row gone/changed since this lesson started — fall back to
            // grading without ground truth rather than failing the submission.
            console.error('LastMind: expectedSolution missing for a calculation step, falling back to ungrounded grading.', { contentKey: state.contentKey, stepIndex: state.currentIndex });
            const check = await callJSON(encodingLessonPrompts_1.ENCODING_ANSWER_CHECK_PROMPT, `Concept/step: ${currentStep.label}\nPrompt: ${gradingPrompt}\nStudent's answer: ${answer}`, claudeClient_1.MODELS.simpleQuestion, 0.2);
            correct = check.correct;
            feedback = check.feedback;
        }
    }
    else {
        const check = await callJSON(encodingLessonPrompts_1.ENCODING_ANSWER_CHECK_PROMPT, `Concept/step: ${currentStep.label}\nPrompt: ${gradingPrompt}\nStudent's answer: ${answer}`, claudeClient_1.MODELS.simpleQuestion, 0.2);
        correct = check.correct;
        feedback = check.feedback;
    }
    const nextIndex = state.currentIndex + 1;
    const anyWeakSoFar = state.anyWeakSoFar || !correct;
    const nextState = { ...state, currentIndex: nextIndex, anyWeakSoFar };
    if (nextIndex >= state.steps.length) {
        // Same rating scale/table the retrieval engine uses (gradeAndRecordReview
        // -> RATING_MAP), so this concept slots into the exact same FSRS
        // schedule — a rocky first encoding lesson brings it back around sooner.
        // Skipped if a scene/derive/explain diagnostic drill-down already
        // graded this exact conceptKey mid-lesson (see
        // targetGradedViaDrillDown) — otherwise the concept gets FSRS-graded
        // twice in one session, artificially inflating its stability.
        if (!state.targetGradedViaDrillDown) {
            await (0, reviewService_1.gradeAndRecordReview)(userId, state.conceptKey, anyWeakSoFar ? 'hard' : 'easy');
        }
        return { done: true, correct, feedback, state: nextState };
    }
    return { done: false, correct, feedback, step: state.steps[nextIndex], state: nextState };
}
async function generateNotesFromLesson(subject, pageTitle, lessons) {
    const raw = await (0, claudeClient_1.callClaudeJSON)({
        model: claudeClient_1.MODELS.diagnosticTree,
        systemPrompt: encodingLessonPrompts_1.NOTES_FROM_LESSON_PROMPT,
        userContent: [
            `Subject: ${subject}`,
            `Page title: ${pageTitle}`,
            `Lessons on this page, in order: ${JSON.stringify(lessons.map((l) => ({
                concept: l.concept,
                hookFact: l.hookFact,
                steps: l.steps.map((s) => ({ label: s.label, type: s.type, text: s.text, checkQuestion: s.checkQuestion })),
            })))}`,
        ].join('\n'),
        temperature: 0.3,
        // Scales with how many lessons this page covers — a single-lesson
        // page keeps the same headroom as before; a multi-lesson page needs
        // more room to cover every concept without truncating.
        maxTokens: Math.min(1024 * Math.max(1, lessons.length), 8192),
    });
    return raw.trim();
}
