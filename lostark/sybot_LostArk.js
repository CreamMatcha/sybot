/************************************************************
 * Lost Ark 캐릭터 정보 조회
************************************************************/
var bot = BotManager.getCurrentBot();
bot.setCommandPrefix("."); // 다른 파일에서 이미 설정했다면 중복 설정은 무시됨

try { Log.i("[LOA] script loaded"); } catch (e) { }
/***** [설정] 특정 방에서만 동작 *****/
var ALLOWED_ROOMS = [];

// 출력 옵션
const ARK_OPTS = {
    log: true
};
function dbg() { if (ARK_OPTS.log) try { Log.i.apply(Log, ["[ARK]"].concat([].slice.call(arguments))); } catch (_) { } }

function isAllowedRoom(roomName) {
    try {
        if (!ALLOWED_ROOMS || ALLOWED_ROOMS.length === 0) return true;
        var r = String(roomName || ""); // null 방지
        return ALLOWED_ROOMS.indexOf(r) !== -1;
    } catch (_) { return true; }
}

var LOSTARK_BASE = "https://developer-lostark.game.onstove.com";

// 파일 경로
const CONFIG_PATH = "/sdcard/Sybot/config.json";

/** @type {object} 전역 설정 객체 선언 (누락 방지) */
let config = {};

// [설정] config 관련 설정
const LOSTARK_DEFAULT_CONFIG = {
    ADMIN_HASH: "no_HASH",
    WEBHOOK_URL: "no_URL",
    LOSTARK_API_KEY: "no_API_KEY"
};

// [설정] 게임 데이터 JSON 디렉토리 (레포 data/ 폴더의 파일을 기기에 복사해서 사용)
// engravings.json / classes.json / synergy.json / weekly_gold.json / guardian_rotation.json
const DATA_DIR = "/sdcard/Sybot/data/";

let _gameDataCache = {};

/**
 * @description DATA_DIR의 게임 데이터 JSON 파일을 읽어 반환합니다. (파일별 캐시)
 * @param {string} fileName 파일명 (예: "classes.json")
 * @return {object|null} 파싱된 객체 또는 실패/파일 없음 시 null
 */
function loadGameData(fileName) {
    if (_gameDataCache[fileName]) return _gameDataCache[fileName];
    const js = safeReadJson(DATA_DIR + fileName);
    if (!js) {
        Log.e("[DATA] 게임 데이터 로드 실패: " + DATA_DIR + fileName);
        return null;
    }
    _gameDataCache[fileName] = js;
    return js;
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
    config = loadConfig(CONFIG_PATH, LOSTARK_DEFAULT_CONFIG);
    _gameDataCache = {}; // 재컴파일 시 게임 데이터 파일 다시 읽기
    Log.i("[LOA] 설정 로드 완료 (CONFIG_PATH)");
}


// 로깅 헬퍼 함수: [방이름/보낸사람] 명령어: 인자 형태
function logCommand(msg, cmdType, arg) {
    if (!ARK_OPTS.log) return;
    try {
        // 예: [아크라시아/서윤] 전투력 조회: 닉네임
        Log.i("[" + msg.room + "/" + msg.author.name + "] " + cmdType + ": " + (arg || ""));
    } catch (e) {
        Log.e("로깅 중 에러: " + e);
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
        Log.i("[" + context + "] NOT_FOUND: " + (extraInfo || ""));
        msg.reply("'" + (extraInfo || "캐릭터") + "'를 찾을 수 없어요.");
        return;
    }

    if (errCode === "HTTP_401" || errCode === "HTTP_403") {
        msg.reply("인증 오류입니다. API 키를 확인해주세요.");
        Log.e("[" + context + "] API Key Auth Error");
        return;
    }

    if (errCode === "NO_FIELD" || errCode === "MAINTENANCE") {
        Log.i("[" + context + "] NO_FIELD: " + (extraInfo || ""));
        msg.reply("정보를 가져올 수 없어요.");
        return;
    }

    if (errCode === "NO_BRACELET") {
        Log.i("[" + context + "] NO_BRACELET: " + (extraInfo || ""));
        msg.reply("장착 중인 팔찌가 없거나 정보를 볼 수 없어요.");
        return;
    }

    if (errCode === "NO_GEMS") {
        Log.i("[" + context + "] NO_GEMS: " + (extraInfo || ""));
        msg.reply("해당 캐릭터는 보석을 착용하고 있지 않습니다.");
        return;
    }

    // ----------------------------------------
    // Case 2: 진짜 시스템 에러/예외 (개발자용 로그)
    // ----------------------------------------
    Log.e("[ERROR] " + context + " 실패\n방: " + msg.room + "\n코드: " + errCode + "\n" + errStack);
    msg.reply("앗차차! 뭔가 잘못됐어요..");
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

// 경매장(/auctions/items)처럼 POST + JSON 바디가 필요한 API용
// (이 스크립트에는 Jsoup 전역 import가 없으므로 java.net으로 직접 요청)
function httpPostJsonUtf8(urlStr, headersObj, bodyObj) {
    var conn = null;
    var osw = null;
    var br = null;
    try {
        var url = new java.net.URL(urlStr);
        conn = url.openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        conn.setRequestProperty("accept", "application/json");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Sybot_MessengerBot)");

        if (headersObj) {
            for (var k in headersObj) {
                if (Object.prototype.hasOwnProperty.call(headersObj, k)) {
                    conn.setRequestProperty(String(k), String(headersObj[k]));
                }
            }
        }

        conn.setDoOutput(true);
        osw = new java.io.OutputStreamWriter(conn.getOutputStream(), "UTF-8");
        osw.write(JSON.stringify(bodyObj || {}));
        osw.flush();

        var code = conn.getResponseCode();
        var isOK = (code >= 200 && code < 300);
        var stream = isOK ? conn.getInputStream() : conn.getErrorStream();

        if (stream == null) return { ok: false, code: code, text: null };

        br = new java.io.BufferedReader(new java.io.InputStreamReader(stream, "UTF-8"));
        var sb = new java.lang.StringBuilder();
        var line;
        while ((line = br.readLine()) !== null) sb.append(line).append('\n');

        return { ok: isOK, code: code, text: String(sb.toString()) };
    } catch (e) {
        Log.e("[LOA] httpPostJsonUtf8 ERROR: " + e);
        return { ok: false, code: -1, text: null, err: String(e) };
    } finally {
        if (osw != null) try { osw.close(); } catch (e) { }
        if (br != null) try { br.close(); } catch (e) { }
        if (conn != null) try { conn.disconnect(); } catch (e) { }
    }
}

// 숫자/숫자문자열을 "1,234,567" 형태로 변환 (음수/소수점 대응)
function formatThousandsSafe(x) {
    try {
        // 1) 문자열화 + 유니코드 공백/쉼표 제거
        var s = String(x)
            .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, "") // NBSP 등 제거
            .replace(/,/g, "")                                       // 기존 쉼표 제거
            .trim();

        if (s === "" || s === "-" || s === ".") return s || "0";

        // 2) 부호/소수점 분리 (숫자 변환 없이 오직 정규식/문자열)
        var neg = false;
        if (s[0] === "-") { neg = true; s = s.slice(1); }

        // 숫자/점 이외 문자는 모두 제거 (낙원력은 정수라서 . 안 와도 됨, 와도 안전)
        s = s.replace(/[^0-9.]/g, "");

        var parts = s.split(".");
        var intPart = parts[0] || "0";
        var fracPart = parts.length > 1 ? parts.slice(1).join("") : "";

        // 3) 정수부에만 천단위 구분자 삽입
        intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

        var out = fracPart ? (intPart + "." + fracPart) : intPart;
        return neg ? "-" + out : out;
    } catch (e) {
        Log.e("[LOA] formatThousandsSafe error: " + e + " / x=" + x);
        return String(x); // 실패 시 원본 반환
    }
}

// 숫자/문자열 → "168만1449" 형태 (정수 기준, 소수점/문자 제거)
function formatManKorean(x) {
    try {
        var s = String(x).replace(/[^0-9]/g, ""); // 숫자만 남김
        if (s === "") return "0";
        var n = 0;
        // 큰 정수도 안전하게 처리
        for (var i = 0; i < s.length; i++) {
            n = n * 10 + (s.charCodeAt(i) - 48);
        }
        var man = Math.floor(n / 10000);
        var rest = n % 10000;
        if (man > 0 && rest > 0) return man + "만" + rest;
        if (man > 0 && rest === 0) return man + "만";
        return String(rest);
    } catch (e) {
        try { Log.e("[LOA] formatManKorean error: " + e + " / x=" + x); } catch (_) { }
        return String(x);
    }
}


function fetchCombatPower(charNameRaw) {
    var charName = String(charNameRaw); // 공백/특수문자 없음 전제
    var url = LOSTARK_BASE + "/armories/characters/" + charName + "/profiles";
    var t0 = java.lang.System.currentTimeMillis();

    // 요청 시작 로그
    Log.i("[LOA] fetchCombatPower START char=" + charName + " url=" + url);

    var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });
    var dt = java.lang.System.currentTimeMillis() - t0;

    if (!res.ok) {
        Log.e("[LOA] HTTP FAIL code=" + res.code + " ms=" + dt);
        if (res.code === 404) return { ok: false, reason: "NOT_FOUND" };
        return { ok: false, reason: "HTTP_" + res.code };
    }

    var body = res.text || "";
    Log.i("[LOA] HTTP OK code=" + res.code + " ms=" + dt + " bytes=" + body.length);

    var json;
    try {
        json = JSON.parse(body);
    } catch (e2) {
        Log.e("[LOA] JSON parse error: " + e2);
        return { ok: false, reason: "PARSE_ERROR" };
    }

    var cp = null;
    if (json) {
        if (json.CombatPower != null) cp = json.CombatPower;
    }
    if (cp == null || cp === "") {
        Log.w("[LOA] NO CombatPower field in response");
        return { ok: false, reason: "NO_FIELD" };
    }

    if (typeof cp === "number") cp = (Math.round(cp * 100) / 100).toFixed(2);
    else cp = String(cp).trim();

    Log.i("[LOA] SUCCESS char=" + charName + " CP=" + cp);
    return { ok: true, name: charName, combatPower: cp };
}

// Tooltip(JSON 문자열) 내부에서 "…낙원력 : 12345" 패턴을 찾아 숫자만 반환
function extractParadisePowerFromTooltip(tooltipStr) {
    try {
        var tObj = JSON.parse(String(tooltipStr));
        // 모든 문자열 필드를 긁어모아 한 덩어리 텍스트로 만든 뒤 정규식 검색
        var bag = [];
        (function walk(v) {
            if (v == null) return;
            var typ = typeof v;
            if (typ === "string") bag.push(v);
            else if (typ === "object") {
                for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) walk(v[k]);
            }
        })(tObj);
        var joined = bag.join(" ");
        var m = joined.match(/낙원력\s*[:：]\s*([0-9,]+)/); // 콜론 양식 모두 커버
        if (m) return m[1].replace(/,/g, "");
        return null;
    } catch (e) {
        Log.e("[LOA] extractParadisePowerFromTooltip parse error: " + e);
        return null;
    }
}


// 낙원력 추출 함수
function fetchParadisePower(charNameRaw) {
    var charName = String(charNameRaw);
    var url = LOSTARK_BASE + "/armories/characters/" + charName + "/equipment";

    var t0 = java.lang.System.currentTimeMillis();
    var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });
    var dt = java.lang.System.currentTimeMillis() - t0;

    if (!res.ok) {
        Log.e("[LOA] PP HTTP FAIL code=" + res.code + " ms=" + dt);
        if (res.code === 404) return { ok: false, reason: "NOT_FOUND" };
        return { ok: false, reason: "HTTP_" + res.code };
    }

    var body = res.text || "";
    if (ARK_OPTS.log) Log.i("[LOA] PP HTTP OK code=" + res.code + " ms=" + dt + " bytes=" + body.length);

    var arr;
    try {
        arr = JSON.parse(body); // 장비 리스트 배열
    } catch (e) {
        Log.e("[LOA] PP JSON parse error: " + e);
        return { ok: false, reason: "PARSE_ERROR" };
    }

    if (!arr || !arr.length) return { ok: false, reason: "NO_EQUIP" };

    // ES5 방식으로 Type === "보주" 찾기
    var orb = null;
    for (var i = 0; i < arr.length; i++) {
        var it = arr[i];
        if (it && it.Type === "보주") { orb = it; break; }
    }
    if (!orb) return { ok: false, reason: "NO_ORB" };
    if (!orb.Tooltip) return { ok: false, reason: "NO_TOOLTIP" };

    // Tooltip → 낙원력 추출
    var pp = extractParadisePowerFromTooltip(orb.Tooltip);
    if (!pp) {
        if (ARK_OPTS.log) Log.w("[LOA] PP NO_VALUE rawTooltip.head120=" + String(orb.Tooltip).slice(0, 120));
        return { ok: false, reason: "NO_VALUE" };
    }

    return { ok: true, name: charName, paradisePower: pp };

}

