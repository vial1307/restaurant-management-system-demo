// Safari/WebKit can finish legacy auth-layer DOM reconciliation one task after
// the VPS login bridge has already mirrored the authenticated profile. Make the
// authenticated state durable across that task boundary without polling.
const AUTH_KEY = "shitu-kitchen-auth-v1";
let pending = 0;

function mirroredSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
  } catch {
    return null;
  }
}

function reconcileAuthenticatedDom() {
  pending = 0;
  const profile = mirroredSession();
  if (!profile?.id || document.documentElement.dataset.vpsAuthReady !== "true") return;

  document.body.classList.remove("auth-locked");
  document.querySelector("#auth-layer")?.remove();

  // app.js and auth-layer.js both already treat this event as the durable
  // "auth check completed" signal. Re-emitting it once on the next task gives
  // modules that finished their DOM work after the login submit a deterministic
  // opportunity to reconcile against the mirrored VPS session.
  window.dispatchEvent(new CustomEvent("shitu:vps-auth-ready"));
}

window.addEventListener("shitu:auth-synced", () => {
  if (pending || !mirroredSession()?.id) return;
  pending = window.setTimeout(reconcileAuthenticatedDom, 0);
});

window.addEventListener("shitu:auth-expired", () => {
  if (pending) window.clearTimeout(pending);
  pending = 0;
});
