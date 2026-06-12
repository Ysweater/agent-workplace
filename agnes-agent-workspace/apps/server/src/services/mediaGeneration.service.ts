import { readEnvKey } from '../config/modelCatalog.js';
import { generateZenmuxImage, generateZenmuxVideo } from './zenmuxMedia.service.js';

interface AgnesImageResponse {
  data?: Array<{
    url?: string | null;
    b64_json?: string | null;
  }>;
  error?: { message?: string };
}

interface AgnesVideoCreateResponse {
  id?: string;
  task_id?: string;
  video_id?: string;
  status?: string;
  error?: { message?: string } | string | null;
}

interface AgnesVideoStatusResponse extends AgnesVideoCreateResponse {
  progress?: number;
  remixed_from_video_id?: string;
  video_url?: string;
  url?: string;
  output?: string | { url?: string };
}

function agnesApiKey(): string {
  const key = readEnvKey('AGNES_API_KEY') || readEnvKey('MODEL_API_KEY');
  if (!key) {
    throw new Error('AGNES_API_KEY is not configured');
  }
  return key;
}

function isAgnesImageModel(model: string): boolean {
  return model.startsWith('agnes-image-');
}

function isAgnesVideoModel(model: string): boolean {
  return model.startsWith('agnes-video-');
}

async function readJson<T>(response: Response): Promise<T> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid JSON response (${response.status}): ${raw.slice(0, 200)}`);
  }
}

async function fetchImageAsBase64(uri: string): Promise<{ mimeType: string; base64: string }> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated image (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    mimeType: response.headers.get('content-type')?.split(';')[0] ?? 'image/png',
    base64: buffer.toString('base64'),
  };
}

export async function generateMediaImage(
  prompt: string,
  model = 'agnes-image-2.1-flash',
): Promise<{ mimeType: string; base64: string; model: string; uri?: string }> {
  if (!isAgnesImageModel(model)) {
    return generateZenmuxImage(prompt, model);
  }

  const response = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${agnesApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      size: '1024x768',
      return_base64: true,
      extra_body: { response_format: 'b64_json' },
    }),
  });
  const data = await readJson<AgnesImageResponse>(response);
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Agnes image error ${response.status}`);
  }

  const first = data.data?.[0];
  if (first?.b64_json) {
    return { mimeType: 'image/png', base64: first.b64_json, model, ...(first.url ? { uri: first.url } : {}) };
  }
  if (first?.url) {
    const image = await fetchImageAsBase64(first.url);
    return { ...image, model, uri: first.url };
  }
  throw new Error('Agnes image generation returned no image data');
}

function extractVideoUri(data: AgnesVideoStatusResponse): string | undefined {
  if (typeof data.output === 'string') return data.output;
  return (
    data.remixed_from_video_id ??
    data.video_url ??
    data.url ??
    data.output?.url ??
    undefined
  );
}

async function queryAgnesVideo(videoId: string, model: string): Promise<AgnesVideoStatusResponse> {
  const url = new URL('https://apihub.agnes-ai.com/agnesapi');
  url.searchParams.set('video_id', videoId);
  url.searchParams.set('model_name', model);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${agnesApiKey()}` },
  });
  const data = await readJson<AgnesVideoStatusResponse>(response);
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : data.error?.message;
    throw new Error(message ?? `Agnes video status error ${response.status}`);
  }
  return data;
}

export async function generateMediaVideo(
  prompt: string,
  model = 'agnes-video-v2.0',
  pollIntervalMs = 5_000,
  maxWaitMs = 45_000,
): Promise<{ uri?: string; model: string; done: boolean; submitted: boolean }> {
  if (!isAgnesVideoModel(model)) {
    return generateZenmuxVideo(prompt, model, pollIntervalMs, maxWaitMs);
  }

  const response = await fetch('https://apihub.agnes-ai.com/v1/videos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${agnesApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      width: 1152,
      height: 768,
      num_frames: 121,
      frame_rate: 24,
    }),
  });
  const created = await readJson<AgnesVideoCreateResponse>(response);
  if (!response.ok) {
    const message = typeof created.error === 'string' ? created.error : created.error?.message;
    throw new Error(message ?? `Agnes video create error ${response.status}`);
  }

  const videoId = created.video_id ?? created.task_id ?? created.id;
  if (!videoId) {
    throw new Error('Agnes video creation returned no task id');
  }

  const deadline = Date.now() + maxWaitMs;
  let latest: AgnesVideoStatusResponse = created;
  while (Date.now() < deadline) {
    latest = await queryAgnesVideo(videoId, model);
    const uri = extractVideoUri(latest);
    if (latest.status === 'completed' || uri) {
      return { uri, model, done: true, submitted: true };
    }
    if (latest.status === 'failed') {
      const message = typeof latest.error === 'string' ? latest.error : latest.error?.message;
      throw new Error(message ?? 'Agnes video generation failed');
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return {
    uri: extractVideoUri(latest),
    model,
    done: latest.status === 'completed',
    submitted: true,
  };
}
