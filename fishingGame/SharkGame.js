/**
 * @description Shark Event Mode — 상어 낚시 (v0.8.0-daily)
 * @author Hehee (modified for Daily Rod & Combo update)
 * @environment MessengerBotR v0.7.41-alpha.1 (GraalJS), Android 16
 */

const bot = BotManager.getCurrentBot();
const Env = Java.type("android.os.Environment");

/* ==================== 전역 설정 ==================== */

bot.setCommandPrefix(".");

const LOG_TAG = "[SharkEvent]";
const ALLOWED_ROOMS = ["아크라시아인의 휴식처"];
const ADMIN_NAME = "서윤";

const SAVE_DIR = Env.getExternalStorageDirectory().getAbsolutePath() + "/SharkEvent";
const SAVE_PATH = SAVE_DIR + "/user_data.json";

const BASE_MAX_DAILY_TRIES = 5;
const BASE_SUCCESS_P = 0.80;
const BASE_BREAK_ROD_P = 0.05;
const BASE_SPECIAL_SHARK_P = 0.05;
const BIAS_DELTA_ABS = 0.05;
const BIAS_CLAMP = 0.30;

const BASE_MIN = 100;
const BASE_MAX_START = 300;
const BASE_MAX_DAILY_INC = 100;
const EVENT_START_DATE = "2025-08-13";
const BASE_MIN_RATIO = BASE_MIN / BASE_MAX_START;

/* ==================== 유틸리티 함수 ==================== */

function todayKST() {
    const KST_OFFSET = 9 * 60 * 60 * 1000;
    return new Date(Date.now() + KST_OFFSET).toISOString().slice(0, 10);
}

function loadUserData() {
    if (!FileStream.exists(SAVE_PATH)) return {};
    try {
        return FileStream.readJson(SAVE_PATH) || {};
    } catch (e) {
        Log.e(`${LOG_TAG} Load Error: ${e.message}`);
        return {};
    }
}

function saveUserData(data) {
    try {
        if (!FileStream.exists(SAVE_DIR)) FileStream.createDir(SAVE_DIR);
        FileStream.writeJson(SAVE_PATH, data);
    } catch (e) {
        Log.e(`${LOG_TAG} Save Error: ${e.message}`);
    }
}

const userData = loadUserData();
const FORCE_REROLL_SET = {};

function ensureUser(u) {
    if (!userData[u]) {
        userData[u] = {
            bestSize: 0, bestDate: null, bestType: "", lastDate: null,
            triesToday: 0, brokenDate: null, sizeBias: 0.0, streak: 0,
            bestRodType: null, weeklyRod: null, weeklyRodName: null, lastRodDate: null,
            battleDate: null, battleCountToday: 0,
            comboChargeCount: 0
        };
    }

    const today = todayKST();
    const d = userData[u];

    if (d.lastDate !== today) {
        d.lastDate = today;
        d.triesToday = 0;
        d.brokenDate = null;
        d.battleCountToday = 0;
        d.comboChargeCount = 0;
        d.streak = 0; // 날짜 바뀌면 연속 기록 초기화
    }
}

/* ==================== 게임 로직 ==================== */

function getDynamicBounds() {
    const today = new Date(todayKST());
    const start = new Date(EVENT_START_DATE);
    const diffDays = Math.max(0, Math.floor((today - start) / (1000 * 60 * 60 * 24)));
    const max = BASE_MAX_START + (diffDays * BASE_MAX_DAILY_INC);
    const min = Math.max(1, Math.floor(max * BASE_MIN_RATIO));
    return { min, max };
}

/** @description 매일 새로운 낚싯대를 뽑음 */
function rollDailyRod(user, today) {
    const d = userData[user];
    const prevType = d.weeklyRod;
    let type, name;
    let guard = 0;

    do {
        const r = Math.random() * 100;
        if (r < 20) { type = "safe"; name = "🟩 안정 낚싯대"; }
        else if (r < 40) { type = "lucky"; name = "🟧 행운의 낚싯대"; }
        else if (r < 55) { type = "compressed"; name = "🟦 압축 낚싯대"; }
        else if (r < 70) { type = "combo"; name = "🟪 연속 낚싯대"; }
        else if (r < 80) { type = "berserk"; name = "🟥 광폭 낚싯대"; }
        else if (r < 90) { type = "golden"; name = "🟨 황금 낚싯대"; }
        else { type = "battle"; name = "⚔️ 배틀 낚싯대"; }
        guard++;
    } while (type === prevType && guard < 30);

    d.weeklyRod = type;
    d.weeklyRodName = name;
    d.lastRodDate = today;
    saveUserData(userData);
    return name;
}

