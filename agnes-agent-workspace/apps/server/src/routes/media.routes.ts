import { Router } from 'express';
import { getPresetById } from '../config/modelCatalog.js';
import { createHttpError } from '../middleware/errorHandler.js';
import { generateMediaImage, generateMediaVideo } from '../services/mediaGeneration.service.js';

export const mediaRoutes = Router();

mediaRoutes.post('/image', async (req, res) => {
  const { prompt, model, presetId } = req.body as {
    prompt?: string;
    model?: string;
    presetId?: string;
  };

  const trimmed = prompt?.trim();
  if (!trimmed) {
    throw createHttpError(400, 'prompt is required');
  }

  const presetModel = presetId ? getPresetById(presetId)?.model : undefined;
  const result = await generateMediaImage(trimmed, model ?? presetModel ?? 'agnes-image-2.1-flash');
  res.json({
    ok: true,
    mimeType: result.mimeType,
    base64: result.base64,
    model: result.model,
    dataUrl: `data:${result.mimeType};base64,${result.base64}`,
    ...(result.uri ? { uri: result.uri } : {}),
  });
});

mediaRoutes.post('/video', async (req, res) => {
  const { prompt, model, presetId } = req.body as {
    prompt?: string;
    model?: string;
    presetId?: string;
  };

  const trimmed = prompt?.trim();
  if (!trimmed) {
    throw createHttpError(400, 'prompt is required');
  }

  const presetModel = presetId ? getPresetById(presetId)?.model : undefined;
  const result = await generateMediaVideo(
    trimmed,
    model ?? presetModel ?? 'agnes-video-v2.0',
  );

  res.json({
    ok: result.done || result.submitted,
    model: result.model,
    uri: result.uri,
    done: result.done,
    submitted: result.submitted,
    message: result.done
      ? '视频生成完成'
      : result.submitted
        ? '视频任务已提交，生成中或超时未完成'
        : '视频提交失败',
  });
});