// 팔찌 정보 추출 함수
function fetchBracelet(charNameRaw) {
    var charName = String(charNameRaw);
    var url = LOSTARK_BASE + "/armories/characters/" + charName + "/equipment";

    var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });
    if (!res.ok) {
        if (res.code === 404) return { ok: false, reason: "NOT_FOUND" };
        return { ok: false, reason: "HTTP_" + res.code };
    }

    var arr;
    try {
        arr = JSON.parse(res.text);
    } catch (e) {
        return { ok: false, reason: "PARSE_ERROR" };
    }

    // 장비 정보가 아예 없거나 배열이 비어있는 경우
    if (!arr || arr.length === 0) return { ok: false, reason: "NO_BRACELET" };

    var bracelet = null;
    for (var i = 0; i < arr.length; i++) {
        // 배열을 다 뒤져도 Type이 "팔찌"인 게 없으면 bracelet은 null로 남음
        if (arr[i] && arr[i].Type === "팔찌") {
            bracelet = arr[i];
            break;
        }
    }

    // 루프가 끝났는데 팔찌를 못 찾은 경우 (사용자 질문의 케이스)
    if (!bracelet) return { ok: false, reason: "NO_BRACELET" };

    try {
        var tooltip = JSON.parse(bracelet.Tooltip);
        var effectText = "";

        for (var key in tooltip) {
            var element = tooltip[key];
            if (element && element.type === "ItemPartBox" &&
                element.value.Element_000 && element.value.Element_000.indexOf("팔찌 효과") !== -1) {
                effectText = element.value.Element_001;
                break;
            }
        }

        if (!effectText) return { ok: false, reason: "NO_EFFECT" };

        var rawLines = effectText.split(/<BR>/i);
        var stats = [];  // 스탯 정보를 담을 배열
        var effects = []; // 일반 효과를 담을 배열
        var lastItem = null;

        for (var j = 0; j < rawLines.length; j++) {
            var rawLine = rawLines[j].trim();
            if (!rawLine || rawLine.indexOf("해당 효과는 한 파티 당 하나만 적용된다.") !== -1) continue;

            var isNewEffect = rawLine.indexOf("<img") !== -1;
            var cleanText = rawLine.replace(/<img[^>]*>|<\/img>/ig, "")
                .replace(/<[^>]*>/g, "")
                .replace(/\s+/g, " ")
                .trim();

            if (!cleanText) continue;

            if (isNewEffect) {
                var statMatch = cleanText.match(/^(치명|특화|신속|제압|인내|숙련|힘|민첩|지능|체력)\s*\+?([\d,]+)$/);
                if (statMatch) {
                    lastItem = { type: "stat", text: "[" + statMatch[1] + "] " + statMatch[2].replace(/,/g, "") };
                    stats.push(lastItem);
                } else {
                    lastItem = { type: "effect", text: "• " + cleanText };
                    effects.push(lastItem);
                }
            } else if (lastItem) {
                lastItem.text += " " + cleanText;
            }
        }

        // 스탯 정보를 먼저 배치하고 그 뒤에 일반 효과를 합침
        var combinedItems = stats.concat(effects);
        var resultText = combinedItems.map(function (item) { return item.text; }).join("\n");

        return { ok: true, name: charName, content: resultText };

    } catch (e) {
        Log.e("[LOA] Bracelet parse error: " + e);
        return { ok: false, reason: "PARSE_ERROR" };
    }
}

// HTML 태그 제거
function stripHtml(s) {
    return String(s).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function tooltipToPlainText(html) {
    if (!html) return "";
    // <br> -> \n
    let s = html.replace(/<br\s*\/?>/gi, "\n").replace(/<BR\s*\/?>/g, "\n");
    // 태그 제거 (FONT, img 등)
    s = s.replace(/<[^>]*>/g, "");
    // HTML 엔티티 간단 디코딩
    s = s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
    // 여백 정리
    return s.split("\n").map(l => l.trim()).join("\n").trim();
}

function parseTooltipJSON(tooltipStr) {
    try { return JSON.parse(String(tooltipStr)); } catch (e) { return null; }
}
function findItemPartBoxValueByTitle(tipObj, titleText) {
    if (!tipObj) return null;
    var keys = Object.keys(tipObj);
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var el = tipObj[k];
        if (el && el.type === "ItemPartBox" && el.value && typeof el.value.Element_000 === "string") {
            if (el.value.Element_000.indexOf(titleText) !== -1) {
                return el.value.Element_001 || null;
            }
        }
    }
    return null;
}

function getCoreTypeFromTooltip(tooltipStr) {
    var tip = parseTooltipJSON(tooltipStr);
    var raw = findItemPartBoxValueByTitle(tip, "코어 타입"); // 예: "혼돈 - 해"
    return tooltipToPlainText(raw || "");                   // "혼돈 - 해"
}
function getCoreOptionsBlock(tooltipStr) {
    var tip = parseTooltipJSON(tooltipStr);
    var raw = findItemPartBoxValueByTitle(tip, "코어 옵션");
    return raw || "";
}

function getCoreDisplayName(slotName) {
    if (!slotName) return "";
    var idx = slotName.indexOf(" : ");
    return idx >= 0 ? slotName.slice(idx + 3).trim() : slotName.trim();
}
function formatCoreLine(slot) {
    // 예시 출력: [유물]혼돈 - 해 : 현란한 공격[18P]
    var type = getCoreTypeFromTooltip(slot.Tooltip);  // "혼돈 - 해"
    var title = getCoreDisplayName(slot.Name);        // "현란한 공격"
    return "[" + slot.Grade + "]" + type + " : " + title + "[" + slot.Point + "P]";
}
function formatCoreActivationList(slots) {
    var out = [];
    out.push("\n▼ 코어 활성 효과 보기");
    for (var i = 0; i < slots.length; i++) {
        var s = slots[i];
        out.push(""); // 구분 공백
        out.push((i + 1) + ") " + getCoreTypeFromTooltip(s.Tooltip) + " : " + getCoreDisplayName(s.Name) + " [" + s.Grade + "]");
        // 활성 효과
        var blockHtml = getCoreOptionsBlock(s.Tooltip);
        var plain = tooltipToPlainText(blockHtml);
        plain.split("\n").map(function (l) { return l.trim(); }).filter(Boolean)
            .forEach(function (l) { out.push(l); });
    }
    return out.join("\n");
}


// 아이템(보통 {Name, Grade, Tooltip})을 요약 문자열 한 줄로 만들기
function summarizeArkItem(it) {
    var grade = it && it.Grade ? String(it.Grade) : "";
    var name = it && it.Name ? String(it.Name) : "";
    var title = (grade ? "[" + grade + "]" : "") + name;

    // 포인트 표현(예: [18P])은 Tooltip에서 [숫자P] 패턴의 '가장 큰 숫자'를 붙임
    var txt = it && it.Tooltip ? tooltipToPlainText(it.Tooltip) : "";
    var m, maxP = -1;
    var re = /\[(\d+)\s*P\]/g;
    while ((m = re.exec(txt)) !== null) {
        var v = parseInt(m[1], 10);
        if (!isNaN(v) && v > maxP) maxP = v;
    }
    if (maxP >= 0) title += " [" + maxP + "P]";
    return title;
}

// Effects: [{Name, Level, Tooltip: "공격력 +1.13%"}...]
function formatEffects(effects) {
    var lines = [];
    lines.push("◦ 젬 효과 총합");
    for (var i = 0; i < effects.length; i++) {
        var eff = effects[i];
        var plain = tooltipToPlainText(eff.Tooltip || "");
        var m = plain.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
        var pct = m ? (m[1] + "%") : plain.replace(eff.Name, "").trim();
        lines.push(eff.Name + " " + eff.Level + "Lv [" + pct + "]");
    }
    return lines.join("\n");
}


// 직업/클래스명만 빠르게 얻기 (없으면 null)
function fetchProfileClassName(charNameRaw) {
    try {
        var charName = String(charNameRaw);
        var url = LOSTARK_BASE + "/armories/characters/" + charName + "/profiles";
        var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });
        if (!res.ok) return null;
        var js = JSON.parse(res.text || "{}");
        if (js && js.CharacterClassName) return String(js.CharacterClassName);
        if (js && js["CharacterClassName"]) return String(js["CharacterClassName"]);
        return null;
    } catch (e) {
        try { Log.e("[LOA] fetchProfileClassName error: " + e); } catch (_) { }
        return null;
    }
}

// 프로필에서 캐릭터 아이템 레벨만 빠르게 가져오기
function fetchProfileItemLevel(charNameRaw) {
    try {
        var charName = String(charNameRaw);
        var url = LOSTARK_BASE + "/armories/characters/" + charName + "/profiles";
        var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });
        if (!res.ok) return null;
        var js = JSON.parse(res.text || "{}");
        if (js && js.ItemAvgLevel) return String(js.ItemAvgLevel).replace(/,/g, "");
        return null;
    } catch (e) {
        try { Log.e("[LOA] fetchProfileItemLevel error: " + e); } catch (_) { }
        return null;
    }
}


// 장착 중인 칭호만 빠르게 가져오기
function fetchTitle(charNameRaw) {
    try {
        var charName = String(charNameRaw);
        var url = LOSTARK_BASE + "/armories/characters/" + charName + "/profiles";
        var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });
        if (!res.ok) {
            if (res.code === 404) return { ok: false, reason: "NOT_FOUND" };
            return { ok: false, reason: "HTTP_" + res.code };
        }
        var json;
        try { json = JSON.parse(res.text || "{}"); } catch (e) { return { ok: false, reason: "PARSE_ERROR" }; }
        if (!json) return { ok: false, reason: "NO_DATA" };
        var titleText = json.Title ? stripHtml(json.Title) : null;
        return { ok: true, name: charName, title: titleText || null };
    } catch (e) {
        try { Log.e("[LOA] fetchTitle error: " + e); } catch (_) { }
        return { ok: false, reason: "SYSTEM_ERROR" };
    }
}

