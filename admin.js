const client = supabase.createClient(
  window.DEDICALIVRES_CONFIG.supabaseUrl,
  window.DEDICALIVRES_CONFIG.supabaseAnonKey
);

const loginSection = document.getElementById("login");
const adminSection = document.getElementById("admin");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const list = document.getElementById("list");

let events = [];

// LOGIN
loginBtn.onclick = async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    document.getElementById("loginMsg").textContent = error.message;
  } else {
    initAdmin();
  }
};

logoutBtn.onclick = async () => {
  await client.auth.signOut();
  location.reload();
};

// INIT
async function initAdmin() {
  loginSection.classList.add("hidden");
  adminSection.classList.remove("hidden");
  loadEvents();
}

// LOAD EVENTS
async function loadEvents() {
  const { data } = await client.from("events").select("*").order("created_at", { ascending:false });
  events = data || [];
  render();
}

// RENDER
function render() {
  const status = document.getElementById("status").value;
  const search = document.getElementById("search").value.toLowerCase();

  let filtered = events.filter(e => {
    if (status === "pending") return !e.validated && !e.rejected;
    if (status === "published") return e.validated;
    return true;
  });

  filtered = filtered.filter(e =>
    (e.title || "").toLowerCase().includes(search)
  );

  // stats
  document.getElementById("pending").textContent =
    events.filter(e => !e.validated && !e.rejected).length;

  document.getElementById("published").textContent =
    events.filter(e => e.validated).length;

  document.getElementById("total").textContent = events.length;

  list.innerHTML = filtered.map(e => `
    <div class="card">
      <h3>${e.title}</h3>
      <p>${e.city || ""}</p>

      <div class="actions">
        <button class="validate" onclick="validate('${e.id}')">Valider</button>
        <button class="reject" onclick="reject('${e.id}')">Refuser</button>
      </div>
    </div>
  `).join("");
}

// ACTIONS
window.validate = async (id) => {
  await client.from("events").update({
    validated:true,
    rejected:false
  }).eq("id", id);

  loadEvents();
};

window.reject = async (id) => {
  await client.from("events").update({
    validated:false,
    rejected:true
  }).eq("id", id);

  loadEvents();
};

// FILTERS
document.getElementById("status").onchange = render;
document.getElementById("search").oninput = render;

// AUTO LOGIN
client.auth.getSession().then(({ data }) => {
  if (data.session) initAdmin();
});
