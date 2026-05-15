/**
 * @description 서윤봇 (Sybot) 주사위 게임 v5
 * - 포인트 상점 추가 (추첨권, 프리미엄추첨권, 주사위추가, 올인보험, 복권, 슬롯머신)
 * - 칭호 시스템 추가
 * - 올인 밸런스 조정: 1~25 전부 손실 / 26~75 x1.5 / 76~100 x2
 * @environment MessengerBotR v0.7.41-alpha (GraalJS)
 *
 * [명령어]
 * .출석          - 일일 지원금 2,000P + 랜덤 보너스
 * .지갑 / .포인트 - 내 정보 및 잔액 확인
 * .주사위 <금액>  - 조합형 게임 (일일 5회)
 * .올인           - D100 도박 (하루 1회)
 * .랭킹           - 전체 랭킹
 * .보내기 <닉/순위> <금액>
 * .상점           - 포인트 상점 목록
 * .구매 <아이템명> - 아이템 구매 및 즉시 사용
 * .칭호           - 내 보유 칭호 확인
 * .칭호 전체      - 전체 칭호 목록 (획득 조건 포함)
 * .칭호장착 <번호> - 칭호 장착
 *
 * [관리자]
 * .지급 / .주사위추가 / .주사위초기화 / .올인초기화
 */

/* ==================== 전역 상수 ==================== */

const bot = BotManager.getCurrentBot();
const CONFIG_PATH = "/sdcard/Sybot/config.json";
const File = Java.type("java.io.File");

const DICE_DEFAULT_CONFIG = { ADMIN_HASH: "no_HASH" };
let config = {};

const ALLOWED_ROOMS = ["아크라시아인의 휴식처"];
const PREFIX = ".";
const DATA_DIR = "/sdcard/Sybot/DiceGame";
const DATA_PATH = `${DATA_DIR}/user_data.json`;

/* ==================== 상점 아이템 정의 ==================== */
// 가격은 제안가의 10배

const SHOP_ITEMS = {
    "추첨권": {
        name: "🎟️ 추첨권",
        desc: "1배~10배 무작위 추첨 (평균 5.5배)",
        price: 15000
    },
    "프리미엄추첨권": {
        name: "💎 프리미엄 추첨권",
        desc: "2배~15배 추첨, 꽝 없음",
        price: 50000
    },
    "주사위추가": {
        name: "🎲 주사위 추가 1회",
        desc: "오늘 주사위 횟수 1회 추가",
        price: 3000
    },
    "올인보험": {
        name: "🛡️ 올인 보험",
        desc: "다음 올인 실패 시 손실액의 50% 환급 (1회용)",
        price: 30000
    },
    "복권": {
        name: "🎫 복권",
        desc: "1~50,000P 랜덤 지급",
        price: 20000
    },
    "슬롯머신": {
        name: "🎰 슬롯머신",
        desc: "3칸 슬롯 | 777=x20 / 💎=x10 / 트리플=x5 / 더블=x2",
        price: 10000
    }
};

/* ==================== 칭호 정의 ==================== */

const TITLES = [
    {
        id: "초보_도박사",
        name: "🃏 초보 도박사",
        desc: "총 플레이 50회 달성"
    },
    {
        id: "도박_중독자",
        name: "🎰 도박 중독자",
        desc: "총 플레이 300회 달성"
    },
    {
        id: "잭팟_장인",
        name: "🔥 잭팟 장인",
        desc: "주사위 트리플 30번 달성"
    },
    {
        id: "파산_전문가",
        name: "💀 파산 전문가",
        desc: "올인 누적 실패 10번 (3연속 기사회생 포함)"
    },
    {
        id: "졸부",
        name: "💸 졸부",
        desc: "단 한 번에 100,000P 이상 순이익"
    },
    {
        id: "천운",
        name: "🌟 천운",
        desc: "올인에서 정확히 100을 굴려 크리티컬 성공"
    },
    {
        id: "포인트_제왕",
        name: "👑 포인트 제왕",
        desc: "한 번이라도 500,000P 보유"
    },
    {
        id: "전설의_도박사",
        name: "🏆 전설의 도박사",
        desc: "총 플레이 1,000회 + 최대 보유 포인트 1,000,000P",
    }
];