// ==========================================
// 캐릭터 통합 정보 조회 (.ㅈㅂ)
// ==========================================
function fetchIntegratedInfo(charNameRaw) {
    var charName = String(charNameRaw);
    var url = LOSTARK_BASE + "/armories/characters/" + charName + "?filters=profiles+engravings+cards+gems+arkpassive+arkgrid";

    var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });
    if (!res.ok) {
        if (res.code === 404) return { ok: false, reason: "NOT_FOUND" };
        return { ok: false, reason: "HTTP_" + res.code };
    }

    var data;
    try {
        data = JSON.parse(res.text);
    } catch (e) {
        return { ok: false, reason: "PARSE_ERROR" };
    }

    if (!data || !data.ArmoryProfile) return { ok: false, reason: "NO_DATA" };

    try {
        var p = data.ArmoryProfile || {};
        var ap = data.ArkPassive || {};
        // 공식 API 기준 단수형(Engraving, Gem) 사용
        var eng = data.ArmoryEngraving || {};
        var gems = data.ArmoryGem || {};
        var cards = data.ArmoryCard || {};
        // ArkGrid는 최상단에 존재할 수 있으므로 분기 처리
        var grid = data.ArkGrid || ap.ArkGrid || {};

        // 1. 이름 (템렙) - 콤마 제거
        var itemLv = String(p.ItemAvgLevel || "").replace(/,/g, "");
        var line1 = p.CharacterName + " (" + itemLv + ")";

        // 2. 아크패시브 칭호 + 직업
        var title = ap.Title || "";
        var line2 = (title ? title + " " : "") + p.CharacterClassName;

        // 3. 원대 / 서버 / 길드
        var line3 = p.ExpeditionLevel + "/" + p.ServerName + "/" + (p.GuildName || "길드없음");

        // 4. 전투력 / 명예 - 콤마 제거
        var cp = String(p.CombatPower || "0").replace(/,/g, "");
        var honor = p.HonorPoint || 0;
        var line4 = "전투력 " + cp + "/명예 " + honor;

        // 5. 아크패시브 각인 (마나 4/전문 3/...)
        var engList = [];
        var engAbbr = (loadGameData("engravings.json") || {}).abbr || {};
        if (eng.ArkPassiveEffects && eng.ArkPassiveEffects.length > 0) {
            for (var i = 0; i < eng.ArkPassiveEffects.length; i++) {
                var eff = eng.ArkPassiveEffects[i];
                // Level이 0일 때 생략되는 문제 해결 (null/undefined만 체크)
                if (eff.Name && eff.Level != null) {
                    // 줄임말이 있으면 줄임말로, 없으면 기존처럼 앞 2글자로 표기
                    var engLabel = engAbbr[eff.Name] || String(eff.Name).substring(0, 2);
                    engList.push(engLabel + eff.Level);
                }
            }
        }
        var line5 = engList.length > 0 ? engList.join("/") : "각인 없음";

        // 6. 보석 평균
        var gemAvgText = "보석 없음";
        if (gems.Gems && gems.Gems.length > 0) {
            var sumLv = 0;
            for (var g = 0; g < gems.Gems.length; g++) {
                sumLv += parseInt(gems.Gems[g].Level || 0, 10);
            }
            var avgLv = sumLv / gems.Gems.length;
            gemAvgText = "보석 " + (Math.round(avgLv * 10) / 10).toFixed(1) + "lv";
        }

        // 7. 진/깨/도 (이름 기반 탐색으로 변경하여 안정성 확보)
        var jin = 0, kkae = 0, do_ = 0;
        if (ap.Points && ap.Points.length > 0) {
            for (var pt = 0; pt < ap.Points.length; pt++) {
                var ptName = ap.Points[pt].Name;
                if (ptName === "진화") jin = ap.Points[pt].Value;
                else if (ptName === "깨달음") kkae = ap.Points[pt].Value;
                else if (ptName === "도약") do_ = ap.Points[pt].Value;
            }
        }
        var line7 = "진/깨/도 " + jin + "/" + kkae + "/" + do_;

        // 8. 코어 (고대/유물 카운트)
        var coreGode = 0, coreYumul = 0;
        var gridSlots = grid.Slots || [];
        if (gridSlots.length > 0) {
            for (var s = 0; s < gridSlots.length; s++) {
                var grade = gridSlots[s].Grade;
                if (grade === "고대") coreGode++;
                else if (grade === "유물") coreYumul++;
            }
        }
        var line8 = "코어 고대x" + coreGode + ", 유물x" + coreYumul;

        // 9. 카드 (세트명 '세트' 글자 제거 및 각성수치 추출)
        var line9 = "카드 세트 없음";
        if (cards.Effects && cards.Effects.length > 0) {
            var effectGroup = cards.Effects[cards.Effects.length - 1];

            // Effects 안의 Items 배열에 접근
            if (effectGroup.Items && effectGroup.Items.length > 0) {
                var lastItem = effectGroup.Items[effectGroup.Items.length - 1];
                var rawName = lastItem.Name || ""; // 예: "남겨진 바람의 절벽 6세트 (30각성합계)"

                // 1. "세트"라는 단어 이전까지만 추출 (예: "남겨진 바람의 절벽 6")
                var mSet = rawName.match(/^(.*?)\s*세트/);
                var setName = mSet ? mSet[1] : rawName.split(" (")[0]; // 예외 처리

                // 2. 숫자+각성 패턴 추출 (예: 30)
                var mAwake = rawName.match(/(\d+)(?=각성)/);
                var cAwake = mAwake ? "(" + mAwake[1] + ")" : "";

                // 3. 최종 조합 -> "남겨진 바람의 절벽 6(30)"
                line9 = setName + cAwake;
            }
        }

        // 결과 합치기
        var outLines = ["[beta]"];
        // 장착 중인 칭호 (없으면 줄 생략) - 일부 칭호에 포함된 이모티콘 이미지 태그 제거
        if (p.Title) {
            var titleClean = stripHtml(p.Title);
            if (titleClean) outLines.push(titleClean);
        }
        outLines.push(line1, "", line2, line3, "", line4, line5, "", gemAvgText, line7, line8, line9);
        var out = outLines.join("\n");

        return { ok: true, content: out.trim(), itemLevel: itemLv, className: p.CharacterClassName };

    } catch (e) {
        Log.e("[LOA] Info parse error: " + e);
        return { ok: false, reason: "PARSE_ERROR" };
    }
}
// GET /armories/characters/{charName}/arkgrid
function fetchArkGrid(charNameRaw) {
    var charName = String(charNameRaw);
    var url = LOSTARK_BASE + "/armories/characters/" + charName + "/arkgrid";
    var t0 = java.lang.System.currentTimeMillis();
    Log.i("[LOA] ArkGrid START char=" + charName + " url=" + url);
    var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });
    var dt = java.lang.System.currentTimeMillis() - t0;

    if (!res.ok) {
        Log.e("[LOA] ArkGrid HTTP FAIL code=" + res.code + " ms=" + dt);
        if (res.code === 404) return { ok: false, reason: "NOT_FOUND" };
        return { ok: false, reason: "HTTP_" + res.code };
    }
    var data;
    try { data = JSON.parse(res.text || "{}"); }
    catch (e) { Log.e("[LOA] ArkGrid JSON parse error: " + e); return { ok: false, reason: "PARSE_ERROR" }; }

    // 방어적 파싱: Slots/Effects 비슷한 배열을 찾아낸다
    var slots = null, effects = null;
    // 흔한 키 시도
    if (data.Slots && data.Slots.length) slots = data.Slots;
    if (data.Effects && data.Effects.length) effects = data.Effects;

    // 못 찾으면 객체의 배열 필드를 훑어서 추정
    function isSlotLike(x) {
        return x && typeof x === "object" && x.Name && x.Tooltip && x.Grade && (x.Point != null);
    }
    function isEffectLike(x) {
        return x && typeof x === "object" && x.Name && (x.Level != null) && x.Tooltip;
    }
    if (!slots || !effects) {
        for (var k in data) {
            if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
            var v = data[k];
            if (Object.prototype.toString.call(v) === "[object Array]" && v.length) {
                // 샘플 3개만 검사
                var cntSlot = 0, cntEff = 0, lim = Math.min(v.length, 3);
                for (var i = 0; i < lim; i++) { if (isSlotLike(v[i])) cntSlot++; if (isEffectLike(v[i])) cntEff++; }
                if (cntSlot >= 2 && !slots) slots = v;
                if (cntEff >= 2 && !effects) effects = v;
            }
        }
    }
    if (!slots || !slots.length) return { ok: false, reason: "EMPTY_SLOTS" };
    if (!effects) effects = []; // 없으면 빈 배열

    return { ok: true, Nickname: charName, Slots: slots, Effects: effects };
}

// GET /armories/characters/{charName}/gems
function fetchGems(charNameRaw) {
    var charName = String(charNameRaw);
    var url = LOSTARK_BASE + "/armories/characters/" + charName + "/gems";

    var t0 = java.lang.System.currentTimeMillis();
    Log.i("[LOA] Gems START char=" + charName + " url=" + url);

    var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });
    var dt = java.lang.System.currentTimeMillis() - t0;

    if (!res.ok) {
        Log.e("[LOA] Gems HTTP FAIL code=" + res.code + " ms=" + dt);
        if (res.code === 404) return { ok: false, reason: "NOT_FOUND" };
        return { ok: false, reason: "HTTP_" + res.code };
    }

    var data;
    try { data = JSON.parse(res.text || "{}"); }
    catch (e) {
        Log.e("[LOA] Gems JSON parse error: " + e);
        return { ok: false, reason: "PARSE_ERROR" };
    }

    var gems = (data && data.Gems) ? data.Gems : null;
    var eff = (data && data.Effects) ? data.Effects : null;

    // Gems가 null이거나 배열 길이가 0인 경우 착용하지 않은 것으로 간주
    if (gems === null || gems.length === 0) return { ok: false, reason: "NO_GEMS" };

    return { ok: true, name: charName, Gems: gems, Effects: eff };
}

// "9레벨 광휘의 보석" 같은 문자열에서 타입 판별: 겁/작/광
function getGemTypeShortFromName(nameHtmlOrText) {
    var plain = stripHtml(String(nameHtmlOrText || ""));
    if (plain.indexOf("겁화") !== -1) return "겁";
    if (plain.indexOf("작열") !== -1) return "작";
    if (plain.indexOf("광휘") !== -1) return "광";
    return "?";
}


// "22.00%" -> "22%", "1.20%" -> "1.20%"
function normalizePercentText(numStr) {
    if (numStr == null) return "";
    var s = String(numStr);
    if (s.indexOf(".") === -1) return s;
    // 소수점 끝 0 제거 (최대 2자리까지는 유지하도록 너무 과하게 자르지 않음)
    // 1.20 -> 1.20 (유지), 22.00 -> 22
    if (/^\d+\.00$/.test(s)) return s.replace(/\.00$/, "");
    return s;
}

function extractFirstPercentFromText(text) {
    var plain = stripHtml(String(text || ""));
    var m = plain.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (!m) return null;
    return normalizePercentText(m[1]) + "%";
}

/**
 * classes.json의 직업 줄임말(abbr)을 사용하여 직업명을 3글자 폭으로 변환 (GraalJS)
 */
const formatClassCompact = (className) => {
    // 1. 매핑 테이블에서 별명 가져오기 (없으면 원본 사용)
    var classes = (loadGameData("classes.json") || {}).classes || {};
    let shortName = (classes[className] && classes[className].abbr) || className;

    // 2. 2글자인 경우 가운데 공백 추가 (바드 -> 바 드)
    if (shortName.length === 2) {
        return shortName[0] + "  " + shortName[1];
    }

    // 3. 3글자 이상인 경우 그대로 혹은 잘라서 반환
    return shortName.length > 3 ? shortName.substring(0, 3) : shortName;
};


function renderGemsView(model) {
    // model: { name, ClassName, Gems:[], Effects:{} }
    var cls = formatClassCompact(model.ClassName || "미확인");

    // 1. Effects.Skills를 GemSlot 기준으로 맵핑 (Gems.Slot과 연결)
    var skillBySlot = {};
    var skills = (model.Effects && model.Effects.Skills) ? model.Effects.Skills : [];
    for (var i = 0; i < skills.length; i++) {
        var s = skills[i];
        if (s && s.GemSlot != null) skillBySlot[String(s.GemSlot)] = s;
    }

    var total = model.Gems.length;
    var cntJak = 0, cntGeop = 0;
    var sumLv = 0;

    // 2. 기본 공격력 총합 추출 (Effects.Description 참조)
    // 예: "<FONT COLOR='#B7FB00'>기본 공격력 총합 : 6.80%</FONT>" -> "6.80%"
    var sumBasicAtkText = "0.00%";
    if (model.Effects && model.Effects.Description) {
        var cleanDesc = stripHtml(model.Effects.Description);
        var matchAtk = cleanDesc.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
        if (matchAtk) sumBasicAtkText = matchAtk[1] + "%";
    }

    var rows = [];

    // 3. 각 보석(Gems) 데이터 순회 및 조립
    for (var g = 0; g < model.Gems.length; g++) {
        var gem = model.Gems[g] || {};
        var slot = gem.Slot;

        // 보석 레벨 추출 (Gems.Level 참조)
        var lv = (gem.Level != null) ? parseInt(gem.Level, 10) : 0;
        if (isNaN(lv)) lv = 0;
        sumLv += lv;

        // 보석 이름에서 기본 타입 추출 ('겁', '작', '광')
        var typeShort = getGemTypeShortFromName(gem.Name);
        var sk = skillBySlot[String(slot)] || null;

        // 스킬 이름 추출 (Effects.Skills[i].Name 참조)
        var skillName = sk && sk.Name ? String(sk.Name) : "알 수 없음";

        var displayType = typeShort;
        var pctText = "";

        // 4. Effects.Skills[i].Description 데이터로 겁/작 및 퍼센트 확실히 판별
        if (sk && sk.Description && sk.Description.length > 0) {
            // 예: "피해 32.00% 증가" 또는 "재사용 대기시간 18.00% 감소"
            var targetDesc = String(sk.Description[0]);

            // 광휘 보석일 경우 명확하게 '감소'/'증가' 단어로 재분류
            if (typeShort === "광") {
                if (targetDesc.indexOf("감소") !== -1) {
                    displayType = "작";
                } else if (targetDesc.indexOf("증가") !== -1) {
                    displayType = "겁";
                }
            }

            // 퍼센트 수치만 추출
            var pctMatch = targetDesc.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
            if (pctMatch) {
                pctText = normalizePercentText(pctMatch[1]) + "%";
            }
        }

        // 카운트 누적
        if (displayType === "작") cntJak++;
        else if (displayType === "겁") cntGeop++;

        // 요약 라인 생성 (예: [건  슬] 7작 | 절멸의 탄환(18%))
        var line = "[" + cls + "] " + lv + displayType + " | " + skillName + (pctText ? ("(" + pctText + ")") : "");
        rows.push({
            lv: lv,
            type: displayType,
            line: line
        });
    }

    // 5. 정렬: 레벨 내림차순 -> 작/겁 순
    rows.sort(function (a, b) {
        if (b.lv !== a.lv) return b.lv - a.lv;
        var p = { "작": 1, "겁": 2, "광": 3, "?": 4 };
        var priorityA = p[a.type] || 9;
        var priorityB = p[b.type] || 9;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return 0;
    });

    var avgLv = total ? (sumLv / total) : 0;
    var avgLvText = (Math.round(avgLv * 10) / 10).toFixed(1);

    // 6. 텍스트 조합
    var out = [];
    out.push("◦ " + model.name + " 의 보석 정보");
    out.push("작(" + cntJak + ") 겁(" + cntGeop + "), 평균 " + avgLvText + "lv");
    out.push("기본 공격력 증가:  " + sumBasicAtkText);
    out.push("━━━━━━━━━━━━━━");
    for (var k = 0; k < rows.length; k++) out.push(rows[k].line);

    return out.join("\n");
}

// ==========================================
// 원정대 보석 현황 (.보석현황 / .ㅂㅅㅎㅎ)
// 주력 서버 캐릭터의 보석을 모아 귀속이 아닌 것만 경매장 최저 즉구가로 합산
// ==========================================

// 보석 종류 정의
//  word      : 보석 이름에 들어가는 글자
//  priceWord : 경매장 검색에 쓸 이름 (null이면 그 자체로는 매물이 없는 보석)
//  order     : 캐릭터별 요약에서의 표기 순서
var ROSTER_GEM_TYPES = [
    { word: "겁화", key: "겁", priceWord: "겁화", tier: 4, order: 0 },
    { word: "작열", key: "작", priceWord: "작열", tier: 4, order: 1 },
    { word: "광휘", key: "광", priceWord: null, tier: 4, order: 4 },
    { word: "멸화", key: "멸", priceWord: "멸화", tier: 3, order: 5 },
    { word: "홍염", key: "홍", priceWord: "홍염", tier: 3, order: 6 }
];

