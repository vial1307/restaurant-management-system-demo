function detectBrowser() {
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const line = /Line\//i.test(ua);
  const facebook = /FBAN|FBAV|FB_IAB/i.test(ua);
  const instagram = /Instagram/i.test(ua);
  const wechat = /MicroMessenger/i.test(ua);
  const android = /Android/i.test(ua);
  const safari = ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  const inapp = line || facebook || instagram || wechat;

  const root = document.documentElement;
  root.classList.toggle("browser-ios", ios);
  root.classList.toggle("browser-android", android);
  root.classList.toggle("browser-safari", safari);
  root.classList.toggle("browser-inapp", inapp);
  root.classList.toggle("browser-line", line);
  root.classList.toggle("browser-facebook", facebook);
  root.classList.toggle("browser-instagram", instagram);
  root.classList.toggle("browser-wechat", wechat);
}

function updateViewportVars() {
  const viewport = window.visualViewport;
  const width = viewport?.width || window.innerWidth;
  const height = viewport?.height || window.innerHeight;
  const root = document.documentElement;
  root.style.setProperty("--app-vh", `${height * 0.01}px`);
  root.style.setProperty("--visual-height", `${height}px`);
  root.style.setProperty("--visual-width", `${width}px`);
  root.style.setProperty("--visual-offset-top", `${viewport?.offsetTop || 0}px`);

  // A large visual/layout viewport gap usually means the on-screen keyboard is open.
  const layoutHeight = window.innerHeight;
  const keyboardOpen = Boolean(viewport && layoutHeight - height > Math.max(160, layoutHeight * 0.22));
  root.classList.toggle("keyboard-open", keyboardOpen);
}

detectBrowser();
updateViewportVars();

let viewportFrame = 0;
function scheduleViewportUpdate() {
  if (viewportFrame) return;
  viewportFrame = requestAnimationFrame(() => {
    viewportFrame = 0;
    updateViewportVars();
  });
}

window.addEventListener("resize", scheduleViewportUpdate, { passive: true });
window.addEventListener("orientationchange", () => setTimeout(scheduleViewportUpdate, 80), { passive: true });
window.visualViewport?.addEventListener("resize", scheduleViewportUpdate, { passive: true });
window.visualViewport?.addEventListener("scroll", scheduleViewportUpdate, { passive: true });

let focusedControlTimer = 0;

function keepFocusedModalControlVisible(target) {
  if (!target?.matches?.(".ingredient-modal input, .ingredient-modal select, .ingredient-modal textarea, .account-modal input, .account-modal select, .account-modal textarea")) return;
  clearTimeout(focusedControlTimer);
  focusedControlTimer = window.setTimeout(() => {
    if (!target.isConnected) return;
    updateViewportVars();
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }, 280);
}

document.addEventListener("focusin", (event) => {
  if (!event.target.matches?.("input,textarea,select")) return;
  setTimeout(updateViewportVars, 50);
  keepFocusedModalControlVisible(event.target);
  // iOS Safari finishes moving the visual viewport after the keyboard animation.
  if (document.documentElement.classList.contains("browser-ios")) {
    setTimeout(() => keepFocusedModalControlVisible(event.target), 420);
  }
});
document.addEventListener("focusout", () => setTimeout(updateViewportVars, 120));

window.visualViewport?.addEventListener("resize", () => {
  const active = document.activeElement;
  if (document.documentElement.classList.contains("keyboard-open")) {
    keepFocusedModalControlVisible(active);
  }
}, { passive: true });

window.addEventListener("shitu:business-state-status", (event) => {
  if (event.detail?.status !== "switch-blocked") return;
  window.alert?.(
    "無法切換分店：目前變更尚未儲存至伺服器。請確認網路後再試。\n" +
    "Không thể đổi chi nhánh: thay đổi hiện tại chưa được lưu lên máy chủ. Hãy kiểm tra mạng và thử lại."
  );
});
