/* ════════════════════════════════════════════════════════════════════
   dom-patches.js
   Wraps answer-selection callbacks to call saveState() after each
   interaction. Also wires bootstrap event listeners.

   IMPORTANT: ES module imports are immutable bindings — you cannot
   reassign `seaAns` after `import { seaAns }` like the old monolith
   did. Instead, this file patches the `window.*` exposures (which
   inline onclick="..." attributes in index.html actually call) so
   each user-visible click triggers a saveState() afterward.

   Because main.js does `Object.assign(window, {...})` BEFORE importing
   this file, the originals are guaranteed present on `window` when
   we run.
════════════════════════════════════════════════════════════════════ */

import { saveState } from './state.js';

// Wraps a window-exposed function so it triggers saveState() after running.
function _wrapWithSave(name) {
  const orig = window[name];
  if (typeof orig !== 'function') return;
  window[name] = function () {
    const r = orig.apply(this, arguments);
    try { saveState(); } catch (e) { /* swallow — saveState is best-effort */ }
    return r;
  };
}

// Each of the following is what inline onclick="..." in index.html calls.
// Wrapping the window binding catches every real click; the original
// imported reference inside other modules stays untouched.
[
  'seaAns', 'trySeaNextPage', 'seaPageNav',
  'nmapAns', 'tryNmapNextPage', 'nmapPageNav',
  'cpiSel', 'cpiNav', 'cpiJump',
  'renderDAABSub', 'advanceDAABSub',
  'doRegister',
  'buildResults',
].forEach(_wrapWithSave);

console.log('[NuMind] dom-patches: save-state wrappers installed');
