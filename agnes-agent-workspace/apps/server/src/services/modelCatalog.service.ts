import {
  MODEL_PRESETS,
  getPresetById,
  listPresetsWithKeys,
  resolvePresetApiKey,
  type ModelCapability,
  type ModelPreset,
} from '../config/modelCatalog.js';
import { generateZenmuxChat, generateZenmuxImage, generateZenmuxVideo } from './zenmuxMedia.service.js';

export interface CatalogEntry extends ModelPreset {
  configured: boolean;
  status: 'unknown' | 'ok' | 'error';
  statusMessage?: string;
}

async function testPresetConnectivity(
  preset: ModelPreset,
): Promise<{ ok: boolean; message: string; sample?: string }> {
  const apiKey = resolvePresetApiKey(preset);
  if (!apiKey) {
    return { ok: false, message: `缺少 ${preset.envKey}` };
  }

  const started = Date.now();

  if (preset.capability === 'image') {
    try {
      const result = await generateZenmuxImage('A small red dot on white background', preset.model);
      return {
        ok: Boolean(result.base64),
        message: `生图连通成功 (${Date.now() - started}ms)`,
        sample: `${result.mimeType}, ${Math.round(result.base64.length / 1024)}KB`,
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '生图测试失败' };
    }
  }

  if (preset.capability === 'video') {
    try {
      const result = await generateZenmuxVideo(
        'A golden retriever running on the beach',
        preset.model,
        5_000,
        8_000,
      );
      const ok = result.done || Boolean(result.uri) || result.submitted;
      return {
        ok,
        message: result.done
          ? `视频生成完成 (${Date.now() - started}ms)`
          : result.submitted
            ? `视频任务已提交${result.uri ? '，可下载' : '，生成中'} (${Date.now() - started}ms)`
            : '视频提交失败',
        sample: result.uri?.slice(0, 80),
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '视频测试失败' };
    }
  }

  try {
    if (preset.provider === 'zenmux') {
      const sample = await generateZenmuxChat(
        [{ role: 'user', content: 'Reply with exactly: OK' }],
        preset.model,
      );
      return {
        ok: Boolean(sample?.trim()),
        message: `ZenMux 连通成功 (${Date.now() - started}ms)`,
        sample: sample?.trim().slice(0, 80),
      };
    }

    const url = `${preset.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: preset.model,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_tokens: 16,
        temperature: 0,
      }),
    });

    const raw = await response.text();
    let data: { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      return { ok: false, message: `无效响应 (${response.status})` };
    }

    if (!response.ok) {
      return { ok: false, message: data.error?.message ?? `HTTP ${response.status}` };
    }

    const sample = data.choices?.[0]?.message?.content ?? '';
    return {
      ok: true,
      message: `连通成功 (${Date.now() - started}ms)`,
      sample: sample.slice(0, 80),
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : '测试失败' };
  }
}

export async function getModelCatalog(test = false): Promise<CatalogEntry[]> {
  const withKeys = listPresetsWithKeys();
  const entries: CatalogEntry[] = [];

  for (const preset of MODEL_PRESETS) {
    const configured = withKeys.some((p) => p.id === preset.id);
    let status: CatalogEntry['status'] = configured ? 'unknown' : 'error';
    let statusMessage = configured ? undefined : `未配置 ${preset.envKey}`;

    if (configured && test) {
      const result = await testPresetConnectivity(preset);
      status = result.ok ? 'ok' : 'error';
      statusMessage = result.message;
      if (result.sample) statusMessage += ` · ${result.sample}`;
    } else if (configured) {
      status = 'ok';
      statusMessage = '已配置';
    }

    entries.push({ ...preset, configured, status, statusMessage });
  }

  return entries;
}

export function selectPresetConfig(presetId: string): {
  provider: ModelPreset['provider'];
  model: string;
  baseUrl: string;
  apiKey: string;
  presetId: string;
} {
  const preset = getPresetById(presetId);
  if (!preset) {
    throw new Error(`Unknown model preset: ${presetId}`);
  }
  const apiKey = resolvePresetApiKey(preset);
  if (!apiKey) {
    throw new Error(`Missing API key env: ${preset.envKey}`);
  }
  return {
    provider: preset.provider,
    model: preset.model,
    baseUrl: preset.baseUrl,
    apiKey,
    presetId,
  };
}

export function getDefaultChatPreset(): ModelPreset | undefined {
  return (
    MODEL_PRESETS.find((p) => p.default && p.capability === 'chat' && resolvePresetApiKey(p)) ??
    listPresetsWithKeys().find((p) => p.capability === 'chat')
  );
}

export function listChatPresets(): ModelPreset[] {
  return listPresetsWithKeys().filter((p) => p.capability === 'chat');
}

export function listMediaPresets(capability: Extract<ModelCapability, 'image' | 'video'>): ModelPreset[] {
  return listPresetsWithKeys().filter((p) => p.capability === capability);
}
