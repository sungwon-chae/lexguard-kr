#!/usr/bin/env node
// nospace_smoke.js — verify the no-space "개인정보보호법" form resolves to
// VERIFIED (no longer ALIAS_MATCH after the alias-dict cleanup).

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

const P = sb.LexGuardParser;
const V = sb.LexGuardVerifier;

function pipeline(text) {
  const cits = P.findCitations(text);
  return cits.map(c => V.verifyCitation(c));
}

function run(label, text, expected) {
  const results = pipeline(text);
  const got = results.map(r => `${r.lawNameResolved || r.lawNameRaw}/${r.articleNo}:${r.status}`);
  const exp = expected.map(e => `${e.law}/${e.article}:${e.status}`);
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${label}\n        expect: ${exp.join(' | ') || '(none)'}\n        got:    ${got.join(' | ') || '(none)'}`);
  return ok;
}

// Note: lawNameResolved comes from entry.law_name in the index. The index
// stores "개인정보 보호법" canonically; the no-space key "개인정보보호법"
// points to the SAME entry, so a no-space lookup resolves to the canonical
// spaced name. The point of this test is that status=VERIFIED (not
// ALIAS_MATCH) — the spacing of `resolved` is incidental.
const cases = [
  ['개인정보보호법 제15조 (no space, VERIFIED)',
    '개인정보보호법 제15조에 따르면',
    [{ law: '개인정보 보호법', article: '15조', status: 'VERIFIED' }]],
  ['개인정보 보호법 제15조 (with space, VERIFIED 회귀)',
    '개인정보 보호법 제15조에 따르면',
    [{ law: '개인정보 보호법', article: '15조', status: 'VERIFIED' }]],
  ['개보법 제23조 (alias 회귀)',
    '개보법 제23조',
    [{ law: '개인정보 보호법', article: '23조', status: 'ALIAS_MATCH' }]],
  ['민법 제750조 (회귀)',
    '민법 제750조',
    [{ law: '민법', article: '750조', status: 'VERIFIED' }]],
  ['민법 제750조, 제751조 (연속 조문 회귀)',
    '민법 제750조, 제751조에 따라',
    [{ law: '민법', article: '750조', status: 'VERIFIED' },
     { law: '민법', article: '751조', status: 'VERIFIED' }]],
];

console.log('--- no-space + alias cleanup smoke ---');
let pass = 0;
for (const [l, t, e] of cases) {
  const ok = run(l, t, e);
  if (ok) pass++;
}
console.log(`\nresult: ${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
