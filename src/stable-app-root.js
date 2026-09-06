const innerHtmlDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
const nativeGetInnerHtml = innerHtmlDescriptor?.get;
const nativeSetInnerHtml = innerHtmlDescriptor?.set;

const SECTION_SELECTORS = Object.freeze({
  sidebar: ".sidebar",
  topbar: ".topbar",
  page: ".page-content",
  mobileNav: ".mobile-nav",
});

function createSectionCache() {
  return {
    sidebar: null,
    topbar: null,
    page: null,
    mobileNav: null,
    overlays: null,
  };
}

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

function normalizeSections(sections = {}) {
  return {
    sidebar: String(sections.sidebar ?? ""),
    topbar: String(sections.topbar ?? ""),
    page: String(sections.page ?? ""),
    mobileNav: String(sections.mobileNav ?? ""),
    overlays: String(sections.overlays ?? ""),
  };
}

function composeSections(sections) {
  return `<div class="app-shell">${sections.sidebar}<div class="main-shell">${sections.topbar}${sections.page}</div>${sections.mobileNav}</div>${sections.overlays}`;
}

function parseSection(markup, selector) {
  const template = document.createElement("template");
  nativeSetInnerHtml.call(template, markup);
  const elements = [...template.content.children];
  if (elements.length !== 1) return null;
  const next = elements[0];
  if (!next.matches?.(selector)) return null;
  return next;
}

function replaceSectionMarkup(current, markup, selector, cache, key) {
  if (!current) return false;
  const cached = cache[key];
  if (cached?.source === markup && current.outerHTML === cached.normalized) return true;

  const next = parseSection(markup, selector);
  if (!next) return false;
  const normalized = next.outerHTML;
  current.replaceWith(next);
  cache[key] = { source: markup, normalized };
  return true;
}

function overlayElements(host, shell) {
  return [...host.children].filter((child) => child !== shell);
}

function normalizedOverlayMarkup(host, shell) {
  return overlayElements(host, shell).map((child) => child.outerHTML).join("");
}

function syncOverlays(host, shell, markup, cache) {
  const cached = cache.overlays;
  const currentNormalized = normalizedOverlayMarkup(host, shell);
  if (cached?.source === markup && currentNormalized === cached.normalized) return true;

  const template = document.createElement("template");
  nativeSetInnerHtml.call(template, markup);
  if (directChild(template.content, ".app-shell")) return false;

  for (const child of [...host.childNodes]) {
    if (child !== shell) child.remove();
  }
  for (const node of [...template.content.childNodes]) host.append(node);

  cache.overlays = {
    source: markup,
    normalized: normalizedOverlayMarkup(host, shell),
  };
  return true;
}

function seedSectionCache(host, sections, cache) {
  const shell = directChild(host, ".app-shell");
  const main = directChild(shell, ".main-shell");
  const sidebar = directChild(shell, SECTION_SELECTORS.sidebar);
  const topbar = directChild(main, SECTION_SELECTORS.topbar);
  const page = directChild(main, SECTION_SELECTORS.page);
  const mobileNav = directChild(shell, SECTION_SELECTORS.mobileNav);
  if (![shell, main, sidebar, topbar, page, mobileNav].every(Boolean)) return false;

  cache.sidebar = { source: sections.sidebar, normalized: sidebar.outerHTML };
  cache.topbar = { source: sections.topbar, normalized: topbar.outerHTML };
  cache.page = { source: sections.page, normalized: page.outerHTML };
  cache.mobileNav = { source: sections.mobileNav, normalized: mobileNav.outerHTML };
  cache.overlays = { source: sections.overlays, normalized: normalizedOverlayMarkup(host, shell) };
  return true;
}

function patchSubmittedSections(host, sections, cache) {
  const currentShell = directChild(host, ".app-shell");
  const currentMain = directChild(currentShell, ".main-shell");
  if (!currentShell || !currentMain) return false;

  const currentSidebar = directChild(currentShell, SECTION_SELECTORS.sidebar);
  const currentTopbar = directChild(currentMain, SECTION_SELECTORS.topbar);
  const currentPage = directChild(currentMain, SECTION_SELECTORS.page);
  const currentMobileNav = directChild(currentShell, SECTION_SELECTORS.mobileNav);
  if (![currentSidebar, currentTopbar, currentPage, currentMobileNav].every(Boolean)) return false;

  if (!replaceSectionMarkup(currentSidebar, sections.sidebar, SECTION_SELECTORS.sidebar, cache, "sidebar")) return false;
  if (!replaceSectionMarkup(currentTopbar, sections.topbar, SECTION_SELECTORS.topbar, cache, "topbar")) return false;
  if (!replaceSectionMarkup(currentPage, sections.page, SECTION_SELECTORS.page, cache, "page")) return false;
  if (!replaceSectionMarkup(currentMobileNav, sections.mobileNav, SECTION_SELECTORS.mobileNav, cache, "mobileNav")) return false;
  if (!syncOverlays(host, currentShell, sections.overlays, cache)) return false;

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
    this.__sectionRenderCache = createSectionCache();
  }

  renderSections(sections) {
    if (!nativeSetInnerHtml || !nativeGetInnerHtml) return false;
    const normalized = normalizeSections(sections);
    const cache = this.__sectionRenderCache || (this.__sectionRenderCache = createSectionCache());
    if (!patchSubmittedSections(this, normalized, cache)) {
      nativeReplace(this, composeSections(normalized));
      this.__sectionRenderCache = createSectionCache();
      seedSectionCache(this, normalized, this.__sectionRenderCache);
    }
    return true;
  }
}

if (!customElements.get("shitu-app-root")) {
  customElements.define("shitu-app-root", ShituAppRoot);
}
