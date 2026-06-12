import { Router } from 'express';
import {
  deleteSession,
  getRunStatus,
  getSession,
  listSessions,
  resumeAgentRun,
  runAgent,
  runAgentAsync,
} from '../controllers/agent.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const agentRoutes = Router();

agentRoutes.post('/run', asyncHandler(runAgent));
agentRoutes.post('/run-async', asyncHandler(runAgentAsync));
agentRoutes.get('/runs/:runId', asyncHandler(getRunStatus));
agentRoutes.post('/runs/:runId/resume', asyncHandler(resumeAgentRun));
agentRoutes.get('/sessions', asyncHandler(listSessions));
agentRoutes.delete('/sessions/:sessionId', asyncHandler(deleteSession));
agentRoutes.get('/sessions/:sessionId', asyncHandler(getSession));
