export const clusters = {
  'Волга': ['Волгоград', 'Астрахань', 'Саратов'],
  'ДФО': ['Владивосток', 'Хабаровск', 'Благовещенск'],
  'Екатеринбург': ['Екатеринбург', 'Нижний Тагил', 'Каменск-Уральский'],
  'Приволжье': ['Казань', 'Набережные Челны', 'Ижевск'],
  'ПФО': ['Нижний Новгород', 'Самара', 'Уфа'],
  'Санкт-Петербург и ЛО': ['Санкт-Петербург', 'Всеволожск', 'Гатчина'],
  'Сибирь': ['Новосибирск', 'Омск', 'Красноярск'],
  'Столичный': ['Москва', 'Подольск', 'Балашиха'],
  'Юг': ['Ростов-на-Дону', 'Краснодар', 'Ставрополь'],
};

export const categories = {
  greenhouses: { label: 'Теплицы', query: 'теплицы комплекты каркасы', match: /теплиц|парник/i },
  irrigation: { label: 'Полив', query: 'капельный полив системы орошения', match: /орошени[еяю]|капельн[а-яё]+ полив|систем[а-яё]+ полива/i },
  tires: { label: 'Шины', query: 'автомобильные шины', match: /(?:^|[^а-яё])(?:шин[аыуы]|покрышки|автошин[а-яё]+)(?:$|[^а-яё])/i },
};

export function queriesFor(categoryId, city) {
  const { query } = categories[categoryId];
  return ['производитель дилерам отгрузка по России', 'оптом доставка по России транспортной компанией']
    .map((suffix) => `${query} ${city} ${suffix}`);
}

export function validInn(value) {
  const digits = Array.from(value, Number);
  const digit = (weights) => weights.reduce((sum, weight, i) => sum + weight * digits[i], 0) % 11 % 10;
  return (/^\d{10}$/.test(value) && digit([2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[9])
    || (/^\d{12}$/.test(value) && digit([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[10]
      && digit([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[11]);
}

export function publicUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function domainOf(value) {
  return publicUrl(value)?.hostname.replace(/^www\./, '') || '';
}

const regional = /по\s+(?:всей\s+)?(?:территории\s+)?(?:россии|рф)|(?:в|во)\s+(?:любой\s+город|(?:все\s+)?регионы)\s+(?:россии|рф)|междугородн[а-яё]+/i;
const shipment = /достав[а-яё]+|отгруз[а-яё]+|отправ[а-яё]+|постав[а-яё]+/i;
const carrier = /транспортн[а-яё]+\s+компани[а-яё]+|сторонн[а-яё]+\s+перевозчик[а-яё]*|(?:^|[^а-яё])ТК(?:$|[^а-яё])/i;
const wholesale = /производите?л[ьяюи]|собственное производство|оптов[а-яё]+|оптом|дилерам|дистрибьютор/i;
const negated = /(?:не\s+(?:достав|отгруж|отправ|постав|осуществля|работа)|только самовывоз|достав[а-яё]+.{0,30}не\s+осуществля)/i;
const locationContext = /склад[а-яё]*|самовывоз|производств[а-яё]*|завод[а-яё]*|адрес|ул\.|улица|г\./i;

function locationEvidence(content, city) {
  const literal = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cityName = new RegExp(`(?:^|[^а-яё])${literal}(?:[аеуыи]|ом)?(?=$|[^а-яё])`, 'iu');
  return content.split(/[\r\n]+|(?<=[!?])\s+|(?<!\bг)(?<!ул)(?<!д)\.\s+/u)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .find((line) => line.length <= 280 && cityName.test(line) && locationContext.test(line)
      && !shipment.test(line) && !negated.test(line)) || '';
}

const directories = /(^|\.)(?:avito\.ru|ozon\.ru|wildberries\.ru|2gis\.ru|pulscen\.ru|yandex\.ru|t\.me|vk\.com|satom\.ru|all\.biz)$/i;

export function qualify(result, { category, cluster, city }) {
  const url = publicUrl(result.url);
  if (!url || directories.test(url.hostname)) return null;
  const title = String(result.title || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const raw = typeof result.raw_content === 'string' ? result.raw_content.slice(0, 70000) : '';
  const content = raw.replace(/<[^>]*>/g, ' ');
  if (!title || !categories[category].match.test(`${title} ${content}`) || !wholesale.test(`${title} ${content}`)) return null;

  const excerpts = content.split(/[\r\n]+|(?<=[.!?])\s+/u)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length <= 450 && shipment.test(line) && regional.test(line) && !negated.test(line));
  const evidence = excerpts.find((line) => carrier.test(line)) || excerpts[0];
  const location = locationEvidence(content, city);
  if (!evidence || !location) return null;

  const inns = [...new Set(Array.from(content.matchAll(/(?:^|[^а-яё])ИНН[ :№–-]*(\d{12}|\d{10})(?!\d)/giu), (match) => match[1]).filter(validInn))];
  const emails = Array.from(content.matchAll(/\b(?:opt|sales|info|office|order|zakaz|b2b|contact)@[a-z\d.-]+\.[a-z]{2,}\b/gi), (match) => match[0]);
  const domain = domainOf(url.href);
  const contact = emails.find((email) => email.toLowerCase().split('@')[1] === domain) || emails[0] || '';
  const company = title.split(/\s+[|—–]\s+/).at(-1);
  return { company, inn: inns.length === 1 ? inns[0] : '', cluster, city, category,
    source: url.href, evidence, location, contact, priority: carrier.test(evidence) ? 'Высокий' : 'Обычный' };
}

export function sameCompany(left, right) {
  if (left.inn && right.inn) return left.inn === right.inn;
  const domain = domainOf(left.source);
  return Boolean(domain && domain === domainOf(right.source));
}

export function candidateOrder(left, right) {
  return Number(right.priority === 'Высокий') - Number(left.priority === 'Высокий')
    || Number(Boolean(right.contact)) - Number(Boolean(left.contact));
}

export const columns = ['Компания', 'ИНН', 'Кластер поиска', 'Город поиска', 'Груз', 'Приоритет',
  'Корпоративный email', 'Источник', 'Признак отгрузок', 'Признак присутствия в городе', 'Статус CoWork', 'Следующий шаг'];

export function toCsv(leads) {
  const escape = (value) => {
    const text = String(value ?? '');
    const safe = /^\s*[=+\-@]|^[\t\r\n]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const rows = leads.map((lead) => [
    lead.company, lead.inn ? "'" + lead.inn : '', lead.cluster, lead.city, categories[lead.category].label, lead.priority,
    lead.contact, lead.source, lead.evidence, lead.location, lead.status,
    'Сверить компанию и холдинг в CoWork. Уточнить города и частоту отгрузок, кто выбирает ТК.',
  ]);
  return '\ufeff' + [columns, ...rows].map((row) => row.map(escape).join(';')).join('\r\n');
}
