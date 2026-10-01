const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../app/src/main/assets');
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]);
const files = walk(root);
for (const file of files) {
  if (file.endsWith('.js')) new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
  if (file.endsWith('.json')) JSON.parse(fs.readFileSync(file,'utf8'));
}
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const refs = [...html.matchAll(/["']([^"']+\.(?:js|css|html))(?:\?[^"']*)?["']/g)].map(m=>m[1]).filter(v=>v.startsWith('src/'));
for (const ref of refs) assert.ok(fs.existsSync(path.join(root,ref)),`Missing asset: ${ref}`);
console.log(`PASS: ${files.filter(f=>f.endsWith('.js')).length} JS files, ${files.filter(f=>f.endsWith('.json')).length} JSON files, ${refs.length} entry-point asset references`);
