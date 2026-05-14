# Legalize KR — Real File Structure Sample

## Directory structure
legalize-kr/
└── kr/
    ├── 개인정보 보호법/
    │   └── 법률.md
    ├── 민법/
    │   └── 법률.md
    ├── 정보통신망 이용촉진 및 정보보호 등에 관한 법률/
    │   └── 법률.md
    └── ...

## Sample file: kr/개인정보 보호법/법률.md

---
title: 개인정보 보호법
id: 15715
type: 법률
enforcement_date: '2024-03-15'
status: 현행
---

# 개인정보 보호법

## 제1장 총칙

##### 제1조(목적)

이 법은 개인정보의 처리 및 보호에 관한 사항을 정함으로써...

##### 제2조(정의)

이 법에서 사용하는 용어의 뜻은 다음과 같다.

##### 제15조(개인정보의 수집·이용)

① 개인정보처리자는 다음 각 호의 어느 하나에 해당하는 경우에는...

##### 제28조의2(가명정보의 처리 등)

① 개인정보처리자는 통계작성, 과학적 연구...

## Notes for build_index.py

1. Front matter field names to check:
   - title OR name → law_name
   - type OR law_type → law_type
   - enforcement_date OR effective_date OR 시행일 → effective_date
   - status OR 상태 → status

2. Article heading regex (primary):
   ^#{2,6}\s+제\s*(\d+조(?:의\d+)?)\s*\(([^)]*)\)

3. Article heading regex (no-title fallback):
   ^#{2,6}\s+제\s*(\d+조(?:의\d+)?)\s*$

4. source_url construction if not in front matter:
   https://www.law.go.kr/법령/{law_name_no_spaces}

5. Skip files named: README.md, CHANGELOG.md, INDEX.md, index.md
