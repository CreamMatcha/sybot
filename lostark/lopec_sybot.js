const bot = BotManager.getCurrentBot();

/* ==================== [설정: 카카오링크] ==================== */

const { KakaoApiService, KakaoShareClient } = require('kakaolink');
const Jsoup = Java.type("org.jsoup.Jsoup");
const Thread = Java.type("java.lang.Thread");

// API 키
var LOSTARK_API_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6IktYMk40TkRDSTJ5NTA5NWpjTWk5TllqY2lyZyIsImtpZCI6IktYMk40TkRDSTJ5NTA5NWpjTWk5TllqY2lyZyJ9.eyJpc3MiOiJodHRwczovL2x1ZHkuZ2FtZS5vbnN0b3ZlLmNvbSIsImF1ZCI6Imh0dHBzOi8vbHVkeS5nYW1lLm9uc3RvdmUuY29tL3Jlc291cmNlcyIsImNsaWVudF9pZCI6IjEwMDAwMDAwMDAyNTQ2NjAifQ.E9LoI03kRumrluMGtS5G1XlIH0sRY7-xRWaa6G_-t_X5mhoeJqEsyz-aknmSFf8BbVX00S8Gl7TibmaQCwY5nbMARPLwfhJJ_kN3u1euaf0PWnr4hI-WnsSqt0fDfv5OWcXDaAaY21-lJwSSst9JhQbQlnvBB4dH9le0tl4ZSn_DWsvrHk972MSPJYZuHt3oggsnaD2_X8fDEjHpv3UDV1im7DWmCKUlSk-60I9al4OKxxOvaJCtAcz5rAOrEDj1XyrxaLwfvFF5jBVZiZygot6VjnuFdfyP0fmz2lKmzloXWekquDjL4mWLnubkSm5JkZvQbdS1vm2mVPu6_bFULA"; // 예) "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
var LOSTARK_BASE = "https://developer-lostark.game.onstove.com";

// 카카오 디벨로퍼스 설정
const SERVER_URL = "http://34.64.244.233:3101/search";
const JS_KEY = "63ccd6c2bfe4e0b189d6d2eeeac77584";
const DOMAIN = "https://google.com";
const LOPEC_TEMPLATE_ID = 129396;
const AVATAR_TEMPLATE_ID = 130733;


// 서비스 및 클라이언트 초기화
const service = KakaoApiService.createService();
const client = KakaoShareClient.createClient();

/** @type {any} 로그인 성공 후 저장될 쿠키 */
let loginCookies = null;

/** @type {number} 마지막으로 로그인을 시도한 날짜 (Day) */
let lastLoginDay = new Date().getDate();


/**
 * 명령어 실행 로그를 기록합니다.
 */
function logCommand(msg, command, arg) {
    try {
        var logMsg = "[" + command + "] " + (arg || "") + " (방: " + msg.room + " / 보낸이: " + msg.author.name + ")";
        Log.i(logMsg);
    } catch (e) {
        // 로그 기록 중 에러가 나더라도 본 기능은 동작해야 하므로 예외 처리만 함
    }
}

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

function fetchAvatarImage(charNameRaw) {
    var charName = String(charNameRaw);
    var url = LOSTARK_BASE + "/armories/characters/" + encodeURIComponent(charName) + "/profiles";
    var res = httpGetUtf8(url, { "authorization": "bearer " + LOSTARK_API_KEY });

    if (!res.ok) return { ok: false, reason: "HTTP_" + res.code };

    var data = JSON.parse(res.text);
    if (!data || !data.CharacterImage) return { ok: false, reason: "이미지 없음" };

    return {
        ok: true,
        imageUrl: data.CharacterImage, // 카카오링크 템플릿Args에 쓰일 주소
        content: charName + "의 아바타 정보입니다."
    };
}

function httpGetUtf8(urlStr, headersObj) {
    var conn = null;
    var br = null;
    try {
        var url = new java.net.URL(urlStr);
        conn = url.openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        conn.setRequestProperty("accept", "application/json");
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Sybot_MessengerBot)");

        if (headersObj) {
            for (var k in headersObj) {
                if (Object.prototype.hasOwnProperty.call(headersObj, k)) {
                    conn.setRequestProperty(String(k), String(headersObj[k]));
                }
            }
        }

        var code = conn.getResponseCode();
        var isOK = (code >= 200 && code < 300);
        var stream = isOK ? conn.getInputStream() : conn.getErrorStream();

        if (stream == null) return { ok: false, code: code, text: null };

        var isr = new java.io.InputStreamReader(stream, "UTF-8");
        br = new java.io.BufferedReader(isr);
        var sb = new java.lang.StringBuilder();
        var line;
        while ((line = br.readLine()) !== null) sb.append(line).append('\n');

        return { ok: isOK, code: code, text: String(sb.toString()) };
    } catch (e) {
        Log.e("[LOA] httpGetUtf8 ERROR: " + e);
        return { ok: false, code: -1, text: null, err: String(e) };
    } finally {
        if (br != null) try { br.close(); } catch (e) { }
        if (conn != null) try { conn.disconnect(); } catch (e) { }
    }
}

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
                        templateId: LOPEC_TEMPLATE_ID,
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

    // 아바타 조회
    var mAvatar = content.match(/^(?:\.?ㅇㅂㅌ)\s+(\S+)$/);
    if (mAvatar) {
        var charName = mAvatar[1];
        logCommand(msg, "아바타 조회", charName);

        // 카카오링크 로그인이 안 되어있으면 시도
        if (!loginCookies) {
            tryLogin();
            msg.reply("카카오링크 로그인 세션이 없습니다. 잠시 후 다시 시도해주세요.");
            return;
        }

        // 비동기 처리를 위해 Thread 사용 (Jsoup이나 Http 요청 시 권장)
        new Thread(() => {
            try {
                var rAvatar = fetchAvatarImage(charName); // 이전에 만든 API 호출 함수

                if (rAvatar && rAvatar.ok) {
                    // 카카오링크 클라이언트 초기화
                    client.init(JS_KEY, DOMAIN, loginCookies);

                    // 카카오링크 전송
                    client.sendLink(msg.room, {
                        templateId: AVATAR_TEMPLATE_ID,
                        templateArgs: {
                            "name": charName,
                            "avatar_img": rAvatar.imageUrl // fetchAvatarImage에서 반환한 이미지 URL
                        }
                    }, 'custom').then(sendRes => {
                        Log.i("아바타 전송 성공");
                    }).catch(e => {
                        Log.e("아바타 전송 실패: " + e);
                        msg.reply("❌ 카카오링크 전송 실패: " + e);
                    });
                } else {
                    handleApiError(msg, rAvatar.reason, "아바타 조회", charName);
                }
            } catch (e) {
                Log.e("아바타 조회 쓰레드 에러: " + e);
            }
        }).start();
        return;
    }
});