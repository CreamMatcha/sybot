const bot = BotManager.getCurrentBot();

// ★ 카카오 디벨로퍼스 설정
const SERVER_URL = "http://34.64.244.233:3101/search";

const JS_KEY = "63ccd6c2bfe4e0b189d6d2eeeac77584";

const DOMAIN = "https://google.com";

const TEMPLATE_ID = 129396;

// [설정] 카카오링크 모듈 불러오기 (GraalJS 방식)
const { KakaoApiService, KakaoShareClient } = require('kakaolink');

// [설정] Java 클래스 불러오기 (GraalJS 필수)
const Jsoup = Java.type("org.jsoup.Jsoup");
const Thread = Java.type("java.lang.Thread");

// [초기화] 서비스 & 클라이언트 생성
const service = KakaoApiService.createService();
const client = KakaoShareClient.createClient();

// [로그인] 세션 쿠키 관리
let loginCookies = null;

function tryLogin() {
    try {
        Log.i("🔄 카카오링크 로그인 시도 중...");

        // 예제 코드 기반 로그인
        loginCookies = service.login({
            signInWithKakaoTalk: true,
            context: App.getContext() // 만약 'App is not defined' 에러가 나면 Api.getContext()로 변경
        }).awaitResult();

        Log.i("✅ 카카오링크 로그인 성공!");
    } catch (e) {
        Log.e("⚠️ 로그인 실패: " + e);
    }
}

// 스크립트 로드 시 1회 로그인 시도
tryLogin();


// [메인] 메시지 리스너
bot.addListener(Event.MESSAGE, function (msg) {
    if (msg.content.startsWith(".ㄹㅍ ") || msg.content.startsWith(".로펙 ")) {
        var name = msg.content.replace(/^(\.ㄹㅍ|\.로펙)\s+/, "").trim();
        if (!name) return;

        // msg.reply(name + " 검색 중... 🔍"); // 필요하면 주석 해제

        // 네트워크 작업은 별도 스레드에서 실행 (필수)
        new Thread(() => {
            try {
                // 1. Lopec 서버 데이터 조회 (Jsoup 사용)
                // GraalJS에서는 Jsoup.connect()로 바로 사용
                var doc = Jsoup.connect(SERVER_URL)
                    .data("name", name)
                    .ignoreContentType(true)
                    .timeout(15000)
                    .execute();

                var jsonBody = doc.body();
                var res = JSON.parse(jsonBody);

                if (res.ok) {
                    var d = res; // 서버 응답 구조에 따라 res.data 일수도 있고 res 일수도 있음 (기존 코드 참고)
                    // 만약 서버가 { ok: true, name: "...", ... } 로 바로 준다면 d = res;
                    // 만약 서버가 { ok: true, data: { ... } } 로 준다면 d = res.data;

                    // (기존 sybot 설명상: res 자체가 필드를 가짐)

                    // 2. 로그인이 풀렸으면 재로그인
                    if (!loginCookies) tryLogin();

                    // 3. 클라이언트 초기화
                    client.init(JS_KEY, DOMAIN, loginCookies);

                    // 4. 템플릿 전송
                    var sendRes = client.sendLink(msg.room, {
                        templateId: TEMPLATE_ID,
                        templateArgs: {
                            // 템플릿 변수 매핑
                            "name": d.name,
                            "tier_name": d.tierName, // 기존 JSON 키 확인 (tierName vs tier_name)
                            "specPoint": d.specPoint,
                            "remaining": d.remaining || "",
                            "url": d.url || "https://lopec.kr"
                            // 필요한 다른 인자들도 여기에 추가
                        }
                    }, 'custom').awaitResult();

                    Log.i("전송 성공: " + JSON.stringify(sendRes));

                } else {
                    msg.reply("❌ 검색 실패: " + (res.error || "데이터 없음"));
                }

            } catch (e) {
                Log.e("로펙 실행 중 에러: " + e);
                // 네트워크 에러나 로그인 에러 시 사용자에게 알림
                msg.reply("앗차차! 처리 중 문제가 생겼어요. (로그 확인)");
            }
        }).start();
    }
});