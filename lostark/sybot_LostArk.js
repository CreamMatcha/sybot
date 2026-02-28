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
    showConditions: false,   // 코어 "발동 조건"도 같이 보여줄지
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

// API 키
var LOSTARK_API_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6IktYMk40TkRDSTJ5NTA5NWpjTWk5TllqY2lyZyIsImtpZCI6IktYMk40TkRDSTJ5NTA5NWpjTWk5TllqY2lyZyJ9.eyJpc3MiOiJodHRwczovL2x1ZHkuZ2FtZS5vbnN0b3ZlLmNvbSIsImF1ZCI6Imh0dHBzOi8vbHVkeS5nYW1lLm9uc3RvdmUuY29tL3Jlc291cmNlcyIsImNsaWVudF9pZCI6IjEwMDAwMDAwMDAyNTQ2NjAifQ.E9LoI03kRumrluMGtS5G1XlIH0sRY7-xRWaa6G_-t_X5mhoeJqEsyz-aknmSFf8BbVX00S8Gl7TibmaQCwY5nbMARPLwfhJJ_kN3u1euaf0PWnr4hI-WnsSqt0fDfv5OWcXDaAaY21-lJwSSst9JhQbQlnvBB4dH9le0tl4ZSn_DWsvrHk972MSPJYZuHt3oggsnaD2_X8fDEjHpv3UDV1im7DWmCKUlSk-60I9al4OKxxOvaJCtAcz5rAOrEDj1XyrxaLwfvFF5jBVZiZygot6VjnuFdfyP0fmz2lKmzloXWekquDjL4mWLnubkSm5JkZvQbdS1vm2mVPu6_bFULA"; // 예) "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
var LOSTARK_BASE = "https://developer-lostark.game.onstove.com";

// 전역 토글
var LOA_DEBUG = true;

// 파일 경로
const RAID_REWARD_FILE = "sdcard/Sybot/raid_rewards.json";
let _raidRewardCache = null;

// 로깅 헬퍼 함수: [방이름/보낸사람] 명령어: 인자 형태
function logCommand(msg, cmdType, arg) {
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

    var res = httpGetUtf8(url, { "authorization": "bearer " + LOSTARK_API_KEY });
    var dt = java.lang.System.currentTimeMillis() - t0;

    if (!res.ok) {
        Log.e("[LOA] HTTP FAIL code=" + res.code + " ms=" + dt + " url=" + url);
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
        else if (json["CombatPower"] != null) cp = json["CombatPower"];
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
    var res = httpGetUtf8(url, { "authorization": "bearer " + LOSTARK_API_KEY });
    var dt = java.lang.System.currentTimeMillis() - t0;

    if (!res.ok) {
        Log.e("[LOA] PP HTTP FAIL code=" + res.code + " ms=" + dt + " url=" + url);
        if (res.code === 404) return { ok: false, reason: "NOT_FOUND" };
        return { ok: false, reason: "HTTP_" + res.code };
    }

    var body = res.text || "";
    if (LOA_DEBUG) Log.i("[LOA] PP HTTP OK code=" + res.code + " ms=" + dt + " bytes=" + body.length);

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
        if (LOA_DEBUG) Log.w("[LOA] PP NO_VALUE rawTooltip.head120=" + String(orb.Tooltip).slice(0, 120));
        return { ok: false, reason: "NO_VALUE" };
    }

    // 포맷 전 로깅
    if (LOA_DEBUG) {
        var head = String(pp).slice(0, 20);
        var codes = [];
        for (var j = 0; j < head.length; j++) codes.push(head.charCodeAt(j));
        Log.i("[LOA] PP BEFORE_FMT raw='" + head + "' codes=" + codes.join(","));
    }

    // "만" 표기는 출력 시점에 적용하므로 여기선 원본 숫자 문자열로 반환
    if (LOA_DEBUG) Log.i("[LOA] PP RAW '" + pp + "'");

    return { ok: true, name: charName, paradisePower: pp };

}

