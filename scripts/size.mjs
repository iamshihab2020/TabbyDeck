// usage: node scripts/size.mjs <dist dir> <limit KB>  — fails when the gzipped total exceeds the limit
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
const [dir, limitKb] = process.argv.slice(2);
const walk = d => readdirSync(d).flatMap(f => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
let total = 0;
for (const f of walk(dir)) { const gz = gzipSync(readFileSync(f), { level: 9 }).length; total += gz; console.log(`${(gz / 1024).toFixed(1).padStart(7)} KB  ${path.relative(dir, f)}`); }
console.log(`${(total / 1024).toFixed(1).padStart(7)} KB  total gzipped (limit ${limitKb} KB)`);
if (total > Number(limitKb) * 1024) { console.error('SIZE LIMIT EXCEEDED'); process.exit(1); }
