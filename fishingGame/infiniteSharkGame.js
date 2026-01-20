/************************************************************
 *  무한상어게임모드 — 상어 낚시 (주간 특수 낚싯대 + 무한 시도)
 *
 *  명령어:
 *    .낚시 / .ㄴㅅ         // 낚시 1회 (시도 제한 없음)
 *    .ㄹㄹ                 // (누구나) 낚싯대 리롤(낚시 자동 진행 X)
 *    .낚시정보 / .정보 / .ㅈㅂ / ㅈㅂ
 *                         // 내 기록/오늘 시도횟수/연속성공/보정%/바이어스/주간 낚싯대
 *    .상어보정 N            // 크기 보정% 설정(-50~+50)
 *    .낚싯대                // 이번 주 내 낚싯대 보기
 *    .랭킹                  // 최대 크기 기준 전체 랭킹
 *    .규칙                  // 규칙
 *    .상어초기화 0          // (관리) 전체 데이터 초기화
 ************************************************************/

const bot = BotManager.getCurrentBot();
bot.setCommandPrefix(".");

// ── 로깅 제어
const LOG_TAG = "[SharkEvent]";
const LOG_VERBOSE = true; // 필요시 false

// 런타임별 Log 메서드 존재 여부 체크
const _HAS = {
    d: (typeof Log !== "undefined" && typeof Log.d === "function"),
    i: (typeof Log !== "undefined" && typeof Log.i === "function"),
    e: (typeof Log !== "undefined" && typeof Log.e === "function"),
    w: (typeof Log !== "undefined" && typeof Log.w === "function")
};

function logD(msg) {
    if (!LOG_VERBOSE) return;
    if (_HAS.d) Log.d(LOG_TAG + " " + msg);
    else if (_HAS.i) Log.i(LOG_TAG + " " + msg);
}
function logI(msg) {
    if (_HAS.i) Log.i(LOG_TAG + " " + msg);
    else if (_HAS.d) Log.d(LOG_TAG + " " + msg);
}
function logW(msg) {
    if (_HAS.w) Log.w(LOG_TAG + " " + msg);
    else if (_HAS.i) Log.i(LOG_TAG + " [WARN] " + msg);
    else if (_HAS.d) Log.d(LOG_TAG + " [WARN] " + msg);
}
function logE(msg) {
    if (_HAS.e) Log.e(LOG_TAG + " " + msg);
    else if (_HAS.i) Log.i(LOG_TAG + " [ERROR] " + msg);
    else if (_HAS.d) Log.d(LOG_TAG + " [ERROR] " + msg);
}
function fmtFixed(v, digits) {
    return Number(v).toFixed(digits);
}

// ─────────────────────────────────────────────
// ✅ 무한상어게임모드 설정
// ─────────────────────────────────────────────
const INFINITE_TRIES = true;       // ✅ 시도 제한 제거
const INF_TRIES_NUMBER = 999999;   // 내부 계산용 큰 수(표시는 ∞)

// ── 동작할 방 (null이면 모든 방)
const TARGET_ROOM = "아크라시아인의 휴식처";

// ── 관리자/강제 제어 대상
const ADMIN_NAME = "서윤";
const FORCE_REROLL_SET = {}; // { "닉네임": true } 다음 낚시에서 낚싯대 강제 재뽑기

// ── 저장 경로
const sdcard = android.os.Environment.getExternalStorageDirectory().getAbsolutePath();
const SAVE_DIR = sdcard + "/SharkEvent";
const SAVE_PATH = SAVE_DIR + "/user_data.json";

// ── 기본 게임 상수 (낚싯대 효과 적용 전 '베이스 값')
const BASE_MAX_DAILY_TRIES = 5;
const BASE_SUCCESS_P = 0.80;        // 80%
const BASE_BREAK_ROD_P = 0.05;      // 5%
const BASE_SPECIAL_SHARK_P = 0.05;  // 5%
const BASE_GOLD_READY_STREAK = 5;   // 연속 성공 5회 → 특급 보너스
const BIAS_DELTA_ABS = 0.05;        // 시도 후 sizeBias 변화폭(±5%p)
const BIAS_CLAMP = 0.30;            // sizeBias 제한(±30%p)

const BASE_MIN = 100;               // 기본 크기 범위 하한
const BASE_MAX = 300;
const EVENT_START_DATE = "2025-08-13"; // 이벤트 시작일
const BASE_MAX_START = 300;         // 시작 상한
const BASE_MAX_DAILY_INC = 100;     // 하루당 증가 cm
const BASE_MIN_RATIO = BASE_MIN / BASE_MAX_START;
const GOLD_MIN_FACTOR = 0.8;
const GOLD_MAX_FACTOR = 2.0;

// ── 안정 낚싯대 완주 보상 튜닝값 (무한모드에서는 비활성)
const SAFE_BONUS_FIRST_MIN = 0.15;
const SAFE_BONUS_FIRST_MAX = 0.25;
const SAFE_BONUS_GROW_MIN = 0.05;
const SAFE_BONUS_GROW_MAX = 0.08;
const SAFE_BONUS_FORCE_UP = true;

// ── 사용자 데이터 (메모리 캐시)
const userData = loadUserData();

/* ==========================
 * 공통 I/O (UTF-8, 이모지 안전)
 * ========================== */