function checkTitle(id, user) {
    switch (id) {
        case "초보_도박사": return (user.playCount || 0) >= 50;
        case "도박_중독자": return (user.playCount || 0) >= 300;
        case "잭팟_장인": return (user.tripleCount || 0) >= 30;
        case "파산_전문가": return (user.totalCritFails || 0) >= 10;
        case "졸부": return (user.bestSingleGain || 0) >= 100000;
        case "천운": return (user.critSuccessCount || 0) >= 1;
        case "포인트_제왕": return (user.maxPoints || 0) >= 500000;
        case "전설의_도박사": return (user.playCount || 0) >= 1000 && (user.maxPoints || 0) >= 1000000;
        default: return false;
    }
}

/* ==================== 파일 I/O ==================== */

function initFileSystem() {
    const dir = new File(DATA_DIR);
    if (!dir.exists()) dir.mkdirs();
    if (!FileStream.exists(DATA_PATH)) safeWriteJson(DATA_PATH, {});
}

function loadUserData() {
    try {
        initFileSystem();
        return safeReadJson(DATA_PATH) || {};
    } catch (e) {
        Log.e(`데이터 로드 실패: ${e.message}`);
        return {};
    }
}

function saveUserData(data) {
    try {
        safeWriteJson(DATA_PATH, data);
    } catch (e) {
        Log.e(`데이터 저장 실패: ${e.message}`);
    }
}

function safeReadJson(path) {
    try {
        if (!FileStream.exists(path)) return null;
        const raw = FileStream.read(path);
        if (!raw || raw.trim() === "") return null;
        return JSON.parse(String(raw));
    } catch (e) {
        Log.e(`[safeReadJson] 읽기 실패 (${path}): ${e.message}`);
        return null;
    }
}

function safeWriteJson(path, data) {
    try {
        FileStream.write(path, JSON.stringify(data, null, 2));
    } catch (e) {
        Log.e(`[safeWriteJson] 저장 실패 (${path}): ${e.message}`);
    }
}

function loadConfig(filePath, defaultData) {
    try {
        let loadedData = safeReadJson(filePath);
        if (!loadedData) {
            safeWriteJson(filePath, defaultData);
            return defaultData;
        }
        let isUpdated = false;
        for (let key in defaultData) {
            if (loadedData[key] === undefined) {
                loadedData[key] = defaultData[key];
                isUpdated = true;
            }
        }
        if (isUpdated) safeWriteJson(filePath, loadedData);
        return loadedData;
    } catch (e) {
        Log.e(`[loadConfig] 오류: ${e.message}`);
        return defaultData;
    }
}

function init() {
    initFileSystem();
    config = loadConfig(CONFIG_PATH, DICE_DEFAULT_CONFIG);
}

/* ==================== 유틸리티 ==================== */

const rollD6 = () => Math.floor(Math.random() * 6) + 1;
const rollD100 = () => Math.floor(Math.random() * 100) + 1;

function isToday(timestamp) {
    if (!timestamp) return false;
    const now = new Date();
    const target = new Date(timestamp);
    return now.getFullYear() === target.getFullYear() &&
        now.getMonth() === target.getMonth() &&
        now.getDate() === target.getDate();
}

function getTimeUntilMidnight() {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const ms = tomorrow.getTime() - now.getTime();
    const h = Math.floor(ms / (1000 * 60 * 60));
    const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((ms % (1000 * 60)) / 1000);
    return `${h}시간 ${m}분 ${s}초`;
}

