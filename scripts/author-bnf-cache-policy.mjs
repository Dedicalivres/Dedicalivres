/**
 * Normalize a bibliographic candidate before storing it in a private BnF cache.
 * This module does not call BnF or authorize any image reuse.
 * Only an explicitly verified authority + notice match may be displayed.
 */
const clean = value => typeof value === "string" ? value.trim() : "";
export function normalizeBnfRecord(input) {
  const noticeUrl = clean(input?.noticeUrl);
  const authorAuthorityId = clean(input?.authorAuthorityId);
  const title = clean(input?.title);
  const noticeId = clean(input?.noticeId);
  const verifiedMatch = input?.verifiedMatch === true;
  let officialNotice = false;
  try {
    const url = new URL(noticeUrl);
    officialNotice = url.protocol === "https:" &&
      (url.hostname === "catalogue.bnf.fr" || url.hostname === "data.bnf.fr");
  } catch { /* Not an official notice URL. */ }
  if (!officialNotice || !noticeId || !authorAuthorityId || !title) {
    return { eligible: false, reason: "missing_verified_bibliographic_identity" };
  }
  return {
    eligible: verifiedMatch,
    reason: verifiedMatch ? null : "author_match_needs_review",
    cacheKey: `bnf:${authorAuthorityId}:${noticeId}`,
    noticeId,
    noticeUrl,
    authorAuthorityId,
    title,
    isbn: clean(input?.isbn) || null,
    publicationYear: clean(input?.publicationYear) || null,
    // No cover is published until an independent rights check is recorded.
    coverUrl: input?.coverReuseAuthorized === true ? clean(input.coverUrl) || null : null,
    source: "Bibliothèque nationale de France"
  };
}
