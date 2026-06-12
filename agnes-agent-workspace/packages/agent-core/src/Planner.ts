import type {
  AgentPlan,
  AgentStep,
  AgentTaskType,
  ConversationTurn,
  LLMProvider,
  PlanningOptions,
  ToolDefinition,
} from './types.js';

export interface PlannerOptions {
  llm?: LLMProvider;
  planning?: PlanningOptions;
}

interface StepTemplate {
  title: string;
  toolName: string;
  reason: string;
  expectedOutput: string;
}

interface LlmPlanStep {
  stepId?: string;
  title: string;
  toolName: string;
  reason: string;
  expectedOutput: string;
}

const PLAN_TEMPLATES: Record<AgentTaskType, StepTemplate[]> = {
  research: [
    {
      title: 'Semantic decomposition for research',
      toolName: 'prompt_enhancer',
      reason: 'Decompose the raw topic into research scope, search query, structure, and factual constraints',
      expectedOutput: 'Structured research brief with semantic decomposition and search intent',
    },
    {
      title: 'Search the web',
      toolName: 'web_search',
      reason: 'Gather raw information and sources for the research topic',
      expectedOutput: 'List of search results with titles and snippets',
    },
    {
      title: 'Generate research report',
      toolName: 'research_report',
      reason: 'Structure findings into a Markdown research report',
      expectedOutput: 'Markdown report artifact',
    },
    {
      title: 'Export HTML preview',
      toolName: 'html_export',
      reason: 'Produce an HTML preview of the report for viewing',
      expectedOutput: 'HTML artifact',
    },
    {
      title: 'Summarize conclusions',
      toolName: 'summary',
      reason: 'Condense key takeaways for the final result',
      expectedOutput: 'Bullet-point summary',
    },
  ],
  website: [
    {
      title: 'Optimize website prompt',
      toolName: 'prompt_enhancer',
      reason: 'Expand the raw site request into a build-ready brief before generation',
      expectedOutput: 'Optimized site brief with audience, structure, visual style, and constraints',
    },
    {
      title: 'Plan website or game',
      toolName: 'website_builder',
      reason: 'Design structure for the requested website or mini-game',
      expectedOutput: 'Build plan with components or game entities',
    },
    {
      title: 'Summarize build output',
      toolName: 'summary',
      reason: 'Summarize what was built and how to use it',
      expectedOutput: 'Short summary of the generated build',
    },
  ],
  writing: [
    {
      title: 'Optimize writing prompt',
      toolName: 'prompt_enhancer',
      reason: 'Expand the raw writing request into a structured content brief',
      expectedOutput: 'Optimized writing brief with audience, tone, structure, and constraints',
    },
    {
      title: 'Draft structured content',
      toolName: 'document_generator',
      reason: 'Turn the writing request into a structured Markdown deliverable',
      expectedOutput: 'Draft document in Markdown',
    },
    {
      title: 'Export document preview',
      toolName: 'html_export',
      reason: 'Produce a readable HTML preview for review',
      expectedOutput: 'HTML artifact',
    },
    {
      title: 'Summarize writing output',
      toolName: 'summary',
      reason: 'Summarize the draft and suggested next edits',
      expectedOutput: 'Short summary of the generated document',
    },
  ],
  analysis: [
    {
      title: 'Optimize analysis prompt',
      toolName: 'prompt_enhancer',
      reason: 'Expand the raw analysis request into a decision-ready analysis brief',
      expectedOutput: 'Optimized analysis brief with scope, criteria, assumptions, and output format',
    },
    {
      title: 'Analyze provided material',
      toolName: 'document_generator',
      reason: 'Extract findings, patterns, and recommendations from the task context',
      expectedOutput: 'Structured analysis in Markdown',
    },
    {
      title: 'Export analysis preview',
      toolName: 'html_export',
      reason: 'Produce a readable HTML preview for the analysis',
      expectedOutput: 'HTML artifact',
    },
    {
      title: 'Summarize findings',
      toolName: 'summary',
      reason: 'Condense key findings and next actions',
      expectedOutput: 'Executive summary',
    },
  ],
  presentation: [
    {
      title: 'Optimize presentation prompt',
      toolName: 'prompt_enhancer',
      reason: 'Expand the raw deck request into a slide-ready narrative brief',
      expectedOutput: 'Optimized presentation brief with audience, story arc, style, and slide constraints',
    },
    {
      title: 'Generate presentation deck',
      toolName: 'presentation_generator',
      reason: 'Shape the request into slide-by-slide content and an HTML deck preview',
      expectedOutput: 'Structured slides, Markdown outline, and HTML deck preview',
    },
    {
      title: 'Summarize deck structure',
      toolName: 'summary',
      reason: 'Summarize the narrative and slide flow',
      expectedOutput: 'Short deck summary',
    },
  ],
  media: [
    {
      title: 'Enhance media prompt',
      toolName: 'prompt_enhancer',
      reason: 'Expand the user description into a production-ready AIGC prompt before generation',
      expectedOutput: 'Enhanced prompt with subject, style, composition, and constraints',
    },
    {
      title: 'Generate media artifact',
      toolName: 'image_generator',
      reason: 'Generate an image artifact from the enhanced prompt',
      expectedOutput: 'Image artifact and generation metadata',
    },
    {
      title: 'Summarize media output',
      toolName: 'summary',
      reason: 'Explain the generated artifact and prompt choices',
      expectedOutput: 'Short generation summary',
    },
  ],
  summary: [
    {
      title: 'Summarize content',
      toolName: 'summary',
      reason: 'Produce a concise summary of the user request',
      expectedOutput: 'Key points and executive summary',
    },
  ],
};

