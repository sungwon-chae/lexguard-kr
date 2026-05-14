# LexGuard KR — Known Issues & Design Constraints

These are real bugs encountered by 법고개 (a similar extension for case 
numbers). Avoid repeating them.

## 1. CSS Conflict with Host Pages (CRITICAL)
ChatGPT, Claude, Gemini all have their own CSS that conflicts with 
extension-injected styles.

Symptoms: tooltips render as unstyled text, sidebar breaks in dark mode,
highlight colors override host text colors.

Solution: Use Shadow DOM for sidebar and tooltip elements.
Do NOT use regular DOM injection for these components.

Implementation pattern:
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${CSS_STRING}</style>${HTML_STRING}`;
  document.body.appendChild(host);

## 2. Multiple Citations in One Sentence (CRITICAL)
When a sentence contains multiple citations back-to-back, only the first
gets processed because DOM node replacement invalidates subsequent ranges.

Example:
  "개인정보 보호법 제15조, 제17조, 제18조에 따르면..."

Solution: Process text node replacements in reverse order.
When replacing text ranges within a single text node, sort matches by
startIndex descending and apply replacements from right to left.

## 3. Streaming Response Double-Processing
LLM responses stream in chunks. Without debouncing, the extension processes
each partial chunk, causing duplicate highlights.

Solution: 800ms debounce on MutationObserver callbacks per response node.
Mark processed nodes with data-lexguard-processed="1".
Clear the debounce timer on each new mutation for the same node.

## 4. Large Index Memory on Update
If index exceeds ~50MB uncompressed, loading it all at once can freeze the
extension background.

Current mitigation: Brotli compression (law-index.json.br).
If index grows large in future: consider chunked loading or IndexedDB.

## 5. Host Page Selector Drift
ChatGPT, Gemini, Claude update their DOM structure frequently. Selectors
break silently — the extension just stops working.

Site adapter selectors should be easy to find and update (keep them in a
single SITE_ADAPTERS const at the top of content.js).

## 6. XSS via Citation Content
Citation text from DOM gets inserted into innerHTML for highlighting.
Always escape HTML entities before inserting into innerHTML.

Escape function required:
  str.replace(/&/g,'&amp;').replace(/</g,'&lt;')
     .replace(/>/g,'&gt;').replace(/"/g,'&quot;')

## 7. Self-Referential Alias Entries
In the alias dict, entries like "민법": "민법" cause isAlias=true for
direct law names, incorrectly flagging VERIFIED as ALIAS_MATCH.
Only include entries where the key differs from the value.

## 8. Legalize KR Sub-Article Suffix Loss
Observation (2026-05): some Legalize KR markdown files render sub-articles
(제44조의2, 제44조의7, …) as bare `##### 제44조` headings repeated multiple
times. The body text correctly references the suffixed form, but the heading
parser only captures "44조", so article-level lookups for "44조의7" miss.

Impact: VERIFIED downgrades to LAW_ONLY (direct lookup) or ALIAS_MATCH
without article confirmation (alias path). Tooltip copy is appropriate either
way ("조문 미확인" / "원문을 반드시 확인하세요"), so users are not misled.

Do NOT work around this in the parser/verifier — fixing it requires either:
  a) upstream fix in Legalize KR, or
  b) parsing article bodies for "제N조의M" references during build.
Both are out of MVP scope.

## 9. Brotli in Browser
Chrome's DecompressionStream does not support brotli natively.
Options:
  A) Ship law-index.json (uncompressed) and rely on HTTP compression for
     extension package — simplest for MVP
  B) Use a JS brotli decoder (wasm-based) — adds bundle size
  C) Build pipeline outputs plain .json renamed to .json.br as fallback

Recommended for MVP: Option A. Use plain JSON, rename build output to
law-index.json. The extension package itself is compressed by Chrome.

## 10. REPEALED 분기는 현재 트리거되지 않음
Legalize KR 데이터셋은 현행("시행") 법령만 수록함.
REPEALED STATUS 분기는 코드에 구현되어 있으나
현재 인덱스로는 실제로 발동되지 않음.
폐지 법령을 다루려면 법제처 OpenAPI의 폐지법령
리스트를 별도 수집하는 파이프라인이 필요함.
→ v0.3 로드맵으로 미룸.

## 11. Anaphor 해소 정책
한국어 법률 텍스트는 같은 법령을 반복 인용할 때
조사·지시어로 축약하는 관행이 있음. parser.js는 다음과 같이 처리:

해소 (resolve) — 직전 primary citation의 lawNameRaw 상속:
  같은 법, 위 법, 동 법, 동법, 해당 법, 본 법
  → ANAPHOR_REFERENCE_RE (Pass 2a)
  → 직전 primary로부터 법령명 이어받음
  → 문장 경계(.!?\n)는 차단

필터 (drop) — Pass 1에서 캡처 자체를 폐기:
  이 법, 그 법, 당 법
  → ANAPHOR_LAW_RE
  → "이 법"은 self-reference라 어느 법인지 결정 곤란,
    "그 법"도 마찬가지로 모호성이 큼 → 잘못된 추론 위험
  → 해소 대상에서 제외, 단순 필터

bare 정규식이 "와 같은 법", "그리고 그 법", "및 동법" 같이
조사·접속사가 붙은 형태를 통째로 캡처하는 케이스 대비:
ANAPHOR_LAW_RE는 anchored가 아닌 SUFFIX 매칭
( (?:^|\s)anaphor\s*법$ ) 으로 단어 경계 보호.

## 12. 조문 renumbering 직접 매핑 불가 — 간접 신호로 대체
Legalize KR 데이터에는 옛 조문번호 → 현재 조문번호의 명시적
매핑이 존재하지 않음 (국가법령정보센터 원본에도 없음).
"민법 제3조가 개정으로 제5조로 이동" 같은 케이스를
직접 감지할 수단은 현재 데이터 소스만으로는 없음.

대신 v0.1.1부터 다음 간접 신호를 제공해 사용자가
원문 확인할 동기를 부여한다:

법령 수준 메타 (build_index.py가 git log에서 추출):
  - amendment_count
  - last_amended_date
  - amendment_timeline (date, type)
  - enacted_date
  - high_amendment_frequency (최근 5년 ≥3회 개정)

조문 수준 메타 (build_index.py가 본문 inline marker에서):
  - last_amended (<개정 …>의 최근 일자)
  - amendment_dates (상위 5개)
  - is_new + newly_added (<신설 …>의 일자)

content.js VERIFIED 툴팁이 위 메타로 다음 조건에서 안내:
  - 법령이 자주 개정 → "조문 위치 변경 가능" 안내
  - 조문이 신설 표기 → "비교적 새 조문" 안내

v0.2 로드맵: git diff 기반 자동 renumbering 추정 시도 예정.
조문 본문 텍스트 유사도 매칭으로 한 commit 안에서 옛 위치
→ 새 위치 후보를 뽑아낼 수 있을지 실험 단계.
