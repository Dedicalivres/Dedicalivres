import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {fetchPublicAuthorCatalog,renderAuthorStaticPage,renderAuthorIndexPage} from "./author-static-page.mjs";
const expected = Object.freeze(["alexandre-schoedler","delphine-seguela","dominique-jallon","gabriella-goccia","murielle-dilhuit-ouahi","nicole-dufosse","nora-edis"]);
const origin="https://dedicalivres.fr/auteurs/";
const sorted=x=>[...x].sort();
const equal=(a,b)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
const stop=message=>{throw Error("STOP preview auteurs : "+message)};
const cards=html=>[...html.matchAll(/<article class="event-card author-index-card">[\s\S]*?<\/article>/g)].map(m=>{
 const slug=m[0].match(/href="https:\/\/dedicalivres\.fr\/auteurs\/([a-z0-9-]+)\/"/)?.[1];
 if(!slug)stop("carte sans canonical");return [slug,m[0]];
});
export function preparePreview({root=process.cwd(),catalog,now=new Date()}){
 const read=p=>fs.readFileSync(path.join(root,p),"utf8");
 const oldIndex=read("auteurs/index.html"),oldSitemap=read("sitemap-seo-auteurs.xml"),template=read("author.html");
 const previous=cards(oldIndex),oldSlugs=previous.map(x=>x[0]);
 if(new Set(oldSlugs).size!==oldSlugs.length||oldSlugs.length!==19)stop("annuaire modifié depuis audit");
 const sitemapSlugs=[...oldSitemap.matchAll(/<loc>https:\/\/dedicalivres\.fr\/auteurs\/([a-z0-9-]+)\/<\/loc>/g)].map(m=>m[1]);
 if(!equal(oldSlugs,sitemapSlugs)||!oldSitemap.endsWith("</urlset>\n"))stop("sitemap inattendu");
 if(!Array.isArray(catalog)||catalog.some(r=>!r.author?.validated||!r.author?.published||r.author.merged_into||!Array.isArray(r.events)||!r.author.slug))stop("catalogue invalide");
 const slugs=catalog.map(r=>r.author.slug);
 if(new Set(slugs).size!==slugs.length||!equal(slugs,[...oldSlugs,...expected]))stop("écart dans le catalogue autorisé");
 const fresh=renderAuthorIndexPage({baseHtml:template,authors:catalog.map(r=>r.author)});
 const renderedCards=new Map(cards(fresh.html));
 const oldCards=new Map(previous);
 const newCards=fresh.authors.map(a=>oldCards.get(a.slug)||renderedCards.get(a.slug));
 if(newCards.some(c=>!c))stop("carte manquante");
 const first=oldIndex.indexOf(previous[0][1]),last=oldIndex.indexOf(previous.at(-1)[1])+previous.at(-1)[1].length;
 if(first<0||last<=first)stop("bloc annuaire introuvable");
 const index=oldIndex.slice(0,first)+newCards.join("\n")+oldIndex.slice(last);
 const day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Paris"}).format(now);
 const files=new Map([["auteurs/index.html",index]]);
 const rows=[];
 for(const slug of expected){
  const target="auteurs/"+slug+"/index.html";
  if(fs.existsSync(path.join(root,target)))stop("fiche déjà présente "+slug);
  const {author,events}=catalog.find(r=>r.author.slug===slug);
  const page=renderAuthorStaticPage({baseHtml:template,author,events,generatedAt:day});
  if(page.canonical!==origin+slug+"/")stop("canonical incorrect");
  files.set(target,page.html);
  rows.push({slug,ongoing:page.groups.ongoing.length,upcoming:page.groups.upcoming.length,past:page.groups.past.length});
 }
 const sitemap=oldSitemap.replace("</urlset>",expected.map(slug=>"  <url><loc>"+origin+slug+"/</loc><lastmod>"+day+"</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>").join("\n")+"\n</urlset>");
 files.set("sitemap-seo-auteurs.xml",sitemap);
 if(files.size!==9)stop("périmètre inattendu");
 return {files,manifest:{mode:"PREVIEW_ONLY",day,profiles:rows,existingProfilesPreserved:oldSlugs.length,files:[...files.keys()]}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const config=fs.readFileSync("config.js","utf8");
 const supabaseUrl=config.match(/supabaseUrl:\s*["']([^"']+)/)?.[1],supabaseAnonKey=config.match(/supabaseAnonKey:\s*["']([^"']+)/)?.[1];
 if(!supabaseUrl||!supabaseAnonKey)stop("configuration publique absente");
 const catalog=await fetchPublicAuthorCatalog({supabaseUrl,supabaseAnonKey});
 const {files,manifest}=preparePreview({catalog});
 const output=path.resolve(".author-preview");
 if(fs.existsSync(output))stop("dossier de sortie déjà présent");
 for(const [name,content] of files){const target=path.join(output,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content,{flag:"wx"});}
 fs.writeFileSync(path.join(output,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
 console.log(JSON.stringify(manifest,null,2));
}
