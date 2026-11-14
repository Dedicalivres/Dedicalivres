/**
 * Read-only rollout audit. Inputs are plain records already fetched by the
 * caller; this module performs no database writes or network requests.
 */
export function auditAuthorTierRollout(rows) {
  if (!Array.isArray(rows)) throw new TypeError("Expected author audit rows");
  const report = { total:0, published:0, approvedButUnverified:[], verifiedParticipants:[], registered:[], ambiguous:[] };
  for (const row of rows) {
    if (!row?.slug || !Number.isInteger(Number(row.approved_links)) ||
        !Number.isInteger(Number(row.verified_links))) {
      report.ambiguous.push(row?.slug || "(unknown)");
      continue;
    }
    report.total++;
    if (row.published === true) report.published++;
    const approved = Number(row.approved_links), verified = Number(row.verified_links);
    if (approved < 0 || verified < 0 || verified > approved) {
      report.ambiguous.push(row.slug);
    } else if (verified > 0) {
      report.verifiedParticipants.push(row.slug);
    } else if (approved > 0) {
      report.approvedButUnverified.push({ slug:row.slug, approved });
    } else {
      report.registered.push(row.slug);
    }
  }
  report.safeToEnableStrictTiering = report.ambiguous.length === 0 &&
    report.approvedButUnverified.length === 0;
  return report;
}
