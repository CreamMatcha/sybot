/************************************************************
 * Lopec (로펙) 조회 전용 스크립트
 *
 * 사용법:
 *   .ㄹㅍ 캐릭터명
 *   .로펙 캐릭터명
 *
 * 동작 방 제한:
 *   ALLOWED_ROOMS 에 방 이름을 넣으면 그 방에서만 작동
 ************************************************************/

var bot = BotManager.getCurrentBot();
bot.setCommandPrefix("."); // 다른 파일에서 이미 설정했으면 무시됨

try { Log.i("[LOPEC] script loaded"); } catch (e) { }

/***** [설정] 특정 방에서만 동작 *****/
var ALLOWED_ROOMS = [
    "아크라시아인의 휴식처"
];

/***** [설정] Lopec 스펙포인트/티어 서버 주소 *****/
var LOPEC_SERVER_BASE = "http://34.64.244.233:3100";

/***** 로깅 옵션 *****/
var LOPEC_DEBUG = true;
function dbg() { if (LOPEC_DEBUG) try { Log.i.apply(Log, ["[LOPEC]"].concat([].slice.call(arguments))); } catch (_) { } }

function httpGetUtf8(urlStr, headersObj) {
    try {
        var url = new java.net.URL(urlStr);
        var conn = url.openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(20000);

        conn.setRequestProperty("accept", "application/json");
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
        var br = new java.io.BufferedReader(isr);
        var sb = new java.lang.StringBuilder();
        var line;
        while ((line = br.readLine()) !== null) sb.append(line).append('\n');
        br.close(); isr.close();

        return { ok: isOK, code: code, text: String(sb.toString()) };
    } catch (e) {
        try { Log.e("[LOPEC] httpGetUtf8 ERROR: " + e); } catch (_) { }
        return { ok: false, code: -1, text: null, err: String(e) };
    }
}

// 숫자/숫자문자열을 "1,234,567" 형태로 변환 (음수/소수점 대응)
function formatThousandsSafe(x) {
    try {
        var s = String(x)
            .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, "")
            .replace(/,/g, "")
            .trim();

        if (s === "" || s === "-" || s === ".") return s || "0";

        var neg = false;
        if (s[0] === "-") { neg = true; s = s.slice(1); }

        s = s.replace(/[^0-9.]/g, "");
        var parts = s.split(".");
        var intPart = parts[0] || "0";
        var fracPart = parts.length > 1 ? parts.slice(1).join("") : "";

        intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

        var out = fracPart ? (intPart + "." + fracPart) : intPart;
        return neg ? "-" + out : out;
    } catch (e) {
        try { Log.e("[LOPEC] formatThousandsSafe error: " + e + " / x=" + x); } catch (_) { }
        return String(x);
    }
}

// Lopec 서버에서 스펙 포인트/티어 정보 가져오기
function fetchLopecInfo(charNameRaw) {
    var name = String(charNameRaw || "").trim();
    if (!name) return { ok: false, reason: "NO_NAME" };

    var url = LOPEC_SERVER_BASE + "/lopec?name=" + encodeURIComponent(name);
    var t0 = java.lang.System.currentTimeMillis();
    var res = httpGetUtf8(url, null);
    var dt = java.lang.System.currentTimeMillis() - t0;

    dbg("HTTP", "ok=" + res.ok, "code=" + res.code, "ms=" + dt, "url=" + url);

    if (!res.ok) return { ok: false, reason: "HTTP_" + res.code };

    var body = res.text || "";
    var js;
    try {
        js = JSON.parse(body);
    } catch (e) {
        try { Log.e("[LOPEC] JSON parse error: " + e); } catch (_) { }
        return { ok: false, reason: "PARSE_ERROR" };
    }

    if (!js || js.ok !== true) {
        return { ok: false, reason: (js && js.message) ? String(js.message) : "REMOTE_FAIL" };
    }

    return {
        ok: true,
        name: js.name || name,
        specPoint: js.specPoint || "",
        tierName: js.tierName || "",
        remaining: js.remaining || "",
        url: js.url || ""
    };
}

/***** 메시지 리스너 *****/
bot.addListener(Event.MESSAGE, function (msg) {
    var room = msg.room || "";
    var content = (msg.content || "").trim();

    if (!ALLOWED_ROOMS.includes(room)) return;
    // 로펙: ".ㄹㅍ 캐릭" / ".로펙 캐릭" / "ㄹㅍ 캐릭" / "로펙 캐릭"
    var mLP = content.match(/^(?:\.?ㄹㅍ|\.?로펙)\s+(\S+)$/);
    if (!mLP) return;

    var lpName = mLP[1];
    dbg("command name=" + lpName);

    var r = fetchLopecInfo(lpName);

    if (!r.ok) {
        if (r.reason && r.reason.indexOf("HTTP_") === 0) {
            msg.reply("로펙 서버 연결에 실패했어요. (" + r.reason + ")");
        } else if (r.reason === "REMOTE_FAIL") {
            msg.reply("로펙 페이지에서 스펙 포인트/티어를 찾지 못했어요. 페이지 구조가 바뀐 듯 합니다.");
        } else {
            msg.reply("로펙 정보 조회에 실패했어요. (" + (r.reason || "ERROR") + ")");
        }
        return;
    }

    var spec = r.specPoint ? formatThousandsSafe(r.specPoint) : "정보 없음";

    // 원본 스크립트처럼 remaining 있으면 같이 표기(원하면 제거 가능)
    var tierLine;
    if (r.tierName && r.remaining) tierLine = r.tierName + " (" + r.remaining + ")";
    else if (r.tierName) tierLine = r.tierName;
    else tierLine = "정보 없음";

    var link = r.url || "https://legacy.lopec.kr";

    var out =
        r.name + "님의 로펙 정보\n\n" +
        "스펙 포인트: " + spec + "\n" +
        "티어: " + tierLine + "\n\n" +
        link;

    msg.reply(out);
});
