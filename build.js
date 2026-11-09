// Build: src/template.html + src/*.css + src/*.js (sorted) → index.html (single self-contained file)
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'src');
const list = (ext) => fs.readdirSync(src).filter((f) => f.endsWith(ext)).sort();
const read = (f) => fs.readFileSync(path.join(src, f), 'utf8');

const js = "'use strict';\n" + list('.js').map((f) => `// ===== ${f} =====\n${read(f)}`).join('\n');
const css = list('.css').map((f) => `/* ===== ${f} ===== */\n${read(f)}`).join('\n');
if (/<\/script/i.test(js)) throw new Error('JS contains "</script" — would break the inline <script>');

const html = read('template.html')
  .replace('/*__STYLES__*/', () => css)
  .replace('/*__SCRIPT__*/', () => js);
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log(`index.html: ${Math.round(html.length / 1024)} KB (${list('.js').length} js, ${list('.css').length} css)`);
