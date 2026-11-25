import {chromium} from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root=process.cwd();
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});
const errors=[], calls=[];
const id=n=>"00000000-0000-0000-0000-"+String(n).padStart(12,"0");
const row=(n,title,start,end)=>({id:id(n+100),validated:true,rejected:false,events:{id:id(n),title,city:"Pontivy",lat:48+n/100,lng:-3,country_code:"FR",region:"Bretagne",start_date:start,end_date:end,type:"Salon",validated:true,rejected:false}});
let fail=false;
const future=Array.from({length:7},(_,i)=>row(i+1,"Futur "+(i+1),"2099-01-"+String(i+1).padStart(2,"0"),"2099-01-"+String(i+1).padStart(2,"0")));
const past=row(8,"Historique vérifié","2020-01-01","2020-01-01");
const excluded={...row(9,"Ne doit pas apparaître","2099-01-10","2099-01-10"),validated:false};
const cors={"access-control-allow-origin":"*","access-control-allow-headers":"apikey,authorization","access-control-allow-methods":"GET,OPTIONS"};
try {
 await context.route("**/*",async route=>{
  const u=new URL(route.request().url());
  if(u.pathname.startsWith("/rest/v1/")){
   if(route.request().method()==="OPTIONS")return route.fulfill({status:204,headers:cors});
   calls.push({method:route.request().method(),table:u.pathname,params:u.searchParams});
   if(fail)return route.fulfill({status:503,headers:cors,json:[]});
   if(u.pathname.endsWith("/authors"))return route.fulfill({headers:cors,json:[{id:id(99)}]});
   if(u.pathname.endsWith("/event_authors_presence"))return route.fulfill({headers:cors,json:[...future,future[0],past,excluded]});
   return route.fulfill({status:404,headers:cors,json:[]});
  }
  if(u.hostname==="unpkg.com" && u.pathname.endsWith("/leaflet.js"))return route.fulfill({contentType:"application/javascript",body:`window.L={map(node){return {setView(){return this},fitBounds(){},invalidateSize(){}}},tileLayer(){return {addTo(){}}},circleMarker(coords,options){return {addTo(){const el=document.createElement("span");el.className="test-map-marker";el.dataset.color=options.color;document.getElementById("author-travel-map").append(el);return this},bindPopup(){return this}}}};`});
  if(u.origin!=="http://author.test")return route.abort();
  const pathname=u.pathname.endsWith("/")?u.pathname+"index.html":u.pathname;
  const file=path.resolve(root,"."+pathname);
  if(!file.startsWith(root+path.sep))return route.abort();
  try{
   const body=await fs.readFile(file);
   const contentType=({".html":"text/html",".js":"application/javascript",".css":"text/css",".png":"image/png",".svg":"image/svg+xml"})[path.extname(file)]||"application/octet-stream";
   return route.fulfill({body,contentType});
  }catch{return route.fulfill({status:404,body:"not found"});}
 });
 const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
 // Serve the same static files without external network access, even when JS is disabled.
 await noJs.route("**/*",async route=>{
  const u=new URL(route.request().url());
  if(u.origin!=="http://author.test")return route.abort();
  const pathname=u.pathname.endsWith("/")?u.pathname+"index.html":u.pathname;
  const file=path.resolve(root,"."+pathname);
  if(!file.startsWith(root+path.sep))return route.abort();
  try{
   const body=await fs.readFile(file);
   return route.fulfill({body,contentType:({".html":"text/html",".css":"text/css",".js":"application/javascript"})[path.extname(file)]||"application/octet-stream"});
  }catch{return route.fulfill({status:404,body:"not found"});}
 });
 try{
  const staticPage=await noJs.newPage();
  await staticPage.goto("http://author.test/auteurs/katell-poquet/");
  assert.match(await staticPage.locator("h1").textContent(),/Katell/i);
  assert.ok(await staticPage.locator("#author-events-past .event-card").count()>0);
  assert.equal(await staticPage.locator('link[rel="canonical"]').getAttribute("href"),"https://dedicalivres.fr/auteurs/katell-poquet/");
  assert.equal(await staticPage.locator('p.author-note[role="status"]').count(),0);
 }finally{await noJs.close();}
 const page=await context.newPage();
 page.on("pageerror",err=>errors.push(err.message));
 const url="http://author.test/auteurs/katell-poquet/";
 await page.goto(url);
 const status=page.locator('p.author-note[role="status"]');
 await status.filter({hasText:"Présences actualisées."}).waitFor();
 await page.locator(".test-map-marker").first().waitFor({state:"attached"});
 assert.ok(await page.locator("#author-travel-map").isVisible());
 assert.equal(await page.locator(".test-map-marker").count(),8);
 assert.equal(await page.locator('.test-map-marker[data-color="#16803c"]').count(),7);
 assert.equal(await page.locator('.test-map-marker[data-color="#b93646"]').count(),1);
 assert.equal(await page.locator("#author-events-upcoming .event-card").count(),7);
 assert.equal(await page.locator("#author-events-past .event-card").count(),1);
 assert.equal(await page.locator("#author-events-ongoing .event-card").count(),0);
 assert.equal(await page.getByText("Ne doit pas apparaître",{exact:true}).count(),0);
 assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"),"https://dedicalivres.fr/auteurs/katell-poquet/");
 assert.equal(await page.locator("#author-events-upcoming .card-link").first().getAttribute("href"),"/event.html?id="+id(1));
 assert.ok(calls.length>=2 && calls.every(x=>x.method==="GET"));
 assert.equal(calls.find(x=>x.table.endsWith("/event_authors_presence")).params.get("author_id"),"eq."+id(99));
 await fs.mkdir("author-browser-evidence",{recursive:true});
 await page.screenshot({path:"author-browser-evidence/katell-mobile.png",fullPage:true});
 await page.setViewportSize({width:1280,height:900});
 await page.screenshot({path:"author-browser-evidence/katell-desktop.png",fullPage:true});
 fail=true;
 await page.reload();
 await status.filter({hasText:"Actualisation indisponible"}).waitFor();
 assert.ok(await page.locator("#author-events-past .event-card").count()>0);
 assert.equal(await page.getByText("Futur 1",{exact:true}).count(),0);
 assert.deepEqual(errors,[]);
 console.log("PASS Chromium: live rendering, 7 upcoming, deduplication, history, no writes, SEO canonical, fallback.");
} finally {await browser.close();}
