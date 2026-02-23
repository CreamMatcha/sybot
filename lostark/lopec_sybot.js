const bot = BotManager.getCurrentBot();

// [설정] 카카오링크 모듈 불러오기 (GraalJS 방식)
const { KakaoApiService, KakaoShareClient } = require('kakaolink');

// [설정] Java 클래스 불러오기 (GraalJS 필수)
const Jsoup = Java.type("org.jsoup.Jsoup");
const Thread = Java.type("java.lang.Thread");

// ★ 카카오 디벨로퍼스 설정
const SERVER_URL = "http://34.64.244.233:3101/search";
const JS_KEY = "63ccd6c2bfe4e0b189d6d2eeeac77584";
const DOMAIN = "https://google.com";
const TEMPLATE_ID = 129396;

// [초기화]
const service = KakaoApiService.createService();
const client = KakaoShareClient.createClient();

let loginCookies = null;

// [로그인 함수]
function tryLogin() {
    Log.i("🔄 카카오링크 로그인 시도 중...");
    try {
        service.login({
            signInWithKakaoTalk: true,
            context: App.getContext()
        }).then(cookies => {
            loginCookies = cookies;
            Log.i("✅ 카카오링크 로그인 성공!");
        }).catch(e => {
            Log.e("⚠️ 로그인 실패: " + e);
        });
    } catch (e) { Log.e("로그인 에러: " + e); }
}

tryLogin();

bot.addListener(Event.MESSAGE, function (msg) {
    // 수동 로그인
    if (msg.content === ".카카오로그인") {
        msg.reply("로그인을 다시 시도합니다.");
        tryLogin();
        return;
    }

    // 로펙 조회
    if (msg.content.startsWith(".ㄹㅍ ") || msg.content.startsWith(".로펙 ")) {
        var name = msg.content.replace(/^(\.ㄹㅍ|\.로펙)\s+/, "").trim();
        if (!name) return;

        new Thread(() => {
            try {
                // 1. 서버 데이터 조회
                var doc = Jsoup.connect(SERVER_URL)
                    .data("name", name)
                    .ignoreContentType(true)
                    .timeout(15000)
                    .execute();

                var res = JSON.parse(doc.body());

                // ★ [수정] res.ok 체크 및 res.data 읽기
                if (res.ok && res.data) {
                    var d = res.data; // 서버 JSON 구조에 맞춰 .data로 접근

                    if (!loginCookies) {
                        tryLogin();
                        msg.reply("봇 로그인 중... 잠시 후 다시 시도해주세요.");
                        return;
                    }

                    client.init(JS_KEY, DOMAIN, loginCookies);

                    // 2. [수정] 템플릿 인자 매핑 (서버 키와 100% 일치시킴)
                    client.sendLink(msg.room, {
                        templateId: TEMPLATE_ID,
                        templateArgs: {
                            // 왼쪽: 카카오 템플릿 변수명 (템플릿 설정과 같아야 함)
                            // 오른쪽: d.서버에서_보낸_키 (방금 보여주신 코드 기준)

                            "name": d.name,
                            "tier_name": d.tier_name,       // tierName -> tier_name
                            "score": d.score,               // specPoint -> score
                            "level": d.item_level,          // 추가됨

                            // 랭킹 정보
                            "class_rank": d.class_rank,
                            "class_percent": d.class_percent,
                            "total_rank": d.total_rank,
                            "total_percent": d.total_percent,

                            // 이미지
                            "char_img": d.char_img || d.tier_img, // 캐릭터 이미지가 없으면 티어 이미지로 대체
                            "tier_img": d.tier_img,
                            "class_img": d.class_img,

                            "url": d.url
                        }
                    }, 'custom').then(sendRes => {
                        Log.i("전송 성공: " + JSON.stringify(sendRes));
                    }).catch(e => {
                        Log.e("전송 실패: " + e);
                        msg.reply("전송 실패: " + e);
                    });

                } else {
                    msg.reply("❌ 검색 실패: " + (res.error || "데이터 없음"));
                }

            } catch (e) {
                Log.e("로펙 에러: " + e);
                msg.reply("오류 발생: " + e);
            }
        }).start();
    }
});