const INTENT_KEYWORDS: Record<Exclude<AgentTaskType, 'summary'>, string[]> = {
  research: [
    '\u8c03\u7814',
    '\u7814\u7a76\u62a5\u544a',
    '\u884c\u4e1a\u5206\u6790',
    '\u5e02\u573a\u62a5\u544a',
    'research',
    'report',
  ],
  website: [
    '\u7f51\u7ad9',
    '\u5b98\u7f51',
    '\u843d\u5730\u9875',
    '\u54c1\u724c\u9875',
    '\u8868\u5355',
    '\u9996\u9875',
    '\u9875\u9762',
    '\u5efa\u7ad9',
    '\u5c0f\u6e38\u620f',
    '\u6e38\u620f',
    '\u5403\u8c46\u4eba',
    'pacman',
    'pac-man',
    'website',
    'landing page',
    'homepage',
    'builder',
    'game',
  ],
  presentation: [
    'ppt',
    '\u6f14\u793a\u7a3f',
    '\u5e7b\u706f\u7247',
    '\u8def\u6f14',
    'pitch deck',
    'presentation',
    'slide',
    'slides',
    'deck',
  ],
  media: [
    '\u751f\u56fe',
    '\u751f\u6210\u56fe',
    '\u753b\u56fe',
    '\u753b\u4e00',
    '\u56fe\u7247',
    '\u6d77\u62a5',
    '\u89c6\u89c9',
    '\u89c6\u9891',
    '\u77ed\u7247',
    'aigc',
    '\u6587\u751f\u56fe',
    '\u6587\u751f\u89c6\u9891',
    'image',
    'picture',
    'poster',
    'visual',
    'video',
    'generate an image',
    'generate a video',
  ],
  analysis: [
    '\u5206\u6790',
    '\u590d\u76d8',
    '\u6d1e\u5bdf',
    '\u5bf9\u6bd4',
    '\u8bc4\u4f30',
    '\u8bca\u65ad',
    '\u6570\u636e',
    'analysis',
    'analyze',
    'compare',
    'evaluate',
  ],
  writing: [
    '\u6587\u6848',
    '\u65b9\u6848',
    '\u90ae\u4ef6',
    'prd',
    '\u4ea7\u54c1\u9700\u6c42',
    '\u516c\u544a',
    '\u901a\u77e5',
    '\u811a\u672c',
    '\u63d0\u7eb2',
    '\u5199\u4e00',
    '\u64b0\u5199',
    'writing',
    'copy',
    'email',
    'proposal',
    'brief',
  ],
};

