// Load all src/*.js into a VM context for dev scripts: const ctx = require('./load')(); ctx.Cards...
const fs = require('fs');
const path = require('path');
const vm = require('vm');
module.exports = function load() {
  const srcDir = path.join(__dirname, '..', 'src');
  const ctx = vm.createContext({ console, performance, setTimeout, clearTimeout, structuredClone });
  for (const f of fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort()) {
    vm.runInContext(fs.readFileSync(path.join(srcDir, f), 'utf8'), ctx, { filename: 'src/' + f });
  }
  // expose lexical globals (const X = ...) on the returned object
  return new Proxy({}, { get: (_, k) => vm.runInContext(String(k), ctx) });
};
