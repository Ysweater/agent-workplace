import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WebsiteBuilderOutput, WebsiteFile } from '@agnes/tools';
import {
  indexCss,
  indexHtml,
  mainTsx,
  packageJson,
  postcssConfig,
  slugify,
  tailwindConfig,
  tsconfigJson,
  viteConfig,
  viteEnvDts,
} from './scaffold.js';
import { getActiveDevServer, runCommand, startDevServer } from './runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME_TEMPLATE_DIR = path.join(__dirname, 'templates', 'game');
const GAME_KEYWORDS = [
  '\u6e38\u620f',
  '\u5403\u8c46',
  '\u5c0f\u6e38\u620f',
  'pacman',
  'pac-man',
  'arcade',
  'game',
];

export interface SiteLaunchResult {
  projectDir: string;
  devUrl: string;
  launchStatus: 'ready' | 'failed' | 'skipped' | 'starting';
  launchMessage: string;
  scaffoldType: 'vite-game' | 'vite-landing';
}

function resolveOutputRoot(): string {
  const fromEnv = process.env.SITES_OUTPUT_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), 'storage', 'generated-sites');
}

function resolveDevPort(): number {
  const port = Number(process.env.SITE_DEV_PORT ?? 5180);
  return Number.isFinite(port) ? port : 5180;
}

export function isSiteLaunchEnabled(): boolean {
  const flag = (process.env.SITE_LAUNCH_ENABLED ?? 'true').toLowerCase();
  return flag !== 'false' && flag !== '0';
}

export function inferSiteType(requirement: string): 'game' | 'landing' {
  const normalized = requirement.toLowerCase();
  return GAME_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()))
    ? 'game'
    : 'landing';
}

async function writeFiles(projectDir: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(projectDir, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf-8');
  }
}

async function createProjectDirectory(title: string): Promise<string> {
  const root = resolveOutputRoot();
  await fs.mkdir(root, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(root, `${slugify(title)}-${stamp}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function buildBaseViteFiles(title: string, port: number): Promise<Record<string, string>> {
  return {
    'package.json': packageJson(title),
    'vite.config.ts': viteConfig(port),
    'tsconfig.json': tsconfigJson(),
    'tailwind.config.js': tailwindConfig(),
    'postcss.config.js': postcssConfig(),
    'index.html': indexHtml(title),
    'src/main.tsx': mainTsx(),
    'src/index.css': indexCss(),
    'src/vite-env.d.ts': viteEnvDts(),
  };
}

async function buildGameProjectFiles(title: string): Promise<Record<string, string>> {
  const port = resolveDevPort();
  const files = await buildBaseViteFiles(title, port);
  const templateEntries = await collectTemplateFiles(GAME_TEMPLATE_DIR);
  return { ...files, ...templateEntries };
}

async function collectTemplateFiles(root: string, prefix = ''): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      Object.assign(out, await collectTemplateFiles(full, rel));
    } else {
      out[rel] = await fs.readFile(full, 'utf-8');
    }
  }
  return out;
}

function mergeLandingSourceFiles(
  builderFiles: WebsiteFile[],
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const file of builderFiles) {
    if (file.path.startsWith('preview/')) continue;
    if (file.path === 'README.md' || file.path.startsWith('docs/')) {
      merged[file.path] = file.content;
      continue;
    }
    if (file.path.startsWith('src/')) {
      merged[file.path] = file.content;
    }
  }
  if (!merged['src/App.tsx']) {
    const app = builderFiles.find((f) => f.path === 'src/App.tsx');
    if (app) merged['src/App.tsx'] = app.content;
  }
  return merged;
}

function defaultLandingApp(title: string, requirement: string): string {
  return `export default function App() {
  return (
    <main className="min-h-screen bg-slate-950 text-white px-6 py-16">
      <h1 className="text-4xl font-bold">${title.replace(/`/g, '')}</h1>
      <p className="mt-4 max-w-2xl text-slate-400">${requirement.replace(/`/g, '')}</p>
    </main>
  )
}
`;
}

export async function launchViteProject(
  requirement: string,
  output: WebsiteBuilderOutput,
): Promise<SiteLaunchResult> {
  const siteType = inferSiteType(requirement);

  if (!isSiteLaunchEnabled()) {
    return {
      projectDir: '',
      devUrl: '',
      launchStatus: 'skipped',
      launchMessage: 'SITE_LAUNCH_ENABLED=false; HTML preview generated only.',
      scaffoldType: siteType === 'game' ? 'vite-game' : 'vite-landing',
    };
  }

  const port = resolveDevPort();
  const projectDir = await createProjectDirectory(output.title);

  try {
    let files: Record<string, string>;
    if (siteType === 'game') {
      files = await buildGameProjectFiles(output.title);
    } else {
      files = await buildBaseViteFiles(output.title, port);
      const merged = mergeLandingSourceFiles(output.files);
      if (!merged['src/App.tsx']) {
        merged['src/App.tsx'] = defaultLandingApp(output.title, requirement);
      }
      files = { ...files, ...merged };
    }

    await writeFiles(projectDir, files);

    const install = await runCommand('npm install', projectDir);
    if (install.code !== 0) {
      throw new Error(`npm install failed:\n${install.output.slice(-800)}`);
    }

    const devUrl = await startDevServer(projectDir, port);

    return {
      projectDir,
      devUrl,
      launchStatus: 'ready',
      launchMessage: `Project written to ${projectDir}; Vite is running at ${devUrl}.`,
      scaffoldType: siteType === 'game' ? 'vite-game' : 'vite-landing',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Site launch failed';
    return {
      projectDir,
      devUrl: '',
      launchStatus: 'failed',
      launchMessage: message,
      scaffoldType: siteType === 'game' ? 'vite-game' : 'vite-landing',
    };
  }
}

export function getSiteBuilderStatus() {
  const active = getActiveDevServer();
  return {
    enabled: isSiteLaunchEnabled(),
    outputRoot: resolveOutputRoot(),
    devPort: resolveDevPort(),
    activeDev: active,
  };
}