function saveText(path, content) {
    logD("saveText() -> path=" + path + ", bytes=" + String(content || "").length);
    try {
        var dir = new java.io.File(SAVE_DIR);
        if (!dir.exists()) {
            var mk = dir.mkdirs();
            logD("saveText() mkdirs=" + mk);
        }
        var file = new java.io.File(path);
        var fos = new java.io.FileOutputStream(file);
        var osw = new java.io.OutputStreamWriter(fos, "UTF-8");
        osw.write(String(content));
        osw.flush(); osw.close(); fos.close();
        logI("saveText() OK path=" + path);
    } catch (e) {
        logE("saveText() ERROR: " + e);
    }
}
function readText(path) {
    logD("readText() -> path=" + path);
    var file = new java.io.File(path);
    if (!file.exists()) {
        logW("readText() file not found");
        return null;
    }
    try {
        var fis = new java.io.FileInputStream(file);
        var isr = new java.io.InputStreamReader(fis, "UTF-8");
        var br = new java.io.BufferedReader(isr);
        var sb = new java.lang.StringBuilder();
        var line;
        while ((line = br.readLine()) !== null) sb.append(line).append('\n');
        br.close(); isr.close(); fis.close();
        logI("readText() OK size=" + sb.length());
        return String(sb.toString());
    } catch (e) {
        logE("readText() ERROR: " + e);
        return null;
    }
}
function loadUserData() {
    logI("loadUserData() start");
    try {
        var raw = readText(SAVE_PATH);
        if (!raw) {
            logW("loadUserData() empty -> {}");
            return {};
        }
        var parsed = JSON.parse(raw);
        logI("loadUserData() parsed users=" + Object.keys(parsed).length);
        return parsed;
    } catch (e) {
        logE("loadUserData() parse error: " + e);
        return {};
    }
}
function saveUserData() {
    logI("saveUserData() users=" + Object.keys(userData).length);
    try {
        saveText(SAVE_PATH, JSON.stringify(userData, null, 2));
    } catch (e) {
        logE("saveUserData() ERROR: " + e);
    }
}

/* ================
 * 날짜/리셋 헬퍼
 * ================ */
function todayKST() {
    var now = new Date();
    var t = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    logD("todayKST() -> " + t);
    return t;
}
// 주간(월요일 기준) 계산
function getWeekMonday(dateStr) {
    var d = new Date(dateStr);
    var day = d.getUTCDay();     // 0=일,1=월...
    var diff = (day + 6) % 7;    // 월(1)->0
    d.setUTCDate(d.getUTCDate() - diff);
    return d.toISOString().slice(0, 10);
}

function ensureUser(u) {
    if (!userData[u]) {
        logI("ensureUser() new user '" + u + "'");
        userData[u] = {
            bestSize: 0,
            bestDate: null,
            bestType: "",
            lastDate: null,
            triesToday: 0,
            brokenDate: null,
            sizeBias: 0.0,   // -0.30 ~ +0.30
            streak: 0,
            goldenReady: false,
            sizeModPercent: 0,
            bestRodType: null,

            weeklyRod: null,
            weeklyRodName: null,
            weeklyRodStartMon: null,

            battleDate: null,
            battleCountToday: 0,

            safeBonusDate: null
        };
    }

    var today = todayKST();
    if (userData[u].lastDate !== today) {
        logI("ensureUser() day change for '" + u + "' -> reset daily fields");
        userData[u].lastDate = today;
        userData[u].triesToday = 0;
        userData[u].brokenDate = null;
        userData[u].battleCountToday = 0;
        // streak 유지
    }

    // 과거 저장본 필드 보정
    var d = userData[u];
    if (typeof d.weeklyRod === "undefined") {
        d.weeklyRod = null;
        d.weeklyRodName = null;
        d.weeklyRodStartMon = null;
        d.battleDate = null;
    }
    if (typeof d.battleCountToday === "undefined") d.battleCountToday = 0;
    if (typeof d.safeBonusDate === "undefined") d.safeBonusDate = null;
    if (typeof d.comboChargeCount === "undefined") d.comboChargeCount = 0;
    if (typeof d.comboChargeMul === "undefined") d.comboChargeMul = 1.0;
}

// 동적 상한
function getDynamicMax() {
    var today = new Date(todayKST());
    var start = new Date(EVENT_START_DATE);
    var diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) diffDays = 0;
    var dynMax = BASE_MAX_START + (diffDays * BASE_MAX_DAILY_INC);
    logI("getDynamicMax() day=" + diffDays + ", dynMax=" + dynMax);
    return dynMax;
}
function getDynamicBounds() {
    var max = getDynamicMax();
    var min = Math.floor(max * BASE_MIN_RATIO);
    if (min >= max) min = Math.max(1, max - 1);
    logI("getDynamicBounds() -> min=" + min + ", max=" + max);
    return { min: min, max: max };
}

/* =========================
 * 주간 낚싯대 (7종) 관리
 * ========================= */
function rollWeeklyRod(user, weekMon) {
    var d = userData[user];
    var prevType = d.weeklyRod || null;

    var type, name;
    var guard = 0;

    do {
        var r = Math.random() * 100;

        if (r < 20) { type = "safe"; name = "🟩 안정 낚싯대"; }
        else if (r < 40) { type = "lucky"; name = "🟧 행운의 낚싯대"; }
        else if (r < 55) { type = "compressed"; name = "🟦 압축 낚싯대"; }
        else if (r < 70) { type = "combo"; name = "🟪 연속 낚싯대"; }
        else if (r < 80) { type = "berserk"; name = "🟥 광폭 낚싯대"; }
        else if (r < 90) { type = "golden"; name = "🟨 황금 낚싯대"; }
        else { type = "battle"; name = "⚔️ 배틀 낚싯대"; }

        guard++;
        if (!prevType) break;
        if (type !== prevType) break;

    } while (guard < 30);

    d.weeklyRod = type;
    d.weeklyRodName = name;
    d.weeklyRodStartMon = weekMon;
    saveUserData();

    logI("rollWeeklyRod() user=" + user + ", rod=" + type + "(" + name + "), weekMon=" + weekMon +
        (prevType ? (", prev=" + prevType + ", rerolls=" + (guard - 1)) : ""));
    return name;
}

function ensureWeeklyRod(user) {
    ensureUser(user);
    var today = todayKST();
    var thisMon = getWeekMonday(today);
    var d = userData[user];

    var forced = false;
    if (FORCE_REROLL_SET[user]) {
        forced = true;
        delete FORCE_REROLL_SET[user];
        d.weeklyRod = null;
        d.weeklyRodName = null;
        d.weeklyRodStartMon = null;
        saveUserData();
    }

    if (!d.weeklyRod || d.weeklyRodStartMon !== thisMon) {
        var rodName = rollWeeklyRod(user, thisMon);
        return { rolled: true, name: rodName, forced: forced };
    }
    return { rolled: false, name: d.weeklyRodName, forced: forced };
}

