// Runs in every page the user opens. Step 1 of the build only proves that it runs: the marker
// below is what Journey 0 (tests/macro/extension-loads.test.mjs) waits for. The matching and
// covering come in the next steps.
//
// The marker is visible to the page's own scripts, so a site can tell the extension is there.
// That is accepted: the covered items will carry markers too, and nothing about the user is in
// them.
document.documentElement.setAttribute('data-gta-blocker', 'ready');
