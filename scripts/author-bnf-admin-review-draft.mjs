/**
 * Isolated Admin V11 bibliography review draft contract.
 * Pure validation, no database access, authentication, approval or publication.
 * A future authenticated server must reload the source records, authorize the
 * reviewer, check the canonical authority, detect concurrent changes and
 * persist the actual human decision. Never feed these drafts to the gallery.
 */
const ark = /^ark:\/12148\/cb[0-9]+[a-z0-9]$/i;
const clean = v => typeof v === "string" ? v.trim() : "";
const actions = new Set(["approve", "request_information", "reject"]);

export function prepareBnfReviewDraft({authorId, candidates, selections, action, authorityId, evidence, authorityConfirmed, roleConfirmed} = {}) {
  const fail = reason => ({ok:false, reason, publicationAllowed:false});
  if (!clean(authorId) || !actions.has(action)) return fail("invalid_context");
  if (!Array.isArray(selections) || !selections.length || selections.length > 50 ||
      !Array.isArray(candidates)) return fail("invalid_selection");
  if (!clean(evidence) || clean(evidence).length > 2000) return fail("evidence_required");
  if (action === "approve" && (!ark.test(clean(authorityId)) ||
      authorityConfirmed !== true || roleConfirmed !== true)) return fail("identity_and_role_confirmation_required");
  const seen = new Set();
  const items = [];
  for (const selection of selections) {
    const noticeId = clean(selection?.noticeId);
    const title = clean(selection?.title);
    if (!ark.test(noticeId) || seen.has(noticeId.toLowerCase()) || !title) return fail("invalid_or_duplicate_notice");
    seen.add(noticeId.toLowerCase());
    const matches = candidates.filter(c => c?.status === "human_review_required" &&
      Array.isArray(c.bnf_arks) && c.bnf_arks.length === 1 &&
      c.bnf_arks[0] === noticeId && Array.isArray(c.titles) && c.titles.includes(title));
    if (matches.length !== 1) return fail("missing_or_ambiguous_candidate");
    items.push({noticeId, title, sourceUrl:"https://catalogue.bnf.fr/"+noticeId});
  }
  return {ok:true, status:"draft_only", action, authorId:clean(authorId),
    authorityId:action === "approve" ? clean(authorityId) : null,
    evidence:clean(evidence), items, publicationAllowed:false};
}
