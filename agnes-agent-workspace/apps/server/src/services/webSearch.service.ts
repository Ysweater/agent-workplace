import { search, SafeSearchType } from 'duck-duck-scrape';
import {
  createRunModelBindings,
  modelProviderService,
  type ModelRunSnapshot,
} from './modelProvider.service.js';

export interface SearchSource {
  id: string;
  title: string;
  url: string;
  snippet: string;
}

export type WebSearchProvider =
  | 'bocha'
  | 'tavily'
  | 'serper'
  | 'jina'
  | 'duckduckgo'
  | 'llm_context'
  | 'mock';

export interface WebSearchResult {
  sources: SearchSource[];
  provider: WebSearchProvider;
  mocked: boolean;
  query: string;
  error?: string;
}

function toSources(
  items: Array<{ title: string; url: string; snippet: string }>,
): SearchSource[] {
  return items
    .filter((item) => item.url && !item.url.includes('example.com'))
    .map((item, index) => ({
      id: `S${index + 1}`,
      title: item.title.trim() || `Result ${index + 1}`,
      url: item.url.trim(),
      snippet: item.snippet.trim() || '(无摘要)',
    }));
}

function parseBochaPages(raw: string): SearchSource[] {
  const data = JSON.parse(raw) as {
    data?: {
      webPages?: {
        value?: Array<{
          name?: string;
          title?: string;
          url?: string;
          snippet?: string;
          summary?: string;
        }>;
      };
    };
    webPages?: {
      value?: Array<{
        name?: string;
        title?: string;
        url?: string;
        snippet?: string;
        summary?: string;
      }>;
    };
  };

  const pages = data.data?.webPages?.value ?? data.webPages?.value ?? [];
  return toSources(
    pages.map((p) => ({
      title: p.name ?? p.title ?? '',
      url: p.url ?? '',
      snippet: p.summary ?? p.snippet ?? '',
    })),
  );
}