function resolveTargetUser(db, targetStr) {
    if (/^[0-9]+$/.test(targetStr)) {
        const rank = parseInt(targetStr, 10);
        const ranking = Object.keys(db)
            .map(h => ({ hash: h, pts: db[h].points }))
            .sort((a, b) => b.pts - a.pts);
        if (rank >= 1 && rank <= ranking.length) {
            return { hash: ranking[rank - 1].hash, error: null };
        }
    }
    let exactHash = Object.keys(db).find(k => db[k].name === targetStr);
    if (exactHash) return { hash: exactHash, error: null };
    let partial = Object.keys(db).filter(k => db[k].name.includes(targetStr));
    if (partial.length === 1) return { hash: partial[0], error: null };
    if (partial.length > 1) {
        const names = partial.map(h => db[h].name).join(", ");
        return { hash: null, error: `[⚠️ 대상 중복] '${targetStr}'가 포함된 유저가 여러 명입니다.\n(${names})` };
    }
    return { hash: null, error: `[❌ 대상 없음] '${targetStr}'을(를) 찾을 수 없습니다.` };
}

/* ==================== 유저 데이터 초기화/보완 ==================== */

function ensureUserFields(u, name) {
    u.name = name;
    if (u.lastDice === undefined) u.lastDice = 0;
    if (u.diceCountToday === undefined) u.diceCountToday = 0;
    if (u.lastAllIn === undefined) u.lastAllIn = 0;
    if (u.allInCritFails === undefined) u.allInCritFails = 0;  // 연속 실패 (기사회생용)
    if (u.totalCritFails === undefined) u.totalCritFails = 0;  // 누적 실패 (칭호용)
    if (u.tripleCount === undefined) u.tripleCount = 0;
    if (u.critSuccessCount === undefined) u.critSuccessCount = 0;
    if (u.bestSingleGain === undefined) u.bestSingleGain = 0;
    if (u.maxPoints === undefined) u.maxPoints = u.points || 0;
    if (u.insurance === undefined) u.insurance = false;
    if (u.earnedTitles === undefined) u.earnedTitles = [];
    if (u.activeTitle === undefined) u.activeTitle = "";
    if (u.shopHistory === undefined) u.shopHistory = {};
}

/* ==================== 칭호 체크 & 부여 ==================== */

function checkAndGrantTitles(user, replyFn) {
    const newTitles = [];
    for (const t of TITLES) {
        if (!user.earnedTitles.includes(t.id) && checkTitle(t.id, user)) {
            user.earnedTitles.push(t.id);
            newTitles.push(t.name);
        }
    }
    if (newTitles.length > 0) {
        replyFn(`🎖️ 새 칭호 획득!\n${newTitles.join("\n")}\n\n'.칭호장착 <번호>'로 장착하세요.`);
    }
}

/* ==================== 슬롯머신 로직 ==================== */

function runSlotMachine() {
    const SYMBOLS = ["🍒", "🍋", "🍊", "⭐", "💎", "7️⃣"];
    const s = [
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
    ];

    let mult = 0;
    let desc = "";

    if (s[0] === s[1] && s[1] === s[2]) {
        if (s[0] === "7️⃣") { mult = 20; desc = "🎊 JACKPOT! 7️⃣7️⃣7️⃣!!!"; }
        else if (s[0] === "💎") { mult = 10; desc = "💎 다이아 트리플!"; }
        else { mult = 5; desc = "🔥 트리플!"; }
    } else if (s[0] === s[1] || s[1] === s[2] || s[0] === s[2]) {
        mult = 2;
        desc = "✨ 더블!";
    } else {
        mult = 0;
        desc = "💥 꽝...";
    }

    return { s, mult, desc };
}

/* ==================== 메인 핸들러 ==================== */

