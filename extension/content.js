// Runs in every page and frame the user opens, after lib/matcher.js, lib/cover.js and
// lib/page.js (the manifest lists them in that order, and scripts listed together share one
// global scope, where GtaBlocker lives). It builds the matcher and starts covering.
//
// Wrapped in a function so that nothing here lands in that shared scope: a top-level const
// would clash with the same name in a later file and stop it.
//
// The page is marked "ready" once the first look at it is done. The marker is visible to the
// page's own scripts, so a site can tell the extension is there; that is accepted, and nothing
// about the user is in it. (Step 4 must keep it that way: never reflect the user's own list.)
(function () {
  'use strict';
  const matcher = GtaBlocker.matcher.compile(GtaBlocker.matcher.DEFAULT_ENTRIES);
  if (matcher.entries.length === 0) {
    document.documentElement.setAttribute('data-gta-blocker', 'error');
    return;
  }
  GtaBlocker.page.start({
    matcher,
    onReady: () => document.documentElement.setAttribute('data-gta-blocker', 'ready'),
  });
})();
