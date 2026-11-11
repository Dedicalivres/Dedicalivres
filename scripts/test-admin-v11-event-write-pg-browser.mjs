// PR278 isolated end-to-end: real Admin editor -> fixture HTTP -> disposable PostgreSQL/RLS.
// Intentionally refuses any nonlocal database. No Supabase, R2 or production I/O.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import pg from "pg";
import { chromium } from "playwright";

if (process.env.PR278_DISPOSABLE_PG !== "YES" ||
    process.env.PGHOST !== "127.0.0.1" ||
    process.env.PGPORT !== "55432" ||
    process.env.PGDATABASE !== "postgres")
  throw new Error("REFUSED: a disposable PostgreSQL at 127.0.0.1:55432 is required");
const { Pool }=pg;
const pool=new Pool({host:"127.0.0.1",port:55432,database:"postgres",
  user:"postgres",password:"disposable-test-only",max:4});
const id="11111111-1111-4111-8111-111111111111",
  admin="22222222-2222-4222-8222-222222222222",
  other="33333333-3333-4333-8333-333333333333";
const original="Fiche fictive avant édition",edited="Fiche fictive éditée";
const columns=new Set("id created_at title type city region country_code description website start_date end_date lat lng image_url validated rejected featured verified registration_force_status registration_note registration_audience registration_url registration_deadline registration_open_date registration_enabled source_label imported_source".split(" "));
const columnsByTable={events:columns,admin_users:new Set(["user_id"]),
  event_submission_contacts:new Set(["event_id","submitter_name","submitter_email"])};
let persona=admin,attempts=0,writes=0,server,browser;
const unexpected=[],errors=[],checks=[];
function pass(s){checks.push(s);console.log("PASS "+s)}
function col(table,name){
  if(!columnsByTable[table]?.has(name))throw Error("Invalid fixture column "+table+"."+name);
  return '"'+name+'"';
}
async function initialize(){
 await pool.query([
  "CREATE ROLE authenticated","CREATE ROLE anon","CREATE SCHEMA auth","CREATE SCHEMA private",
  "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$",
  "CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY)",
  "CREATE FUNCTION private.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=auth.uid()) $$",
  "REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC",
  "GRANT USAGE ON SCHEMA auth,private TO authenticated",
  "GRANT EXECUTE ON FUNCTION auth.uid(),private.is_admin() TO authenticated",
  "CREATE TABLE public.events(id uuid PRIMARY KEY,created_at timestamptz DEFAULT now(),title text NOT NULL,type text,city text,region text,country_code text,description text,website text,start_date date,end_date date,lat double precision,lng double precision,image_url text,validated boolean DEFAULT false,rejected boolean DEFAULT false,featured boolean DEFAULT false,verified boolean DEFAULT false,registration_force_status text,registration_note text,registration_audience text[] DEFAULT '{}',registration_url text,registration_deadline date,registration_open_date date,registration_enabled boolean DEFAULT false,source_label text,imported_source text)",
  "CREATE TABLE public.event_submission_contacts(event_id uuid PRIMARY KEY,submitter_name text,submitter_email text)",
  "GRANT SELECT,UPDATE ON public.events TO authenticated",
  "GRANT SELECT ON public.admin_users,public.event_submission_contacts TO authenticated",
  "ALTER TABLE public.events ENABLE ROW LEVEL SECURITY",
  "ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY",
  "ALTER TABLE public.event_submission_contacts ENABLE ROW LEVEL SECURITY",
  "CREATE POLICY events_admin ON public.events FOR ALL TO authenticated USING(private.is_admin()) WITH CHECK(private.is_admin())",
  "CREATE POLICY admin_self ON public.admin_users FOR SELECT TO authenticated USING(auth.uid()=user_id)",
  "CREATE POLICY contacts_admin ON public.event_submission_contacts FOR SELECT TO authenticated USING(private.is_admin())"
 ].join(";\n")+";");
 await pool.query("INSERT INTO public.admin_users VALUES($1)",[admin]);
 await pool.query("INSERT INTO public.events(id,title,type,city,region,country_code,start_date,description,validated,rejected,source_label,imported_source) VALUES($1,$2,'Dédicace','Lille','Hauts-de-France','FR','2030-12-01','Donnée fictive',false,false,'Annonce librairie','auto-matte:fixture')",[id,original]);
}
async function row(){
 return (await pool.query("SELECT title,city,validated,rejected FROM public.events WHERE id=$1",[id])).rows[0];
}
async function query(spec){
 const table=spec.table;
 if(!columnsByTable[table])throw Error("Disallowed table: "+table);
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[persona]);
  const where=[],values=[];
  for(const f of spec.filters||[]){
   const field=col(table,f.col);
   if(f.op==="eq"){values.push(f.val);where.push(field+"=$"+values.length)}
   else if(f.op==="in"){values.push(f.val);where.push(field+"=ANY($"+values.length+")")}
   else if(f.op==="is" && f.val===null)where.push(field+" IS NULL");
   else throw Error("Unknown filter: "+f.op);
  }
  if(spec.cursor)where.push("FALSE"); // Fixture holds one event: later keyset pages are empty.
  const condition=where.length?" WHERE "+where.join(" AND "):"";
  let data=null,count=null;
  if(spec.operation==="update"){
   if(table!=="events"||spec.returning!=="id"||spec.single!=="maybeSingle")
     throw Error("Event writes must return a single confirmed id");
   attempts++;
   const edits=Object.entries(spec.payload||{});
   if(!edits.length)throw Error("Empty write payload");
   const sets=edits.map(([name,value])=>{
    const key=col(table,name);values.push(value);return key+"=$"+values.length;
   });
   const result=await client.query("UPDATE public.events SET "+sets.join(",")+" "+condition+" RETURNING id",values);
   assert(result.rowCount<=1);
   data=result.rows[0]||null;
   if(data)writes++;
  }else{
   if(spec.opts?.count==="exact"){
    count=(await client.query("SELECT count(*)::int AS n FROM public."+table+condition,values)).rows[0].n;
   }
   if(!spec.opts?.head){
    const selection=(spec.columns==="*"?"*":spec.columns.split(",").map(x=>col(table,x.trim())).join(","));
    const order=(spec.orders||[]).map(x=>col(table,x.col)+(x.asc?" ASC":" DESC")).join(",");
    let sql="SELECT "+selection+" FROM public."+table+condition+(order?" ORDER BY "+order:"");
    if(spec.range){values.push(spec.range[1]-spec.range[0]+1);sql+=" LIMIT $"+values.length;values.push(spec.range[0]);sql+=" OFFSET $"+values.length}
    else if(Number.isInteger(spec.limit)){values.push(spec.limit);sql+=" LIMIT $"+values.length}
    const result=await client.query(sql,values);
    data=["single","maybeSingle"].includes(spec.single)?result.rows[0]||null:result.rows;
   }
  }
  await client.query("COMMIT");
  return {data,error:null,count,status:200};
 }catch(error){
  await client.query("ROLLBACK").catch(()=>{});
  console.error("FIXTURE QUERY FAILED",table,spec.operation||"select",error.code||"",error.message);
  return {data:null,count:null,error:{message:error.message,code:error.code||"FIXTURE_ERROR"},status:400};
 }finally{client.release()}
}
const scripts=["url-normalizer.js","admin-context.js","admin-shell.js"];
let html=fs.readFileSync("admin.html","utf8")
 .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"")
 .replace(/<link\b[^>]*>/gi,"");