// 카카오톡이 긴 메시지를 "전체보기"로 접는 기준 글자 수
var KAKAO_FOLD_LIMIT = 500;

/**
 * 보석 1개에서 레벨/종류/귀속 여부와 시세 기준을 뽑아낸다.
 * @param {object} gem   Gems[i]
 * @param {object} skill 같은 슬롯의 Effects.Skills[i] (광휘 판별용, 없어도 됨)
 */
function parseRosterGem(gem, skill) {
    var plainName = stripHtml(gem && gem.Name);

    var base = null;
    for (var i = 0; i < ROSTER_GEM_TYPES.length; i++) {
        if (plainName.indexOf(ROSTER_GEM_TYPES[i].word) !== -1) { base = ROSTER_GEM_TYPES[i]; break; }
    }

    var lv = parseInt(gem && gem.Level, 10);
    if (isNaN(lv)) lv = 0;

    // 귀속 보석은 이름 끝에 "(귀속)"이 붙는다. 그 외에는 전부 경매장에 올릴 수 있음
    var meta = {
        lv: lv,
        bound: plainName.indexOf("(귀속)") !== -1,
        key: base ? base.key : "?",
        order: base ? base.order : 99,
        priceWord: base ? base.priceWord : null,
        tier: base ? base.tier : 4
    };

    // 광휘 보석은 경매장 매물이 없지만, 옵션 변경 무료 상태일 뿐 언제든 일반 보석으로
    // 되돌릴 수 있으므로 효과에 맞는 일반 보석 시세로 계산한다.
    //  피해/지원 효과 "증가" = 겁화 / 재사용 대기시간 "감소" = 작열
    if (base && base.word === "광휘") {
        var desc = (skill && skill.Description && skill.Description.length) ? String(skill.Description[0]) : "";
        if (desc.indexOf("증가") !== -1) { meta.key = "광겁"; meta.order = 2; meta.priceWord = "겁화"; }
        else if (desc.indexOf("감소") !== -1) { meta.key = "광작"; meta.order = 3; meta.priceWord = "작열"; }
    }

    meta.label = lv + meta.key;
    return meta;
}

/**
 * 보석 1종의 경매장 최저 즉구가를 조회한다. (같은 종류는 cache로 1회만 호출)
 * @returns {number|null} 매물이 없거나 조회 실패면 null
 */
function fetchGemMinPrice(lv, priceWord, tier, cache) {
    var key = lv + priceWord;
    if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];

    var res = httpPostJsonUtf8(
        LOSTARK_BASE + "/auctions/items",
        { "authorization": "bearer " + config.LOSTARK_API_KEY },
        {
            "Sort": "BUY_PRICE",
            "CategoryCode": 210000,
            "ItemTier": tier,
            "ItemName": lv + "레벨 " + priceWord,
            "PageNo": 1,
            "SortCondition": "ASC"
        }
    );

    var price = null;
    if (res.ok) {
        try {
            var items = (JSON.parse(res.text || "{}") || {}).Items || [];
            if (items.length && items[0].AuctionInfo) price = items[0].AuctionInfo.BuyPrice;
        } catch (e) {
            Log.e("[LOA] GemPrice JSON parse error: " + e);
        }
    } else {
        Log.e("[LOA] GemPrice HTTP FAIL code=" + res.code + " item=" + key);
    }

    cache[key] = price;
    return price;
}

/**
 * 주력 서버(= 조회한 캐릭터가 있는 서버) 캐릭터의 보석을 모아 캐릭터별로 집계한다.
 * @returns {{ok:true, name:string, server:string, chars:object[], totalGold:number, tradableCount:number, boundCount:number}|{ok:false, reason:string}}
 */
function fetchRosterGems(charNameRaw) {
    var charName = String(charNameRaw).trim();

    var sib = fetchSiblingsRaw(charName);
    if (!sib.ok) return { ok: false, reason: sib.reason };

    // 원정대는 서버를 넘나들지만, 주력 서버 캐릭터만 집계한다
    var targetChar = null;
    for (var t = 0; t < sib.data.length; t++) {
        if (sib.data[t].CharacterName === charName) { targetChar = sib.data[t]; break; }
    }
    var targetServer = targetChar ? targetChar.ServerName : sib.data[0].ServerName;

    var priceCache = {};
    var chars = [];
    var totalGold = 0, tradableCount = 0, boundCount = 0;

    for (var i = 0; i < sib.data.length; i++) {
        var c = sib.data[i];
        if (c.ServerName !== targetServer) continue;

        var res = fetchGems(c.CharacterName);
        if (!res.ok) continue; // 보석 미착용/조회 실패 캐릭터는 집계에서 제외

        // 광휘 보석 판별에 쓸 스킬 효과를 슬롯 기준으로 맵핑
        var skillBySlot = {};
        var skills = (res.Effects && res.Effects.Skills) ? res.Effects.Skills : [];
        for (var s = 0; s < skills.length; s++) {
            if (skills[s] && skills[s].GemSlot != null) skillBySlot[String(skills[s].GemSlot)] = skills[s];
        }

        var buckets = [];  // [{label, lv, order, count}]
        var byLabel = {};
        var gold = 0, bound = 0;

        for (var g = 0; g < res.Gems.length; g++) {
            var gem = res.Gems[g];
            var meta = parseRosterGem(gem, skillBySlot[String(gem.Slot)]);

            if (meta.bound) { bound++; boundCount++; continue; }
            tradableCount++;

            if (!byLabel[meta.label]) {
                byLabel[meta.label] = { label: meta.label, lv: meta.lv, order: meta.order, count: 0 };
                buckets.push(byLabel[meta.label]);
            }
            byLabel[meta.label].count++;

            if (meta.priceWord) {
                var price = fetchGemMinPrice(meta.lv, meta.priceWord, meta.tier, priceCache);
                if (price) gold += price;
            }
        }

        // 레벨 높은 순 → 보석 종류 순(겁/작/광겁/광작/멸/홍)
        buckets.sort(function (a, b) {
            if (b.lv !== a.lv) return b.lv - a.lv;
            return a.order - b.order;
        });

        totalGold += gold;
        chars.push({
            name: c.CharacterName,
            level: c.ItemAvgLevel,
            buckets: buckets,
            gold: gold,
            bound: bound
        });
    }

    if (!chars.length) return { ok: false, reason: "NO_GEMS" };

    return {
        ok: true,
        name: charName,
        server: targetServer,
        chars: chars,
        totalGold: totalGold,
        tradableCount: tradableCount,
        boundCount: boundCount
    };
}

// 아이템 레벨 문자열("1,792.50")을 숫자로 (정렬용)
function parseItemLevelNumber(levelStr) {
    var n = parseFloat(String(levelStr).replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
}

/**
 * "▼ 더보기" 뒤에 제로폭 공백을 채워 넣어, 그 아래 내용을
 * 카카오톡 "전체보기" 안으로 접어 넣는다.
 */
function foldPadding(visibleText) {
    var pad = KAKAO_FOLD_LIMIT - visibleText.length;
    return pad > 0 ? new Array(pad + 1).join("\u200B") : ""; // \u200B = 제로폭 공백
}

function renderRosterGemsView(model) {
    // 골드 많은 순 → 아이템 레벨 높은 순
    var priced = model.chars.filter(function (c) { return c.buckets.length > 0; })
        .sort(function (a, b) {
            if (b.gold !== a.gold) return b.gold - a.gold;
            return parseItemLevelNumber(b.level) - parseItemLevelNumber(a.level);
        });

    // 귀속 보석만 낀 캐릭터는 접기 영역으로
    var boundOnly = model.chars.filter(function (c) { return c.buckets.length === 0; })
        .sort(function (a, b) { return parseItemLevelNumber(b.level) - parseItemLevelNumber(a.level); });

    var out = [];
    out.push("💎 " + model.name + "의 원정대 보석");
    out.push("");
    out.push("◦ 거래가능 " + model.tradableCount + "개 / 🔒 귀속 " + model.boundCount + "개");
    out.push("◦ 총 시세 " + formatThousandsSafe(model.totalGold) + " G");
    out.push("━━━━━━━━━━━━━━");

    if (!priced.length) {
        out.push("거래 가능한 보석이 없어요. (전부 귀속)");
    }

    for (var i = 0; i < priced.length; i++) {
        var c = priced[i];
        var parts = c.buckets.map(function (b) { return b.label + "(" + b.count + ")"; });
        if (c.bound > 0) parts.push("🔒" + c.bound);

        if (i > 0) out.push("");
        out.push("◦ " + c.name + " (" + c.level + ")");
        out.push(" • " + parts.join(" "));
        out.push(" • " + formatThousandsSafe(c.gold) + " G");
    }

    out.push("━━━━━━━━━━━━━━");
    out.push("귀속 보석 제외 / 경매장 최저 즉구가 기준");

    if (boundOnly.length) {
        out.push("");
        out.push("▼ 귀속 보석만 착용한 캐릭터 (" + boundOnly.length + ")");

        var visible = out.join("\n");
        var hidden = ["--------------"];
        for (var j = 0; j < boundOnly.length; j++) {
            var bc = boundOnly[j];
            hidden.push("◦ " + bc.name + " (" + bc.level + ") ➜ 🔒" + bc.bound + "개");
        }
        return visible + foldPadding(visible) + "\n" + hidden.join("\n");
    }

    return out.join("\n");
}

function renderArkGridView(model) {
    // model: { Nickname, ClassName, Slots:[], Effects:[] }
    var head = "◦ " + (model.Nickname || model.name || "") + "(" + (model.ClassName || "미확인") + ")의 아크그리드";

    var linesTop = model.Slots.map(formatCoreLine).join("\n");
    var effects = formatEffects(model.Effects || []);
    var activ = formatCoreActivationList(model.Slots || []);

    return [head, "", linesTop, "", effects, "", activ].join("\n");
}
/***** ─────────────────────────────────────────
 *  레이드 클리어 골드/보상 (.ㅋㄱ / ㅋㄱ)
 *  데이터 파일: /sdcard/Sybot/data/raid_rewards.json
 *  스키마: { version:1, raids: { [레이드명]: { [난이도]: [ {gate,gold,moreGold,clear[],more[]} ] } } }
 * ─────────────────────────────────────────*****/

function _normKey(s) {
    return String(s || "").replace(/\s+/g, "").toLowerCase();
}

function mapToText(mapObj) {
    var keys = Object.keys(mapObj || {});
    if (!keys.length) return "";
    // 보기 좋게 이름순
    keys.sort();
    return keys.map(function (k) { return k + " x " + mapObj[k]; }).join(" + ");
}

function findRaidCandidates(db, query) {
    if (!db || !db.raids) return [];
    var raidNames = Object.keys(db.raids);
    var matched = [];
    for (var i = 0; i < raidNames.length; i++) {
        if (raidNames[i].indexOf(query) !== -1) matched.push(raidNames[i]);
    }
    return matched;
}

/**
 * 레이드 난이도 1개의 클리어 골드 블록 렌더링
 * @param {object} diffObj { entryLevel(도전레벨), gates: [관문별 골드] }
 * @param {boolean} boundAll 레이드 단위 전액 귀속 여부 (지평의 성당)
 * 귀속 규칙: boundAll = 전액 귀속 / 도전레벨 1730 미만 노말 = 절반 귀속 / 그 외 = 전액 유통
 */
function renderRaidBlock(raidName, diff, diffObj, boundAll) {
    var res = "◦ " + raidName + " (" + diff + ")\n";
    var totalGold = 0;
    var gates = (diffObj && diffObj.gates) || [];

    for (var i = 0; i < gates.length; i++) {
        res += (i + 1) + "관: " + formatThousandsSafe(gates[i]) + "G\n";
        totalGold += gates[i];
    }

    var boundGold = 0;
    if (boundAll) boundGold = totalGold;
    else if (diff === "노말" && diffObj.entryLevel < 1730) boundGold = totalGold / 2;
    var tradeGold = totalGold - boundGold;

    res += "총합: " + formatThousandsSafe(totalGold) + "G (귀속 "
        + formatThousandsSafe(boundGold) + "/유통 " + formatThousandsSafe(tradeGold) + ")";

    return res;
}

function loadRaidRewards() {
    const js = loadGameData("raid_rewards.json");

    // 데이터 유효성 검사 (파일이 없거나 JSON 형식이 안 맞으면 null 반환)
    if (!js || !js.raids) {
        Log.e("[RAID] Failed to load or invalid JSON format.");
        return null;
    }

    return js;
}

/**
 * 캐릭터의 원정대(부캐) 목록 원본 배열을 가져오는 함수
 * @returns {{ok:true, data:object[]}|{ok:false, reason:string, detail?:string}}
 */
function fetchSiblingsRaw(characterName) {
    const cleanName = String(characterName).trim();
    const apiUrl = `${LOSTARK_BASE}/characters/${encodeURIComponent(cleanName)}/siblings`;

    try {
        Log.i("[LOA] Fetching siblings for: " + cleanName + " from URL: " + apiUrl);
        const url = new java.net.URL(apiUrl);
        const conn = url.openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(5000);
        conn.setRequestProperty("authorization", "bearer " + config.LOSTARK_API_KEY);
        conn.setRequestProperty("accept", "application/json");

        const responseCode = conn.getResponseCode();
        if (responseCode !== 200) {
            Log.e("[LOA] Siblings HTTP FAIL code=" + responseCode);
            return { ok: false, reason: "API_ERROR", detail: `HTTP ${responseCode}` };
        }

        const is = conn.getInputStream();
        const br = new java.io.BufferedReader(new java.io.InputStreamReader(is, "UTF-8"));
        let responseData = "";
        let line;
        while ((line = br.readLine()) !== null) responseData += line;
        br.close();

        if (!responseData || responseData === "null") return { ok: false, reason: "NOT_FOUND" };

        const data = JSON.parse(responseData);
        if (!Array.isArray(data) || !data.length) return { ok: false, reason: "NOT_FOUND" };

        return { ok: true, data: data };
    } catch (e) {
        Log.e("[LOA] Error fetching siblings: " + e);
        return { ok: false, reason: "SYSTEM_ERROR", detail: e.message };
    }
}

/**
 * 캐릭터의 원정대(부캐) 목록을 가져와서 정렬하는 함수
 */
const fetchSiblings = (characterName) => {
    const cleanName = characterName.trim();

    try {
        const raw = fetchSiblingsRaw(cleanName);
        if (!raw.ok) return raw;

        const data = raw.data;
        const targetChar = data.find(c => c.CharacterName === cleanName);
        const targetServer = targetChar ? targetChar.ServerName : data[0].ServerName;

        const sortedData = data.slice().sort((a, b) => {
            if (a.ServerName === targetServer && b.ServerName !== targetServer) return -1;
            if (a.ServerName !== targetServer && b.ServerName === targetServer) return 1;
            return parseFloat(String(b.ItemAvgLevel).replace(/,/g, "")) - parseFloat(String(a.ItemAvgLevel).replace(/,/g, ""));
        });

        let content = `◦ ${targetServer} 서버\n`;
        let currentServer = targetServer;

        sortedData.forEach(char => {
            if (char.ServerName !== currentServer) {
                currentServer = char.ServerName;
                content += `\n˙◦ ${currentServer} 서버\n`;
            }

            // [적용] classes.json의 직업 줄임말 기반 컴팩트 포맷
            const compactClass = formatClassCompact(char.CharacterClassName);
            content += `[${compactClass}] ${char.CharacterName} (${char.ItemAvgLevel})\n`;
        });

        return { ok: true, content: content.trim() };
    } catch (e) {
        Log.e("[LOA] Error fetching siblings: " + e);
        return { ok: false, reason: "SYSTEM_ERROR", detail: e.message };
    }
};

/**
 * 로스트아크 최신 패치노트 조회 함수
 * "업데이트" 또는 "정기 점검 완료" 키워드가 들어간 공지 중 가장 최신글을 반환.
 * (2026.05 기준: 업데이트 공지가 "정기 점검 완료 안내" 제목으로도 올라오는 경우 대응)
 */
function fetchLatestPatchNote() {
    var keywords = ["업데이트", "정기 점검 완료"];
    var candidates = [];
    var lastHttpFail = null;

    for (var i = 0; i < keywords.length; i++) {
        var url = LOSTARK_BASE + "/news/notices?searchText=" + encodeURIComponent(keywords[i]) + "&type=" + encodeURIComponent("공지");
        var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });

        if (!res.ok) {
            lastHttpFail = "HTTP_" + res.code;
            continue; // 한쪽이 실패해도 다른 키워드는 계속 시도
        }

        try {
            var list = JSON.parse(res.text);
            if (Array.isArray(list) && list.length > 0) {
                candidates.push(list[0]); // 각 키워드별 가장 최신 항목 (API 기본 정렬)
            }
        } catch (e) {
            // 한쪽 파싱 실패해도 다른 키워드 결과는 사용
        }
    }

    if (candidates.length === 0) {
        return { ok: false, reason: lastHttpFail || "NO_DATA" };
    }

    // Date 필드(ISO 형식)로 가장 최신 항목 선택. 문자열 비교만으로 시간순 정렬 가능.
    var latest = candidates[0];
    for (var j = 1; j < candidates.length; j++) {
        var lDate = String(latest.Date || "");
        var cDate = String(candidates[j].Date || "");
        if (cDate > lDate) latest = candidates[j];
    }

    return { ok: true, data: latest };
}
/**
 * 로스트아크 캘린더 API에서 골드를 주는 모험 섬(쌀섬) 일정을 가져오는 함수
 */
