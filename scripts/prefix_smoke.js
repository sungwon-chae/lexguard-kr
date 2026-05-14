#!/usr/bin/env node
// prefix_smoke.js — verify prefix-stripping in lookupLaw covers
// "대한민국 …" and qualifier prefixes ("보통 …", "일반 …", "구 …", etc.).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.resolve(__dirname, '..', 'extension');
const indexJson = JSON.parse(fs.readFileSync(path.join(EXT, 'data', 'law-index.json'), 'utf8'));
const verifierSrc = fs.readFileSync(path.join(EXT, 'verifier.js'), 'utf8');
const parserSrc = fs.readFileSync(path.join(EXT, 'parser.js'), 'utf8');
const patched = verifierSrc.replace('let _index = null;', 'let _index = ' + JSON.stringify(indexJson) + ';');

const sb = { console: { log: ()=>{}, warn: ()=>{}, error: console.error } };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(parserSrc, sb, { filename: 'parser.js' });
vm.runInContext(patched, sb, { filename: 'verifier.js(patched)' });

function run(label, citation, expected) {
  const r = sb.LexGuardVerifier.verifyCitation(citation);
  const ok = r.status === expected;
  console.log(
    `[${ok ? 'OK' : 'FAIL'}] ${label}\n` +
    `        expected=${expected}  actual=${r.status}  resolved="${r.lawNameResolved || '-'}"  matchKind=${r.matchKind}`
  );
  return ok;
}

console.log('--- prefix-strip smoke (대한민국 + qualifiers) ---');
const cases = [
  ['보통 민법 제750조',                  { lawNameRaw: '보통 민법',                 articleNo: '750조', paragraphNo: null, matchText: '' }, 'VERIFIED'],
  ['일반 민법 제750조',                  { lawNameRaw: '일반 민법',                 articleNo: '750조', paragraphNo: null, matchText: '' }, 'VERIFIED'],
  ['구 민법 제5조',                      { lawNameRaw: '구 민법',                   articleNo: '5조',   paragraphNo: null, matchText: '' }, 'VERIFIED'],
  ['현행 민법 제1조',                    { lawNameRaw: '현행 민법',                 articleNo: '1조',   paragraphNo: null, matchText: '' }, 'VERIFIED'],
  ['대한민국 민법 제750조 (회귀 없음)',   { lawNameRaw: '대한민국 민법',              articleNo: '750조', paragraphNo: null, matchText: '' }, 'VERIFIED'],
  ['민법 제750조 (회귀 없음)',           { lawNameRaw: '민법',                      articleNo: '750조', paragraphNo: null, matchText: '' }, 'VERIFIED'],
  ['대한민국헌법 제1조 (단독 법령 보존)', { lawNameRaw: '대한민국헌법',              articleNo: '1조',   paragraphNo: null, matchText: '' }, 'VERIFIED'],
];
let pass = 0;
for (const [l, c, e] of cases) if (run(l, c, e)) pass++;
console.log(`\nresult: ${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
