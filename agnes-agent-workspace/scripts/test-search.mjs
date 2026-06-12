import fs from 'node:fs';

async function testDdgHtml(query) {
  const res = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    body: new URLSearchParams({ q: query }),
  });
  const html = await res.text();
  fs.writeFileSync('tmp-ddg.html', html);
  const results = [];
  const linkRe = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(html)) && results.length < 5) {
    const url = m[1].replace(/&amp;/g, '&');
    const title = m[2].replace(/<[^>]+>/g, '').trim();
    const snippetMatch = html
      .slice(m.index, m.index + 800)
      .match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    const snippet = snippetMatch
      ? snippetMatch[1].replace(/<[^>]+>/g, '').trim()
      : '';
    if (url && title) results.push({ title, url, snippet });
  }
  return results;
}

const q = '2026 国内 AI Agent 产品发展趋势';
console.log('Query:', q);
const results = await testDdgHtml(q);
console.log('Results:', results.length);
for (const r of results) console.log('-', r.title, '\n ', r.url, '\n ', r.snippet.slice(0, 100));
