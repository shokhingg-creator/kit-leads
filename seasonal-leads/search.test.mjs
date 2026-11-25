import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { qualify, sameCompany, toCsv } from './search.js';
import { makeServer } from './server.mjs';

const scope = { category: 'irrigation', cluster: 'Екатеринбург', city: 'Екатеринбург' };
const source = {
  title: 'Системы полива оптом — Пример',
  url: 'https://example.test/delivery',
  raw_content: 'Продажа систем полива оптом. Доставка по всей России транспортной компанией. Склад: г. Екатеринбург, ул. Строителей. ИНН 7727615144. sales@example.test',
};

test('требует текст источника с сигналом доставки', () => {
  const candidate = qualify(source, scope);
  assert.equal(candidate.priority, 'Высокий');
  assert.equal(candidate.inn, '7727615144');
  assert.match(candidate.location, /Екатеринбург/);
  assert.equal(qualify(source, { ...scope, city: 'Москва' }), null);
  assert.equal(candidate.contact, 'sales@example.test');
  assert.equal(qualify({ ...source, raw_content: '', content: source.raw_content }, scope), null);
  assert.equal(qualify({ ...source, raw_content: 'Не доставляем по всей России.' }, scope), null);
  assert.equal(qualify({ ...source, url: 'https://2gis.ru/firm/1' }, scope), null);
});

test('сверяет дубли и защищает Excel от формул в тексте страницы', () => {
  const lead = qualify(source, scope);
  assert.ok(sameCompany(lead, { ...lead, source: 'https://other.test/' }));
  assert.ok(sameCompany(lead, { ...lead, inn: '', source: 'https://www.example.test/contact' }));
  assert.match(toCsv([{ ...lead, company: ' =1+2' }]), /"' =1\+2"/);
});

test('сервер готовит запросы, объединяет выдачу и сообщает о частичном сбое', async (t) => {
  const queries = [];
  const server = makeServer({
    apiKey: 'fixture',
    fetchSearch: async (url, request) => {
      assert.equal(url, 'https://api.tavily.com/search');
      assert.equal(request.headers.Authorization, 'Bearer fixture');
      queries.push(JSON.parse(request.body).query);
      return queries.length === 1
        ? Response.json({ results: [source, { ...source, url: 'https://www.example.test/delivery' }] })
        : Response.json({}, { status: 429 });
    },
  }).listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await fetch(base + '/')).status, 200);
  assert.deepEqual(await (await fetch(base + '/api/status')).json(), { ready: true });
  const response = await fetch(base + '/api/search?' + new URLSearchParams(scope));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(queries.length, 2);
  assert.ok(queries.every((query) => query.includes(scope.city)));
  assert.equal(data.leads.length, 1);
  assert.equal(data.partial, true);
});
