import type { Request, Response } from 'express';
import { createHttpError } from '../middleware/errorHandler.js';
import {
  getSiteBuilderStatus,
  launchViteProject,
} from '../services/siteBuilder/siteBuilder.service.js';
import type { WebsiteBuilderOutput } from '@agnes/tools';

export async function getSitesStatus(_req: Request, res: Response): Promise<void> {
  res.json(getSiteBuilderStatus());
}

export async function launchSite(req: Request, res: Response): Promise<void> {
  const { requirement, output } = req.body as {
    requirement?: string;
    output?: WebsiteBuilderOutput;
  };

  if (!requirement?.trim() || !output?.files?.length) {
    throw createHttpError(400, 'requirement and output.files are required');
  }

  const result = await launchViteProject(requirement.trim(), output);
  res.json({
    ...output,
    ...result,
    previewNotes: result.devUrl
      ? `${output.previewNotes}\n\n本地 Vite 站点：${result.devUrl}`
      : output.previewNotes,
  });
}
