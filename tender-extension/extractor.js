(() => {
 const clean=v=>(v||"").replace(/\s+/g," ").trim();
 const host=location.hostname.replace(/^www\./,"");
 const source=host.includes("zakupki.gov")?"ЕИС":
  host.includes("roseltorg")?"Росэлторг":
  host.includes("b2b-center")?"B2B-Center":
  host.includes("fabrikant")?"Фабрикант":
  host.includes("tektorg")?"ТЭК-Торг":
  host.includes("rts-tender")?"РТС-тендер":
  host.includes("sberbank-ast")?"Сбер А":
  host.includes("etpgpb")?"ЭТП Газпромбанка":
  host.includes("zakazrf")?"Заказ РФ":
  host.includes("etp-ets")?"НЭП":
  host.includes("lot-online")?"Российский аукционный дом":
  host.includes("otc.ru")?"OTC":
  host.includes("bidzaar")?"Bidzaar":
  host.includes("etprf")?"ЭТПРФ":host;
 const good=/(грузоперевоз|перевозк.{0,25}груз|доставк.{0,25}(?:груз|товар|отправлен)|транспортн.{0,15}услуг|транспортно.?экспедицион|экспедирован|\bftl\b|\bltl\b|логистическ|курьерск.{0,20}достав|складск.{0,20}услуг|ответственн.{0,8}хранен)/i;
 const bad=/(пассажир|автобус|такси|спецтехник|аренда автомобил|покупка автомобил|топлив|вывоз тко|твердых коммунальн|медицинск.{0,10}отход|эвакуатор)/i;
 const dateRe=/(?:актуально до|до|окончание|заявок)[^\d]{0,30}(\d{2}[.\/-]\d{2}[.\/-]\d{4})(?:\s+(\d{1,2}:\d{2}))?/i;
 const priceRe=/(\d[\d\s\u00a0]{3,})(?:[,.]\d{1,2})?\s*(?:₽|руб)/i;
 const innRe=/ИНН\s*[:№]?\s*(\d{10}|\d{12})/i;
 const items=[],seen=new Set();
 function add(a,box){
  const text=clean(box&&box.innerText);
  const transportation=/(^|\s)Перевозки(\s|$)/i.test(text)||good.test(text);
  if(!transportation||bad.test(text))return;
  const href=new URL(a.href,location.href).href;
  if(seen.has(href))return;seen.add(href);
  const lines=(box.innerText||"").split(/\n+/).map(clean).filter(Boolean);
  const title=lines.find(x=>good.test(x)&&!/^Перевозки$/i.test(x))||lines.find(x=>x.length>25&&!/Запрос предложений|РЕКОМЕНДОВАНО/i.test(x))||clean(a.textContent);
  const links=[...box.querySelectorAll("a[href]")];
  const org=links.find(x=>x!==a&&/(ООО|АО|ПАО|ИП|ЗАО|ОАО|ФГУП)/i.test(clean(x.textContent)));
  const dm=text.match(dateRe),pm=text.match(priceRe),im=text.match(innRe);
  items.push({id:source+"-"+btoa(unescape(encodeURIComponent(href))).slice(-24),title,customer:clean(org&&org.textContent),inn:im?im[1]:"",region:"Не указан",price:pm?Number(pm[1].replace(/\s|\u00a0/g,"")):0,deadline:dm?dm[1]+(dm[2]?" "+dm[2]:""):"",score:/(^|\s)Перевозки(\s|$)/i.test(text)?85:70,source,url:href,collectedAt:new Date().toISOString()});
 }
 if(source==="B2B-Center"){
  const links=[...document.querySelectorAll('a[href*="/market/view"],a[href*="market/view"],a[href*="trade_view"]')];
  for(const a of links){let box=a.closest("tr");if(!box){box=a;for(let i=0;i<8&&box.parentElement;i++){box=box.parentElement;if(clean(box.innerText).length>120&&/(Опубликовано|Актуально до)/i.test(clean(box.innerText)))break}}add(a,box);if(items.length>=200)break}
 }else{
  for(const a of document.querySelectorAll("a[href]")){let box=a;for(let i=0;i<5&&box.parentElement;i++){box=box.parentElement;if(clean(box.innerText).length>150)break}add(a,box);if(items.length>=200)break}
 }
 const result={source,url:location.href,items};
 document.documentElement.dataset.kitTenderResult=JSON.stringify(result);
 return result;
})()