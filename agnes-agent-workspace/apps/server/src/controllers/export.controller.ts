import type { AgentContext } from '@agnes/agent-core';
import { htmlExportTool } from '@agnes/tools';
import type { Request, Response } from 'express';
import { createHttpError } from '../middleware/errorHandler.js';

function emptyContext(): AgentContext {
  return {
    task: {
      id: 'export',
      userInput: '',
      taskType: 'summary',
      createdAt: new Date().toISOString(),
    },
    plan: null,
    loopEvents: [],
    toolCalls: [],
    stepOutputs: {},
    stepTransitions: [],
    artifacts: [],
  };
}

export async function exportHtml(req: Request, res: Response): Promise<void> {
  const { title, markdown } = req.body as {
    title?: string;
    markdown?: string;
  };

  if (!title?.trim()) {
    throw createHttpError(400, 'title is required');
  }
  if (!markdown?.trim()) {
    throw createHttpError(400, 'markdown is required');
  }

  const result = await htmlExportTool.execute(
    { title: title.trim(), markdown: markdown.trim() },
    emptyContext(),
  );

  if (!result.success) {
    throw createHttpError(500, result.error ?? 'HTML export failed');
  }

  const output = result.output as { html?: string };
  if (!output?.html) {
    throw createHttpError(500, 'HTML export produced no output');
  }

  res.json({ html: output.html });
}
