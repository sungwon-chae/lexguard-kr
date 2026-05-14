// verifier.js — loads law-index.json, performs local lookup, returns STATUS enum.
// Per /docs/KNOWN_ISSUES.md #8: ship plain JSON (no brotli decode in browser).
// Per /docs/DATA_SCHEMA.md: lookup priority is
//   1) exact normalized match, 2) no-space variant, 3) partial contains.

(function (global) {
  'use strict';

  const STATUS = Object.freeze({
    VERIFIED: 'VERIFIED',
    LAW_ONLY: 'LAW_ONLY',
    ALIAS_MATCH: 'ALIAS_MATCH',
    NOT_FOUND: 'NOT_FOUND',
    REPEALED: 'REPEALED',
    ARTICLE_GAP: 'ARTICLE_GAP'
  });

  // Article-number gap threshold:
  //   threshold = max(max_article_no * 1.5, max_article_no + 30)
  // Requested article# above this ⇒ ARTICLE_GAP (likely hallucination),
  // otherwise LAW_ONLY. The +30 floor protects small statutes (e.g. 76조)
  // where 1.5x alone would be too tight given typical amendment headroom.
  const ARTICLE_GAP_MULT = 1.5;
  const ARTICLE_GAP_ADD = 30;

  function extractArticleNumber(articleNoStr) {
    if (!articleNoStr) return 0;
    const m = /^(\d+)/.exec(String(articleNoStr));
    return m ? parseInt(m[1], 10) : 0;
  }

  let _index = null;          // resolved index object
  let _indexPromise = null;   // in-flight load
  let _indexError = null;     // last load error (for popup status)

  function indexUrl() {
    return chrome.runtime.getURL('data/law-index.json');
  }

  /**
   * Load the index once, cache for the lifetime of the content script.
   */
  function loadIndex() {
    if (_index) return Promise.resolve(_index);
    if (_indexPromise) return _indexPromise;
    _indexPromise = fetch(indexUrl())
      .then((r) => {
        if (!r.ok) throw new Error('index fetch failed: ' + r.status);
        return r.json();
      })
      .then((json) => {
        _index = json;
        return _index;
      })
      .catch((err) => {
        _indexError = err;
        _indexPromise = null; // allow retry
        throw err;
      });
    return _indexPromise;
  }

  function getLastError() {
    return _indexError;
  }

  /**
   * Look up a law entry by normalized name.
   * Returns { entry, matchKind } where matchKind ∈ { 'exact'|'nospace'|'partial'|null }.
   */
  // ChatGPT often writes "대한민국 민법", "대한민국 개인정보 보호법" — the
  // Legalize KR index does not carry the country prefix, so strip it before
  // lookup. Empirically the only legitimate top-level law starting with
  // "대한민국" is "대한민국헌법", so we re-check the original after stripping.
  const COUNTRY_PREFIX_RE = /^대한민국\s+/;

  // Gemini and other LLMs prepend qualifiers like "보통 민법", "일반 민법",
  // "구 민법", "현행 민법" — these aren't part of the canonical law name.
  // Strip and retry. Guard: result must be ≥ 2 chars to avoid degenerate
  // lookups (e.g. "구 법" → "법" alone).
  const MODIFIER_PREFIX_RE = /^(?:보통|일반|구|신|현행|개정|종전)\s+/;

  function lookupLaw(rawName) {
    if (!_index || !_index.laws) return { entry: null, matchKind: null };
    const laws = _index.laws;

    const tryDirect = (name) => {
      const normalized = LexGuardParser.normalizeLawName(name);
      if (Object.prototype.hasOwnProperty.call(laws, normalized)) {
        return { entry: laws[normalized], matchKind: 'exact' };
      }
      const noSpace = LexGuardParser.noSpaceVariant(name);
      if (Object.prototype.hasOwnProperty.call(laws, noSpace)) {
        return { entry: laws[noSpace], matchKind: 'nospace' };
      }
      return null;
    };

    // 1) Exact / no-space on the raw name (preserves "대한민국헌법" etc.).
    const direct = tryDirect(rawName);
    if (direct) return direct;

    // 2) Strip "대한민국 " prefix and retry exact / no-space.
    if (COUNTRY_PREFIX_RE.test(rawName)) {
      const stripped = rawName.replace(COUNTRY_PREFIX_RE, '');
      const retry = tryDirect(stripped);
      if (retry) return retry;
    }

    // 3) Strip qualifier prefixes (보통/일반/구/...) and retry.
    if (MODIFIER_PREFIX_RE.test(rawName)) {
      const stripped = rawName.replace(MODIFIER_PREFIX_RE, '');
      if (stripped.replace(/\s+/g, '').length >= 2) {
        const retry = tryDirect(stripped);
        if (retry) return retry;
      }
    }

    // 4) Partial contains — last resort.
    const noSpaceRaw = LexGuardParser.noSpaceVariant(rawName);
    if (noSpaceRaw.length >= 3) {
      for (const key of Object.keys(laws)) {
        if (key.indexOf(noSpaceRaw) !== -1 || noSpaceRaw.indexOf(key.replace(/\s+/g, '')) !== -1) {
          // eslint-disable-next-line no-console
          console.warn('[LexGuard] partial match:', rawName, '→', key);
          return { entry: laws[key], matchKind: 'partial' };
        }
      }
    }
    return { entry: null, matchKind: null };
  }

  /**
   * Verify a single citation parsed by parser.js.
   * Input: { lawNameRaw, articleNo, paragraphNo, matchText, ... }
   * Returns:
   *   {
   *     status: STATUS,
   *     lawNameRaw, lawNameResolved, isAlias, ambiguous,
   *     articleNo, paragraphNo,
   *     lawEntry,        // matched LawEntry or null
   *     articleEntry,    // matched ArticleEntry or null
   *     matchKind        // 'exact'|'nospace'|'partial'|null
   *   }
   */
  function verifyCitation(citation) {
    const alias = LexGuardParser.resolveAlias(citation.lawNameRaw);

    if (alias.ambiguous) {
      // 약칭 모호: e.g. "세법" — cannot resolve.
      return {
        status: STATUS.NOT_FOUND,
        lawNameRaw: citation.lawNameRaw,
        lawNameResolved: null,
        isAlias: true,
        ambiguous: true,
        articleNo: citation.articleNo,
        paragraphNo: citation.paragraphNo,
        lawEntry: null,
        articleEntry: null,
        matchKind: null
      };
    }

    const lookupName = alias.resolved || citation.lawNameRaw;
    const { entry, matchKind } = lookupLaw(lookupName);

    if (!entry) {
      // 약칭 사전에 있었지만 인덱스에는 없는 경우도 NOT_FOUND.
      return {
        status: STATUS.NOT_FOUND,
        lawNameRaw: citation.lawNameRaw,
        lawNameResolved: lookupName,
        isAlias: alias.isAlias,
        ambiguous: false,
        articleNo: citation.articleNo,
        paragraphNo: citation.paragraphNo,
        lawEntry: null,
        articleEntry: null,
        matchKind: null
      };
    }

    // 폐지된 법령은 조문 조회 전에 단락 — AI가 폐지 법령을 현행처럼
    // 인용했을 수 있음을 별도 상태로 알린다.
    if (entry.status === '폐지') {
      return {
        status: STATUS.REPEALED,
        lawNameRaw: citation.lawNameRaw,
        lawNameResolved: entry.law_name || lookupName,
        isAlias: alias.isAlias,
        ambiguous: false,
        articleNo: citation.articleNo,
        paragraphNo: citation.paragraphNo,
        lawEntry: entry,
        articleEntry: null,
        matchKind: matchKind
      };
    }

    const articleEntry =
      entry.articles && Object.prototype.hasOwnProperty.call(entry.articles, citation.articleNo)
        ? entry.articles[citation.articleNo]
        : null;

    // Status decision matrix.
    let status;
    if (alias.isAlias) {
      // Alias path → ALIAS_MATCH regardless of article existence.
      // Tooltip differentiates "with article" vs "without article" copy.
      status = STATUS.ALIAS_MATCH;
    } else if (articleEntry) {
      status = STATUS.VERIFIED;
    } else {
      // 조문이 없는 경우: max(maxNo * 1.5, maxNo + 30) 초과 시 ARTICLE_GAP.
      const requested = extractArticleNumber(citation.articleNo);
      const maxNo = entry.max_article_no || 0;
      const threshold = Math.max(maxNo * ARTICLE_GAP_MULT, maxNo + ARTICLE_GAP_ADD);
      if (maxNo > 0 && requested > threshold) {
        status = STATUS.ARTICLE_GAP;
      } else {
        status = STATUS.LAW_ONLY;
      }
    }

    return {
      status,
      lawNameRaw: citation.lawNameRaw,
      lawNameResolved: entry.law_name || lookupName,
      isAlias: alias.isAlias,
      ambiguous: false,
      articleNo: citation.articleNo,
      paragraphNo: citation.paragraphNo,
      lawEntry: entry,
      articleEntry: articleEntry,
      matchKind: matchKind
    };
  }

  global.LexGuardVerifier = {
    STATUS,
    loadIndex,
    getLastError,
    verifyCitation,
    // Exposed for popup status only.
    _getIndexMeta: () => (_index && _index.meta) || null
  };
})(typeof window !== 'undefined' ? window : globalThis);
