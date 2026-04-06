const bot = BotManager.getCurrentBot();

/* ==================== [설정: 카카오링크] ==================== */

const { KakaoApiService, KakaoShareClient } = require('kakaolink');
const Jsoup = Java.type("org.jsoup.Jsoup");
const Thread = Java.type("java.lang.Thread");

var LOSTARK_BASE = "https://developer-lostark.game.onstove.com";

// 카카오 디벨로퍼스 설정
const DOMAIN = "https://google.com";

// 파일 경로
const CONFIG_PATH = "/sdcard/Sybot/config.json";

/** @type {object} 전역 설정 객체 선언 (누락 방지) */
let config = {};

// [설정] config 관련 설정
const MAIN_DEFAULT_CONFIG = {
    JS_KEY: "no_URL",
    LOSTARK_API_KEY: "no_API_KEY",
    LOPEC_TEMPLATE_ID: "no_LOPEC_TEMPLATE_ID",
    AVATAR_TEMPLATE_ID: "no_AVATAR_TEMPLATE_ID"
};

/**
 * @description JSON 파일을 읽어 순수 JS 객체로 파싱합니다. (Interop 프록시 객체 생성 방지)
 * @param {string} path 파일 경로
 * @return {object|null} 파싱된 객체 또는 실패/파일 없음 시 null 반환
 */
function safeReadJson(path) {
    try {
        if (!FileStream.exists(path)) return null;
        const raw = FileStream.read(path);
        // 빈 문자열이거나 null일 경우 방지
        if (!raw || raw.trim() === "") return null;
        return JSON.parse(String(raw));
    } catch (e) {
        Log.e(`[safeReadJson] 파일 읽기 실패 (${path}): ${e.message}`);
        return null;
    }
}

/**
 * @description 순수 JS 객체를 JSON 문자열로 변환하여 파일에 저장합니다.
 * @param {string} path 파일 경로
 * @param {object} data 저장할 데이터 객체
 */
function safeWriteJson(path, data) {
    try {
        FileStream.write(path, JSON.stringify(data, null, 2));
    } catch (e) {
        Log.e(`[safeWriteJson] 파일 저장 실패 (${path}): ${e.message}`);
    }
}
/**
 * @description 설정 파일을 안전하게 불러오고, 파일이 없거나 누락된 설정이 있으면 기본값으로 채운 뒤 저장합니다.
 * @param {string} filePath 설정 파일 경로
 * @param {object} defaultData 기본 설정 객체
 * @return {object} 완성된 설정 객체
 */
function loadConfig(filePath, defaultData) {
    try {
        let loadedData = safeReadJson(filePath);

        // 1. 파일이 없거나 읽기 실패한 경우 (기본값으로 새로 파일 생성)
        if (!loadedData) {
            safeWriteJson(filePath, defaultData);
            return defaultData;
        }

        // 2. 파일은 있지만 새로운 설정 항목(키)이 추가되었을 경우 병합(Merge)
        let isUpdated = false;
        for (let key in defaultData) {
            if (loadedData[key] === undefined) {
                loadedData[key] = defaultData[key];
                isUpdated = true;
            }
        }

        // 3. 업데이트 사항이 있다면 다시 저장
        if (isUpdated) {
            safeWriteJson(filePath, loadedData);
        }

        return loadedData;
    } catch (e) {
        Log.e(`[loadConfig] 설정 로드 중 오류: ${e.message}`);
        // 최악의 오류 발생 시 봇이 멈추지 않도록 기본값 임시 반환
        return defaultData;
    }
}


function init() {
    config = loadConfig(CONFIG_PATH, MAIN_DEFAULT_CONFIG);
    Log.i("설정 로드 완료!");
}



// 서비스 및 클라이언트 초기화
const service = KakaoApiService.createService();
const client = KakaoShareClient.createClient();

/** @type {any} 로그인 성공 후 저장될 쿠키 */
let loginCookies = null;

/** @type {number} 마지막으로 로그인을 시도한 날짜 (Day) */
let lastLoginDay = new Date().getDate();

