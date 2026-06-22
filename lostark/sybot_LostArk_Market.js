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
    LOSTARK_API_KEY: "no_API_KEY",
    MARKET_ALERT_ROOMS: [] // .시세알림켜기 명령어로 등록된, 알림을 받을 방 목록
};

// [설정] 각인서 줄임말 매핑 (정식 명칭 -> 줄임말)
const ENGRAVING_ABBR = {
    "결투의 대가": "결대",
    "구슬동자": "구동",
    "급소 타격": "급타",
    "기습의 대가": "기대",
    "달인의 저력": "달저",
    "돌격대장": "돌대",
    "마나의 흐름": "마흐",
    "마나 효율 증가": "마효증",
    "바리케이드": "바리",
    "번개의 분노": "번분",
    "부러진 뼈": "부뼈",
    "분쇄의 주먹": "분주",
    "선수필승": "선필",
    "속전속결": "속속",
    "슈퍼 차지": "슈차",
    "시선 집중": "시집",
    "실드 관통": "실관",
    "아드레날린": "아드",
    "안정된 상태": "안상",
    "약자 무시": "약무",
    "에테르 포식자": "에포",
    "예리한 둔기": "예둔",
    "위기 모면": "위모",
    "저주받은 인형": "저받",
    "정기 흡수": "정흡",
    "정밀 단도": "정단",
    "중갑 착용": "중갑",
    "질량 증가": "질증",
    "최대 마나 증가": "최마증",
    "타격의 대가": "타대",
    "폭발물 전문가": "폭전"
};

/**
 * @description 입력값(줄임말 또는 이름 일부)을 거래소 검색용 각인 이름으로 변환합니다.
 * @param {string} input 사용자가 입력한 각인서명
 * @returns {string} ItemName 으로 사용할 검색어
 */
function resolveEngravingName(input) {
    const q = String(input).trim();
    // 1. 줄임말과 정확히 일치하면 정식 명칭으로 변환
    for (const fullName in ENGRAVING_ABBR) {
        if (ENGRAVING_ABBR[fullName] === q) return fullName;
    }
    // 2. 그 외에는 입력값 그대로 사용 (API가 부분 일치로 검색)
    return q;
}

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


/* ==================== [경매장 시세 알림] ==================== */

// 감시할 아이템 목록 (추가 시 이 배열에 새 항목만 추가하면 됨)
const WATCH_ITEMS = [
    {
        key: "파괴석",
        aliases: [".파괴석", ".ㅍㄱㅅ", "ㅍㄱㅅ"],
        label: "파괴석 결정",
        CategoryCode: 50010,
        ItemTier: 4,
        ItemName: "파괴석 결정"
    },
    {
        key: "재봉술",
        aliases: [".재봉술", ".ㅈㅂㅅ", "ㅈㅂㅅ"],
        label: "장인의 재봉술 : 4단계",
        CategoryCode: 50020,
        ItemName: "장인의 재봉술 : 4단계"
    }
];

const MARKET_CHECK_INTERVAL_MS = 3 * 60 * 1000;    // 3분마다 시세 체크
const ALERT_THRESHOLD_PERCENT = 30;                // 전날 평균가 대비 변동 알림 기준 (%)
const REALERT_THRESHOLD_PERCENT = 10;              // 쿨다운 중에도 재알림을 허용하는 직전 알림가 대비 추가 변동 기준 (%)
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;          // 동일 아이템 재알림 쿨다운 (1시간)

// 아이템별 마지막 알림 정보 (key -> { price, time }). 재컴파일 시 초기화됨.
let marketAlertState = {};

/**
 * @description 경매장 시세 API에서 아이템 1건을 조회합니다.
 * @param {object} itemDef WATCH_ITEMS의 항목
 * @returns {{ok: boolean, item: object|null, code: number}}
 */
function fetchMarketItem(itemDef) {
    const url = "https://developer-lostark.game.onstove.com/markets/items";

    const headers = {
        "accept": "application/json",
        "authorization": `bearer ${config.LOSTARK_API_KEY}`,
        "Content-Type": "application/json"
    };

    const body = {
        "CategoryCode": itemDef.CategoryCode,
        "ItemTier": itemDef.ItemTier,
        "ItemName": itemDef.ItemName,
        "PageNo": 1
    };

    const response = fetchLostarkApi(url, headers, body);
    if (response.code !== 200) {
        return { ok: false, item: null, code: response.code };
    }

    const data = JSON.parse(response.body);
    const item = (data.Items && data.Items.length > 0) ? data.Items[0] : null;
    return { ok: true, item, code: 200 };
}