// 팔찌 정보 추출 함수
function fetchBracelet(charNameRaw) {
    var charName = String(charNameRaw);
    var url = LOSTARK_BASE + "/armories/characters/" + charName + "/equipment";

    var res = httpGetUtf8(url, { "authorization": "bearer " + LOSTARK_API_KEY });
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
        // (선택) 발동 조건
        if (ARK_OPTS.showConditions) {
            var condHtml = getCoreConditionBlock(s.Tooltip);
            var condPlain = tooltipToPlainText(condHtml);
            condPlain.split("\n").map(function (l) { return l.trim(); }).filter(Boolean)
                .forEach(function (l) { out.push("[조건] " + l); });
        }
    }
    return out.join("\n");
}


// Tooltip 본문에서 [활성] 라인들만 뽑기 (최대 5줄)
function extractActivationLinesFromTooltip(tooltipStr) {
    const blockHtml = getCoreOptionsBlock(tooltipStr);
    const plain = tooltipToPlainText(blockHtml);
    // 줄 단위로 나눔 (빈 줄 제외)
    const lines = plain.split("\n").map(l => l.trim()).filter(Boolean);
    // 각 줄 앞에 [활성] 붙이기 (이미 "[10P]" 등 포함됨)
    return lines.map(l => `[활성] ${l}`);
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
        var m = plain.match(/([+\-]?\d+(?:\.\d+)?)\s*%/);
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
        var res = httpGetUtf8(url, { "authorization": "bearer " + LOSTARK_API_KEY });
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

// GET /armories/characters/{charName}/arkgrid
function fetchArkGrid(charNameRaw) {
    var charName = String(charNameRaw);
    var url = LOSTARK_BASE + "/armories/characters/" + charName + "/arkgrid";
    var t0 = java.lang.System.currentTimeMillis();
    Log.i("[LOA] ArkGrid START char=" + charName + " url=" + url);
    var res = httpGetUtf8(url, { "authorization": "bearer " + LOSTARK_API_KEY });
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

    var res = httpGetUtf8(url, { "authorization": "bearer " + LOSTARK_API_KEY });
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

function extractBasicAtkIncreaseFromOption(optionText) {
    var plain = stripHtml(String(optionText || ""));
    // 예: "기본 공격력 1.00% 증가"
    var m = plain.match(/기본\s*공격력\s*([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (!m) return 0;
    // float 파싱
    var v = parseFloat(m[1]);
    return isNaN(v) ? 0 : v;
}

// 직업명 3글자 이하 매핑
var CLASS_SHORT = {
    "디스트로이어": "디트",
    "워로드": "워붕",
    "버서커": "버섯",
    "홀리나이트": "홀나",
    "슬레이어": "슬레",
    "발키리": "발키리",

    "배틀마스터": "배마",
    "인파이터": "인파",
    "기공사": "기공",
    "창술사": "창술",
    "스트라이커": "스커",
    "브레이커": "브커",

    "데빌헌터": "데헌",
    "블래스터": "블래",
    "호크아이": "홐홐",
    "스카우터": "스카",
    "건슬링어": "건슬",

    "바드": "바드",
    "서머너": "서머너",
    "아르카나": "알카",
    "소서리스": "소서",

    "데모닉": "데모닉",
    "블레이드": "블레",
    "리퍼": "리퍼",
    "소울이터": "소울",
    "도화가": "아가",
    "기상술사": "기상",
    "환수사": "환수사",
    "가디언나이트": "가나"
};

/**
 * CLASS_SHORT를 사용하여 직업명을 3글자 폭으로 변환 (GraalJS)
 */
const formatClassCompact = (className) => {
    // 1. 매핑 테이블에서 별명 가져오기 (없으면 원본 사용)
    let shortName = CLASS_SHORT[className] || className;

    // 2. 2글자인 경우 가운데 공백 추가 (바드 -> 바 드)
    if (shortName.length === 2) {
        return shortName[0] + "  " + shortName[1];
    }

    // 3. 3글자 이상인 경우 그대로 혹은 잘라서 반환
    return shortName.length > 3 ? shortName.substring(0, 3) : shortName;
};

// Skills[].Description/Option/Tooltip 등에서 판정에 쓸 텍스트를 합쳐서 반환
function collectGemEffectText(skillObj) {
    if (!skillObj) return "";
    var parts = [];

    if (skillObj.Description && skillObj.Description.length) {
        for (var i = 0; i < skillObj.Description.length; i++) parts.push(String(skillObj.Description[i]));
    }
    if (skillObj.Option) parts.push(String(skillObj.Option));
    if (skillObj.Tooltip) parts.push(String(skillObj.Tooltip));

    return stripHtml(parts.join(" "));
}

// 광휘를 작/겁으로 분류: "피해 n% 증가" => 겁, "재사용 대기시간 n% 감소" => 작
function classifyGlowAsJakOrGeop(skillObj) {
    if (!skillObj) return null;
    var descText = "";
    if (Array.isArray(skillObj.Description)) {
        descText = skillObj.Description.join(" ");
    } else if (skillObj.Description) {
        descText = String(skillObj.Description);
    }
    var t = (descText + " " + (skillObj.Option || "") + " " + (skillObj.Tooltip || "")).replace(/<[^>]*>/g, "");
    if (t.indexOf("피해") !== -1 && t.indexOf("증가") !== -1) return "겁";
    if (t.indexOf("재사용") !== -1 && t.indexOf("대기시간") !== -1 && t.indexOf("감소") !== -1) return "작";
    return null;
}

function renderGemsView(model) {
    // model: { name, ClassName, Gems:[], Effects:{} }
    var cls = formatClassCompact(model.ClassName || "미확인");

    // Effects.Skills를 GemSlot으로 맵핑
    var skillBySlot = {};
    var skills = (model.Effects && model.Effects.Skills) ? model.Effects.Skills : [];
    for (var i = 0; i < skills.length; i++) {
        var s = skills[i];
        if (s && s.GemSlot != null) skillBySlot[String(s.GemSlot)] = s;
    }

    var total = model.Gems.length;
    var cntJak = 0, cntGeop = 0;
    var sumLv = 0;

    // 기본 공격력 증가 합(Option들 합산)
    var sumBasicAtk = 0;
    for (var j = 0; j < skills.length; j++) {
        sumBasicAtk += extractBasicAtkIncreaseFromOption(skills[j] && skills[j].Option);
    }

    // 라인 구성용 배열
    var rows = [];

    for (var g = 0; g < model.Gems.length; g++) {
        var gem = model.Gems[g] || {};
        var slot = gem.Slot;
        var lv = (gem.Level != null) ? parseInt(gem.Level, 10) : 0;
        if (isNaN(lv)) lv = 0;
        sumLv += lv;

        var typeShort = getGemTypeShortFromName(gem.Name);

        // 스킬 매칭 먼저
        var sk = skillBySlot[String(slot)] || null;

        // 카운트 규칙:
        // - 작열/겁화는 그대로 카운트
        // - 광휘는 텍스트 판정으로 작/겁에 포함
        if (typeShort === "작") {
            cntJak++;
        } else if (typeShort === "겁") {
            cntGeop++;
        } else if (typeShort === "광") {
            var asType = classifyGlowAsJakOrGeop(sk);
            if (asType === "작") cntJak++;
            else if (asType === "겁") cntGeop++;
            // 판정 실패면 전체만 늘고 작/겁에는 미포함(그래도 라인은 7광으로 표기됨)
        }

        var skillName = sk && sk.Name ? String(sk.Name) : "알 수 없음";

        // 퍼센트는 Description(배열)에서 첫 % 추출
        var pct = null;
        if (sk && sk.Description && sk.Description.length) {
            pct = extractFirstPercentFromText(sk.Description[0]);
        } else if (sk && sk.Tooltip) {
            pct = extractFirstPercentFromText(sk.Tooltip);
        }
        if (!pct) pct = "";

        // 예: [바　드] 10겁 | 천상의 연주(44%)
        var line = "[" + cls + "] " + lv + typeShort + " | " + skillName + (pct ? ("(" + pct + ")") : "");
        rows.push({
            lv: lv,
            type: typeShort,
            line: line
        });
    }

    // 정렬: 레벨 내림차순 → 작/겁 순(예시처럼 9작이 9겁보다 먼저 오게)
    function typeOrder(t) { return (t === "작") ? 0 : (t === "겁" ? 1 : 9); }
    rows.sort(function (a, b) {
        if (b.lv !== a.lv) return b.lv - a.lv;
        var p = { "작": 1, "겁": 2, "광": 3, "?": 4 };
        var priorityA = p[a.type] || 9;
        var priorityB = p[b.type] || 9;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return 0;
    });

    var avgLv = total ? (sumLv / total) : 0;
    // 평균 레벨 1자리
    var avgLvText = (Math.round(avgLv * 10) / 10).toFixed(1);

    // 기본 공격력 증가: 2자리
    var basicAtkText = (Math.round(sumBasicAtk * 100) / 100).toFixed(2) + "%";

    var out = [];
    out.push("◦ " + model.name + " 의 보석 정보");
    out.push("작(" + cntJak + ") 겁(" + cntGeop + "), 평균 " + avgLvText + "lv");
    out.push("기본 공격력 증가:  " + basicAtkText);
    out.push("━━━━━━━━━━━━━━");
    for (var k = 0; k < rows.length; k++) out.push(rows[k].line);

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
 *  데이터 파일: sdcard/Sybot/raid_rewards.json
 *  스키마: { version:1, raids: { [레이드명]: { [난이도]: [ {gate,gold,moreGold,clear[],more[]} ] } } }
 * ─────────────────────────────────────────*****/


// UTF-8 읽기 (이모지/한글 안전)
function readTextUtf8(path) {
    try {
        var file = new java.io.File(path);
        if (!file.exists()) return null;
        var fis = new java.io.FileInputStream(file);
        var isr = new java.io.InputStreamReader(fis, "UTF-8");
        var br = new java.io.BufferedReader(isr);

        var sb = new java.lang.StringBuilder();
        var line;
        while ((line = br.readLine()) !== null) sb.append(line).append('\n');
        br.close(); isr.close(); fis.close();
        return String(sb.toString());
    } catch (e) {
        try { Log.e("[RAID] readTextUtf8 error: " + e); } catch (_) { }
        return null;
    }
}

function loadRaidRewards() {
    if (_raidRewardCache) return _raidRewardCache;

    var txt = readTextUtf8(RAID_REWARD_FILE);
    if (!txt) return null;

    try {
        var js = JSON.parse(String(txt));
        if (!js || !js.raids) return null;
        _raidRewardCache = js;
        return _raidRewardCache;
    } catch (e) {
        try { Log.e("[RAID] JSON parse error: " + e); } catch (_) { }
        return null;
    }
}

function _normKey(s) {
    return String(s || "").replace(/\s+/g, "").toLowerCase();
}

function formatGold(x) {
    // sybot_LostArk.js에 이미 formatThousandsSafe가 있으니 그걸 쓰는 게 베스트
    // 없으면 아래 한 줄로 대체 가능:
    // return String(Math.round(Number(x) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return formatThousandsSafe(Math.round(Number(x) || 0));
}

function mergeItems(dstMap, items) {
    if (!items || !items.length) return;
    for (var i = 0; i < items.length; i++) {
        var it = items[i] || {};
        var name = String(it.name || "").trim();
        var qty = Math.round(Number(it.qty) || 0);
        if (!name || qty === 0) continue;
        dstMap[name] = (dstMap[name] || 0) + qty;
    }
}

function itemsToText(items) {
    if (!items || !items.length) return "";
    return items.map(function (it) {
        return String(it.name) + " x " + Math.round(Number(it.qty) || 0);
    }).join(" + ");
}

function mapToText(mapObj) {
    var keys = Object.keys(mapObj || {});
    if (!keys.length) return "";
    // 보기 좋게 이름순
    keys.sort();
    return keys.map(function (k) { return k + " x " + mapObj[k]; }).join(" + ");
}

function renderRaidBlock(raidName, diffName, gateList) {
    var lines = [];
    lines.push("◦ " + raidName + " " + diffName);

    var sumGold = 0;
    var sumMoreGold = 0;
    var sumClear = {};
    var sumMore = {};

    for (var i = 0; i < gateList.length; i++) {
        var g = gateList[i] || {};
        var gate = Math.round(Number(g.gate) || (i + 1));
        var gold = Math.round(Number(g.gold) || 0);
        var moreGold = Math.round(Number(g.moreGold) || 0);

        sumGold += gold;
        sumMoreGold += moreGold;

        mergeItems(sumClear, g.clear);
        mergeItems(sumMore, g.more);

        var clearText = itemsToText(g.clear);
        var line = gate + "관: " + formatGold(gold) + "G";
        if (moreGold > 0) line += "(-" + formatGold(moreGold) + "G)";
        if (clearText) line += " + " + clearText;

        lines.push(line);
    }
    var totalLine = "총합: " + formatGold(sumGold) + "G";
    if (sumMoreGold > 0) totalLine += "(-" + formatGold(sumMoreGold) + "G)";

    var clearTotalText = mapToText(sumClear);
    if (clearTotalText) totalLine += " + " + clearTotalText;

    var moreTotalText = mapToText(sumMore);
    if (moreTotalText) totalLine += " (+" + moreTotalText + ")";

    lines.push(totalLine);
    return lines.join("\n");
}

function findRaidCandidates(db, raidQuery) {
    var raids = (db && db.raids) ? db.raids : {};
    var q = _normKey(raidQuery);
    var names = Object.keys(raids);
    if (!q) return names; // 빈 검색이면 전체
    return names.filter(function (name) { return _normKey(name).indexOf(q) !== -1; });
}


/**
 * 캐릭터의 원정대(부캐) 목록을 가져와서 정렬하는 함수
 */
const fetchSiblings = (characterName) => {
    const cleanName = characterName.trim();
    const baseUrl = "https://developer-lostark.game.onstove.com";
    const apiUrl = `${baseUrl}/characters/${encodeURIComponent(cleanName)}/siblings`;

    try {
        const url = new java.net.URL(apiUrl);
        const conn = url.openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(5000);
        conn.setRequestProperty("authorization", "bearer " + LOSTARK_API_KEY);
        conn.setRequestProperty("accept", "application/json");

        const responseCode = conn.getResponseCode();
        if (responseCode !== 200) return { ok: false, reason: "API_ERROR", detail: `HTTP ${responseCode}` };

        const is = conn.getInputStream();
        const br = new java.io.BufferedReader(new java.io.InputStreamReader(is, "UTF-8"));
        let responseData = "";
        let line;
        while ((line = br.readLine()) !== null) responseData += line;
        br.close();

        if (!responseData || responseData === "null") return { ok: false, reason: "NOT_FOUND" };

        const data = JSON.parse(responseData);
        if (!Array.isArray(data)) return { ok: false, reason: "NOT_FOUND" };

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

            // [적용] 제공해주신 CLASS_SHORT 기반의 컴팩트 포맷
            const compactClass = formatClassCompact(char.CharacterClassName);
            content += `[${compactClass}] ${char.CharacterName} (${char.ItemAvgLevel})\n`;
        });

        return { ok: true, content: content.trim() };
    } catch (e) {
        return { ok: false, reason: "SYSTEM_ERROR", detail: e.message };
    }
};

/**
 * 로스트아크 최신 패치노트 조회 함수
 */
function fetchLatestPatchNote() {
    var url = LOSTARK_BASE + "/news/notices?searchText=" + encodeURIComponent("업데이트") + "&type=" + encodeURIComponent("공지");

    // httpGetUtf8 활용
    var res = httpGetUtf8(url, { "authorization": "bearer " + LOSTARK_API_KEY });

    if (!res.ok) {
        return { ok: false, reason: "HTTP_" + res.code };
    }

    try {
        var list = JSON.parse(res.text);
        if (Array.isArray(list) && list.length > 0) {
            // 맨 첫 번째 항목(가장 최신) 반환
            return { ok: true, data: list[0] };
        }
        return { ok: false, reason: "NO_DATA" };
    } catch (e) {
        return { ok: false, reason: "PARSE_ERROR" };
    }
}
/**
 * 로스트아크 캘린더 API에서 골드를 주는 모험 섬(쌀섬) 일정을 가져오는 함수
 */
function fetchGoldIslands() {
    Log.i("[쌀섬] fetchGoldIslands 함수 시작");
    var url = LOSTARK_BASE + "/gamecontents/calendar";

    var res = httpGetUtf8(url, { "authorization": "bearer " + LOSTARK_API_KEY });

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
                    var dateStr = String(targetTimes[s]).split("T")[0];

                    if (!goldIslandsByDate[dateStr]) {
                        goldIslandsByDate[dateStr] = {};
                    }
                    goldIslandsByDate[dateStr][islandName] = true;
                }
            }
        }

        return { ok: true, data: goldIslandsByDate };
    } catch (e) {
        Log.e("[쌀섬] 데이터 파싱/처리 중 에러: " + e);
        return { ok: false, reason: "PARSE_ERROR" };
    }
}

