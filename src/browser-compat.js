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

  // A large visual/layout viewport gap usually means the on-screen keyboard is open.
  const layoutHeight = window.innerHeight;
  const keyboardOpen = Boolean(viewport && layoutHeight - height > Math.max(160, layoutHeight * 0.22));
  root.classList.toggle("keyboard-open", keyboardOpen);
}

detectBrowser();
updateViewportVars();

window.addEventListener("resize", updateViewportVars, { passive: true });
window.addEventListener("orientationchange", () => setTimeout(updateViewportVars, 80), { passive: true });
window.visualViewport?.addEventListener("resize", updateViewportVars, { passive: true });
window.visualViewport?.addEventListener("scroll", updateViewportVars, { passive: true });

document.addEventListener("focusin", (event) => {
  if (event.target.matches?.("input,textarea,select")) setTimeout(updateViewportVars, 50);
});
document.addEventListener("focusout", () => setTimeout(updateViewportVars, 120));
