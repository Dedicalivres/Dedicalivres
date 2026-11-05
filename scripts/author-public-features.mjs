/**
 * Author public presentation rules.
 * No database mutation and no external network access.
 *
 * A published profile is always eligible for its basic page. Rich modules
 * require a verified, non-rejected presence linked to a validated event.
 * An admin-only partner designation is independent of participation.
 */
export function isConfirmedParticipation(presence) {
  const event = presence?.events;
  return Boolean(
    presence?.author_id &&
    presence?.validated === true &&
    presence?.rejected === false &&
    presence?.presence_verified === true &&
    event?.id &&
    event.validated === true &&
    event.rejected === false
  );
}

export function authorPublicFeatures({ author, presences = [] } = {}) {
  const profileVisible = author?.validated === true &&
    author?.published === true && !author?.merged_into;
  const hasParticipation = profileVisible &&
    Array.isArray(presences) && presences.some(p =>
      p?.author_id === author.id && isConfirmedParticipation(p));
  return {
    profileVisible,
    tier: !profileVisible ? "unpublished" : hasParticipation ? "participant" : "registered",
    eventsVisible: Boolean(hasParticipation),
    bibliographyVisible: Boolean(hasParticipation),
    booksVisible: Boolean(hasParticipation),
    // Only an explicit admin-controlled true value grants the designation.
    partnerBadgeVisible: Boolean(profileVisible && author?.is_partner === true)
  };
}

export const AUTHOR_REGISTERED_MESSAGE =
  "Cet auteur est référencé sur Dédicalivres, mais aucune participation à un événement littéraire n’est encore enregistrée à son nom.";
