(() => {
  const host = location.hostname.replace(/^www\./, "");
  const source = host.includes("zakupki.gov") ? "ЕИС" : host.includes("roseltorg") ? "Росэлторг" : host.includes("b2b-center") ? "B2B-Center" : host.includes("fabrikant") ? "Фабрикант" : host;
  const good = /(грузоперевоз|перевозк.{0,20}груз|транспортно.?экспедицион|экспедирован|\bftl\b|\bltl\b|складск|ответственн.{0,8}хранен|доставк.{0,30}(продукц|товар|оборуд|груз)|логистическ)/i;
  const bad = /(пассажир|автобус|такси|спецтехник|аренда автомобил|покупка автомобил|топлив)/i;
  const priceRe = /(?:НМЦК|начальн\w* цен\w*|цена|сумма)?[^\d]{0,20}(\d[\d\s\u00a0]{3,})(?:[,.]\d{1,2})?\s*(?:₽|руб)/i;
  const dateRe = /(?:до|окончание|заявок|дедлайн)[^\d]{0,30}(\d{2}[.\/-]\d{2}[.\/-]\d{4})/i;
  const innRe = /ИНН\s*[:№]?\s*(\d{10}|\d{12})/i;
  const links = [...document.querySelectorAll("a[href]")];
  const seen = new Set(), items = [];
  for (const a of links) {
    const title = (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim();
    if (title.length < 18 || title.length > 500 || !good.test(title) || bad.test(title)) continue;
    const href = new URL(a.href, location.href).href;
    const key = title.toLowerCase().slice(0, 120) + href;
    if (seen.has(key)) continue;
    seen.add(key);
    let box = a;
    for (let i=0;i<4 && box.parentElement;i++) {
      if ((box.innerText||"").length > 120) break;
      box = box.parentElement;
    }
    const text = (box.innerText || title).replace(/\s+/g, " ");
    const pm = text.match(priceRe), dm = text.match(dateRe), im = text.match(innRe);
    const customerEl = box.querySelector('[class*="customer"],[class*="organizer"],[class*="company"],[class*="buyer"]');
    const customer = customerEl ? customerEl.textContent.trim() : "";
    items.push({
      id: source + "-" + btoa(unescape(encodeURIComponent(href))).slice(-24),
      title, customer, inn: im ? im[1] : "", region: "Не указан",
      price: pm ? Number(pm[1].replace(/\s|\u00a0/g, "")) : 0,
      deadline: dm ? dm[1] : "", score: 65, source, url: href,
      collectedAt: new Date().toISOString()
    });
    if (items.length >= 200) break;
  }
  return {source, url: location.href, items};
})()