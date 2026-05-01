const config = window.DEDICALIVRES_CONFIG;

if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
  alert("Configuration Supabase manquante. Vérifie config.js");
  throw new Error("Configuration Supabase manquante.");
}

const supabaseClient = window.supabase.createClient(
  config.supabaseUrl,
  config.supabaseAnonKey
);

let events = [];
let selectedEvent = null;

const tableBody = document.getElementById("admin-table-body");
const searchInput = document.getElementById("search-admin");
const statusFilter = document.getElementById("filter-status");
const regionFilter = document.getElementById("filter-region");

const statTotal = document.getElementById("stat-total");
const statPending = document.getElementById("stat-pending");
const statFeatured = document.getElementById("stat-featured");

const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modal-title");
const modalDescription = document.getElementById("modal-description");

const validateBtn = document.getElementById("validate-btn");
const rejectBtn = document.getElementById("reject-btn");
const featureBtn = document.getElementBy
