export interface Source {
  id: string;
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchOutput {
  sources: Source[];
  provider?: string;
  mocked?: boolean;
  error?: string;
}

export interface ResearchReportOutput {
  markdown: string;
  title: string;
}

export interface WebsiteFile {
  path: string;
  language: string;
  content: string;
}

export interface WebsiteBuilderOutput {
  title: string;
  description: string;
  files: WebsiteFile[];
  previewNotes: string;
  /** 本地 Vite 项目目录（一键建站） */
  projectDir?: string;
  /** 本地 dev server 地址，如 http://localhost:5180/ */
  devUrl?: string;
  launchStatus?: 'ready' | 'failed' | 'skipped' | 'starting';
  launchMessage?: string;
  scaffoldType?: 'vite-game' | 'vite-landing' | 'html-preview-only';
}

export interface HtmlExportOutput {
  html: string;
}

export interface SummaryOutput {
  summary: string;
}

export interface DocumentGeneratorOutput {
  title: string;
  markdown: string;
  mode: 'writing' | 'analysis' | 'presentation';
}

export interface PromptEnhancerOutput {
  originalPrompt: string;
  enhancedPrompt: string;
  target: string;
  rationale: string[];
}

export interface MediaGenerationOutput {
  title: string;
  kind: 'image' | 'video';
  prompt: string;
  model: string;
  mimeType?: string;
  dataUrl?: string;
  uri?: string;
  done?: boolean;
  submitted?: boolean;
}

export interface PresentationSlide {
  title: string;
  bullets: string[];
  visual: string;
  speakerNote: string;
}

export interface PresentationOutput {
  title: string;
  slides: PresentationSlide[];
  markdown: string;
  html: string;
}