function containsAny(input: string, keywords: string[]): boolean {
  const normalized = input.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function isVideoRequest(input: string): boolean {
  return containsAny(input, ['\u89c6\u9891', '\u77ed\u7247', 'video', 'film', 'clip']);
}

function isImageRequest(input: string): boolean {
  return containsAny(input, [
    '\u56fe\u7247',
    '\u751f\u56fe',
    '\u753b\u56fe',
    '\u6d77\u62a5',
    'image',
    'picture',
    'poster',
  ]);
}

function wantsImageAndVideo(input: string): boolean {
  return isImageRequest(input) && isVideoRequest(input);
}

/**
 * Planner decomposes a routed task into tool-backed steps.
 * It falls back to deterministic templates when model planning is unavailable or invalid.
 */
export class Planner {
  constructor(private options: PlannerOptions = {}) {}

  async createPlan(
    userInput: string,
    availableTools: ToolDefinition[],
    taskTypeHint?: AgentTaskType,
    conversationHistory?: ConversationTurn[],
  ): Promise<AgentPlan> {
    const taskType = taskTypeHint ?? classifyTaskType(userInput);
    const toolNames = new Set(availableTools.map((t) => t.name));
    const toolDescriptions = formatToolDescriptions(availableTools);
    const availableToolNames = [...toolNames];

    if (this.options.llm) {
      try {
        const llmPlan = await this.createPlanFromLLM(
          userInput,
          taskType,
          toolNames,
          toolDescriptions,
          availableToolNames,
          conversationHistory,
        );
        if (llmPlan) return llmPlan;
      } catch {
        // Degrade to deterministic template plan.
      }
    }

    return this.createMockPlan(userInput, taskType, toolNames, conversationHistory);
  }

  private async createPlanFromLLM(
    userInput: string,
    taskType: AgentTaskType,
    toolNames: Set<string>,
    toolDescriptions: string,
    availableToolNames: string[],
    conversationHistory?: ConversationTurn[],
  ): Promise<AgentPlan | null> {
    const systemContent =
      this.options.planning?.buildSystemPrompt(taskType, toolDescriptions) ??
      defaultSystemPrompt(toolNames);

    const userContent =
      this.options.planning?.buildPlannerUserPrompt({
        userInput,
        taskType,
        availableTools: availableToolNames,
        conversationHistory,
      }) ?? defaultPlannerPrompt(userInput, taskType, availableToolNames);

    const response = await this.options.llm!.chat([
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ]);

    const steps = parsePlanSteps(response.content, toolNames);
    if (!steps || steps.length === 0) return null;

    const normalized = normalizePlanForTaskType(taskType, steps, toolNames);
    return wrapPlan(taskType, normalized);
  }

  private createMockPlan(
    userInput: string,
    taskType: AgentTaskType,
    toolNames: Set<string>,
    conversationHistory: ConversationTurn[] = [],
  ): AgentPlan {
    const mediaIntentText = [
      userInput,
      ...conversationHistory.slice(-6).map((turn) => turn.content),
    ].join('\n');
    const baseTemplates =
      taskType === 'media' && wantsImageAndVideo(mediaIntentText) && toolNames.has('video_generator')
        ? [
            PLAN_TEMPLATES.media[0],
            PLAN_TEMPLATES.media[1],
            {
              title: 'Generate video artifact',
              toolName: 'video_generator',
              reason: 'Submit a video generation task from the enhanced prompt',
              expectedOutput: 'Video generation metadata and URI when available',
            },
            PLAN_TEMPLATES.media[2],
          ]
        : taskType === 'media' && isVideoRequest(mediaIntentText) && toolNames.has('video_generator')
          ? PLAN_TEMPLATES.media.map((step) =>
              step.toolName === 'image_generator'
                ? {
                    ...step,
                    title: 'Generate video artifact',
                    toolName: 'video_generator',
                    reason: 'Submit a video generation task from the enhanced prompt',
                    expectedOutput: 'Video generation metadata and URI when available',
                  }
                : step,
            )
        : PLAN_TEMPLATES[taskType];
    const templates = baseTemplates.filter((t) => toolNames.has(t.toolName));

    const steps = templates.map((t, i) =>
      toStep(
        {
          ...t,
          reason: `${t.reason} (task: "${truncate(userInput, 80)}")`,
        },
        i,
      ),
    );

    return wrapPlan(taskType, steps);
  }
}

export function classifyTaskType(userInput: string): AgentTaskType {
  const text = userInput.toLowerCase();
  const trimmed = userInput.trim().toLowerCase();

  const isResearchIntent =
    trimmed.startsWith('\u8c03\u7814') || containsAny(userInput, INTENT_KEYWORDS.research);
  const isWebsiteIntent = containsAny(userInput, INTENT_KEYWORDS.website);
  const isPresentationIntent = containsAny(userInput, INTENT_KEYWORDS.presentation);
  const isMediaIntent = containsAny(userInput, INTENT_KEYWORDS.media);
  const isAnalysisIntent = containsAny(userInput, INTENT_KEYWORDS.analysis);
  const isWritingIntent = containsAny(userInput, INTENT_KEYWORDS.writing);

  if (isWebsiteIntent && !isResearchIntent) return 'website';
  if (isResearchIntent || /\bresearch\b|\breport\b/.test(text)) return 'research';
  if (isMediaIntent) return 'media';
  if (isPresentationIntent) return 'presentation';
  if (isAnalysisIntent) return 'analysis';
  if (isWritingIntent) return 'writing';

  return 'summary';
}

function parsePlanSteps(content: string, toolNames: Set<string>): AgentStep[] | null {
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return null;
  }

  if (!Array.isArray(raw)) return null;

  const steps: AgentStep[] = [];

  for (const item of raw) {
    if (!isValidPlanStep(item, toolNames)) continue;
    const step = item as LlmPlanStep;
    steps.push({
      id:
        typeof step.stepId === 'string' && step.stepId.trim()
          ? step.stepId.trim()
          : `step-${steps.length + 1}`,
      title: step.title.trim(),
      toolName: step.toolName.trim(),
      reason: step.reason.trim(),
      expectedOutput: step.expectedOutput.trim(),
      status: 'pending',
    });
  }

  return steps.length > 0 ? steps : null;
}

