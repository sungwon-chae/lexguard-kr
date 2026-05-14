// sidebar.js — sidebar panel + toggle button (Shadow DOM isolated)
// All UI strings and colors come from /docs/UI_REFERENCE.md — do not edit ad-hoc.

(function (global) {
  'use strict';

  const STATUS = {
    VERIFIED: 'VERIFIED',
    LAW_ONLY: 'LAW_ONLY',
    ALIAS_MATCH: 'ALIAS_MATCH',
    NOT_FOUND: 'NOT_FOUND'
  };

  const SIDEBAR_CSS = `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial,
        "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
    }
    * { box-sizing: border-box; }
    .toggle {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #1e293b;
      color: #f1f5f9;
      border: 2px solid #334155;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 22px;
      z-index: 2147483646;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      transition: transform 0.15s ease;
    }
    .toggle:hover { transform: scale(1.06); }
    .toggle.worst-not-found { border-color: #ef4444; animation: lg-pulse 1.8s infinite; }
    .toggle.worst-law-only  { border-color: #f59e0b; animation: lg-pulse 1.8s infinite; }
    .toggle.worst-alias     { border-color: #22c55e; }
    .toggle.worst-verified  { border-color: #3b82f6; }
    @keyframes lg-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
      70%  { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
      100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
    }
    .badge-count {
      position: absolute;
      top: -4px; right: -4px;
      min-width: 18px; height: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: #ef4444;
      color: white;
      font-size: 11px;
      font-weight: 600;
      display: flex; align-items: center; justify-content: center;
    }

    .panel {
      position: fixed;
      top: 0;
      right: -380px;
      width: 360px;
      height: 100vh;
      background: #0f172a;
      color: #f1f5f9;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      transition: right 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: -8px 0 24px rgba(0,0,0,0.5);
      font-size: 13px;
      line-height: 1.5;
    }
    .panel.open { right: 0; }
    .panel header {
      padding: 16px;
      border-bottom: 1px solid #334155;
      display: flex; align-items: center; justify-content: space-between;
    }
    .panel header h1 {
      margin: 0; font-size: 15px; font-weight: 600; color: #f1f5f9;
    }
    .panel header h1 .scale { margin-right: 6px; }
    .close-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 20px;
      cursor: pointer;
      padding: 4px 8px;
      line-height: 1;
    }
    .close-btn:hover { color: #f1f5f9; }

    .summary {
      padding: 10px 16px;
      border-bottom: 1px solid #334155;
      display: flex; gap: 10px; flex-wrap: wrap;
      color: #94a3b8;
      font-size: 12px;
    }
    .summary .chip { display: flex; align-items: center; gap: 4px; }
    .summary .dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot.verified { background: #3b82f6; }
    .dot.law-only { background: #f59e0b; }
    .dot.alias    { background: #22c55e; }
    .dot.not-found{ background: #ef4444; }

    .cards {
      flex: 1; overflow-y: auto; padding: 12px 16px;
    }
    .empty {
      color: #64748b; text-align: center; padding: 40px 16px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .card .row { display: flex; justify-content: space-between; gap: 8px; }
    .card .law {
      font-weight: 600;
      color: #f1f5f9;
      font-size: 13px;
      word-break: keep-all;
    }
    .card .article {
      color: #94a3b8; font-size: 12px; margin-top: 2px;
    }
    .card .article-title {
      color: #cbd5e1; font-size: 12px; margin-top: 4px;
    }
    .card .meta {
      color: #64748b; font-size: 11px; margin-top: 6px;
    }
    .card a {
      color: #60a5fa; text-decoration: none; font-size: 11px;
    }
    .card a:hover { text-decoration: underline; }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      border: 1px solid;
    }
    .badge.VERIFIED    { background: #1e3a8a; color: #93c5fd; border-color: #1e40af; }
    .badge.LAW_ONLY    { background: #451a03; color: #fbbf24; border-color: #78350f; }
    .badge.ALIAS_MATCH { background: #14532d; color: #4ade80; border-color: #166534; }
    .badge.NOT_FOUND   { background: #450a0a; color: #f87171; border-color: #7f1d1d; }

    .actions {
      padding: 10px 16px;
      border-top: 1px solid #334155;
      display: flex; gap: 8px;
    }
    .actions button {
      flex: 1;
      background: #1e293b;
      color: #f1f5f9;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 8px;
      cursor: pointer;
      font-size: 12px;
    }
    .actions button:hover { background: #334155; }
    .actions button:disabled { opacity: 0.4; cursor: not-allowed; }
    .actions .copy-toast {
      position: absolute;
      bottom: 56px;
      left: 50%;
      transform: translateX(-50%);
      background: #22c55e;
      color: #052e16;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }
    .actions .copy-toast.show { opacity: 1; }

    footer {
      padding: 12px 16px;
      border-top: 1px solid #334155;
      color: #64748b;
      font-size: 10px;
      line-height: 1.4;
    }
  `;

  const SIDEBAR_HTML = `
    <button class="toggle" id="lg-toggle" title="LexGuard KR">
      <span>⚖</span>
      <span class="badge-count" id="lg-count" hidden></span>
    </button>
    <aside class="panel" id="lg-panel" role="dialog" aria-label="LexGuard KR 패널">
      <header>
        <h1><span class="scale">⚖</span>LexGuard KR</h1>
        <button class="close-btn" id="lg-close" aria-label="닫기">×</button>
      </header>
      <div class="summary" id="lg-summary"></div>
      <div class="cards" id="lg-cards">
        <div class="empty">아직 검출된 인용이 없습니다.<br/>LLM 답변이 출력되면 자동으로 확인합니다.</div>
      </div>
      <div class="actions" style="position:relative;">
        <button id="lg-copy" disabled>미확인 조문 목록 복사</button>
        <div class="copy-toast" id="lg-toast">복사 완료</div>
      </div>
      <footer>
        본 도구는 법령·조문 인용의 존재 여부만 1차 확인합니다.
        조문 내용의 해석, 판례 법리, 답변의 법적 타당성은 검증하지 않습니다.
      </footer>
    </aside>
  `;

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusLabel(status) {
    switch (status) {
      case STATUS.VERIFIED:    return '확인됨';
      case STATUS.LAW_ONLY:    return '조문 미확인';
      case STATUS.ALIAS_MATCH: return '약칭 매칭';
      case STATUS.NOT_FOUND:   return '확인 불가';
      default: return status;
    }
  }

  function dotClass(status) {
    return {
      VERIFIED: 'verified',
      LAW_ONLY: 'law-only',
      ALIAS_MATCH: 'alias',
      NOT_FOUND: 'not-found'
    }[status] || '';
  }

  /**
   * Build / install the sidebar in a Shadow DOM host (KNOWN_ISSUES.md #1).
   * Returns a controller object.
   */
  function install() {
    const host = document.createElement('div');
    host.id = 'lexguard-kr-host';
    host.style.all = 'initial';
    host.style.position = 'fixed';
    host.style.zIndex = '2147483647';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${SIDEBAR_CSS}</style>${SIDEBAR_HTML}`;
    document.documentElement.appendChild(host);

    const toggle = shadow.getElementById('lg-toggle');
    const panel  = shadow.getElementById('lg-panel');
    const close  = shadow.getElementById('lg-close');
    const cards  = shadow.getElementById('lg-cards');
    const summary= shadow.getElementById('lg-summary');
    const copyBtn= shadow.getElementById('lg-copy');
    const countEl= shadow.getElementById('lg-count');
    const toast  = shadow.getElementById('lg-toast');

    // Citation registry: id → verification result.
    const citations = new Map();
    // id → DOM element of the card (for scrollIntoView).
    const cardEls = new Map();

    function open() {
      panel.classList.add('open');
    }
    function closePanel() {
      panel.classList.remove('open');
    }
    toggle.addEventListener('click', () => {
      if (panel.classList.contains('open')) closePanel();
      else open();
    });
    close.addEventListener('click', closePanel);

    copyBtn.addEventListener('click', () => {
      const lines = [];
      for (const v of citations.values()) {
        if (v.status === STATUS.LAW_ONLY) {
          lines.push(`[미확인] ${v.lawNameResolved || v.lawNameRaw} 제${v.articleNo}`);
        } else if (v.status === STATUS.NOT_FOUND) {
          lines.push(`[확인불가] ${v.lawNameRaw} 제${v.articleNo}`);
        }
      }
      if (!lines.length) return;
      const text = lines.join('\n');
      const tryClip = navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(text)
        : Promise.reject(new Error('no clipboard'));
      tryClip
        .catch(() => {
          // Fallback: temporary textarea.
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch (e) { /* ignore */ }
          document.body.removeChild(ta);
        })
        .finally(() => {
          toast.classList.add('show');
          setTimeout(() => toast.classList.remove('show'), 1200);
        });
    });

    function worstStatus() {
      let worst = null;
      for (const v of citations.values()) {
        if (v.status === STATUS.NOT_FOUND) return STATUS.NOT_FOUND;
        if (v.status === STATUS.LAW_ONLY) worst = STATUS.LAW_ONLY;
        else if (!worst && (v.status === STATUS.ALIAS_MATCH)) worst = STATUS.ALIAS_MATCH;
        else if (!worst && v.status === STATUS.VERIFIED) worst = STATUS.VERIFIED;
      }
      return worst;
    }

    function refreshToggleAppearance() {
      toggle.classList.remove('worst-not-found', 'worst-law-only', 'worst-alias', 'worst-verified');
      const w = worstStatus();
      if (w === STATUS.NOT_FOUND) toggle.classList.add('worst-not-found');
      else if (w === STATUS.LAW_ONLY) toggle.classList.add('worst-law-only');
      else if (w === STATUS.ALIAS_MATCH) toggle.classList.add('worst-alias');
      else if (w === STATUS.VERIFIED) toggle.classList.add('worst-verified');

      const count = citations.size;
      if (count > 0) {
        countEl.hidden = false;
        countEl.textContent = String(count);
      } else {
        countEl.hidden = true;
      }
    }

    function refreshSummary() {
      const counts = { VERIFIED: 0, LAW_ONLY: 0, ALIAS_MATCH: 0, NOT_FOUND: 0 };
      for (const v of citations.values()) counts[v.status] = (counts[v.status] || 0) + 1;
      summary.innerHTML = `
        <span class="chip"><span class="dot not-found"></span>확인 불가 ${counts.NOT_FOUND}</span>
        <span class="chip"><span class="dot law-only"></span>조문 미확인 ${counts.LAW_ONLY}</span>
        <span class="chip"><span class="dot alias"></span>약칭 ${counts.ALIAS_MATCH}</span>
        <span class="chip"><span class="dot verified"></span>확인 ${counts.VERIFIED}</span>
      `;
      const hasMissing = counts.LAW_ONLY > 0 || counts.NOT_FOUND > 0;
      copyBtn.disabled = !hasMissing;
    }

    function renderCard(id, v) {
      const law = escapeHtml(v.lawEntry ? v.lawEntry.law_name : v.lawNameRaw);
      const articleNo = escapeHtml(v.articleNo);
      const articleTitle = v.articleEntry && v.articleEntry.title
        ? escapeHtml(v.articleEntry.title)
        : '';
      const lawType = v.lawEntry && v.lawEntry.law_type ? escapeHtml(v.lawEntry.law_type) : '';
      const effective = v.lawEntry && v.lawEntry.effective_date ? escapeHtml(v.lawEntry.effective_date) : '';
      const sourceUrl = v.lawEntry && v.lawEntry.source_url ? v.lawEntry.source_url : '';
      const legalizePath = v.lawEntry && v.lawEntry.legalize_path ? escapeHtml(v.lawEntry.legalize_path) : '';

      let aliasNote = '';
      if (v.isAlias) {
        aliasNote = `<div class="meta">약칭: ${escapeHtml(v.lawNameRaw)} → ${escapeHtml(v.lawNameResolved || '')}</div>`;
      }

      const linkHtml = sourceUrl
        ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">국가법령정보센터 →</a>`
        : '';
      const legalizeHtml = legalizePath ? `<div class="meta">Legalize KR: ${legalizePath}</div>` : '';

      return `
        <div class="card" data-citation-id="${escapeHtml(id)}">
          <div class="row">
            <div>
              <div class="law">${law || '(법령명 미상)'}</div>
              <div class="article">제${articleNo}${v.paragraphNo ? ' 제' + escapeHtml(v.paragraphNo) : ''}</div>
              ${articleTitle ? `<div class="article-title">${articleTitle}</div>` : ''}
            </div>
            <div><span class="badge ${v.status}">${statusLabel(v.status)}</span></div>
          </div>
          ${aliasNote}
          ${lawType || effective ? `<div class="meta">${lawType}${effective ? ' · 시행 ' + effective : ''}</div>` : ''}
          ${legalizeHtml}
          ${linkHtml ? `<div class="meta">${linkHtml}</div>` : ''}
        </div>
      `;
    }

    function rerender() {
      cardEls.clear();
      if (citations.size === 0) {
        cards.innerHTML = `<div class="empty">아직 검출된 인용이 없습니다.<br/>LLM 답변이 출력되면 자동으로 확인합니다.</div>`;
      } else {
        let html = '';
        // Order: 확인 불가 → 조문 미확인 → 약칭 → 확인.
        // 가장 위험한 인용이 맨 위에 와서 사용자가 곧장 조치하도록.
        // 확인 불가 그룹(빨강)은 NOT_FOUND → ARTICLE_GAP → REPEALED 순.
        const order = [
          STATUS.NOT_FOUND,
          STATUS.ARTICLE_GAP,
          STATUS.REPEALED,
          STATUS.LAW_ONLY,
          STATUS.ALIAS_MATCH,
          STATUS.VERIFIED,
        ];
        for (const status of order) {
          for (const [id, v] of citations.entries()) {
            if (v.status === status) html += renderCard(id, v);
          }
        }
        cards.innerHTML = html;
        // Build cardEls map.
        cards.querySelectorAll('.card').forEach((el) => {
          cardEls.set(el.dataset.citationId, el);
        });
      }
      refreshSummary();
      refreshToggleAppearance();
    }

    function addCitation(id, verification) {
      citations.set(id, verification);
      rerender();
    }

    function focusCard(id) {
      open();
      const el = cardEls.get(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.animate(
          [{ background: '#334155' }, { background: '#1e293b' }],
          { duration: 800, easing: 'ease-out' }
        );
      }
    }

    return {
      addCitation,
      focusCard,
      open,
      close: closePanel,
      _shadowRoot: shadow
    };
  }

  global.LexGuardSidebar = { install, escapeHtml };
})(typeof window !== 'undefined' ? window : globalThis);
