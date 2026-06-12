import type { Request, Response } from 'express';
import { createHttpError } from '../middleware/errorHandler.js';
import { storageService, type SavedReport } from '../services/storage.service.js';

export async function listReports(_req: Request, res: Response): Promise<void> {
  const reports = await storageService.listReports();
  res.json({ reports });
}

export async function saveReport(req: Request, res: Response): Promise<void> {
  const { title, markdown, html, runId, id } = req.body as {
    title?: string;
    markdown?: string;
    html?: string;
    runId?: string;
    id?: string;
  };

  if (!title?.trim()) {
    throw createHttpError(400, 'title is required');
  }

  if (!markdown?.trim() && !html?.trim()) {
    throw createHttpError(400, 'markdown or html is required');
  }

  const now = new Date().toISOString();
  const report: SavedReport = {
    id: id ?? crypto.randomUUID(),
    title: title.trim(),
    markdown: markdown?.trim(),
    html: html?.trim(),
    runId,
    createdAt: now,
    updatedAt: now,
  };

  const saved = await storageService.saveReport(report);
  res.status(201).json(saved);
}

export async function getReport(req: Request, res: Response): Promise<void> {
  const reportId = String(req.params.reportId);
  const report = await storageService.loadReport(reportId);
  if (!report) {
    throw createHttpError(404, 'Report not found');
  }
  res.json(report);
}
