import type { ToolDefinition } from '@agnes/agent-core';
import { documentGeneratorTool } from './documentGeneratorTool.js';
import { htmlExportTool } from './htmlExportTool.js';
import { imageGeneratorTool, videoGeneratorTool } from './mediaGeneratorTools.js';
import { presentationGeneratorTool } from './presentationGeneratorTool.js';
import { promptEnhancerTool } from './promptEnhancerTool.js';
import { researchReportTool } from './researchReportTool.js';
import { summaryTool } from './summaryTool.js';
import { webSearchTool } from './webSearchTool.js';
import { websiteBuilderTool } from './websiteBuilderTool.js';

export {
  webSearchTool,
  summaryTool,
  researchReportTool,
  websiteBuilderTool,
  htmlExportTool,
  documentGeneratorTool,
  presentationGeneratorTool,
  promptEnhancerTool,
  imageGeneratorTool,
  videoGeneratorTool,
};
export type * from './types.js';

export const allTools: ToolDefinition[] = [
  webSearchTool,
  summaryTool,
  researchReportTool,
  websiteBuilderTool,
  htmlExportTool,
  documentGeneratorTool,
  presentationGeneratorTool,
  promptEnhancerTool,
  imageGeneratorTool,
  videoGeneratorTool,
];
