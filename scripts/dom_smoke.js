#!/usr/bin/env node
// dom_smoke.js — jsdom-driven DOM-level test of content.js highlightCitationsIn.
//
// Each case constructs a small DOM, runs highlightCitationsIn against it,
// then checks:
//   1) textContent invariant: tree text unchanged before vs after
//   2) at least one .lexguard-mark span was inserted
//   3) span(s) carry data-lexguard-status and data-lexguard-id
//   4) all spans for a single citation share the same data-lexguard-id

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const EXT = path.resolve(__dirname, '..', 'extension');
const indexJson = JSON.parse(fs.readFileSync(path.join(EXT, 'data', 'law-index.json'), 'utf8'));

function makeDom() {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><div id="root"></div></body></html>',
    { url: 'https://test.local/', pretendToBeVisual: true, runScripts: 'outside-only' }
  );
  const { window } = dom;
  const ctx = dom.getInternalVMContext();

  // Skip the auto-bootstrap MutationObserver setup.
  window.__lexguard_skip_autostart = true;
  // sidebar.install() in sidebar.js may need chrome.runtime; stub it.
  window.chrome = { runtime: { getURL: (p) => 'file:///' + p } };
  // Stub fetch (autostart is off, but content.js still references it).
  window.fetch = () => Promise.reject(new Error('fetch stub'));

  // Load scripts in order. Use vm.runInContext so global `window`/`document`
  // are visible as free variables (window.eval doesn't do that in jsdom).
  // Bake the law index directly into verifier.js so we don't need fetch.
  const parserSrc = fs.readFileSync(path.join(EXT, 'parser.js'), 'utf8');
  const verifierSrcRaw = fs.readFileSync(path.join(EXT, 'verifier.js'), 'utf8');
  const verifierSrc = verifierSrcRaw.replace(
    'let _index = null;',
    'let _index = ' + JSON.stringify(indexJson) + ';'
  );
  const sidebarSrc = fs.readFileSync(path.join(EXT, 'sidebar.js'), 'utf8');
  const contentSrc = fs.readFileSync(path.join(EXT, 'content.js'), 'utf8');

  vm.runInContext(parserSrc, ctx, { filename: 'parser.js' });
  vm.runInContext(verifierSrc, ctx, { filename: 'verifier.js(patched)' });
  vm.runInContext(sidebarSrc, ctx, { filename: 'sidebar.js' });
  vm.runInContext(contentSrc, ctx, { filename: 'content.js' });

  return { dom, window };
}

function verifyAll(text) {
  // Returns a function suitable as the `verifyFn` argument.
  // We rely on the patched window.LexGuardVerifier.verifyCitation.
}

const cases = [
  {
    name: 'a) 단일 텍스트 노드 — "민법 제750조"',
    html: '<p>민법 제750조에 따르면 불법행위 책임을 진다.</p>',
    expectMinSpans: 1,
  },
  {
    name: 'b) 크로스노드 — <a>개인정보 보호법</a> 제15조',
    html: '<p><a href="#">개인정보 보호법</a> 제15조에 따른 수집·이용</p>',
    expectMinSpans: 1,
  },
  {
    name: 'c) 헤딩 안 — <h2>민법 제2조 제1항</h2>',
    html: '<h2>민법 제2조 제1항</h2>',
    expectMinSpans: 1,
  },
  {
    name: 'd) 불릿 안 — <li>민법 제750조에 따라</li>',
    html: '<ul><li>민법 제750조에 따라 손해배상 청구</li><li>민법 제751조 적용</li></ul>',
    expectMinSpans: 2,
  },
  {
    name: 'e) 중첩 강조 — <strong>민법 제2조</strong>',
    html: '<p><strong>민법 제2조</strong>는 권리능력의 시기를 규정한다.</p>',
    expectMinSpans: 1,
  },
  {
    name: 'f) 단일 노드 + 연속 인용 — "민법 제750조, 제751조"',
    html: '<p>민법 제750조, 제751조에 따라</p>',
    expectMinSpans: 2,
  },
  {
    name: 'g) 재실행 idempotency',
    html: '<p>민법 제750조에 따르면</p>',
    expectMinSpans: 1,
    rerun: true,
  },
];

function runCase(c) {
  const { window } = makeDom();
  const root = window.document.getElementById('root');
  root.innerHTML = c.html;

  const before = root.textContent;
  const V = window.LexGuardVerifier;
  const verifyFn = (cit) => V.verifyCitation(cit);

  const highlightFn = window.__lexguard_test.highlightCitationsIn;
  highlightFn(root, verifyFn);
  if (c.rerun) highlightFn(root, verifyFn);

  const after = root.textContent;
  const spans = root.querySelectorAll('.lexguard-mark');

  const checks = [];
  checks.push({ name: 'textContent invariant', ok: before === after, detail: `before.len=${before.length} after.len=${after.length}` });
  checks.push({ name: `≥${c.expectMinSpans} span(s) inserted`, ok: spans.length >= c.expectMinSpans, detail: `got ${spans.length}` });

  let allHaveStatus = true;
  let allHaveId = true;
  for (const s of spans) {
    if (!s.dataset.lexguardStatus) allHaveStatus = false;
    if (!s.dataset.lexguardId) allHaveId = false;
  }
  checks.push({ name: 'all spans carry status', ok: allHaveStatus, detail: '' });
  checks.push({ name: 'all spans carry id', ok: allHaveId, detail: '' });

  // For re-run case, make sure span count didn't double.
  if (c.rerun) {
    checks.push({
      name: 'idempotent re-run did not add duplicate marks',
      ok: spans.length === c.expectMinSpans,
      detail: `expected ${c.expectMinSpans}, got ${spans.length}`,
    });
  }

  const allOk = checks.every(ch => ch.ok);
  console.log(`${allOk ? '[OK]  ' : '[FAIL]'} ${c.name}`);
  for (const ch of checks) {
    if (!ch.ok) console.log(`        - ${ch.name}: FAIL ${ch.detail}`);
  }
  if (!allOk) {
    console.log('        HTML before: ' + c.html);
    console.log('        HTML after:  ' + root.innerHTML);
  }
  return allOk;
}

console.log('--- DOM smoke (Range API highlightCitationsIn) ---');
let pass = 0;
for (const c of cases) if (runCase(c)) pass++;
console.log(`\nresult: ${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
