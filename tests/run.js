// Minimal test runner: loads every src/*.js into one VM context (like the browser's shared
// script scope), then runs tests/*.test.js. Usage: node tests/run.js [filter]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const srcDir = path.join(__dirname, '..', 'src');
const tests = [];
const ctx = vm.createContext({
  console, assert, performance, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone,
  test: (name, fn) => tests.push({ name, fn }),
});
// Resilient load: a broken module (e.g. another file mid-edit) is reported, the rest still load.
let loadErrors = 0;
const load = (file, label) => {
  try {
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: label });
  } catch (e) {
    loadErrors++;
    console.log(`  LOAD ERROR ${label}: ${String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')}`);
  }
};
for (const f of fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort()) load(path.join(srcDir, f), 'src/' + f);
const filter = process.argv[2];
for (const f of fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort()) {
  if (filter && !f.includes(filter)) continue;
  load(path.join(__dirname, f), 'tests/' + f);
}

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('  ok   ' + t.name);
    } catch (e) {
      failed++;
      console.log('  FAIL ' + t.name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n       ') : e));
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed` + (loadErrors ? `, ${loadErrors} load error(s)` : ''));
  process.exit(failed || loadErrors ? 1 : 0);
})();
