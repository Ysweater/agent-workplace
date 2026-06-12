import { Router } from 'express';
import { exportHtml } from '../controllers/export.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const exportRoutes = Router();

exportRoutes.post('/html', asyncHandler(exportHtml));