// ✅ 누구나 리롤(.ㄹㄹ) : “월요일에 새로 뽑는 것처럼” 현재 낚싯대를 prev로 둔 채 다시 뽑기
function rerollWeeklyRodLikeMonday(user) {
    ensureUser(user);
    var today = todayKST();
    var thisMon = getWeekMonday(today);
    // rollWeeklyRod가 d.weeklyRod를 prevType으로 사용해서 "같은 낚싯대 방지"가 동작함
    var newName = rollWeeklyRod(user, thisMon);
    return newName;
}


// 현재 낚싯대에 따른 파라미터 조정
function getRodAdjustedParams(user) {
    ensureUser(user);
    var d = userData[user];
    var rod = d.weeklyRod || "none";

    // ✅ 무한모드: maxTries는 고정(실제로 제한 체크는 제거했지만, 표기/계산용)
    var maxTries = INFINITE_TRIES ? INF_TRIES_NUMBER : BASE_MAX_DAILY_TRIES;

    var successP = BASE_SUCCESS_P;
    var breakP = BASE_BREAK_ROD_P;
    var specialP = BASE_SPECIAL_SHARK_P;
    var goldStreakReq = BASE_GOLD_READY_STREAK;

    var extraNormalMul = 1.0;
    var extraAllMul = 1.0;

    var minMul = 1.0;
    var maxMul = 1.0;

    var isComboRod = false;
    var isBattleRod = false;
    var luckyExtraGoldP = 0.0;

    var luckyProcP = 0.0;
    var luckyMinMul = 1.0;
    var luckyMaxMul = 1.0;

    var luckyJackpotP = 0.0;
    var luckyJackpotMinMul = 1.0;
    var luckyJackpotMaxMul = 1.0;

    var compressedT1P = 0.0, compressedT2P = 0.0, compressedT3P = 0.0;
    var compressedT1Min = 1.0, compressedT1Max = 1.0;
    var compressedT2Min = 1.0, compressedT2Max = 1.0;
    var compressedT3Min = 1.0, compressedT3Max = 1.0;
    var compressedCapMul = 1.0;

    if (rod === "compressed") {
        // (무한모드) maxTries 변경 금지
        successP = 1.0;
        breakP = 0.0;
        specialP = 0.08;
        goldStreakReq = 9999;

        compressedT1P = 0.35;
        compressedT2P = 0.40;
        compressedT3P = 0.25;

        compressedT1Min = 1.00; compressedT1Max = 1.00;
        compressedT2Min = 1.55; compressedT2Max = 3.00;
        compressedT3Min = 3.00; compressedT3Max = 6.00;

        compressedCapMul = 6.00;

    } else if (rod === "lucky") {
        specialP = 0.20;
        breakP = 0.08;

        luckyProcP = 0.35;
        luckyMinMul = 1.2;
        luckyMaxMul = 2.2;

        luckyJackpotP = 0.05;
        luckyJackpotMinMul = 3.0;
        luckyJackpotMaxMul = 4.0;

    } else if (rod === "safe") {
        successP = 1.0;
        breakP = 0.025;
        specialP = 0.02;

    } else if (rod === "golden") {
        goldStreakReq = 4;
        breakP = 0.07;

    } else if (rod === "berserk") {
        // (무한모드) maxTries 변경 금지
        minMul = 1.3;
        maxMul = 2.2;

        successP = 0.70;
        breakP = 0.12;
        specialP = 0.03;

    } else if (rod === "combo") {
        isComboRod = true;
        breakP = 0.0;
        goldStreakReq = 9999;

    } else if (rod === "battle") {
        isBattleRod = true;
    }

    return {
        maxTries,
        successP,
        breakP,
        specialP,
        goldStreakReq,
        extraNormalMul,
        extraAllMul,
        minMul,
        maxMul,
        isComboRod,
        isBattleRod,
        luckyExtraGoldP,
        luckyProcP,
        luckyMinMul,
        luckyMaxMul,
        luckyJackpotP,
        luckyJackpotMinMul,
        luckyJackpotMaxMul,

        compressedT1P, compressedT2P, compressedT3P,
        compressedT1Min, compressedT1Max,
        compressedT2Min, compressedT2Max,
        compressedT3Min, compressedT3Max,
        compressedCapMul
    };
}

/* =========================
 * 크기 생성 로직(가중 분포)
 * ========================= */
function weightedSize(baseMin, baseMax, bias) {
    var span = baseMax - baseMin;
    var alpha = 2.0 - bias;
    if (alpha < 1.2) alpha = 1.2;
    if (alpha > 3.0) alpha = 3.0;
    var u = Math.random();
    var val = baseMin + span * Math.pow(u, alpha);
    var out = Math.round(val);
    logD("weightedSize(min=" + baseMin + ", max=" + baseMax + ", bias=" + bias.toFixed(3) +
        ") alpha=" + alpha.toFixed(2) + " u=" + u.toFixed(3) + " -> " + out);
    return out;
}
function applySizeMod(size, modPercent) {
    var out = Math.round(size * (1 + (modPercent || 0) / 100));
    if (out < 1) out = 1;
    logD("applySizeMod(size=" + size + ", mod=" + modPercent + "%) -> " + out);
    return out;
}
function applyLuckyProc(size, params) {
    if (!params) return { size: size, proc: false, tier: null, mul: 1.0 };

    if (params.luckyJackpotP && Math.random() < params.luckyJackpotP) {
        var minJ = params.luckyJackpotMinMul || 3.0;
        var maxJ = params.luckyJackpotMaxMul || 4.0;
        var mulJ = minJ + Math.random() * (maxJ - minJ);
        var outJ = Math.round(size * mulJ);
        return { size: Math.max(1, outJ), proc: true, tier: "jackpot", mul: mulJ };
    }

    if (params.luckyProcP && Math.random() < params.luckyProcP) {
        var minM = params.luckyMinMul || 1.0;
        var maxM = params.luckyMaxMul || 1.0;
        var mul = minM + Math.random() * (maxM - minM);
        var out = Math.round(size * mul);
        return { size: Math.max(1, out), proc: true, tier: "normal", mul: mul };
    }

    return { size: size, proc: false, tier: null, mul: 1.0 };
}

