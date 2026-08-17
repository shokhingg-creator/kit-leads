(() => {
 const root=document.documentElement;
 const raw=root.dataset.kitTenderResult;
 if(!raw)return;
 let result;
 try{result=JSON.parse(raw)}catch{return}
 if(!result||!Array.isArray(result.items))return;
 const clean=v=>(v||"").replace(/\s+/g," ").trim();
 const datePattern=/(\d{2}[.\/-]\d{2}[.\/-]\d{4})(?:\s+(\d{1,2}:\d{2}))?/g;
 for(const item of result.items){
  let anchor=null;
  try{
   anchor=[...document.querySelectorAll("a[href]")].find(a=>new URL(a.href,location.href).href===item.url);
  }catch{}
  if(!anchor)continue;
  let box=anchor.closest("tr");
  if(!box){
   box=anchor;
   for(let i=0;i<8&&box.parentElement;i++){
    box=box.parentElement;
    const t=clean(box.innerText);
    if(t.length>120&&(/Опубликовано|Актуально до/i.test(t)||result.source!=="B2B-Center"))break;
   }
  }
  const text=clean(box&&box.innerText);
  const dates=[...text.matchAll(datePattern)].map(m=>m[1]+(m[2]?" "+m[2]:""));
  const published=text.match(/(?:опубликовано|размещено|дата публикации)[^\d]{0,30}(\d{2}[.\/-]\d{2}[.\/-]\d{4})(?:\s+(\d{1,2}:\d{2}))?/i);
  if(result.source==="B2B-Center"){
   item.publicationDate=dates[0]||item.publicationDate||"";
   if(dates[1])item.deadline=dates[1];
  }else if(published){
   item.publicationDate=published[1]+(published[2]?" "+published[2]:"");
  }
 }
 root.dataset.kitTenderResult=JSON.stringify(result);
})();