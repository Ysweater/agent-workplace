import type { AgentContext, ToolDefinition, ToolExecutionServices } from '@agnes/agent-core';
import type { WebSearchOutput } from './types.js';

function fallbackSources(query: string): WebSearchOutput {
  return {
    sources: [
      {
        id: 'S1',
        title: `Fallback research context for: ${query}`,
        url: 'https://agnes.local/fallback/search-context',
        snippet:
          'Live search was unavailable in this environment. This fallback source preserves the research workflow for demo and should be replaced by live search results in production.',
      },
      {
        id: 'S2',
        title: 'Agent workflow design reference',
        url: 'https://agnes.local/fallback/agent-workflow',
        snippet:
          'The report should discuss routing, planning, tool execution, context memory, traceability, and recoverable execution as core Agent product capabilities.',
      },
      {
        id: 'S3',
        title: 'Delivery and validation reference',
        url: 'https://agnes.local/fallback/delivery-validation',
        snippet:
          'A usable Agent prototype should include runnable demos, artifacts, prompt design, architecture notes, and explicit risk boundaries.',
      },
    ],
    provider: 'mock',
    mocked: true,
    error: 'Live search unavailable; using explicit fallback research context.',
  };
}

async function searchWithService(
  query: string,
  maxResults: number,
  services?: ToolExecutionServices,
): Promise<WebSearchOutput> {
  if (!services?.webSearch) {
    return fallbackSources(query);
  }

  const result = await services.webSearch(query, maxResults);
  const output = {
    sources: result.sources ?? [],
    provider: result.provider,
    mocked: result.mocked ?? false,
    error: (result as { error?: string }).error,
  };

  return output.sources.length > 0 ? output : fallbackSources(query);
}

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description:
    'Search the web for sources related to a query. Returns numbered sources (S1, S2, ...) for citation in research reports.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      maxResults: { type: 'number', description: 'Maximum number of sources (default 5)' },
    },
    required: ['query'],
  },
  async execute(input, _ctx: AgentContext, services?: ToolExecutionServices) {
    const query = String(input.query ?? '').trim();
    if (!query) {
      return { success: false, output: null, error: 'web_search requires a non-empty query' };
    }

    const maxResults = Math.min(Math.max(1, Number(input.maxResults ?? 5)), 10);

    try {
      const output = await searchWithService(query, maxResults, services);
      return {
        success: true,
        output: {
          ...output,
          warning: output.mocked ? output.error : undefined,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'web_search failed';
      const output = fallbackSources(query);
      return {
        success: true,
        output: {
          ...output,
          error: message,
          warning: `Live search failed and fallback context was used: ${message}`,
        },
      };
    }
  },
};
