(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (!config || !window.supabase) {
    console.error("Config Supabase manquante");
    return;
  }

  const supabaseClient = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginButton = document.getElementById("login-button");
  const message = document.getElementById("login-message");

  const loginPanel = document.getElementById("login-panel");
  const adminPanel = document.getElementById("admin-panel");

  // 🔐 Vérifie si déjà connecté
  checkSession();

  async function checkSession() {
    const { data } = await supabaseClient.auth.getSession();

    if (data?.session) {
      showAdmin();
    } else {
      showLogin();
    }
  }

  function showAdmin() {
    loginPanel.classList.add("hidden");
    adminPanel.classList.remove("hidden");
  }

  function showLogin() {
    loginPanel.classList.remove("hidden");
    adminPanel.classList.add("hidden");
  }

  // 🎯 LOGIN
  if (loginButton) {
    loginButton.addEventListener("click", handleLogin);
  }

  async function handleLogin() {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      setMessage("Veuillez remplir tous les champs", "error");
      return;
    }

    setMessage("Connexion en cours...", "");

    loginButton.disabled = true;

    try {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      setMessage("Connexion réussie", "success");

      showAdmin();

    } catch (err) {
      console.error(err);
      setMessage("Identifiants incorrects", "error");
    } finally {
      loginButton.disabled = false;
    }
  }

  // 🔓 LOGOUT
  const logoutButton = document.getElementById("logout-button");

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      await supabaseClient.auth.signOut();
      location.reload();
    });
  }

  function setMessage(text, type) {
    if (!message) return;

    message.textContent = text;
    message.className = "message " + (type || "");
  }
})();
