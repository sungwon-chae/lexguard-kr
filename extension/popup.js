// popup.js — show index status (popup runs in extension context, fetches
// the bundled JSON directly).

(function () {
  'use strict';
  const statusEl = document.getElementById('status');
  const lawCountEl = document.getElementById('law-count');
  const articleCountEl = document.getElementById('article-count');
  const builtAtEl = document.getElementById('built-at');

  function fmtNumber(n) {
    if (typeof n !== 'number') return '—';
    return n.toLocaleString('ko-KR');
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString('ko-KR');
    } catch (e) {
      return iso;
    }
  }

  fetch(chrome.runtime.getURL('data/law-index.json'))
    .then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then((data) => {
      const meta = (data && data.meta) || {};
      statusEl.textContent = '로드됨';
      statusEl.classList.add('ok');
      lawCountEl.textContent = fmtNumber(meta.law_count);
      articleCountEl.textContent = fmtNumber(meta.article_count);
      builtAtEl.textContent = fmtDate(meta.built_at);
    })
    .catch((err) => {
      statusEl.textContent = '로드 실패: ' + err.message;
      statusEl.classList.add('fail');
    });
})();
