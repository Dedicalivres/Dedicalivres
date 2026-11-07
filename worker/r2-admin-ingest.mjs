/*
 * Dédicalivres — opt-in R2 admin image ingestion gateway.
 * NOT deployed by this source file. No service-role credentials required.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class Rejection extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const reject = (status, code) => { throw new Rejection(status, code); };
const readU32LE = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] * 16777216)) >>> 0;
const readU32BE = (b, i) => (b[i] * 16777216 + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]) >>> 0;
const ascii = (bytes, begin, end) => String.fromCharCode(...bytes.subarray(begin, end));

// Validate signatures and reject metadata remnants, including EXIF/XMP/IPTC.
export function inspectImage(bytes, mime) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || !Object.hasOwn(MIME_EXTENSIONS, mime)) reject(415, "invalid_image_type");
  if (mime === "image/jpeg") {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) reject(415, "image_signature_mismatch");
    let i = 2, sawScan = false;
    while (i + 3 < bytes.length) {
      if (bytes[i] !== 0xff) reject(415, "invalid_jpeg_segments");
      while (bytes[i] === 0xff) i++;
      const marker = bytes[i++];
      if (marker === 0xda) { sawScan = true; break; }
      if (marker === 0xd9) break;
      if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
      if (i + 2 > bytes.length) reject(415, "invalid_jpeg_segments");
      const len = (bytes[i] << 8) | bytes[i + 1];
      if (len < 2 || i + len > bytes.length) reject(415, "invalid_jpeg_segments");
      if (marker === 0xe1 || marker === 0xed || marker === 0xfe) reject(422, "remove_image_metadata");
      i += len;
    }
    if (!sawScan || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) reject(415, "invalid_jpeg_data");
  } else if (mime === "image/png") {
    const sig = [137,80,78,71,13,10,26,10];
    if (!sig.every((v,i) => bytes[i] === v)) reject(415, "image_signature_mismatch");
    let i = 8, sawIHDR = false, sawIEND = false;
    while (i + 12 <= bytes.length) {
      const len = readU32BE(bytes, i), kind = ascii(bytes, i + 4, i + 8);
      if (i + 12 + len > bytes.length) reject(415, "invalid_png_chunks");
      if (!sawIHDR && (kind !== "IHDR" || len !== 13)) reject(415, "invalid_png_chunks");
      if (kind === "IHDR") sawIHDR = true;
      if (["eXIf", "tEXt", "iTXt", "zTXt"].includes(kind)) reject(422, "remove_image_metadata");
      i += 12 + len;
      if (kind === "IEND") { sawIEND = true; break; }
    }
    if (!sawIHDR || !sawIEND || i !== bytes.length) reject(415, "invalid_png_chunks");
  } else {
    if (ascii(bytes,0,4) !== "RIFF" || ascii(bytes,8,12) !== "WEBP" || readU32LE(bytes,4) + 8 !== bytes.length) reject(415, "image_signature_mismatch");
    let i = 12, sawImage = false;
    while (i + 8 <= bytes.length) {
      const kind = ascii(bytes,i,i+4), len = readU32LE(bytes,i+4);
      if (i + 8 + len > bytes.length) reject(415, "invalid_webp_chunks");
      if (["EXIF", "XMP "].includes(kind)) reject(422, "remove_image_metadata");
      if (["VP8 ", "VP8L", "VP8X"].includes(kind)) sawImage = true;
      i += 8 + len + (len % 2);
    }
    if (!sawImage || i !== bytes.length) reject(415, "invalid_webp_chunks");
  }
  return MIME_EXTENSIONS[mime];
}


// Strip removable JPEG/PNG metadata before storage; preserve actual compressed image bytes.
// WEBP with EXIF/XMP is rejected (rewriting its VP8X flags would require a transcoder).
export function sanitizeImage(bytes, mime) {
  if (mime === "image/jpeg") {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) reject(415,"image_signature_mismatch");
    const parts = [bytes.subarray(0,2)];
    let pos = 2, foundScan = false;
    while (pos + 3 < bytes.length) {
      const markerStart = pos;
      if (bytes[pos] !== 0xff) reject(415,"invalid_jpeg_segments");
      while (bytes[pos] === 0xff) pos++;
      const marker = bytes[pos++];
      if (marker === 0xda) { parts.push(bytes.subarray(markerStart)); foundScan = true; break; }
      if (marker === 0xd9) break;
      if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        parts.push(bytes.subarray(markerStart,pos)); continue;
      }
      if (pos + 2 > bytes.length) reject(415,"invalid_jpeg_segments");
      const size = (bytes[pos] << 8) | bytes[pos + 1];
      if (size < 2 || pos + size > bytes.length) reject(415,"invalid_jpeg_segments");
      if (![0xe1,0xed,0xfe].includes(marker)) parts.push(bytes.subarray(markerStart,pos+size));
      pos += size;
    }
    if (!foundScan) reject(415,"invalid_jpeg_data");
    const size = parts.reduce((n,part)=>n+part.length,0);
    const safe = new Uint8Array(size); let i=0;
    for (const part of parts) { safe.set(part,i);i+=part.length; }
    inspectImage(safe,mime);
    return safe;
  }
  if (mime === "image/png") {
    if (bytes.length < 20) reject(415,"invalid_png_chunks");
    const parts = [bytes.subarray(0,8)]; let pos = 8, sawEnd=false;
    while (pos + 12 <= bytes.length) {
      const size = readU32BE(bytes,pos), kind=ascii(bytes,pos+4,pos+8);
      if (pos + 12 + size > bytes.length) reject(415,"invalid_png_chunks");
      if (!["eXIf","tEXt","iTXt","zTXt"].includes(kind)) parts.push(bytes.subarray(pos,pos+12+size));
      pos += 12+size;
      if (kind==="IEND") {sawEnd=true;break;}
    }
    if (!sawEnd || pos !== bytes.length) reject(415,"invalid_png_chunks");
    const total=parts.reduce((n,part)=>n+part.length,0), safe=new Uint8Array(total);let i=0;
    for (const part of parts) {safe.set(part,i);i+=part.length;}
    inspectImage(safe,mime);
    return safe;
  }
  inspectImage(bytes,mime);
  return bytes;
}

async function readBounded(body, limit) {
  if (!body) reject(400, "missing_image");
  const reader = body.getReader(), chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) { await reader.cancel(); reject(413, "image_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!total) reject(400, "empty_image");
  const bytes = new Uint8Array(total); let offset = 0;
  for (const part of chunks) { bytes.set(part,offset); offset += part.byteLength; }
  return bytes;
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
}
function cors(origin, env) {
  const headers = new Headers({ "Vary": "Origin", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  if (origin && allowedOrigins(env).includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Max-Age", "600");
  }
  return headers;
}
function json(payload, status, headers) {
  const h = new Headers(headers); h.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { status, headers: h });
}

async function authorize(headers, env, fetchImpl) {
  const authorization = headers.get("Authorization") || "";
  const tokenMatch = /^Bearer ([A-Za-z0-9._~+\/-]{20,4096})$/.exec(authorization);
  if (!tokenMatch) reject(401, "admin_session_required");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL || "") || !env.SUPABASE_PUBLISHABLE_KEY) reject(503, "auth_config_unavailable");
  const forwarded = { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization, Accept: "application/json" };
  let identity, admin;
  try {
    const userResponse = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/user`, { method: "GET", headers: forwarded, signal: AbortSignal.timeout(8000) });
    if (userResponse.status === 401 || userResponse.status === 403) reject(401,"admin_session_required");
    if (!userResponse.ok) reject(503,"auth_server_unavailable");
    identity = await userResponse.json();
    if (!UUID.test(identity?.id || "") || identity?.is_anonymous === true) reject(401,"admin_session_required");
    const u = new URL(`${env.SUPABASE_URL}/rest/v1/admin_users`);
    u.searchParams.set("select", "user_id");
    u.searchParams.set("user_id", `eq.${identity.id}`);
    u.searchParams.set("limit", "1");
    const roleResponse = await fetchImpl(u.toString(), { method: "GET", headers: forwarded, signal: AbortSignal.timeout(8000) });
    if (!roleResponse.ok) reject(503,"admin_check_unavailable");
    admin = await roleResponse.json();
  } catch (e) { if (e instanceof Rejection) throw e; reject(503,"auth_server_unavailable"); }
  if (!Array.isArray(admin) || admin.length !== 1 || admin[0]?.user_id !== identity.id) reject(403,"admin_only");
  return identity.id;
}

export async function handleRequest(request, env, options = {}) {
  const origin = request.headers.get("Origin"), headers = cors(origin,env), path = new URL(request.url).pathname;
  if (origin && !allowedOrigins(env).includes(origin)) return json({ error: "origin_not_allowed" },403,headers);
  if (path !== "/upload") return json({error:"not_found"},404,headers);
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers});
  if (request.method !== "POST") return json({error:"method_not_allowed"},405,headers);
  try {
    if (!env.UPLOAD_BUCKET?.put || !env.UPLOAD_RATE_LIMIT?.limit || !env.R2_PUBLIC_BASE_URL) reject(503,"upload_not_configured");
    const userId = await authorize(request.headers, env, options.fetchImpl || fetch);
    const rate = await env.UPLOAD_RATE_LIMIT.limit({key:userId});
    if (!rate?.success) reject(429,"rate_limit_exceeded");
    const mime = (request.headers.get("Content-Type") || "").trim().toLowerCase();
    if (!Object.hasOwn(MIME_EXTENSIONS, mime)) reject(415,"invalid_image_type");
    const size = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(size) && size > MAX_UPLOAD_BYTES) reject(413,"image_too_large");
    const bytes = await readBounded(request.body, MAX_UPLOAD_BYTES);
    const safeBytes = sanitizeImage(bytes,mime);
    const ext = inspectImage(safeBytes,mime);
    const date = options.now || new Date();
    const uid = (options.uuid || crypto.randomUUID)();
    if (!UUID.test(uid)) reject(503,"invalid_generated_key");
    const key = `event-images/${date.getUTCFullYear()}/${String(date.getUTCMonth()+1).padStart(2,"0")}/${uid}.${ext}`;
    const base = new URL(env.R2_PUBLIC_BASE_URL);
    if (base.protocol !== "https:" || base.search || base.hash || base.username || base.password) reject(503,"invalid_public_base_url");
    const object = await env.UPLOAD_BUCKET.put(key,safeBytes,{
      httpMetadata:{contentType:mime,cacheControl:"public, max-age=31536000, immutable"},
      customMetadata:{source:"dedicalivres-admin-r2"}
    });
    if (!object) reject(503,"storage_write_failed");
    return json({url:`${base.origin}${base.pathname.replace(/\/$/,"")}/${key}`,key,size:safeBytes.byteLength,contentType:mime},201,headers);
  } catch(e) {
    if (e instanceof Rejection) return json({error:e.code},e.status,headers);
    return json({error:"upload_unavailable"},503,headers);
  }
}

export default { fetch(request, env) { return handleRequest(request, env); } };
