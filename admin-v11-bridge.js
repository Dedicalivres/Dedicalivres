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
})();
