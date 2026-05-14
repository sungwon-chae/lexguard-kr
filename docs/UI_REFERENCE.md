# LexGuard KR — UI Reference

## Color System
All colors must match exactly. Do not substitute.

| Status       | Underline  | Background              | Extra              |
|--------------|------------|-------------------------|--------------------|
| VERIFIED     | #3b82f6    | rgba(59,130,246,0.12)   | —                  |
| LAW_ONLY     | #f59e0b    | rgba(245,158,11,0.12)   | —                  |
| ALIAS_MATCH  | #22c55e    | rgba(34,197,94,0.12)    | —                  |
| NOT_FOUND    | #ef4444    | rgba(239,68,68,0.12)    | text-decoration: line-through |

Underline style: border-bottom: 2px solid {color}
Strikethrough color must match underline color.

## Sidebar
Background: #0f172a
Text primary: #f1f5f9
Text secondary: #94a3b8
Text muted: #64748b
Card background: #1e293b
Card border: #334155
Width: 360px
Slide-in: right: -380px → right: 0, transition 0.25s cubic-bezier(0.4,0,0.2,1)

## Status Badge Colors (inside sidebar card)
VERIFIED:    background #1e3a8a, color #93c5fd, border #1e40af
LAW_ONLY:    background #451a03, color #fbbf24, border #78350f
ALIAS_MATCH: background #14532d, color #4ade80, border #166534
NOT_FOUND:   background #450a0a, color #f87171, border #7f1d1d

## Toggle Button
Position: fixed, bottom 24px, right 24px
Size: 44px × 44px, border-radius 50%
Background: #1e293b
Icon: ⚖ (U+2696)
Border changes by worst status on page:
  Any NOT_FOUND     → border: 2px solid #ef4444 + pulse animation
  Any LAW_ONLY      → border: 2px solid #f59e0b + pulse animation
  Any ALIAS_MATCH   → border: 2px solid #22c55e (no pulse)
  All VERIFIED      → border: 2px solid #3b82f6

## Tooltip Copy (exact strings)

### VERIFIED
상태: 현행 법령에서 조문 확인
조문명: {article_title}
법령종류: {law_type}
시행: {effective_date}
※ 조문 내용의 해석·법적 타당성은 검증하지 않습니다

Conditional extra lines (v0.1.1+):
- If law is "frequently amended" (high_amendment_frequency OR
  amendment_count ≥ 5 OR last_amended within 2 years):
    ※ 자주 개정되는 법령 (최근 개정: {last_amended_date})
    　조문 위치가 변경됐을 수 있으니 원문 확인 권장
- If article entry has is_new=true and newly_added date:
    ※ {newly_added}에 신설된 비교적 새 조문입니다

### LAW_ONLY
상태: 법령 확인 / 조문({article_no}) 미확인
법령명: {law_name}
※ LLM 환각 가능성을 배제할 수 없습니다
※ 원문을 반드시 확인하세요

### ALIAS_MATCH (with article)
상태: 약칭 매칭 후 조문 확인
약칭: {raw_name} → {normalized_name}
조문명: {article_title}
※ 약칭 매핑 오류 가능성을 고려하세요

### ALIAS_MATCH (without article)
상태: 약칭 매칭 / 조문 미확인
약칭: {raw_name} → {normalized_name}
※ LLM 환각 가능성을 배제할 수 없습니다

### NOT_FOUND
상태: 법령명 확인 불가
※ AI 환각(Hallucination)일 가능성이 높습니다
※ 인용 전 원문 출처를 반드시 확인하세요

## Sidebar Footer (always visible)
본 도구는 법령·조문 인용의 존재 여부만 1차 확인합니다.
조문 내용의 해석, 판례 법리, 답변의 법적 타당성은 검증하지 않습니다.

## "미확인 조문 복사" Button
Appears in sidebar when any LAW_ONLY or NOT_FOUND citations exist.
Label: "미확인 조문 목록 복사"
Copies as plain text, one per line:
  [미확인] 개인정보 보호법 제28조의9
  [확인불가] 세금법 제99조
