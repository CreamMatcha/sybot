/**
 * @description 서윤봇 (Sybot) 주사위 게임 및 포인트 경제 시스템
 * @environment MessengerBotR v0.7.41-alpha (GraalJS)
 * * [명령어 목록]
 * .출석 - 일일 지원금 2,000P 수령 (24시간 제한)
 * .지갑 / .포인트 - 내 정보 및 잔액 확인
 * .주사위 <금액> - 조합형 게임 (24시간 제한)
 * .올인 - D100 기반 크리티컬 도박 (24시간 제한)
 * .랭킹 - 전체 사용자 포인트 순위 확인
 * * [관리자 명령어]
 * .지급 <닉네임> <금액> - 특정 유저에게 포인트 지급
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

/* ==================== 메인 게임 핸들러 ==================== */

function onMessage(msg) {
    if (!ALLOWED_ROOMS.includes(msg.room)) return;
    if (!msg.content.startsWith(PREFIX)) return;

    // 베타 테스트 안내 문구가 포함된 커스텀 응답 함수
    const reply = (text) => msg.reply(`[beta]\n${text}`);

    const args = msg.content.substring(PREFIX.length).trim().split(/\s+/);
    const cmd = args[0];
    const diceCommands = ["출석", "포인트", "지갑", "주사위", "올인", "랭킹", "지급"];

    if (!diceCommands.includes(cmd)) return;

    const db = loadUserData();
    const hash = msg.author.hash;
    const name = msg.author.name;

    // 유저 데이터 초기화 및 확장 (신규 필드 포함)
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
        // 기존 유저가 신규 필드가 없는 경우 보정
        if (db[hash].lastDice === undefined) db[hash].lastDice = 0;
        if (db[hash].diceCountToday === undefined) db[hash].diceCountToday = 0;
        if (db[hash].lastAllIn === undefined) db[hash].lastAllIn = 0;
        if (db[hash].allInCritFails === undefined) db[hash].allInCritFails = 0;
    }

    const user = db[hash];
    const now = Date.now();

    try {
        switch (cmd) {
            case "지급": {
                // 관리자 체크
                if (!ADMIN_HASHES.includes(hash)) {
                    reply(`[🚫 권한 없음] 관리자만 사용 가능한 명령어입니다.`);
                    return;
                }

                // 정규식을 사용해 공백이 포함된 "닉네임"과 금액을 정확히 추출
                const contentStr = msg.content.substring(PREFIX.length).trim();
                const match = contentStr.match(/^지급\s+"([^"]+)"\s+(-?\d+)$/);

                if (!match) {
                    reply(`[⚠️ 사용법] .지급 "닉네임" <금액>\n예시: .지급 "홍 길동" 1000`);
                    return;
                }

                const targetName = match[1];
                const amount = parseInt(match[2], 10);

                // 이름으로 유저 찾기
                const targetHash = Object.keys(db).find(k => db[k].name === targetName);
                if (!targetHash) {
                    reply(`[❌ 오류] '${targetName}' 유저를 찾을 수 없습니다.`);
                    return;
                }

                db[targetHash].points += amount;
                reply(`[✅ 지급 완료]\n관리자가 ${targetName}님에게 ${amount.toLocaleString()}P를 지급했습니다.\n(대상 잔액: ${db[targetHash].points.toLocaleString()}P)`);
                break;
            }

            case "출석": {
                if (!isToday(user.lastDaily)) {
                    user.points += 2000;
                    user.lastDaily = now;
                    reply(`[💰 출석 완료]\n${name}님, 지원금 2,000P 지급!\n잔액: ${user.points.toLocaleString()}P`);
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
                // 날짜가 바뀌었으면 주사위 횟수 초기화
                if (!isToday(user.lastDice)) {
                    user.diceCountToday = 0;
                }

                // 자정 기준 제한 체크 (하루 3번)
                if (user.diceCountToday >= 3) {
                    reply(`[⏳ 주사위 쿨타임]\n주사위는 하루에 3번만 가능합니다.\n자정 초기화까지: ${getTimeUntilMidnight()}`);
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
                user.lastDice = now; // 시간 기록

                const d = [rollD6(), rollD6(), rollD6()];
                const sum = d[0] + d[1] + d[2];
                const sorted = [...d].sort((a, b) => a - b);

                let mult = 0;
                let desc = "";

                if (d[0] === d[1] && d[1] === d[2]) { mult = 5; desc = "🔥 [트리플!] 잭팟!"; }
                else if (sorted[0] + 1 === sorted[1] && sorted[1] + 1 === sorted[2]) { mult = 3; desc = "✨ [스트레이트!]"; }
                else if (d[0] === d[1] || d[1] === d[2] || d[0] === d[2]) { mult = 1.5; desc = "🎲 [더블!]"; }
                else if (sum >= 14) { mult = 1; desc = "👍 [하이 롤!]"; }
                else { mult = 0; desc = "💥 [꽝]"; }

                const win = Math.floor(bet * mult);
                user.points += win;

                reply(`[🎲 결과: ${d.join(", ")}]\n${desc}\n${mult > 0 ? `+${win.toLocaleString()}P` : `-${bet.toLocaleString()}P`}\n잔액: ${user.points.toLocaleString()}P`);
                break;
            }

            case "올인": {
                // 자정 기준 제한 체크
                if (isToday(user.lastAllIn)) {
                    reply(`[⏳ 올인 쿨타임]\n올인은 하루에 한 번만 가능합니다.\n자정 초기화까지: ${getTimeUntilMidnight()}`);
                    return;
                }

                if (user.points <= 0) {
                    reply(`[💸 파산] 올인할 포인트가 없습니다.`);
                    return;
                }

                // 보유 포인트의 70% 자동 배팅
                const amount = Math.floor(user.points * 0.7);
                if (amount <= 0) {
                    reply(`[💸 배팅 불가] 포인트가 너무 적어 70% 배팅을 진행할 수 없습니다.`);
                    return;
                }

                user.points -= amount;
                user.playCount++;
                user.lastAllIn = now; // 시간 기록

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
                        user.allInCritFails = 0; // 누적 횟수 초기화
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
                    status = "📉 [실패] 배팅액을 잃었습니다...";
                }

                user.points += final;
                reply(`[⚠️ ALL-IN 결과: ${luck}]\n배팅 금액: ${amount.toLocaleString()}P (보유 70%)\n${status}\n잔액: ${user.points.toLocaleString()}P`);
                break;
            }

            case "랭킹": {
                const ranking = Object.keys(db)
                    .map(h => ({ name: db[h].name, pts: db[h].points, hash: h }))
                    .sort((a, b) => b.pts - a.pts);

                let view = "🏆 다이스 게임 랭킹 (Top 10)\n\n";
                ranking.slice(0, 10).forEach((u, i) => {
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