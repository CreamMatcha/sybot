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