// ✅ 무한모드에서는 "완주" 개념이 없으니 안정 보너스 비활성
function grantSafeCompletionBonus(user, params, dayMax) {
    if (INFINITE_TRIES) return null;

    ensureUser(user);
    var d = userData[user];
    var today = todayKST();

    if (d.weeklyRod !== "safe") return null;
    if (d.safeBonusDate === today) return null;
    if (d.triesToday < params.maxTries) return null;

    var best = d.bestSize || 0;
    var bonusSize = 0;

    var r = SAFE_BONUS_GROW_MIN + Math.random() * (SAFE_BONUS_GROW_MAX - SAFE_BONUS_GROW_MIN);

    if (best <= 0) {
        var starter = Math.round(
            dayMax * (SAFE_BONUS_FIRST_MIN + Math.random() * (SAFE_BONUS_FIRST_MAX - SAFE_BONUS_FIRST_MIN))
        );
        bonusSize = Math.max(1, applySizeMod(starter, d.sizeModPercent));
    } else {
        var inc = Math.max(1, Math.round(best * r));
        var bonusBase = best + inc;
        bonusSize = applySizeMod(bonusBase, d.sizeModPercent);
        if (SAFE_BONUS_FORCE_UP && bonusSize <= best) bonusSize = best + 1;
    }

    d.bestSize = bonusSize;
    d.bestDate = today;
    d.bestType = "안정";
    d.bestRodType = d.weeklyRod || null;
    d.safeBonusDate = today;

    saveUserData();
    return "🛡️ 오늘 낚시 완주 보상 : " + bonusSize + "cm";
}

/* =========================
 * 배틀 낚싯대 전용 로직
 * ========================= */
function getRandomOpponent(user) {
    var keys = Object.keys(userData);
    var candidates = [];
    for (var i = 0; i < keys.length; i++) {
        var u = keys[i];
        if (u === user) continue;
        var d = userData[u];
        if (!d) continue;
        if (d.bestSize && d.bestSize > 0) candidates.push(u);
    }
    if (candidates.length === 0) return null;
    var oppName = candidates[Math.floor(Math.random() * candidates.length)];
    return { name: oppName, data: userData[oppName] };
}
function resolveBattle(user) {
    ensureUser(user);
    var data = userData[user];
    var today = todayKST();
    var messages = [];

    var opp = getRandomOpponent(user);
    if (!opp) {
        messages.push("⚔️ 배틀 낚싯대가 발동했지만, 상대가 없어 배틀 없이 낚시를 진행합니다.");
        return { result: "skip", messages: messages };
    }

    var myBest = data.bestSize || 0;
    var oppBest = opp.data.bestSize || 0;

    var winP = 0.5;
    if (myBest > 0 && oppBest > 0) {
        if (myBest > oppBest) winP = 0.6;
        else if (myBest < oppBest) winP = 0.4;
        else winP = 0.5;
    }

    var roll = Math.random();
    logD("resolveBattle() user=" + user + " vs " + opp.name + ", myBest=" +
        myBest + ", oppBest=" + oppBest + ", winP=" + winP.toFixed(3) +
        ", roll=" + roll.toFixed(3));

    if (roll >= winP) {
        data.battleDate = today;
        saveUserData();
        messages.push(
            "💀 배틀 패배…\n" +
            "상대 " + opp.name + " 에게 완패했습니다.\n" +
            "낚싯대가 부러졌지만(연출), 무한 모드라 계속 도전할 수 있어요!"
        );
        return { result: "lose", messages: messages };

    }

    var base = oppBest;
    if (base <= 0) base = 100;

    var mult = 0.9 + Math.random() * 0.5;
    var stolenSize = Math.round(base * mult);
    stolenSize = applySizeMod(stolenSize, data.sizeModPercent);

    var bestUpdated = false;
    if (!data.bestSize || stolenSize > data.bestSize) {
        bestUpdated = true;
        data.bestSize = stolenSize;
        data.bestDate = today;
        data.bestType = "배틀";
        data.bestRodType = data.weeklyRod || null;
    }

    data.battleDate = today;
    saveUserData();

    messages.push(
        "⚔️ 배틀 승리!\n" +
        "상대 " + opp.name + " 의 최고 기록 " + oppBest + "cm 상어를 압도했습니다.\n" +
        "강탈 상어: " + stolenSize + "cm" + (bestUpdated ? " 📈 (개인 최고 기록 갱신!)" : "")
    );

    return { result: "win", messages: messages };
}

function getTop1BestSize() {
    var keys = Object.keys(userData);
    var max = 0;
    for (var i = 0; i < keys.length; i++) {
        var d = userData[keys[i]];
        if (!d) continue;
        var s = d.bestSize || 0;
        if (s > max) max = s;
    }
    return max;
}

// ✅ 배틀 제외 낚시 결과에만 적용할 "랭킹 1등 기준 보정치"
function applyTopRankCorrection(size, dayMax) {
    var top1 = getTop1BestSize();
    if (!top1 || top1 <= 0) return size;

    // 비배틀 이론 상한(특급 최대치 기준)
    var cap = Math.ceil(dayMax * GOLD_MAX_FACTOR);

    // 1등이 cap을 넘어서기 시작하면 그 비율만큼 스케일업
    var mul = top1 / cap;

    if (mul <= 1.0) return size;

    // 과도 폭주 방지(원하면 숫자 더 올려도 됨)
    if (mul > 10.0) mul = 10.0;

    var out = Math.round(size * mul);
    if (out < 1) out = 1;

    logD("TopRankCorrection: top1=" + top1 + " cap=" + cap + " mul=" + mul.toFixed(2) +
        " size " + size + " -> " + out);

    return out;
}


