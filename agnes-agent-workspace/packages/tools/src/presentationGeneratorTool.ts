import type { AgentContext, ToolDefinition } from '@agnes/agent-core';
import type { PresentationOutput, PresentationSlide } from './types.js';

function parseSlides(raw: string): PresentationSlide[] | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] ?? raw) as { slides?: PresentationSlide[] };
    if (!Array.isArray(parsed.slides)) return null;
    const slides = parsed.slides.filter(
      (slide) =>
        slide &&
        typeof slide.title === 'string' &&
        Array.isArray(slide.bullets) &&
        typeof slide.visual === 'string' &&
        typeof slide.speakerNote === 'string',
    );
    return slides.length ? slides : null;
  } catch {
    return null;
  }
}

function fallbackSlides(task: string): PresentationSlide[] {
  return [
    {
      title: '封面与汇报目标',
      bullets: ['明确本次汇报主题', '说明目标听众与决策场景', '给出 20 分钟汇报节奏'],
      visual: '全屏标题页，右侧放产品界面或主题关键词',
      speakerNote: `围绕「${task}」建立开场，先说明这不是散点介绍，而是一条决策叙事。`,
    },
    {
      title: '背景：为什么现在需要它',
      bullets: ['用户任务从单轮问答走向多步骤交付', '评审更关心过程可控、结果可复现', '工作台需要同时呈现执行、产物与模型状态'],
      visual: '问题金字塔或 Before / After 对比',
      speakerNote: '把问题讲清楚：不是做一个聊天框，而是做一个能交付任务的工作台。',
    },
    {
      title: '产品定位',
      bullets: ['面向调研、建站、写作、分析、PPT、AIGC 等任务', '以会话为中心承载上下文', '以工具链为中心完成可观测执行'],
      visual: '中心为 Agnes，外圈为任务类型的环形图',
      speakerNote: '强调 Agnes 是 Agent Workspace，不是单点工具集合。',
    },
    {
      title: '核心架构',
      bullets: ['Agent Runtime 负责编排任务生命周期', 'Planner 生成工具步骤', 'Executor 调用工具并写入 Context', 'Storage 保存会话、工具调用与产物'],
      visual: 'Runtime -> Planner -> Executor -> Tools -> Artifacts 流程图',
      speakerNote: '这里要证明架构是可扩展的，后续加工具不需要重写主流程。',
    },
    {
      title: '关键体验：同一会话持续推进',
      bullets: ['每次输入不再割裂成孤立任务', '历史会话可恢复多轮 run', '工具可读取近期上下文', '适合“基于刚才继续修改”的真实工作流'],
      visual: '左侧历史 + 中间多轮对话 + 右侧产物区三栏截图',
      speakerNote: '把会话记忆作为产品可信度的重点说明。',
    },
    {
      title: '能力矩阵',
      bullets: ['Research：检索、报告、HTML 预览', 'Website：页面/小游戏生成与本地预览', 'Presentation：结构化 slides 与演示预览', 'Media：提示词增强与图像/视频生成'],
      visual: '能力矩阵表，列为任务类型、工具链、产物',
      speakerNote: '这一页用于快速说明项目已经不是两个 Demo 拼接。',
    },
    {
      title: '演示路径',
      bullets: ['先提一个普通问题验证对话', '再生成调研报告看工具轨迹', '继续要求改成 PPT 验证上下文', '最后打开产物工作区预览 HTML deck'],
      visual: '四步 Demo 路线图',
      speakerNote: '这页帮助评审跟上演示节奏，也方便自己讲。',
    },
    {
      title: '后续规划',
      bullets: ['将 HTML deck 导出为真实 PPTX', '增强工具失败重试与人工确认', '接入真实搜索与更多模型', '补充团队级云端会话权限'],
      visual: '短期 / 中期 / 长期路线图',
      speakerNote: '承认边界，同时给出下一步路线，显得更成熟。',
    },
  ];
}

function slidesToMarkdown(title: string, slides: PresentationSlide[]): string {
  return [
    `# ${title}`,
    ...slides.map(
      (slide, index) =>
        `\n## ${index + 1}. ${slide.title}\n${slide.bullets.map((b) => `- ${b}`).join('\n')}\n\n**视觉建议**：${slide.visual}\n\n**讲者备注**：${slide.speakerNote}`,
    ),
  ].join('\n');
}

