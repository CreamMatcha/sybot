/**
 * @description 서윤봇 (Sybot) 주사위 게임 및 포인트 경제 시스템 (수정본 v4 + 보내기 기능 및 검색 고도화)
 * @environment MessengerBotR v0.7.41-alpha (GraalJS)
 * * [명령어 목록]
 * .출석 - 일일 지원금 2,000P + 랜덤 보너스 수령 (24시간 제한)
 * .지갑 / .포인트 - 내 정보 및 잔액 확인
 * .주사위 <금액> - 조합형 게임 (일일 5회, 전액 배팅 가능, 꽝이어도 20% 페이백 보장)
 * .올인 - D100 기반 크리티컬 도박 (100% 자동 베팅, 파산 시 구제 이벤트)
 * .랭킹 - 전체 사용자 포인트 순위 확인
 * .보내기 <닉네임/순위> <금액> - 다른 유저에게 포인트 송금
 * * [관리자 명령어]
 * .지급 <닉네임/순위> <금액> - 특정 유저에게 포인트 지급
 * .주사위추가 <닉네임/순위> <횟수> - 주사위 기회 추가 부여
 * .주사위초기화 <닉네임/순위> - 주사위 기회 초기화 (오늘 안 한 상태로 만듦)
 * .올인초기화 <닉네임/순위> - 올인 쿨타임 초기화
 */

/* ==================== 전역 상수 및 Java 타입 설정 ==================== */

const bot = BotManager.getCurrentBot();
const File = Java.type("java.io.File");

/** @description 허용된 채팅방 목록 */
const ALLOWED_ROOMS = ["아크라시아인의 휴식처"];

/** @description 관리자 해시 목록 (본인의 해시를 여기에 추가하세요) */
const ADMIN_HASHES = ["af25e2be2a646336ef12d1946faa6c266f170b75d3014f470b030b13a1c02096"];

/** @description 명령어 접두사 */
const PREFIX = ".";

/** @description 데이터 저장 경로 설정 */
const DATA_DIR = "/sdcard/Sybot/DiceGame";
const DATA_PATH = `${DATA_DIR}/user_data.json`;

/* ==================== 데이터 관리 (FileStream & JSON) ==================== */

function initFileSystem() {
    const dir = new File(DATA_DIR);
    if (!dir.exists()) dir.mkdirs();
    if (!FileStream.exists(DATA_PATH)) FileStream.writeJson(DATA_PATH, {});
}

function loadUserData() {
    try {
        initFileSystem();
        return FileStream.readJson(DATA_PATH) || {};
    } catch (e) {
        Log.e(`데이터 로드 실패: ${e.message}`);
        return {};
    }
}

function saveUserData(data) {
    try {
        FileStream.writeJson(DATA_PATH, data);
    } catch (e) {
        Log.e(`데이터 저장 실패: ${e.message}`);
    }
}

/* ==================== 유틸리티 함수 ==================== */

const rollD6 = () => Math.floor(Math.random() * 6) + 1;
const rollD100 = () => Math.floor(Math.random() * 100) + 1;

/**
 * @description 주어진 타임스탬프가 오늘(자정 이후)인지 확인
 * @param {number} timestamp 
 * @returns {boolean}
 */
function isToday(timestamp) {
    if (!timestamp) return false;
    const now = new Date();
    const target = new Date(timestamp);
    return now.getFullYear() === target.getFullYear() &&
        now.getMonth() === target.getMonth() &&
        now.getDate() === target.getDate();
}

/**
 * @description 자정(내일 0시)까지 남은 시간을 포맷팅하여 반환
 * @returns {string}
 */
function getTimeUntilMidnight() {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const ms = tomorrow.getTime() - now.getTime();

    const hours = Math.floor(ms / (1000 * 60 * 60));
    const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((ms % (1000 * 60)) / 1000);
    return `${hours}시간 ${mins}분 ${secs}초`;
}

/**
 * @description 검색어(순위/전체닉네임/부분닉네임)로 타겟 유저 해시를 찾는 함수
 */