/* =============================
 * 한 번의 상어 낚시 시뮬레이션
 * ============================= */
function attemptShark(user) {
    logI("attemptShark() user='" + user + "'");

    ensureUser(user);
    var data = userData[user];
    var today = todayKST();
    var params = getRodAdjustedParams(user);

    var messages = [];

    function getComboSuccessP(nextStreak) {
        if (nextStreak <= 6) return 0.90;
        if (nextStreak === 7) return 0.65;
        if (nextStreak === 8) return 0.45;
        if (nextStreak === 9) return 0.30;
        return 0.15;
    }
    function getComboMul(streak) {
        if (streak <= 0) return 1.0;
        if (streak >= 10) return 5.0;
        var table = { 1: 1.20, 2: 1.50, 3: 1.90, 4: 2.40, 5: 2.70, 6: 2.90, 7: 3.20, 8: 3.60, 9: 4.00, 10: 5.00 };
        return table[streak] || 1.0;
    }
    function leftLabel() {
        return INFINITE_TRIES ? "∞" : String(params.maxTries - data.triesToday);
    }

    // 🔹 배틀 낚싯대는 "배틀만"
    if (params.isBattleRod) {
        if (typeof data.battleCountToday === "undefined") data.battleCountToday = 0;

        // ✅ 무한모드: 배틀 하루 2회 제한 제거
        var bres = resolveBattle(user);
        data.battleCountToday++;
        saveUserData();

        if (bres && bres.messages && bres.messages.length) {
            for (var bi = 0; bi < bres.messages.length; bi++) messages.push(bres.messages[bi]);
        } else {
            messages.push("⚔️ 배틀 결과 처리 중 알 수 없는 오류가 발생했습니다.");
        }
        return { messages: messages };
    }

    // 당일 동적 범위 + 광폭 적용
    var b = getDynamicBounds();
    var dayMin = b.min;
    var dayMax = b.max;

    if (params.minMul !== 1.0 || params.maxMul !== 1.0) {
        dayMin = Math.floor(dayMin * params.minMul);
        dayMax = Math.floor(dayMax * params.maxMul);
        if (dayMin >= dayMax) dayMin = Math.max(1, dayMax - 1);
        logI("attemptShark() rod-adjusted bounds -> min=" + dayMin + ", max=" + dayMax);
    }

    // ✅ 무한모드: 일일 횟수 제한 체크 제거 (여기서 막지 않음)

    // 시도 시작 직후 파손 체크
    var rollBreak = Math.random();
    logD("attemptShark() breakRoll=" + rollBreak.toFixed(3) + " thresh=" + params.breakP);
    if (rollBreak < params.breakP) {
        // ✅ 부러짐은 연출만: 오늘 낚시 차단 없음
        data.triesToday++;
        data.streak = 0;          // 부러지면 연속은 끊기는 게 자연스러움(원하면 제거 가능)
        saveUserData();

        messages.push("💥 상어가 너무 커서 낚싯대가 부러졌어요! (연출)\n❌ 이번 시도는 실패 처리. 계속 도전 가능!");
        return { messages: messages };
    }


    data.goldenReady = false;

    // 성공/실패
    var effSuccessP = params.successP;
    if (params.isComboRod) effSuccessP = getComboSuccessP((data.streak || 0) + 1);

    var rollSuc = Math.random();
    var success = (rollSuc < effSuccessP);
    data.triesToday++;

    logD("attemptShark() successRoll=" + rollSuc.toFixed(3) + " P=" + effSuccessP +
        " -> success=" + success + ", triesToday=" + data.triesToday);

    var isComboChargeTurn = (params.isComboRod && success);

    if (!isComboChargeTurn) {
        var delta = (Math.random() * 2 * BIAS_DELTA_ABS) - BIAS_DELTA_ABS;
        var oldBias = data.sizeBias;

        data.sizeBias += delta;
        if (data.sizeBias > BIAS_CLAMP) data.sizeBias = BIAS_CLAMP;
        if (data.sizeBias < -BIAS_CLAMP) data.sizeBias = -BIAS_CLAMP;

        logD("attemptShark() bias delta=" + fmtFixed(delta, 3) +
            " old=" + fmtFixed(oldBias, 3) +
            " -> " + fmtFixed(data.sizeBias, 3));
    } else {
        logD("attemptShark() combo/charge -> bias unchanged");
    }

    // 🟪 연속 낚싯대 : 성공=충전, 실패=방출
    if (params.isComboRod) {
        if (success) {
            if (data.streak < 10) data.streak += 1;

            if (data.streak >= 10) {
                success = false;
                isComboChargeTurn = false;
            } else {
                var mulNow = getComboMul(data.streak);
                saveUserData();
                messages.push(
                    "🟪 콤보 충전! (" + data.streak + "/10)\n" +
                    "현재 누적 배율: x" + mulNow.toFixed(2) + "\n" +
                    "남은 시도: " + leftLabel()
                );
                return { messages: messages };
            }
        }
    }

    // 실패이면: streak가 있으면 방출 낚시, 없으면 그냥 실패
    if (params.isComboRod && !success && data.streak > 0) {
        var storedStreak = data.streak;
        var mul = getComboMul(storedStreak);

        var kind2 = "일반";
        var base2;

        if (storedStreak >= 5) {
            kind2 = "특급";
            var gMin2 = Math.ceil(dayMax * GOLD_MIN_FACTOR);
            var gMax2 = Math.ceil(dayMax * GOLD_MAX_FACTOR);
            base2 = gMin2 + Math.floor(Math.random() * (gMax2 - gMin2 + 1));
        } else {
            base2 = weightedSize(dayMin, dayMax, data.sizeBias);
        }

        base2 = Math.round(base2 * mul);
        var size2 = applySizeMod(base2, data.sizeModPercent);
        // ✅ 랭킹 1등 기준 보정치 적용(배틀 제외)
        size2 = applyTopRankCorrection(size2, dayMax);

        data.streak = 0;

        var bestUpdatedCombo = false;
        if (!data.bestSize || size2 > data.bestSize) {
            bestUpdatedCombo = true;
            data.bestSize = size2;
            data.bestDate = today;
            data.bestType = kind2;
            data.bestRodType = data.weeklyRod || null;
        }

        var head2 =
            (storedStreak >= 10) ? "💥💥 10연속 달성!"
                : (storedStreak >= 5) ? "콤보 종료! 🟨 황금 상어 방출!"
                    : "🟪 콤보 종료!";

        var icon2 = (kind2 === "특급") ? "🟨" : "";
        var msg2 =
            head2 + " " + icon2 + size2 + "cm\n" +
            "누적: " + storedStreak + "회 / 배율 x" + mul.toFixed(2) + "\n" +
            (bestUpdatedCombo ? "📈 개인 최고 기록 갱신!\n" : "") +
            "남은 시도: " + leftLabel();

        messages.push(msg2);

        var safeMsgCombo = grantSafeCompletionBonus(user, params, dayMax);
        if (safeMsgCombo) messages.push(safeMsgCombo);

        saveUserData();
        return { messages: messages };
    }

    // 실패 시
    if (!success) {
        logI("attemptShark() FAIL, streak reset (was " + data.streak + ")");
        data.streak = 0;

        var safeMsgFail = grantSafeCompletionBonus(user, params, dayMax);
        if (safeMsgFail) messages.push(safeMsgFail);

        saveUserData();
        messages.push("❌ 실패! (남은 시도: " + leftLabel() + ")");
        return { messages: messages };
    }

    // ===== 성공 처리 =====
    var kind = "일반";
    var size;

    var rollSpecial = Math.random();
    var base = weightedSize(dayMin, dayMax, data.sizeBias);
    if (rollSpecial < params.specialP) {
        var mult = 2.0 + Math.random() * 1.0;
        base = Math.round(base * mult);
        kind = "전설";
        logI("attemptShark() LEGENDARY roll=" + rollSpecial.toFixed(3) +
            " mult=" + mult.toFixed(2) + " baseNow=" + base);
    } else {
        logD("attemptShark() normal roll=" + rollSpecial.toFixed(3) +
            " base=" + base + " (dyn=" + dayMin + "~" + dayMax + ")");
    }

    if (kind === "일반" && params.extraNormalMul !== 1.0) {
        base = Math.round(base * params.extraNormalMul);
        logD("attemptShark() compressed rod normalMul=" + params.extraNormalMul +
            " -> base=" + base);
    }
    if (params.extraAllMul !== 1.0) base = Math.round(base * params.extraAllMul);

    var compressedInfo = null;
    if (data.weeklyRod === "compressed") {
        var rr = Math.random();
        var mulMin, mulMax;

        if (rr < params.compressedT1P) {
            mulMin = params.compressedT1Min; mulMax = params.compressedT1Max;
        } else if (rr < params.compressedT1P + params.compressedT2P) {
            mulMin = params.compressedT2Min; mulMax = params.compressedT2Max;
        } else {
            mulMin = params.compressedT3Min; mulMax = params.compressedT3Max;
        }

        var mulC = mulMin + Math.random() * (mulMax - mulMin);
        base = Math.round(base * mulC);

        var cap = Math.round(dayMax * params.compressedCapMul);
        if (base > cap) base = cap;

        if (mulC > 1.001) compressedInfo = { mul: mulC };
        else compressedInfo = null;
    }

    size = applySizeMod(base, data.sizeModPercent);

    data.streak += 1;

    var luckyInfo = null;
    if (data.weeklyRod === "lucky") {
        luckyInfo = applyLuckyProc(size, params);
        size = luckyInfo.size;
    }

    // ✅ 랭킹 1등 기준 보정치 적용(배틀 제외)
    size = applyTopRankCorrection(size, dayMax);

    var bestUpdated = false;
    if (!data.bestSize || size > data.bestSize) {
        bestUpdated = true;
        data.bestSize = size;
        data.bestDate = today;
        data.bestType = kind;
        data.bestRodType = data.weeklyRod || null;
        logI("attemptShark() BEST updated -> " + size + "cm (" + kind + ")");
    }

    function kindIcon(k) {
        return (k === "전설") ? "⭐" : (k === "특급" ? "🟨" : (k === "배틀" ? "⚔️" : ""));
    }

    var head = (kind === "전설") ? "⭐ 전설 상어!" : "✅ 성공!";
    var sizeLabel = kindIcon(kind) + size + "cm";

    var mainMsg =
        head + " " + sizeLabel + "\n" +
        (luckyInfo && luckyInfo.proc
            ? (luckyInfo.tier === "jackpot"
                ? "💎 행운 발동! x" + luckyInfo.mul.toFixed(2) + "\n"
                : "🍀 행운 발동! x" + luckyInfo.mul.toFixed(2) + "\n")
            : "") +
        (compressedInfo ? "🧊 압축! x" + Number(compressedInfo.mul).toFixed(2) + "배\n" : "") +
        "연속 성공: " + data.streak + "\n" +
        (bestUpdated ? "📈 개인 최고 기록 갱신!\n" : "") +
        "남은 시도: " + leftLabel();

    messages.push(mainMsg);

    // 연속 성공 보너스(기존 유지)
    if (data.streak >= params.goldStreakReq) {
        data.streak = 0;

        var gMin = Math.ceil(dayMax * GOLD_MIN_FACTOR);
        var gMax = Math.ceil(dayMax * GOLD_MAX_FACTOR);
        var goldenBase = gMin + Math.floor(Math.random() * (gMax - gMin + 1));
        logI("attemptShark() BONUS ELITE range=" + gMin + "~" + gMax + ", pick=" + goldenBase);

        var bonusSize = applySizeMod(goldenBase, data.sizeModPercent);

        var luckyInfo2 = null;
        if (data.weeklyRod === "lucky") {
            luckyInfo2 = applyLuckyProc(bonusSize, params);
            bonusSize = luckyInfo2.size;
        }
        // ✅ 랭킹 1등 기준 보정치 적용(배틀 제외)
        bonusSize = applyTopRankCorrection(bonusSize, dayMax);

        var bonusKind = "특급";

        var bestUpdated2 = false;
        if (!data.bestSize || bonusSize > data.bestSize) {
            bestUpdated2 = true;
            data.bestSize = bonusSize;
            data.bestDate = today;
            data.bestType = bonusKind;
            data.bestRodType = data.weeklyRod || null;
            logI("attemptShark() BEST updated by BONUS -> " + bonusSize + "cm (" + bonusKind + ")");
        }

        var bonusMsg =
            "🎁 보너스! 연속 " + params.goldStreakReq + "회 달성으로 즉시 추가 낚시\n" +
            "🟨 특급 상어! " + kindIcon(bonusKind) + bonusSize + "cm\n" +
            (luckyInfo2 && luckyInfo2.proc
                ? (luckyInfo2.tier === "jackpot"
                    ? "💎 대박 행운 발동! x" + luckyInfo2.mul.toFixed(2) + "\n"
                    : "🍀 행운 발동! x" + luckyInfo2.mul.toFixed(2) + "\n")
                : "") +
            "연속 성공: " + data.streak + "\n" +
            (bestUpdated2 ? "📈 개인 최고 기록 갱신!\n" : "") +
            "남은 시도: " + leftLabel();

        messages.push(bonusMsg);
    }

    var safeMsg = grantSafeCompletionBonus(user, params, dayMax);
    if (safeMsg) messages.push(safeMsg);

    saveUserData();
    return { messages: messages };
}

