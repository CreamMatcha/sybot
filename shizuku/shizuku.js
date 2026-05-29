/**
 * @description Shizuku ADB 연동 시스템 관리 봇
 * @version 2.0.0
 * @environment v0.7.41-alpha (GraalJS)
 * @license CC BY-NC-SA 4.0
 *
 * [ 보안 모델 ]
 *  - 1차 방어: 관리자 해시 화이트리스트 (shizuku_config.json 의 adminHashes)
 *  - 2차 방어: 위험 명령어 패턴 블랙리스트 (DANGER_PATTERNS)
 *  - 3차 방어: 작은따옴표 이스케이프 (POSIX ' → '\'' )
 *  ※ 이 스크립트는 신뢰된 관리자 전용 도구입니다.
 *    adminHashes 를 반드시 설정하세요. (msg.author.hash 기준)
 *    본인 해시를 모를 땐 채팅창에 !내해시 를 입력하세요.
 */

const bot = BotManager.getCurrentBot();
bot.removeAllListeners(Event.MESSAGE);

// ══════════════════════════════════════════════════════════════
//  경로 상수
// ══════════════════════════════════════════════════════════════
const SDCARD_DIR  = "/sdcard/msgbot/shizuku";
const CONFIG_PATH = SDCARD_DIR + "/shizuku_config.json";
const LOG_PATH    = SDCARD_DIR + "/adb_log.txt";

const INTERNAL_DIR = (function () {
    try { return App.getContext().getFilesDir().getAbsolutePath() + "/bin"; }
    catch (_) { return "/data/user/0/com.xfl.msgbot/files/bin"; }
})();

// ══════════════════════════════════════════════════════════════
//  설정 로드 (shizuku_config.json)
// ══════════════════════════════════════════════════════════════

/** config 기본값 — json 에 없는 키를 채워줌 */
function defaultConfig() {
    return {
        adminHashes  : [],     // [{ hash, label }] — 빈 배열이면 전체 허용
        updateTargets: [],     // [{ hash, label, ip }]
        defaultPort  : "8080"
    };
}

function loadConfig() {
    try {
        const f = new java.io.File(CONFIG_PATH);
        if (!f.exists()) return defaultConfig();

        const br = new java.io.BufferedReader(new java.io.FileReader(f));
        const sb = new java.lang.StringBuilder();
        let line;
        while ((line = br.readLine()) !== null) sb.append(line);
        br.close();

        return Object.assign(defaultConfig(), JSON.parse(sb.toString()));
    } catch (_) {
        return defaultConfig();
    }
}

let CONFIG = loadConfig();

// ══════════════════════════════════════════════════════════════
//  위험 명령어 블랙리스트
// ══════════════════════════════════════════════════════════════
const DANGER_PATTERNS = [
    /\brm\b.*-[a-z]*r[a-z]*f[a-z]*\s+\/\s*$/i,        // rm -rf /
    /\brm\b.*-[a-z]*f[a-z]*r[a-z]*\s+\/\s*$/i,        // rm -fr /
    /\bmkfs\b/,                                         // 파일시스템 포맷
    /\bdd\b.+if=.+of=/,                                 // 디스크 덮어쓰기
    />\s*\/dev\/(block|sda|sdb|mmcblk|nvme)/,          // 블록 디바이스 직접 쓰기
    /\bformat\s+data\b/i,                               // recovery factory reset
    /\bwipe\s+(cache|data|system)\b/i,                  // recovery wipe
];

// ══════════════════════════════════════════════════════════════
//  공통 유틸
// ══════════════════════════════════════════════════════════════
const MAX_OUT_LEN   = 1500;   // 카카오톡 전송 안전 길이
const CMD_TIMEOUT_S = 10;     // 명령어 타임아웃(초)

/** 관리자 여부 — adminHashes 비어있으면 전체 허용 */
function isAdmin(msg) {
    if (!CONFIG.adminHashes || CONFIG.adminHashes.length === 0) return true;
    const hash = String(msg.author.hash || "");
    if (!hash) return false;
    return CONFIG.adminHashes.some(function (a) {
        // 문자열 형태("abc...")와 객체 형태({hash, label}) 모두 지원
        return (typeof a === "string") ? (a === hash) : (a && a.hash === hash);
    });
}