function getRodAdjustedParams(user) {
    ensureUser(user);
    const d = userData[user];
    const rod = d.weeklyRod || "none";

    let p = {
        maxTries: BASE_MAX_DAILY_TRIES, successP: BASE_SUCCESS_P,
        breakP: BASE_BREAK_ROD_P, specialP: BASE_SPECIAL_SHARK_P,
        minMul: 1.0, maxMul: 1.0, isComboRod: false, isBattleRod: false
    };

    switch (rod) {
        case "compressed":
            p.maxTries = 1; p.successP = 1.0; p.breakP = 0.0; p.specialP = 0.08;
            break;
        case "lucky":
            p.specialP = 0.20; p.breakP = 0.08;
            break;
        case "safe":
            p.successP = 1.0; p.breakP = 0.025; p.specialP = 0.02;
            break;
        case "golden":
            p.breakP = 0.07;
            break;
        case "berserk":
            p.maxTries = 3; p.minMul = 1.3; p.maxMul = 2.2;
            p.successP = 0.70; p.breakP = 0.12; p.specialP = 0.03;
            break;
        case "combo":
            p.isComboRod = true; p.breakP = 0.0;
            break;
        case "battle":
            p.isBattleRod = true;
            break;
    }
    return p;
}

function attemptShark(user) {
    ensureUser(user);
    const data = userData[user];
    const today = todayKST();
    const params = getRodAdjustedParams(user);
    const messages = [];

    if (params.isBattleRod) {
        if (data.brokenDate === today) return { messages: ["🪝 오늘은 낚싯대가 부러져 배틀을 할 수 없습니다."] };
        if (data.battleCountToday >= 2) return { messages: ["⚔️ 오늘 배틀 횟수(2회)를 모두 소모했습니다."] };
        const bres = resolveBattle(user);
        data.battleCountToday++;
        saveUserData(userData);
        return bres;
    }

    if (data.brokenDate === today) return "🪝 낚싯대가 부러져 시도할 수 없습니다.";

    // 연속 낚싯대용 남은 횟수 체크 (성공 시 횟수 차감 안 함)
    if (!params.isComboRod && data.triesToday >= params.maxTries) {
        return `🪝 오늘 남은 시도 없음 (최대 ${params.maxTries}회).`;
    } else if (params.isComboRod && data.triesToday >= 1) {
        // 연속 낚싯대는 한 번이라도 실패했거나 완료했으면 triesToday가 1 이상이 됨
        return `🪝 연속 낚시가 이미 종료되었습니다.`;
    }

    // 파손 체크
    if (Math.random() < params.breakP) {
        data.brokenDate = today;
        data.triesToday = params.maxTries; // 파손 시 오늘 종료
        saveUserData(userData);
        return { messages: ["💥 상어가 너무 힘이 세서 낚싯대가 부러졌습니다!"] };
    }

    // 성공 확률 결정
    let effSuccessP = params.successP;
    if (params.isComboRod) {
        const c = data.streak + 1;
        effSuccessP = c <= 5 ? 0.95 : c <= 8 ? 0.7 : 0.4;
    }

    const success = Math.random() < effSuccessP;

    // 일반 낚싯대는 시도 시 무조건 횟수 증가, 연속 낚싯대는 실패할 때만 증가시켜 종료 유도
    if (!params.isComboRod) {
        data.triesToday++;
    } else if (!success) {
        data.triesToday = 1; // 연속 종료 플래그
    }

    if (!success) {
        data.streak = 0;
        saveUserData(userData);
        const remain = params.isComboRod ? "연속 종료" : `남은 시도: ${params.maxTries - data.triesToday}`;
        return { messages: [`❌ 실패! (${remain})`] };
    }

    // 성공 처리
    data.streak++;
    const bounds = getDynamicBounds();
    let dayMin = Math.floor(bounds.min * params.minMul);
    let dayMax = Math.floor(bounds.max * params.maxMul);

    let kind = Math.random() < params.specialP ? "전설" : "일반";
    let base = Math.round((dayMin + (dayMax - dayMin) * Math.pow(Math.random(), 2.0 - data.sizeBias)));

    if (kind === "전설") base *= (2.0 + Math.random());
    const size = Math.round(base);

    if (size > (data.bestSize || 0)) {
        data.bestSize = size;
        data.bestDate = today;
        data.bestType = kind;
        data.bestRodType = data.weeklyRod;
        messages.push("📈 개인 최고 기록 갱신!");
    }

    let statusMsg = params.isComboRod ? `🔥 연속 성공 중: ${data.streak}` : `남은 시도: ${params.maxTries - data.triesToday}`;

    // 연속 낚싯대 10회 도달 시 자동 방출/종료
    if (params.isComboRod && data.streak >= 10) {
        data.triesToday = 1;
        statusMsg = "🎊 연속 낚시 최대치(10회) 달성! 오늘 낚시를 종료합니다.";
    }

    messages.push(`${kind === "전설" ? "⭐ 전설 상어!" : "✅ 성공!"} ${size}cm\n${statusMsg}`);

    saveUserData(userData);
    return { messages };
}

