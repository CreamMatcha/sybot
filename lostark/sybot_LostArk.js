/************************************************************
 * Lost Ark 캐릭터 정보 조회
************************************************************/
var bot = BotManager.getCurrentBot();
bot.setCommandPrefix("."); // 다른 파일에서 이미 설정했다면 중복 설정은 무시됨

try { Log.i("[LOA] script loaded"); } catch (e) { }
/***** [설정] 특정 방에서만 동작 *****/
var ALLOWED_ROOMS = [
    "아크라시아인의 휴식처"
];

// 출력 옵션
const ARK_OPTS = {
    showConditions: false,   // 코어 "발동 조건"도 같이 보여줄지
    log: true
};
function dbg() { if (ARK_OPTS.log) try { Log.i.apply(Log, ["[ARK]"].concat([].slice.call(arguments))); } catch (_) { } }

function isAllowedRoom(roomName) {
    try {
        if (!ALLOWED_ROOMS || ALLOWED_ROOMS.length === 0) return true; // 목록 비어있으면 전부 허용
        return ALLOWED_ROOMS.indexOf(String(roomName)) !== -1;
    } catch (_) { return true; } // 테스트 편의: 오류시에도 통과
}

// API 키
var LOSTARK_API_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6IktYMk40TkRDSTJ5NTA5NWpjTWk5TllqY2lyZyIsImtpZCI6IktYMk40TkRDSTJ5NTA5NWpjTWk5TllqY2lyZyJ9.eyJpc3MiOiJodHRwczovL2x1ZHkuZ2FtZS5vbnN0b3ZlLmNvbSIsImF1ZCI6Imh0dHBzOi8vbHVkeS5nYW1lLm9uc3RvdmUuY29tL3Jlc291cmNlcyIsImNsaWVudF9pZCI6IjEwMDAwMDAwMDAyNTQ2NjAifQ.E9LoI03kRumrluMGtS5G1XlIH0sRY7-xRWaa6G_-t_X5mhoeJqEsyz-aknmSFf8BbVX00S8Gl7TibmaQCwY5nbMARPLwfhJJ_kN3u1euaf0PWnr4hI-WnsSqt0fDfv5OWcXDaAaY21-lJwSSst9JhQbQlnvBB4dH9le0tl4ZSn_DWsvrHk972MSPJYZuHt3oggsnaD2_X8fDEjHpv3UDV1im7DWmCKUlSk-60I9al4OKxxOvaJCtAcz5rAOrEDj1XyrxaLwfvFF5jBVZiZygot6VjnuFdfyP0fmz2lKmzloXWekquDjL4mWLnubkSm5JkZvQbdS1vm2mVPu6_bFULA"; // 예) "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
var LOSTARK_BASE = "https://developer-lostark.game.onstove.com";

// 전역 토글
var LOA_DEBUG = true;