function fetchGoldIslands() {
    Log.i("[쌀섬] fetchGoldIslands 함수 시작");
    var url = LOSTARK_BASE + "/gamecontents/calendar";

    var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });

    if (!res.ok) {
        Log.e("[쌀섬] HTTP 요청 실패: " + res.code);
        return { ok: false, reason: "HTTP_" + res.code };
    }

    try {
        var data = JSON.parse(res.text);
        var goldIslandsByDate = {};

        for (var i = 0; i < data.length; i++) {
            var item = data[i];

            // 1. 모험 섬만 필터링
            if (item.CategoryName !== "모험 섬") continue;

            var islandName = item.ContentsName;
            var hasGold = false;
            var goldStartTimes = null;

            // 2. 보상 목록 중에서 "골드" 아이템 탐색
            if (item.RewardItems) {
                for (var r = 0; r < item.RewardItems.length; r++) {
                    var rItems = item.RewardItems[r].Items;
                    if (rItems) {
                        for (var k = 0; k < rItems.length; k++) {
                            if (rItems[k].Name === "골드") {
                                hasGold = true;
                                // ★ 핵심 수정: 골드 보상 전용 StartTimes를 추출
                                goldStartTimes = rItems[k].StartTimes;
                                break;
                            }
                        }
                    }
                    if (hasGold) break;
                }
            }

            // 골드를 아예 주지 않는 섬은 패스
            if (!hasGold) continue;

            // ★ 핵심 수정: 골드 전용 StartTimes가 배열로 있으면 그것을 사용하고, 
            // 만약 null이라면 (항상 골드를 주는 경우) 섬의 기본 StartTimes를 사용합니다.
            var targetTimes = goldStartTimes ? goldStartTimes : item.StartTimes;

            // 3. 추출한 일정(targetTimes)을 바탕으로 날짜별 맵핑
            if (targetTimes) {
                for (var s = 0; s < targetTimes.length; s++) {
                    var timeStr = String(targetTimes[s]);
                    var dateStr = timeStr.split("T")[0];
                    var hour = parseInt(timeStr.substring(11, 13), 10);
                    var period = hour < 15 ? "오전" : "오후";

                    if (!goldIslandsByDate[dateStr]) {
                        goldIslandsByDate[dateStr] = { "오전": {}, "오후": {} };
                    }
                    goldIslandsByDate[dateStr][period][islandName] = true;
                }
            }
        }

        return { ok: true, data: goldIslandsByDate };
    } catch (e) {
        Log.e("[쌀섬] 데이터 파싱/처리 중 에러: " + e);
        return { ok: false, reason: "PARSE_ERROR" };
    }
}

function formatGoldIslands(dayData) {
    var am = Object.keys(dayData["오전"]).join(", ");
    var pm = Object.keys(dayData["오후"]).join(", ");
    if (am && pm) {
        if (am === pm) return am;                               // 평일: 같은 섬, 표시 없이
        return "(오전) " + am + " / (오후) " + pm;              // 주말: 오전/오후 다른 섬
    }
    if (am) return "(오전) " + am;                              // 오전에만 골드
    if (pm) return "(오후) " + pm;                              // 오후에만 골드
    return "없음";
}

/**
 * 레벨에 해당하는 주급 구간 반환 (weekly_gold.json의 tiers, 레벨 내림차순)
 * 각 구간: { minLevel, maxTotal: {total, tradeable}, maxTradeable: {total, tradeable} }
 *   maxTotal      = 총골드(귀속 포함)가 가장 큰 3개 레이드 조합
 *   maxTradeable  = 거래가능 골드가 가장 큰 3개 레이드 조합
 * @return {object|null} 해당 구간 객체, 최소 구간(1710) 미만이면 null
 */
// "2026-06-24" -> "6.24" (연도 생략, 월 앞자리 0 제거)
function formatPatchDate(dateStr) {
    var m = String(dateStr || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (!m) return String(dateStr || "");
    return parseInt(m[1], 10) + "." + parseInt(m[2], 10);
}

function findWeeklyGoldTier(levelStr) {
    var level = parseFloat(String(levelStr).replace(/,/g, ""));
    if (isNaN(level)) return null;

    var tiers = (loadGameData("weekly_gold.json") || {}).tiers || [];
    for (var i = 0; i < tiers.length; i++) {
        if (level >= tiers[i].minLevel) return tiers[i];
    }
    return null;
}

/**
 * 캐릭터 1명의 주급을 두 기준(레이드 조합 포함)으로 렌더링 (.클골 캐릭터명)
 */
function renderCharWeeklyGold(charName, levelStr, tier, patchDate) {
    var out = "◦ " + charName + " (" + levelStr + ")의 주급";
    if (patchDate) out += "\n(" + formatPatchDate(patchDate) + " 기준)";
    out += "\n";

    out += "\n총골드 최대: " + formatThousandsSafe(tier.maxTotal.total)
        + "\n(귀속 " + formatThousandsSafe(tier.maxTotal.total - tier.maxTotal.tradeable)
        + "/유통 " + formatThousandsSafe(tier.maxTotal.tradeable) + ")";
    if (tier.maxTotal.combo) out += "\n└ " + tier.maxTotal.combo;
    out += "\n";

    out += "\n유통골드 최대: " + formatThousandsSafe(tier.maxTradeable.total)
        + "\n(귀속 " + formatThousandsSafe(tier.maxTradeable.total - tier.maxTradeable.tradeable)
        + "/유통 " + formatThousandsSafe(tier.maxTradeable.tradeable) + ")";
    if (tier.maxTradeable.combo) out += "\n└ " + tier.maxTradeable.combo;

    return out;
}

/**
 * 원정대 정보를 바탕으로 서버별 주급을 계산하는 함수
 */
function fetchWeeklyGold(charNameRaw) {
    var charName = String(charNameRaw).trim();
    var url = LOSTARK_BASE + "/characters/" + encodeURIComponent(charName) + "/siblings";

    var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });
    if (!res.ok) {
        if (res.code === 404) return { ok: false, reason: "NOT_FOUND" };
        return { ok: false, reason: "HTTP_" + res.code };
    }

    var data;
    try {
        data = JSON.parse(res.text);
    } catch (e) {
        return { ok: false, reason: "PARSE_ERROR" };
    }

    if (!Array.isArray(data) || data.length === 0) {
        return { ok: false, reason: "NOT_FOUND" };
    }

    // 서버별로 캐릭터 분류
    var servers = {};
    var targetServer = data[0].ServerName;

    for (var i = 0; i < data.length; i++) {
        var c = data[i];
        var srv = c.ServerName;
        if (c.CharacterName === charName) targetServer = srv; // 검색한 캐릭터의 서버 저장

        if (!servers[srv]) servers[srv] = [];
        var lv = parseFloat(String(c.ItemAvgLevel).replace(/,/g, ""));

        servers[srv].push({
            name: c.CharacterName,
            cls: c.CharacterClassName,
            level: lv,
            levelStr: c.ItemAvgLevel
        });
    }

    // 검색한 캐릭터가 있는 서버가 가장 먼저 나오게 정렬
    var serverNames = Object.keys(servers).sort(function (a, b) {
        if (a === targetServer) return -1;
        if (b === targetServer) return 1;
        return 0;
    });

    // 타이틀 (기준 패치 날짜 함께 표시)
    var goldData = loadGameData("weekly_gold.json") || {};
    var out = "◦ " + charName + "의 주급";
    if (goldData.patchDate) out += "\n(" + formatPatchDate(goldData.patchDate) + " 기준)";
    out += "\n";
    var hasAnyGold = false;

    // 각 서버별 주급 계산
    for (var s = 0; s < serverNames.length; s++) {
        var srvName = serverNames[s];
        var chars = servers[srvName];

        // 레벨 내림차순 정렬
        chars.sort(function (a, b) { return b.level - a.level; });

        var top6 = chars.slice(0, 6);
        var sumTotal = 0, sumTotalTrade = 0; // 기준①: 총골드 최대 조합
        var sumTrade = 0, sumTradeTrade = 0; // 기준②: 유통골드 최대 조합
        var details = [];

        for (var k = 0; k < top6.length; k++) {
            var c = top6[k];
            var tier = findWeeklyGoldTier(c.level);
            if (tier) {
                sumTotal += tier.maxTotal.total;
                sumTotalTrade += tier.maxTotal.tradeable;
                sumTrade += tier.maxTradeable.total;
                sumTradeTrade += tier.maxTradeable.tradeable;
                var compactCls = formatClassCompact(c.cls);
                details.push("[" + compactCls + "] " + c.name + " (" + c.levelStr + ")");
            }
        }

        if (sumTotal > 0) {
            hasAnyGold = true;
            // 캐릭터 목록 먼저 출력 -> 한 줄 띄우기 -> 서버별 기준별 총합 출력
            out += "\n" + details.join("\n") + "\n\n";
            out += "[" + srvName + "]\n";
            out += "총골드 최대: " + formatThousandsSafe(sumTotal)
                + "\n(귀속 " + formatThousandsSafe(sumTotal - sumTotalTrade)
                + "/유통 " + formatThousandsSafe(sumTotalTrade) + ")\n";
            out += "유통골드 최대: " + formatThousandsSafe(sumTrade)
                + "\n(귀속 " + formatThousandsSafe(sumTrade - sumTradeTrade)
                + "/유통 " + formatThousandsSafe(sumTradeTrade) + ")\n";
        }
    }

    if (!hasAnyGold) {
        out += "\n주급을 받을 수 있는 캐릭터(1710 이상)가 없습니다.";
    }

    return { ok: true, content: out.trim() };
}