const CLASS_IMAGES = {
    '버서커': 'https://i.imgur.com/Fnwa0D6.png',
    '워로드': 'https://i.imgur.com/UImdsLL.png',
    '디스트로이어': 'https://i.imgur.com/6weEtzK.png',
    '홀리나이트': 'https://i.imgur.com/XwJJJ4L.png',
    '슬레이어': 'https://i.imgur.com/imtQiNs.png',
    '발키리': 'https://i.imgur.com/Tv5d5AR.png',
    '아르카나': 'https://i.imgur.com/QNCXkb0.png',
    '바드': 'https://i.imgur.com/uwVYaCB.png',
    '서머너': 'https://i.imgur.com/a7TU5wQ.png',
    '소서리스': 'https://i.imgur.com/4u9ERvH.png',
    '데빌헌터': 'https://i.imgur.com/RJNzf1f.png',
    '호크아이': 'https://i.imgur.com/ACnwYEk.png',
    '블래스터': 'https://i.imgur.com/vSRUaZs.png',
    '스카우터': 'https://i.imgur.com/AJrswvy.png',
    '건슬링어': 'https://i.imgur.com/gKNGtfy.png',
    '배틀마스터': 'https://i.imgur.com/6FKSfOf.png',
    '인파이터': 'https://i.imgur.com/pIfR6BE.png',
    '기공사': 'https://i.imgur.com/q3sTlJD.png',
    '창술사': 'https://i.imgur.com/PIxSail.png',
    '스트라이커': 'https://i.imgur.com/ovHY0SO.png',
    '브레이커': 'https://i.imgur.com/sksysh4.png',
    '리퍼': 'https://i.imgur.com/eUrILM9.png',
    '데모닉': 'https://i.imgur.com/sgXw3ta.png',
    '블레이드': 'https://i.imgur.com/4rp4bWa.png',
    '소울이터': 'https://i.imgur.com/yMUbl8q.png',
    '기상술사': 'https://i.imgur.com/J4ijhdU.png',
    '도화가': 'https://i.imgur.com/XpOE6jY.png',
    '환수사': 'https://i.imgur.com/lRzDjDb.png',
    '가디언나이트': 'https://i.imgur.com/l6glgxq.png',

    '기본': 'https://i.imgur.com/VucNVmi.jpeg'
};

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

function handleApiError(msg, error, context, extraInfo) {
    var errCode = error;
    var errStack = "";

    // 만약 error가 진짜 시스템 에러 객체(try-catch의 e)라면 분리
    if (typeof error === 'object' && error !== null) {
        errCode = error.message || "UNKNOWN";
        errStack = error.stack || "";
    }

    // ----------------------------------------
    // Case 1: 비즈니스 로직 에러 (사용자에게 친절하게 안내)
    // ----------------------------------------
    if (errCode === "NOT_FOUND") {
        msg.reply("'" + (extraInfo || "캐릭터") + "'를 찾을 수 없어요.");
        return; // 로그는 굳이 안 남기거나 Info로 남김
    }

    if (errCode === "HTTP_401" || errCode === "HTTP_403") {
        msg.reply("인증 오류입니다. API 키를 확인해주세요.");
        Log.e("[" + context + "] API Key Auth Error");
        return;
    }

    if (errCode === "NO_FIELD" || errCode === "MAINTENANCE") {
        msg.reply("정보를 가져올 수 없어요.");
        return;
    }

    if (errCode === "NO_BRACELET") {
        msg.reply("장착 중인 팔찌가 없거나 정보를 볼 수 없어요.");
        return;
    }

    if (errCode === "NO_GEMS") {
        msg.reply("해당 캐릭터는 보석을 착용하고 있지 않습니다.");
        return;
    }

    if (errCode === "NO_BRACELET") {
        msg.reply("해당 캐릭터는 팔찌를 착용하고 있지 않습니다.");
        return;
    }

    // ----------------------------------------
    // Case 2: 진짜 시스템 에러/예외 (개발자용 로그)
    // ----------------------------------------
    Log.e("[ERROR] " + context + " 실패\n방: " + msg.room + "\n코드: " + errCode + "\n" + errStack);
    msg.reply("앗차차! 뭔가 잘못됐어요..");
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
    var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });

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

// 티어명을 파일명으로 매칭해주는 헬퍼 함수
function getTierFileName(tier) {
    const map = { '에스더': 'esther.png', '마스터': 'master.png', '다이아몬드': 'diamond.png', '골드': 'gold.png', '실버': 'silver.png', '브론즈': 'bronze.png' };
    return map[tier] || 'bronze.png';
}

/* ==================== [이벤트 핸들러] ==================== */
init();

