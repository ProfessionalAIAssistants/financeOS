import { Router, Request, Response } from 'express';
import {
  getTags,
  createTag,
  updateTag,
  deleteTag,
  getTagTransactions,
} from '../../firefly/client';

const router = Router();

// ── Tags CRUD ─────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '200' } = req.query as Record<string, string>;
    const tags = await getTags(parseInt(page), parseInt(limit));
    res.json({ data: tags });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tags', details: String(err) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { tag, description, date } = req.body;
    if (!tag) return res.status(400).json({ error: 'tag name is required' });
    const created = await createTag({ tag, description, date });
    res.status(201).json({ data: created });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tag', details: String(err) });
  }
});

router.put('/:tag', async (req: Request, res: Response) => {
  try {
    const { tag, description } = req.body;
    const updated = await updateTag(req.params.tag, { tag, description });
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update tag', details: String(err) });
  }
});

router.delete('/:tag', async (req: Request, res: Response) => {
  try {
    await deleteTag(req.params.tag);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete tag', details: String(err) });
  }
});

// ── Tag Transactions ──────────────────────────────────────────────────────────

router.get('/:tag/transactions', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '50' } = req.query as Record<string, string>;
    const txns = await getTagTransactions(req.params.tag, parseInt(page), parseInt(limit));
    res.json({ data: txns });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tag transactions', details: String(err) });
  }
});

export default router;
