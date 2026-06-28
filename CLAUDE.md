# 로스트아크 카카오봇 (lopec_sybot.js)



## 코딩 가이드라인 (모든 작업에 항상 적용 — andrej-karpathy-skills:karpathy-guidelines)

1. **코딩 전 생각하기** — 가정을 명시할 것. 불확실하면 가정하지 말고 물어볼 것. 여러 해석이 가능하면 임의로 고르지 말고 제시할 것. 더 단순한 방법이 있으면 말할 것.
2. **단순함 우선** — 요청한 것 이상의 기능/추상화/유연성을 추가하지 말 것. 발생할 수 없는 상황에 대한 에러 처리를 만들지 말 것.
3. **외과적 수정** — 요청과 직접 관련 없는 코드/주석/포맷팅은 건드리지 말 것. 기존 스타일을 따를 것. 이번 변경으로 생긴 미사용 import/변수만 정리하고, 원래 있던 죽은 코드는 삭제 대신 언급만 할 것.
4. **목표 기반 실행** — 작업을 검증 가능한 목표로 변환할 것 (예: "버그 수정" → "재현 테스트 작성 후 통과시키기"). 멀티스텝 작업은 단계별 계획과 각 단계의 검증 방법을 먼저 제시할 것.



## 현재 상태

- `ㅍㅉ (캐릭터명)` 명령어는 원래의 팔찌 옵션 출력으로 동작 (퍼센트 표시 없음)
- 팔찌 퍼센트 표시 기능은 **기술적 한계**로 일시 보류 (아래 "조사 결과" 참조)



## 🚫 시도 실패 기록 — 팔찌 퍼센트 (lopec.kr "21.16%")

### 결론
**Jsoup으로는 절대 불가능.** lopec.kr이 CSR로 리뉴얼되면서 팔찌 퍼센트는 클라이언트 JavaScript에서 계산해 DOM에 채워넣는 방식으로 변경됨.

### 검증 (직접 확인 완료)
브라우저 `Ctrl + U` (페이지 소스 보기) = Jsoup이 받는 정적 HTML과 동일.

| 데이터 | 정적 HTML 존재 | Jsoup 추출 가능 |
|---|---|---|
| 아이템 레벨 (1787.5) | ✅ | ✅ (`lopec_sybot.js` 이미 사용) |
| 스펙 점수 (7573.06) | ✅ | ✅ (`lopec_sybot.js` 이미 사용) |
| 티어 (에스더) | ✅ | ✅ (`lopec_sybot.js` 이미 사용) |
| 전체/직업 랭킹 | ✅ | ✅ (`lopec_sybot.js` 이미 사용) |
| **팔찌 퍼센트 (21.16%)** | ❌ | ❌ |
| `<div data-testid="quality-bar">` 내부 텍스트 | "고대" (placeholder) | "고대"만 반환됨 |

### 추가 조사
- `__NEXT_DATA__` JSON: ❌ 퍼센트 없음
- Next.js 스트리밍 데이터 (`self.__next_f.push`): `bangle: { grade:"고대", tier:4, leapPoint:18, ... }` 까지만 있고 퍼센트 없음
- F12 Network 탭 XHR/Fetch: ❌ 퍼센트를 반환하는 외부 API 없음
- lopec.kr 내부 `/api` 경로: ❌ 없음

### 봇 다운 원인
- `sybot_LostArk.js` 스코프에 `Jsoup` 전역 import가 없음 (`lopec_sybot.js`에만 `const Jsoup = Java.type("org.jsoup.Jsoup")` 가 있음)
- Thread 안에서 미정의 `Jsoup` 호출 → Rhino 런타임 에러로 봇 크래시
- 만약 향후 다시 시도한다면 반드시 함수 내부에서 `Java.type("org.jsoup.Jsoup")` 로 로드할 것



## 향후 가능한 해결 방안 (모두 추가 작업 필요)

1. **leapPoint 기반 자체 계산** (확률적)
   - Next.js 스트리밍 데이터에서 `leapPoint: 18` 추출 가능
   - 데이터 포인트 1개 기준: `leapPoint=18` ↔ `21.16%` → `max ≈ 85` (고대 4T)
   - 등급(고대/유물/전설/영웅/희귀)/티어(4T/3T/2T) 조합별 max 테이블 필요 → 정확도 떨어짐

2. **Puppeteer 헤드리스 브라우저 활용**
   - 프로젝트에 `lopec_server.js`가 있지만 lopec.kr CSR 리뉴얼 이후 미사용 상태
   - 다시 활성화하려면 서버 코드 수정 + 항상 켜둬야 함

3. **lopec.kr 정책 변경 모니터링**
   - 향후 lopec.kr이 SSR에 퍼센트를 포함하거나 공개 API를 제공하면 즉시 가능



## 기존 코드 구조 참고

- 로펙 SSR 정적 데이터 조회: Jsoup으로 lopec.kr 직접 파싱 (점수/티어/랭킹 등)
- 로스트아크 공식 API: httpGetUtf8() + `config.LOSTARK_API_KEY`
- 비동기: new Thread(() => { ... }).start() 패턴
- 에러 처리: handleApiError() 함수 활용
- 설정값: config.LOSTARK_API_KEY, config.JS_KEY 등 config.json에서 로드
