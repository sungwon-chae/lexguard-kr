# LexGuard KR — Data Schema

## law-index.json top level
{
  "meta": {
    "built_at": "2025-01-01T00:00:00Z",   // ISO 8601 UTC
    "source": "Legalize KR (github.com/legalize-kr/legalize-kr)",
    "law_count": 1200,
    "article_count": 95000,
    "version": "0.1.0"
  },
  "laws": {
    "{normalized_law_name}": LawEntry,
    ...
  }
}

## LawEntry
{
  "law_name": "개인정보 보호법",           // display name
  "law_type": "법률",                      // 법률|대통령령|총리령|부령|규칙
  "effective_date": "2024-03-15",          // YYYY-MM-DD or "—"
  "status": "현행",                        // 현행|폐지|제정
  "source_url": "https://www.law.go.kr/법령/개인정보보호법",
  "legalize_path": "kr/개인정보 보호법/법률.md",
  "articles": {
    "{article_no}": ArticleEntry,
    ...
  }
}

## ArticleEntry
{
  "title": "개인정보의 수집·이용",         // from heading parens, "" if none
  "status": "현행"
}

## Article number key format
Normalized, no leading 제, no spaces:
  "15조"       ← 제15조
  "44조의7"    ← 제44조의7
  "2조의2"     ← 제2조의2

## Index keys
Primary key: normalized law name with spaces (e.g. "개인정보 보호법")
Also add no-space variant as alias key (e.g. "개인정보보호법")
Both point to the same LawEntry object.

## Lookup priority in verifier.js
1. Exact match on lawNameNormalized
2. No-space variant match
3. Partial contains match (last resort, logs warning)
