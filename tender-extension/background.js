const SOURCES=[
{name:"ЕИС",url:"https://zakupki.gov.ru/epz/order/extendedsearch/results.html"},
{name:"Росэлторг",url:"https://www.roseltorg.ru/procedures/search"},
{name:"B2B-Center",url:"https://www.b2b-center.ru/market/"},
{name:"Фабрикант",url:"https://www.fabrikant.ru/trades/procedure/search/"}];
chrome.runtime.onInstalled.addListener(()=>chrome.alarms.create("kit-auto-collect",{periodInMinutes:30}));
chrome.alarms.onAlarm.addListener(a=>{if(a.name==="kit-auto-collect")collectAll()});
chrome.runtime.onMessage.addListener((m,s,r)=>{
 if(m.type==="COLLECT_ALL"){collectAll().then(r);return true}
 if(m.type==="COLLECT_TAB"){collectTab(m.tabId).then(r);return true}
 if(m.type==="GET_STATE"){chrome.storage.local.get(["kitTenders","lastRun","lastStatus"]).then(r);return true}
 if(m.type==="CLEAR"){chrome.storage.local.set({kitTenders:[],lastStatus:"База очищена"}).then(()=>r({ok:true}));return true}
});
async function code(){return(await fetch(chrome.runtime.getURL("extractor.js"))).text()}
async function collectTab(tabId){
 try{const[{result}]=await chrome.scripting.executeScript({target:{tabId},func:async c=>eval(c),args:[await code()]});await merge(result.items||[]);return{ok:true,count:(result.items||[]).length,source:result.source}}
 catch(e){return{ok:false,error:String(e)}}
}
async function merge(items){
 const s=await chrome.storage.local.get(["kitTenders"]);const map=new Map((s.kitTenders||[]).map(x=>[(x.source||"")+"|"+(x.url||x.id),x]));
 items.forEach(x=>map.set((x.source||"")+"|"+(x.url||x.id),x));
 await chrome.storage.local.set({kitTenders:[...map.values()].slice(-3000),lastRun:new Date().toISOString()});
}
function wait(tabId){return new Promise(resolve=>{const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(fn);resolve()},25000);const fn=(id,info)=>{if(id===tabId&&info.status==="complete"){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(fn);setTimeout(resolve,2500)}};chrome.tabs.onUpdated.addListener(fn)})}
async function collectAll(){
 const summary=[];await chrome.storage.local.set({lastStatus:"Сбор запущен"});
 for(const src of SOURCES){let tab;try{tab=await chrome.tabs.create({url:src.url,active:false});await wait(tab.id);summary.push({source:src.name,...await collectTab(tab.id)})}catch(e){summary.push({source:src.name,ok:false,error:String(e)})}finally{if(tab?.id)chrome.tabs.remove(tab.id).catch(()=>{})}}
 const total=summary.reduce((n,x)=>n+(x.count||0),0);await chrome.storage.local.set({lastStatus:"Сбор завершён: "+total+" тендеров"});return{ok:true,summary}
}