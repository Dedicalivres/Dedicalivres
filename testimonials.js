/* =========================================================
   DÉDICALIVRES — TÉMOIGNAGES PUBLICS V7.5
========================================================= */
(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;
  const grid = document.getElementById("testimonials-grid");
  const count = document.getElementById("testimonials-count");
  const form = document.getElementById("testimonial-form");
  const feedback = document.getElementById("testimonial-feedback");
  const imageInput = document.getElementById("testimonial-image-input");
  const imagePreview = document.getElementById("testimonial-image-preview");

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    console.error("Configuration Supabase manquante pour testimonials.js");
    return;
  }

  const client =
    (typeof window.getDedicalivresSupabaseClient === "function" && window.getDedicalivresSupabaseClient()) ||
    window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  if (!window.DEDICALIVRES_SUPABASE_CLIENT) {
    window.DEDICALIVRES_SUPABASE_CLIENT = client;
  }
  let selectedImage = null;

  init();

  function init() {
    loadTestimonials();
    bindForm();
    bindPreview();
  }

  async function loadTestimonials() {
    if (!grid) return;

    grid.innerHTML = `
      <article class="empty-state">
        <div class="loader"></div>
        <p>Chargement des témoignages…</p>
      </article>
    `;

    const { data, error } = await client
      .from("testimonials")
      .select("id, pseudo, message, event_title, image_url, created_at")
      .eq("validated", true)
      .eq("rejected", false)
      .order("created_at", { ascending: false })
      .limit(60);

    if (error) {
      console.warn("Témoignages indisponibles :", error);
      grid.innerHTML = `
        <article class="empty-state testimonials-empty">
          <p>Les témoignages seront bientôt disponibles.</p>
        </article>
      `;
      if (count) count.textContent = "Aucun témoignage affiché pour le moment.";
      return;
    }

    const rows = Array.isArray(data) ? data : [];

    if (count) {
      count.textContent = rows.length
        ? `${rows.length} témoignage${rows.length > 1 ? "s" : ""} publié${rows.length > 1 ? "s" : ""}`
        : "Aucun témoignage publié pour le moment.";
    }

    if (!rows.length) {
      grid.innerHTML = `
        <article class="empty-state testimonials-empty">
          <h3>Les premiers souvenirs arrivent bientôt.</h3>
          <p>Vous avez rencontré un auteur, fait signer un livre ou vécu un beau moment littéraire ? Soyez parmi les premiers à le partager avec Dédicalivres.</p>
          <p><a class="btn-primary" href="#testimonial-form">Laisser un témoignage</a></p>
        </article>
      `;
      return;
    }

    grid.innerHTML = rows.map(renderTestimonial).join("");
  }

  function renderTestimonial(row) {
    return `
      <article class="testimonial-card">
        ${row.image_url ? `<img class="testimonial-image" src="${escapeAttribute(row.image_url)}" alt="Nouvelle dédicace coup de cœur partagée par ${escapeAttribute(row.pseudo || "un lecteur")}" loading="lazy" />` : `<div class="testimonial-image-placeholder">📖</div>`}
        <div class="testimonial-card-body">
          <div class="card-tags">
            <span class="badge badge-price">Témoignage</span>
            ${row.event_title ? `<span class="badge">${escapeHtml(row.event_title)}</span>` : ""}
          </div>
          <blockquote>${escapeHtml(row.message || "")}</blockquote>
          <p class="testimonial-author">— ${escapeHtml(row.pseudo || "Lecteur Dédicalivres")}</p>
        </div>
      </article>
    `;
  }

  function bindPreview() {
    if (!imageInput || !imagePreview) return;

    imageInput.addEventListener("change", () => {
      const file = imageInput.files?.[0];

      if (!file) {
        selectedImage = null;
        imagePreview.innerHTML = "";
        imagePreview.classList.remove("is-visible");
        return;
      }

      if (!file.type.startsWith("image/")) {
        setFeedback("Veuillez sélectionner une image.", "error");
        imageInput.value = "";
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setFeedback("Image trop lourde : 5 Mo maximum.", "error");
        imageInput.value = "";
        return;
      }

      selectedImage = file;
      const reader = new FileReader();
      reader.onload = (event) => {
        const previewUrl = escapeAttribute(event.target.result);
        const previewName = escapeHtml(file.name);

        imagePreview.innerHTML = `
          <div class="image-preview-intro">
            <strong>Votre photo reste un souvenir, pas une obligation</strong>
            <p>Elle sera affichée avec douceur pour accompagner votre texte sans le voler.</p>
          </div>

          <figure class="image-preview-example image-preview-card testimonial-preview-card">
            <figcaption>Aperçu du témoignage</figcaption>
            <img src="${previewUrl}" alt="Prévisualisation de votre souvenir" />
            <small>${previewName}</small>
          </figure>
        `;
        imagePreview.classList.add("is-visible");
      };
      reader.readAsDataURL(file);
    });
  }

  function bindForm() {
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const submitButton = form.querySelector('button[type="submit"]');
      const formData = new FormData(form);

      const pseudo = cleanText(formData.get("pseudo"));
      const email = cleanText(formData.get("email")).toLowerCase();
      const eventTitle = cleanText(formData.get("event_title"));
      const message = cleanText(formData.get("message"));

      if (formData.get("legal_accept") !== "on") {
        setFeedback("Merci de valider l’autorisation de relecture, modération et publication avant l’envoi.", "error");
        return;
      }

      if (pseudo.length < 2) {
        setFeedback("Merci d’indiquer un prénom ou pseudo.", "error");
        return;
      }

      if (!isValidEmail(email)) {
        setFeedback("Merci d’indiquer une adresse email valide.", "error");
        return;
      }

      if (message.length < 20) {
        setFeedback("Votre témoignage est un peu court. Ajoutez quelques mots sur votre expérience.", "error");
        return;
      }

      try {
        setButtonLoading(submitButton, true, "Envoi en cours…");
        setFeedback("Envoi de votre témoignage…", "");

        let imageUrl = null;
        if (selectedImage) {
          imageUrl = await uploadImage(selectedImage);
        }

        const { error } = await client.from("testimonials").insert([{
          pseudo,
          email,
          event_title: eventTitle || null,
          message,
          image_url: imageUrl,
          validated: false,
          rejected: false
        }]);

        if (error) throw error;

        form.reset();
        selectedImage = null;
        if (imagePreview) {
          imagePreview.innerHTML = "";
          imagePreview.classList.remove("is-visible");
        }

        setFeedback("Merci, votre souvenir a bien été transmis. Il sera relu avec soin avant publication.", "success");
      } catch (error) {
        console.error("Erreur témoignage :", error);
        setFeedback("Impossible d’envoyer le souvenir pour le moment. Réessayez dans quelques instants.", "error");
      } finally {
        setButtonLoading(submitButton, false, "Partager mon souvenir");
      }
    });
  }