function resolveTargetUser(db, targetStr) {
    // 1. 순위 번호로 검색 (숫자로만 이루어진 경우)
    if (/^[0-9]+$/.test(targetStr)) {
        const rank = parseInt(targetStr, 10);
        const ranking = Object.keys(db)
            .map(h => ({ hash: h, pts: db[h].points }))
            .sort((a, b) => b.pts - a.pts);

        if (rank >= 1 && rank <= ranking.length) {
            return { hash: ranking[rank - 1].hash, error: null };
        }
    }

    // 2. 정확한 닉네임 일치 검색
    let exactHash = Object.keys(db).find(k => db[k].name === targetStr);
    if (exactHash) {
        return { hash: exactHash, error: null };
    }

    // 3. 부분 닉네임 일치 검색 (포함하는 단어)
    let partialMatches = Object.keys(db).filter(k => db[k].name.includes(targetStr));

    if (partialMatches.length === 1) {
        // 일치하는 사람이 딱 한 명일 경우
        return { hash: partialMatches[0], error: null };
    } else if (partialMatches.length > 1) {
        // 일치하는 사람이 여러 명일 경우
        const matchNames = partialMatches.map(h => db[h].name).join(", ");
        return { hash: null, error: `[⚠️ 대상 중복] '${targetStr}' 키워드가 포함된 유저가 여러 명입니다. 대상을 더 정확히 입력해주세요.\n(검색된 유저: ${matchNames})` };
    }

    // 4. 해당하는 유저가 없을 경우
    return { hash: null, error: `[❌ 대상 없음] '${targetStr}' 대상을 찾을 수 없습니다.` };
}

/* ==================== 메인 게임 핸들러 ==================== */