/* ==================
 * 보조 정보/출력
 * ================== */
function rodLabel(type) {
    if (!type) return "-";
    if (type === "compressed") return "압축";
    if (type === "lucky") return "행운";
    if (type === "safe") return "안정";
    if (type === "golden") return "황금";
    if (type === "berserk") return "광폭";
    if (type === "combo") return "연속";
    if (type === "battle") return "배틀";
    return type;
}
function getInfo(user) {
    logD("getInfo() user='" + user + "'");
    ensureUser(user);
    var d = userData[user];
    var params = getRodAdjustedParams(user);

    var rodLine = d.weeklyRodName
        ? ("이번 주 낚싯대: " + d.weeklyRodName + " (시작: " + d.weeklyRodStartMon + ")")
        : "이번 주 낚싯대: (미지정)";

    var bestRodLabel = d.bestRodType ? rodLabel(d.bestRodType) : "-";

    var out = [
        "📊 무한상어게임 정보",
        rodLine,
        "",
        "최대 기록: " + (d.bestSize || 0) + "cm" + (d.bestType ? " (" + d.bestType + ")" : ""),
        "최고 기록 낚싯대: " + bestRodLabel,
        "기록일: " + (d.bestDate || "-"),
        "오늘 시도 횟수: " + (d.triesToday || 0) + (INFINITE_TRIES ? " (무한 모드)" : ""),
        "연속 성공: " + d.streak,
        "크기 보정: " + d.sizeModPercent + "%",
        "큰 상어 편향(sizeBias): " + (d.sizeBias * 100).toFixed(1) + "%p",
        "",
        "리롤: .ㄹㄹ  (낚싯대만 다시 뽑기)"
    ].join("\n");

    logD("getInfo() -> \n" + out);
    return out;
}

