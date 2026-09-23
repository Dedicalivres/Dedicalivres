import {fetchPublicEvents} from './scripts/territorial-catalog.mjs';
import {pilots,renderTerritory} from './scripts/territorial-render.mjs';

const pilot=pilots.find(p=>p.id===document.getElementById('territory-content')?.dataset.territoryId);
let loading=false;
let resources;
function bindRefresh(){
 const button=document.getElementById('territory-refresh');
 if(button){button.hidden=false;button.disabled=loading;button.onclick=()=>refresh(true);}
}
async function readJSON(path){const response=await fetch(path);if(!response.ok)throw Error('Ressource indisponible');return response.json();}
async function refresh(restoreFocus=false){
 if(loading||!pilot)return;
 loading=true;bindRefresh();
 const status=document.getElementById('territory-refresh-status');
 status.textContent='Vérification du catalogue public…';
 try{
  const config=window.DEDICALIVRES_CONFIG;
  if(!config?.supabaseUrl||!config?.supabaseAnonKey)throw Error('Configuration absente');
  const [events,assets]=await Promise.all([
   fetchPublicEvents(config),
   resources?Promise.resolve(resources):Promise.all([readJSON('docs/territoires/referentiel.json'),readJSON('docs/territoires/verifications-organisateurs.json')])
  ]);
  resources=assets;
  const capturedAt=new Date().toISOString();
  const {main,stats}=renderTerritory({p:pilot,events,registry:assets[0],verified:assets[1],capturedAt,live:true});
  // Only swap after complete, validated pagination and successful rendering.
  document.getElementById('territory-content').outerHTML=main;
  document.querySelector('meta[name="description"]')?.setAttribute('content',`${stats.total} événements littéraires référencés en ${pilot.label}, ${pilot.country}. Catalogue public actualisé.`);
 }catch(error){
  status.textContent='Actualisation indisponible. Les dernières données affichées sont conservées ; leur date figure ci-dessus.';
 }finally{
  loading=false;bindRefresh();
  if(restoreFocus)document.getElementById('territory-refresh')?.focus({preventScroll:true});
 }
}
if(pilot){bindRefresh();refresh();}
