import { Router, Request, Response } from 'express';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'No code provided' });
    }

    // Your compile logic here
    // Example:
    // const result = await compileCode(code);

    res.json({ output: 'Compilation successful' });
  } catch (err) {
    console.error('Compile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

