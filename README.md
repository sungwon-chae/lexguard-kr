# LexGuard KR

**LLM이 인용한 한국 법령·조문이 실재하는지, 로컬에서 즉시 확인합니다.**

ChatGPT, Gemini, Claude가 만들어내는 법률 답변에는 그럴듯하지만 존재하지 않는 조문이 섞여 있습니다. LexGuard KR은 응답 화면에 나타난 법령 인용을 실시간으로 감지해 현행 법령 인덱스와 대조하고, 색상으로 신뢰도를 표시합니다. 모든 검증은 기기 안에서 이루어지며 사용자의 질문이나 답변은 외부로 전송되지 않습니다.

> Chrome extension that locally verifies whether Korean statutory citations in LLM responses point to real, current laws. All processing happens on-device — nothing leaves your browser.

<br>

## 왜 필요한가

LLM은 법률 답변에서 자주 가짜 조문을 만듭니다.

> "개인정보 보호법 제28조의9에 따르면 foundation model 사업자는…"

이 조문은 존재하지 않습니다. 하지만 형식이 자연스러워 변호사·법무 담당자조차 일일이 국가법령정보센터를 찾아보지 않으면 알기 어렵습니다. LexGuard KR은 이 1차 검증을 자동화합니다.

**이 도구가 하는 일**
- 법령명과 조문번호가 현행 인덱스에 실재하는지 확인
- 존재하지 않는 조문번호 식별
- 약칭(개보법, AI기본법, 정통망법 등) 정규화

**이 도구가 하지 않는 일**
- 조문 내용의 해석
- 법적 타당성 판단
- 판례·사건번호 검증

<br>

## 검증 결과

응답 화면의 법령 인용에 색깔 밑줄이 그어지고, 마우스를 올리면 상세 정보가 표시됩니다.

### 초록 — 확인됨

`VERIFIED` 법령과 조문 모두 현행 인덱스에 존재합니다.

### 노랑 — 주의 필요

`LAW_ONLY` 법령은 인덱스에 있으나 해당 조문번호를 찾을 수 없습니다.
`ALIAS_MATCH` 약칭으로 매칭되었습니다. 정식 명칭을 확인하세요.

### 빨강 — 인용 부적합

`ARTICLE_GAP` 조문번호가 현행 법령의 범위를 크게 초과합니다.
`NOT_FOUND` 법령명을 인덱스에서 찾을 수 없습니다.
`REPEALED` 폐지된 법령입니다. (현재 데이터셋 미수록, v0.3 예정)

빨강 상태는 취소선과 함께 표시되어 "인용하지 말 것"을 시각적으로 알립니다.

<br>

## 데이터 출처

- **[Legalize KR](https://github.com/legalize-kr/legalize-kr)** — 국가법령정보센터 OpenAPI 기반 법령 Markdown 데이터셋
- **현재 인덱스 규모**: 5,706개 법령 / 201,480개 조문
- **자동 갱신**: GitHub Actions가 매일 03:00 KST에 Legalize KR을 sparse clone해 인덱스를 재빌드하고 커밋합니다. 별도 작업 없이 항상 최신 상태가 유지됩니다.

법령 원문은 [국가법령정보센터](https://www.law.go.kr) 공공저작물(공공누리 제1유형)을 Legalize KR이 가공·배포한 것을 다시 사용합니다.

<br>

## 설치

### 일반 사용자

1. 이 저장소를 클론하거나 [ZIP 다운로드](https://github.com/sungwon-chae/lexguard-kr/archive/refs/heads/main.zip)
2. Chrome 또는 Edge 주소창에 `chrome://extensions` (Edge는 `edge://extensions`)
3. 우측 상단 **개발자 모드** 활성화
4. **압축해제된 확장 프로그램 로드** 클릭 → `extension/` 폴더 선택
5. ChatGPT, Gemini, Claude.ai에서 법령 인용이 포함된 응답을 받으면 자동으로 하이라이트됩니다

Legalize KR을 별도로 다운로드할 필요가 없습니다. 빌드된 인덱스(`extension/data/law-index.json`)가 저장소에 포함되어 있습니다.

### 개발자

인덱스를 직접 재빌드하거나 코드를 수정하려는 경우:

```bash
# Legalize KR 클론
git clone https://github.com/legalize-kr/legalize-kr.git ../legalize-kr

# 인덱스 빌드
python3 scripts/build_index.py \
  --source ../legalize-kr/kr \
  --out extension/data

# 테스트
npm install
npm test
```

테스트는 parser / verifier / DOM 시뮬레이션 4개 스위트, 총 56케이스를 실행합니다.

<br>

## 지원하는 인용 패턴

실전 LLM 응답에서 나오는 다양한 표기를 인식합니다.

- `개인정보 보호법 제15조` — 기본형
- `「민법」 제750조` — 「」 감싸기
- `민법 제750조` — 2글자 법령명
- `개보법 제23조` — 약칭
- `대한민국 민법 제750조` — 국가명 접두
- `보통 민법`, `구 민법` — 수식어 접두
- `민법 750조` — "제" 생략
- `민법 제750조, 제751조` — 연속 조문
- `또한 민법 제750조` — 접속사/필러 접두
- `민법 제750조와 같은 법 제751조` — anaphor 해소 (직전 법령 상속)
- `<a>개인정보 보호법</a> 제15조` — DOM 노드 경계를 넘는 인용

<br>

## 프라이버시

- 사용자의 질문, LLM의 응답, 그 어떤 텍스트도 외부로 전송되지 않습니다
- 모든 검증은 확장 프로그램 내부에서 로컬 인덱스 조회로만 이루어집니다
- 외부 API 호출 없음. 분석 도구 없음. 광고 없음

확장이 요청하는 권한은 ChatGPT·Gemini·Claude.ai 페이지 접근 권한뿐입니다.

<br>

## 면책

본 도구는 법령·조문 인용의 **존재 여부에 대한 1차 확인**을 보조합니다. 다음을 수행하지 않습니다.

- 조문 내용의 해석 또는 적용 판단
- 판례 법리 검증
- LLM 답변의 법적 타당성 검증
- 변호사·법무사 등 전문가의 자문 대체

인덱스는 매일 갱신되지만 시점 차이로 인한 누락이나 오류가 있을 수 있습니다. 실제 업무 또는 의사결정에 사용하기 전 반드시 [국가법령정보센터](https://www.law.go.kr) 원문을 확인하시기 바랍니다.

본 도구의 사용으로 인해 발생한 손해에 대해 작성자는 어떠한 책임도 지지 않습니다.

<br>

## 로드맵

**v0.2 (다음)**
- Chrome Web Store 정식 배포
- 시행령·시행규칙 연결
- 별표·서식 감지
- 미확인 조문 일괄 복사 단축키

**v0.3 (이후)**
- 법제처 OpenAPI 연동을 통한 폐지 법령 데이터 수집
- 개정 전후 조문 diff 링크
- 행정규칙·고시·자치법규 확장

<br>

## 기여

이슈와 PR을 환영합니다. 새로운 인용 패턴 발견, 약칭 사전 보완, 사이트 어댑터 추가 등 어떤 형태든 좋습니다.

<br>

## 라이선스

MIT. [LICENSE](LICENSE) 참조.

법령 데이터는 국가법령정보센터 공공저작물(공공누리 제1유형)을 [Legalize KR](https://github.com/legalize-kr/legalize-kr)이 가공한 것을 사용합니다. 해당 데이터의 라이선스는 원 출처를 따릅니다.
