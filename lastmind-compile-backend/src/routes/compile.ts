import { Router, Request, Response } from 'express';
import { applyStructuredPIIFilter } from '../safety/piiFilterStructured';
import { applyContextualPIIFilter } from '../safety/piiFilterContextual';
import { applyHarmfulContentFilter } from '../safety/harmfulContentFilter';
import { processNotes } from '../services/claudeClient';

const router = Router();

interface CompileRequestBody {
  notes?: unknown;
}

router.post('/compile', async (req: Request<{}, {}, CompileRequestBody>, res: Response) => {
  const { notes } = req.body;

  if (typeof notes !== 'string' || notes.trim().length === 0) {
    return res.status(400).json({
      error: 'Invalid input: notes must be a non-empty string.',
    });
  }

  try {
    // 1) Structured PII removal (regex-based shapes: emails, phones, etc.)
    const cleaned1 = applyStructuredPIIFilter(notes);

    // 2) Contextual PII removal (phrase-based: "my name is X", etc.)
    const cleaned2 = applyContextualPIIFilter(cleaned1);

    // 3) Harmful content cleaning (keyword/heuristic-based)
    const safeText = applyHarmfulContentFilter(cleaned2);

    // 4) Only the filtered text ever reaches Claude.
    const result = await processNotes(safeText);

    return res.status(200).json({
      result,
      safeText,
    });
  } catch (err) {
    console.error('Unexpected error in /compile:', err);
    return res.status(500).json({
      error: 'Processing failed. Please try again later.',
    });
  }
});

export default router;
