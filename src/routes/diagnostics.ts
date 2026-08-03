import { Router } from "express";
import { callClaudeJSON, MODELS } from "../services/claudeClient";
import { requireAuth } from "../services/authMiddleware";
import { costlyEndpointLimiter } from "../services/rateLimiters";
import { MULTI_QUESTION_GENERATION_PROMPT } from "../constants/diagnosticPrompts";
import { runDiagnosticStep } from "../services/diagnosticOrchestrator";

const router = Router();

function stripCodeFences(text: string): string {
    return text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
}

router.use("/diagnostics", requireAuth, costlyEndpointLimiter);

router.post("/diagnostics/generate-set", async (req, res) => {
    const { subject, topic, lesson, notes } = req.body ?? {};

    if (!topic && !lesson) {
        return res.status(400).json({ error: "topic or lesson is required" });
    }

    try {
        const userContent = [
            `Subject: ${subject || "unspecified"}`,
            `Topic: ${topic || "unspecified"}`,
            `Lesson: ${lesson || "unspecified"}`,
            notes
                ? `Student's notes:\n${notes}`
                : "No notes provided — base questions on the topic/lesson description alone."
        ].join("\n");

        const raw = await callClaudeJSON({
            model: MODELS.diagnosticTree,
            systemPrompt: MULTI_QUESTION_GENERATION_PROMPT,
            userContent
        });

        const parsed = JSON.parse(stripCodeFences(raw));
        res.json(parsed);
    } catch (err) {
        console.error("Question set generation failed:", err);
        res.status(500).json({ error: "could not generate questions" });
    }
});

router.post("/diagnostics/submit-answer", async (req, res) => {
    const { subject, conceptLabel, originalQuestion, state, answer, dontKnow } = req.body ?? {};

    const currentState =
        state || {
            engine: "pending",
            conceptKey: conceptLabel,
            conceptLabel,
            subject: subject || "",
            originalQuestion,
            slipStage: "initial"
        };

    try {
        const result = await runDiagnosticStep(
            req.userId ?? "",   // FIXED: always a string
            currentState,
            typeof answer === "string" ? answer : "",
            !!dontKnow
        );

        res.json(result);
    } catch (err) {
        console.error("Diagnostic answer processing failed:", err);
        res.status(500).json({ error: "could not process this answer" });
    }
});

export default router;

