const innerHtmlDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
const nativeGetInnerHtml = innerHtmlDescriptor?.get;
const nativeSetInnerHtml = innerHtmlDescriptor?.set;

function directChild(parent, selector) {
  return [...(parent?.children || [])].find((child) => child.matches?.(selector)) || null;
}

function replaceSection(current, next) {
  if (!current || !next) return false;
  if (current.outerHTML === next.outerHTML) return true;
  current.replaceWith(next);
  return true;
}

function nativeReplace(host, markup) {
  nativeSetInnerHtml.call(host, markup);
}

function signalRootChildMutation(host) {
  // auth-layer intentionally observes direct #app child mutations as its
  // render lifecycle signal. Stable-shell patching keeps .app-shell alive,
  // so reproduce that signal without widening the observer to subtree=true.
  const marker = document.createComment("shitu-render");
  host.append(marker);
  marker.remove();
}

function patchStableShell(host, markup) {
  const currentShell = directChild(host, ".app-shell");
  const currentMain = directChild(currentShell, ".main-shell");
  if (!currentShell || !currentMain) return false;

  const template = document.createElement("template");
  nativeSetInnerHtml.call(template, markup);
  const nextShell = directChild(template.content, ".app-shell");
  const nextMain = directChild(nextShell, ".main-shell");
  if (!nextShell || !nextMain) return false;

  const currentSidebar = directChild(currentShell, ".sidebar");
  const currentTopbar = directChild(currentMain, ".topbar");
  const currentPage = directChild(currentMain, ".page-content");
  const currentMobileNav = directChild(currentShell, ".mobile-nav");

  const nextSidebar = directChild(nextShell, ".sidebar");
  const nextTopbar = directChild(nextMain, ".topbar");
  const nextPage = directChild(nextMain, ".page-content");
  const nextMobileNav = directChild(nextShell, ".mobile-nav");

  if (![currentSidebar, currentTopbar, currentPage, currentMobileNav, nextSidebar, nextTopbar, nextPage, nextMobileNav].every(Boolean)) {
    return false;
  }

  replaceSection(currentSidebar, nextSidebar);
  replaceSection(currentTopbar, nextTopbar);
  replaceSection(currentPage, nextPage);
  replaceSection(currentMobileNav, nextMobileNav);

  for (const child of [...host.childNodes]) {
    if (child !== currentShell) child.remove();
  }
  for (const node of [...template.content.childNodes]) {
    if (node !== nextShell) host.append(node);
  }
  signalRootChildMutation(host);
  return true;
}

class ShituAppRoot extends HTMLElement {
  connectedCallback() {
    if (!this.style.display) this.style.display = "block";
  }

  get innerHTML() {
    return nativeGetInnerHtml.call(this);
  }

  set innerHTML(value) {
    const markup = String(value ?? "");
    if (!nativeSetInnerHtml || !nativeGetInnerHtml) return;
    if (!patchStableShell(this, markup)) nativeReplace(this, markup);
  }
}

if (!customElements.get("shitu-app-root")) {
  customElements.define("shitu-app-root", ShituAppRoot);
}