/** 업데이트 대상 IP 조회 — 발신자 해시 → IP */
function findUpdateIp(hash) {
    if (!CONFIG.updateTargets || !hash) return null;
    // 배열 형태: [{ hash, ip, label }]
    if (Array.isArray(CONFIG.updateTargets)) {
        const hit = CONFIG.updateTargets.find(function (t) { return t && t.hash === hash; });
        return hit ? hit.ip : null;
    }
    // 객체 형태: { "hash": "ip" }
    return CONFIG.updateTargets[hash] || null;
}

/** 위험 명령어 패턴 검사 */
function isDangerous(cmd) {
    return DANGER_PATTERNS.some(function (p) { return p.test(cmd); });
}

/** 출력 길이 제한 — 초과 시 생략 표시 */
function trimOutput(text) {
    if (!text) return "(출력 없음)";
    if (text.length <= MAX_OUT_LEN) return text;

    var lines = text.split("\n");
    var result = "", count = 0;
    for (var i = 0; i < lines.length; i++) {
        if ((result + lines[i]).length > MAX_OUT_LEN) break;
        result += lines[i] + "\n";
        count++;
    }
    var skipped = lines.length - count;
    return result.trimEnd() + "\n…(" + skipped + "줄 생략, 전체 " + lines.length + "줄)";
}

/** ADB 명령어 실행 로그 기록 */
function logCommand(author, cmd, exitCode) {
    try {
        var now   = new Date().toLocaleString("ko-KR");
        var entry = "[" + now + "] [" + author + "] [exit:" + exitCode + "] " + cmd + "\n";
        var fw    = new java.io.FileWriter(LOG_PATH, true);
        fw.write(entry);
        fw.close();
    } catch (_) { /* 로그 실패는 무시 */ }
}

// ══════════════════════════════════════════════════════════════
//  rish 파일 준비 (최초 1회만 내부 디렉터리로 복사)
// ══════════════════════════════════════════════════════════════
function ensureRish() {
    var rishFile = new java.io.File(INTERNAL_DIR, "rish");
    if (!rishFile.exists()) {
        java.lang.Runtime.getRuntime().exec(Java.to([
            "sh", "-c",
            "mkdir -p " + INTERNAL_DIR +
            " && cp " + SDCARD_DIR + "/rish* " + INTERNAL_DIR + "/" +
            " && chmod 755 " + INTERNAL_DIR + "/rish"
        ], "java.lang.String[]")).waitFor();
    }
}