/**
 * 레벨에 따른 주급(1골드 단위) 계산
 */
function calculateGoldForLevel(levelStr) {
    // "1,750.00" 같은 문자열을 숫자로 변환
    var level = parseFloat(String(levelStr).replace(/,/g, ""));
    if (isNaN(level)) return 0;

    // 만 단위(14.8 등)를 실제 골드 수치(148000 등)로 변경
    if (level >= 1740) return 148000;
    if (level >= 1730) return 138000;
    if (level >= 1720) return 117000;
    if (level >= 1710) return 108000;
    if (level >= 1700) return 83000;
    if (level >= 1690) return 62000;
    if (level >= 1680) return 55500;
    return 0;
}

/**
 * 원정대 정보를 바탕으로 서버별 주급을 계산하는 함수
 */
function fetchWeeklyGold(charNameRaw) {
    var charName = String(charNameRaw).trim();
    var url = LOSTARK_BASE + "/characters/" + encodeURIComponent(charName) + "/siblings";

    var res = httpGetUtf8(url, { "authorization": "bearer " + LOSTARK_API_KEY });
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

    // 타이틀 텍스트 변경
    var out = "◦ " + charName + "의 주급\n";
    var hasAnyGold = false;

    // 각 서버별 주급 계산
    for (var s = 0; s < serverNames.length; s++) {
        var srvName = serverNames[s];
        var chars = servers[srvName];

        // 레벨 내림차순 정렬
        chars.sort(function (a, b) { return b.level - a.level; });

        var top6 = chars.slice(0, 6);
        var serverGold = 0;
        var details = [];

        for (var k = 0; k < top6.length; k++) {
            var c = top6[k];
            var g = calculateGoldForLevel(c.level);
            if (g > 0) {
                serverGold += g;
                var compactCls = formatClassCompact(c.cls);
                // 개별 캐릭터의 추가 골드량 표시 제거
                details.push("[" + compactCls + "] " + c.name + " (" + c.levelStr + ")");
            }
        }

        if (serverGold > 0) {
            hasAnyGold = true;
            // 캐릭터 목록 먼저 출력 -> 한 줄 띄우기 -> 서버별 총합 출력
            out += "\n" + details.join("\n") + "\n\n";
            out += "[" + srvName + "] 총 " + formatThousandsSafe(serverGold) + " 골드\n";
        }
    }

    if (!hasAnyGold) {
        out += "\n주급을 받을 수 있는 캐릭터(1680 이상)가 없습니다.";
    }

    return { ok: true, content: out.trim() };
}

