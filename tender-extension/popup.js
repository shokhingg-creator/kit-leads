const status=document.getElementById("status");
function state(){chrome.runtime.sendMessage({type:"GET_STATE"},s=>{const n=(s?.kitTenders||[]).length;status.textContent=(s?.lastStatus||"Готово к сбору")+" · В базе: "+n})}
document.getElementById("all").onclick=()=>{status.textContent="Открываю площадки и собираю данные…";chrome.runtime.sendMessage({type:"COLLECT_ALL"},()=>state())};
document.getElementById("openAll").onclick=()=>{status.textContent="Открываю все площадки…";chrome.runtime.sendMessage({type:"OPEN_ALL"},r=>{status.textContent=r?.ok?"Открыто площадок: "+r.count:"Не удалось открыть площадки"})};
document.getElementById("one").onclick=async()=>{const[t]=await chrome.tabs.query({active:true,currentWindow:true});status.textContent="Собираю текущую страницу…";chrome.runtime.sendMessage({type:"COLLECT_TAB",tabId:t.id},r=>{status.textContent=r?.ok?"Найдено: "+r.count:"Не удалось собрать: "+(r?.error||"ошибка")})};
state();