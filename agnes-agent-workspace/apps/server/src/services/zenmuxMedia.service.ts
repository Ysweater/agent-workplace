import { GoogleGenAI } from '@google/genai';
import { readEnvKey } from '../config/modelCatalog.js';

const ZENMUX_BASE = 'https://zenmux.ai/api/vertex-ai';

function getClient(): GoogleGenAI {
  const apiKey = readEnvKey('ZENMUX_API_KEY');
  if (!apiKey) {
    throw new Error('ZENMUX_API_KEY is not configured');
  }
  return new GoogleGenAI({
    apiKey,
    vertexai: true,
    httpOptions: { baseUrl: ZENMUX_BASE, apiVersion: 'v1' },
  });
}

async function resolveImageBytes(image: {
  imageBytes?: string;
  gcsUri?: string;
  mimeType?: string;
}): Promise<{ mimeType: string; base64: string }> {
  if (image.imageBytes) {
    return { mimeType: image.mimeType ?? 'image/png', base64: image.imageBytes };
  }

  const uri = image.gcsUri;
  if (!uri) {
    throw new Error('ZenMux image generation returned no image data');
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated image (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get('content-type')?.split(';')[0] ?? image.mimeType ?? 'image/png';
  return { mimeType, base64: buffer.toString('base64') };
}

export async function generateZenmuxImage(
  prompt: string,
  model = 'qwen/qwen-image-2.0',
): Promise<{ mimeType: string; base64: string; model: string; uri?: string }> {
  const client = getClient();
  const response = await client.models.generateImages({ model, prompt });
  const image = response.generatedImages?.[0]?.image;
  if (!image) {
    throw new Error('ZenMux image generation returned no image');
  }

  const { mimeType, base64 } = await resolveImageBytes(image);
  return {
    mimeType,
    base64,
    model,
    ...(image.gcsUri ? { uri: image.gcsUri } : {}),
  };
}

export async function generateZenmuxVideo(
  prompt: string,
  model = 'google/veo-3.1-fast-generate-001',
  pollIntervalMs = 15_000,
  maxWaitMs = 300_000,
): Promise<{ uri?: string; model: string; done: boolean; submitted: boolean }> {
  const client = getClient();
  let operation = await client.models.generateVideos({ model, prompt });
  const submitted = Boolean(operation.name || operation.done);
  const deadline = Date.now() + maxWaitMs;

  while (!operation.done && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    operation = await client.operations.get({ operation });
  }

  const videos = operation.response?.generatedVideos ?? [];
  const first = videos[0]?.video;
  const uri = first?.uri ?? (first as { gcsUri?: string } | undefined)?.gcsUri;
  return {
    uri: uri ?? undefined,
    model,
    done: Boolean(operation.done),
    submitted,
  };
}

export async function generateZenmuxChat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  model: string,
): Promise<string> {
  const client = getClient();
  const system = messages.find((m) => m.role === 'system')?.content;
  const turns = messages.filter((m) => m.role !== 'system');

  const response = await client.models.generateContent({
    model,
    contents: turns.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    ...(system
      ? {
          config: {
            systemInstruction: system,
          },
        }
      : {}),
  });

  return response.text ?? '';
}
