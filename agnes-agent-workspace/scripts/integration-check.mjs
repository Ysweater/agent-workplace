const BASE = process.env.AGNES_API_BASE ?? 'http://localhost:3001';

async function json(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function log(title, detail) {
  console.log(`\n=== ${title} ===`);
  console.log(detail);
}

async function testProvider(name, config) {
  const { status, data } = await json('POST', '/api/models/test', config);
  const line = `[${name}] HTTP ${status} ok=${data.ok} provider=${data.provider} model=${data.model} msg=${data.message} sample=${data.sample ?? ''}`;
  console.log(line);
  return data.ok;
}

async function runAgent(userInput, agentType) {
  const { status, data } = await json('POST', '/api/agent/run', { userInput, agentType });
  if (status !== 200) {
    throw new Error(`Agent failed ${status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

async function main() {
  const health = await json('GET', '/api/health');
  log('Health', JSON.stringify(health.data, null, 2));

  await json('DELETE', '/api/models');

  const results = {
    agnes: await testProvider('agnes', {
      provider: 'agnes',
      model: 'agnes-2.0-flash',
      baseUrl: 'https://apihub.agnes-ai.com/v1',
      temperature: 0.2,
    }),
    mock: await testProvider('mock', { provider: 'mock', model: 'mock', temperature: 0.2 }),
  };

  await json('DELETE', '/api/models');
  await testProvider('agnes-restore', {
    provider: 'agnes',
    model: 'agnes-2.0-flash',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    temperature: 0.2,
  });

  log('Research run (agnes)', 'starting...');
  const research = await runAgent('调研 2026 年国内 AI Agent 产品发展趋势', 'research');
  const htmlArtifacts = (research.artifacts ?? []).filter((a) => a.type === 'html');
  const tools = (research.toolCalls ?? []).map((t) => `${t.toolName}:${t.success ? 'ok' : 'fail'}`);
  log(
    'Research result',
    `tools=${tools.join(' → ')}\nhtmlArtifacts=${htmlArtifacts.length}\nplanSteps=${research.plan?.steps?.length ?? 0}`,
  );
  if (htmlArtifacts.length === 0) {
    console.error('FAIL: no HTML artifact in research run');
    process.exitCode = 1;
  } else {
    console.log('HTML preview head:', String(htmlArtifacts[0].content).slice(0, 120));
  }

  log('Website run (pacman)', 'starting...');
  const website = await runAgent('生成一个复古风吃豆人小游戏页面', 'website');
  const siteTools = (website.toolCalls ?? []).map((t) => `${t.toolName}:${t.success ? 'ok' : 'fail'}`);
  const wb = (website.toolCalls ?? []).find((t) => t.toolName === 'website_builder');
  const devUrl = wb?.output?.devUrl;
  const launchMessage = wb?.output?.launchMessage;
  log(
    'Website result',
    `tools=${siteTools.join(' → ')}\ndevUrl=${devUrl ?? 'none'}\nlaunch=${wb?.output?.launchStatus ?? 'n/a'} ${launchMessage ?? ''}`,
  );
  if (!devUrl && wb?.output?.launchStatus !== 'skipped') {
    console.error('WARN: Vite devUrl missing — check launchMessage above');
  }

  log('Provider tests summary', JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
