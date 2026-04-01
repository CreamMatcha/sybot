/**
 * @description 로스트아크 유물 각인서 시세 조회 스크립트
 * @environment MessengerBotR (GraalJS v0.7.40+)
 */

const bot = BotManager.getCurrentBot();

/* ==================== [설정] ==================== */


// 봇이 동작할 방 목록 (비어있으면 모든 방에서 동작)
const ALLOWED_ROOMS = [];

// Java 클래스 로드
const Jsoup = Java.type("org.jsoup.Jsoup");
const Connection = Java.type("org.jsoup.Connection");

// 파일 경로
const CONFIG_PATH = "/sdcard/Sybot/config.json";

/** @type {object} 전역 설정 객체 선언 (누락 방지) */
let config = {};

// [설정] config 관련 설정
const MAIN_DEFAULT_CONFIG = {
    LOSTARK_API_KEY: "no_API_KEY"
};

function loadConfig(filePath, defaultData) {
    try {
        if (!FileStream.exists(filePath)) {
            FileStream.writeJson(filePath, defaultData);
            Log.i("기본 설정 파일을 생성했습니다: " + filePath);
            return defaultData;
        }

        let loadedData = FileStream.readJson(filePath);
        let isUpdated = false;

        for (let key in defaultData) {
            if (loadedData[key] === undefined) {
                loadedData[key] = defaultData[key];
                isUpdated = true;
            }
        }

        if (isUpdated) {
            FileStream.writeJson(filePath, loadedData);
            Log.i("설정 파일에 누락된 새 항목을 추가했습니다.");
        }

        return loadedData;
    } catch (e) {
        Log.e("설정 로드 중 오류 발생: " + e.message);
        return defaultData;
    }
}

function init() {
    config = loadConfig(CONFIG_PATH, MAIN_DEFAULT_CONFIG);
    Log.i("설정 로드 완료!");
}


/* ==================== [유틸리티] ==================== */

/**
 * @description API 응답 데이터의 천 단위 콤마 포맷
 * @param {number|string} num 
 * @returns {string}
 */
function formatNumber(num) {
    if (!num) return "0";
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * @description Jsoup을 이용한 API 요청 함수
 * @param {string} urlStr 
 * @param {object} headers 
 * @param {object} bodyObj 
 * @returns {object} { code, body }
 */
function fetchLostarkApi(urlStr, headers, bodyObj) {
    try {
        const response = Jsoup.connect(urlStr)
            .header("accept", headers["accept"])
            .header("authorization", headers["authorization"])
            .header("Content-Type", headers["Content-Type"])
            .requestBody(JSON.stringify(bodyObj))
            .ignoreContentType(true) // JSON 응답 허용
            .ignoreHttpErrors(true)  // 에러 발생 시에도 body 읽기 허용
            .method(Connection.Method.POST)
            .execute();

        return {
            code: response.statusCode(),
            body: response.body()
        };
    } catch (e) {
        return {
            code: -1,
            body: e.message
        };
    }
}


/* ==================== [이벤트 핸들러] ==================== */

/**
 * @description 메시지 수신 이벤트
 */

init();

bot.addListener(Event.START_COMPILE, init);
bot.addListener(Event.MESSAGE, (msg) => {
    // 1. 방 제한 확인
    if (ALLOWED_ROOMS.length > 0 && !ALLOWED_ROOMS.includes(msg.room)) return;

    const content = msg.content.trim();

    // 명령어 확인: .유각 또는 .ㅇㄱ
    if (content === ".유각" || content === ".ㅇㄱ" || content === ".ㅂㅆㅇㄱ") {
        try {
            const url = "https://developer-lostark.game.onstove.com/markets/items";

            const headers = {
                "accept": "application/json",
                "authorization": `bearer ${config.LOSTARK_API_KEY}`,
                "Content-Type": "application/json"
            };

            const body = {
                "Sort": "CURRENT_MIN_PRICE",
                "SortCondition": "DESC",
                "CategoryCode": 40000,
                "ItemGrade": "유물",
                "PageNo": 1
            };

            const response = fetchLostarkApi(url, headers, body);

            if (response.code === 200) {
                const data = JSON.parse(response.body);
                const items = data.Items;

                if (!items || items.length === 0) {
                    msg.reply("현재 검색된 유물 각인서가 없습니다.");
                    return;
                }

                let resultMsg = "유각 시세\n";
                const limit = Math.min(items.length, 10);

                for (let i = 0; i < limit; i++) {
                    const item = items[i];
                    // 이름 정제
                    const cleanName = item.Name
                        .replace(" 각인서", "")
                        .replace("유물 ", "")
                        .trim();

                    const price = formatNumber(item.CurrentMinPrice);
                    resultMsg += `\n${cleanName}: ${price}`;
                }

                msg.reply(resultMsg.trim());

            } else if (response.code === 401) {
                msg.reply("⚠️ API 키가 만료되었거나 올바르지 않습니다.");
            } else {
                Log.e(`[Lostark API] Error: ${response.code}\n${response.body}`);
                msg.reply(`❌ 거래소 조회 실패 (코드: ${response.code})`);
            }

        } catch (e) {
            Log.e(`[Script Error] ${e.stack}`);
            msg.reply("앗차차! 뭔가 잘못됐어요..");
        }
    }
});