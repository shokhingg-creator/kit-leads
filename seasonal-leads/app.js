import { categories, clusters, publicUrl, queriesFor, sameCompany, toCsv, validInn } from './search.js';

const $ = (id) => document.getElementById(id);
const storageKey = 'kit-seasonal-leads-v1';
const statuses = ['Требуется сверка', 'Новый', 'Бывший', 'Действующий', 'Не подходит'];
const cluster = $('cluster');
const city = $('city');
const category = $('category');
const notice = $('notice');
let leads = [];
let storageAvailable = true;

try {
  const data = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(data)) leads = data.filter((lead) => lead && Object.hasOwn(categories, lead.category) && publicUrl(lead.source));
} catch {
  storageAvailable = false;
}

function state() {
  return { cluster: cluster.value, city: city.value.trim(), category: category.value };
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(leads));
    return '';
  } catch {
    return 'Браузер не сохранил изменения. Выгрузите CSV перед закрытием страницы.';
  }
}

function cell(row, text) {
  const result = row.insertCell();
  if (text) result.textContent = text;
  return result;
}

function render() {
  $('leads').replaceChildren();
  for (const lead of leads) {
    const row = $('leads').insertRow();
    const companyCell = cell(row);
    const company = document.createElement('strong');
    company.textContent = lead.company;
    companyCell.append(company);
    const contact = [lead.inn ? 'ИНН ' + lead.inn : '', lead.contact].filter(Boolean).join(' · ');
    if (contact) {
      const detail = document.createElement('small');
      detail.textContent = contact;
      companyCell.append(detail);
    }
    cell(row, [categories[lead.category].label, lead.cluster, lead.city].join(' · '));
    const evidence = cell(row, lead.evidence);
    const link = document.createElement('a');
    link.href = lead.source;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Источник';
    const detail = document.createElement('small');
    detail.append(lead.priority + ' приоритет · ', link);
    evidence.append(detail);
    if (lead.location) {
      const location = document.createElement('small');
      location.textContent = lead.location;
      evidence.append(location);
    }
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Статус CoWork — ' + lead.company);
    select.append(...statuses.map((name) => new Option(name, name)));
    select.value = statuses.includes(lead.status) ? lead.status : statuses[0];
    select.addEventListener('change', () => { lead.status = select.value; notice.textContent = save(); });
    cell(row).append(select);
  }
  $('count').textContent = leads.length;
  $('empty').hidden = leads.length > 0;
  $('export').disabled = leads.length === 0;
}

function manualLinks() {
  const [query] = queriesFor(category.value, city.value.trim() || cluster.value);
  const mapQuery = categories[category.value].query + ' оптом';
  const links = [
    ['Яндекс', 'https://yandex.ru/search/?text=' + encodeURIComponent(query)],
    ['2ГИС', 'https://2gis.ru/search/' + encodeURIComponent([city.value.trim(), mapQuery].filter(Boolean).join(' '))],
  ];
  $('manual-links').replaceChildren(...links.map(([label, href]) => {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    return link;
  }));
}

function updateCluster() {
  const cities = clusters[cluster.value];
  $('cities').replaceChildren(...cities.map((name) => new Option(name, name)));
  city.value = cities[0];
  manualLinks();
}

cluster.append(...Object.keys(clusters).map((name) => new Option(name, name)));
cluster.value = 'Екатеринбург';
category.append(...Object.entries(categories).map(([id, config]) => new Option(config.label, id)));
cluster.addEventListener('change', updateCluster);
city.addEventListener('input', manualLinks);
category.addEventListener('change', manualLinks);
updateCluster();
render();
if (!storageAvailable) notice.textContent = 'Хранилище браузера недоступно или не читается. Выгружайте изменения в CSV.';

let searchReady = false;
try {
  const response = await fetch('./api/status', { signal: AbortSignal.timeout(4000) });
  searchReady = response.ok && Boolean((await response.json()).ready);
} catch {
  searchReady = false;
}
$('run').disabled = !searchReady;
$('mode').textContent = searchReady
  ? 'Автопоиск проверяет открытые страницы по двум запросам для выбранного города и груза.'
  : 'Доступен ручной поиск в Яндексе и 2ГИС. Для автоматического сбора запустите сервер с ключом Tavily.';

$('search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!searchReady || $('run').disabled) return;
  $('run').disabled = true;
  notice.textContent = 'Идёт поиск по открытым источникам…';
  try {
    const response = await fetch('./api/search?' + new URLSearchParams(state()));
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Ошибка поиска.');
    let added = 0;
    for (const lead of payload.leads) {
      if (leads.some((existing) => sameCompany(existing, lead))) continue;
      leads.unshift({ ...lead, status: statuses[0] });
      added++;
    }
    const failedSave = save();
    render();
    notice.textContent = [
      `Найдено кандидатов: ${payload.leads.length}. Добавлено: ${added}. Дубли: ${payload.leads.length - added}.`,
      payload.partial ? 'Один из поисковых запросов завершился ошибкой.' : '',
      failedSave,
    ].filter(Boolean).join(' ');
  } catch (error) {
    notice.textContent = error.message || 'Не удалось выполнить поиск.';
  } finally {
    $('run').disabled = false;
  }
});

$('add').addEventListener('click', () => {
  $('manual').hidden = false;
  $('manual').elements.company.focus();
});
$('cancel-add').addEventListener('click', () => { $('manual').hidden = true; $('add').focus(); });
$('manual').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries([...new FormData(event.currentTarget)].map(([key, value]) => [key, value.trim()]));
  const message = $('manual-notice');
  const source = publicUrl(data.source);
  if (!source || !data.company || !data.evidence || !state().city) {
    message.textContent = 'Укажите город поиска, компанию, публичную ссылку и признак отгрузок.';
    return;
  }
  if (data.inn && !validInn(data.inn)) {
    message.textContent = 'Проверьте ИНН. Контрольная цифра не сходится.';
    return;
  }
  const lead = { ...state(), ...data, source: source.href, status: statuses[0], priority: 'Обычный' };
  if (leads.some((existing) => sameCompany(existing, lead))) {
    message.textContent = 'Компания с таким ИНН или доменом уже есть в базе.';
    return;
  }
  leads.unshift(lead);
  const failedSave = save();
  render();
  event.currentTarget.reset();
  event.currentTarget.hidden = true;
  message.textContent = '';
  notice.textContent = ['Компания добавлена.', failedSave].filter(Boolean).join(' ');
  $('add').focus();
});

$('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([toCsv(leads)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'KIT-seasonal-leads.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
