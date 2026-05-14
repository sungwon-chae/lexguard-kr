# LexGuard KR — Product Spec v0.1

## Problem
LLMs frequently hallucinate Korean statutory citations.
Example: "개인정보 보호법 제28조의9에 따르면 foundation model 사업자는..."
This article does not exist. Users have no way to know without checking manually.

## What This Tool Does
Formal existence check only:
1. Does this law name exist in current Korean law?
2. Does this article number exist within that law?
3. What is the official source URL?

## What This Tool Explicitly Does NOT Do
- Semantic verification of citation content
- Case number (사건번호) verification — use 법고개 for that
- Legal advice of any kind
- Any external transmission of user data

## MVP Scope
- Sites: chatgpt.com, gemini.google.com, claude.ai
- Citation types: 법령명 + 조문번호, 약칭 + 조문번호, 조/항까지
- Data: Legalize KR kr/ directory only (법령·조문)
- Out of scope: 자치법규, 행정규칙, 고시, 판례

## Architecture Decision: Local-Only
All verification runs against a local index (law-index.json.br) bundled with
the extension. No network requests from content scripts. Index is rebuilt
daily via GitHub Actions and shipped with extension updates.

## Status System
Four statuses, must not be collapsed:
- VERIFIED: law + article both confirmed
- LAW_ONLY: law confirmed, article not found in index
- ALIAS_MATCH: matched via alias dict (may have article confirmation)
- NOT_FOUND: law name itself not found

ALIAS_MATCH stays separate from VERIFIED because alias mappings can be wrong.
Users should be informed they're relying on an alias match.

## Positioning vs 법고개
법고개: 사건번호 존재 여부 (판례 DB)
LexGuard KR: 법령·조문 존재 여부 (법령 DB)
These are complementary. Recommend using both simultaneously.
