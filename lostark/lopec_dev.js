const bot = BotManager.getCurrentBot();

// ★ 모듈 불러오기 (Global_Modules에 'kakaolink' 폴더가 있어야 함)
const { KakaoApiService, KakaoShareClient } = require('kakaolink');

// ★ 카카오 디벨로퍼스 설정
const SERVER_URL = "http://34.64.244.233:3101/search";

const JS_KEY = "63ccd6c2bfe4e0b189d6d2eeeac77584";

const DOMAIN = "https://google.com";

const TEMPLATE_ID = 129396;

// ★ 서비스 & 클라이언트 생성
const service = KakaoApiService.createService();
const client = KakaoShareClient.createClient();

// ★ 로그인 (한 번만 실행하면 됨 - 세션 유지)
let loginCookies = null;

function tryLogin() {
    try {
        // 알아서 카톡 앱 정보를 읽어서 로그인 시도
        loginCookies = service.login({
            signInWithKakaoTalk: true,
            context: App.getContext() // 모듈이 알아서 처리함
        }).awaitResult();

        Log.i("✅ 카카오링크 자동 로그인 성공!");
    } catch (e) {
        Log.e("⚠️ 로그인 실패 (수동 로그인 필요할 수 있음): " + e);
    }
}

// 스크립트 로드 시 1회 로그인 시도
tryLogin();


bot.addListener(Event.MESSAGE, function (msg) {
    if (msg.content.startsWith(".ㄹㅍ ")) {
        var name = msg.content.substr(4).trim();
        msg.reply(name + " 검색 중... 🚀");

        new java.lang.Thread(function () {
            try {
                // 1. 서버 데이터 조회
                var jsonBody = org.jsoup.Jsoup.connect(SERVER_URL).data("name", name).ignoreContentType(true).timeout(15000).execute().body();
                var res = JSON.parse(jsonBody);

                if (res.ok) {
                    var d = res.data;

                    // 2. 로그인이 안 되어있으면 재시도
                    if (!loginCookies) tryLogin();

                    // 3. 클라이언트 초기화
                    client.init(JS_KEY, DOMAIN, loginCookies);

                    // 4. [자동 전송] 
                    var sendRes = client.sendLink(msg.room, {
                        templateId: TEMPLATE_ID,
                        templateArgs: {
                            // 기본 텍스트 정보
                            "name": d.name,
                            "tier_name": d.tier_name,
                            "score": d.score,

                            // ★ 랭킹 정보 (위/%)
                            "class_rank": d.class_rank,       // 예: 565위
                            "class_percent": d.class_percent, // 예: 0.76% (새로 추가됨)

                            "total_rank": d.total_rank,       // 예: 1,085위
                            "total_percent": d.total_percent, // 예: 0.57% (새로 추가됨)

                            // 이미지 정보
                            "char_img": d.char_img || d.tier_img,
                            "tier_img": d.tier_img
                        }
                    }, 'custom').awaitResult();

                    Log.i("전송 결과: " + JSON.stringify(sendRes));

                } else {
                    msg.reply("❌ 검색 실패: " + res.error);
                }
            } catch (e) {
                Log.e("에러: " + e);
                msg.reply("오류 발생: " + e.message);
            }
        }).start();
    }
});