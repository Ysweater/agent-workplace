import { Router } from 'express';
import { getWebSearchStatus, performWebSearch } from '../services/webSearch.service.js';

export const searchRoutes = Router();

searchRoutes.get('/status', (_req, res) => {
  res.json(getWebSearchStatus());
});

searchRoutes.post('/test', async (req, res) => {
  const query = String(req.body?.query ?? 'AI Agent 发展趋势').trim();
  const maxResults = Number(req.body?.maxResults ?? 3);
  const result = await performWebSearch(query, maxResults);
  res.status(result.sources.length > 0 ? 200 : 502).json(result);
});
