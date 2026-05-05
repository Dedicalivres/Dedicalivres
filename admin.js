(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (!config || !window.supabase) {
    alert("Config Supabase manquante");
    return;
  }

  const supabaseClient = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const button = document.getElementById("login-button");
  const message = document.getElementById("login-message");

  const loginPanel = document.getElementById("login-panel");
  const adminPanel = document.getElementById("admin-panel");

  const logoutBtn = document.getElementById("logout-button");

  init();

  async function init() {
    const { data } = await supabaseClient.auth.getSession();

    if (data?.session) {
      showAdmin();
      loadStats();
    }
  }

  button.onclick = login;

  async function login() {
    const emailVal = email.value.trim();
    const passVal = password.value;

    if (!emailVal || !passVal) {
      setMessage("Remplis les champs", "error");
      return;
    }

    button.disabled = true;
    button.textContent = "Connexion...";

    try {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: emailVal,
        password: passVal
      });

      if (error) throw error;

      showAdmin();
      loadStats();

    } catch (err) {
      setMessage("Erreur login", "error");
    }

    button.disabled = false;
    button.textContent = "Connexion";
  }

  logoutBtn.onclick = async () => {
    await supabaseClient.auth.signOut();
    location.reload();
  };

  function showAdmin() {
    loginPanel.classList.add("hidden");
    adminPanel.classList.remove("hidden");
  }

  function setMessage(text, type) {
    message.textContent = text;
    message.className = "message " + type;
  }

  // 📊 STATS
  async function loadStats() {
    const { data, error } = await supabaseClient
      .from("site_visits")
      .select("created_at");

    if (error) return;

    const today = new Date().toISOString().slice(0,10);

    const todayCount = data.filter(v =>
      v.created_at.startsWith(today)
    ).length;

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weekCount = data.filter(v =>
      new Date(v.created_at) >= weekAgo
    ).length;

    document.getElementById("stat-today").textContent = todayCount;
    document.getElementById("stat-week").textContent = weekCount;
    document.getElementById("stat-total").textContent = data.length;
  }

})();