/**
 * @description 변동률(%) 문자열 포맷 (예: +4.6%, -32.1%)
 * @param {number} percent
 * @returns {string}
 */
function formatPercent(percent) {
    const sign = percent >= 0 ? "+" : "";
    return `${sign}${percent.toFixed(1)}%`;
}

/**
 * @description 등록된 모든 알림방에 메시지를 전송합니다.
 * @param {string} message
 */
function sendToAlertRooms(message) {
    const rooms = config.MARKET_ALERT_ROOMS || [];
    const JavaThread = java.lang.Thread;

    for (let i = 0; i < rooms.length; i++) {
        try {
            bot.send(rooms[i], message);
        } catch (e) {
            Log.e(`[시세 알림 전송 실패] ${rooms[i]}: ${e.message}`);
        }
        // 카카오톡 도배 방지를 위한 짧은 대기
        JavaThread.sleep(50);
    }
}

/**
 * @description 감시 아이템들의 시세를 체크하고, 전날 평균가 대비 변동이 기준치 이상이면 알림을 보냅니다.
 */
function checkMarketAlerts() {
    if (!config.MARKET_ALERT_ROOMS || config.MARKET_ALERT_ROOMS.length === 0) return;

    for (let i = 0; i < WATCH_ITEMS.length; i++) {
        const itemDef = WATCH_ITEMS[i];

        try {
            const result = fetchMarketItem(itemDef);
            if (!result.ok || !result.item) continue;

            const item = result.item;
            if (!item.YDayAvgPrice) continue;

            const changePercent = ((item.RecentPrice - item.YDayAvgPrice) / item.YDayAvgPrice) * 100;
            if (Math.abs(changePercent) < ALERT_THRESHOLD_PERCENT) continue;

            // 쿨다운 체크: 1시간 내 알림이 있었고, 그 알림가 대비 변동이 적으면 스킵
            const state = marketAlertState[itemDef.key];
            const now = Date.now();

            if (state && (now - state.time) < ALERT_COOLDOWN_MS) {
                const diffFromLast = state.price
                    ? Math.abs((item.RecentPrice - state.price) / state.price) * 100
                    : 100;
                if (diffFromLast < REALERT_THRESHOLD_PERCENT) continue;
            }

            const trendEmoji = changePercent >= 0 ? "📈" : "📉";
            const message = `${trendEmoji} [경매장 시세 알림]\n${itemDef.label}\n전날 평균가: ${formatNumber(Math.round(item.YDayAvgPrice))}\n최근 판매가: ${formatNumber(Math.round(item.RecentPrice))} (${formatPercent(changePercent)})`;

            sendToAlertRooms(message);
            marketAlertState[itemDef.key] = { price: item.RecentPrice, time: now };

        } catch (e) {
            Log.e(`[시세 알림 체크 오류 - ${itemDef.key}] ${e.stack}`);
        }
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

    // 유각 조회 (.유각 / .ㅇㄱ / .ㅂㅆㅇㄱ, 뒤에 각인서명을 붙이면 해당 각인만 조회)
    // 초성 명령어(ㅇㄱ / ㅂㅆㅇㄱ)는 앞에 '.'이 없어도 동작
    const engPrefixes = [".유각", ".ㅂㅆㅇㄱ", ".ㅇㄱ", "ㅂㅆㅇㄱ", "ㅇㄱ"];
    let engPrefix = null;
    for (const pfx of engPrefixes) {
        if (content === pfx || content.startsWith(pfx + " ")) {
            engPrefix = pfx;
            break;
        }
    }
    if (engPrefix !== null) {
        const engArg = content.slice(engPrefix.length).trim();
        logCommand(msg, "유각 시세 조회", engArg);
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

            // 각인서명이 주어지면 해당 각인만 검색 (줄임말/이름 일부 인식)
            if (engArg !== "") {
                body.ItemName = resolveEngravingName(engArg);
            }

            const response = fetchLostarkApi(url, headers, body);

            if (response.code === 200) {
                const data = JSON.parse(response.body);
                const items = data.Items;

                if (!items || items.length === 0) {
                    msg.reply(engArg !== ""
                        ? `'${engArg}'에 해당하는 유물 각인서를 찾지 못했습니다.`
                        : "현재 검색된 유물 각인서가 없습니다.");
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

                    // 줄임말이 있으면 줄임말로 표기
                    const displayName = ENGRAVING_ABBR[cleanName] || cleanName;
                    const price = formatNumber(item.CurrentMinPrice);
                    resultMsg += `\n${displayName}: ${price}`;
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

    // 시세 알림방 등록
    else if (content === ".시세알림켜기") {
        logCommand(msg, "시세알림 켜기", "");
        try {
            if (!config.MARKET_ALERT_ROOMS) config.MARKET_ALERT_ROOMS = [];

            if (!config.MARKET_ALERT_ROOMS.includes(msg.room)) {
                config.MARKET_ALERT_ROOMS.push(msg.room);
                safeWriteJson(CONFIG_PATH, config);
            }

            const watchedLabels = WATCH_ITEMS.map(i => i.label).join(", ");
            msg.reply(`✅ 이 방에서 경매장 시세 알림을 받습니다.\n(감시 중: ${watchedLabels})`);
        } catch (e) {
            Log.e(`[Script Error - 시세알림켜기] ${e.stack}`);
            msg.reply("앗차차! 시세 알림 등록 중 오류가 발생했어요.");
        }
    }

    // 시세 알림방 해제
    else if (content === ".시세알림끄기") {
        logCommand(msg, "시세알림 끄기", "");
        try {
            if (config.MARKET_ALERT_ROOMS) {
                config.MARKET_ALERT_ROOMS = config.MARKET_ALERT_ROOMS.filter(r => r !== msg.room);
                safeWriteJson(CONFIG_PATH, config);
            }
            msg.reply("🔕 이 방에서 경매장 시세 알림을 중지합니다.");
        } catch (e) {
            Log.e(`[Script Error - 시세알림끄기] ${e.stack}`);
            msg.reply("앗차차! 시세 알림 해제 중 오류가 발생했어요.");
        }
    }

    // 감시 아이템 시세 조회 (알림 등록 여부와 무관하게 항상 현재 시세를 보여줌)
    else if (WATCH_ITEMS.some(i => i.aliases.includes(content))) {
        const matchedItem = WATCH_ITEMS.find(i => i.aliases.includes(content));
        logCommand(msg, "시세 조회", matchedItem.key);
        try {
            const result = fetchMarketItem(matchedItem);

            if (!result.ok) {
                if (result.code === 401) {
                    msg.reply("⚠️ API 키가 만료되었거나 올바르지 않습니다.");
                } else {
                    Log.e(`[Lostark API] Error: ${result.code}`);
                    msg.reply(`❌ 거래소 조회 실패 (코드: ${result.code})`);
                }
                return;
            }

            if (!result.item) {
                msg.reply(`현재 검색된 ${matchedItem.label} 매물이 없습니다.`);
                return;
            }

            const item = result.item;
            let resultMsg = `${matchedItem.label} 시세\n현재 최저가: ${formatNumber(item.CurrentMinPrice)}`;

            if (item.RecentPrice != null) {
                resultMsg += `\n최근 판매가: ${formatNumber(Math.round(item.RecentPrice))}`;
            }
            if (item.YDayAvgPrice) {
                const changePercent = ((item.RecentPrice - item.YDayAvgPrice) / item.YDayAvgPrice) * 100;
                resultMsg += `\n전날 평균가: ${formatNumber(Math.round(item.YDayAvgPrice))} (${formatPercent(changePercent)})`;
            }

            msg.reply(resultMsg);

        } catch (e) {
            Log.e(`[Script Error - Market Watch] ${e.stack}`);
            msg.reply("앗차차! 시세 조회 중 오류가 발생했어요.");
        }
    }
});

// 경매장 시세 알림 주기 체크 시작 (3분 간격)
checkMarketAlerts();
setInterval(checkMarketAlerts, MARKET_CHECK_INTERVAL_MS);