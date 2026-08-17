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
  const lines=(box.innerText||"").split(/\n+/).map(clean).filter(Boolean);
  const title=lines.find(x=>good.test(x)&&!/^Перевозки$/i.test(x))||lines.find(x=>x.length>25&&!/Запрос предложений|РЕКОМЕНДОВАНО/i.test(x))||clean(a.textContent);
  const links=[...box.querySelectorAll("a[href]")];
  const tenderLink=links.find(x=>good.test(clean(x.textContent)))||a;
  const href=new URL(tenderLink.href,location.href).href;
  const dm=text.match(dateRe),pm=text.match(priceRe),im=text.match(innRe);
  const signature=source+"|"+title.toLowerCase().replace(/[^а-яёa-z0-9]+/gi," ").trim()+"|"+(pm?pm[1].replace(/\s|\u00a0/g,""):"")+"|"+(dm?dm[1]:"");
  if(seen.has(signature))return;seen.add(signature);
  const org=links.find(x=>x!==tenderLink&&/(ООО|АО|ПАО|ИП|ЗАО|ОАО|ФГУП)/i.test(clean(x.textContent)));
  items.push({id:source+"-"+btoa(unescape(encodeURIComponent(href))).slice(-24),title,customer:clean(org&&org.textContent),inn:im?im[1]:"",region:"Не указан",price:pm?Number(pm[1].replace(/\s|\u00a0/g,"")):0,deadline:dm?dm[1]+(dm[2]?" "+dm[2]:""):"",score:/(^|\s)Перевозки(\s|$)/i.test(text)?85:70,source,url:href,collectedAt:new Date().toISOString()});
 }
 if(source==="Bidzaar"){
  const titleRe=/^\d{2,}-\d+\s*[·•]\s*(.+)/;
  const nodes=[...document.querySelectorAll("a,div,span,h1,h2,h3,h4")].filter(el=>{
   const value=clean(el.textContent);
   if(!titleRe.test(value))return false;
   return ![...el.children].some(ch=>titleRe.test(clean(ch.textContent)))
  });
  for(const node of nodes){
   let box=node;
   for(let i=0;i<7&&box.parentElement;i++){
    const parent=box.parentElement,parentText=clean(parent.innerText);
    box=parent;
    if(/Прием предложений до/i.test(parentText)&&parentText.length<1500)break
   }
   const text=clean(box.innerText),match=clean(node.textContent).match(titleRe);
   const title=match?match[1]:clean(node.textContent);
   if(!good.test(title+" "+text)||bad.test(title+" "+text))continue;
   const number=(clean(node.textContent).match(/^(\d{2,}-\d+)/)||[])[1]||"";
   const deadlineMatch=text.match(/Прием предложений до\s*(\d{2}\.\d{2}\.\d{4})\s*[·•]\s*(\d{1,2}:\d{2})/i);
   const publishedMatch=text.match(/Прием предложений с\s*(\d{2}\.\d{2}\.\d{4})/i);
   const anchor=node.closest("a[href]")||box.querySelector("a[href]");
   const href=anchor?new URL(anchor.href,location.href).href:location.href+"#request-"+number;
   const signature=source+"|"+number+"|"+title.toLowerCase();
   if(seen.has(signature))continue;seen.add(signature);
   items.push({id:source+"-"+number,title,customer:"",inn:"",region:"Не указан",price:0,
    deadline:deadlineMatch?deadlineMatch[1]+" "+deadlineMatch[2]:"",
    publicationDate:publishedMatch?publishedMatch[1]:"",
    score:/грузоперевоз|перевозк.{0,25}груз|транспортно.?экспедицион/i.test(title)?85:70,
    source,url:href,collectedAt:new Date().toISOString()});
   if(items.length>=200)break
  }
 }else if(source==="B2B-Center"){
  const links=[...document.querySelectorAll('a[href*="/market/view"],a[href*="market/view"],a[href*="trade_view"]')];
  for(const a of links){let box=a.closest("tr");if(!box){box=a;for(let i=0;i<8&&box.parentElement;i++){box=box.parentElement;if(clean(box.innerText).length>120&&/(Опубликовано|Актуально до)/i.test(clean(box.innerText)))break}}add(a,box);if(items.length>=200)break}
 }else{
  for(const a of document.querySelectorAll("a[href]")){let box=a;for(let i=0;i<5&&box.parentElement;i++){box=box.parentElement;if(clean(box.innerText).length>150)break}add(a,box);if(items.length>=200)break}
 }
 const result={source,url:location.href,items};
 document.documentElement.dataset.kitTenderResult=JSON.stringify(result);
 return result;
})()