function setSizeMod(user, val) {
    logD("setSizeMod() user='" + user + "', raw='" + val + "'");
    ensureUser(user);
    var n = parseInt(val, 10);
    if (isNaN(n)) return "사용법: .상어보정 N  (예: .상어보정 10)";
    if (n > 50) n = 50;
    if (n < -50) n = -50;
    userData[user].sizeModPercent = n;
    saveUserData();
    logI("setSizeMod() OK " + n + "%");
    return "크기 보정이 " + n + "%로 설정되었습니다.";
}

function renderRanking() {
    logD("renderRanking()");
    var arr = Object.keys(userData).map(function (u) {
        var d = userData[u];
        return { user: u, size: d.bestSize || 0, kind: d.bestType || "", rodType: d.bestRodType || null };
    }).sort(function (a, b) { return b.size - a.size; });

    var lines = ["🏆 상어 랭킹 (총 " + arr.length + "명)"];
    if (arr.length === 0) return lines.concat(["기록이 없습니다."]).join("\n");

    for (var i = 0; i < arr.length; i++) {
        var e = arr[i];
        var icon = "";
        if (e.kind === "특급") icon = "🟨";
        else if (e.kind === "전설") icon = "⭐";
        else if (e.kind === "배틀") icon = "⚔️";

        var sizeLabel = icon + e.size + "cm";
        var rodText = e.rodType ? rodLabel(e.rodType) : null;

        lines.push((i + 1) + ". " + e.user + " - " + sizeLabel + (rodText ? " (" + rodText + ")" : ""));
    }
    return lines.join("\n");
}

function guide() {
    var bounds = getDynamicBounds();
    var dayMin = bounds.min, dayMax = bounds.max;
    var gMax = Math.ceil(dayMax * GOLD_MAX_FACTOR);

    return [
        "🎣 무한상어게임모드",
        "──────────────────────",
        "• 오늘 일반 상어 크기 범위: " + dayMin + " ~ " + dayMax + "cm",
        "• ⭐전설 상어 약 5%: 일반 크기의 2~3배",
        "• 🟨특급 상어: 오늘 상한의 " + GOLD_MIN_FACTOR + "배 ~ 2배 (이론상 최대 ≈ " + gMax + "cm)",
        "",
        "• ✅ 낚시 시도 횟수: 무한(∞)  (낚싯대 종류와 무관)",
        "• 🎣 낚싯대 리롤: .ㄹㄹ  (누구나 가능, 낚시는 안 함)",
        "",
        "명령어: .낚시(.ㄴㅅ) / .ㄹㄹ / .낚시정보(.ㅈㅂ) / .낚싯대 / .랭킹 / .규칙"
    ].join("\n");
}

/* ==========
 * 명령 처리
 * ========== */
