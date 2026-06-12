const BASE = process.env.AGNES_API_BASE ?? 'http://localhost:3001';

async function json(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  return { status: res.status, data };
}

async function runSync(userInput, agentType, sessionId) {
  const { status, data } = await json('POST', '/api/agent/run', {
    userInput,
    agentType,
    sessionId,
  });
  if (status !== 200) throw new Error(`run failed ${status}: ${JSON.stringify(data)}`);
  return data;
}

async function pollRun(runId) {
  for (let i = 0; i < 80; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const { status, data } = await json('GET', `/api/agent/runs/${runId}`);
    if (status !== 200) throw new Error(`poll failed ${status}: ${JSON.stringify(data)}`);
    if (data.status === 'completed' || data.status === 'failed') return data;
  }
  throw new Error(`run ${runId} did not finish in time`);
}

function toolNames(run) {
  return (run.toolCalls ?? run.context?.toolCalls ?? []).map((call) => call.toolName);
}

function assert(name, ok, details = '') {
  return { name, ok: Boolean(ok), details };
}

function artifactTypes(run) {
  return (run.artifacts ?? run.context?.artifacts ?? []).map((artifact) => artifact.type);
}

function calls(run) {
  return run.toolCalls ?? run.context?.toolCalls ?? [];
}

function callByTool(run, toolName) {
  return calls(run).find((call) => call.toolName === toolName);
}

function enhancedPrompt(run) {
  return callByTool(run, 'prompt_enhancer')?.output?.enhancedPrompt;
}

