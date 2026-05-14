# LexGuard KR

> LLM 답변 속 한국 법령·조문 인용이 현행 법령에 실재하는지 로컬에서 1차 확인하는 Chrome 확장. 모든 검증은 기기 안에서 이루어지며 어떤 데이터도 외부로 전송되지 않습니다.
>
> Chrome extension that locally verifies whether Korean statutory citations in LLM responses point to real, current laws. All checks run on-device; nothing leaves your browser.

---

## 무엇을 검증하나 / What it checks

ChatGPT · Gemini · Claude.ai 응답 화면에서 법령·조문 인용을 감지하고, 6가지 상태로 분류해 색깔과 툴팁으로 표시합니다.

| 상태 | 색깔 | 의미 |
|---|---|---|
| **VERIFIED** | 🟢 초록 | 법령 + 조문 모두 현행 인덱스에 존재 |
| **LAW_ONLY** | 🟡 노랑 | 법령은 있는데 조문번호는 미확인 |
| **ALIAS_MATCH** | 🟡 노랑 | 약칭(예: 개보법, AI기본법)으로 매칭됨 |
| **NOT_FOUND** | 🔴 빨강 | 법령명 자체를 확인 불가 |
| **REPEALED** | 🔴 빨강 | 폐지된 법령 (현재 데이터엔 미수록 — 향후 확장 예정) |
| **ARTICLE_GAP** | 🔴 빨강 | 조문번호가 현행 법령 범위를 크게 초과 (환각 가능성 높음) |

**검증하지 않는 것**: 조문 내용의 해석, 법적 타당성, 적용 가능성. 이 도구는 "그 조문이 실재하는가?"만 본다.

---

## 데이터 / Data source

- **출처**: [Legalize KR](https://github.com/legalize-kr/legalize-kr) — 국가법령정보센터의 법령 데이터를 Markdown으로 정리한 오픈 데이터셋
- **현재 인덱스 규모**: 5,706개 법령 · 201,480개 조문
- **갱신**: `.github/workflows/build-index.yml`이 매일 자동으로 Legalize KR을 sparse-clone해 인덱스를 재빌드

---

## 설치 / Install

1. 이 저장소를 클론하거나 ZIP으로 다운로드
2. Chrome 주소창에 `chrome://extensions` 입력
3. 우상단 "개발자 모드" 활성화
4. "압축 해제된 확장 프로그램 로드" 클릭 → `extension/` 폴더 선택
5. ChatGPT / Gemini / Claude.ai 에서 법령 인용이 있는 응답을 받아보면 자동 하이라이트

---

## 직접 빌드 / Local dev

```bash
# 1) 인덱스 빌드
python3 scripts/build_index.py \
  --source <path-to-legalize-kr-clone>/kr \
  --out extension/data

# 2) 테스트
npm install
npm test    # parser / verifier / DOM smoke 56/56
```

빌드된 `extension/data/law-index.json`은 저장소에 함께 포함되어 있어 클론 즉시 사용 가능합니다.

---

## 보조 도구 위치 / Where this fits

- **법령/조문 존재 여부 검증** → 이 도구
- **사건번호(판례) 존재 여부 검증** → [법고개](https://github.com/legalize-kr) (별도 확장 예정)

서로 보완 관계입니다. LexGuard는 법령만, 법고개는 판례만 봅니다.

---

## 면책 / Disclaimer

- 본 확장은 **법령 인용의 존재 여부만** 확인합니다. 변호사·법무사 등 자격 있는 전문가의 자문을 대체하지 않습니다.
- 인덱스는 매일 갱신되지만, 시점 차이로 인한 누락·오류가 있을 수 있습니다. 중요한 판단 전에는 반드시 [국가법령정보센터](https://www.law.go.kr) 원문을 확인하세요.
- 폐지 법령은 현재 인덱스에 수록되어 있지 않습니다 (`docs/KNOWN_ISSUES.md` #10 참조). REPEALED 상태는 향후 법제처 OpenAPI 연동 시 활성화됩니다.
- 이 도구의 결과로 발생한 손해에 대해 저자는 책임을 지지 않습니다.

---

## 라이선스 / License

MIT License. `LICENSE` 파일 참조.

Legalize KR 데이터는 해당 프로젝트의 라이선스를 따릅니다.