bot.addListener(Event.MESSAGE, function (msg) {
    var content = (msg.content || "").trim();
    if (!content) return;

    var sp = content.indexOf(" ");
    var cmd = (sp === -1) ? content : content.slice(0, sp);
    var arg = (sp === -1) ? "" : content.slice(sp + 1).trim();
    var user = msg.author.name;

    // 관리자 명령 판별
    var isAdminCmd =
        cmd === ".ㄴㅅㄷ리롤" ||
        cmd === ".ㄴㅅㅊㄱㅎ";

    // 일반 명령만 방 제한
    if (!isAdminCmd && TARGET_ROOM && msg.room !== TARGET_ROOM) return;

    logD("MESSAGE room='" + msg.room + "', user='" + user + "', content='" + content + "' -> cmd='" + cmd + "', arg='" + arg + "'");

    try {
        // ✅ (1) 누구나 낚싯대 리롤: .ㄹㄹ (낚시 자동 진행 X)
        if (cmd === ".ㄹㄹ") {
            ensureUser(user);

            // 이번 주 낚싯대가 없으면 먼저 생성되도록 보장(없으면 prevType이 없어서 중복 방지 의미 없음)
            ensureWeeklyRod(user);

            var newRod = rerollWeeklyRodLikeMonday(user);
            msg.reply(
                "🎲 낚싯대를 다시 뽑았습니다!\n" +
                "→ " + newRod + "\n" +
                "이제 '.낚시' 또는 '.ㄴㅅ'로 낚시를 시작하세요."
            );
            return;
        }

        if (cmd === ".낚시" || cmd === ".ㄴㅅ") {
            ensureUser(user);

            var wr = ensureWeeklyRod(user);

            // 이번 주 처음 자동 뽑기면: 안내하고 종료(자동 낚시 X)
            if (wr.rolled && !wr.forced) {
                msg.reply(
                    "🎣 새 낚싯대를 뽑았습니다!\n" +
                    "→ " + wr.name + "\n" +
                    "이제 다시 '.낚시' 또는 '.ㄴㅅ'를 입력해서 낚시를 시작하세요."
                );
                return;
            }

            if (wr.rolled && wr.forced) {
                msg.reply("🎣 (관리) 낚싯대가 강제 리롤되었습니다!\n→ " + wr.name);
            }

            var r = attemptShark(user);
            if (typeof r === "string") {
                msg.reply(r);
            } else if (r && r.messages && r.messages.length) {
                for (var i = 0; i < r.messages.length; i++) msg.reply(r.messages[i]);
            } else {
                msg.reply("⚠️ 알 수 없는 결과 형식입니다.");
            }
            return;
        }

        if (cmd === ".낚시정보" || cmd === ".정보" || cmd === ".ㅈㅂ" || cmd === "ㅈㅂ") {
            msg.reply(getInfo(user));
            return;
        }

        if (cmd === ".상어보정") {
            msg.reply(setSizeMod(user, arg));
            return;
        }

        if (cmd === ".낚싯대") {
            ensureUser(user);
            var today = todayKST();
            var thisMon = getWeekMonday(today);
            var d = userData[user];

            if (!d.weeklyRod || d.weeklyRodStartMon !== thisMon) {
                msg.reply(
                    "🎣 이번 주 낚싯대가 아직 정해지지 않았어요.\n" +
                    "처음으로 '.낚시' 또는 '.ㄴㅅ'를 입력하면\n" +
                    "이번 주에 사용할 낚싯대를 자동으로 뽑습니다.\n\n" +
                    "원하면 '.ㄹㄹ'로 지금 바로 뽑고 시작할 수도 있어요."
                );
            } else {
                msg.reply("🎣 이번 주 낚싯대 정보\n→ " + d.weeklyRodName + "\n\n리롤: .ㄹㄹ");
            }
            return;
        }

        if (cmd === ".랭킹") {
            msg.reply(renderRanking());
            return;
        }

        if (cmd === ".규칙") {
            msg.reply(guide());
            return;
        }

        if (cmd === ".상어초기화" && arg === "0") {
            logW("RESET requested");
            for (var k in userData) {
                if (Object.prototype.hasOwnProperty.call(userData, k)) delete userData[k];
            }
            saveUserData();
            msg.reply("🧹 상어 이벤트 데이터 전체 초기화 완료.");
            return;
        }

    } catch (e) {
        logE("MESSAGE handler ERROR: " + e + "\nstack=" + (e && e.stack ? e.stack : "(no stack)"));
        msg.reply("⚠️ 명령 처리 중 오류가 발생했어요. 로그를 확인해주세요.");
    }

    // ── (관리) 특정 유저 다음 낚시에 낚싯대 강제 재뽑기: .ㄴㅅㄷ리롤 닉네임
    if (cmd === ".ㄴㅅㄷ리롤") {
        if (user !== ADMIN_NAME) { msg.reply("⛔ 관리자만 사용할 수 있어요."); return; }
        if (!arg) { msg.reply("사용법: .ㄴㅅㄷ리롤 닉네임"); return; }
        FORCE_REROLL_SET[arg] = true;
        msg.reply("✅ '" + arg + "' 님은 다음 낚시에 낚싯대를 새로 뽑습니다.");
        return;
    }

    // ── (관리) 특정 유저 오늘 낚시 상태 초기화: .ㄴㅅㅊㄱㅎ 닉네임
    if (cmd === ".ㄴㅅㅊㄱㅎ") {
        if (user !== ADMIN_NAME) { msg.reply("⛔ 관리자만 사용할 수 있어요."); return; }
        if (!arg) { msg.reply("사용법: .ㄴㅅㅊㄱㅎ 닉네임"); return; }

        ensureUser(arg);
        var ud = userData[arg];
        var today2 = todayKST();

        ud.lastDate = today2;
        ud.triesToday = 0;
        ud.brokenDate = null;
        ud.battleCountToday = 0;
        ud.streak = 0;

        saveUserData();
        msg.reply("🧹 '" + arg + "' 님의 오늘 낚시 상태를 초기화했습니다. (tries=0, 파손해제)");
        return;
    }
});