html=html.replace("</head>","<style>"+fs.readFileSync("admin-v11.css","utf8")+"</style></head>")
 .replace("</body>",scripts.map(x=>'<script defer src="/'+x+'"></script>').join("")+"</body>");
try{
 await initialize();
 const baseline=await row();
 server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,"http://127.0.0.1").pathname;
  if(req.method==="GET" && pathname==="/admin.html"){
   res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(html);return;
  }
  if(req.method==="GET" && scripts.includes(pathname.slice(1))){
   res.writeHead(200,{"content-type":"text/javascript"});res.end(fs.readFileSync(pathname.slice(1)));return;
  }
  if(req.method==="POST" && pathname==="/__fixture/query"){
   try{let body="";for await(const chunk of req){body+=chunk;if(body.length>25000)throw Error("Oversized fixture request")}
    const result=await query(JSON.parse(body));
    res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(result));
   }catch(e){res.writeHead(400,{"content-type":"application/json"});res.end(JSON.stringify({error:{message:e.message}}))}
   return;
  }
  res.writeHead(404);res.end("not found");
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const origin="http://127.0.0.1:"+server.address().port;
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on("pageerror",e=>errors.push(e.message));
 await page.route("**/*",route=>{
  const dest=new URL(route.request().url());
  if(dest.origin!==origin){unexpected.push(dest.origin);return route.abort()}
  return route.continue();
 });
 await page.addInitScript(({admin})=>{
  const session={access_token:"LOCAL_FAKE_TOKEN",user:{id:admin},expires_at:Math.floor(Date.now()/1000)+3600};
  let listener;
  const auth={async getSession(){return {data:{session}}},
    async getUser(){return {data:{user:session.user}}},
    onAuthStateChange(cb){listener=cb;return {data:{subscription:{unsubscribe(){}}}}},
    async signOut(){listener?.("SIGNED_OUT",null);return {error:null}}};
  function from(table){
   const spec={table,operation:"select",columns:"*",filters:[],orders:[],opts:{},cursor:false};
   const api=new Proxy({}, {get(_x,method){
    if(method==="then")return(resolve,reject)=>fetch("/__fixture/query",{method:"POST",
      headers:{"content-type":"application/json"},body:JSON.stringify(spec)}).then(r=>r.json()).then(resolve,reject);
    if(method==="select")return(cols="*",opts={})=>{spec.columns=cols;spec.opts=opts;if(spec.operation==="update")spec.returning=cols;return api};
    if(method==="update")return(payload)=>{spec.operation="update";spec.payload=payload;return api};
    if(method==="eq")return(col,val)=>{spec.filters.push({op:"eq",col,val});return api};
    if(method==="in")return(col,val)=>{spec.filters.push({op:"in",col,val});return api};
    if(method==="is")return(col,val)=>{spec.filters.push({op:"is",col,val});if(table==="events"&&col==="created_at")spec.cursor=true;return api};
    if(method==="or")return()=>{if(table==="events")spec.cursor=true;return api};
    if(method==="order")return(col,opts={})=>{spec.orders.push({col,asc:opts.ascending===true});return api};
    if(method==="limit")return(n)=>{spec.limit=n;return api};
    if(method==="range")return(a,b)=>{spec.range=[a,b];return api};
    if(method==="single"||method==="maybeSingle")return()=>{spec.single=method;return api};
    return()=>{throw Error("Unsupported fixture method "+String(method))}
   }});
   return api;
  }
  const client={auth,from,async rpc(){throw Error("RPC calls forbidden in isolated editor fixture")}};
  window.DEDICALIVRES_CONFIG={adminV11NfcCockpitEnabled:false,adminV11CommunityArchiveEnabled:false};
  window.getDedicalivresSupabaseClient=()=>client;
  window.DEDICALIVRES_ADMIN_V11_BRIDGE={getClient:()=>client,isAuthenticated:()=>window.DEDICALIVRES_ADMIN_CONTEXT?.getState().authenticated===true};
  window.__lab={alerts:[],session};
  window.alert=s=>window.__lab.alerts.push(String(s));
  window.confirm=()=>true;
 },{admin});
 await page.goto(origin+"/admin.html",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>window.DEDICALIVRES_ADMIN_CONTEXT?.getState().status==="ready");
 await page.locator('[data-view="events"]:visible').first().click();
 await page.waitForFunction(()=>window.DEDICALIVRES_ADMIN_CONTEXT.getState().eventCatalog.status==="ready");
 await page.locator(".v11-origin-badge.is-automatte").waitFor();
  assert.equal((await page.locator(".v11-origin-badge.is-automatte").first().innerText()).trim(),"Auto-Matte");
  pass("real V11 renders attested Auto-Matte origin without implying validation");
  await page.locator("#v11-event-origin-filter").selectOption("unknown");
  await page.locator("#v11-events-empty").waitFor({state:"visible"});
  await page.locator("#v11-event-origin-filter").selectOption("automatte");
  await page.locator('[data-event-detail="'+id+'"]').first().waitFor();
  pass("real V11 origin filter hides and restores events");
  await page.locator('[data-event-detail="'+id+'"]').first().click();
 const currentUrl=page.url();
 async function save(title,city){
  await page.locator("#v11-event-edit").click();
  await page.locator("#v11-edit-title").fill(title);
  await page.locator("#v11-edit-city").fill(city);
  await page.locator("#v11-edit-save").click();
 }
 await save(edited,"Rennes");
 try {
  await page.waitForFunction(expected=>window.DEDICALIVRES_ADMIN_CONTEXT.getState().events.some(x=>x.title===expected),edited,{timeout:10000});
 } catch(error){
  const details=await page.evaluate(()=>({
   status:window.DEDICALIVRES_ADMIN_CONTEXT.getState().status,
   catalog:window.DEDICALIVRES_ADMIN_CONTEXT.getState().eventCatalog,
   eventPage:window.DEDICALIVRES_ADMIN_CONTEXT.getState().eventPage,
   alerts:window.__lab.alerts,
   title:window.DEDICALIVRES_ADMIN_CONTEXT.getState().events[0]?.title
  }));
  console.error("ISOLATED EDIT DIAGNOSTIC",JSON.stringify({details,db:await row(),attempts,writes,browserErrors:errors}));
  throw error;
 }
 assert.equal((await row()).title,edited);
 assert.equal((await row()).city,"Rennes");
 assert.equal(page.url(),currentUrl);
 pass("real V11 form changed an event in disposable PostgreSQL without full reload");
 persona=other;
 await save("Refused RLS update","Lorient");
 await page.waitForFunction(()=>window.__lab.alerts.some(x=>x.includes("Écriture non confirmée")));
 assert.equal((await row()).title,edited);
 pass("RLS denied update reports error rather than false success");
 persona=admin;
 // Failed save leaves the editor open; restore via that same visible form.
 await page.locator("#v11-edit-title").fill(original);
 await page.locator("#v11-edit-city").fill("Lille");
 await page.locator("#v11-edit-save").click();
 await page.waitForFunction(expected=>window.DEDICALIVRES_ADMIN_CONTEXT.getState().events.some(x=>x.title===expected),original);
 assert.deepEqual(await row(),baseline);
 assert.equal(attempts,3);assert.equal(writes,2);
 pass("rollback through real form restored original row: 3 attempts / 2 writes");
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
 pass("no external requests or runtime exceptions");
 fs.mkdirSync("pr278-disposable-pg-evidence",{recursive:true});
 fs.writeFileSync("pr278-disposable-pg-evidence/results.json",
   JSON.stringify({checks,attempts,writes,baseline,restored:await row(),external_requests:unexpected.length,errors},null,2));
}finally{
 await browser?.close();
 if(server)await new Promise(resolve=>server.close(resolve));
 await pool.end();
}
