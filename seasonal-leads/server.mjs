import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { candidateOrder, categories, clusters, qualify, queriesFor, sameCompany } from './search.js';

const assets = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/search.js': ['search.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};

async function lookup(query, apiKey, fetchSearch) {
  const response = await fetchSearch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, search_depth: 'basic', max_results: 12, include_raw_content: 'text' }),
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.results)) throw new Error('Некорректный ответ');
  return payload.results;
}

export function makeServer({ apiKey = (process.env.TAVILY_API_KEY || '').trim(), fetchSearch = fetch } = {}) {
  return createServer(async (request, response) => {
    const json = (code, data) => {
      response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(data));
    };
    const url = new URL(request.url, 'http://localhost');
    if (request.method !== 'GET') return json(405, { error: 'Метод не поддерживается.' });
    if (url.pathname === '/api/status') return json(200, { ready: Boolean(apiKey) });

    if (url.pathname === '/api/search') {
      if (!apiKey) return json(503, { error: 'На сервере отсутствует TAVILY_API_KEY.' });
      if (request.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: 'Откройте приложение напрямую.' });
      const cluster = url.searchParams.get('cluster') || '';
      const city = (url.searchParams.get('city') || '').trim();
      const category = url.searchParams.get('category') || '';
      if (!Object.hasOwn(clusters, cluster) || !Object.hasOwn(categories, category) || !/^[\p{L}\d .(),-]{2,80}$/u.test(city)) {
        return json(400, { error: 'Проверьте кластер, город и категорию.' });
      }

      const batches = await Promise.allSettled(queriesFor(category, city).map((query) => lookup(query, apiKey, fetchSearch)));
      const successful = batches.filter((batch) => batch.status === 'fulfilled');
      if (!successful.length) {
        const errors = [...new Set(batches.map((batch) => String(batch.reason?.message || '')).filter((message) => /^HTTP \d{3}$/.test(message)))];
        return json(502, { error: `Поисковый сервис недоступен${errors.length ? ` (${errors.join(', ')})` : ''}. Проверьте ключ и лимит запросов.` });
      }
      const candidates = successful.flatMap((batch) => batch.value)
        .filter((result) => result && typeof result === 'object')
        .map((result) => qualify(result, { category, cluster, city })).filter(Boolean).sort(candidateOrder);
      const leads = [];
      for (const lead of candidates) {
        if (!leads.some((existing) => sameCompany(existing, lead))) leads.push(lead);
      }
      return json(200, { leads, partial: successful.length < batches.length });
    }

    if (!Object.hasOwn(assets, url.pathname)) return json(404, { error: 'Страница не найдена.' });
    const [file, type] = assets[url.pathname];
    try {
      const body = await readFile(new URL(file, import.meta.url));
      response.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
      response.end(body);
    } catch {
      json(500, { error: 'Не удалось загрузить страницу.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8787);
  makeServer().listen(port, '127.0.0.1', () => console.log(`КИТ · сезонные грузы — http://127.0.0.1:${port}`));
}