function onMessage(msg) {
    if (!ALLOWED_ROOMS.includes(msg.room)) return;
    if (!msg.content.startsWith(PREFIX)) return;

    const reply = (text) => msg.reply(`[beta]\n${text}`);

    const args = msg.content.trim().substring(PREFIX.length).trim().split(/\s+/);
    let cmd = args[0];

    // 주사위추가 충돌 방지: 인자가 없으면 상점 구매로 처리
    if (cmd === "주사위추가" && args.length === 1) {
        cmd = "상점_주사위추가";
    }

    const commandsList = [
        "출석", "포인트", "지갑", "주사위", "올인", "랭킹",
        "보내기", "지급", "주사위추가", "주사위초기화", "올인초기화",
        "상점", "구매", "칭호", "장착",
        "추첨권", "프리미엄추첨권", "상점_주사위추가", "올인보험", "복권", "슬롯머신"
    ];

    if (!commandsList.includes(cmd)) return;

    const db = loadUserData();
    const hash = msg.author.hash;
    const name = msg.author.name;

    if (!db[hash]) {
        db[hash] = {
            name, points: 1000, lastDaily: 0, playCount: 0
        };
    }
    ensureUserFields(db[hash], name);

    const user = db[hash];
    const now = Date.now();

    const updateMaxPoints = () => {
        if (user.points > user.maxPoints) user.maxPoints = user.points;
    };

    try {
        switch (cmd) {

            /* ============ 상점 ============ */
            case "상점": {
                let out = "🏪 포인트 상점\n━━━━━━━━━━━━━━\n";
                const keys = Object.keys(SHOP_ITEMS);
                keys.forEach((key, idx) => {
                    const item = SHOP_ITEMS[key];
                    out += `${idx + 1}. ${item.name} (${item.price.toLocaleString()}P)\n  ${item.desc}\n\n`;
                });
                out += "구매: .구매 <번호> 또는 .<아이템명>\n예) .구매 1 / .추첨권";
                reply(out.trim());
                break;
            }

            /* ============ 구매 및 아이템 즉시 사용 ============ */
            case "구매":
            case "추첨권":
            case "프리미엄추첨권":
            case "상점_주사위추가":
            case "올인보험":
            case "복권":
            case "슬롯머신": {
                let rawItem = "";
                const keys = Object.keys(SHOP_ITEMS);

                if (cmd === "구매") {
                    const idx = parseInt(args[1], 10) - 1;
                    if (isNaN(idx) || idx < 0 || idx >= keys.length) {
                        reply(`[❌ 없는 아이템 번호]\n사용 가능 번호: 1~${keys.length}\n예) .구매 1`);
                        return;
                    }
                    rawItem = keys[idx];
                } else {
                    // cmd가 "상점_주사위추가"인 경우 원래 이름으로 복구
                    rawItem = cmd === "상점_주사위추가" ? "주사위추가" : cmd;
                }

                const item = SHOP_ITEMS[rawItem];

                if (isToday(user.shopHistory[rawItem])) {
                    reply(`[⏳ 구매 제한]\n'${item.name}'은(는) 하루 1회만 구매 가능합니다.\n자정까지: ${getTimeUntilMidnight()}`);
                    return;
                }

                if (user.points < item.price) {
                    reply(`[💸 포인트 부족]\n필요: ${item.price.toLocaleString()}P\n보유: ${user.points.toLocaleString()}P`);
                    return;
                }

                user.points -= item.price;

                if (rawItem === "추첨권") {
                    const pool = [
                        1, 1, 1, 1, 1, 1, 1, // 1배: 35%
                        2, 2, 2, 2, 2,       // 2배: 25%
                        3, 3, 3,             // 3배: 15%
                        4, 4,                // 4배: 10%
                        5, 6, 7, 8, 9, 10    // 5~10배: 각 2.5% (총 15%)
                    ];
                    const mult = pool[Math.floor(Math.random() * pool.length)];

                    const gain = item.price * mult;
                    user.points += gain;
                    updateMaxPoints();
                    const net = gain - item.price;
                    if (net > user.bestSingleGain) user.bestSingleGain = net;
                    reply(`🎟️ 추첨 결과: ${mult}배!\n+${gain.toLocaleString()}P 획득 (순이익 ${net >= 0 ? "+" : ""}${net.toLocaleString()}P)\n잔액: ${user.points.toLocaleString()}P`);
                }
                else if (rawItem === "프리미엄추첨권") {
                    let mult = 0;
                    const rand = Math.random();

                    if (rand < 0.90) {
                        // 90% 확률: 2배 ~ 5배 중 랜덤
                        mult = Math.floor(Math.random() * 4) + 2;
                    } else {
                        // 10% 확률: 6배 ~ 15배 중 랜덤
                        mult = Math.floor(Math.random() * 10) + 6;
                    }

                    const gain = item.price * mult;
                    user.points += gain;
                    updateMaxPoints();
                    const net = gain - item.price;
                    if (net > user.bestSingleGain) user.bestSingleGain = net;
                    reply(`💎 프리미엄 추첨: ${mult}배!\n+${gain.toLocaleString()}P 획득 (순이익 +${net.toLocaleString()}P)\n잔액: ${user.points.toLocaleString()}P`);
                }
                else if (rawItem === "주사위추가") {
                    if (!isToday(user.lastDice)) user.diceCountToday = 0;
                    user.diceCountToday = Math.max(0, user.diceCountToday - 1);
                    user.lastDice = now;
                    reply(`🎲 주사위 기회 1회 추가!\n잔액: ${user.points.toLocaleString()}P`);
                }
                else if (rawItem === "올인보험") {
                    if (user.insurance) {
                        user.points += item.price; // 환불
                        reply(`[⚠️] 이미 올인 보험이 적용되어 있습니다. 구매가 취소되었습니다.`);
                        return;
                    }
                    user.insurance = true;
                    reply(`🛡️ 올인 보험 적용!\n다음 올인 실패 시 손실액의 50%를 돌려받습니다.\n잔액: ${user.points.toLocaleString()}P`);
                }
                else if (rawItem === "복권") {
                    const prize = Math.floor(Math.random() * 50000) + 1;
                    user.points += prize;
                    updateMaxPoints();
                    const net = prize - item.price;
                    reply(`🎫 복권 결과: ${prize.toLocaleString()}P 당첨! (${net >= 0 ? "+" : ""}${net.toLocaleString()}P)\n잔액: ${user.points.toLocaleString()}P`);
                }
                else if (rawItem === "슬롯머신") {
                    const result = runSlotMachine();
                    const gain = Math.floor(item.price * result.mult);
                    user.points += gain;
                    updateMaxPoints();
                    const net = gain - item.price;
                    const netStr = (net >= 0 ? "+" : "") + net.toLocaleString() + "P";
                    reply(`🎰 슬롯머신\n[ ${result.s.join(" | ")} ]\n${result.desc} (x${result.mult})\n${netStr}\n잔액: ${user.points.toLocaleString()}P`);
                }

                user.shopHistory[rawItem] = now;
                checkAndGrantTitles(user, reply);
                break;
            }

            /* ============ 칭호 ============ */
            case "칭호": {
                if (args[1] === "전체") {
                    let out = "🎖️ 전체 칭호 목록\n━━━━━━━━━━━━━━\n";
                    TITLES.forEach((t) => {
                        const owned = user.earnedTitles.includes(t.id) ? "✅" : "⬜";
                        out += `${owned} ${t.name}\n   ${t.desc}\n\n`;
                    });
                    out += "장착: .장착 <번호>";
                    reply(out.trim());
                } else {
                    if (user.earnedTitles.length === 0) {
                        reply(`[🎖️ ${name}님의 칭호]\n아직 획득한 칭호가 없습니다.\n\n전체 목록: .칭호 전체`);
                        return;
                    }
                    const earned = TITLES.filter(t => user.earnedTitles.includes(t.id));
                    let out = `[🎖️ ${name}님의 보유 칭호]\n활성 칭호: ${user.activeTitle || "없음"}\n━━━━━━━━━━━━━━\n`;
                    earned.forEach((t, i) => {
                        out += `${i + 1}. ${t.name}\n`;
                    });
                    out += "\n장착: .장착 <번호>\n전체 목록: .칭호 전체";
                    reply(out);
                }
                break;
            }

            /* ============ 칭호 장착 ============ */
            case "장착": {
                if (!args[1]) {
                    reply(`[⚠️] 사용법: .장착 <번호>\n내 칭호 목록: .칭호`);
                    return;
                }
                const idx = parseInt(args[1], 10) - 1;
                const earned = TITLES.filter(t => user.earnedTitles.includes(t.id));
                if (isNaN(idx) || idx < 0 || idx >= earned.length) {
                    reply(`[❌] 잘못된 번호입니다. .칭호 로 목록을 확인하세요.`);
                    return;
                }
                user.activeTitle = earned[idx].name;
                reply(`✅ [${user.activeTitle}] 칭호 장착 완료!`);
                break;
            }

            /* ============ 출석 ============ */
            case "출석": {
                if (!isToday(user.lastDaily)) {
                    const bonus = Math.floor(Math.random() * 901) + 100;
                    const total = 2000 + bonus;
                    user.points += total;
                    user.lastDaily = now;
                    updateMaxPoints();
                    checkAndGrantTitles(user, reply);
                    reply(`[💰 출석 완료]\n기본 2,000P + 보너스 ${bonus.toLocaleString()}P!\n잔액: ${user.points.toLocaleString()}P`);
                } else {
                    reply(`[⏳ 출석 대기]\n오늘 이미 출석하셨습니다.\n자정까지: ${getTimeUntilMidnight()}`);
                }
                break;
            }

            /* ============ 지갑 ============ */
            case "포인트":
            case "지갑": {
                const titleLine = user.activeTitle ? `\n칭호: ${user.activeTitle}` : "";
                reply(
                    `[🏦 ${name}님의 지갑]${titleLine}\n` +
                    `보유: ${user.points.toLocaleString()}P\n` +
                    `최고 기록: ${(user.maxPoints || 0).toLocaleString()}P\n` +
                    `누적 플레이: ${user.playCount}회\n` +
                    `올인 연속 실패: ${user.allInCritFails}/3회\n` +
                    `올인 보험: ${user.insurance ? "✅ 적용 중" : "❌ 없음"}`
                );
                break;
            }

            /* ============ 주사위 ============ */
            case "주사위": {
                if (!isToday(user.lastDice)) user.diceCountToday = 0;

                if (user.diceCountToday >= 5) {
                    reply(`[⏳ 주사위 쿨타임]\n하루 5번 제한\n자정까지: ${getTimeUntilMidnight()}`);
                    return;
                }

                const bet = parseInt(args[1]);
                if (isNaN(bet) || bet <= 0) {
                    reply(`[⚠️ 사용법] .주사위 <금액>`);
                    return;
                }
                if (user.points < bet) {
                    reply(`[💸 잔액 부족] 보유: ${user.points.toLocaleString()}P`);
                    return;
                }

                user.points -= bet;
                user.playCount++;
                user.diceCountToday++;
                user.lastDice = now;

                const d = [rollD6(), rollD6(), rollD6()];
                const sum = d[0] + d[1] + d[2];
                const sorted = d.slice().sort((a, b) => a - b);
                let mult = 0, desc = "";

                if (d[0] === d[1] && d[1] === d[2]) {
                    mult = 5; desc = "🔥 [트리플!] 잭팟!";
                    user.tripleCount++;
                } else if (sorted[0] + 1 === sorted[1] && sorted[1] + 1 === sorted[2]) {
                    mult = 3; desc = "✨ [스트레이트!]";
                } else if (d[0] === d[1] || d[1] === d[2] || d[0] === d[2]) {
                    mult = 1.5; desc = "🎲 [더블!]";
                } else if (sum >= 14) {
                    mult = 1; desc = "👍 [하이 롤!]";
                } else {
                    mult = 0.2; desc = "💥 [꽝] (20% 환급)";
                }

                const win = Math.floor(bet * mult);
                user.points += win;
                updateMaxPoints();

                const resultText = mult >= 1
                    ? `+${win.toLocaleString()}P`
                    : `-${(bet - win).toLocaleString()}P`;

                checkAndGrantTitles(user, reply);
                reply(
                    `[🎲 ${d.join(", ")}]\n${desc}\n${resultText}\n` +
                    `잔액: ${user.points.toLocaleString()}P (오늘 ${user.diceCountToday}/5회)`
                );
                break;
            }

            /* ============ 올인 (밸런스 조정) ============ */
            case "올인": {
                if (isToday(user.lastAllIn)) {
                    reply(`[⏳ 올인 쿨타임]\n하루 1회 제한\n자정까지: ${getTimeUntilMidnight()}`);
                    return;
                }
                if (user.points <= 0) {
                    reply(`[💸 파산] 올인할 포인트가 없습니다.`);
                    return;
                }

                const amount = user.points;
                user.points -= amount;
                user.playCount++;
                user.lastAllIn = now;

                const luck = rollD100();
                let gain = 0;
                let status = "";

                /* ★ 변경된 올인 확률
                 *  1~25  (25%) : 전부 손실
                 * 26~75  (50%) : x1.5 이득
                 * 76~100 (25%) : x2   이득
                 */
                if (luck <= 25) {
                    gain = 0;
                    status = "📉 [실패] 배팅액을 전부 잃었습니다...";
                    user.allInCritFails++;
                    user.totalCritFails++;

                    // 보험 처리 (기사회생보다 먼저 체크)
                    if (user.insurance) {
                        const refund = Math.floor(amount * 0.5);
                        gain += refund;
                        status += `\n🛡️ 올인 보험 발동! +${refund.toLocaleString()}P 환급`;
                        user.insurance = false;
                    }

                    // 기사회생 (3연속 실패 → 보험보다 우선 적용, gain 덮어쓰기)
                    if (user.allInCritFails >= 3) {
                        gain = amount * 2;
                        user.allInCritFails = 0;
                        user.insurance = false; // 보험 소모
                        status = `👼 [기사회생] 3연속 실패! 배팅액의 2배 환급!`;
                    }

                    // 파산 구제금 (gain이 여전히 0인 경우)
                    if (gain === 0) {
                        const isJackpot = Math.random() < 0.05;
                        let relief = 0;
                        if (isJackpot) {
                            relief = Math.floor(Math.random() * 40001) + 10000;
                            status += `\n\n🍀 [기적의 동아줄!] 지나가던 거부가 ${relief.toLocaleString()}P 적선!`;
                        } else {
                            relief = Math.floor(Math.random() * 901) + 100;
                            status += `\n\n🪙 [파산 구제금] 길바닥에서 ${relief.toLocaleString()}P 발견...`;
                        }
                        gain += relief;
                    }

                } else if (luck <= 75) {
                    gain = Math.floor(amount * 1.5);
                    status = `🎉 [성공] 1.5배 획득!`;
                    user.allInCritFails = 0;

                } else {
                    gain = amount * 2;
                    status = `🌟 [대성공] 2배 획득!`;
                    user.allInCritFails = 0;

                    // 100은 여전히 특별 연출
                    if (luck === 100) {
                        user.critSuccessCount++;
                        status = `🌟⭐ [크리티컬 성공!! 100!!] 2배 획득!`;
                    }
                }

                // 순이익 최고치 갱신
                const netGain = gain - amount;
                if (netGain > user.bestSingleGain) user.bestSingleGain = netGain;

                user.points += gain;
                updateMaxPoints();
                checkAndGrantTitles(user, reply);

                reply(
                    `[⚠️ ALL-IN: ${luck}]\n` +
                    `배팅: ${amount.toLocaleString()}P\n${status}\n잔액: ${user.points.toLocaleString()}P`
                );
                break;
            }

            /* ============ 랭킹 ============ */
            case "랭킹": {
                const ranking = Object.keys(db)
                    .map(h => ({
                        hash: h,
                        name: db[h].name,
                        pts: db[h].points,
                        title: db[h].activeTitle || ""
                    }))
                    .sort((a, b) => b.pts - a.pts);

                let view = "🏆 다이스 게임 랭킹\n\n";
                ranking.forEach((u, i) => {
                    const icon = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `[${i + 1}]`;

                    if (u.title) {
                        // 칭호가 있는 유저: 닉네임 후 줄바꿈 -> 약간의 들여쓰기 -> [칭호] 포인트
                        view += `${icon} ${u.name}\n   └ ${u.title} | ${u.pts.toLocaleString()}P\n`;
                    } else {
                        // 칭호가 없는 유저: 기존처럼 한 줄에 표시
                        view += `${icon} ${u.name}: ${u.pts.toLocaleString()}P\n`;
                    }
                });

                const myIdx = ranking.findIndex(u => u.hash === hash);
                view += `\n> 내 순위: ${myIdx + 1}위 / ${ranking.length}명`;
                reply(view);
                break;
            }

            /* ============ 관리자 명령어 ============ */
            case "보내기":
            case "지급":
            case "주사위추가":
            case "주사위초기화":
            case "올인초기화": {
                const isAdminCmd = ["지급", "주사위추가", "주사위초기화", "올인초기화"].includes(cmd);
                if (isAdminCmd && config.ADMIN_HASH !== hash) {
                    reply(`[🚫 권한 없음] 관리자만 사용 가능합니다.`);
                    return;
                }

                const contentStr = msg.content.substring(PREFIX.length).trim();
                const match = contentStr.match(
                    /^(보내기|지급|주사위추가|주사위초기화|올인초기화)\s+(?:"([^"]+)"|(\S+))(?:\s+(-?\d+))?$/
                );
                if (!match) {
                    if (cmd === "보내기")
                        reply(`[⚠️ 사용법] .보내기 <닉네임/순위> <금액>\n* 닉네임에 띄어쓰기가 있으면 "홍 길동"으로 감싸주세요.`);
                    else
                        reply(`[⚠️ 사용법]\n.지급 <닉/순위> <금액>\n.주사위추가 <닉/순위> <횟수>\n.주사위초기화 <닉/순위>\n.올인초기화 <닉/순위>`);
                    return;
                }

                const exactCmd = match[1];
                const targetStr = match[2] || match[3];
                const numValue = match[4] ? parseInt(match[4], 10) : NaN;
                const targetResult = resolveTargetUser(db, targetStr);
                if (targetResult.error) { reply(targetResult.error); return; }

                const targetUser = db[targetResult.hash];

                switch (exactCmd) {
                    case "보내기": {
                        if (isNaN(numValue) || numValue <= 0) { reply(`[⚠️] 금액을 1P 이상 입력해주세요.`); return; }
                        if (targetResult.hash === hash) { reply(`[⚠️] 자기 자신에게는 송금할 수 없습니다.`); return; }
                        if (user.points < numValue) { reply(`[💸 잔액 부족] 보유: ${user.points.toLocaleString()}P`); return; }

                        const fee = Math.floor(numValue * 0.05); // 수수료 5% 계산
                        const sendAmount = numValue - fee;       // 실제 보낼 금액

                        user.points -= numValue;
                        targetUser.points += sendAmount;

                        reply(`[💸 송금 완료]\n${name} → ${targetUser.name}: ${sendAmount.toLocaleString()}P (수수료 ${fee.toLocaleString()}P 차감)\n(내 잔액: ${user.points.toLocaleString()}P)`);
                        break;
                    }
                    case "지급":
                        if (isNaN(numValue)) { reply(`[⚠️] 금액을 입력해주세요.`); return; }
                        targetUser.points += numValue;
                        reply(`[✅ 지급] ${targetUser.name}에게 ${numValue.toLocaleString()}P\n(대상 잔액: ${targetUser.points.toLocaleString()}P)`);
                        break;
                    case "주사위추가":
                        if (isNaN(numValue) || numValue <= 0) { reply(`[⚠️] 횟수를 입력해주세요.`); return; }
                        if (!isToday(targetUser.lastDice)) targetUser.diceCountToday = 0;
                        targetUser.diceCountToday = Math.max(0, targetUser.diceCountToday - numValue);
                        targetUser.lastDice = now;
                        reply(`[✅] ${targetUser.name}의 주사위 기회 ${numValue}회 추가`);
                        break;
                    case "주사위초기화":
                        targetUser.diceCountToday = 0;
                        targetUser.lastDice = now;
                        reply(`[✅] ${targetUser.name}의 오늘 주사위 횟수 초기화`);
                        break;
                    case "올인초기화":
                        targetUser.lastAllIn = 0;
                        reply(`[✅] ${targetUser.name}의 올인 쿨타임 초기화`);
                        break;
                }
                break;
            }
        }
    } catch (e) {
        Log.e(`오류: ${e.message}\n${e.stack}`);
        reply(`[❌ 시스템 오류] ${e.message}`);
    } finally {
        saveUserData(db);
    }
}

init();
bot.addListener(Event.START_COMPILE, init);
bot.addListener(Event.MESSAGE, onMessage);