// 메시지 리스너
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
        var arg = (mRR[1] || "").trim(); // 인잣값을 먼저 변수에 할당
        logCommand(msg, "레이드 보상 조회", arg); // charName 대신 arg를 사용하도록 수정

        var db = loadRaidRewards();
        if (!db) {
            msg.reply("레이드 보상 파일을 찾지 못했어요.\n경로: " + RAID_REWARD_FILE);
            return;
        }

        if (!arg) {
            var raidNames = Object.keys(db.raids || {}).sort();
            msg.reply(
                "사용법:\n" +
                ".ㅋㄱ 레이드명 [난이도]\n\n" +
                "예) .ㅋㄱ 종막\n" +
                "예) .ㅋㄱ 종막 노말\n\n" +
                "레이드 목록: " + raidNames.join(", ")
            );
            return;
        }

        // 난이도 감지
        var diff = null;
        if (arg.indexOf("노말") !== -1) diff = "노말";
        else if (arg.indexOf("하드") !== -1) diff = "하드";
        else if (arg.indexOf("나이트메어") !== -1) diff = "나이트메어";

        var raidQuery = arg;
        if (diff) raidQuery = arg.replace(diff, "").trim();

        var cands = findRaidCandidates(db, raidQuery);
        if (!cands.length) {
            msg.reply("해당 레이드를 찾지 못했어요: " + raidQuery);
            return;
        }
        if (cands.length > 1) {
            msg.reply("레이드명이 여러 개 매칭돼요:\n- " + cands.join("\n- "));
            return;
        }

        var raidName = cands[0];
        var raidObj = (db.raids || {})[raidName] || {};
        var diffs = Object.keys(raidObj);

        if (!diff) {
            // 난이도 미지정: 해당 레이드의 모든 난이도 출력
            diffs.sort();
            var blocks = [];
            for (var i = 0; i < diffs.length; i++) {
                var d = diffs[i];
                blocks.push(renderRaidBlock(raidName, d, raidObj[d] || []));
                if (i < diffs.length - 1) {
                    blocks.push("━━━━━━━━━━━━━━");
                }
            }
            msg.reply(blocks.join("\n"));
            return;
        }

        // 난이도 지정: 그 난이도만 출력
        if (!raidObj[diff]) {
            msg.reply(raidName + "에 '" + diff + "' 난이도 데이터가 없어요.\n가능: " + diffs.sort().join(", "));
            return;
        }

        msg.reply(renderRaidBlock(raidName, diff, raidObj[diff] || []));
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
        logCommand(msg, "낙원력 조회", charCP);

        try {
            var r2 = fetchParadisePower(charPP);
            if (r2.ok) {
                msg.reply(r2.name + "의\n\n⭐낙원력: " + formatManKorean(r2.paradisePower) + "\n※ 시즌1 보주를 착용하고 있을 경우 시즌1로 표시됩니다.");
            } else {
                handleApiError(msg, r2.reason, "낙원력 조회", charCP);
            }
        } catch (e) {
            handleApiError(msg, e, "낙원력 조회", charCP);
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
                count = 30;
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

        if (isAllowedRoom(room)) {
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
        }
        return;
    }

    // 패치노트
    var mPatch = content.match(/^(\.패치노트|\.?ㅍㅊㄴㅌ|.ㅍㅊ)$/);
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
    var mRice = content.match(/^(\.쌀|.모험섬)$/);
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
            Log.i("[쌀섬] 추출된 골드섬 날짜 목록: " + dates.join(", "));

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
                todayIslands = Object.keys(schedule[todayStr]).join(", ");
            }

            var out = "오늘의 쌀섬 : " + todayIslands + "\n";
            out += "━━━━━━━━━━━━━━\n";
            out += "앞으로 일주일간의 쌀섬\n\n";

            var printCount = 0;
            for (var i = 0; i < dates.length; i++) {
                var d = dates[i];
                if (d >= todayStr) {
                    var islands = Object.keys(schedule[d]).join(", ");
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

});


