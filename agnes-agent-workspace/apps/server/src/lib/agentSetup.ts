import type { AgentTaskType } from '@agnes/agent-core';
import { AgentRuntime, ToolRegistry } from '@agnes/agent-core';
import { buildPlannerPrompt, buildSystemPrompt } from '@agnes/prompts';
import { allTools } from '@agnes/tools';
import {
  captureModelSnapshot,
  createRunModelBindings,
  type ModelRunSnapshot,
  type RunModelBindings,
} from '../services/modelProvider.service.js';
import { launchViteProject } from '../services/siteBuilder/siteBuilder.service.js';
import { performWebSearch } from '../services/webSearch.service.js';
import { generateZenmuxImage, generateZenmuxVideo } from '../services/zenmuxMedia.service.js';

export const toolRegistry = new ToolRegistry();

for (const tool of allTools) {
  toolRegistry.register(tool);
}

function toPromptTaskType(
  taskType: AgentTaskType,
): 'research' | 'website' | 'writing' | 'analysis' | 'presentation' | 'media' | 'summary' {
  return taskType;
}

export function createAgentRuntime(modelSnapshot?: ModelRunSnapshot): AgentRuntime {
  const tools = toolRegistry.listTools();
  const availableToolNames = tools.map((t) => t.name);
  const toolDescriptions = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  const snapshot = modelSnapshot ?? captureModelSnapshot();
  const runModel: RunModelBindings = createRunModelBindings(snapshot);
  const modelsInfo = runModel.getModelsInfo();

  const planning = {
    buildSystemPrompt: (taskType: AgentTaskType) =>
      buildSystemPrompt({
        agentType: toPromptTaskType(taskType),
        toolDescriptions,
      }),
    buildPlannerUserPrompt: ({
      userInput,
      taskType,
      conversationHistory,
    }: {
      userInput: string;
      taskType: AgentTaskType;
      availableTools: string[];
      conversationHistory?: import('@agnes/agent-core').ConversationTurn[];
    }) =>
      buildPlannerPrompt({
        userInput,
        taskType: toPromptTaskType(taskType),
        availableTools: availableToolNames,
        conversationHistory,
      }),
  };

  return new AgentRuntime({
    registry: toolRegistry,
    llm: modelsInfo.usingMock ? undefined : runModel.createPlannerLLM(),
    planning,
    services: {
      ...(modelsInfo.usingMock
        ? {}
        : {
            generateText: async (messages, options) => {
              const result = await runModel.generateText(messages, options);
              return result.content;
            },
          }),
      webSearch: async (query, maxResults) => {
        const result = await performWebSearch(query, maxResults, snapshot);
        return {
          sources: result.sources,
          provider: result.provider,
          mocked: result.mocked,
          error: result.error,
        };
      },
      generateImage: async (prompt, options) => generateZenmuxImage(prompt, options?.model),
      generateVideo: async (prompt, options) => generateZenmuxVideo(prompt, options?.model),
      launchViteProject: async (requirement, output) => {
        const siteType = /游戏|吃豆|pacman|pac-man|小游戏|arcade|game/i.test(requirement)
          ? 'vite-game'
          : 'vite-landing';
        void launchViteProject(requirement, output).catch((err) => {
          console.warn(
            '[site-builder] background launch failed:',
            err instanceof Error ? err.message : err,
          );
        });
        return {
          projectDir: '',
          devUrl: '',
          launchStatus: 'starting' as const,
          launchMessage:
            '正在后台安装依赖并启动 Vite（约 1–2 分钟）。完成后可点「打开本地 Vite 站点」或访问 :5180',
          scaffoldType: siteType,
        };
      },
    },
  });
}