function isValidPlanStep(item: unknown, toolNames: Set<string>): item is LlmPlanStep {
  if (!item || typeof item !== 'object') return false;
  const step = item as Record<string, unknown>;
  return (
    typeof step.title === 'string' &&
    step.title.trim().length > 0 &&
    typeof step.toolName === 'string' &&
    toolNames.has(step.toolName.trim()) &&
    typeof step.reason === 'string' &&
    step.reason.trim().length > 0 &&
    typeof step.expectedOutput === 'string' &&
    step.expectedOutput.trim().length > 0 &&
    (step.stepId === undefined ||
      (typeof step.stepId === 'string' && step.stepId.trim().length > 0))
  );
}

function formatToolDescriptions(tools: ToolDefinition[]): string {
  return tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
}

function defaultSystemPrompt(toolNames: Set<string>): string {
  return `You are a task planner for Agnes Agent Workspace. Output only a JSON array of plan steps.
Available tools: ${[...toolNames].join(', ')}`;
}

function defaultPlannerPrompt(
  userInput: string,
  taskType: AgentTaskType,
  availableTools: string[],
): string {
  return `Task type: ${taskType}\nTask: ${userInput}\nTools: ${availableTools.join(', ')}`;
}

function toStep(template: StepTemplate, index: number): AgentStep {
  return {
    id: `step-${index + 1}`,
    title: template.title,
    toolName: template.toolName,
    reason: template.reason,
    expectedOutput: template.expectedOutput,
    status: 'pending',
  };
}