// ══════════════════════════════════════════════════════════════
//  핵심: ADB 명령어 실행
//  - stdout / stderr 를 별도 스레드로 읽어 파이프 블로킹 방지
//  - waitFor(timeout, TimeUnit) 으로 10초 타임아웃 적용
// ══════════════════════════════════════════════════════════════
function adb(cmd) {
    try {
        var context       = App.getContext();
        var shizukuLibPath = context.getPackageManager()
            .getApplicationInfo("moe.shizuku.privileged.api", 0)
            .nativeLibraryDir;

        ensureRish();

        // 작은따옴표 이스케이프 (POSIX: ' → '\'' )
        var safeCmd = cmd.replace(/'/g, "'\\''");

        var execCmd = Java.to([
            "sh", "-c",
            "export LD_LIBRARY_PATH=" + shizukuLibPath +
            " && sh " + INTERNAL_DIR + "/rish -c '" + safeCmd + "'"
        ], "java.lang.String[]");

        var proc = java.lang.Runtime.getRuntime().exec(execCmd);

        // stdout / stderr 를 각각 별도 스레드로 읽음 (데드락 방지)
        var stdOut = { value: "" };
        var stdErr = { value: "" };

        function makeIOThread(stream, ref) {
            return new java.lang.Thread(new java.lang.Runnable({
                run: function () {
                    try {
                        var br    = new java.io.BufferedReader(new java.io.InputStreamReader(stream));
                        var lines = [];
                        var l;
                        while ((l = br.readLine()) !== null) lines.push(String(l));
                        ref.value = lines.join("\n").trim();
                    } catch (_) {}
                }
            }));
        }

        var tOut = makeIOThread(proc.getInputStream(), stdOut);
        var tErr = makeIOThread(proc.getErrorStream(), stdErr);
        tOut.start();
        tErr.start();

        // 타임아웃 적용
        var TimeUnit = java.util.concurrent.TimeUnit;
        var finished = proc.waitFor(CMD_TIMEOUT_S, TimeUnit.SECONDS);

        if (!finished) {
            proc.destroyForcibly();
            tOut.interrupt();
            tErr.interrupt();
            return {
                output  : stdOut.value,
                error   : "(타임아웃: " + CMD_TIMEOUT_S + "초 초과)",
                exitCode: -2
            };
        }

        tOut.join(500);
        tErr.join(500);

        return {
            output  : stdOut.value,
            error   : stdErr.value,
            exitCode: proc.exitValue()
        };

    } catch (e) {
        return { output: "", error: "Exception: " + e.toString(), exitCode: -1 };
    }
}

// ══════════════════════════════════════════════════════════════
//  파일 해시 (업데이트 검증용)
// ══════════════════════════════════════════════════════════════
function getFileHash(path) {
    var res = adb("sha256sum '" + path + "' 2>/dev/null");
    if (res.exitCode !== 0 || !res.output) return null;
    return res.output.split(/\s+/)[0];
}

// ══════════════════════════════════════════════════════════════
//  도움말 텍스트
// ══════════════════════════════════════════════════════════════
var HELP_TEXT = [
    "╔══ Shizuku ADB 봇 v2 ══╗",
    "",
    "[ 직접 실행 ]",
    " !adb [명령어]",
    "  tip) 긴 명령엔 | head -n 30 추가 권장",
    "",
    "[ 단축 명령어 ]",
    " !기기정보   모델·버전·시리얼",
    " !배터리     배터리 상세 상태",
    " !메모리     RAM 사용량",
    " !저장공간   스토리지 사용량",
    " !앱목록     서드파티 앱 목록",
    " !화면       해상도·밀도",
    " !네트워크   IP·인터페이스 정보",
    " !프로세스   CPU 상위 프로세스",
    "",
    "[ 관리 ]",
    " !업데이트 <봇이름> [IP]",
    "   원격 봇 파일 업데이트",
    "   IP 생략 시 본인 해시에 매핑된 IP 사용",
    " !로그          최근 실행 로그 조회",
    " !설정새로고침  config.json 재로드",
    " !제거          내부 실행 파일 삭제",
    " !내해시        내 사용자 해시 확인",
    "╚══════════════════════╝"
].join("\n");

// ══════════════════════════════════════════════════════════════
//  단축 명령어 정의
// ══════════════════════════════════════════════════════════════
var SHORTCUTS = {

    "!기기정보": function () {
        var brand  = adb("getprop ro.product.brand").output;
        var model  = adb("getprop ro.product.model").output;
        var ver    = adb("getprop ro.build.version.release").output;
        var sdk    = adb("getprop ro.build.version.sdk").output;
        var serial = adb("getprop ro.serialno").output;
        return [
            "📱 기기 정보",
            "브랜드  : " + brand,
            "모델    : " + model,
            "Android : " + ver + " (SDK " + sdk + ")",
            "시리얼  : " + serial
        ].join("\n");
    },

    "!배터리": function () {
        var res = adb("dumpsys battery | grep -E 'level|status|temperature|voltage|health|plugged'");
        return "🔋 배터리 상태\n" + (res.output || res.error || "조회 실패");
    },

    "!메모리": function () {
        var res = adb("cat /proc/meminfo | grep -E 'MemTotal|MemFree|MemAvailable|SwapTotal|SwapFree'");
        return "💾 메모리\n" + (res.output || res.error || "조회 실패");
    },

    "!저장공간": function () {
        var res = adb("df -h /sdcard /data /system 2>/dev/null");
        return "💿 저장공간\n" + trimOutput(res.output || res.error || "조회 실패");
    },

    "!앱목록": function () {
        var res = adb("pm list packages -3");
        return "📦 서드파티 앱 목록\n" + trimOutput(res.output || res.error || "조회 실패");
    },

    "!화면": function () {
        var size    = adb("wm size").output;
        var density = adb("wm density").output;
        return "🖥️ 화면 정보\n" + size + "\n" + density;
    },

    "!네트워크": function () {
        var res = adb("ip addr show | grep -E 'inet |link/ether' | grep -v '127.0.0.1'");
        return "🌐 네트워크\n" + trimOutput(res.output || res.error || "조회 실패");
    },

    "!프로세스": function () {
        // top 이 없는 경우 ps 폴백
        var res = adb("top -b -n 1 -m 10 2>/dev/null || ps -A --sort=-pcpu 2>/dev/null | head -11");
        return "⚙️ 상위 프로세스\n" + trimOutput(res.output || res.error || "조회 실패");
    }
};

// ══════════════════════════════════════════════════════════════
//  원격 업데이트 핸들러
// ══════════════════════════════════════════════════════════════
var isUpdating = false;

function handleUpdate(msg, argTokens) {
    var port = CONFIG.defaultPort || "8080";

    // 봇 이름 — 첫 번째 인자에서 받음 (필수)
    var botName = (argTokens[1] || "").trim();
    if (!botName) {
        msg.reply(
            "❌ 봇 이름이 필요합니다.\n" +
            "사용법: !업데이트 <봇이름> [IP주소]\n" +
            "예시  : !업데이트 test_dm"
        );
        return;
    }

    // 봇 이름에 사용 가능한 문자만 허용 (경로 주입 방지)
    if (!/^[A-Za-z0-9_.\-]+$/.test(botName)) {
        msg.reply("❌ 봇 이름에 사용할 수 없는 문자가 포함됐습니다.");
        return;
    }

    var filename = botName + ".js";

    // IP 결정: 두 번째 인자에 직접 입력 → 해시 매핑 순
    var ip = null;
    if (argTokens[2] && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(argTokens[2])) {
        ip = argTokens[2];
    } else {
        ip = findUpdateIp(String(msg.author.hash || ""));
    }

    if (!ip) {
        msg.reply(
            "❌ IP 주소를 찾을 수 없습니다.\n" +
            "config 에 매핑된 IP가 없으면 직접 입력하세요.\n" +
            "사용법: !업데이트 " + botName + " <IP주소>"
        );
        return;
    }

    var targetPath = "/sdcard/msgbot/Bots/" + botName + "/" + filename;
    var timestamp  = Date.now();
    var url = "http://" + ip + ":" + port + "/" + filename + "?t=" + timestamp;

    isUpdating = true;
    msg.reply("🔄 [" + msg.author.name + "] 업데이트 확인 중... (ID: " + timestamp + ")");

    try {
        var beforeHash = getFileHash(targetPath);
        var beforeSize = adb("stat -c \"%s\" '" + targetPath + "' 2>/dev/null").output || "0";

        var dlRes = adb(
            "curl -L -f -sS --connect-timeout 5" +
            " -H \"Cache-Control: no-cache\" -H \"Pragma: no-cache\"" +
            " \"" + url + "\" -o '" + targetPath + "' 2>&1"
        );

        if (dlRes.exitCode !== 0) {
            msg.reply("❌ 다운로드 실패\nURL: " + url + "\n" + (dlRes.output || dlRes.error));
            return;
        }

        adb("sync");

        var afterHash = getFileHash(targetPath);
        var afterSize = adb("stat -c \"%s\" '" + targetPath + "' 2>/dev/null").output;

        if (!afterSize) {
            msg.reply("❌ 업데이트 확인 실패: 파일 생성 오류");
        } else if (beforeHash === afterHash && beforeHash !== null) {
            msg.reply(
                "⚠️ 변경 사항 없음 (" + afterSize + "B)\n\n" +
                "PC에서 Ctrl+S 저장 후 다시 시도하세요."
            );
        } else {
            var sizeMsg = (beforeSize === afterSize)
                ? "크기 동일 (" + afterSize + "B)"
                : beforeSize + "B → " + afterSize + "B";

            msg.reply("✅ 업데이트 성공! (" + sizeMsg + ")");
            BotManager.compile(botName);
            msg.reply("🚀 [" + botName + "] 리로드 완료!");
        }

    } catch (e) {
        msg.reply("⚠️ 오류: " + (e.message || e.toString()));
    } finally {
        isUpdating = false;
    }
}

// ══════════════════════════════════════════════════════════════
//  메시지 핸들러
// ══════════════════════════════════════════════════════════════
function onMessage(msg) {
    var content = msg.content.trim();

    // ── 도움말 ────────────────────────────────────────────────
    if (content === "!adb") {
        msg.reply(HELP_TEXT);
        return;
    }

    // ── 내 해시 확인 (관리자 등록용, 권한 체크 없음) ──────────
    if (content === "!내해시") {
        msg.reply(
            "🪪 사용자 정보\n" +
            "닉네임: " + (msg.author.name || "(없음)") + "\n" +
            "해시  : " + (msg.author.hash || "(없음)") + "\n\n" +
            "이 해시를 shizuku_config.json 의 adminHashes 에 추가하면 관리자 권한이 부여됩니다."
        );
        return;
    }

    // ── 단축 명령어 ───────────────────────────────────────────
    if (SHORTCUTS[content]) {
        if (!isAdmin(msg)) { msg.reply("❌ 권한이 없습니다."); return; }
        try {
            msg.reply(SHORTCUTS[content]());
        } catch (e) {
            msg.reply("⚠️ 오류: " + e.toString());
        }
        return;
    }

    // ── !adb [명령어] ─────────────────────────────────────────
    if (content.startsWith("!adb ")) {
        if (!isAdmin(msg)) { msg.reply("❌ 권한이 없습니다."); return; }

        var cmd = content.substring(5).trim();
        if (!cmd) { msg.reply(HELP_TEXT); return; }

        // 위험 명령어 차단
        if (isDangerous(cmd)) {
            msg.reply("🚫 위험 명령어 차단됨\n\n명령어: " + cmd);
            logCommand(msg.author.name, "[BLOCKED] " + cmd, -99);
            return;
        }

        msg.reply("⏳ 실행: " + cmd);

        var res = adb(cmd);
        logCommand(msg.author.name, cmd, res.exitCode);

        var reply = "[Exit " + res.exitCode + "]";
        if (res.output) reply += "\n\n" + trimOutput(res.output);
        if (res.error)  reply += "\n\n[stderr]\n" + trimOutput(res.error);
        if (!res.output && !res.error) reply += "\n\n(출력 없음)";

        msg.reply(reply);
        return;
    }

    // ── !업데이트 ─────────────────────────────────────────────
    if (content.startsWith("!업데이트")) {
        if (!isAdmin(msg))  { msg.reply("❌ 권한이 없습니다."); return; }
        if (isUpdating)     { msg.reply("⚠️ 이미 업데이트가 진행 중입니다."); return; }
        handleUpdate(msg, content.split(/\s+/));
        return;
    }

    // ── !로그 ─────────────────────────────────────────────────
    if (content === "!로그") {
        if (!isAdmin(msg)) { msg.reply("❌ 권한이 없습니다."); return; }
        var logRes = adb("tail -20 '" + LOG_PATH + "' 2>/dev/null");
        msg.reply(logRes.output || "로그가 없거나 파일을 찾을 수 없습니다.");
        return;
    }

    // ── !설정새로고침 ─────────────────────────────────────────
    if (content === "!설정새로고침") {
        if (!isAdmin(msg)) { msg.reply("❌ 권한이 없습니다."); return; }
        CONFIG = loadConfig();
        var labels = (CONFIG.adminHashes || []).map(function (a) {
            if (typeof a === "string") return a.substring(0, 8) + "…";
            return (a.label || "(label없음)") + " [" + String(a.hash || "").substring(0, 8) + "…]";
        });
        var adminList = labels.length ? labels.join(", ") : "없음 (전체 허용)";
        msg.reply("✅ 설정 재로드 완료\n관리자: " + adminList);
        return;
    }

    // ── !제거 ─────────────────────────────────────────────────
    if (content === "!제거") {
        if (!isAdmin(msg)) { msg.reply("❌ 권한이 없습니다."); return; }
        try {
            java.lang.Runtime.getRuntime().exec(Java.to(
                ["sh", "-c", "rm -rf " + INTERNAL_DIR],
                "java.lang.String[]"
            )).waitFor();
            msg.reply(
                "✅ 내부 실행 파일 삭제 완료\n" +
                "다음 !adb 실행 시 자동으로 재설치됩니다."
            );
        } catch (e) {
            msg.reply("❌ 삭제 실패: " + e.toString());
        }
        return;
    }
}

bot.addListener(Event.MESSAGE, onMessage);