async function uploadImage(file) {
  const compressed = await compressImage(file);

  if (shouldUseR2Upload()) {
    try {
      return await uploadImageToR2(compressed, "testimonial-images");
    } catch (error) {
      console.warn("Upload R2 indisponible, fallback Supabase Storage :", error);
    }
  }

  return uploadImageToSupabase(compressed, "testimonial-images");
}

function shouldUseR2Upload() {
  return (
    config?.imageUploadProvider === "r2" &&
    typeof config.imageUploadEndpoint === "string" &&
    config.imageUploadEndpoint.trim().startsWith("http")
  );
}

async function uploadImageToR2(file, folder) {
  const formData = new FormData();
  formData.append("file", file, file.name || "image.jpg");
  formData.append("folder", folder);

  const response = await fetch(config.imageUploadEndpoint, {
    method: "POST",
    body: formData
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.url) {
    throw new Error(result.error || "Upload R2 impossible.");
  }

  return result.url;
}

async function uploadImageToSupabase(file, bucket) {
  const fileName = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.jpg`;

  const { error } = await client.storage
    .from(bucket)
    .upload(fileName, file, {
      cacheControl: "2592000",
      upsert: false
    });

  if (error) throw error;

  const { data } = client.storage
    .from(bucket)
    .getPublicUrl(fileName);

  return data.publicUrl;
}

async function compressImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxSize = 1400;
      const ratio = Math.min(1, maxSize / img.width, maxSize / img.height);

      canvas.width = Math.max(1, Math.round(img.width * ratio));
      canvas.height = Math.max(1, Math.round(img.height * ratio));

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);

          if (!blob) {
            resolve(file);
            return;
          }

          resolve(
            new File([blob], `${Date.now()}-${Math.random()
              .toString(36)
              .slice(2)}.jpg`, {
              type: "image/jpeg"
            })
          );
        },
        "image/jpeg",
        0.82
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

function setFeedback(message, type) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.className = `form-feedback ${type || ""}`;
  }

  function setButtonLoading(button, loading, text) {
    if (!button) return;
    button.disabled = loading;
    button.textContent = text;
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
