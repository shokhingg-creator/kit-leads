importScripts("search-config.js");
const SOURCES=[
{name:"ЕИС",url:"https://zakupki.gov.ru/epz/order/extendedsearch/results.html"},
{name:"Росэлторг",url:"https://www.roseltorg.ru/procedures/search"},
{name:"B2B-Center",url:"https://www.b2b-center.ru/market/?f_keyword=%D0%B4%D0%BE%D1%81%D1%82%D0%B0%D0%B2%D0%BA%D0%B0&searching=1&company_type=2&price_currency=0&date=1&trade=all#search-result"},
{name:"Фабрикант",url:"https://www.fabrikant.ru/trades/procedure/search/"}];
if(Array.isArray(globalThis.KIT_EXTRA_SOURCES)) SOURCES.push(...globalThis.KIT_EXTRA_SOURCES);
chrome.runtime.onInstalled.addListener(()=>chrome.alarms.create("kit-auto-collect",{periodInMinutes:30}));
chrome.alarms.onAlarm.addListener(a=>{if(a.name==="kit-auto-collect")collectAll()});
chrome.runtime.onMessage.addListener((m,s,r)=>{
 if(m.type==="COLLECT_ALL"){collectAll().then(r);return true}
 if(m.type==="COLLECT_TAB"){collectTab(m.tabId).then(r);return true}
 if(m.type==="GET_STATE"){chrome.storage.local.get(["kitTenders","lastRun","lastStatus"]).then(r);return true}
 if(m.type==="CLEAR"){chrome.storage.local.set({kitTenders:[],lastStatus:"База очищена"}).then(()=>r({ok:true}));return true}
});
async function collectTab(tabId){
 try{
  const tab=await chrome.tabs.get(tabId);
  if(!/(zakupki\.gov\.ru|roseltorg\.ru|b2b-center\.ru|fabrikant\.ru)/i.test(tab.url||""))return{ok:false,error:"Откройте страницу со списком закупок поддерживаемой площадки"};
  await chrome.scripting.executeScript({target:{tabId},files:["extractor.js"]});
  const injected=await chrome.scripting.executeScript({target:{tabId},func:()=>{const raw=document.documentElement.dataset.kitTenderResult;return raw?JSON.parse(raw):null}});
  const result=injected&&injected[0]&&injected[0].result;
  if(!result||!Array.isArray(result.items))return{ok:false,error:"Не получен ответ от страницы. Обновите страницу, дождитесь списка и повторите сбор"};
  await merge(result.items);
  return{ok:true,count:result.items.length,source:result.source}
 }catch(e){return{ok:false,error:e&&e.message?e.message:String(e)}}
}
async function merge(items){
 const s=await chrome.storage.local.get(["kitTenders"]);const map=new Map((s.kitTenders||[]).map(x=>[(x.source||"")+"|"+(x.url||x.id),x]));
 items.forEach(x=>map.set((x.source||"")+"|"+(x.url||x.id),x));
 await chrome.storage.local.set({kitTenders:[...map.values()].slice(-3000),lastRun:new Date().toISOString()});
}
function wait(tabId){return new Promise(resolve=>{const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(fn);resolve()},25000);const fn=(id,info)=>{if(id===tabId&&info.status==="complete"){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(fn);setTimeout(resolve,2500)}};chrome.tabs.onUpdated.addListener(fn)})}
async function collectAll(){
 const summary=[];await chrome.storage.local.set({lastStatus:"Сбор запущен"});
 for(const src of SOURCES){let tab;try{tab=await chrome.tabs.create({url:src.url,active:false});await wait(tab.id);summary.push({source:src.name,...await collectTab(tab.id)})}catch(e){summary.push({source:src.name,ok:false,error:e&&e.message?e.message:String(e)})}finally{if(tab&&tab.id)chrome.tabs.remove(tab.id).catch(()=>{})}}
 const total=summary.reduce((n,x)=>n+(x.count||0),0);await chrome.storage.local.set({lastStatus:"Сбор завершён: "+total+" тендеров"});return{ok:true,summary}
}