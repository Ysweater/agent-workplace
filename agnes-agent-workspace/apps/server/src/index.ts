import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentRoutes } from './routes/agent.routes.js';
import { exportRoutes } from './routes/export.routes.js';
import { sitesRoutes } from './routes/sites.routes.js';
import { mediaRoutes } from './routes/media.routes.js';
import { modelRoutes } from './routes/model.routes.js';
import { reportRoutes } from './routes/report.routes.js';
import { searchRoutes } from './routes/search.routes.js';
import { bootstrapDefaultModelFromCatalog, getPublicModelsInfo } from './services/modelProvider.service.js';
import { getWebSearchStatus } from './services/webSearch.service.js';
import { getStorageService, initializeStorage } from './services/storage.service.js';
import { getCheckpointStatus } from './services/checkpoint.service.js';
import { errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  const models = getPublicModelsInfo();
  const storage = getStorageService().getStatus();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    provider: models.provider,
    configured: models.configured,
    webSearch: getWebSearchStatus(),
    storage,
    checkpoint: getCheckpointStatus(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/agent', agentRoutes);
app.use('/api/models', modelRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/sites', sitesRoutes);
app.use('/api/search', searchRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', status: 404 });
});

app.use(errorHandler);

async function startServer(): Promise<void> {
  await initializeStorage();
  bootstrapDefaultModelFromCatalog();
  const server = app.listen(PORT, () => {
    const storage = getStorageService().getStatus();
    console.log(`[agnes-server] listening on http://localhost:${PORT}`);
    console.log(`[agnes-server] storage: ${storage.driver}${storage.fallback ? ' (fallback)' : ''}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[agnes-server] Port ${PORT} is already in use. Stop the old process first:\n` +
          `  PowerShell: Get-NetTCPConnection -LocalPort ${PORT} | Select OwningProcess\n` +
          `  Then: taskkill /F /PID <pid>\n` +
          `  Or run: npm run dev:kill`,
      );
      process.exit(1);
    }
    throw err;
  });
}

void startServer();
