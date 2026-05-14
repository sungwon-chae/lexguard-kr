// parser.js — citation regex + 약칭 normalization + article number normalization
// Detects Korean statutory citations in plain text.

(function (global) {
  'use strict';

  // 약칭 사전 (see /docs/ALIAS_DICT.md).
  // null = 단독 약칭 불가 (모호함). Self-referential entries omitted to avoid
  // ALIAS_MATCH false positives (KNOWN_ISSUES.md #7).
  const ALIAS_DICT = {
    // 개인정보
    '개보법': '개인정보 보호법',
    // "개인정보보호법" (no-space) is intentionally NOT aliased here —
    // build_index.py adds a no-space key to the index for every law, so
    // it resolves to VERIFIED via exact lookup rather than ALIAS_MATCH.
    // Per KNOWN_ISSUES.md #7, listing self-equivalent variants in this
    // dict would needlessly downgrade VERIFIED → ALIAS_MATCH.

    // 정보통신
    '정보통신망법': '정보통신망 이용촉진 및 정보보호 등에 관한 법률',
    '정통망법': '정보통신망 이용촉진 및 정보보호 등에 관한 법률',

    // 인공지능
    'AI기본법': '인공지능 발전과 신뢰 기반 조성 등에 관한 기본법',
    '인공지능기본법': '인공지능 발전과 신뢰 기반 조성 등에 관한 기본법',

    // 금융
    '전금법': '전자금융거래법',
    '특금법': '특정 금융거래정보의 보고 및 이용 등에 관한 법률',
    '자본시장법': '자본시장과 금융투자업에 관한 법률',
    '자통법': '자본시장과 금융투자업에 관한 법률',

    // 노동
    '산재법': '산업재해보상보험법',
    '산재보험법': '산업재해보상보험법',

    // 사회보험
    '건강보험법': '국민건강보험법',

    // 공정거래
    '공정거래법': '독점규제 및 공정거래에 관한 법률',
    '독점규제법': '독점규제 및 공정거래에 관한 법률',
    '표시광고법': '표시·광고의 공정화에 관한 법률',
    '전자상거래법': '전자상거래 등에서의 소비자보호에 관한 법률',

    // 소송법
    '형소법': '형사소송법',
    '민소법': '민사소송법',

    // 기본법
    '헌법': '대한민국헌법',

    // 세법
    '세법': null, // 모호 — 단독 약칭 불가
    '조세특례법': '조세특례제한법',
    '부가세법': '부가가치세법'
  };

  // Citation regex — two alternatives joined to support 「」-quoted names.
  //   Group 1: 법령명 from 「…」 form. Brackets act as strong delimiters so
  //            the suffix anchor (법/령/…) is not required → short names
  //            like "민법" (2자) match here.
  //   Group 2: 법령명 from bare form. {1,50}? + required suffix anchor
  //            gives a 2-char minimum (e.g. "민" + "법") so short statutes
  //            (민법/형법/상법/헌법…) match. Anaphoric phrases like
  //            "이 법", "그 법" are filtered post-hoc in findCitations.
  //   Group 3: 조문번호 (e.g. "15조" or "44조의7")
  //   Group 4: 항번호 (optional, e.g. "1항")
  //
  // Separator between 법령명 and 조문번호: either "(\s*)제(\s*)" or "\s+".
  // 제 is optional, but if 제 is absent at least one whitespace is required
  // — guards against "민법750조" (no separator → likely false match).
  const CITATION_REGEX =
    /(?:「([가-힣A-Za-z·ㆍ\s]{1,50}?)」|([가-힣A-Za-z·ㆍ\s]{1,50}?(?:특별법|기본법|법률|규정|규칙|법|령|조례)))(?:\s*제\s*|\s+)(\d+조(?:의\d+)?)(?:\s*제\s*(\d+항))?/g;

  // Pass-2 regex for standalone "제N조" matches that inherit the law name
  // from a preceding primary citation (same statute, listed via , · 및).
  // Lookbehind enforces a delimiter before the standalone match so that
  // unrelated text "...법제처 제17조의..." doesn't accidentally inherit.
  const STANDALONE_ARTICLE_RE =
    /(?<=[,·ㆍ및\s])\s*제\s*(\d+조(?:의\d+)?)(?:\s*제\s*(\d+항))?/g;

  // Anaphoric references that explicitly say "the same / the above law" —
  // these CAN be resolved: inherit the law name from the latest primary
  // citation, just like a bare "제N조". Unlike "이 법" / "그 법" which stay
  // in ANAPHOR_LAW_RE (too ambiguous to resolve safely).
  const ANAPHOR_REFERENCE_RE =
    /(?:같은\s*법|위\s*법|동\s*법|해당\s*법|본\s*법)\s*제\s*(\d+조(?:의\d+)?)(?:\s*제\s*(\d+항))?/g;

  // Treat ./!/?/newline between two citations as a hard break — do NOT
  // inherit law name across sentence boundaries.
  const SENTENCE_BREAK_RE = /[.!?\n]/;

  // Anaphoric phrases that the bare alternation can pick up. Filtered at
  // Pass 1 so they never become bogus primary citations.
  //   - 이/그/당 + 법: too ambiguous to resolve safely → dropped, no Pass 2
  //     recovery (would risk attaching the wrong law name).
  //   - 같은/위/동/해당/본 + 법: also filtered at Pass 1, but Pass 2 picks
  //     them up via ANAPHOR_REFERENCE_RE and inherits from the latest
  //     primary citation.
  // SUFFIX match (not anchored `^…$`): bare alt can capture connectors like
  // "와 같은 법" / "그리고 그 법" / "및 동법", and we still want to filter.
  // The (?:^|\s) anchor ensures the anaphoric token is a separate word
  // ("위민법" does not match, since the 위 there is mid-word).
  // "헌법" / "민법" etc. are NOT in this set and still match (no anaphor
  // word appears at the end with a word boundary).
  const ANAPHOR_LAW_RE = /(?:^|\s)(?:이|그|본|위|당|동|해당|같은)\s*법$/;

  // Conjunctions / adverbs / connectors that get glued to the law name by
  // the {1,50}? bare capture (e.g. "또한 민법" → "또한 민법"). Strip them
  // post-hoc and shift the citation's startIndex forward by the stripped
  // length so highlights stay aligned with the actual law name.
  // Note: longer forms ("이와 같이", "다음으로") must come BEFORE shorter
  // prefixes ("이와", "다음") in the alternation so the regex engine prefers
  // the longer match.
  const LEADING_FILLER_RE =
    /^(?:이와 같이|이와같이|다음으로|이러한|이러하|이렇듯|이처럼|아울러|나아가|더불어|먼저|다음|우선|반면|또한|다만|즉|또는|및|따라서|그러나|하지만|한편|이에|이때|특히|단|왜냐하면|만약|만일|물론|결국|따라|에서|에)\s+/;

  /**
   * Normalize a law name for index lookup.
   * Trim, collapse internal whitespace.
   */
  function normalizeLawName(name) {
    if (!name) return '';
    return name.replace(/\s+/g, ' ').trim();
  }

  /**
   * Strip all whitespace for the no-space variant lookup.
   */
  function noSpaceVariant(name) {
    if (!name) return '';
    return name.replace(/\s+/g, '');
  }

  /**
   * Normalize an article number (e.g. "제 15 조" → "15조").
   * Input from the regex is already cleaned, but be defensive.
   */
  function normalizeArticleNo(raw) {
    if (!raw) return '';
    return raw.replace(/\s+/g, '').replace(/^제/, '');
  }

  /**
   * Resolve a raw law name through the alias dict.
   * Returns:
   *   { resolved: string|null, isAlias: bool, ambiguous: bool, raw: string }
   */
  function resolveAlias(rawName) {
    const normalized = normalizeLawName(rawName);
    // Direct dict lookup.
    if (Object.prototype.hasOwnProperty.call(ALIAS_DICT, normalized)) {
      const target = ALIAS_DICT[normalized];
      if (target === null) {
        return { resolved: null, isAlias: true, ambiguous: true, raw: normalized };
      }
      // Self-referential check (defensive — should not be in dict per #7).
      if (target === normalized) {
        return { resolved: normalized, isAlias: false, ambiguous: false, raw: normalized };
      }
      return { resolved: target, isAlias: true, ambiguous: false, raw: normalized };
    }
    // No alias entry — caller treats the raw name as canonical.
    return { resolved: normalized, isAlias: false, ambiguous: false, raw: normalized };
  }

  /**
   * Find all citations in a text string.
   * Returns array of:
   *   { matchText, startIndex, endIndex, lawNameRaw, articleNo, paragraphNo }
   * matchText is the exact substring that matched.
   */
  function findCitations(text) {
    if (!text || typeof text !== 'string') return [];
    const results = [];
    let m;
    // Pass 1 — primary citations (법령명 + 조문번호).
    CITATION_REGEX.lastIndex = 0;
    while ((m = CITATION_REGEX.exec(text)) !== null) {
      // m[1] = bracketed form, m[2] = bare form — exactly one is defined.
      let lawNameRaw = ((m[1] || m[2]) || '').replace(/\s+/g, ' ').trim();
      // Skip if the captured "law name" is just a suffix (e.g. "법" alone).
      if (lawNameRaw.length < 2) continue;
      // Skip anaphoric self-references ("이 법", "그 법", …) — only fires
      // for the bare form; bracketed names are explicit and trusted.
      if (!m[1] && ANAPHOR_LAW_RE.test(lawNameRaw)) continue;

      // Strip leading conjunction/adverb fillers ("또한 민법" → "민법") —
      // only on bare form. Shift startIndex/matchText to keep the match
      // aligned with the actual law-name start so highlights are correct.
      let startIndex = m.index;
      let matchText = m[0];
      if (!m[1]) {
        const fillerMatch = LEADING_FILLER_RE.exec(lawNameRaw);
        if (fillerMatch) {
          const fillerLen = fillerMatch[0].length;
          lawNameRaw = lawNameRaw.slice(fillerLen);
          if (lawNameRaw.length < 2) continue;
          // The filler in the raw matchText may differ in whitespace count
          // from the normalized lawNameRaw form. Re-locate the filler in
          // matchText to compute the actual character shift.
          const rawFiller = LEADING_FILLER_RE.exec(matchText);
          if (rawFiller) {
            startIndex += rawFiller[0].length;
            matchText = matchText.slice(rawFiller[0].length);
          }
        }
      }

      results.push({
        matchText: matchText,
        startIndex: startIndex,
        endIndex: startIndex + matchText.length,
        lawNameRaw: lawNameRaw,
        articleNo: normalizeArticleNo(m[3]),
        paragraphNo: m[4] ? m[4].replace(/\s+/g, '') : null
      });
    }

    // Snapshot Pass-1 primaries. Anaphor / standalone passes always inherit
    // from a primary (never from another secondary match) so the chain
    // cannot drift when the active statute changes mid-sentence.
    results.sort((a, b) => a.startIndex - b.startIndex);
    const primaries = results.slice();

    // Pass 2a — "같은 법 / 위 법 / 동법 / 해당 법 / 본 법" anaphoric
    // references. Same inheritance rules as STANDALONE_ARTICLE_RE but no
    // leading-delimiter constraint (these phrases can start a sentence).
    // Run BEFORE standalone "제N조" so the standalone pass can see anaphor
    // matches in its overlap check and skip the inner "제N조".
    ANAPHOR_REFERENCE_RE.lastIndex = 0;
    let am;
    while ((am = ANAPHOR_REFERENCE_RE.exec(text)) !== null) {
      const matchText = am[0];
      const startIndex = am.index;
      const endIndex = startIndex + matchText.length;

      let overlaps = false;
      let prev = null;
      for (const r of primaries) {
        if (startIndex < r.endIndex && r.startIndex < endIndex) { overlaps = true; break; }
        if (r.endIndex <= startIndex) prev = r;
      }
      if (overlaps || !prev) continue;

      const between = text.slice(prev.endIndex, startIndex);
      if (SENTENCE_BREAK_RE.test(between)) continue;

      results.push({
        matchText: matchText,
        startIndex: startIndex,
        endIndex: endIndex,
        lawNameRaw: prev.lawNameRaw,
        articleNo: normalizeArticleNo(am[1]),
        paragraphNo: am[2] ? am[2].replace(/\s+/g, '') : null
      });
    }

    // Pass 2b — standalone "제N조" with a leading delimiter. Inherits from
    // the latest PRIMARY, but its overlap check sees all results so far
    // (including Pass 2a anaphors), so the "제N조" inside "같은 법 제N조"
    // does not produce a duplicate.
    results.sort((a, b) => a.startIndex - b.startIndex);
    const overlapSet = results.slice();
    STANDALONE_ARTICLE_RE.lastIndex = 0;
    let sm;
    while ((sm = STANDALONE_ARTICLE_RE.exec(text)) !== null) {
      let matchText = sm[0];
      let startIndex = sm.index;
      const lead = /^\s+/.exec(matchText);
      if (lead) {
        startIndex += lead[0].length;
        matchText = matchText.slice(lead[0].length);
      }
      const endIndex = startIndex + matchText.length;

      let overlaps = false;
      for (const r of overlapSet) {
        if (startIndex < r.endIndex && r.startIndex < endIndex) { overlaps = true; break; }
      }
      if (overlaps) continue;

      // prev is from primaries only — keeps inheritance source canonical.
      let prev = null;
      for (const r of primaries) {
        if (r.endIndex <= startIndex) prev = r; else break;
      }
      if (!prev) continue;

      const between = text.slice(prev.endIndex, startIndex);
      if (SENTENCE_BREAK_RE.test(between)) continue;

      results.push({
        matchText: matchText,
        startIndex: startIndex,
        endIndex: endIndex,
        lawNameRaw: prev.lawNameRaw,
        articleNo: normalizeArticleNo(sm[1]),
        paragraphNo: sm[2] ? sm[2].replace(/\s+/g, '') : null
      });
    }

    // Final pass — trim leading whitespace from each match so highlights
    // start exactly at the law-name first char ("→ 민법 제2조" no longer
    // underlines the space before 민). The bare alternation's char class
    // includes \s, so the regex can match with a leading space.
    for (const r of results) {
      const lead = /^\s+/.exec(r.matchText);
      if (lead) {
        const n = lead[0].length;
        r.matchText = r.matchText.slice(n);
        r.startIndex += n;
      }
    }

    results.sort((a, b) => a.startIndex - b.startIndex);
    return results;
  }

  global.LexGuardParser = {
    ALIAS_DICT,
    CITATION_REGEX,
    normalizeLawName,
    noSpaceVariant,
    normalizeArticleNo,
    resolveAlias,
    findCitations
  };
})(typeof window !== 'undefined' ? window : globalThis);
