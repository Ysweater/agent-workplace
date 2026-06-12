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

export const modelRoutes = Router();

modelRoutes.get('/', (_req, res) => {
  res.json(getPublicModelsInfo());
});

modelRoutes.get('/catalog', async (req, res) => {
  const test = req.query.test === '1' || req.query.test === 'true';
  const catalog = await getModelCatalog(test);
  res.json({ items: catalog, active: getPublicModelsInfo() });
});

modelRoutes.post('/select', (req, res) => {
  try {
    const { presetId } = req.body as { presetId?: string };
    if (!presetId?.trim()) {
      res.status(400).json({ error: 'presetId is required' });
      return;
    }
    res.json(applyModelPreset(presetId.trim()));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid preset';
    res.status(400).json({ error: message });
  }
});

modelRoutes.post('/', (req, res) => {
  try {
    const body = req.body as {
      provider?: ModelProviderType;
      baseUrl?: string;
      model?: string;
      apiKey?: string;
      temperature?: number;
    };
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

modelRoutes.delete('/', (_req, res) => {
  res.json(resetRuntimeModelConfig());
});
