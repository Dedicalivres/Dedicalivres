import fs from 'node:fs';
import {fetchPublicEvents} from './territorial-catalog.mjs';
const config = fs.readFileSync('config.js','utf8');
const url = config.match(/supabaseUrl:\s*["']([^"']+)/)[1];
const key = config.match(/supabaseAnonKey:\s*["']([^"']+)/)[1];
const events=await fetchPublicEvents({supabaseUrl:url,supabaseAnonKey:key});
fs.writeFileSync('docs/territoires/catalogue-public.json',JSON.stringify({capturedAt:new Date().toISOString(),source:'Public events API: validated=true, rejected=false; complete ID cursor pagination',events},null,2));
console.log(JSON.stringify({total:events.length,territories:events.reduce((a,e)=>{let k=[e.country_code,e.region].join('/');a[k]=(a[k]||0)+1;return a;},{})},null,2));
