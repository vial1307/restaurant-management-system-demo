# SDD Delta — Section Render API

Date: 2026-09-06
Status: specification / acceptance design
Priority: P1 render architecture performance
Base production: `c7201a65338e5f83f487d3330d15525fbfda1b7a`

## Problem

The stable-shell release preserves `.app-shell` and `.main-shell` DOM identity, but every authorized render still builds one complete application HTML string and `stable-app-root.js` parses that entire string into a `<template>` before it can decide which sections changed. It then compares serialized `outerHTML` for sidebar, topbar, page and mobile navigation.

This means a render-only topbar change (for example opening the calendar) still parses sidebar, page, mobile nav and modal markup even though those sections are unchanged.

## Goal

Keep the existing stable-shell/auth lifecycle and visible output while allowing the app renderer to submit independent section markup. The root must parse only sections whose source/DOM no longer matches the previous normalized template.

## Section contract

The app supplies these complete fragments:
- `sidebar`: one `<aside class="sidebar">…</aside>`
- `topbar`: one `<header class="topbar">…</header>`
- `page`: one `<main class="page-content">…</main>`
- `mobileNav`: one `<nav class="mobile-nav">…</nav>`
- `overlays`: zero or more root-level modal/backdrop nodes outside `.app-shell`

The structural wrappers remain fixed:
- `.app-shell`
- `.main-shell`

## Cache / integrity model

For each section, keep only the previous raw source string and its browser-normalized `outerHTML`.

A section may be skipped only when BOTH are true:
1. raw source is unchanged; and
2. current DOM serialization still equals the cached normalized template.

Therefore DOM mutations performed by hooks/async mounts are not blindly trusted as template state. If current DOM differs from the cached normalized template, the section is parsed and restored, preserving the previous stable-shell repair behavior.

The cache is per root element and bounded to the five section slots. It must not grow by route/history/user/date.

## Required behavior

1. First authorized render with no valid shell composes the sections once and uses the native full-render fallback.
2. Later authorized renders preserve `.app-shell` and `.main-shell` identity.
3. Unchanged sidebar/topbar/page/mobile-nav sections preserve their own DOM node identity.
4. A changed section is parsed independently and replaces only that section.
5. Normal section updates must not parse a complete application markup string.
6. Corrupt/missing shell structure falls back to a complete native render built from the submitted sections.
7. Existing `innerHTML` getter/setter fallback remains supported for compatibility and corruption recovery.
8. Root-level modal/backdrop nodes are synchronized as one bounded `overlays` section; opening/closing a modal must not replace `.app-shell` or `.main-shell`.
9. The direct-child mutation signal used by `auth-layer.js` remains emitted after successful stable section updates.
10. First/fallback native replacement itself remains sufficient to trigger the auth-layer direct child observer and does not require duplicate signaling.
11. `applyAccountEditState`, inventory search restore, receive-zone sync, inventory operations/history mounts and all existing post-render hooks still execute after `render()`.
12. No event delegation, auth, permissions, store, business persistence, inventory mutation, API or database semantics change.
13. No native DOM prototype monkey-patching.

## Acceptance tests before implementation

Static contract must verify:
- `ShituAppRoot` exposes a dedicated section-render method;
- app `render()` uses that method when available and retains a complete `innerHTML` fallback path;
- normal section-render path does not create/parse one complete application template;
- individual section parsing validates the expected root selector;
- source + normalized DOM comparison is required before skip;
- section cache has fixed named slots rather than unbounded history storage;
- corrupt-shell fallback remains present;
- legacy `innerHTML` stable-shell path remains present;
- auth direct-child marker remains present.

Browser acceptance must verify:
- `.app-shell` and `.main-shell` identities remain stable;
- opening calendar replaces/updates topbar correctly while preserving sidebar, page and mobile-nav node identity;
- closing calendar preserves those unchanged section identities;
- route navigation updates page/nav state while shell identities remain stable;
- opening and closing the add-item modal changes root overlays without replacing shell containers;
- no orphan modal remains;
- mobile 320/359/390/412 widths remain without horizontal overflow;
- no page errors.

Existing full preflight, API/Postgres concurrency, Chromium, recovery/persistence, Firefox/WebKit full-device, exact-SHA deploy and production smoke remain mandatory.

## Out of scope

- component/row diffing inside `.page-content`;
- eliminating template generation inside page functions;
- changing delegated root listeners;
- store immutability migration;
- database/schema/API changes;
- production load/stress tests.

## Rollback

Restore `render()` to the complete `root.innerHTML = ...` call and remove the dedicated section-render method/cache from `stable-app-root.js`. No migration or data rollback is required.
