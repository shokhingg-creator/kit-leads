importScripts("search-config.js");
const SOURCES=[
{name:"ЕИС",url:"https://zakupki.gov.ru/epz/order/extendedsearch/results.html"},
{name:"Росэлторг",url:"https://www.roseltorg.ru/procedures/search"},
{name:"B2B-Center",url:"https://www.b2b-center.ru/market/?f_keyword=%D0%B4%D0%BE%D1%81%D1%82%D0%B0%D0%B2%D0%BA%D0%B0&searching=1&company_type=2&price_currency=0&date=1&trade=all#search-result"},
{name:"Фабрикант",url:"https://www.fabrikant.ru/trades/procedure/search/"},
{name:"ТЭК-Торг",url:"https://www.tektorg.ru/procedures"},
{name:"РТС-тендер",url:"https://www.rts-tender.ru/poisk"},
{name:"Сбер А",url:"https://www.sberbank-ast.ru/purchaseList.aspx"},
{name:"ЭТП Газпромбанка",url:"https://etpgpb.ru/procedures/"},
{name:"Заказ РФ",url:"https://etp.zakazrf.ru/"},
{name:"НЭП",url:"https://www.etp-ets.ru/procedures/"},
{name:"Российский аукционный дом",url:"https://lot-online.ru/"},
{name:"OTC",url:"https://otc.ru/tender/"},
{name:"Bidzaar",url:"https://bidzaar.com/app/requests/external",waitMs:8000},
{name:"ЭТПРФ",url:"https://etprf.ru/"}];
if(Array.isArray(globalThis.KIT_EXTRA_SOURCES)) SOURCES.push(...globalThis.KIT_EXTRA_SOURCES);
chrome.runtime.onInstalled.addListener(()=>chrome.alarms.create("kit-auto-collect",{periodInMinutes:30}));
chrome.alarms.onAlarm.addListener(a=>{if(a.name==="kit-auto-collect")collectAll()});
chrome.runtime.onMessage.addListener((m,s,r)=>{
 if(m.type==="COLLECT_ALL"){collectAll().then(r);return true}
 if(m.type==="COLLECT_TAB"){collectTab(m.tabId).then(r);return true}
 if(m.type==="OPEN_ALL"){openAll().then(r);return true}
 if(m.type==="GET_STATE"){chrome.storage.local.get(["kitTenders","lastRun","lastStatus"]).then(r);return true}
 if(m.type==="CLEAR"){chrome.storage.local.set({kitTenders:[],lastStatus:"База очищена"}).then(()=>r({ok:true}));return true}
});
async function collectTab(tabId){
 try{
  const tab=await chrome.tabs.get(tabId);
  if(!/(zakupki\.gov\.ru|roseltorg\.ru|b2b-center\.ru|fabrikant\.ru|tektorg\.ru|rts-tender\.ru|sberbank-ast\.ru|etpgpb\.ru|zakazrf\.ru|etp-ets\.ru|lot-online\.ru|otc\.ru|bidzaar\.com|etprf\.ru)/i.test(tab.url||""))return{ok:false,error:"Откройте страницу со списком закупок поддерживаемой площадки"};
  await chrome.scripting.executeScript({target:{tabId},files:["extractor.js","publication-date.js"]});
  const injected=await chrome.scripting.executeScript({target:{tabId},func:()=>{const raw=document.documentElement.dataset.kitTenderResult;return raw?JSON.parse(raw):null}});
  const result=injected&&injected[0]&&injected[0].result;
  if(!result||!Array.isArray(result.items))return{ok:false,error:"Не получен ответ от страницы. Обновите страницу, дождитесь списка и повторите сбор"};
  await merge(result.items);
  return{ok:true,count:result.items.length,source:result.source}
 }catch(e){return{ok:false,error:e&&e.message?e.message:String(e)}}
}
function tenderKey(x){
 const rawUrl=x.url||"";
 const combined=((x.title||"")+" "+rawUrl);
 const notice=combined.match(/(?:№|номер|извещени[ея]|закупк[аи]|purchase|procedure|tender|trade)[^\d]{0,20}(\d{6,})/i);
 if(notice)return "notice|"+notice[1];
 try{
  const u=new URL(rawUrl);
  const idNames=["noticeInfoId","regNumber","purchaseNumber"];
  for(const name of idNames){const value=u.searchParams.get(name);if(value)return "notice|"+value.toLowerCase()}
  const localIdNames=["id","tender_id","procedure_id","trade_id"];
  for(const name of localIdNames){const value=u.searchParams.get(name);if(value)return (x.source||"").toLowerCase()+"|id|"+value.toLowerCase()}
  const pathId=u.pathname.match(/(?:^|\/)(\d{6,})(?:\/|$)/);
  if(pathId)return (x.source||"").toLowerCase()+"|id|"+pathId[1]
 }catch{}
 const title=(x.title||"").toLowerCase()
  .replace(/(?:лот|процедура)\s*№?\s*\d+/gi," ")
  .replace(/[^а-яёa-z0-9]+/gi," ").replace(/\s+/g," ").trim().slice(0,220);
 const price=Number(x.price||0);
 const deadline=String(x.deadline||"").replace(/\D/g,"").slice(0,8);
 return "text|"+title+"|"+(price||"")+"|"+deadline
}
function combineTender(old,x){
 const oldStatus=old.workStatus&&old.workStatus!=="new"?old.workStatus:"";
 const firstSeenAt=old.firstSeenAt||old.foundAt||x.firstSeenAt||new Date().toISOString();
 const sources=[...new Set([...(old.sources||[old.source]).filter(Boolean),...(x.sources||[x.source]).filter(Boolean)])];
 return {...old,...x,sources,workStatus:oldStatus||x.workStatus||old.workStatus||"new",decisionDate:old.decisionDate||x.decisionDate||"",publicationDate:x.publicationDate||old.publicationDate||"",firstSeenAt,lastSeenAt:old.lastSeenAt||firstSeenAt,history:Array.isArray(old.history)?old.history:(Array.isArray(x.history)?x.history:[])}
}
function newlyFound(x,at){
 const history=Array.isArray(x.history)?x.history.slice():[];
 if(!history.length)history.push({at,type:"found",details:"Впервые найден на площадке "+(x.source||"")});
 return {...x,firstSeenAt:x.firstSeenAt||at,lastSeenAt:at,history}
}
function seenAgain(old,x,at){
 const merged=combineTender(old,x),history=[...(merged.history||[])];
 const previous=merged.lastSeenAt?new Date(merged.lastSeenAt).getTime():0;
 if(!previous||Date.now()-previous>5*60*1000)history.push({at,type:"seen",details:"Повторно найден при автоматическом поиске"});
 return {...merged,lastSeenAt:at,history}
}
async function merge(items){
 const s=await chrome.storage.local.get(["kitTenders"]);
 const map=new Map();
 const at=new Date().toISOString();
 for(const x of (s.kitTenders||[])){const key=tenderKey(x),prepared=newlyFound(x,x.firstSeenAt||x.foundAt||at);map.set(key,map.has(key)?combineTender(map.get(key),prepared):prepared)}
 for(const x of items){const key=tenderKey(x);map.set(key,map.has(key)?seenAgain(map.get(key),x,at):newlyFound(x,at))}
 await chrome.storage.local.set({kitTenders:[...map.values()].slice(-3000),lastRun:new Date().toISOString()});
}
function wait(tabId,settleMs=2500){return new Promise(resolve=>{const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(fn);resolve()},30000);const fn=(id,info)=>{if(id===tabId&&info.status==="complete"){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(fn);setTimeout(resolve,settleMs)}};chrome.tabs.onUpdated.addListener(fn)})}
async function openAll(){
 const opened=[];
 for(const src of SOURCES){try{const tab=await chrome.tabs.create({url:src.url,active:false});opened.push({source:src.name,tabId:tab.id})}catch(e){}}
 return{ok:true,count:opened.length}
}
async function collectAll(){
 const summary=[];await chrome.storage.local.set({lastStatus:"Сбор запущен"});
 for(const src of SOURCES){let tab;try{tab=await chrome.tabs.create({url:src.url,active:false});await wait(tab.id,src.waitMs||2500);summary.push({source:src.name,...await collectTab(tab.id)})}catch(e){summary.push({source:src.name,ok:false,error:e&&e.message?e.message:String(e)})}finally{if(tab&&tab.id)chrome.tabs.remove(tab.id).catch(()=>{})}}
 const total=summary.reduce((n,x)=>n+(x.count||0),0);await chrome.storage.local.set({lastStatus:"Сбор завершён: "+total+" тендеров"});return{ok:true,summary}
}