import { Router } from 'express';
import { getSitesStatus, launchSite } from '../controllers/sites.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const sitesRoutes = Router();

sitesRoutes.get('/status', asyncHandler(getSitesStatus));
sitesRoutes.post('/launch', asyncHandler(launchSite));