function wrapPlan(taskType: AgentTaskType, steps: AgentStep[]): AgentPlan {
  return {
    id: crypto.randomUUID(),
    taskType,
    steps,
    createdAt: new Date().toISOString(),
  };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

/** Ensure task-specific plans include their required delivery tools when available. */
export function normalizePlanForTaskType(
  taskType: AgentTaskType,
  steps: AgentStep[],
  toolNames: Set<string>,
): AgentStep[] {
  if (taskType === 'research') {
    return normalizeResearchPlan(steps, toolNames);
  }

  let normalizedSteps = ensurePromptEnhancement(taskType, steps, toolNames);

  if (['writing', 'analysis'].includes(taskType)) {
    const hasDocumentGenerator = normalizedSteps.some((s) => s.toolName === 'document_generator');
    if (!hasDocumentGenerator && toolNames.has('document_generator')) {
      return PLAN_TEMPLATES[taskType].filter((t) => toolNames.has(t.toolName)).map(toStep);
    }
  }

  if (taskType === 'presentation') {
    const hasPresentationGenerator = normalizedSteps.some((s) => s.toolName === 'presentation_generator');
    if (!hasPresentationGenerator && toolNames.has('presentation_generator')) {
      return PLAN_TEMPLATES.presentation.filter((t) => toolNames.has(t.toolName)).map(toStep);
    }
  }

  if (taskType === 'media') {
    const names = new Set(normalizedSteps.map((s) => s.toolName));
    if (
      (!names.has('prompt_enhancer') || (!names.has('image_generator') && !names.has('video_generator'))) &&
      toolNames.has('prompt_enhancer')
    ) {
      return PLAN_TEMPLATES.media.filter((t) => toolNames.has(t.toolName)).map(toStep);
    }
  }

  if (taskType === 'website') {
    const hasWebsiteBuilder = normalizedSteps.some((s) => s.toolName === 'website_builder');
    if (!hasWebsiteBuilder && toolNames.has('website_builder')) {
      return PLAN_TEMPLATES.website.filter((t) => toolNames.has(t.toolName)).map(toStep);
    }
  }

  return normalizedSteps;
}

function normalizeResearchPlan(steps: AgentStep[], toolNames: Set<string>): AgentStep[] {
  const required = ['prompt_enhancer', 'web_search', 'research_report', 'html_export', 'summary'];
  const hasRequired = required.every((toolName) =>
    steps.some((step) => step.toolName === toolName),
  );
  const hasForeignGenerationTool = steps.some((step) =>
    [
      'website_builder',
      'document_generator',
      'presentation_generator',
      'image_generator',
      'video_generator',
    ].includes(step.toolName),
  );

  if (!hasRequired || hasForeignGenerationTool) {
    return PLAN_TEMPLATES.research.filter((template) => toolNames.has(template.toolName)).map(toStep);
  }

  const ordered: AgentStep[] = [];
  for (const toolName of required) {
    const step = steps.find((candidate) => candidate.toolName === toolName);
    if (step) {
      ordered.push({ ...step, id: `step-${ordered.length + 1}` });
    }
  }
  return ordered;
}

function ensurePromptEnhancement(
  taskType: AgentTaskType,
  steps: AgentStep[],
  toolNames: Set<string>,
): AgentStep[] {
  if (taskType === 'summary' || !toolNames.has('prompt_enhancer')) return steps;
  if (steps.some((step) => step.toolName === 'prompt_enhancer')) return steps;

  const template = PLAN_TEMPLATES[taskType].find((step) => step.toolName === 'prompt_enhancer');
  if (!template) return steps;

  return [
    toStep(template, 0),
    ...steps.map((step, index) => ({
      ...step,
      id: `step-${index + 2}`,
    })),
  ];
}
