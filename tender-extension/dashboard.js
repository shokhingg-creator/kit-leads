let all=[],view=[];
const fmt=n=>new Intl.NumberFormat("ru-RU").format(n||0)+" ₽";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const labels={new:"Новый",work:"В работе",bid:"Подана заявка",no:"Не берём",win:"Выигран",lost:"Проигран"};
const today=()=>new Date().toISOString().slice(0,10);
async function load(){const s=await chrome.storage.local.get(["kitTenders","lastRun"]);all=(s.kitTenders||[]).map(x=>({...x,workStatus:x.workStatus||"new",decisionDate:x.decisionDate||""}));document.getElementById("updated").textContent=s.lastRun?new Date(s.lastRun).toLocaleString("ru-RU"):"—";render()}
async function saveItem(id,patch){const i=all.findIndex(x=>x.id===id);if(i<0)return;all[i]={...all[i],...patch};await chrome.storage.local.set({kitTenders:all});render()}
function statusOptions(value){return Object.entries(labels).map(([k,v])=>`<option value="${k}" ${value===k?"selected":""}>${v}</option>`).join("")}
function render(){
 const q=document.getElementById("q").value.toLowerCase(),src=document.getElementById("source").value,min=+document.getElementById("score").value,ws=document.getElementById("workStatus").value;
 view=all.filter(x=>(src==="Все источники"||x.source===src)&&(x.score||0)>=min&&(!ws||(x.workStatus||"new")===ws)&&((x.title||"")+" "+(x.customer||"")+" "+(x.inn||"")).toLowerCase().includes(q));
 document.getElementById("count").textContent=view.length;
 document.getElementById("inwork").textContent=all.filter(x=>["work","bid"].includes(x.workStatus)).length;
 document.getElementById("declined").textContent=all.filter(x=>x.workStatus==="no").length;
 document.getElementById("empty").style.display=view.length?"none":"block";
 document.getElementById("body").innerHTML=view.map(x=>`<tr><td><a href="${esc(x.url)}" target="_blank">${esc(x.title||"Без названия")}</a><div style="color:#76828e;font-size:11px;margin-top:5px">${esc(x.customer||"")} ${x.inn?"· ИНН "+esc(x.inn):""}</div></td><td><span class="tag">${esc(x.source||"")}</span></td><td><b>${fmt(x.price)}</b></td><td>${esc(x.publicationDate||"—")}</td><td>${esc(x.deadline||"—")}</td><td><span class="score">${x.score||65}</span></td><td><select class="work-select st-${x.workStatus||"new"}" data-id="${esc(x.id)}">${statusOptions(x.workStatus||"new")}</select></td><td><input class="date-input" data-id="${esc(x.id)}" type="date" value="${esc(x.decisionDate||"")}"></td></tr>`).join("");
 document.querySelectorAll(".work-select").forEach(el=>el.onchange=()=>saveItem(el.dataset.id,{workStatus:el.value,decisionDate:all.find(x=>x.id===el.dataset.id)?.decisionDate||(el.value==="new"?"":today())}));
 document.querySelectorAll(".date-input").forEach(el=>el.onchange=()=>saveItem(el.dataset.id,{decisionDate:el.value}));
}
["q","source","score","workStatus"].forEach(id=>document.getElementById(id).addEventListener("input",render));
document.getElementById("collect").onclick=()=>{const b=document.getElementById("collect");b.textContent="Собираю…";chrome.runtime.sendMessage({type:"COLLECT_ALL"},()=>{b.textContent="Обновить список";load()})};
document.getElementById("export").onclick=()=>{const rows=[["Тендер","Заказчик","ИНН","Источник","НМЦК","Дата начала","Дедлайн","Рейтинг","Решение","Дата решения","Ссылка"],...view.map(x=>[x.title,x.customer,x.inn,x.source,x.price,x.publicationDate,x.deadline,x.score,labels[x.workStatus||"new"],x.decisionDate,x.url])];const csv=rows.map(r=>r.map(x=>'"'+String(x||"").replaceAll('"','""')+'"').join(";")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv"}));a.download="Тендеры_КИТ_со_статусами.csv";a.click()};
load();