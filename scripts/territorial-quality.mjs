import {classify,duplicateGroups,territoryFor} from './territorial-catalog.mjs';
export function analyzeQuality(events,registry,observations,today) {
 const issues=[];
 const byId=new Map(events.map(e=>[String(e.id),e]));
 const add=(e,kind,reason,source=null,checkedOn=null)=>issues.push({id:String(e.id),title:e.title||'Sans titre',city:e.city||'',country:e.country_code||'',region:e.region||'',start_date:e.start_date||null,end_date:e.end_date||null,kind,reason,source,checkedOn,published:e.validated===true&&e.rejected===false,status:classify(e,today)});
 for(const e of events){
  if(e.rejected===true)continue;
  if(!territoryFor(e,registry))add(e,'geography','Pays ou territoire absent / hors référentiel. Aucun classement géographique automatique.');
  if(classify(e,today)==='invalid')add(e,'dates','Date invalide ou date de fin antérieure au début. L’annonce reste publiée si elle est validée.');
  if(!e.start_date)add(e,'dates','Date de début manquante.');
  if(!String(e.title||'').trim()||!String(e.city||'').trim())add(e,'incomplete','Titre ou ville à compléter.');
 }
 for(const group of duplicateGroups(events.filter(e=>e.rejected!==true))){
  for(const id of group)add(byId.get(String(id)),'duplicate','Même titre, ville et dates qu’une autre annonce ('+group.filter(x=>x!==id).join(', ')+'). À comparer, sans retrait automatique.');
 }
 for(const note of observations){
  const e=byId.get(String(note.id));if(!e||e.rejected===true)continue;
  if(note.relatedIds?.length){
   const related=note.relatedIds.map(id=>byId.get(id));
   if(related.some(x=>!x||x.validated!==true||x.rejected!==false))continue;
   if(related.some(x=>x.city!==e.city||x.start_date!==e.start_date))continue;
  }else if(Object.entries(note.expected||{}).every(([key,value])=>e[key]===value))continue;
  add(e,note.kind,note.reason,note.source,note.checkedOn);
 }
 const priority=e=>!e.published?2:['future','ongoing','undated','invalid'].includes(e.status)?0:1;
 return issues.sort((a,b)=>priority(a)-priority(b)||(a.start_date||'9999').localeCompare(b.start_date||'9999')||a.title.localeCompare(b.title,'fr'));
}