function onMessage(msg) {
    if (!ALLOWED_ROOMS.includes(msg.room)) return;
    if (!msg.content.startsWith(PREFIX)) return;

    // 베타 테스트 안내 문구가 포함된 커스텀 응답 함수
    const reply = (text) => msg.reply(`[beta]\n${text}`);

    const args = msg.content.substring(PREFIX.length).trim().split(/\s+/);
    const cmd = args[0];
    const commandsList = [
        "출석", "포인트", "지갑", "주사위", "올인", "랭킹",
        "보내기", "지급", "주사위추가", "주사위초기화", "올인초기화"
    ];

    if (!commandsList.includes(cmd)) return;

    const db = loadUserData();
    const hash = msg.author.hash;
    const name = msg.author.name;

    // 유저 데이터 초기화 및 확장
    if (!db[hash]) {
        db[hash] = {
            name: name,
            points: 1000,
            lastDaily: 0,
            lastDice: 0,
            diceCountToday: 0,
            lastAllIn: 0,
            playCount: 0,
            allInCritFails: 0
        };
    } else {
        db[hash].name = name;
        if (db[hash].lastDice === undefined) db[hash].lastDice = 0;
        if (db[hash].diceCountToday === undefined) db[hash].diceCountToday = 0;
        if (db[hash].lastAllIn === undefined) db[hash].lastAllIn = 0;
        if (db[hash].allInCritFails === undefined) db[hash].allInCritFails = 0;
    }

    const user = db[hash];
    const now = Date.now();

    try {
        switch (cmd) {
            case "보내기":
            case "지급":
            case "주사위추가":
            case "주사위초기화":
            case "올인초기화": {
                // 관리자 명령어인지 체크
                const isAdminCmd = ["지급", "주사위추가", "주사위초기화", "올인초기화"].includes(cmd);

                if (isAdminCmd && !ADMIN_HASHES.includes(hash)) {
                    reply(`[🚫 권한 없음] 관리자만 사용 가능한 명령어입니다.`);
                    return;
                }

                // 정규식을 사용해 대상(따옴표 포함 또는 미포함) 및 숫자 값을 파싱
                const contentStr = msg.content.substring(PREFIX.length).trim();
                const targetCmdMatch = contentStr.match(/^(보내기|지급|주사위추가|주사위초기화|올인초기화)\s+(?:"([^"]+)"|(\S+))(?:\s+(-?\d+))?$/);

                if (!targetCmdMatch) {
                    if (cmd === "보내기") {
                        reply(`[⚠️ 사용법]\n.보내기 <닉네임/순위> <금액>\n* 띄어쓰기가 있는 닉네임은 "홍 길동" 처럼 따옴표로 감싸주세요.`);
                    } else {
                        reply(`[⚠️ 사용법]\n.지급 <닉네임/순위> <금액>\n.주사위추가 <닉네임/순위> <횟수>\n.주사위초기화 <닉네임/순위>\n.올인초기화 <닉네임/순위>\n* 띄어쓰기가 있는 닉네임은 "홍 길동" 처럼 따옴표로 감싸주세요.`);
                    }
                    return;
                }

                const exactCmd = targetCmdMatch[1];
                const targetStr = targetCmdMatch[2] || targetCmdMatch[3];
                const numValue = targetCmdMatch[4] ? parseInt(targetCmdMatch[4], 10) : NaN;

                // 공통: 타겟 유저 찾기 (순위, 정확도, 부분일치 우선순위)
                const targetResult = resolveTargetUser(db, targetStr);

                if (targetResult.error) {
                    reply(targetResult.error);
                    return;
                }

                const targetHash = targetResult.hash;
                const targetUser = db[targetHash];

                // 개별 명령어 동작 처리
                switch (exactCmd) {
                    case "보내기":
                        if (isNaN(numValue) || numValue <= 0) {
                            reply(`[⚠️ 오류] 보낼 금액을 1P 이상 정확히 입력해주세요.`);
                            return;
                        }
                        if (targetHash === hash) {
                            reply(`[⚠️ 오류] 자기 자신에게는 포인트를 보낼 수 없습니다.`);
                            return;
                        }
                        if (user.points < numValue) {
                            reply(`[💸 잔액 부족] 보유: ${user.points.toLocaleString()}P`);
                            return;
                        }

                        user.points -= numValue;
                        targetUser.points += numValue;
                        reply(`[💸 송금 완료]\n${name}님이 ${targetUser.name}님에게 ${numValue.toLocaleString()}P를 보냈습니다.\n(내 잔액: ${user.points.toLocaleString()}P)`);
                        break;

                    case "지급":
                        if (isNaN(numValue)) {
                            reply(`[⚠️ 오류] 지급할 금액을 입력해주세요.\n예: .지급 3 2000`);
                            return;
                        }
                        targetUser.points += numValue;
                        reply(`[✅ 지급 완료]\n관리자가 ${targetUser.name}님에게 ${numValue.toLocaleString()}P를 지급했습니다.\n(대상 잔액: ${targetUser.points.toLocaleString()}P)`);
                        break;

                    case "주사위추가":
                        if (isNaN(numValue) || numValue <= 0) {
                            reply(`[⚠️ 오류] 추가할 횟수를 올바르게 입력해주세요.\n예: .주사위추가 "홍 길동" 2`);
                            return;
                        }
                        if (!isToday(targetUser.lastDice)) {
                            targetUser.diceCountToday = 0;
                        }
                        // 횟수를 빼줌으로써 플레이 가능 횟수를 늘림
                        targetUser.diceCountToday -= numValue;
                        targetUser.lastDice = now; // 날짜가 바뀌어 초기화되는 것 방지
                        reply(`[✅ 횟수 추가]\n관리자가 ${targetUser.name}님의 주사위 기회를 ${numValue}회 추가했습니다.`);
                        break;

                    case "주사위초기화":
                        targetUser.diceCountToday = 0;
                        targetUser.lastDice = now;
                        reply(`[✅ 주사위 초기화]\n관리자가 ${targetUser.name}님의 오늘 주사위 횟수를 전부 초기화했습니다. (다시 처음부터 사용 가능)`);
                        break;

                    case "올인초기화":
                        targetUser.lastAllIn = 0; // 타임스탬프를 0으로 만들어 오늘 안한 것으로 취급
                        reply(`[✅ 올인 초기화]\n관리자가 ${targetUser.name}님의 올인 쿨타임을 초기화했습니다. (오늘 올인 1회 추가 가능)`);
                        break;
                }
                break;
            }

            case "출석": {
                if (!isToday(user.lastDaily)) {
                    const baseDaily = 2000;
                    const randomBonus = Math.floor(Math.random() * 901) + 100; // 100 ~ 1000 랜덤 보너스
                    const totalReward = baseDaily + randomBonus;

                    user.points += totalReward;
                    user.lastDaily = now;
                    reply(`[💰 출석 완료]\n${name}님, 기본 지원금 2,000P + 🎁 보너스 ${randomBonus.toLocaleString()}P 지급!\n잔액: ${user.points.toLocaleString()}P`);
                } else {
                    reply(`[⏳ 출석 대기]\n오늘은 이미 출석하셨습니다.\n자정 초기화까지 ${getTimeUntilMidnight()} 남았습니다.`);
                }
                break;
            }

            case "포인트":
            case "지갑": {
                reply(`[🏦 ${name}님의 지갑]\n보유 포인트: ${user.points.toLocaleString()}P\n누적 플레이: ${user.playCount}회`);
                break;
            }

            case "주사위": {
                if (!isToday(user.lastDice)) {
                    user.diceCountToday = 0;
                }

                // 하루 제한 5번
                if (user.diceCountToday >= 5) {
                    reply(`[⏳ 주사위 쿨타임]\n주사위는 하루에 5번만 가능합니다.\n자정 초기화까지: ${getTimeUntilMidnight()}`);
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
                let mult = 0;
                let desc = "";

                if (d[0] === d[1] && d[1] === d[2]) { mult = 5; desc = "🔥 [트리플!] 잭팟!"; }
                else if (sorted[0] + 1 === sorted[1] && sorted[1] + 1 === sorted[2]) { mult = 3; desc = "✨ [스트레이트!]"; }
                else if (d[0] === d[1] || d[1] === d[2] || d[0] === d[2]) { mult = 1.5; desc = "🎲 [더블!]"; }
                else if (sum >= 14) { mult = 1; desc = "👍 [하이 롤!]"; }
                else { mult = 0.2; desc = "💥 [꽝] (20% 보증 환급)"; }

                const win = Math.floor(bet * mult);
                user.points += win;

                const resultText = mult >= 1 ? `+${win.toLocaleString()}P` : `-${(bet - win).toLocaleString()}P`;
                reply(`[🎲 결과: ${d.join(", ")}]\n${desc}\n${resultText}\n잔액: ${user.points.toLocaleString()}P`);
                break;
            }

            case "올인": {
                if (isToday(user.lastAllIn)) {
                    reply(`[⏳ 올인 쿨타임]\n올인은 하루에 한 번만 가능합니다.\n자정 초기화까지: ${getTimeUntilMidnight()}`);
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
                let final = 0;
                let status = "";

                if (luck === 100) {
                    final = amount * 10;
                    status = "🌟 [크리티컬 성공!!] 10배 달성!";
                }
                else if (luck === 1) {
                    user.allInCritFails++;
                    if (user.allInCritFails >= 3) {
                        final = amount * 20;
                        user.allInCritFails = 0;
                        status = `👼 [기사회생] 3번째 크리티컬 실패! 불운의 끝에서 배팅액의 20배를 돌려받습니다!!`;
                    } else {
                        final = 0;
                        status = `💀 [크리티컬 실패...] 대운이 다했습니다. (누적 크리티컬 실패: ${user.allInCritFails}/3)`;
                    }
                }
                else if (luck >= 51) {
                    final = amount * 2;
                    status = "🎉 [성공] 2배 획득!";
                }
                else {
                    final = 0;
                    status = "📉 [실패] 배팅액을 전부 잃었습니다...";
                }

                // 올인 구제금
                if (final === 0) {
                    const isJackpot = Math.random() < 0.05; // 5% 확률 대박
                    let reliefPoints = 0;

                    if (isJackpot) {
                        reliefPoints = Math.floor(Math.random() * 40001) + 10000;
                        status += `\n\n🍀 [기적의 동아줄!] 지나가던 거부가 파산한 당신을 가엾게 여겨 ${reliefPoints.toLocaleString()}P를 적선했습니다!!`;
                    } else {
                        reliefPoints = Math.floor(Math.random() * 901) + 100;
                        status += `\n\n🪙 [파산 구제금] 길바닥을 뒤져 ${reliefPoints.toLocaleString()}P를 찾아냈습니다...`;
                    }
                    final += reliefPoints;
                }

                user.points += final;
                reply(`[⚠️ ALL-IN 결과: ${luck}]\n배팅 금액: ${amount.toLocaleString()}P (100% 배팅)\n${status}\n잔액: ${user.points.toLocaleString()}P`);
                break;
            }

            case "랭킹": {
                const ranking = Object.keys(db)
                    .map(h => ({ name: db[h].name, pts: db[h].points, hash: h }))
                    .sort((a, b) => b.pts - a.pts);

                let view = "🏆 다이스 게임 랭킹\n\n";
                ranking.forEach((u, i) => {
                    const icon = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `[${i + 1}]`;
                    view += `${icon} ${u.name}: ${u.pts.toLocaleString()}P\n`;
                });

                const myIdx = ranking.findIndex(u => u.hash === hash);
                view += `\n> 내 순위: ${myIdx + 1}위 / ${ranking.length}명`;
                reply(view);
                break;
            }
        }
    } catch (e) {
        Log.e(`오류: ${e.message}`);
        reply(`[❌ 시스템 오류] ${e.message}`);
    } finally {
        saveUserData(db);
    }
}

bot.addListener(Event.START_COMPILE, () => { initFileSystem(); });
bot.addListener(Event.MESSAGE, onMessage);