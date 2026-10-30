"use strict";

// Presentation only: no proof, authorization, RPC or submission changes.
(function compactCanaryPanel() {
  const panel = document.getElementById("v11-canary-proof");
  if (!panel || panel.tagName !== "DETAILS") return;
  const collapse = () => { panel.open = false; };
  collapse();
  window.addEventListener("dedicalivres:admin-event-detail", collapse);
  window.addEventListener("pageshow", collapse);
  // Native validation must be able to focus a required field inside the panel.
  panel.addEventListener("invalid", () => { panel.open = true; }, true);
  const notice = document.getElementById("v11-canary-panel-feedback");
  const messages = ["v11-canary-proof-feedback", "v11-canary-direct-feedback"]
    .map(id => document.getElementById(id)).filter(Boolean);
  const showFeedback = () => {
    const hasMessage = messages.some(message => message.textContent.trim());
    if (notice) notice.hidden = !hasMessage;
    if (hasMessage) panel.open = true;
  };
  for (const message of messages) {
    new MutationObserver(showFeedback).observe(message,
      { childList: true, characterData: true, subtree: true });
  }
})();
