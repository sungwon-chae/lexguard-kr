// content.js — MutationObserver watching LLM response containers per site
// adapter, injects highlights, handles streaming debounce.
// Highlights are injected with inline styles in the host page (light styles)
// while sidebar/tooltip live in Shadow DOM (heavy styles). See KNOWN_ISSUES.md #1.

(function () {
  'use strict';

  if (window.__lexguard_kr_loaded) return;
  window.__lexguard_kr_loaded = true;

  const STATUS = LexGuardVerifier.STATUS;

  // ── Site adapters ────────────────────────────────────────────────────────
  // Keep selectors in one place — they break frequently (KNOWN_ISSUES.md #5).
  const SITE_ADAPTERS = {
    'chatgpt.com': {
      assistantSelector: "div[data-message-author-role='assistant']",
      contentSelector: '.markdown'
    },
    'gemini.google.com': {
      assistantSelector: 'message-content',
      contentSelector: '.markdown'
    },
    'claude.ai': {
      // Selector candidates (matched in order via OR):
      //   .font-claude-response: response body container class. Anthropic
      //     also registers this as a CSS variable, so it's the most stable
      //     identifier currently exposed.
      //   [data-is-streaming]: whole-turn wrapper present during streaming
      //     AND after completion — covers both states.
      // Two selectors together give DOM-change resilience.
      //
      // contentSelector stays null so we walk the full subtree per the
      // multi-paragraph rendering pattern (see earlier KNOWN_ISSUES.md).
      assistantSelector: ".font-claude-response, [data-is-streaming]",
      contentSelector: null
    }
  };

  function currentAdapter() {
    const host = location.hostname;
    for (const key of Object.keys(SITE_ADAPTERS)) {
      if (host === key || host.endsWith('.' + key)) return SITE_ADAPTERS[key];
    }
    return null;
  }

  // ── Highlight colors (mirrors UI_REFERENCE.md exactly) ───────────────────
  const HIGHLIGHT_STYLE = {
    VERIFIED:    'border-bottom: 2px solid #3b82f6; background: rgba(59,130,246,0.12); padding: 0 1px; border-radius: 2px;',
    LAW_ONLY:    'border-bottom: 2px solid #f59e0b; background: rgba(245,158,11,0.12); padding: 0 1px; border-radius: 2px;',
    ALIAS_MATCH: 'border-bottom: 2px solid #22c55e; background: rgba(34,197,94,0.12); padding: 0 1px; border-radius: 2px;',
    NOT_FOUND:   'border-bottom: 2px solid #ef4444; background: rgba(239,68,68,0.12); padding: 0 1px; border-radius: 2px; text-decoration: line-through; text-decoration-color: #ef4444;',
    REPEALED:    'border-bottom: 2px solid #ef4444; background: rgba(239,68,68,0.12); padding: 0 1px; border-radius: 2px; text-decoration: line-through; text-decoration-color: #ef4444;',
    ARTICLE_GAP: 'border-bottom: 2px solid #ef4444; background: rgba(239,68,68,0.12); padding: 0 1px; border-radius: 2px; text-decoration: line-through; text-decoration-color: #ef4444;'
  };

  // ── Tooltip (Shadow DOM, single instance, repositioned per hover) ────────
  const TOOLTIP_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .tooltip {
      position: fixed;
      max-width: 260px;
      background: #0f172a;
      color: #f1f5f9;
      border: 1px solid #334155;
      border-radius: 5px;
      padding: 6px 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo",
        "Noto Sans KR", sans-serif;
      font-size: 11px;
      line-height: 1.3;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      pointer-events: none;
      z-index: 2147483647;
      opacity: 0;
      transition: opacity 0.12s;
      white-space: pre-wrap;
    }
    .tooltip.show { opacity: 1; }
    .tooltip .title {
      font-weight: 600;
      margin: 0;
      display: flex; align-items: center; gap: 5px;
    }
    .tooltip .dot {
      width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
    }
    .tooltip .dot.VERIFIED { background: #3b82f6; }
    .tooltip .dot.LAW_ONLY { background: #f59e0b; }
    .tooltip .dot.ALIAS_MATCH { background: #22c55e; }
    .tooltip .dot.NOT_FOUND { background: #ef4444; }
    .tooltip .dot.REPEALED { background: #ef4444; }
    .tooltip .dot.ARTICLE_GAP { background: #ef4444; }
    .tooltip .row { color: #cbd5e1; margin-top: 1px; font-size: 11px; }
    .tooltip .note { color: #94a3b8; margin-top: 3px; font-size: 10px; }
  `;

  let _tooltipHost = null;
  let _tooltipEl = null;
  function ensureTooltip() {
    if (_tooltipEl) return _tooltipEl;
    _tooltipHost = document.createElement('div');
    _tooltipHost.style.all = 'initial';
    _tooltipHost.style.position = 'fixed';
    _tooltipHost.style.top = '0';
    _tooltipHost.style.left = '0';
    _tooltipHost.style.zIndex = '2147483647';
    _tooltipHost.style.pointerEvents = 'none';
    const sh = _tooltipHost.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>${TOOLTIP_CSS}</style><div class="tooltip" id="t"></div>`;
    document.documentElement.appendChild(_tooltipHost);
    _tooltipEl = sh.getElementById('t');
    return _tooltipEl;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Partial-contains lookups are weaker than exact/no-space — the matched
  // law name may not be the one the LLM actually meant. Surface this.
  function partialNote(v) {
    return v.matchKind === 'partial'
      ? '<div class="note">※ 법령명 부분 매칭 — 정식 명칭을 확인하세요</div>'
      : '';
  }

  // v0.1.1 — amendment-history signals.
  // A law gets the "frequent amendment" warning when (a) the build-time
  // flag high_amendment_frequency is set OR (b) amendment_count ≥ 5
  // OR (c) last_amended_date is within the last 2 years. Any of the three
  // is enough — they cover different shapes of "this might have shifted".
  const RECENT_AMEND_MS = 2 * 365 * 24 * 60 * 60 * 1000; // ~2 years
  function isLawFrequentlyAmended(lawEntry) {
    if (!lawEntry) return false;
    if (lawEntry.high_amendment_frequency) return true;
    if (typeof lawEntry.amendment_count === 'number' && lawEntry.amendment_count >= 5) return true;
    const lad = lawEntry.last_amended_date;
    if (!lad) return false;
    const t = Date.parse(lad);
    if (Number.isNaN(t)) return false;
    return (Date.now() - t) < RECENT_AMEND_MS;
  }

  function amendmentNotes(v) {
    if (!v.lawEntry) return '';
    const parts = [];
    if (isLawFrequentlyAmended(v.lawEntry)) {
      const last = v.lawEntry.last_amended_date ? escapeHtml(v.lawEntry.last_amended_date) : '';
      parts.push(
        `<div class="note">※ 자주 개정되는 법령${last ? ` (최근 개정: ${last})` : ''}` +
        `\n　조문 위치가 변경됐을 수 있으니 원문 확인 권장</div>`
      );
    }
    if (v.articleEntry && v.articleEntry.is_new && v.articleEntry.newly_added) {
      parts.push(
        `<div class="note">※ ${escapeHtml(v.articleEntry.newly_added)}에 신설된 비교적 새 조문입니다</div>`
      );
    }
    return parts.join('');
  }

  function tooltipHtmlFor(v) {
    const dot = `<span class="dot ${v.status}"></span>`;
    const pn = partialNote(v);
    if (v.status === STATUS.VERIFIED) {
      const title = v.articleEntry && v.articleEntry.title ? escapeHtml(v.articleEntry.title) : '';
      const lawType = v.lawEntry && v.lawEntry.law_type ? escapeHtml(v.lawEntry.law_type) : '';
      const eff = v.lawEntry && v.lawEntry.effective_date ? escapeHtml(v.lawEntry.effective_date) : '';
      const an = amendmentNotes(v);
      return `
        <div class="title">${dot}현행 법령에서 조문 확인</div>
        ${title ? `<div class="row">조문명: ${title}</div>` : ''}
        ${lawType ? `<div class="row">법령종류: ${lawType}</div>` : ''}
        ${eff ? `<div class="row">시행: ${eff}</div>` : ''}
        <div class="note">※ 조문 내용의 해석·법적 타당성은 검증하지 않습니다</div>
        ${an}
        ${pn}
      `;
    }
    if (v.status === STATUS.LAW_ONLY) {
      return `
        <div class="title">${dot}법령 확인 / 조문(${escapeHtml(v.articleNo)}) 미확인</div>
        <div class="row">법령명: ${escapeHtml((v.lawEntry && v.lawEntry.law_name) || v.lawNameResolved || v.lawNameRaw)}</div>
        <div class="note">※ LLM 환각 가능성을 배제할 수 없습니다
※ 원문을 반드시 확인하세요</div>
        ${pn}
      `;
    }
    if (v.status === STATUS.ALIAS_MATCH) {
      const aliasLine = `약칭: ${escapeHtml(v.lawNameRaw)} → ${escapeHtml(v.lawNameResolved || '')}`;
      if (v.articleEntry) {
        const title = v.articleEntry.title ? escapeHtml(v.articleEntry.title) : '';
        return `
          <div class="title">${dot}약칭 매칭 후 조문 확인</div>
          <div class="row">${aliasLine}</div>
          ${title ? `<div class="row">조문명: ${title}</div>` : ''}
          <div class="note">※ 약칭 매핑 오류 가능성을 고려하세요</div>
          ${pn}
        `;
      }
      return `
        <div class="title">${dot}약칭 매칭 / 조문 미확인</div>
        <div class="row">${aliasLine}</div>
        <div class="note">※ LLM 환각 가능성을 배제할 수 없습니다</div>
        ${pn}
      `;
    }
    if (v.status === STATUS.REPEALED) {
      const lawName = escapeHtml((v.lawEntry && v.lawEntry.law_name) || v.lawNameResolved || v.lawNameRaw);
      return `
        <div class="title">${dot}폐지된 법령입니다</div>
        <div class="row">${lawName}은 현행 법령이 아닙니다</div>
        <div class="note">※ AI가 폐지 법령을 현행인 것처럼 인용했을 가능성이 있습니다</div>
        ${pn}
      `;
    }
    if (v.status === STATUS.ARTICLE_GAP) {
      const lawName = escapeHtml((v.lawEntry && v.lawEntry.law_name) || v.lawNameResolved || v.lawNameRaw);
      const maxNo = (v.lawEntry && v.lawEntry.max_article_no) || 0;
      return `
        <div class="title">${dot}조문번호가 현행 법령 범위를 크게 초과합니다</div>
        <div class="row">${lawName} 최대 조문: 제${escapeHtml(String(maxNo))}조</div>
        <div class="note">※ AI 환각(Hallucination)일 가능성이 높습니다</div>
        ${pn}
      `;
    }
    // NOT_FOUND — no lawEntry, so matchKind is null and pn is empty.
    return `
      <div class="title">${dot}법령명 확인 불가</div>
      <div class="row">${escapeHtml(v.lawNameRaw)} 제${escapeHtml(v.articleNo)}</div>
      <div class="note">※ AI 환각(Hallucination)일 가능성이 높습니다
※ 인용 전 원문 출처를 반드시 확인하세요</div>
    `;
  }

  function showTooltip(targetEl, v) {
    const t = ensureTooltip();
    t.innerHTML = tooltipHtmlFor(v);
    const rect = targetEl.getBoundingClientRect();
    // Position above by default; flip below if no room.
    const TOOLTIP_W_GUESS = 320;
    const margin = 8;
    let left = rect.left;
    let top = rect.top - margin;
    // Estimate height after content set.
    requestAnimationFrame(() => {
      const tr = t.getBoundingClientRect();
      // Clamp horizontally.
      if (left + tr.width > window.innerWidth - 8) left = window.innerWidth - tr.width - 8;
      if (left < 8) left = 8;
      top = rect.top - tr.height - margin;
      if (top < 8) top = rect.bottom + margin;
      t.style.left = left + 'px';
      t.style.top  = top + 'px';
      t.classList.add('show');
    });
  }
  function hideTooltip() {
    if (_tooltipEl) _tooltipEl.classList.remove('show');
  }

  // ── Sidebar (Shadow DOM) ─────────────────────────────────────────────────
  const sidebar = LexGuardSidebar.install();

  // ── Highlight injection (operates on the host page DOM directly) ─────────
  let _idCounter = 0;
  function nextId() { return 'lg-' + (++_idCounter); }

  /**
   * Walk descendant text nodes of `root`, build a buffer + per-node map,
   * resolve each parser match to a DOM Range, and wrap with <span class=
   * "lexguard-mark"> via Range.surroundContents (single-node) or
   * extractContents + insertNode (cross-node, e.g. <a>법령명</a> 제15조).
   *
   * Pipeline:
   *   Pass A — walk text nodes, build buffer, snapshot original textContent.
   *   Pass B — findCitations on the buffer.
   *   Pass C — sort matches by startIndex DESC so each insertion does not
   *            invalidate earlier-position buffer→DOM mappings.
   *   Pass D — for each match:
   *              · resolve start/end into Range positions
   *              · skip if range touches an existing .lexguard-mark
   *              · try surroundContents → fallback extractContents
   *              · run a textContent invariant check after the swap; if it
   *                drifted, no further fallback is possible — log and move on
   *
   * Failure isolation: every per-match operation is try/catch'd so a single
   * problematic citation never tears down the rest of the pass.
   */
  // Block-level tags whose internal text should never be joined with a
  // sibling block's text for parser purposes — otherwise the bare-form
  // `{1,50}?` capture can eat across a list-item boundary and produce a
  // false positive that blocks the legitimate per-item match.
  const BLOCK_TAGS = /^(?:DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE|SECTION|ARTICLE|HEADER|FOOTER|MAIN|NAV|ASIDE|TR|TD|TH|TABLE|PRE|DD|DT|DL|FIGURE|HR|BR)$/;

  function highlightCitationsIn(root, verifyFn) {
    // Pass A — walk all text nodes once, but partition entries by the
    // closest block-level ancestor so each block gets an isolated buffer
    // and an independent findCitations call. This prevents cross-block
    // false matches and keeps Range endpoints within a single block.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        let p = node.parentNode;
        while (p && p !== root) {
          if (p.nodeType === 1 && (p.tagName === 'CODE' || p.tagName === 'PRE')) {
            return NodeFilter.FILTER_REJECT;
          }
          p = p.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    function closestBlock(node) {
      let p = node.nodeType === 1 ? node : node.parentNode;
      while (p && p !== root) {
        if (p.nodeType === 1 && BLOCK_TAGS.test(p.tagName)) return p;
        p = p.parentNode;
      }
      return root;
    }

    function nodeAncestorHasMark(node) {
      let p = node.nodeType === 1 ? node : node.parentNode;
      while (p && p !== root) {
        if (p.nodeType === 1 && p.classList && p.classList.contains('lexguard-mark')) return true;
        p = p.parentNode;
      }
      return false;
    }

    // Collect entries grouped by block.
    const blockGroups = new Map(); // blockNode → { buffer, entries: [{node, start, end}] }
    let textNode;
    while ((textNode = walker.nextNode())) {
      const block = closestBlock(textNode);
      if (!blockGroups.has(block)) blockGroups.set(block, { buffer: '', entries: [] });
      const g = blockGroups.get(block);
      g.entries.push({ node: textNode, start: g.buffer.length, end: g.buffer.length + textNode.nodeValue.length });
      g.buffer += textNode.nodeValue;
    }

    function markOne(group, m) {
      // Resolve buffer offsets within `group` into Range positions.
      const locate = (bufPos) => {
        for (let i = 0; i < group.entries.length; i++) {
          const e = group.entries[i];
          if (bufPos >= e.start && bufPos < e.end) return { node: e.node, offset: bufPos - e.start };
          if (bufPos === e.end) return { node: e.node, offset: e.node.nodeValue.length };
        }
        return null;
      };
      const startLoc = locate(m.startIndex);
      const endLoc = locate(m.endIndex);
      if (!startLoc || !endLoc) return;
      if (nodeAncestorHasMark(startLoc.node) || nodeAncestorHasMark(endLoc.node)) return;

      const before = root.textContent;
      const range = document.createRange();
      range.setStart(startLoc.node, startLoc.offset);
      range.setEnd(endLoc.node, endLoc.offset);

      const v = verifyFn(m);
      const id = nextId();
      const span = document.createElement('span');
      span.className = 'lexguard-mark';
      span.dataset.lexguardStatus = v.status;
      span.dataset.lexguardId = id;
      span.setAttribute('style', HIGHLIGHT_STYLE[v.status] || '');

      let placed = false;
      try {
        // Fast path — single text node or aligned range.
        range.surroundContents(span);
        placed = true;
      } catch (_) {
        // Cross-node — extract content and re-insert under the span.
        try {
          const contents = range.extractContents();
          span.appendChild(contents);
          range.insertNode(span);
          placed = true;
        } catch (err2) {
          // eslint-disable-next-line no-console
          console.error('[LexGuard] mark insertion failed:', err2);
        }
      }

      if (!placed) return;

      if (root.textContent !== before) {
        // eslint-disable-next-line no-console
        console.error('[LexGuard] textContent drift after marking — leaving mark in place');
        return;
      }

      span.addEventListener('mouseenter', () => showTooltip(span, v));
      span.addEventListener('mouseleave', hideTooltip);
      span.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        sidebar.focusCard(id);
      });
      sidebar.addCitation(id, v);
    }

    // Pass B/C/D — per block: findCitations on the isolated buffer, then
    // mark each match. Reverse order so earlier-position locates stay valid.
    for (const group of blockGroups.values()) {
      if (!group.buffer) continue;
      const matches = LexGuardParser.findCitations(group.buffer);
      if (!matches.length) continue;
      matches.sort((a, b) => b.startIndex - a.startIndex);
      for (const m of matches) {
        try {
          markOne(group, m);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[LexGuard] citation mark error:', err);
        }
      }
    }
  }

  // ── Observer with per-response debounce ──────────────────────────────────
  // We intentionally do NOT mark nodes as "processed once and skip forever".
  // Claude.ai streams responses in chunks; if a content block has a brief lull
  // longer than DEBOUNCE_MS, subsequent chunks would be skipped. TreeWalker
  // already rejects text nodes inside .lexguard-mark, so repeated invocations
  // are idempotent — only newly-streamed text is highlighted on later passes.
  const DEBOUNCE_MS = 800;

  function processNode(node, verifyFn) {
    if (!(node instanceof Element)) return;
    try {
      highlightCitationsIn(node, verifyFn);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[LexGuard] highlight error:', err);
    }
  }

  function scheduleProcess(node, verifyFn) {
    if (!(node instanceof Element)) return;
    // Per-node debounce timer stored on the element.
    const existing = node.__lg_timer;
    if (existing) clearTimeout(existing);
    node.__lg_timer = setTimeout(() => {
      processNode(node, verifyFn);
    }, DEBOUNCE_MS);
  }

  function start(verifyFn) {
    const adapter = currentAdapter();
    if (!adapter) return;

    // Initial sweep over anything already in the DOM.
    document.querySelectorAll(adapter.assistantSelector).forEach((el) => {
      const target = (adapter.contentSelector ? el.querySelector(adapter.contentSelector) : null) || el;
      scheduleProcess(target, verifyFn);
    });

    const observer = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        // Find the closest assistant message ancestor that mutated.
        const target = mut.target instanceof Element
          ? mut.target.closest(adapter.assistantSelector)
          : null;
        if (target) {
          const contentEl = (adapter.contentSelector ? target.querySelector(adapter.contentSelector) : null) || target;
          scheduleProcess(contentEl, verifyFn);
        }
        // Also handle freshly-added subtrees.
        for (const added of mut.addedNodes) {
          if (added instanceof Element) {
            // The added node itself might be an assistant container.
            const direct = added.matches && added.matches(adapter.assistantSelector)
              ? added
              : added.querySelector && added.querySelector(adapter.assistantSelector);
            if (direct) {
              const contentEl = (adapter.contentSelector ? direct.querySelector(adapter.contentSelector) : null) || direct;
              scheduleProcess(contentEl, verifyFn);
            }
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // ── Test hook ────────────────────────────────────────────────────────────
  // Expose highlightCitationsIn for jsdom-driven smoke tests. No effect in
  // production beyond a single window property assignment.
  if (typeof window !== 'undefined') {
    window.__lexguard_test = { highlightCitationsIn: highlightCitationsIn };
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  // Tests can set window.__lexguard_skip_autostart = true before loading
  // content.js to bypass the MutationObserver wiring.
  if (typeof window === 'undefined' || !window.__lexguard_skip_autostart) {
    LexGuardVerifier.loadIndex()
      .then(() => {
        start((citation) => LexGuardVerifier.verifyCitation(citation));
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[LexGuard] index load failed:', err);
      });
  }
})();
