// Runs in every page the user opens, after lib/matcher.js (the manifest lists them in that
// order, and scripts listed together share one global scope, where GtaBlocker lives). The
// covering comes in step 3; for now this proves the pieces load.
//
// Wrapped in a function so that nothing here lands in that shared scope: a top-level const
// would clash with the same name in a later file and stop it.
//
// The matcher is built here, at load, so that a matcher that breaks in Firefox's engine shows
// up as a missing marker in Journey 0 (tests/macro/extension-loads.test.mjs) instead of as a
// page that is silently never covered.
//
// The marker is visible to the page's own scripts, so a site can tell the extension is there.
// That is accepted: the covered items will carry markers too, and nothing about the user is in
// them. (Step 4 must keep it that way: the marker must never reflect the user's own list.)
(function () {
  'use strict';
  const matcher = GtaBlocker.matcher.compile(GtaBlocker.matcher.DEFAULT_ENTRIES);
  document.documentElement.setAttribute('data-gta-blocker', matcher.entries.length > 0 ? 'ready' : 'error');
})();
