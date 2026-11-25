import { authorPublicFeatures } from "./author-public-features.mjs";
import { normalizeBnfRecord } from "./author-bnf-cache-policy.mjs";

// Pure preview adapter. Input decisions must ultimately come from an authenticated
// admin service, never from the browser or SRU response itself.
const ark = /^ark:\/12148\/cb[0-9]+[a-z0-9]$/i;
const clean = v => typeof v === "string" ? v.trim() : "";
const esc = v => clean(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const noticeUrl = id => "https://catalogue.bnf.fr/" + id;
export function reviewedBooks({author, presences, candidates, reviews} = {}) {
  if (!authorPublicFeatures({author,presences}).bibliographyVisible) return [];
  const groups = new Map();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const ids = candidate?.bnf_arks;
    if (candidate?.status !== "human_review_required" || !Array.isArray(ids) ||
        ids.length !== 1 || !ark.test(ids[0])) continue;
    const id = ids[0];
    const decisions = (Array.isArray(reviews) ? reviews : []).filter(r =>
      r?.authorId === author.id && r.noticeId === id);
    // Ambiguous or superseded decisions are not interpreted here.
    if (decisions.length !== 1) continue;
    const r = decisions[0];
    if (r.decision !== "approved" || !ark.test(clean(r.authorityId)) ||
        !clean(r.reviewerId) || !clean(r.evidence) ||
        !Number.isFinite(Date.parse(r.checkedAt)) ||
        !Array.isArray(candidate.titles) || !candidate.titles.includes(r.title)) continue;
    const record = normalizeBnfRecord({
      noticeId:id, noticeUrl:noticeUrl(id), authorAuthorityId:r.authorityId,
      title:r.title, verifiedMatch:true, isbn:r.isbn, publicationYear:r.year
    });
    if (!record.eligible) continue;
    // Do not infer that identical titles represent the same work. Group editions
    // only with an explicit human-reviewed work key, scoped to this author.
    const key = clean(r.workKey) ? "work:"+r.authorityId+":"+clean(r.workKey) : "notice:"+id;
    if (!groups.has(key)) groups.set(key,{title:record.title,editions:[]});
    const book = groups.get(key);
    if (!book.editions.some(e => e.noticeId === id)) book.editions.push({
      noticeId:id, noticeUrl:record.noticeUrl, publisher:clean(r.publisher),
      year:record.publicationYear, isbn:record.isbn
    });
  }
  return [...groups.values()];
}
export function renderReviewedGallery(input) {
  const books = reviewedBooks(input);
  if (!books.length) return "";
  // Text-only fallback until independently verified cover rights are implemented.
  return '<section aria-labelledby="bnf-heading"><h2 id="bnf-heading">Bibliographie</h2><p>Références issues du catalogue de la Bibliothèque nationale de France. Sélection par Dédicalivres, sans affiliation avec la BnF.</p><ul class="bnf-gallery">'+books.map(b=>'<li><h3>'+esc(b.title)+'</h3><ul>'+b.editions.map(e=>'<li>'+esc([e.publisher,e.year,e.isbn].filter(Boolean).join(" · "))+' <a href="'+esc(e.noticeUrl)+'">Voir la notice BnF</a></li>').join("")+'</ul></li>').join("")+'</ul></section>';
}
