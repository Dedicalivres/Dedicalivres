(function exposeAuthorPublication(root) {
  "use strict";

  const PUBLIC_FIELDS = [
    "id", "pseudo", "slug", "website", "bio", "avatar_url", "location",
    "shop_url", "profile_type", "validated", "created_at", "merged_into",
    "published", "published_at"
  ].join(", ");

  function publicationBlockers(author, readinessStatus, globalEnabled) {
    const blockers = [];
    if (globalEnabled !== true) blockers.push("Publication publique désactivée");
    if (!author) return [...blockers, "Fiche auteur absente"];
    if (author.validated !== true) blockers.push("Identité non validée");
    if (author.publication_ready !== true) blockers.push("Fiche non marquée prête en base");
    if (author.editorial_status !== "READY") blockers.push("Statut éditorial serveur non READY");
    if (readinessStatus !== "READY") blockers.push(`Statut calculé ${readinessStatus || "INCOMPLETE"}`);
    if (author.merged_into) blockers.push("Fiche fusionnée");
    return blockers;
  }

  function isPubliclyAvailable(author) {
    return Boolean(
      author &&
      author.published === true &&
      author.validated === true &&
      author.publication_ready === true &&
      author.editorial_status === "READY" &&
      !author.merged_into
    );
  }

  function createController() {
    let running = false;

    return {
      isRunning: () => running,
      async setPublished({ client, author, publish, adminId, readinessStatus, globalEnabled, now = new Date() }) {
        if (running) return { skipped: true, reason: "running" };
        if (!client || !author?.id || !adminId) throw new Error("Session ou fiche auteur indisponible.");

        if (publish) {
          const blockers = publicationBlockers(author, readinessStatus, globalEnabled);
          if (blockers.length) throw new Error(blockers.join(" · "));
        }

        running = true;
        try {
          const timestamp = now.toISOString();
          const payload = publish
            ? { published: true, published_at: timestamp, published_by: adminId, updated_at: timestamp }
            : { published: false, published_at: null, published_by: null, updated_at: timestamp };

          let query = client.from("authors").update(payload).eq("id", author.id);
          if (publish) {
            query = query
              .eq("validated", true)
              .eq("publication_ready", true)
              .eq("editorial_status", "READY")
              .is("merged_into", null);
          }

          const result = await query
            .select("id, published, published_at, publication_ready, editorial_status")
            .maybeSingle();

          if (result.error) throw result.error;
          if (!result.data || result.data.published !== publish) {
            throw new Error("La base a refusé la transition de publication.");
          }
          return { skipped: false, data: result.data };
        } finally {
          running = false;
        }
      }
    };
  }

  root.DEDICALIVRES_AUTHOR_PUBLICATION = {
    PUBLIC_FIELDS,
    publicationBlockers,
    isPubliclyAvailable,
    createController
  };
})(typeof window !== "undefined" ? window : globalThis);