/* ==================== 배틀 로직 ==================== */

function resolveBattle(user) {
    const keys = Object.keys(userData).filter(k => k !== user && userData[k].bestSize > 0);
    if (keys.length === 0) return { messages: ["⚔️ 배틀 상대가 없어 낚시만 진행합니다."] };

    const oppName = keys[Math.floor(Math.random() * keys.length)];
    const oppData = userData[oppName];
    const data = userData[user];
    const winP = data.bestSize > oppData.bestSize ? 0.6 : 0.4;

    if (Math.random() > winP) {
        data.brokenDate = todayKST();
        return { messages: [`💀 배틀 패배... ${oppName}에게 패배했습니다. (낚싯대 파손)`] };
    }

    const stolenSize = Math.round(oppData.bestSize * (0.8 + Math.random() * 0.4));
    let updateMsg = "";
    if (stolenSize > (data.bestSize || 0)) {
        data.bestSize = stolenSize;
        data.bestDate = todayKST();
        data.bestType = "배틀";
        updateMsg = " 📈 (기록 갱신!)";
    }

    return { messages: [`⚔️ 배틀 승리! ${oppName}의 흔적을 쫓아 더 큰 상어를 발견했습니다.\n획득 상어: ${stolenSize}cm${updateMsg}`] };
}

/* ==================== 명령어 핸들러 ==================== */

bot.addListener(Event.COMMAND, (cmd) => {
    if (!ALLOWED_ROOMS.includes(cmd.room)) return;

    const user = cmd.author.name;
    const arg = cmd.args[0];

    try {
        switch (cmd.command) {
            case "낚시":
            case "ㄴㅅ":
                ensureUser(user);
                const today = todayKST();

                // 매일 첫 낚시 시 낚싯대 새로 뽑기
                if (!userData[user].weeklyRod || userData[user].lastRodDate !== today || FORCE_REROLL_SET[user]) {
                    const forced = !!FORCE_REROLL_SET[user];
                    delete FORCE_REROLL_SET[user];
                    const rodName = rollDailyRod(user, today);
                    cmd.reply(`🎣 오늘 사용할 낚싯대를 뽑았습니다!\n→ ${rodName}\n(한 번 더 입력하면 낚시를 시작합니다.)`);
                    return;
                }

                const result = attemptShark(user);
                if (typeof result === "string") cmd.reply(result);
                else result.messages.forEach(m => cmd.reply(m));
                break;

            case "낚시정보":
                ensureUser(user);
                const d = userData[user];
                const p = getRodAdjustedParams(user);
                const remain = p.isComboRod ? (d.triesToday > 0 ? "종료" : "진행 가능") : `${p.maxTries - d.triesToday}/${p.maxTries}`;
                cmd.reply(`📊 상어 이벤트 정보\n오늘의 낚싯대: ${d.weeklyRodName || "미지정"}\n최대 기록: ${d.bestSize}cm (${d.bestType || "-"})\n오늘 남은 횟수: ${remain}\n연속 성공: ${d.streak}`);
                break;

            case "ㄹㅋ":
            case "랭킹":
                const rank = Object.keys(userData)
                    .map(u => ({ name: u, size: userData[u].bestSize || 0, type: userData[u].bestType }))
                    .filter(r => r.size > 0) // 기록이 0인 사람 제외
                    .sort((a, b) => b.size - a.size);

                cmd.reply(`🏆 상어 전체 랭킹\n${rank.map((r, i) => `${i + 1}. ${r.name}: ${r.size}cm (${r.type || "-"})`).join("\n")}`);
                break;

            case "ㄴㅅㄷ리롤":
                if (user !== ADMIN_NAME) return;
                if (!arg) return cmd.reply(".ㄴㅅㄷ리롤 [닉네임]");
                FORCE_REROLL_SET[arg] = true;
                cmd.reply(`✅ ${arg} 님의 낚싯대가 다음 시도 시 재설정됩니다.`);
                break;

            case "ㄴㅅㅊㄱㅎ":
                if (user !== ADMIN_NAME) return;
                if (!arg) return cmd.reply(".ㄴㅅㅊㄱㅎ [닉네임]");
                ensureUser(arg);
                userData[arg].triesToday = 0;
                userData[arg].brokenDate = null;
                saveUserData(userData);
                cmd.reply(`✅ ${arg} 님의 오늘 상태가 초기화되었습니다.`);
                break;
        }
    } catch (e) {
        Log.e(`${LOG_TAG} Error: ${e.message}\n${e.stack}`);
        cmd.reply("⚠️ 시스템 오류가 발생했습니다.");
    }
});