function httpGetUtf8(urlStr, headersObj) {
    try {
        var url = new java.net.URL(urlStr);
        var conn = url.openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        // 헤더 세팅
        conn.setRequestProperty("accept", "application/json");
        if (headersObj) {
            for (var k in headersObj) {
                if (Object.prototype.hasOwnProperty.call(headersObj, k)) {
                    conn.setRequestProperty(String(k), String(headersObj[k]));
                }
            }
        }
        // 응답 코드 확인
        var code = conn.getResponseCode();
        var isOK = (code >= 200 && code < 300);
        var stream = isOK ? conn.getInputStream() : conn.getErrorStream();
        if (stream == null) {
            Log.e("[LOA] null stream, code=" + code);
            return { ok: false, code: code, text: null };
        }
        var isr = new java.io.InputStreamReader(stream, "UTF-8");
        var br = new java.io.BufferedReader(isr);
        var sb = new java.lang.StringBuilder();
        var line;
        while ((line = br.readLine()) !== null) sb.append(line).append('\n');
        br.close(); isr.close();
        var txt = String(sb.toString());
        return { ok: isOK, code: code, text: txt };
    } catch (e) {
        Log.e("[LOA] httpGetUtf8 ERROR: " + e);
        return { ok: false, code: -1, text: null, err: String(e) };
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

    var t0 = java.lang.System.currentTimeMillis();
    var res = httpGetUtf8(url, { "authorization": "bearer " + LOSTARK_API_KEY });
    var dt = java.lang.System.currentTimeMillis() - t0;

    if (!res.ok) {
        Log.e("[LOA] BR HTTP FAIL code=" + res.code + " ms=" + dt + " url=" + url);
        if (res.code === 404) return { ok: false, reason: "NOT_FOUND" };
        return { ok: false, reason: "HTTP_" + res.code };
    }

    var body = res.text || "";
    var arr;
    try {
        arr = JSON.parse(body);
    } catch (e) {
        Log.e("[LOA] BR JSON parse error: " + e);
        return { ok: false, reason: "PARSE_ERROR" };
    }

    if (!arr || !arr.length) return { ok: false, reason: "NO_EQUIP" };

    // Type === "팔찌" 찾기
    var bracelet = null;
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].Type === "팔찌") { bracelet = arr[i]; break; }
    }
    if (!bracelet) return { ok: false, reason: "NO_BRACELET" };

    try {
        var tooltip = JSON.parse(bracelet.Tooltip);
        var effectText = "";

        // Tooltip 내에서 "팔찌 효과" 섹션 찾기
        for (var key in tooltip) {
            var element = tooltip[key];
            if (element && element.type === "ItemPartBox" &&
                element.value.Element_000 && element.value.Element_000.indexOf("팔찌 효과") !== -1) {
                effectText = element.value.Element_001;
                break;
            }
        }

        if (!effectText) return { ok: false, reason: "NO_EFFECT" };

        // 줄 단위 가공
        var rawLines = effectText.split(/<BR>/i);
        var parsedItems = [];
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
                    lastItem = { text: "[" + statMatch[1] + "] " + statMatch[2].replace(/,/g, "") };
                    parsedItems.push(lastItem);
                } else {
                    lastItem = { text: "• " + cleanText };
                    parsedItems.push(lastItem);
                }
            } else if (lastItem) {
                lastItem.text += " " + cleanText;
            }
        }

        var resultText = parsedItems.map(function (item) { return item.text; }).join("\n");
        return { ok: true, name: charName, braceletName: bracelet.Name, content: resultText };

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
    try { return JSON.parse(String(tooltipStr)); } catch { return null; }
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
function formatEffects(effects) {
    var lines = ["\n❙ 아크 그리드 젬 효과"];
    for (var i = 0; i < effects.length; i++) {
        var eff = effects[i];
        var plain = tooltipToPlainText(eff.Tooltip || "");
        var m = plain.match(/([+\-]?\d+(?:\.\d+)?)\s*%/);
        var pct = m ? ("+" + m[1] + "%") : plain.replace(eff.Name, "").trim();
        lines.push(eff.Name + " " + eff.Level + "Lv [" + pct + "]");
    }
    return lines.join("\n");
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

    if (!gems || !gems.length) return { ok: false, reason: "NO_GEMS" };

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

// 3글자 이하 + (원하면) 2글자는 보기 좋게 한 칸 벌림
function formatClassCompact(cls) {
    cls = String(cls || "미확인").trim();
    var short = CLASS_SHORT[cls] || cls;

    // 혹시 모르는 직업명은 3글자까지만 (안전장치)
    if (short.length > 3) short = short.slice(0, 3);

    // 출력 폭 맞추고 싶으면(선택): 2글자면 가운데 전각공백 넣어서 3칸처럼 보이게
    if (short.length === 2) return short[0] + "\u3000" + short[1];
    if (short.length === 1) return short + "\u3000\u3000";
    return short;
}

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
    var t = collectGemEffectText(skillObj);

    // 겁화 판정(피해 증가)
    if (t.indexOf("피해") !== -1 && t.indexOf("증가") !== -1) return "겁";

    // 작열 판정(쿨감)
    if (t.indexOf("재사용") !== -1 && t.indexOf("대기시간") !== -1 && t.indexOf("감소") !== -1) return "작";

    return null; // 판정 실패
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
        return typeOrder(a.type) - typeOrder(b.type);
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


// 최종 렌더
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

const RAID_REWARD_FILE = "sdcard/Sybot/raid_rewards.json";
let _raidRewardCache = null;

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
    lines.push("◦" + raidName + " " + diffName);

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


// ── 메시지 리스너: "ㅈㅌㄹ 캐릭명"
bot.addListener(Event.MESSAGE, function (msg) {
    var room = msg.room || "";
    var content = (msg.content || "").trim();

    // 방 필터
    if (!isAllowedRoom(room)) {
        Log.i('[LOA] ignore room="' + room + '" content="' + content + '"');
        return;
    }

    Log.i('[LOA] room="' + room + '" msg="' + content + '"');

    // 레이드 보상: ".ㅋㄱ" 또는 "ㅋㄱ"
    // 사용:
    //   .ㅋㄱ                 -> 레이드 목록/사용법
    //   .ㅋㄱ 종막            -> 종막의 모든 난이도 출력
    //   .ㅋㄱ 종막 노말       -> 종막 노말만 출력
    var mRR = content.match(/^(?:\.?ㅋㄱ)(?:\s+(.+))?$/);
    if (mRR) {
        var db = loadRaidRewards();
        if (!db) {
            msg.reply("레이드 보상 파일을 찾지 못했어요.\n경로: " + RAID_REWARD_FILE);
            return;
        }

        var arg = (mRR[1] || "").trim();
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
        Log.i("[LOA] command CP char=" + charCP);
        var r1 = fetchCombatPower(charCP);
        if (r1.ok) msg.reply(r1.name + "의\n\n⚔전투력: " + r1.combatPower);
        else if (r1.reason === "NOT_FOUND") msg.reply("'" + charCP + "' 캐릭터를 찾을 수 없어요.");
        else if (r1.reason === "HTTP_401" || r1.reason === "HTTP_403") msg.reply("인증 오류입니다. API 키를 확인해주세요.");
        else if (r1.reason === "NO_FIELD") msg.reply("몰루? 아마도 점검중?");
        else msg.reply("전투력 조회 실패 (" + (r1.reason || "ERROR") + ")");
        return;
    }

    // 낙원력
    var mPP = content.match(/^(?:\.낙원력|\.?ㄴㅇㄹ)\s+(\S+)$/);
    if (mPP) {
        var charPP = mPP[1];
        Log.i("[LOA] command PP char=" + charPP);

        var r2 = fetchParadisePower(charPP);
        if (r2.ok) {
            msg.reply(r2.name + "의\n\n⭐낙원력: " + formatManKorean(r2.paradisePower));
        } else if (r2.reason === "NOT_FOUND") {
            msg.reply("'" + charPP + "' 캐릭터를 찾을 수 없어요.");
        } else if (r2.reason === "HTTP_401" || r2.reason === "HTTP_403") {
            msg.reply("인증 오류입니다. API 키를 확인해주세요.");
        } else if (r2.reason === "NO_EQUIP") {
            msg.reply("몰루?");
        } else if (r2.reason === "NO_ORB") {
            msg.reply("보주 장비를 찾을 수 없어요.");
        } else if (r2.reason === "NO_TOOLTIP") {
            msg.reply("보주 Tooltip 정보가 없어요.");
        } else if (r2.reason === "NO_VALUE") {
            msg.reply("Tooltip에서 낙원력을 찾지 못했어요.");
        } else if (r2.reason === "PARSE_ERROR") {
            msg.reply("Tooltip 파싱 중 오류가 발생했어요.");
        } else {
            msg.reply("낙원력 조회 실패 (" + (r2.reason || "ERROR") + ")");
        }
        return;
    }

    // 아크그리드
    var mAG = content.match(/^(?:\.?ㄱㄹㄷ|\.아크그리드|\.?arkgrid)\s+(\S+)$/);
    if (mAG) {
        var cg = mAG[1];
        Log.i("[LOA] command ARKGRID char=" + cg);

        // 직업명 (옵션)
        var cls = fetchProfileClassName(cg);

        var r3 = fetchArkGrid(cg);
        if (!r3 || !r3.ok) {
            if (r3 && r3.reason === "NOT_FOUND") {
                msg.reply("'" + cg + "' 캐릭터를 찾을 수 없어요.");
            } else if (r3 && r3.reason && r3.reason.indexOf("HTTP_") === 0) {
                msg.reply("인증/네트워크 오류입니다. ( " + r3.reason + " )");
            } else if (r3 && r3.reason === "PARSE_ERROR") {
                msg.reply("아크 그리드 응답 파싱 중 오류가 발생했어요.");
            } else {
                msg.reply("아크 그리드 조회 실패 (" + ((r3 && r3.reason) || "ERROR") + ")");
            }
            return;
        }

        // 헤더 정보 보강
        if (cls) r3.ClassName = cls;

        // 요청한 포맷으로 렌더
        var out = renderArkGridView(r3);
        msg.reply(out);
        return;
    }

    // 보석
    var mGEM = content.match(/^(?:\.보석|\.ㅂㅅ)\s+(\S+)$/);
    if (mGEM) {
        var cg2 = mGEM[1];
        Log.i("[LOA] command GEMS char=" + cg2);

        var cls2 = fetchProfileClassName(cg2);
        var rG = fetchGems(cg2);

        if (!rG || !rG.ok) {
            if (rG && rG.reason === "NOT_FOUND") msg.reply("'" + cg2 + "' 캐릭터를 찾을 수 없어요.");
            else if (rG && rG.reason && rG.reason.indexOf("HTTP_") === 0) msg.reply("인증/네트워크 오류입니다. ( " + rG.reason + " )");
            else if (rG && rG.reason === "PARSE_ERROR") msg.reply("보석 응답 파싱 중 오류가 발생했어요.");
            else if (rG && rG.reason === "NO_GEMS") msg.reply("보석 정보가 없어요.");
            else msg.reply("보석 조회 실패 (" + ((rG && rG.reason) || "ERROR") + ")");
            return;
        }

        if (cls2) rG.ClassName = cls2;

        msg.reply(renderGemsView(rG));
        return;
    }

    // 팔찌
    var mBR = content.match(/^(?:\.팔찌|\.?ㅍㅉ)\s+(\S+)$/);
    if (mBR) {
        var charBR = mBR[1];
        Log.i("[LOA] command BR char=" + charBR);

        var rBR = fetchBracelet(charBR);
        if (rBR.ok) {
            msg.reply(rBR.name + "의 팔찌\n\n" + rBR.content);
        } else if (rBR.reason === "NOT_FOUND") {
            msg.reply("'" + charBR + "' 캐릭터를 찾을 수 없어요.");
        } else if (rBR.reason === "NO_BRACELET") {
            msg.reply("장착 중인 팔찌가 없거나 정보를 가져올 수 없어요.");
        } else if (rBR.reason === "NO_EFFECT") {
            msg.reply("팔찌 효과 정보를 찾을 수 없어요.");
        } else {
            msg.reply("팔찌 조회 실패 (" + (rBR.reason || "ERROR") + ")");
        }
        return;
    }
});


