// ===== Main: boots the game in the browser (no-op in Node tests) =====
const Main = (() => {
  if (typeof document !== 'undefined') Game.boot();
  return {};
})();
