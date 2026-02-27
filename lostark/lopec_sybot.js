const bot = BotManager.getCurrentBot();

/* ==================== [설정: 카카오링크] ==================== */

const { KakaoApiService, KakaoShareClient } = require('kakaolink');
const Jsoup = Java.type("org.jsoup.Jsoup");
const Thread = Java.type("java.lang.Thread");

// 카카오 디벨로퍼스 설정
const SERVER_URL = "http://34.64.244.233:3101/search";
const JS_KEY = "63ccd6c2bfe4e0b189d6d2eeeac77584";
const DOMAIN = "https://google.com";
const TEMPLATE_ID = 129396;

// 서비스 및 클라이언트 초기화
const service = KakaoApiService.createService();
const client = KakaoShareClient.createClient();

/** @type {any} 로그인 성공 후 저장될 쿠키 */
let loginCookies = null;

/** @type {number} 마지막으로 로그인을 시도한 날짜 (Day) */
let lastLoginDay = new Date().getDate();


/* ==================== [기능: 로그인 및 스케줄러] ==================== */

/**
 * @description 카카오링크 로그인 시도 함수
 */
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
    } catch (e) {
        Log.e("로그인 에러: " + e);
    }
}

/**
 * @description 매일 정해진 시간에 자동 로그인 및 컴파일을 수행하는 스케줄러
 */
function startScheduler() {
    // 1시간마다 체크
    setInterval(() => {
        const now = new Date();
        const currentDay = now.getDate();

        // 날짜가 변경되었는지 확인 (하루 한 번 실행)
        if (currentDay !== lastLoginDay) {
            Log.i("📅 날짜 변경 감지: 자동 로그인 및 재컴파일을 수행합니다.");
            lastLoginDay = currentDay;

            // 1. 로그인 갱신
            tryLogin();

            // 2. 스크립트 자체 재컴파일 (필요 시)
            // 컴파일 시 스크립트가 처음부터 다시 실행되므로 tryLogin()이 다시 호출됩니다.
            setTimeout(() => {
                bot.compile();
            }, 5000); // 로그인 시도 후 5초 뒤 컴파일
        }
    }, 1000 * 60 * 60); // 1시간 간격 체크
}

// 초기 실행 시 로그인 및 스케줄러 시작
tryLogin();
startScheduler();


/* ==================== [이벤트 핸들러] ==================== */

bot.addListener(Event.MESSAGE, (msg) => {
    const content = msg.content.trim();

    // 1. 수동 로그인 명령
    if (content === ".카카오로그인") {
        msg.reply("로그인을 다시 시도합니다.");
        tryLogin();
        return;
    }

    // 2. 수동 컴파일 명령 (테스트용)
    if (content === ".컴파일") {
        msg.reply("스크립트를 재컴파일합니다.");
        bot.compile();
        return;
    }

    // 3. 로펙 조회 기능
    if (/^(\.?ㄹㅍ|\.로펙)\s+/.test(content)) {
        const name = content.replace(/^(\.?ㄹㅍ|\.?로펙)\s+/, "").trim();
        if (!name) return;

        new Thread(() => {
            try {
                // 서버 데이터 조회
                const doc = Jsoup.connect(SERVER_URL)
                    .data("name", name)
                    .ignoreContentType(true)
                    .timeout(15000)
                    .execute();

                const res = JSON.parse(doc.body());

                if (res.ok && res.data) {
                    const d = res.data;

                    if (!loginCookies) {
                        tryLogin();
                        msg.reply("봇 로그인 정보가 없습니다. 로그인을 시도 중이니 잠시 후 다시 검색해주세요.");
                        return;
                    }

                    // 카카오링크 초기화 및 전송
                    client.init(JS_KEY, DOMAIN, loginCookies);

                    client.sendLink(msg.room, {
                        templateId: TEMPLATE_ID,
                        templateArgs: {
                            "name": d.name,
                            "tier_name": d.tier_name,
                            "score": d.score,
                            "level": d.item_level,
                            "class_rank": d.class_rank,
                            "class_percent": d.class_percent,
                            "total_rank": d.total_rank,
                            "total_percent": d.total_percent,
                            "char_img": d.char_img || d.tier_img,
                            "tier_img": d.tier_img,
                            "class_img": d.class_img,
                            "url": d.url
                        }
                    }, 'custom').then(sendRes => {
                        Log.i("전송 성공: " + JSON.stringify(sendRes));
                    }).catch(e => {
                        Log.e("전송 실패: " + e);
                        msg.reply("❌ 카카오링크 전송에 실패했습니다: " + e);
                    });

                } else {
                    msg.reply("❌ 검색 실패: " + (res.error || "데이터를 찾을 수 없습니다."));
                }

            } catch (e) {
                Log.e("로펙 에러: " + e);
                msg.reply("앗차차... 서버와 통신 중 오류가 발생했습니다.");
            }
        }).start();
    }
});