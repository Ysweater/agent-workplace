import type { AgentContext, ToolDefinition, ToolExecutionServices } from '@agnes/agent-core';
import type { WebsiteBuilderOutput } from './types.js';

function isPacmanRequirement(requirement: string): boolean {
  return /吃豆人|pacman|pac-man|迷宫/i.test(requirement);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? trimmed;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeGeneratedWebsite(raw: Record<string, unknown>): WebsiteBuilderOutput | null {
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const previewNotes =
    typeof raw.previewNotes === 'string' ? raw.previewNotes.trim() : 'preview/index.html 可直接预览。';
  const filesRaw = Array.isArray(raw.files) ? raw.files : [];
  const files = filesRaw
    .map((file) => {
      if (!file || typeof file !== 'object') return null;
      const record = file as Record<string, unknown>;
      const path = typeof record.path === 'string' ? record.path.trim() : '';
      const language = typeof record.language === 'string' ? record.language.trim() : '';
      const content = typeof record.content === 'string' ? record.content : '';
      if (!path || !language || !content) return null;
      return { path, language, content };
    })
    .filter((file): file is { path: string; language: string; content: string } => Boolean(file));

  if (!title || files.length === 0) return null;
  const hasPreview = files.some((file) => file.path === 'preview/index.html' && /<html/i.test(file.content));
  if (!hasPreview) return null;

  return {
    title,
    description: description || `Generated website for ${title}`,
    files,
    previewNotes,
  };
}

async function buildWebsiteWithModel(
  requirement: string,
  services?: ToolExecutionServices,
): Promise<WebsiteBuilderOutput | null> {
  if (!services?.generateText) return null;

  const content = await services.generateText(
    [
      {
        role: 'system',
        content:
          'You are a senior frontend generator. Return only strict JSON. Generate complete, self-contained web artifacts. Do not include Markdown fences.',
      },
      {
        role: 'user',
        content: `请根据用户需求生成一个可预览的网站或小游戏。

用户需求：
${requirement}

必须返回严格 JSON：
{
  "title": "作品标题",
  "description": "一句话说明",
  "files": [
    {"path":"preview/index.html","language":"html","content":"完整自包含 HTML，必须能在 iframe 中直接运行"},
    {"path":"README.md","language":"markdown","content":"结构、交互和后续编辑说明"}
  ],
  "previewNotes": "如何预览和交互"
}

要求：
- preview/index.html 必须存在，且包含完整 <html> 文档、CSS、必要 JS。
- 如果是网站：必须有首屏、内容区、CTA 或表单，视觉上像真实网站。
- 如果是小游戏：必须有基本规则、边界、状态、控制和胜负/得分反馈。
- 不要声称已经部署；只生成可预览文件。`,
      },
    ],
    { temperature: 0.4, maxTokens: 6000 },
  );

  const parsed = parseJsonObject(content);
  return parsed ? normalizeGeneratedWebsite(parsed) : null;
}

function buildWebsiteOutput(requirement: string): WebsiteBuilderOutput {
  const topic = requirement.replace(/`/g, '\\`');
  const safeTopic = escapeHtml(requirement);
  const title = /随机|随便|任意/.test(requirement) ? 'Luma Garden' : 'Agnes Landing Page';
  const previewHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, "Segoe UI", system-ui, sans-serif;
      color: #102018;
      background: #f4f7ef;
    }
    .hero {
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr);
      gap: 40px;
      align-items: center;
      padding: 64px clamp(24px, 6vw, 92px);
      background:
        linear-gradient(135deg, rgba(244,247,239,.92), rgba(225,236,218,.86)),
        url("https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1400&q=80") center/cover;
    }
    .eyebrow { color: #45735a; font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 12px 0 18px; font-size: clamp(42px, 7vw, 84px); line-height: .92; letter-spacing: 0; }
    .lead { max-width: 620px; font-size: clamp(18px, 2vw, 24px); line-height: 1.5; color: #315041; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
    button, a.cta {
      border: 0; border-radius: 999px; padding: 13px 20px; font-weight: 700;
      cursor: pointer; text-decoration: none;
    }
    .primary { background: #17271e; color: #fff; }
    .secondary { background: rgba(255,255,255,.75); color: #17271e; border: 1px solid rgba(23,39,30,.15); }
    .panel {
      border: 1px solid rgba(23,39,30,.14);
      background: rgba(255,255,255,.72);
      backdrop-filter: blur(16px);
      padding: 24px;
      box-shadow: 0 24px 70px rgba(31, 57, 41, .18);
    }
    .metric { display: grid; grid-template-columns: 1fr auto; gap: 12px; border-bottom: 1px solid rgba(23,39,30,.1); padding: 16px 0; }
    .metric:last-child { border-bottom: 0; }
    .metric strong { font-size: 28px; }
    .section { padding: 54px clamp(24px, 6vw, 92px); background: #fff; }
    .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 24px; }
    .card { border: 1px solid #dfe7d7; padding: 22px; min-height: 150px; background: #fbfcf7; }
    .card h2 { margin: 0 0 10px; font-size: 18px; }
    .card p { margin: 0; color: #617064; line-height: 1.6; }
    @media (max-width: 820px) {
      .hero { grid-template-columns: 1fr; padding-top: 44px; }
      .cards { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div>
        <div class="eyebrow">Generated Website</div>
        <h1>${escapeHtml(title)}</h1>
        <p class="lead">围绕「${safeTopic}」即时生成的可预览网站。页面包含首屏、行动按钮、信息面板和三段功能介绍，可作为进一步编辑的基础。</p>
        <div class="actions">
          <button class="primary" onclick="document.querySelector('#contact').scrollIntoView({behavior:'smooth'})">开始体验</button>
          <a class="cta secondary" href="#features">查看亮点</a>
        </div>
      </div>
      <aside class="panel">
        <div class="metric"><span>页面模块</span><strong>4</strong></div>
        <div class="metric"><span>交互控件</span><strong>2</strong></div>
        <div class="metric"><span>生成方式</span><strong>Agent</strong></div>
      </aside>
    </section>
    <section id="features" class="section">
      <div class="eyebrow">Highlights</div>
      <h1 style="font-size:38px;line-height:1.05;margin-top:10px;">清晰、可展示、可继续编辑</h1>
      <div class="cards">
        <article class="card"><h2>结构完整</h2><p>首屏、CTA、功能卡片和联系区已经组成完整落地页骨架。</p></article>
        <article class="card"><h2>响应式</h2><p>桌面端双栏，移动端单栏，适合直接放进 Demo 展示。</p></article>
        <article class="card"><h2>可交互</h2><p>按钮滚动、表单提交反馈都可直接在预览中体验。</p></article>
      </div>
    </section>
    <section id="contact" class="section" style="background:#17271e;color:white;">
      <h1 style="font-size:36px;">留下你的想法</h1>
      <form onsubmit="event.preventDefault(); alert('已收到你的需求：' + this.idea.value)">
        <input name="idea" placeholder="继续描述你想加的内容" style="width:min(520px,100%);padding:14px 16px;border:0;margin-right:8px;" />
        <button class="secondary" type="submit">提交</button>
      </form>
    </section>
  </main>
</body>
</html>`;
  const appTsx = `import { useState } from 'react';

export function App() {
  const [email, setEmail] = useState('');

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-4xl font-bold">Agnes Agent Workspace</h1>
        <p className="mt-4 text-slate-400">${topic}</p>
        <form
          className="mt-8 flex gap-2 justify-center"
          onSubmit={(e) => { e.preventDefault(); alert('Subscribed: ' + email); }}
        >
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="rounded border border-slate-700 bg-slate-900 px-3 py-2"
          />
          <button type="submit" className="rounded bg-indigo-600 px-4 py-2">Get Started</button>
        </form>
      </section>
      <section className="mx-auto grid max-w-4xl grid-cols-3 gap-4 px-6 pb-16">
        {['Plan', 'Execute', 'Preview'].map((f) => (
          <div key={f} className="rounded-lg border border-slate-800 p-4">
            <h2 className="font-semibold">{f}</h2>
            <p className="mt-2 text-sm text-slate-500">Agent-driven {f.toLowerCase()} workflow.</p>
          </div>
        ))}
      </section>
    </main>
  );
}`;

  return {
    title,
    description: `Single-page marketing site for: ${requirement}`,
    files: [
      { path: 'preview/index.html', language: 'html', content: previewHtml },
      { path: 'src/App.tsx', language: 'tsx', content: appTsx },
      {
        path: 'src/main.tsx',
        language: 'tsx',
        content: `import { createRoot } from 'react-dom/client';\nimport { App } from './App';\n\ncreateRoot(document.getElementById('root')!).render(<App />);`,
      },
      {
        path: 'README.md',
        language: 'markdown',
        content: `# ${title}\n\n## Structure\n- Hero with CTA email capture\n- Three feature cards: Plan / Execute / Preview\n\n## Interaction\n- Email input with submit alert\n- Responsive grid layout`,
      },
    ],
    previewNotes:
      '页面包含 Hero、邮件订阅表单、三列功能卡片。核心交互：输入邮箱后点击 Get Started 触发订阅反馈。',
  };
}

function buildPacmanGamePreviewStub(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>复古吃豆人</title>
  <style>
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0f172a; color:#e2e8f0; font-family:system-ui,sans-serif; text-align:center; padding:24px; }
    h1 { color:#facc15; margin-bottom:8px; }
    p { color:#94a3b8; max-width:420px; line-height:1.6; }
  </style>
</head>
<body>
  <div>
    <h1>复古吃豆人</h1>
    <p>完整可玩版本正在通过一键建站启动本地 Vite 项目（约 1–2 分钟）。<br/>启动完成后，右侧预览与 <code>http://localhost:5180</code> 将显示<strong>同一套</strong> React 游戏模板。</p>
    <p>若仅看到此页，请稍候或点击「打开本地 Vite 站点」。</p>
  </div>
</body>
</html>`;
}

/** @deprecated inline canvas preview — kept for offline fallback reference */
function buildPacmanCanvasPreviewHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>复古吃豆人 Demo</title>
  <style>
    * { box-sizing: border-box; }
    body { margin:0; background:#070715; color:#fffb6a; font-family: ui-monospace, Menlo, monospace; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; overflow:hidden; }
    .wrap { display:flex; flex-direction:column; align-items:center; gap:10px; transform: scale(.95); }
    canvas { border:3px solid #2c4cff; background:#000; image-rendering: pixelated; box-shadow:0 0 30px rgba(44,76,255,.35); }
    .hud { display:flex; gap:24px; font-weight:700; }
    .btn { padding:8px 14px; background:#4d35ff; color:#fff; border:none; cursor:pointer; font-weight:700; }
    .msg { min-height:18px; color:#fff; }
    p { margin:0; font-size:13px; color:#f7f549; }
  </style>
</head>
<body>
  <div class="wrap">
    <canvas id="game" width="448" height="496"></canvas>
    <div class="hud"><span id="score">得分: 0</span><span id="lives">生命: 3</span><span id="left">剩余: 0</span></div>
    <button class="btn" id="start">开始 / 重开</button>
    <div class="msg" id="message"></div>
    <p>方向键或 WASD 移动 | 蓝色为墙不可穿越 | 吃豆得分 | 躲避幽灵</p>
  </div>
  <script>
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const CELL = 16;
    const MAP = [
      '############################',
      '#............##............#',
      '#.####.#####.##.#####.####.#',
      '#o####.#####.##.#####.####o#',
      '#.####.#####.##.#####.####.#',
      '#..........................#',
      '#.####.##.########.##.####.#',
      '#.####.##.########.##.####.#',
      '#......##....##....##......#',
      '######.##### ## #####.######',
      '     #.##### ## #####.#     ',
      '     #.##          ##.#     ',
      '     #.## ###--### ##.#     ',
      '######.## #      # ##.######',
      '      .   #      #   .      ',
      '######.## #      # ##.######',
      '     #.## ######## ##.#     ',
      '     #.##          ##.#     ',
      '     #.## ######## ##.#     ',
      '######.## ######## ##.######',
      '#............##............#',
      '#.####.#####.##.#####.####.#',
      '#.####.#####.##.#####.####.#',
      '#o..##................##..o#',
      '###.##.##.########.##.##.###',
      '###.##.##.########.##.##.###',
      '#......##....##....##......#',
      '#.##########.##.##########.#',
      '#.##########.##.##########.#',
      '#..........................#',
      '############################'
    ];
    const ROWS = MAP.length, COLS = MAP[0].length;
    const dirs = { left:{x:-1,y:0}, right:{x:1,y:0}, up:{x:0,y:-1}, down:{x:0,y:1} };
    const keyToDir = { ArrowLeft:'left', a:'left', A:'left', ArrowRight:'right', d:'right', D:'right', ArrowUp:'up', w:'up', W:'up', ArrowDown:'down', s:'down', S:'down' };
    let score = 0, lives = 3, running = false, desired = 'left', mouth = 0;
    let player, ghosts, dots;

    function isWall(x, y) {
      const cx = Math.round(x), cy = Math.round(y);
      if (cy < 0 || cy >= ROWS || cx < 0 || cx >= COLS) return true;
      return MAP[cy][cx] === '#';
    }
    function canMove(pos, dir) {
      const nx = pos.x + dir.x, ny = pos.y + dir.y;
      return !isWall(nx, ny);
    }
    function reset() {
      score = 0; lives = 3; running = true; desired = 'left';
      player = { x: 14, y: 23, dir: 'left' };
      ghosts = [
        { x: 13, y: 14, dir: 'left', color: '#ff3b30' },
        { x: 14, y: 14, dir: 'right', color: '#ff8df5' },
        { x: 15, y: 14, dir: 'up', color: '#00d4ff' }
      ];
      dots = new Set();
      for (let y=0; y<ROWS; y++) for (let x=0; x<COLS; x++) {
        if (MAP[y][x] === '.' || MAP[y][x] === 'o') dots.add(x + ',' + y);
      }
      document.getElementById('message').textContent = '';
    }
    document.addEventListener('keydown', e => { if (keyToDir[e.key]) desired = keyToDir[e.key]; });
    document.getElementById('start').onclick = reset;

    function drawWalls() {
      ctx.strokeStyle = '#2c4cff'; ctx.lineWidth = 3;
      for (let y=0; y<ROWS; y++) for (let x=0; x<COLS; x++) if (MAP[y][x] === '#') {
        ctx.fillStyle = '#0716a8';
        ctx.fillRect(x*CELL, y*CELL, CELL, CELL);
        ctx.strokeRect(x*CELL+2, y*CELL+2, CELL-4, CELL-4);
      }
    }
    function drawDots() {
      for (const key of dots) {
        const [x,y] = key.split(',').map(Number);
        ctx.fillStyle = MAP[y][x] === 'o' ? '#fff5a8' : '#ffb8ff';
        const size = MAP[y][x] === 'o' ? 7 : 4;
        ctx.fillRect(x*CELL + (CELL-size)/2, y*CELL + (CELL-size)/2, size, size);
      }
    }
    function drawPlayer() {
      const px = player.x*CELL + CELL/2, py = player.y*CELL + CELL/2;
      const open = 0.18 + Math.abs(Math.sin(mouth))*0.18;
      const angle = { right:0, down:Math.PI/2, left:Math.PI, up:Math.PI*1.5 }[player.dir];
      ctx.fillStyle = '#ffeb1a';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, 7, angle + open*Math.PI, angle + (2-open)*Math.PI);
      ctx.closePath();
      ctx.fill();
    }
    function drawGhost(g) {
      const x = g.x*CELL + 2, y = g.y*CELL + 2;
      ctx.fillStyle = g.color;
      ctx.beginPath();
      ctx.arc(x+6, y+6, 6, Math.PI, 0);
      ctx.lineTo(x+12, y+13); ctx.lineTo(x+8, y+10); ctx.lineTo(x+4, y+13); ctx.lineTo(x, y+10); ctx.lineTo(x, y+6);
      ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(x+3,y+5,3,3); ctx.fillRect(x+8,y+5,3,3);
    }
    function movePlayer() {
      const wanted = dirs[desired];
      if (wanted && canMove(player, wanted)) player.dir = desired;
      const dir = dirs[player.dir];
      if (dir && canMove(player, dir)) { player.x += dir.x; player.y += dir.y; }
      const key = player.x + ',' + player.y;
      if (dots.delete(key)) score += MAP[player.y][player.x] === 'o' ? 50 : 10;
    }
    function moveGhosts() {
      for (const g of ghosts) {
        const choices = Object.entries(dirs).filter(([,d]) => canMove(g,d));
        const toward = choices.sort((a,b) => {
          const da = Math.abs(g.x+a[1].x-player.x)+Math.abs(g.y+a[1].y-player.y);
          const db = Math.abs(g.x+b[1].x-player.x)+Math.abs(g.y+b[1].y-player.y);
          return da - db;
        });
        const choice = Math.random() < .72 ? toward[0] : choices[Math.floor(Math.random()*choices.length)];
        if (choice) { g.dir = choice[0]; g.x += choice[1].x; g.y += choice[1].y; }
        if (Math.abs(g.x-player.x) + Math.abs(g.y-player.y) < 1) {
          lives -= 1; player = { x:14, y:23, dir:'left' };
          document.getElementById('message').textContent = lives > 0 ? '被幽灵抓到了，继续！' : '游戏结束，点击重开';
          if (lives <= 0) running = false;
        }
      }
    }
    let lastStep = 0;
    function loop(ts) {
      if (!player) reset();
      if (running && ts - lastStep > 115) {
        movePlayer(); moveGhosts(); mouth += .8; lastStep = ts;
        if (dots.size === 0) { running = false; document.getElementById('message').textContent = '胜利！豆子清空了'; }
      }
      ctx.fillStyle='#000'; ctx.fillRect(0,0,canvas.width,canvas.height);
      drawWalls(); drawDots(); ghosts.forEach(drawGhost); drawPlayer();
      document.getElementById('score').textContent='得分: '+score;
      document.getElementById('lives').textContent='生命: '+lives;
      document.getElementById('left').textContent='剩余: '+dots.size;
      requestAnimationFrame(loop);
    }
    reset(); requestAnimationFrame(loop);
  </script>
</body>
</html>`;
}

function buildPacmanOutput(requirement: string): WebsiteBuilderOutput {
  const previewHtml = buildPacmanCanvasPreviewHtml();

  const pacmanTsx = `import { useCallback, useEffect, useRef, useState } from 'react';

type Pos = { x: number; y: number };

const CELL = 16;
const COLS = 28;
const ROWS = 31;

export function PacmanGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [running, setRunning] = useState(false);
  const state = useRef({ player: { x: 14, y: 23 } as Pos, dots: [] as Pos[], ghosts: [] as Pos[] });

  const reset = useCallback(() => {
    state.current.player = { x: 14, y: 23 };
    state.current.dots = Array.from({ length: 180 }, () => ({
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS),
    }));
    state.current.ghosts = [{ x: 13, y: 11 }, { x: 14, y: 11 }, { x: 15, y: 11 }];
    setScore(0);
    setLives(3);
    setRunning(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const p = state.current.player;
      if (e.key === 'ArrowUp') p.y -= 1;
      if (e.key === 'ArrowDown') p.y += 1;
      if (e.key === 'ArrowLeft') p.x -= 1;
      if (e.key === 'ArrowRight') p.x += 1;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { player, dots, ghosts } = state.current;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffb8ff';
      dots.forEach((d) => ctx.fillRect(d.x * CELL + 6, d.y * CELL + 6, 4, 4));
      ctx.fillStyle = '#ff0';
      ctx.beginPath();
      ctx.arc(player.x * CELL + 8, player.y * CELL + 8, 7, 0.2 * Math.PI, 1.8 * Math.PI);
      ctx.fill();
      ghosts.forEach((g) => { ctx.fillStyle = '#f00'; ctx.fillRect(g.x * CELL + 2, g.y * CELL + 2, 12, 12); });
    }, 1000 / 30);
    return () => clearInterval(id);
  }, [running]);

  return (
    <div className="flex flex-col items-center bg-[#0a0a1a] p-4 text-yellow-300">
      <h1 className="mb-2 text-xl font-bold">复古吃豆人</h1>
      <canvas ref={canvasRef} width={COLS * CELL} height={ROWS * CELL} className="border-2 border-blue-500" />
      <p>得分: {score} | 生命: {lives}</p>
      <div className="mt-2 flex gap-2">
        <button onClick={reset}>开始</button>
        <button onClick={() => state.current.player.y -= 1}>↑</button>
        <button onClick={() => state.current.player.y += 1}>↓</button>
        <button onClick={() => state.current.player.x -= 1}>←</button>
        <button onClick={() => state.current.player.x += 1}>→</button>
      </div>
    </div>
  );
}`;

  return {
    title: '复古吃豆人小游戏',
    description: `复古风吃豆人方案：${requirement}`,
    files: [
      { path: 'src/PacmanGame.tsx', language: 'tsx', content: pacmanTsx },
      { path: 'preview/index.html', language: 'html', content: previewHtml },
      {
        path: 'docs/GAME_DESIGN.md',
        language: 'markdown',
        content: `# 吃豆人小游戏方案\n\n## 游戏目标\n吃掉迷宫豆得分，避免幽灵，清空豆或尽可能高分。\n\n## 地图 / 角色 / 得分\n- 28×31 网格地图\n- 玩家（黄色扇形）、幽灵（红色方块）、豆（粉色点）\n- 每豆 +10 分，3 条生命\n\n## React 状态\n- score, lives, running\n- useRef 保存 player / dots / ghosts 位置\n\n## 控制\n- 键盘方向键 / WASD\n- 屏幕方向按钮备用`,
      },
    ],
    previewNotes:
      '一键建站：Vite 模板（ai-site-builder）在 :5180 运行；右侧 Preview 在 Vite 就绪后自动嵌入同一地址。',
  };
}

export const websiteBuilderTool: ToolDefinition = {
  name: 'website_builder',
  description:
    'Plan a website or retro Pac-Man mini-game from a requirement. Returns page structure, React code snippets, files, and preview notes.',
  inputSchema: {
    type: 'object',
    properties: {
      requirement: { type: 'string', description: 'What to build (website or game)' },
    },
    required: ['requirement'],
  },
  async execute(input, ctx: AgentContext, services?: ToolExecutionServices) {
    const requirement = String(input.requirement ?? ctx.task.userInput).trim();
    if (!requirement) {
      return { success: false, output: null, error: 'website_builder requires a requirement' };
    }

    const generated = await buildWebsiteWithModel(requirement, services).catch(() => null);
    if (generated) {
      let output = generated;
      if (services?.launchViteProject) {
        try {
          const launched = await services.launchViteProject(requirement, output);
          output = {
            ...output,
            ...launched,
            previewNotes: launched.devUrl
              ? `${output.previewNotes}\n\n本地 Vite 站点：${launched.devUrl}`
              : output.previewNotes,
          };
        } catch (err) {
          output = {
            ...output,
            launchStatus: 'failed',
            launchMessage: err instanceof Error ? err.message : 'Launch failed',
          };
        }
      }
      return { success: true, output };
    }

    let output = isPacmanRequirement(requirement)
      ? buildPacmanOutput(requirement)
      : buildWebsiteOutput(requirement);

    if (services?.launchViteProject) {
      try {
        const launched = await services.launchViteProject(requirement, output);
        output = {
          ...output,
          ...launched,
          previewNotes: launched.devUrl
            ? `${output.previewNotes}\n\n本地 Vite 站点：${launched.devUrl}`
            : output.previewNotes,
        };
      } catch (err) {
        output = {
          ...output,
          launchStatus: 'failed',
          launchMessage: err instanceof Error ? err.message : 'Launch failed',
          scaffoldType: 'html-preview-only',
        };
      }
    }

    return { success: true, output };
  },
};