function slidesToHtml(title: string, slides: PresentationSlide[]): string {
  const slideHtml = slides
    .map(
      (slide, index) => `<section class="slide">
  <div class="slide-top"><p class="kicker">SLIDE ${String(index + 1).padStart(2, '0')}</p><span>${escapeHtml(title)}</span></div>
  <div class="slide-body">
    <h2>${escapeHtml(slide.title)}</h2>
    <ul>${slide.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
  </div>
  <div class="slide-bottom"><p><strong>视觉建议</strong> ${escapeHtml(slide.visual)}</p><p><strong>讲者备注</strong> ${escapeHtml(slide.speakerNote)}</p></div>
</section>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin:0; background:#0a0f1e; color:#f8fafc; font-family: Inter, "Microsoft YaHei", system-ui, sans-serif; }
    .deck { display:grid; gap:28px; padding:32px; }
    .slide { aspect-ratio:16/9; min-height:560px; border:1px solid rgba(148,163,184,.28); background:radial-gradient(circle at 85% 12%, rgba(56,189,248,.22), transparent 30%), linear-gradient(135deg,#101827,#1b2540 58%,#111827); padding:42px 48px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 24px 60px rgba(0,0,0,.32); }
    .slide-top,.slide-bottom { display:flex; justify-content:space-between; gap:24px; color:#94a3b8; font-size:13px; }
    .slide-bottom { display:grid; grid-template-columns:1fr 1fr; border-top:1px solid rgba(148,163,184,.22); padding-top:18px; line-height:1.55; }
    .kicker { margin:0; color:#67e8f9; font-size:13px; letter-spacing:.16em; text-transform:uppercase; }
    h2 { max-width:780px; margin:0 0 28px; font-size:48px; line-height:1.08; letter-spacing:0; }
    ul { max-width:760px; margin:0; padding-left:24px; }
    li { margin:14px 0; font-size:23px; line-height:1.42; color:#dbeafe; }
    strong { color:#c4b5fd; font-weight:600; }
    .cover h2 { font-size:56px; }
    @media print { body { background:#fff; } .deck { padding:0; gap:0; } .slide { break-after:page; box-shadow:none; border:0; } }
  </style>
</head>
<body><main class="deck"><section class="slide cover"><p class="kicker">Agnes Deck</p><h2>${escapeHtml(title)}</h2><p>Generated as a structured presentation preview</p></section>${slideHtml}</main></body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const presentationGeneratorTool: ToolDefinition = {
  name: 'presentation_generator',
  description: 'Generate a structured slide deck plan with HTML preview for PPT tasks.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'Presentation requirement' },
    },
    required: ['task'],
  },
  async execute(input, ctx: AgentContext, services) {
    const task = String(input.task ?? ctx.task.userInput ?? '').trim();
    const conversationContext = String(input.conversationContext ?? '').trim();
    if (!task) {
      return { success: false, output: null, error: 'presentation_generator requires a task' };
    }

    let slides: PresentationSlide[] | null = null;
    if (services?.generateText) {
      try {
        const content = await services.generateText(
          [
            {
              role: 'system',
              content:
                '你是资深演示稿产品经理。只输出 JSON：{"slides":[{"title":"...","bullets":["..."],"visual":"...","speakerNote":"..."}]}。需要 6-8 页，结构完整，适合正式 Demo 汇报。',
            },
            {
              role: 'user',
              content: `${conversationContext ? `近期会话上下文：\n${conversationContext}\n\n` : ''}用户需求：${task}

请生成 8 页左右的高质量演示稿内容。要求：
1. 有清晰叙事线，不要只有泛泛目录。
2. 每页 3-5 条要点，每条要能直接放上 PPT。
3. visual 必须给出具体版式或图表建议。
4. speakerNote 必须说明这一页该怎么讲。
5. 如果用户提到“基于刚才”，必须结合会话上下文。`,
            },
          ],
          { temperature: 0.25, maxTokens: 2500 },
        );
        slides = parseSlides(content);
      } catch {
        slides = null;
      }
    }

    const finalSlides = slides ?? fallbackSlides(task);
    const title = `演示稿：${task.slice(0, 36)}`;
    const output: PresentationOutput = {
      title,
      slides: finalSlides,
      markdown: slidesToMarkdown(title, finalSlides),
      html: slidesToHtml(title, finalSlides),
    };
    return { success: true, output };
  },
};