async function main() {
  const checks = [];
  const startedAt = new Date().toISOString();
  const sessionPrefix = process.env.ACCEPTANCE_SESSION_PREFIX ?? `acceptance-${Date.now()}`;

  const health = await json('GET', '/api/health');
  checks.push(assert('health endpoint', health.status === 200 && health.data.status === 'ok'));

  await json('POST', '/api/models', { provider: 'mock', model: 'mock', temperature: 0.2 });

  const asyncStart = await json('POST', '/api/agent/run-async', {
    userInput: '调研 2026 年国内 AI Agent 产品发展趋势',
    agentType: 'research',
    sessionId: `${sessionPrefix}-async`,
  });
  checks.push(
    assert(
      'main agent immediate reply before workflow completion',
      asyncStart.status === 202 &&
        asyncStart.data.status === 'running' &&
        typeof asyncStart.data.immediateReply === 'string' &&
        asyncStart.data.immediateReply.length > 0 &&
        Array.isArray(asyncStart.data.toolCalls) &&
        asyncStart.data.toolCalls.length === 0,
      `status=${asyncStart.status}, runStatus=${asyncStart.data.status}`,
    ),
  );
  const asyncFinal = await pollRun(asyncStart.data.runId);
  checks.push(
    assert(
      'async workflow eventually completes',
      asyncFinal.status === 'completed' && toolNames(asyncFinal).includes('research_report'),
      toolNames(asyncFinal).join(' -> '),
    ),
  );

  const chat = await json('POST', '/api/agent/run-async', {
    userInput: '你现在能做什么？',
    sessionId: `${sessionPrefix}-chat`,
  });
  checks.push(
    assert(
      'normal conversation uses direct chat response',
      chat.status === 202 &&
        chat.data.status === 'completed' &&
        (chat.data.toolCalls ?? []).length === 0 &&
        chat.data.context?.finalResult?.mode === 'chat',
      `status=${chat.status}`,
    ),
  );

  const research = await runSync(
    '调研 2026 年国内 AI Agent 产品发展趋势',
    'research',
    `${sessionPrefix}-research`,
  );
  checks.push(
    assert(
      'research analysis report workflow',
      ['prompt_enhancer', 'web_search', 'research_report', 'html_export', 'summary'].every((name) =>
        toolNames(research).includes(name),
      ) &&
        callByTool(research, 'research_report')?.input?.topic === enhancedPrompt(research) &&
        callByTool(research, 'research_report')?.input?.topic !==
          '调研 2026 年国内 AI Agent 产品发展趋势' &&
        artifactTypes(research).includes('html'),
      toolNames(research).join(' -> '),
    ),
  );

  const website = await runSync(
    '一键建站：生成一个有首屏、功能区和表单的品牌官网',
    'website',
    `${sessionPrefix}-website`,
  );
  checks.push(
    assert(
      'one-click website workflow',
      toolNames(website).includes('prompt_enhancer') &&
        toolNames(website).includes('website_builder') &&
        callByTool(website, 'website_builder')?.input?.requirement === enhancedPrompt(website) &&
        callByTool(website, 'website_builder')?.input?.requirement !==
          '一键建站：生成一个有首屏、功能区和表单的品牌官网' &&
        artifactTypes(website).includes('html'),
      toolNames(website).join(' -> '),
    ),
  );

  const presentation = await runSync(
    '生成一份 Agnes Agent Workspace 项目汇报 PPT',
    'presentation',
    `${sessionPrefix}-ppt`,
  );
  checks.push(
    assert(
      'PPT generation workflow',
      toolNames(presentation).includes('prompt_enhancer') &&
        toolNames(presentation).includes('presentation_generator') &&
        callByTool(presentation, 'presentation_generator')?.input?.task ===
          enhancedPrompt(presentation) &&
        callByTool(presentation, 'presentation_generator')?.input?.task !==
          '生成一份 Agnes Agent Workspace 项目汇报 PPT' &&
        artifactTypes(presentation).includes('html'),
      toolNames(presentation).join(' -> '),
    ),
  );

  const image = await runSync(
    '生成一张未来感 AI Agent 工作台海报',
    'media',
    `${sessionPrefix}-image`,
  );
  const imageCalls = calls(image);
  const imageEnhanced = imageCalls.find((call) => call.toolName === 'prompt_enhancer')?.output
    ?.enhancedPrompt;
  const imageInputPrompt = imageCalls.find((call) => call.toolName === 'image_generator')?.input
    ?.prompt;
  checks.push(
    assert(
      'image AIGC prompt enhancement before generation',
      toolNames(image).indexOf('prompt_enhancer') > -1 &&
        toolNames(image).indexOf('image_generator') > toolNames(image).indexOf('prompt_enhancer') &&
        typeof imageEnhanced === 'string' &&
        imageEnhanced === imageInputPrompt &&
        imageInputPrompt !== '生成一张未来感 AI Agent 工作台海报',
      toolNames(image).join(' -> '),
    ),
  );

  const video = await runSync(
    '生成一个 5 秒的未来感 AI Agent 工作台短视频',
    'media',
    `${sessionPrefix}-video`,
  );
  const videoCalls = calls(video);
  checks.push(
    assert(
      'video AIGC prompt enhancement before generation',
      toolNames(video).includes('prompt_enhancer') &&
        toolNames(video).includes('video_generator') &&
        toolNames(video).indexOf('video_generator') > toolNames(video).indexOf('prompt_enhancer') &&
        videoCalls.find((call) => call.toolName === 'video_generator')?.input?.prompt ===
          videoCalls.find((call) => call.toolName === 'prompt_enhancer')?.output?.enhancedPrompt,
      toolNames(video).join(' -> '),
    ),
  );

  const memorySession = `${sessionPrefix}-memory`;
  await runSync('生成一个 B2B SaaS 官网', 'website', memorySession);
  const followUp = await runSync('基于刚才的主题，生成汇报 PPT', undefined, memorySession);
  const session = await json('GET', `/api/agent/sessions/${memorySession}`);
  checks.push(
    assert(
      'conversation memory and contextual continuation',
      followUp.context?.conversationHistory?.length >= 2 &&
        session.status === 200 &&
        Array.isArray(session.data.runs) &&
        session.data.runs.length >= 2,
      `history=${followUp.context?.conversationHistory?.length ?? 0}, runs=${session.data.runs?.length ?? 0}`,
    ),
  );

  const switchStartConfig = await json('POST', '/api/models', {
    provider: 'custom',
    baseUrl: 'http://127.0.0.1:9/v1',
    model: 'before-switch-model',
    apiKey: 'test-key',
    temperature: 0.2,
  });
  const switchRun = await json('POST', '/api/agent/run-async', {
    userInput: '生成一个模型切换测试官网',
    agentType: 'website',
    sessionId: `${sessionPrefix}-model-switch`,
  });
  await json('POST', '/api/models', { provider: 'mock', model: 'after-switch-model' });
  const switchFinal = await pollRun(switchRun.data.runId);
  const snapshot = switchFinal.context?.modelSnapshot;
  checks.push(
    assert(
      'model switch behavior is snapshot based',
      switchStartConfig.status === 200 &&
        switchRun.status === 202 &&
        snapshot?.model === 'before-switch-model' &&
        snapshot?.provider === 'custom',
      `snapshot=${JSON.stringify(snapshot)}`,
    ),
  );

  const loop = research.context?.loopCheckpoint;
  checks.push(
    assert(
      'loop engineering checkpoint completed',
      loop?.status === 'completed' &&
        Array.isArray(loop.completedNodeIds) &&
        loop.completedNodeIds.length === research.plan?.steps?.length,
      JSON.stringify(loop),
    ),
  );
  const loopStages = new Set((research.context?.loopEvents ?? []).map((event) => event.stage));
  checks.push(
    assert(
      'explicit CC-style loop stages are traced',
      ['perceive', 'route', 'plan', 'act', 'observe', 'reflect', 'persist', 'stop'].every(
        (stage) => loopStages.has(stage),
      ) && (research.trace ?? []).some((event) => event.type === 'loop_event'),
      [...loopStages].join(' -> '),
    ),
  );

  await json('POST', '/api/models', { provider: 'mock', model: 'mock', temperature: 0.2 });

  const failed = checks.filter((item) => !item.ok);
  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    base: BASE,
    health: health.data,
    passed: failed.length === 0,
    checks,
  };
  console.log(JSON.stringify(report, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
