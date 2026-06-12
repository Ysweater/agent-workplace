import { Router } from 'express';
import { getReport, listReports, saveReport } from '../controllers/report.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const reportRoutes = Router();

reportRoutes.get('/', asyncHandler(listReports));
reportRoutes.post('/', asyncHandler(saveReport));
reportRoutes.get('/:reportId', asyncHandler(getReport));
