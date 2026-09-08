# Mobile role/site certification interaction contract

The mobile role/site certification exercises the same navigation and permission surfaces used by production accounts across Chromium and WebKit mobile viewports.

For overlay teardown, the test must use a deterministic interaction supported by the application. The mobile all-functions menu supports `Escape`; certification uses that interaction instead of clicking the backdrop container itself, because the geometric center of the backdrop can be covered by the child menu and therefore does not represent an outside-backdrop click.

The assertion remains unchanged: `.mobile-menu-backdrop` must detach after the supported close interaction before the next permission/site check proceeds.
