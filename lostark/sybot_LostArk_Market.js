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

// 로깅 헬퍼 함수: [방이름/보낸사람] 명령어: 인자 형태
function logCommand(msg, cmdType, arg) {
    try {
        Log.i("[" + msg.room + "/" + msg.author.name + "] " + cmdType + ": " + (arg || ""));
    } catch (e) {
        Log.e("로깅 중 에러: " + e);
    }
}

bot.addListener(Event.START_COMPILE, init);
bot.addListener(Event.MESSAGE, (msg) => {
    // 방 제한 확인
    if (ALLOWED_ROOMS.length > 0 && !ALLOWED_ROOMS.includes(msg.room)) return;

    const content = msg.content.trim();

    // 유각 조회
    if (content === ".유각" || content === ".ㅇㄱ" || content === ".ㅂㅆㅇㄱ") {
        logCommand(msg, "유각 시세 조회", "");
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

    else if (content.startsWith(".보석") || content.startsWith(".ㅂㅅ")) {
        try {
            // 경매장 엔드포인트
            const url = "https://developer-lostark.game.onstove.com/auctions/items";

            const headers = {
                "accept": "application/json",
                "authorization": `bearer ${config.LOSTARK_API_KEY}`,
                "Content-Type": "application/json"
            };

            // 명령어와 인자 분리
            const cmd = content.startsWith(".보석") ? ".보석" : ".ㅂㅅ";
            const args = content.replace(cmd, "").trim();

            logCommand(msg, "보석 시세 조회", args);

            let gemTypes = [];

            // 인자가 없는 경우 (기존 방식: 8, 9, 10레벨 전체 출력)
            if (args === "") {
                gemTypes = [
                    { label: "8겁", name: "8레벨 겁화" }, { label: "8작", name: "8레벨 작열" },
                    { label: "9겁", name: "9레벨 겁화" }, { label: "9작", name: "9레벨 작열" },
                    { label: "10겁", name: "10레벨 겁화" }, { label: "10작", name: "10레벨 작열" }
                ];
            }
            // 인자가 있는 경우 (숫자 및 타입 파싱)
            else {
                const match = args.match(/^(\d+)([겁작]?)$/);
                if (match) {
                    const lv = match[1];
                    const type = match[2];

                    if (type === "겁") {
                        gemTypes.push({ label: lv + "겁", name: lv + "레벨 겁화" });
                    } else if (type === "작") {
                        gemTypes.push({ label: lv + "작", name: lv + "레벨 작열" });
                    } else {
                        // 숫자만 입력된 경우 (해당 레벨의 겁/작 둘 다 보여줌)
                        gemTypes.push({ label: lv + "겁", name: lv + "레벨 겁화" });
                        gemTypes.push({ label: lv + "작", name: lv + "레벨 작열" });
                    }
                } else {
                    msg.reply("⚠️ 올바른 형식이 아닙니다. (예: .보석 7작 / .보석 5)");
                    return;
                }
            }

            let resultMsg = `보석 시세 조회`;
            let isSuccess = true;

            for (const gem of gemTypes) {
                const body = {
                    "Sort": "BUY_PRICE",
                    "CategoryCode": 210000,
                    "ItemTier": 4,
                    "ItemName": gem.name,
                    "PageNo": 1,
                    "SortCondition": "ASC"
                };

                const response = fetchLostarkApi(url, headers, body);

                if (response.code === 200) {
                    const data = JSON.parse(response.body);
                    const items = data.Items;

                    if (items && items.length > 0) {
                        const buyPrice = items[0].AuctionInfo.BuyPrice;
                        resultMsg += `\n${gem.label}: ${formatNumber(buyPrice)}`;
                    } else {
                        resultMsg += `\n${gem.label}: 매물 없음`;
                    }
                } else if (response.code === 401) {
                    msg.reply("⚠️ API 키가 만료되었거나 올바르지 않습니다.");
                    isSuccess = false;
                    break;
                } else {
                    Log.e(`[Lostark API] Error: ${response.code}\n${response.body}`);
                    resultMsg += `\n${gem.label}: 조회 실패`;
                }
            }

            if (isSuccess) {
                msg.reply(resultMsg.trim());
            }

        } catch (e) {
            Log.e(`[Script Error - Gem] ${e.stack}`);
            msg.reply("앗차차! 보석 시세 조회 중 오류가 발생했어요.");
        }
    }

    else if (/^\.(상|중|하)(상|중|하)$/.test(content)) {
        logCommand(msg, "악세 시세 조회", content);
        try {
            const match = content.match(/^\.(상|중|하)(상|중|하)$/);
            const lvl1 = match[1]; // 첫 번째 옵션 등급 (예: "상")
            const lvl2 = match[2]; // 두 번째 옵션 등급 (예: "중")

            const url = "https://developer-lostark.game.onstove.com/auctions/items";
            const headers = {
                "accept": "application/json",
                "authorization": `bearer ${config.LOSTARK_API_KEY}`,
                "Content-Type": "application/json"
            };

            // 검색할 악세 옵션 조합 정의
            // API의 MinValue, MaxValue는 정수 형태를 요구하므로 (예: 2.00% -> 200) 제시해주신 수치를 변환해 두었습니다.
            const accPairs = [
                {
                    name1: "적주피", opt1: 42, val1: { "하": 55, "중": 120, "상": 200 },
                    name2: "추피", opt2: 41, val2: { "하": 70, "중": 160, "상": 260 },
                    category: 200010 // 목걸이
                },
                {
                    name1: "낙인력", opt1: 44, val1: { "하": 215, "중": 480, "상": 800 },
                    name2: "아덴", opt2: 43, val2: { "하": 160, "중": 360, "상": 600 },
                    category: 200010
                },
                {
                    name1: "공%", opt1: 45, val1: { "하": 40, "중": 95, "상": 155 },
                    name2: "무공%", opt2: 46, val2: { "하": 80, "중": 180, "상": 300 },
                    category: 200020 // 귀걸이
                },
                {
                    name1: "무공%", opt1: 46, val1: { "하": 80, "중": 180, "상": 300 },
                    name2: "무공+", opt2: 54, val2: { "하": 195, "중": 480, "상": 960 },
                    category: 200020, specialRule: "무공+" // 특별 규칙 적용
                },
                {
                    name1: "아공", opt1: 51, val1: { "하": 135, "중": 300, "상": 500 },
                    name2: "아피", opt2: 52, val2: { "하": 200, "중": 450, "상": 750 },
                    category: 200030 // 반지
                },
                {
                    name1: "치적", opt1: 49, val1: { "하": 40, "중": 95, "상": 155 },
                    name2: "치피", opt2: 50, val2: { "하": 110, "중": 240, "상": 400 },
                    category: 200030
                }
            ];

            let resultMsg = `${lvl1}${lvl2} 악세 시세\n`;
            let isSuccess = true;

            // 시세 조회 함수
            const getAccPrice = (categoryCode, opt1, v1, opt2, v2) => {
                const body = {
                    "Sort": "BUY_PRICE",
                    "CategoryCode": categoryCode,
                    "ItemTier": 4,
                    "ItemGrade": "고대",
                    "ItemGradeQuality": 67,
                    "PageNo": 1,
                    "SortCondition": "ASC",
                    "EtcOptions": [
                        { "FirstOption": 7, "SecondOption": opt1, "MinValue": v1, "MaxValue": v1 },
                        { "FirstOption": 7, "SecondOption": opt2, "MinValue": v2, "MaxValue": v2 }
                    ]
                };

                const response = fetchLostarkApi(url, headers, body);
                if (response.code === 200) {
                    const data = JSON.parse(response.body);
                    const items = data.Items;
                    if (items && items.length > 0) {
                        return formatNumber(items[0].AuctionInfo.BuyPrice);
                    }
                    return "매물 없음";
                } else if (response.code === 401) {
                    isSuccess = false;
                    return "API키 오류";
                } else {
                    return "조회 실패";
                }
            };

            // 조합별 조회 실행
            for (const pair of accPairs) {
                if (!isSuccess) break;

                if (lvl1 === lvl2) {
                    // 상상, 중중, 하하 같은 경우
                    if (pair.specialRule === "무공+" && lvl1 !== "상") continue; // 무공+가 포함되었지만 상이 아닐 땐 출력 생략

                    const price = getAccPrice(pair.category, pair.opt1, pair.val1[lvl1], pair.opt2, pair.val2[lvl2]);
                    resultMsg += `\n${pair.name1} + ${pair.name2}: ${price}`;
                } else {
                    // 상중, 중상 등 옵션 등급이 다른 경우 2개의 조합으로 나눠서 출력

                    // 조합 A (옵션1이 lvl1, 옵션2가 lvl2)
                    if (!(pair.specialRule === "무공+" && lvl1 !== "상")) {
                        const priceA = getAccPrice(pair.category, pair.opt1, pair.val1[lvl1], pair.opt2, pair.val2[lvl2]);
                        resultMsg += `\n${pair.name1} ${lvl1} + ${pair.name2} ${lvl2}: ${priceA}`;
                    }

                    // 조합 B (옵션1이 lvl2, 옵션2가 lvl1)
                    if (!(pair.specialRule === "무공+" && lvl2 !== "상")) {
                        const priceB = getAccPrice(pair.category, pair.opt1, pair.val1[lvl2], pair.opt2, pair.val2[lvl1]);
                        resultMsg += `\n${pair.name1} ${lvl2} + ${pair.name2} ${lvl1}: ${priceB}`;
                    }
                }
            }

            if (isSuccess) {
                msg.reply(resultMsg.trim());
            } else {
                msg.reply("⚠️ API 키가 만료되었거나 올바르지 않습니다.");
            }

        } catch (e) {
            Log.e(`[Script Error - Acc] ${e.stack}`);
            msg.reply("앗차차! 악세 시세 조회 중 오류가 발생했어요.");
        }
    }
});