bot.addListener(Event.START_COMPILE, init);
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
                // [변경] 외부 서버 대신 로펙 사이트 직접 연결
                const url = "https://lopec.kr/character/specPoint/" + encodeURIComponent(name);
                const doc = Jsoup.connect(url)
                    .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36")
                    .timeout(10000)
                    .get();

                const html = doc.html();

                // 1. 스펙 포인트, 티어, 아이템 레벨 추출 (알려주신 클래스 기준)
                // 해당 클래스를 가진 모든 span 태그를 찾습니다.
                const specElements = doc.select("span.GroupProfile_specLevel__aOZcs");

                if (specElements.size() < 3) {
                    msg.reply("❌ 데이터를 파싱할 수 없습니다. 캐릭터 이름을 확인해주세요.");
                    return;
                }

                const itemLevel = specElements.get(0).text().trim();      // 1777.5
                const score = specElements.get(1).text().trim();   // 6859.57
                const tierElement = specElements.get(2); // 두 번째 GroupProfile_specLevel__aOZcs
                const tierName = tierElement.text().trim(); // "에스더"

                // img 태그의 src 속성을 가져옵니다.
                const tierImgTag = tierElement.select("img").first();
                let tierImgUrl = "";

                if (tierImgTag != null) {
                    let rawSrc = tierImgTag.attr("src"); // "/_next/image?url=%2Fimage%2Ftier%2Festher.png&w=48&q=75"

                    // 상대 경로일 경우 로펙 도메인을 붙여 완전한 URL로 만듭니다.
                    if (rawSrc.startsWith("/")) {
                        tierImgUrl = "https://lopec.kr" + rawSrc;
                    } else {
                        tierImgUrl = rawSrc;
                    }
                } else {
                    // 이미지를 찾지 못했을 경우 기존 헬퍼 함수로 대체
                    tierImgUrl = "https://cdnlopec.xyz/asset/image/" + getTierFileName(tierName);
                }

                // 2. 랭킹 정보 추출 (강력한 정규식 버전)
                const rankElements = doc.select("span.GroupProfile_rank__zpZON");

                let totalRank = "-";
                let totalPercent = "";
                let classRank = "-";
                let classPercent = "";

                rankElements.forEach((el, index) => {
                    // 1. HTML을 가져온 뒤 주석과 태그를 제거
                    let rawHtml = el.html();

                    // 주석 기호를 안전하게 제거 (특수기호 앞에 \를 붙여서 안전하게 처리)
                    let cleanText = rawHtml
                        .replace(/<\!-- -->/g, "") // 주석 제거
                        .replace(/<[^>]*>?/gm, "")  // HTML 태그 제거
                        .replace(/\s+/g, "");       // 공백 제거

                    // 2. 숫자 추출 (랭킹과 퍼센트)
                    // 예: "전체랭킹486위(5.27%)"
                    let rankMatch = cleanText.match(/랭킹([\d,]+)위/);
                    let percentMatch = cleanText.match(/\(([\d.]+)%\)/);

                    let rankVal = rankMatch ? rankMatch[1] : "-";
                    let percentVal = percentMatch ? percentMatch[1] : "";

                    // 3. 텍스트 포함 여부로 데이터 분류
                    if (cleanText.indexOf("전체랭킹") !== -1) {
                        totalRank = rankVal + "위";
                        totalPercent = percentVal ? percentVal + "%" : "";
                    } else if (cleanText.indexOf("직업랭킹") !== -1) {
                        classRank = rankVal + "위";
                        classPercent = percentVal ? percentVal + "%" : "";
                    }
                });

                // 로그 확인
                Log.i("최종 파싱 결과 -> 전체: " + totalRank + " / 직업: " + classRank);

                // 3. 직업(className) 및 직업 각인(classtype) 추출
                const tagElements = doc.select("div.GroupProfile_tagArea__12o2b span.GroupProfile_tag__tF05T");

                let className = "-";
                let classtype = "-";

                if (tagElements.size() >= 3) {
                    // 인덱스 기반 추출 (0: 서버, 1: 직업, 2: 직각)
                    className = tagElements.get(1).text().trim(); // 바드
                    classtype = tagElements.get(2).text().trim(); // 절실한 구원
                } else if (tagElements.size() === 2) {
                    // 혹시라도 태그가 2개뿐인 경우를 대비한 예외 처리
                    className = tagElements.get(1).text().trim();
                }

                // 직업 이미지 매칭 (기존 로직 유지)
                const classImgUrl = CLASS_IMAGES[className] || CLASS_IMAGES['기본'];

                // 캐릭터 이미지 설정 (우선 순위: 직업 이미지)
                const charImg = classImgUrl;
                // 카카오링크 전송
                client.init(config.JS_KEY, DOMAIN, loginCookies);
                client.sendLink(msg.room, {
                    templateId: config.LOPEC_TEMPLATE_ID,
                    templateArgs: {
                        "name": name,
                        "className": className,
                        "classtype": classtype,
                        "tier_name": tierName,
                        "score": score,
                        "level": itemLevel,
                        "class_rank": classRank,
                        "class_percent": classPercent,
                        "total_rank": totalRank,
                        "total_percent": totalPercent,
                        "class_img": charImg, // 캐릭터 이미지는 추가 파싱 필요 시 보완
                        "tier_img": tierImgUrl,
                        "url": url,
                    }
                }, 'custom').catch(e => {
                    Log.e("전송 실패: " + e);
                    msg.reply("❌ 카카오링크 전송 실패");
                });

            } catch (e) {
                Log.e("로펙 직접조회 에러: " + e);
                msg.reply("앗차차... 로펙 조회 중 오류가 발생했습니다.");
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
                    client.init(config.JS_KEY, DOMAIN, loginCookies);

                    // 카카오링크 전송
                    client.sendLink(msg.room, {
                        templateId: config.AVATAR_TEMPLATE_ID,
                        templateArgs: {
                            "name": charName,
                            "avatar_img": rAvatar.imageUrl, // 템플릿에 사진을 보여주기 위한 전체 URL (기존 유지)

                            // 이동할 링크를 위해 'https://img.lostark.co.kr' 부분을 잘라낸 뒷부분만 전송
                            "link_path": rAvatar.imageUrl.replace("https://img.lostark.co.kr", "")
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