import { Router } from 'express';
import {
  applyModelPreset,
  getPublicModelsInfo,
  resetRuntimeModelConfig,
  testModelConnection,
  updateRuntimeModelConfig,
  type ModelProviderType,
} from '../services/modelProvider.service.js';
import { getModelCatalog } from '../services/modelCatalog.service.js';
import {
  deleteSessionModelPreference,
  getSessionPublicModelInfo,
  saveSessionModelPreference,
} from '../services/sessionModelPreference.service.js';

export const modelRoutes = Router();

modelRoutes.get('/', async (req, res) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
  if (sessionId?.trim()) {
    res.json(await getSessionPublicModelInfo(sessionId));
    return;
  }
  res.json(getPublicModelsInfo());
});

modelRoutes.get('/catalog', async (req, res) => {
  const test = req.query.test === '1' || req.query.test === 'true';
  const catalog = await getModelCatalog(test);
  res.json({ items: catalog, active: getPublicModelsInfo() });
});

modelRoutes.post('/select', async (req, res) => {
  try {
    const { presetId, sessionId } = req.body as { presetId?: string; sessionId?: string };
    if (!presetId?.trim()) {
      res.status(400).json({ error: 'presetId is required' });
      return;
    }
    if (sessionId?.trim()) {
      await saveSessionModelPreference(sessionId, { presetId: presetId.trim() });
      res.json(await getSessionPublicModelInfo(sessionId));
      return;
    }
    res.json(applyModelPreset(presetId.trim()));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid preset';
    res.status(400).json({ error: message });
  }
});

modelRoutes.post('/', async (req, res) => {
  try {
    const body = req.body as {
      provider?: ModelProviderType;
      baseUrl?: string;
      model?: string;
      apiKey?: string;
      temperature?: number;
      presetId?: string;
      sessionId?: string;
    };
    if (body.sessionId?.trim()) {
      await saveSessionModelPreference(body.sessionId, body);
      res.json(await getSessionPublicModelInfo(body.sessionId));
      return;
    }
    res.json(updateRuntimeModelConfig(body));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid model config';
    res.status(400).json({ error: message });
  }
});

modelRoutes.post('/test', async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      provider?: ModelProviderType;
      baseUrl?: string;
      model?: string;
      apiKey?: string;
      temperature?: number;
    };
    const result = await testModelConnection(body);
    res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Model test failed';
    res.status(500).json({ ok: false, message });
  }
});

modelRoutes.delete('/', async (req, res) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
  if (sessionId?.trim()) {
    await deleteSessionModelPreference(sessionId);
    res.json(await getSessionPublicModelInfo(sessionId));
    return;
  }
  res.json(resetRuntimeModelConfig());
});
