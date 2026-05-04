(function () {
  const config = window.DEDICALIVRES_CONFIG;
  if (!config || !window.supabase) return;

  const client = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("login-form");
    const email = document.getElementById("login-email");
    const password = document.getElementById("login-password");
    const message = document.getElementById("login-message");

    if (!form || !email || !password) {
      console.error("Login admin introuvable : vérifie les IDs admin.html");
      return;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (message) {
        message.textContent = "Connexion en cours…";
        message.className = "message";
      }

      const { data, error } = await client.auth.signInWithPassword({
        email: email.value.trim(),
        password: password.value
      });

      if (error) {
        if (message) {
          message.textContent = error.message;
          message.className = "message error";
        }
        console.error("Erreur login admin :", error);
        return;
      }

      document.getElementById("login-view")?.classList.add("is-hidden");
      document.getElementById("admin-view")?.classList.remove("is-hidden");

      if (message) {
        message.textContent = "";
      }

      console.log("Admin connecté :", data.user?.email);
    });
  });
})();