// 악세서리 옵션 축약 매핑
var ACC_STAT_SHORT = {
    "적에게 주는 피해": "적주피",
    "무기 공격력": "무공",
    "파티원 보호막 효과": "파보호",
    "파티원 회복 효과": "파회복",
    "치명타 피해": "치피",
    "아군 피해량 강화 효과": "아피강",
    "치명타 적중률": "치적",
    "아군 공격력 강화 효과": "아공강",
    "공격력": "공격력",
    "최대 마나": "최대마나",
    "전투 중 마나 회복량": "마나회복",
    "낙인력": "낙인력",
    "최대 생명력": "최생",
    "세레나데, 신앙, 조화 게이지 획득량": "아덴",
    "전투 중 생명력 회복량": "생회"
};

function formatAccStatName(name) {
    var n = name.trim();
    return ACC_STAT_SHORT[n] || n;
}

// 폰트 컬러를 기준으로 연마 효과 등급 판별
function getAccGradeFromColor(colorCode) {
    var c = colorCode.toUpperCase();
    if (c.indexOf("00B5FF") !== -1) return "하"; // 파란색 (희귀)
    if (c.indexOf("CE43FC") !== -1) return "중"; // 보라색 (영웅)
    if (c.indexOf("FE9600") !== -1 || c.indexOf("FA5D00") !== -1 || c.indexOf("FF9900") !== -1) return "상"; // 주황색 (전설)
    return "하"; // 기본값
}

function fetchAccessories(charNameRaw) {
    var charName = String(charNameRaw);
    var url = LOSTARK_BASE + "/armories/characters/" + charName + "/equipment";

    var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });
    if (!res.ok) {
        if (res.code === 404) return { ok: false, reason: "NOT_FOUND" };
        return { ok: false, reason: "HTTP_" + res.code };
    }

    var arr;
    try {
        arr = JSON.parse(res.text);
    } catch (e) {
        return { ok: false, reason: "PARSE_ERROR" };
    }

    if (!arr || arr.length === 0) return { ok: false, reason: "NO_EQUIP" };

    var accessories = [];
    var sumQuality = 0;
    var accCount = 0;

    for (var i = 0; i < arr.length; i++) {
        var it = arr[i];
        if (it && (it.Type === "목걸이" || it.Type === "귀걸이" || it.Type === "반지")) {
            try {
                var tooltip = JSON.parse(it.Tooltip);
                var quality = 0;
                var gradeText = it.Grade + " " + it.Type;

                // 품질과 등급(고대 목걸이 등) 추출
                if (tooltip.Element_001 && tooltip.Element_001.value) {
                    quality = tooltip.Element_001.value.qualityValue || 0;
                    if (tooltip.Element_001.value.leftStr0) {
                        gradeText = stripHtml(tooltip.Element_001.value.leftStr0);
                    }
                }

                sumQuality += quality;
                accCount++;

                // 연마 효과 추출
                var polishLines = [];
                for (var key in tooltip) {
                    var element = tooltip[key];
                    if (element && element.type === "ItemPartBox" &&
                        element.value && element.value.Element_000 &&
                        element.value.Element_000.indexOf("연마 효과") !== -1) {

                        var rawLines = element.value.Element_001.split(/<br\s*\/?>/i);
                        for (var j = 0; j < rawLines.length; j++) {
                            var rawLine = rawLines[j];
                            // 불필요한 이미지 태그 제거
                            var lineNoImg = rawLine.replace(/<img[^>]*>|<\/img>/ig, "").trim();
                            if (!lineNoImg) continue;

                            // 색상 태그를 이용한 파싱 로직
                            // 예: 무기 공격력 <FONT COLOR='CE43FC'>+1.80%</FONT>
                            var match = lineNoImg.match(/(.*?)\s*<font\s+color=['"]?([^'"]+)['"]?>([^<]+)<\/font>/i);
                            if (match) {
                                var statName = formatAccStatName(match[1]);
                                var color = match[2];
                                var val = match[3];
                                var rank = getAccGradeFromColor(color);
                                polishLines.push("[" + rank + "] " + statName + " " + val);
                            } else {
                                // 파싱 실패 시 기본 텍스트 삽입
                                polishLines.push(stripHtml(lineNoImg));
                            }
                        }
                        break;
                    }
                }

                accessories.push({
                    type: it.Type,
                    gradeText: gradeText,
                    quality: quality,
                    lines: polishLines
                });

            } catch (e) {
                Log.e("[LOA] Accessory parse error for " + it.Name + ": " + e);
            }
        }
    }

    if (accessories.length === 0) return { ok: false, reason: "NO_ACCESSORY" };


    // 악세서리 정렬: 목걸이 -> 귀걸이 -> 반지 순서
    var typeOrder = { "목걸이": 1, "귀걸이": 2, "반지": 3 };
    accessories.sort(function (a, b) {
        return typeOrder[a.type] - typeOrder[b.type];
    });

    // 텍스트 조합
    var out = [];
    out.push(charName + "의 악세 정보\n");

    for (var k = 0; k < accessories.length; k++) {
        var acc = accessories[k];
        out.push("• " + acc.gradeText + " (품: " + acc.quality + ")");
        if (acc.lines.length > 0) {
            out.push(acc.lines.join("\n"));
        } else {
            out.push("연마 효과 없음");
        }
        out.push(""); // 한 줄 띄어쓰기
    }

    return { ok: true, name: charName, content: out.join("\n").trim() };
}

// ==========================================
// 장비창 조회 (무기/투구/어깨/상의/하의/장갑/완갑) - .장비
// ==========================================
var EQUIP_TYPE_ORDER = { "무기": 1, "투구": 2, "어깨": 3, "상의": 4, "하의": 5, "장갑": 6, "완갑": 7 };

// Tooltip JSON에서 지정한 type(NameTagBox, ItemTitle 등)을 가진 Element의 value를 반환
function findTooltipElementValueByType(tipObj, typeName) {
    if (!tipObj) return null;
    var keys = Object.keys(tipObj);
    for (var i = 0; i < keys.length; i++) {
        var el = tipObj[keys[i]];
        if (el && el.type === typeName) return el.value;
    }
    return null;
}

function fetchEquipmentSummary(charNameRaw) {
    var charName = String(charNameRaw);
    var url = LOSTARK_BASE + "/armories/characters/" + charName + "/equipment";

    var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });
    if (!res.ok) {
        if (res.code === 404) return { ok: false, reason: "NOT_FOUND" };
        return { ok: false, reason: "HTTP_" + res.code };
    }

    var arr;
    try {
        arr = JSON.parse(res.text);
    } catch (e) {
        return { ok: false, reason: "PARSE_ERROR" };
    }

    if (!arr || arr.length === 0) return { ok: false, reason: "NO_EQUIP" };

    var items = [];
    for (var i = 0; i < arr.length; i++) {
        var it = arr[i];
        if (!it || EQUIP_TYPE_ORDER[it.Type] == null) continue;

        var lineText = it.Name || "";
        var quality = null;
        var itemLevel = null;
        var grade = it.Grade || null;

        try {
            var tooltip = JSON.parse(it.Tooltip);

            // "+23 운명의 전율 어깨장식" 형태 (강화단계 포함 이름)
            var nameTagVal = findTooltipElementValueByType(tooltip, "NameTagBox");
            if (nameTagVal) lineText = stripHtml(nameTagVal);

            // 품질(qualityValue) / 아이템 레벨(leftStr2: "아이템 레벨 1800 (티어 4)")
            var itemTitleVal = findTooltipElementValueByType(tooltip, "ItemTitle");
            if (itemTitleVal) {
                // 완갑처럼 품질 개념이 없는 부위는 qualityValue가 -1로 내려옴 → 품질 없음 처리
                if (itemTitleVal.qualityValue != null && itemTitleVal.qualityValue >= 0) quality = itemTitleVal.qualityValue;
                if (itemTitleVal.leftStr2) {
                    var mLv = stripHtml(itemTitleVal.leftStr2).match(/아이템\s*레벨\s*([0-9,]+)/);
                    if (mLv) itemLevel = mLv[1].replace(/,/g, "");
                }
            }
        } catch (e) {
            Log.e("[LOA] 장비 Tooltip 파싱 실패 (" + it.Name + "): " + e);
        }

        items.push({ type: it.Type, text: lineText, quality: quality, itemLevel: itemLevel, grade: grade });
    }

    if (items.length === 0) return { ok: false, reason: "NO_EQUIP" };

    items.sort(function (a, b) { return EQUIP_TYPE_ORDER[a.type] - EQUIP_TYPE_ORDER[b.type]; });

    return { ok: true, name: charName, items: items };
}

// "+23 운명의 전율 어깨장식" -> "+23 어깨장식" (앞 강화단계 + 마지막 단어인 기본 부위명만 남김)
function simplifyEquipName(text) {
    var tokens = String(text).trim().split(/\s+/);
    if (tokens.length <= 2) return tokens.join(" ");
    return tokens[0] + " " + tokens[tokens.length - 1];
}

// 방어구는 실제 아이템명과 무관하게 슬롯 기준 고정 명칭 사용
var EQUIP_TYPE_DISPLAY_NAME = { "투구": "투구", "어깨": "견갑", "상의": "상의", "하의": "하의", "장갑": "장갑", "완갑": "완갑" };

// 무기는 클래스별 무기 기본명(classes.json의 weapon) 매칭 우선 — 마지막 단어 파싱이 부정확한 경우가 많음.
// 매칭 실패 시 기존 마지막 단어 파싱 방식으로 폴백. 방어구는 슬롯 고정 명칭.
// enhanceWidth: 강화단계 표기 폭. 지정 시 짧은 쪽 뒤에 공백을 덧대 부위명 시작 위치를 맞춤.
function getEquipDisplayName(it, className, enhanceWidth) {
    var enhance = String(it.text).trim().split(/\s+/)[0];
    while (enhance.length < enhanceWidth) enhance += " ";

    if (it.type === "무기") {
        var classes = (loadGameData("classes.json") || {}).classes || {};
        var weaponName = classes[className] && classes[className].weapon;
        if (weaponName) return enhance + " " + weaponName;
        return simplifyEquipName(it.text);
    }

    return enhance + " " + EQUIP_TYPE_DISPLAY_NAME[it.type];
}

function renderEquipmentView(model) {
    var sumQuality = 0;
    var qualityCount = 0;
    for (var i = 0; i < model.items.length; i++) {
        var q = model.items[i].quality;
        if (q != null) { sumQuality += q; qualityCount++; }
    }
    var avgQuality = qualityCount ? (Math.round((sumQuality / qualityCount) * 10) / 10).toFixed(1) : "?";

    // 강화단계 자릿수가 섞이면(+21 / +1) 짧은 쪽을 공백으로 채워 부위명을 세로로 정렬
    var enhanceWidth = 0;
    for (var k = 0; k < model.items.length; k++) {
        var eLen = String(model.items[k].text).trim().split(/\s+/)[0].length;
        if (eLen > enhanceWidth) enhanceWidth = eLen;
    }

    var nameLine = model.name + (model.charLevel ? "(" + model.charLevel + ")" : "");
    var out = [nameLine + "의 장비", "> 평균 품질: " + avgQuality, ""];
    for (var j = 0; j < model.items.length; j++) {
        var it = model.items[j];
        // 완갑은 아이템 레벨이 없으므로 괄호 안에 등급(Grade)을 대신 표시
        var paren = (it.itemLevel != null) ? it.itemLevel : ((it.grade != null) ? it.grade : "?");
        var line = getEquipDisplayName(it, model.className, enhanceWidth) + "(" + paren + ")";
        if (it.quality != null) line += " : " + it.quality;
        out.push(line);
    }
    return out.join("\n");
}

// ==========================================
// 내실 조회 (수집형 포인트) - .내실 / .ㄴㅅ
// ==========================================

