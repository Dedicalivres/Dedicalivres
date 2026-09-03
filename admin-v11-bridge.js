"use strict";

(function createV11LegacyBridge() {
  const context = window.DEDICALIVRES_ADMIN_CONTEXT;

  if (!context) {
    console.error("V11 bridge : contexte admin absent");
    return;
  }

  let authenticatedEventSent = false;

  function exposeState(state) {
    const authenticated =
      state.authenticated === true &&
      state.status !== "unauthenticated";

    window.DEDICALIVRES_ADMIN_AUTHENTICATED =
      authenticated;

    if (
      authenticated &&
      !authenticatedEventSent
    ) {
      authenticatedEventSent = true;

      window.dispatchEvent(
        new CustomEvent(
          "dedicalivres:admin-authenticated",
          {
            detail: {
              source: "admin-v11"
            }
          }
        )
      );
    }

    if (!authenticated) {
      authenticatedEventSent = false;
    }
  }

  context.subscribe(exposeState);

  window.DEDICALIVRES_ADMIN_V11_BRIDGE = {
    version: "11.16",
    getClient() {
      return context.getClient();
    },
    getState() {
      return context.getState();
    },
    isAuthenticated() {
      return (
        context.getState().authenticated === true
      );
    }
  };


  const watchSubmissionEnabled =
    window.DEDICALIVRES_CONFIG
      ?.adminV11WatchSubmissionEnabled === true;

  window.V11_WATCH_WRITE_GUARD = !watchSubmissionEnabled;

  if (window.V11_WATCH_WRITE_GUARD) document.addEventListener(
    "click",
    function (event) {
      const submit =
        event.target.closest?.(
          "[data-watch-submit]"
        );

      if (!submit) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      window.alert(
        "Création de soumission verrouillée dans Admin V11.\n\nL’analyse et la copie restent disponibles."
      );
    },
    true
  );

  function lockWatchSubmitButton(button) {
    if (!button || button.dataset.v11Locked === "true") {
      return;
    }

    button.dataset.v11Locked = "true";
    button.disabled = true;
    button.textContent =
      "Soumission verrouillée V11";
    button.title =
      "Écriture events désactivée pendant le raccordement V11.";
  }

  if (window.V11_WATCH_WRITE_GUARD) {
    document.querySelectorAll("[data-watch-submit]").forEach(lockWatchSubmitButton);
  }

  const watchGuardObserver =
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (!(node instanceof Element)) {
            return;
          }

          if (node.matches?.("[data-watch-submit]")) {
            lockWatchSubmitButton(node);
          }

          node
            .querySelectorAll?.("[data-watch-submit]")
            .forEach(lockWatchSubmitButton);
        });
      });
    });

  if (window.V11_WATCH_WRITE_GUARD) {
    watchGuardObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

})();
