# SDD Delta — Section Render API v3

Date: 2026-09-08
Base production: `01b58f19a840288da8e5b6b44e46925ac8a32438`
Priority: P1 render architecture performance

## Problem

The stable shell preserves `.app-shell` and `.main-shell` identity, but every authorized render still builds and parses one complete application markup string before deciding which shell sections changed.

## Required behavior

- render five bounded slots: sidebar, topbar, page, mobileNav and overlays;
- parse a stable section only when its source or normalized current DOM differs from the cached template;
- keep cache fixed to the five named slots;
- keep `mobileMenu`, add-item modal and management modal together in the root overlays slot;
- preserve complete `innerHTML` stable-shell compatibility and corruption fallback;
- preserve the auth-layer direct-child lifecycle signal and all existing post-render hooks;
- do not change auth, permissions, store, business persistence, inventory mutation, API or database semantics;
- do not monkey-patch native DOM prototypes.

## Acceptance

Static/performance contracts must prove the bounded section API and mobile-menu overlay integration. Normal API/PostgreSQL, desktop/mobile Chromium, recovery/persistence, full-device Firefox/WebKit, exact-SHA deploy, health/release and production UI smoke remain mandatory.