// GET /armories/characters/{charName}/collectibles
function fetchCollectibles(charNameRaw) {
    var charName = String(charNameRaw);
    var url = LOSTARK_BASE + "/armories/characters/" + charName + "/collectibles";

    var res = httpGetUtf8(url, { "authorization": "bearer " + config.LOSTARK_API_KEY });
    if (!res.ok) {
        if (res.code === 404) return { ok: false, reason: "NOT_FOUND" };
        return { ok: false, reason: "HTTP_" + res.code };
    }

    var arr;
    try {
        arr = JSON.parse(res.text);
    } catch (e) {
        return { ok: false, reason: "PARSE_ERROR" };
    }

    if (!arr || arr.length === 0) return { ok: false, reason: "NO_DATA" };

    var items = [];
    for (var i = 0; i < arr.length; i++) {
        var it = arr[i];
        if (!it) continue;
        items.push({ type: it.Type, point: it.Point, maxPoint: it.MaxPoint });
    }

    return { ok: true, name: charName, items: items };
}

// 한글 등 코드 0xFF를 넘는 문자는 2칸, 그 외(영문/숫자/공백 등)는 1칸으로 계산한 표시 폭
// 체크마크(✓)는 카카오톡 폰트에서 한글보다 더 넓게 보여서 3칸으로 계산
function getDisplayWidth(str) {
    var width = 0;
    for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code === 0x2713) width += 3;
        else width += code > 0xFF ? 2 : 1;
    }
    return width;
}

function renderCollectiblesView(model) {
    var rows = [];
    var sumPct = 0;
    var maxLabelWidth = 0;
    var maxValueWidth = 0;
    for (var i = 0; i < model.items.length; i++) {
        var it = model.items[i];
        var pct = it.maxPoint > 0 ? (it.point / it.maxPoint * 100) : 0;
        sumPct += pct;
        var label = (pct >= 100 ? "✓ " : "") + it.type;
        var value = it.point + "/" + it.maxPoint + " (" + pct.toFixed(0) + "%)";
        maxLabelWidth = Math.max(maxLabelWidth, getDisplayWidth(label));
        maxValueWidth = Math.max(maxValueWidth, getDisplayWidth(value));
        rows.push({ label: label, value: value, pct: pct });
    }

    // 달성률 낮은 순 정렬 (챙겨야 할 항목을 먼저 보여줌)
    rows.sort(function (a, b) { return a.pct - b.pct; });

    var avgPct = rows.length ? (sumPct / rows.length) : 0;

    var out = [model.name + "의 내실 (" + avgPct.toFixed(0) + "%)", ""];
    for (var j = 0; j < rows.length; j++) {
        var r = rows[j];
        // 값(value)을 오른쪽 끝에 맞춰서 모든 줄의 끝이 같은 위치에서 끝나도록 함
        var pad = " ".repeat(maxLabelWidth - getDisplayWidth(r.label) + 2 + maxValueWidth - getDisplayWidth(r.value));
        out.push(r.label + pad + r.value);
    }
    return out.join("\n");
}

// ==========================================
// 직업 시너지 처리 함수 (데이터: synergy.json)
// ==========================================
function getSynergyText(query) {
    var synergyData = (loadGameData("synergy.json") || {}).synergy;
    if (!synergyData || !synergyData.length) return null;

    var title = "◦ 직업 시너지";
    var results = [];
    var search = (query || "").trim();

    // 검색어가 있는 경우 카테고리에 해당 단어가 포함되어 있는지 확인
    if (search) {
        for (var i = 0; i < synergyData.length; i++) {
            if (synergyData[i].category.indexOf(search) !== -1) {
                results.push(synergyData[i]);
            }
        }
    }

    // 검색 결과가 없거나 검색어를 입력하지 않은 경우 전체 출력
    var targetList = (results.length > 0) ? results : synergyData;
    var out = [title];

    for (var j = 0; j < targetList.length; j++) {
        out.push("\n• " + targetList[j].category);
        out.push(targetList[j].content);
    }

    return out.join("\n").trim();
}

// 메시지 리스너
init();