async function searchBocha(query: string, maxResults: number, apiKey: string): Promise<SearchSource[]> {
  const response = await fetch('https://api.bochaai.com/v1/web-search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      count: maxResults,
      summary: true,
      freshness: 'oneYear',
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Bocha error ${response.status}: ${raw.slice(0, 200)}`);
  }

  return parseBochaPages(raw);
}

async function searchTavily(query: string, maxResults: number, apiKey: string): Promise<SearchSource[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: 'basic',
      include_answer: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  return toSources(
    (data.results ?? []).map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.content ?? '',
    })),
  );
}

async function searchSerper(query: string, maxResults: number, apiKey: string): Promise<SearchSource[]> {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({ q: query, num: maxResults, gl: 'cn', hl: 'zh-cn' }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Serper error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    organic?: Array<{ title?: string; link?: string; snippet?: string }>;
  };

  return toSources(
    (data.organic ?? []).map((r) => ({
      title: r.title ?? '',
      url: r.link ?? '',
      snippet: r.snippet ?? '',
    })),
  );
}

async function searchJina(query: string, maxResults: number, apiKey?: string): Promise<SearchSource[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch('https://s.jina.ai/', {
    method: 'POST',
    headers,
    body: JSON.stringify({ q: query, num: maxResults, hl: 'zh-cn', gl: 'cn' }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jina error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ title?: string; url?: string; description?: string; content?: string }>;
  };

  return toSources(
    (data.data ?? []).map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.description ?? r.content?.slice(0, 240) ?? '',
    })),
  );
}

async function searchDuckDuckGo(query: string, maxResults: number): Promise<SearchSource[]> {
  const response = await search(query, {
    safeSearch: SafeSearchType.STRICT,
  });

  const items = (response.results ?? [])
    .filter((r) => r.url && !r.url.includes('duckduckgo.com/y.js'))
    .slice(0, maxResults)
    .map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.description ?? r.rawDescription ?? '',
    }));

  return toSources(items);
}

function parseLlmSourcePayload(content: string): Array<{ title?: string; url?: string; snippet?: string }> {
  const trimmed = content.trim();
  const jsonBlock = trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const candidate = jsonBlock ?? trimmed;

  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (Array.isArray(parsed)) return parsed as Array<{ title?: string; url?: string; snippet?: string }>;
    if (parsed && typeof parsed === 'object') {
      const record = parsed as { sources?: Array<{ title?: string; url?: string; snippet?: string }> };
      if (Array.isArray(record.sources)) return record.sources;
    }
  } catch {
    const arrStart = candidate.indexOf('[');
    const arrEnd = candidate.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) {
      try {
        return JSON.parse(candidate.slice(arrStart, arrEnd + 1)) as Array<{
          title?: string;
          url?: string;
          snippet?: string;
        }>;
      } catch {
        // fall through
      }
    }
  }
  return [];
}

/** When no search API is available, use the configured LLM to propose citable reference points. */
async function searchLlmContext(
  query: string,
  maxResults: number,
  snapshot?: ModelRunSnapshot,
): Promise<SearchSource[]> {
  const bindings = snapshot ? createRunModelBindings(snapshot) : null;
  const info = bindings?.getModelsInfo() ?? modelProviderService.getModelsInfo();
  if (info.usingMock) return [];

  const generateText =
    bindings?.generateText.bind(bindings) ??
    ((messages: Parameters<typeof modelProviderService.generateText>[0], options?: Parameters<typeof modelProviderService.generateText>[1]) =>
      modelProviderService.generateText(messages, options));

  const result = await generateText(
    [
      {
        role: 'system',
        content:
          '你是调研助手。只输出 JSON 数组，每项含 title、url、snippet。url 使用 https 真实站点，优先权威机构与主流媒体。',
      },
      {
        role: 'user',
        content: `为以下主题提供 ${maxResults} 条参考来源（中文优先）：\n${query}`,
      },
    ],
    { temperature: 0.2, maxTokens: 2500 },
  );

  if (result.mocked) return [];

  const rows = parseLlmSourcePayload(result.content);
  return toSources(
    rows
      .filter((r) => r.url?.startsWith('http'))
      .slice(0, maxResults)
      .map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.snippet ?? '',
      })),
  );
}

function resolveProviderOrder(): WebSearchProvider[] {
  const bochaKey = process.env.BOCHA_API_KEY?.trim();
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  const serperKey = process.env.SERPER_API_KEY?.trim();
  const jinaKey = process.env.JINA_API_KEY?.trim();
  const providerEnv = (process.env.WEB_SEARCH_PROVIDER ?? 'auto').toLowerCase();

  if (providerEnv === 'bocha' && bochaKey) return ['bocha', 'tavily', 'serper', 'jina', 'duckduckgo'];
  if (providerEnv === 'tavily' && tavilyKey) return ['tavily', 'bocha', 'serper', 'jina', 'duckduckgo'];
  if (providerEnv === 'serper' && serperKey) return ['serper', 'bocha', 'tavily', 'jina', 'duckduckgo'];
  if (providerEnv === 'jina') return ['jina', 'bocha', 'tavily', 'serper', 'duckduckgo'];
  if (providerEnv === 'duckduckgo') return ['duckduckgo'];

  return [
    ...(bochaKey ? (['bocha'] as const) : []),
    ...(tavilyKey ? (['tavily'] as const) : []),
    ...(serperKey ? (['serper'] as const) : []),
    ...(jinaKey ? (['jina'] as const) : []),
    'duckduckgo',
  ];
}

export function getWebSearchStatus(): {
  provider: string;
  configured: boolean;
  bocha: boolean;
  tavily: boolean;
  serper: boolean;
  jina: boolean;
  llmFallback: boolean;
  hint?: string;
} {
  const bocha = Boolean(process.env.BOCHA_API_KEY?.trim());
  const tavily = Boolean(process.env.TAVILY_API_KEY?.trim());
  const serper = Boolean(process.env.SERPER_API_KEY?.trim());
  const jina = Boolean(process.env.JINA_API_KEY?.trim());
  const configured = bocha || tavily || serper || jina;
  const provider = process.env.WEB_SEARCH_PROVIDER?.trim() || 'auto';
  const llmFallback = !modelProviderService.getModelsInfo().usingMock;

  let hint: string | undefined;
  if (!configured) {
    hint =
      '未配置联网检索 Key。推荐在 .env 添加 BOCHA_API_KEY（https://open.bochaai.com）。当前将尝试 DuckDuckGo，失败时降级为模型知识检索。';
  }

  return { provider, configured, bocha, tavily, serper, jina, llmFallback, hint };
}

export async function performWebSearch(
  query: string,
  maxResults = 5,
  snapshot?: ModelRunSnapshot,
): Promise<WebSearchResult> {
  const limit = Math.min(Math.max(1, maxResults), 10);
  const bochaKey = process.env.BOCHA_API_KEY?.trim();
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  const serperKey = process.env.SERPER_API_KEY?.trim();
  const jinaKey = process.env.JINA_API_KEY?.trim();
  const tryOrder = resolveProviderOrder();
  const errors: string[] = [];

  for (const provider of tryOrder) {
    try {
      let sources: SearchSource[] = [];
      if (provider === 'bocha' && bochaKey) {
        sources = await searchBocha(query, limit, bochaKey);
      } else if (provider === 'tavily' && tavilyKey) {
        sources = await searchTavily(query, limit, tavilyKey);
      } else if (provider === 'serper' && serperKey) {
        sources = await searchSerper(query, limit, serperKey);
      } else if (provider === 'jina') {
        sources = await searchJina(query, limit, jinaKey);
      } else if (provider === 'duckduckgo') {
        sources = await searchDuckDuckGo(query, limit);
      }

      if (sources.length > 0) {
        return { sources, provider, mocked: false, query };
      }
      errors.push(`${provider}: no results`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${provider}: ${message}`);
      console.warn(`[web-search] ${provider} failed:`, message);
    }
  }

  try {
    const sources = await searchLlmContext(query, limit, snapshot);
    if (sources.length > 0) {
      console.warn('[web-search] using LLM context fallback — configure BOCHA_API_KEY for live search');
      return {
        sources,
        provider: 'llm_context',
        mocked: true,
        query,
        error: '未配置联网检索 API，已使用模型知识生成参考来源（建议配置 BOCHA_API_KEY 获取实时结果）',
      };
    }
    errors.push('llm_context: no sources');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`llm_context: ${message}`);
  }

  const error = errors.join('; ');
  console.warn('[web-search] all providers failed:', error);

  return {
    sources: [],
    provider: 'mock',
    mocked: true,
    query,
    error:
      '联网检索失败。请在 .env 配置 BOCHA_API_KEY（推荐国内，https://open.bochaai.com）或 TAVILY_API_KEY / SERPER_API_KEY 后重启服务。',
  };
}
