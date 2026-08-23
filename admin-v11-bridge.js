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


  window.V11_WATCH_WRITE_GUARD = true;

  document.addEventListener(
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

  const watchGuardObserver =
    new MutationObserver(function () {
      document
        .querySelectorAll(
          "[data-watch-submit]"
        )
        .forEach(function (button) {
          button.disabled = true;
          button.textContent =
            "Soumission verrouillée V11";
          button.title =
            "Écriture events désactivée pendant le raccordement V11.";
        });
    });

  watchGuardObserver.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true
    }
  );

})();