bot.addListener(Event.START_COMPILE, init);
bot.addListener(Event.MESSAGE, function (msg) {
    var room = msg.room || "";
    var content = (msg.content || "").trim();

    // 방 필터
    if (!isAllowedRoom(room)) { return; }

    // 레이드 보상: ".ㅋㄱ" 또는 "ㅋㄱ"
    // 사용:
    //   .ㅋㄱ                 -> 레이드 목록/사용법
    //   .ㅋㄱ 종막            -> 종막의 모든 난이도 출력
    //   .ㅋㄱ 종막 노말       -> 종막 노말만 출력
    var mRR = content.match(/^(?:\.?ㅋㄱ|\.클골)(?:\s+(.+))?$/);
    if (mRR) {
        var arg = (mRR[1] || "").trim();
        logCommand(msg, "레이드 보상 조회", arg);

        var db = loadRaidRewards();
        if (!db) {
            msg.reply("레이드 보상 파일을 찾지 못했어요.\n경로: " + DATA_DIR + "raid_rewards.json");
            return;
        }

        // 난이도 및 단계 감지 로직
        var diff = null;
        if (arg.indexOf("노말") !== -1) diff = "노말";
        else if (arg.indexOf("하드") !== -1) diff = "하드";
        else if (arg.indexOf("나이트메어") !== -1) diff = "나이트메어";
        else if (arg.indexOf("1단계") !== -1) diff = "1단계";
        else if (arg.indexOf("2단계") !== -1) diff = "2단계";
        else if (arg.indexOf("3단계") !== -1) diff = "3단계";

        var raidQuery = arg;
        if (diff) raidQuery = arg.replace(diff, "").trim();
        // ------------------------------------------

        var cands = findRaidCandidates(db, raidQuery);
        if (!cands.length) {
            // 레이드명 매칭 실패 + 난이도 키워드도 없으면 캐릭터명으로 간주 → 캐릭터 주급 조회
            if (!diff && arg) {
                try {
                    var lvStr = fetchProfileItemLevel(arg);
                    if (lvStr == null) {
                        msg.reply("'" + arg + "' 레이드/캐릭터를 찾지 못했어요.");
                        return;
                    }
                    var charTier = findWeeklyGoldTier(lvStr);
                    if (!charTier) {
                        msg.reply(arg + " (" + lvStr + ")\n주급 대상(1710 이상)이 아니에요.");
                        return;
                    }
                    msg.reply(renderCharWeeklyGold(arg, lvStr, charTier, db.patchDate));
                } catch (eChar) {
                    handleApiError(msg, eChar, "캐릭터 주급 조회", arg);
                }
                return;
            }
            msg.reply("해당 레이드를 찾지 못했어요: " + raidQuery);
            return;
        }
        if (cands.length > 1) {
            msg.reply("레이드명이 여러 개 매칭돼요:\n- " + cands.join("\n- "));
            return;
        }

        var raidName = cands[0];
        var raidObj = (db.raids || {})[raidName] || {};
        var diffMap = raidObj.difficulties || {};
        var diffs = Object.keys(diffMap);
        var patchLine = db.patchDate ? "(" + formatPatchDate(db.patchDate) + " 기준)\n" : "";

        if (!diff) {
            diffs.sort();
            var blocks = [];
            for (var i = 0; i < diffs.length; i++) {
                var d = diffs[i];
                blocks.push(renderRaidBlock(raidName, d, diffMap[d], raidObj.boundAll));
                if (i < diffs.length - 1) blocks.push("━━━━━━━━━━━━━━");
            }
            msg.reply(patchLine + blocks.join("\n"));
            return;
        }

        if (!diffMap[diff]) {
            msg.reply(raidName + "에 '" + diff + "' 난이도 데이터가 없어요.\n가능: " + diffs.sort().join(", "));
            return;
        }

        msg.reply(patchLine + renderRaidBlock(raidName, diff, diffMap[diff], raidObj.boundAll));
        return;
    }

    // 전투력
    var mCP = content.match(/^(?:\.?ㅈㅌㄹ|\.전투력)\s+(\S+)$/);
    if (mCP) {
        var charCP = mCP[1];
        logCommand(msg, "전투력 조회", charCP);

        try {
            var r1 = fetchCombatPower(charCP);

            if (r1.ok) {
                msg.reply(r1.name + "의\n\n⚔전투력: " + r1.combatPower);
            } else {
                handleApiError(msg, r1.reason, "전투력 조회", charCP);
            }
        } catch (e) {
            handleApiError(msg, e, "전투력 조회", charCP);
        }
        return;
    }

    // 낙원력
    var mPP = content.match(/^(?:\.낙원력|\.?ㄴㅇㄹ)\s+(\S+)$/);
    if (mPP) {
        var charPP = mPP[1];
        logCommand(msg, "낙원력 조회", charPP);

        try {
            var r2 = fetchParadisePower(charPP);
            if (r2.ok) {
                msg.reply(r2.name + "의\n\n⭐낙원력: " + formatManKorean(r2.paradisePower) + "\n※ 시즌1 보주를 착용하고 있을 경우 시즌1로 표시됩니다.");
            } else {
                handleApiError(msg, r2.reason, "낙원력 조회", charPP);
            }
        } catch (e) {
            handleApiError(msg, e, "낙원력 조회", charPP);
        }
        return;
    }

    // 아크그리드
    var mAG = content.match(/^(?:\.?ㄱㄹㄷ|\.아크그리드)\s+(\S+)$/);
    if (mAG) {
        var charAG = mAG[1];

        // [로깅]
        logCommand(msg, "아크그리드 조회", charAG);

        try {
            var cls = fetchProfileClassName(charAG);

            var r3 = fetchArkGrid(charAG);

            if (r3 && r3.ok) {
                // [성공]
                if (cls) r3.ClassName = cls; // 헤더 정보 보강
                var out = renderArkGridView(r3);
                msg.reply(out);
            } else {
                var reason = (r3 && r3.reason) ? r3.reason : "UNKNOWN";
                handleApiError(msg, reason, "아크그리드 조회", charAG);
            }
        } catch (e) {
            // [시스템 에러]
            handleApiError(msg, e, "아크그리드 조회", charAG);
        }
        return;
    }

    // 보석
    var mGEM = content.match(/^(?:\.보석|\.ㅂㅅ)\s+(\S+)$/);
    if (mGEM) {
        var charGem = mGEM[1];

        if (/^\d+[겁작]?$/.test(charGem)) {
            return;
        }

        logCommand(msg, "보석 조회", charGem);

        try {
            var cls2 = fetchProfileClassName(charGem);

            var rG = fetchGems(charGem);

            if (rG && rG.ok) {
                // [성공]
                if (cls2) rG.ClassName = cls2;
                msg.reply(renderGemsView(rG));
            } else {
                var reason = (rG && rG.reason) ? rG.reason : "UNKNOWN";
                handleApiError(msg, reason, "보석 조회", charGem);
            }
        } catch (e) {
            handleApiError(msg, e, "보석 조회", charGem);
        }
        return;
    }

    // 원정대 보석 현황
    var mRGEM = content.match(/^(?:\.보석현황|\.?ㅂㅅㅎㅎ)\s+(\S+)$/);
    if (mRGEM) {
        var charRGem = mRGEM[1];
        logCommand(msg, "원정대 보석 조회", charRGem);

        try {
            var rRG = fetchRosterGems(charRGem);

            if (rRG && rRG.ok) {
                msg.reply(renderRosterGemsView(rRG));
            } else {
                var reasonRG = (rRG && rRG.reason) ? rRG.reason : "UNKNOWN";
                if (reasonRG === "NO_GEMS") {
                    msg.reply(charRGem + "님의 원정대에 보석을 착용한 캐릭터가 없어요.");
                } else {
                    handleApiError(msg, reasonRG, "원정대 보석 조회", charRGem);
                }
            }
        } catch (e) {
            handleApiError(msg, e, "원정대 보석 조회", charRGem);
        }
        return;
    }

    // 팔찌
    var mBR = content.match(/^(?:\.팔찌|\.?ㅍㅉ)\s+(\S+)$/);
    if (mBR) {
        var charBR = mBR[1];

        logCommand(msg, "팔찌 조회", charBR);

        try {
            var rBR = fetchBracelet(charBR);

            if (rBR && rBR.ok) {
                // [성공]
                msg.reply(rBR.name + "의 팔찌\n\n" + rBR.content);
            } else {
                // [실패] 핸들러에게 위임
                var reason = (rBR && rBR.reason) ? rBR.reason : "UNKNOWN";
                handleApiError(msg, reason, "팔찌 조회", charBR);
            }
        } catch (e) {
            // [시스템 에러]
            handleApiError(msg, e, "팔찌 조회", charBR);
        }
        return;
    }

    // 지옥
    var hellMatch = content.match(/^(?:\.ㅈㅇ|\.지옥|ㅈㅇ)\s*(\d+)?/);

    if (hellMatch) {
        var rawCount = hellMatch[1];

        try {
            let count = parseInt(rawCount);

            // 숫자가 입력되지 않았을 경우 기본값 1회 설정
            if (isNaN(count)) {
                count = 1;
            }

            logCommand(msg, "지옥 시뮬레이션", count + "회");

            // 횟수 제한 로직
            if (count > 10) {
                msg.reply("지옥은 최대 10번까지만 갈 수 있어요! (10회로 실행합니다)");
                count = 10;
            } else if (count <= 0) {
                msg.reply("지옥에 가려면 1 이상의 숫자를 입력해주세요.");
                return;
            }

            let result = [];
            for (let i = 0; i < count; i++) {
                let direction = Math.random() < 0.5 ? "좌" : "우";
                result.push((i + 1) + ". " + direction);
            }
            msg.reply(result.join("\n"));

        } catch (e) {
            // [시스템 에러]
            handleApiError(msg, e, "지옥 시뮬레이션");
        }
    }

    // 원정대 부캐 조회 명령어
    const mAlt = content.match(/^(?:\.ㅂㅋ|\.부캐|ㅂㅋ)\s+(\S+)$/);

    if (mAlt) {
        const charAlt = mAlt[1];

        logCommand(msg, "원대 조회", charAlt);

        try {
            const rAlt = fetchSiblings(charAlt);

            if (rAlt && rAlt.ok) {
                msg.reply(rAlt.content);
            } else {
                const altReason = rAlt ? rAlt.reason : "UNKNOWN";
                if (altReason === "NOT_FOUND") {
                    msg.reply(`${charAlt} 캐릭터를 찾을 수 없어요. (닉네임을 확인해주세요)`);
                } else {
                    handleApiError(msg, altReason, "원대 조회", charAlt);
                }
            }
        } catch (e) {
            handleApiError(msg, e.message, "원대 조회", charAlt);
        }
        return;
    }


    // 패치노트
    var mPatch = content.match(/^(\.패치노트|\.?ㅍㅊㄴㅌ|\.?ㅍㅊ|\.패치)$/);
    if (mPatch) {
        logCommand(msg, "패치노트 조회", "");

        try {
            var result = fetchLatestPatchNote();
            if (result.ok) {
                var patch = result.data;
                var response = patch.Title + "\n\n" + patch.Link;
                msg.reply(response);
            } else {
                handleApiError(msg, result.reason, "패치노트 조회");
            }
        } catch (e) {
            handleApiError(msg, e, "패치노트 조회");
        }
        return;
    }

    // 쌀섬(골드 모험섬) 일정 조회
    var mRice = content.match(/^(\.쌀|\.모험섬|\.쌀섬)$/);
    if (mRice) {
        Log.i("[쌀섬] 명령어 인식 성공!");
        logCommand(msg, "쌀섬 조회", "");

        try {
            var result = fetchGoldIslands();
            if (!result.ok) {
                Log.e("[쌀섬] 데이터 가져오기 실패, 이유: " + result.reason);
                handleApiError(msg, result.reason, "쌀섬 일정 조회");
                return;
            }

            var schedule = result.data;
            var dates = Object.keys(schedule).sort();
            Log.i("[쌀섬] 날짜 목록 " + dates.length + "개 추출");

            var now = new Date();
            var utc = now.getTime() + (now.getTimezoneOffset() * 60000);
            var kst = new Date(utc + (9 * 3600000));
            var yyyy = kst.getFullYear();
            var mm = String(kst.getMonth() + 1).padStart(2, '0');
            var dd = String(kst.getDate()).padStart(2, '0');
            var todayStr = yyyy + "-" + mm + "-" + dd;

            Log.i("[쌀섬] 봇이 인식한 오늘 날짜(KST): " + todayStr);

            var todayIslands = "없음";
            if (schedule[todayStr]) {
                todayIslands = formatGoldIslands(schedule[todayStr]);
            }

            var out = "오늘의 쌀섬 : " + todayIslands + "\n";
            out += "━━━━━━━━━━━━━━\n";
            out += "앞으로 일주일간의 쌀섬\n\n";

            var printCount = 0;
            for (var i = 0; i < dates.length; i++) {
                var d = dates[i];
                if (d > todayStr) {                             // >= → > (오늘 중복 제거)
                    var islands = formatGoldIslands(schedule[d]);
                    var dateParts = d.split("-");
                    var displayDate = parseInt(dateParts[1], 10) + "월 " + parseInt(dateParts[2], 10) + "일";

                    out += displayDate + " : " + islands + "\n";
                    printCount++;
                }
                if (printCount >= 7) break;
            }

            if (printCount === 0) {
                out += "예정된 쌀섬 일정이 없습니다.";
            }

            Log.i("[쌀섬] 결과 텍스트 조합 완료, 메시지 전송 시도");
            msg.reply(out.trim());

        } catch (e) {
            Log.e("[쌀섬] 명령어 최종 처리 중 에러 발생: " + e + "\n" + e.stack);
            handleApiError(msg, e, "쌀섬 일정 조회");
        }
        return;
    }

    // 주급 조회
    var mGold = content.match(/^(?:\.주급|\.?ㅈㄱ)\s+(\S+)$/);
    if (mGold) {
        var charGold = mGold[1];
        logCommand(msg, "주급 조회", charGold);

        try {
            var rGold = fetchWeeklyGold(charGold);

            if (rGold.ok) {
                msg.reply(rGold.content);
            } else {
                handleApiError(msg, rGold.reason, "주급 조회", charGold);
            }
        } catch (e) {
            handleApiError(msg, e, "주급 조회", charGold);
        }
        return;
    }

    // 악세서리 조회
    var mAcc = content.match(/^(?:\.?ㅇㅅ|\.악세)\s+(\S+)$/);
    if (mAcc) {
        var charAcc = mAcc[1];
        logCommand(msg, "악세 조회", charAcc);

        try {
            var rAcc = fetchAccessories(charAcc);

            if (rAcc && rAcc.ok) {
                // 성공
                msg.reply(rAcc.content);
            } else {
                // 실패
                var reason = (rAcc && rAcc.reason) ? rAcc.reason : "UNKNOWN";
                if (reason === "NO_ACCESSORY") {
                    msg.reply("해당 캐릭터는 악세서리를 착용하고 있지 않거나 정보를 불러올 수 없습니다.");
                } else {
                    handleApiError(msg, reason, "악세 조회", charAcc);
                }
            }
        } catch (e) {
            // 시스템 에러
            handleApiError(msg, e, "악세 조회", charAcc);
        }
        return;
    }

    // 장비창 조회 (.장비)
    var mEquip = content.match(/^\.장비\s+(\S+)$/);
    if (mEquip) {
        var charEquip = mEquip[1];
        logCommand(msg, "장비 조회", charEquip);

        try {
            var rEquip = fetchEquipmentSummary(charEquip);

            if (rEquip && rEquip.ok) {
                rEquip.charLevel = fetchProfileItemLevel(charEquip);
                rEquip.className = fetchProfileClassName(charEquip);
                msg.reply(renderEquipmentView(rEquip));
            } else {
                var reasonEquip = (rEquip && rEquip.reason) ? rEquip.reason : "UNKNOWN";
                if (reasonEquip === "NO_EQUIP") {
                    msg.reply("해당 캐릭터는 장비 정보를 불러올 수 없습니다.");
                } else {
                    handleApiError(msg, reasonEquip, "장비 조회", charEquip);
                }
            }
        } catch (e) {
            handleApiError(msg, e, "장비 조회", charEquip);
        }
        return;
    }

    // 내실 조회 (.내실, .ㄴㅅ, ㄴㅅ)
    var mColl = content.match(/^(?:\.내실|\.?ㄴㅅ)\s+(\S+)$/);
    if (mColl) {
        var charColl = mColl[1];
        logCommand(msg, "내실 조회", charColl);

        try {
            var rColl = fetchCollectibles(charColl);

            if (rColl && rColl.ok) {
                msg.reply(renderCollectiblesView(rColl));
            } else {
                var reasonColl = (rColl && rColl.reason) ? rColl.reason : "UNKNOWN";
                if (reasonColl === "NO_DATA") {
                    msg.reply("해당 캐릭터는 내실 정보를 불러올 수 없습니다.");
                } else {
                    handleApiError(msg, reasonColl, "내실 조회", charColl);
                }
            }
        } catch (e) {
            handleApiError(msg, e, "내실 조회", charColl);
        }
        return;
    }

    // 시너지 조회
    // .시너지, .ㅅㄴㅈ, ㅅㄴㅈ 와 매칭되며 뒤에 검색어가 올 수 있음
    var mSynergy = content.match(/^(?:\.시너지|\.?ㅅㄴㅈ)(?:\s+(.+))?$/);
    if (mSynergy) {
        var synergyQuery = mSynergy[1] || "";
        logCommand(msg, "시너지 조회", synergyQuery);

        try {
            var synergyResult = getSynergyText(synergyQuery);
            if (synergyResult) {
                msg.reply(synergyResult);
            } else {
                msg.reply("시너지 데이터 파일을 찾지 못했어요.\n경로: " + DATA_DIR + "synergy.json");
            }
        } catch (e) {
            handleApiError(msg, e, "시너지 조회");
        }
        return;
    }

    const matchAuction = content.match(/^(?:\.ㄱㅁ|\.경매|ㄱㅁ|\.ㅂㅂㄱ|ㅂㅂㄱ)\s+([0-9,]+)$/);
    if (matchAuction) {
        // 숫자 콤마(,) 제거 후 정수 변환
        logCommand(msg, "경매 분배금 계산", matchAuction[1]);

        const price = parseInt(matchAuction[1].replace(/,/g, ''), 10);

        if (price > 0) {
            const realValue = price * 0.95;

            const rec4 = Math.ceil(Math.floor(realValue * 3 / 4) / 1.1);
            const rec8 = Math.ceil(Math.floor(realValue * 7 / 8) / 1.1);

            const replyMsg = "경매 입찰 추천가\n" +
                rec4.toLocaleString() + " 골(4인)\n" +
                rec8.toLocaleString() + " 골(8인)";

            msg.reply(replyMsg);
        } else {
            msg.reply("올바른 금액을 입력해주세요. (예: .경매 10000)");
        }
        return;
    }

    // 가토 로테이션 조회
    const matchGato = content.match(/^(?:\.가토|\.ㄱㅌ|ㄱㅌ)$/);
    if (matchGato) {
        logCommand(msg, "가토 로테이션 조회", "");

        // 로테이션 순서/기준일은 guardian_rotation.json에서 로드
        // (anchorDate 주차의 가디언 = rotation[anchorIndex])
        const rotationData = loadGameData("guardian_rotation.json");
        if (!rotationData || !rotationData.rotation || !rotationData.rotation.length) {
            msg.reply("가토 로테이션 데이터 파일을 찾지 못했어요.\n경로: " + DATA_DIR + "guardian_rotation.json");
            return;
        }
        const guardianRotation = rotationData.rotation;
        const rotationLen = guardianRotation.length;

        const anchorDate = new Date(rotationData.anchorDate).getTime();
        const now = new Date().getTime();

        // 기준일로부터 경과한 주(Week) 수 계산
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const diffWeeks = Math.floor((now - anchorDate) / msPerWeek);

        // 현재 주차의 가디언 인덱스
        const currentIndex = (((rotationData.anchorIndex + diffWeeks) % rotationLen) + rotationLen) % rotationLen;
        const targetGuardian = guardianRotation[currentIndex];

        // 다음 주차의 가디언 인덱스 계산 (현재 인덱스 + 1)
        const nextIndex = (currentIndex + 1) % rotationLen;
        const nextGuardian = guardianRotation[nextIndex];

        // 출력 형식 업데이트
        const resultMsg = "이번주\n⚔️" + targetGuardian +
            "\n\n다음주\n⏳" + nextGuardian;

        msg.reply(resultMsg);
        return;
    }

    // 칭호 조회 (.칭호, .ㅊㅎ, ㅊㅎ)
    var mTitle = content.match(/^(?:\.칭호|\.?ㅊㅎ)\s+(\S+)$/);
    if (mTitle) {
        var charTitleName = mTitle[1];
        logCommand(msg, "칭호 조회", charTitleName);

        try {
            var rTitle = fetchTitle(charTitleName);
            if (rTitle.ok) {
                if (rTitle.title) {
                    msg.reply(rTitle.name + "의 칭호\n\n" + rTitle.title);
                } else {
                    msg.reply(rTitle.name + "은(는) 칭호를 장착하고 있지 않아요.");
                }
            } else {
                handleApiError(msg, rTitle.reason, "칭호 조회", charTitleName);
            }
        } catch (e) {
            handleApiError(msg, e, "칭호 조회", charTitleName);
        }
        return;
    }

    // 통합 정보 조회 (.ㅈㅂ, ㅈㅂ, .정보)
    var mInfo = content.match(/^(?:\.?ㅈㅂ|\.정보|ㅈㅂ)\s+(\S+)$/);
    if (mInfo) {
        var charInfo = mInfo[1];
        logCommand(msg, "통합 정보 조회", charInfo);

        try {
            var rInfo = fetchIntegratedInfo(charInfo);
            if (rInfo.ok) {
                msg.reply(rInfo.content);

                // 정보 조회 성공 시 장비 정보도 이어서 출력
                try {
                    var rEquipAfterInfo = fetchEquipmentSummary(charInfo);
                    if (rEquipAfterInfo && rEquipAfterInfo.ok) {
                        rEquipAfterInfo.charLevel = rInfo.itemLevel;
                        rEquipAfterInfo.className = rInfo.className;
                        msg.reply(renderEquipmentView(rEquipAfterInfo));
                    }
                } catch (e2) {
                    Log.e("[LOA] 통합 정보 조회 - 장비 부가 조회 실패: " + e2);
                }
            } else {
                handleApiError(msg, rInfo.reason, "통합 정보 조회", charInfo);
            }
        } catch (e) {
            handleApiError(msg, e, "통합 정보 조회", charInfo);
        }
        return;
    }
});


