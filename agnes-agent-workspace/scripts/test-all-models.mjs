const tests = [
  {
    id: 'agnes',
    name: 'Agnes agnes-2.0-flash',
    url: 'https://apihub.agnes-ai.com/v1/chat/completions',
    key: 'sk-jfaX9i7OTvAdVgL1WFISx9zowLMT3RY21X6IU5PBDrK71uli',
    body: { model: 'agnes-2.0-flash', messages: [{ role: 'user', content: 'Reply OK only' }], max_tokens: 10 },
  },
const providers = [
  {
    id: 'openai',
    name: 'OpenAI gpt-4o-mini',
    url: 'https://api.openai.com/v1/chat/completions',
    key: process.env.OPENAI_API_KEY,
    body: {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Reply OK only' }],
      max_tokens: 10,
    },
  },
];

for (const provider of providers) {
  if (!provider.key) {
    console.warn(`Skip ${provider.name}: missing API key`);
    continue;
  }

  // 后面继续请求逻辑
}
  {
    id: 'deepseek',
    name: 'DeepSeek deepseek-chat',
    url: 'https://api.deepseek.com/v1/chat/completions',
    key: 'sk-4ab94283c5b5410786634cbeadda480c',
    body: { model: 'deepseek-chat', messages: [{ role: 'user', content: 'Reply OK only' }], max_tokens: 10 },
  },
];

async function testChat(t) {
  const started = Date.now();
  try {
    const res = await fetch(t.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(t.body),
    });
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { raw: raw.slice(0, 200) }; }
    const sample = data.choices?.[0]?.message?.content ?? data.error?.message ?? raw.slice(0, 120);
    console.log(`[${t.id}] HTTP ${res.status} ${res.ok ? 'OK' : 'FAIL'} ${Date.now() - started}ms sample=${String(sample).slice(0, 80)}`);
    return res.ok;
  } catch (e) {
    console.log(`[${t.id}] ERROR ${e.message}`);
    return false;
  }
}

for (const t of tests) await testChat(t);

// ZenMux text via vertex
const zenKey = 'sk-ai-v1-4fddea27c6d94b84884b4b7a0c0f29db3b08f3c45ac8b8473232af483f0a28c2';
try {
  const res = await fetch('https://zenmux.ai/api/vertex-ai/v1/publishers/google/models/gemini-2.0-flash:generateContent', {
    method: 'POST',
    headers: { Authorization: `Bearer ${zenKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }] }),
  });
  const raw = await res.text();
  console.log(`[zenmux-text] HTTP ${res.status} ${raw.slice(0, 150)}`);
} catch (e) {
  console.log(`[zenmux-text] ERROR ${e.message}`);
}
