import { Router, Request, Response } from 'express';
import {
  getTags,
  createTag,
  updateTag,
  deleteTag,
  getTagTransactions,
} from '../../firefly/client';
import logger from '../../lib/logger';

const router = Router();

// ── Tags CRUD ─────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const page  = parseInt(String(req.query.page  ?? '1'));
    const limit = parseInt(String(req.query.limit ?? '200'));
    const tags = await getTags(page, limit);
    res.json({ data: tags });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /tags error');
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { tag, description, date } = req.body;
    if (!tag) return res.status(400).json({ error: 'tag name is required' });
    const created = await createTag({ tag, description, date });
    res.status(201).json({ data: created });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'POST /tags error');
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

router.put('/:tag', async (req: Request, res: Response) => {
  try {
    const { tag, description } = req.body;
    const updated = await updateTag(String(req.params.tag), { tag, description });
    res.json({ data: updated });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'PUT /tags error');
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

router.delete('/:tag', async (req: Request, res: Response) => {
  try {
    await deleteTag(String(req.params.tag));
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'DELETE /tags error');
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// ── Tag Transactions ──────────────────────────────────────────────────────────

router.get('/:tag/transactions', async (req: Request, res: Response) => {
  try {
    const page  = parseInt(String(req.query.page  ?? '1'));
    const limit = parseInt(String(req.query.limit ?? '50'));
    const txns = await getTagTransactions(String(req.params.tag), page, limit);
    res.json({ data: txns });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /tags/:tag/transactions error');
    res.status(500).json({ error: 'Failed to fetch tag transactions' });
  }
});

export default router;
