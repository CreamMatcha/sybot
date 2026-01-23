const bot = BotManager.getCurrentBot();

function save(originpath, content) {
    var splited_originpath = originpath.split("/");
    splited_originpath.pop();
    var path = splited_originpath.join("/");

    var folder = new java.io.File(path);
    folder.mkdirs();

    var file = new java.io.File(originpath);
    var fos = new java.io.FileOutputStream(file);
    var contentstring = new java.lang.String(content);
    fos.write(contentstring.getBytes());
    fos.close();
}

function read(originpath) {
    var file = new java.io.File(originpath);
    if (file.exists() == false) return null;
    try {
        var fis = new java.io.FileInputStream(file);
        var isr = new java.io.InputStreamReader(fis);
        var br  = new java.io.BufferedReader(isr);

        // 첫 줄 읽기
        var temp_br       = br.readLine();
        var temp_readline = "";

        // 나머지 줄 이어 붙이기
        while ((temp_readline = br.readLine()) !== null) {
            temp_br += "\n" + temp_readline;
        }

        try {
            fis.close();
            isr.close();
            br.close();
            return temp_br;
        }
        catch (error) {
            return error;
        }
    }
    catch (error) {
        return error;
    }
}

// =========================
// 1) 구독자 목록 저장 경로 상수
//    -> SD 카드 루트 아래에 파일을 생성합니다.
const SUBSCRIBERS_FILE = "sdcard/gaekye_subscribers.json";

// 2) “결계” 알림 구독자 관리 객체 (메모리용)
var gaekyeSubscribers = {};  
//    구조 예시: 
//    {
//      "아크라시아인의 휴식처": ["서윤","라떼냥"],
//      "다른방이름": ["닉네임A","닉네임B", ...]
//    }

// -------------------------
// 3) 저장된 파일에서 구독자 목록을 읽어오는 함수
function loadGaekyeSubscribers() {
    var jsonString = read(SUBSCRIBERS_FILE);
    if (jsonString === null) {
        // 파일 자체가 없으면 빈 객체로 초기화
        gaekyeSubscribers = {};
        Log.i("[Log] 구독자 파일이 없습니다. 새로 시작합니다.");
    } else if (typeof jsonString === "string") {
        try {
            gaekyeSubscribers = JSON.parse(jsonString);
            Log.i("[Log] 구독자 파일 로드 완료.");
        } catch (e) {
            // 파싱 에러 발생 시 경고 로그, 빈 객체로 초기화
            gaekyeSubscribers = {};
            Log.e(`[Error] 구독자 파일 파싱 실패: ${e}`);
        }
    } else {
        // read()가 오류 객체를 반환한 경우
        gaekyeSubscribers = {};
        Log.e(`[Error] 구독자 파일 읽기 중 오류 발생: ${jsonString}`);
    }
}

// 4) 메모리에 있는 gaekyeSubscribers 객체를 파일에 저장하는 함수
function saveGaekyeSubscribers() {
    try {
        var jsonContent = JSON.stringify(gaekyeSubscribers);
        save(SUBSCRIBERS_FILE, jsonContent);
        Log.i("[Log] 구독자 목록을 파일에 저장했습니다.");
    } catch (e) {
        Log.e(`[Error] 구독자 목록 저장 실패: ${e}`);
    }
}

// -------------------------
// 스크립트 로드 시점에 파일을 읽어서 gaekyeSubscribers 초기화
loadGaekyeSubscribers();

const foodList = [
    "간장게장", "족발", "수육", "잔치국수", "탕수육", "술떡", "물냉면", "비빔냉면", "차돌된장찌개", "짜장면",
    "월남쌈", "짬뽕", "잡탕밥", "돼지갈비", "유부", "소갈비", "참치김치찌개", "보리밥", "호박떡", "육개장",
    "팔보채", "벌집삼겹살", "버블티", "평양냉면", "알밥", "대패삼겹살", "꽈배기도넛", "초밥", "회오리감자", 
    "삼각김밥", "오징어버터구이", "연탄불고기", "오레오빙수", "연두부", "회덮밥", "깐풍기", "미역국", "물회",
    "콩나물국밥", "오징어회", "참치회", "고등어구이", "명란젓", "배추김치", "고사리", "크림카레우동", 
    "갈비찜", "치맥", "돈까스", "볶음김치", "계란말이", "숯불닭갈비", "소고기무국", "곰탕", "갈비탕", 
    "호박전", "치즈감자고로케", "쫄병스낵", "케밥", "골뱅이무침", "깍두기", "비빔국수", "꽃빵", "참치비빔밥", 
    "불고기버거", "겉절이", "수제비", "파전", "명이나물", "피자찐빵", "오돌뼈", "양념게장", "팟타이", "떡볶이", 
    "뼈해장국", "가리비구이", "비지찌개", "무지개떡", "간장새우", "김밥", "녹차모찌", "생새우초밥", 
    "남산왕돈까스", "모닥치기", "조랭이떡", "녹치케", "골뱅이소면무침", "김치만두", "군만두", "물만두", 
    "찐빵", "멸치볶음", "쫄면", "순대", "곱창", "대창", "막창", "LA갈비", "콩나물무침", "모찌롤", "냉치킨", 
    "선지해장국", "깐쇼새우", "유산슬", "고구마빵", "돼지국밥", "횡성한우", "파김치", "새우죽", "고추장찌개", 
    "통감자", "엽떡", "회냉면", "낙지젓", "육포", "고구마밥", "생선까스", "오이지", "된장국", "찹쌀도넛", 
    "백김치", "파래", "안동찜닭", "까르보나라떡볶이", "설렁탕", "석박지", "육회비빔밥", "어묵꼬치", 
    "열무비빔밥", "광어회", "고추잡채", "닭도리탕", "참치볶음", "슈크림빵", "오징어무침", "도라지", 
    "양념갈비", "닭똥집", "식혜", "한우스테이크", "돌솥비빔밥", "성게알", "야쿠르트", "조기구이", 
    "돼지갈비찜", "명란스파게티", "후쿠오카함바그", "파무침", "미숫가루", "총각김치", "쌈장", "떡갈비", 
    "양꼬치", "홍초", "굴", "짬뽕밥", "말린과일", "볶음우동", "닭강정", "된장국", "동치미", "떡꼬치", 
    "김말이튀김", "두부", "냉이된장국", "치즈돈까스정식", "쟁반짜장", "연어알", "삼계탕", "카레우동", 
    "찹쌀도넛", "관자", "호로요이", "순두부찌개", "이삭토스트", "국물닭발", "해물순두부", "오설록", 
    "군밤", "붕어빵", "규동", "편육", "쌀국수", "볶음밥", "김치전", "소갈비찜", "동그랑땡", "유자차", 
    "송편", "우삼겹", "쟁반짜장", "전병", "뼈해장국", "스테키동", "텐텐", "바나나맛우유", "새우젓", 
    "감자떡", "맥심골드", "주먹김밥", "엽떡", "황올", "굶어", "옆사람꺼 뺏어드시면 되겠습니다.", "쑥쑥 성장 딸기맛 어린이"
];

let daily = (
    "\ufe0f일일 숙제 (매일 오전 6시 초기화)\n\n" + 
    "\u2714검은 구멍 3회\n" +
    "\u2714소환의 결계 2회\n" +
    "\u2714망령의 탑 5회\n" +
    "\u2714요일 던전 1회\n" +
    "\u2714일일 미션 수행"
);

let weekly = (
    "\ufe0f주간 숙제 (월요일 오전 6시 초기화)\n\n" +
    "\u{1f4cc}필드보스\n" +
    "\u{1f4cc}마물 퇴치 증표 교환 \n(아득한 별의 인장, 강화 재연소 촉매 필수 구매)\n" +
    "\u{1f4cc}어비스 3종\n" +
    "\u{1f4cc}레이드: 먼 바다의 회색 미로\n" +
    "\u{1f4cc}주간 목표(심층 던전 3회, 던전 5회, 사냥터 5회)\n" +
    "\u{1f4cc}임무 게시판: 채집 스크롤 3종\n- 3회 반복 수행 (티르코네일, 던바튼, 콜헨 임무 게시판)\n" +
    "\u{1f4cc}사냥터 보스 일반, 어려움, 매우 어려움 (난도별 1회씩)"
);

let exchange = (
"\u2705일일 캐시샵 (3개)\n\n" +
"추천픽 -> 매일 무료 상품 1개 구입\n" +
"아이템샵 -> 데카 > 일일 은동전 상자 1개 구입\n" +
"아이템샵 -> 골드 > 조각난 보석 보물 상자 10개 구입\n\n" +
"생활 교환 :\n" +
"https://upload3.inven.co.kr/upload/2025/04/24/bbs/i1408814714.webp"
);

let help = (
    "--------------------------------\n" +
    ".일일\n" +
    ".주간\n" +
    ".교환\n" +
    ".(모비노기 닉네임)\n" +
    ".룬\n" +
    ".룬랭킹\n" +
    "\n" +
    "ㅈㅁㅊ, 점메추, 저메추\n" +
    "~~ 확률은?\n" +
    "--------------------------------"
);

const SCHEDULES = [
    { hours: [9, 12, 15, 18, 21], minute: 0, message: "결계~" },
    { hours: [12, 18, 20, 22], minute: 0, message: "\u{1F508}필드보스 출현(~30분)" }
];

const TARGET_ROOM = "아크라시아인의 휴식처";

let timer = null;
let lastSent = {};
const roomCache = {};

function startTimer() {
    if (timer === null) {
        Log.i("[Log] 타이머 시작");

        const Timer = java.util.Timer;
        const TimerTask = java.util.TimerTask;
        timer = new Timer();

        const task = new TimerTask({
            run: function () {
                const now = new Date();
                const currentHour   = now.getHours();
                const currentMinute = now.getMinutes();
                const currentDate   = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

                // ────────────────────────────────────────────
                // 디버깅용 로그: 타이머가 언제 실행됐는지
                Log.d(`[Debug] 타이머 실행: ${currentHour}:${currentMinute}`);
                // ────────────────────────────────────────────

                SCHEDULES.forEach(schedule => {
                    // ────────────────────────────────────────────
                    // 디버깅용 로그: 어떤 스케줄을 검사 중인지
                    Log.d(`[Debug] 검사 중 스케줄 → hours: [${schedule.hours.join(", ")}], minute: ${schedule.minute}, message: "${schedule.message}"`);
                    // ────────────────────────────────────────────

                    // “초(second) 체크”를 제거하고, 오직 “시간(hour) + 분(minute)”만 비교
                    if (
                        schedule.hours.includes(currentHour) &&
                        currentMinute === schedule.minute
                    ) {
                        // 스케줄별 고유 키 생성 (message + 날짜 + 시:분)
                        const scheduleKey = `${schedule.message}_${currentDate}_${currentHour}:${currentMinute}`;

                        // ────────────────────────────────────────────
                        // 디버깅용 로그: 스케줄이 매칭되었는지
                        Log.d(`[Debug] 스케줄 매칭됨 → ${currentHour}:${currentMinute} → "${schedule.message}"`);
                        Log.d(`[Debug] lastSent 키 생성 시도: ${scheduleKey}`);
                        // ────────────────────────────────────────────

                        if (!lastSent[scheduleKey]) {
                            // 최초 전송 시에만 true로 세팅하고 메시지 발송
                            lastSent[scheduleKey] = true;
                            Log.d(`[Debug] lastSent 키 설정: ${scheduleKey}`);

                            const msgObj = roomCache[TARGET_ROOM];
                            if (!msgObj) {
                                Log.e(`[Error] roomCache['${TARGET_ROOM}']가 없습니다. ".알림시작"을 해당 방에서 실행했는지 확인하세요.`);
                            } else {
                                if (schedule.message === "결계~") {
                                    // '결계~'이면 구독자 멘션 붙이기
                                    const subs = gaekyeSubscribers[TARGET_ROOM] || [];
                                    let text = schedule.message;
                                    if (subs.length > 0) {
                                        const mentionLine = subs.map(n => `@${n}`).join(' ');
                                        text += `\n${mentionLine}`;
                                    }
                                    msgObj.reply(text);
                                    Log.i(`[Log] 결계 알림 전송: ${text}`);
                                } else {
                                    // '🔈필드보스 출현(~30분)' 스케줄
                                    msgObj.reply(schedule.message);
                                    Log.i(`[Log] 필드보스 알림 전송: ${schedule.message}`);
                                }
                            }
                        } else {
                            // 이미 같은 키로 전송된 기록이 있으면 스킵
                            Log.d(`[Debug] 이미 전송된 스케줄 키이므로 건너뜁니다: ${scheduleKey}`);
                        }
                    }
                });
            }
        });

        // 30초마다 한 번씩 체크: 같은 “시:분” 안에서도 타이머가 여러 번 돌아올 수 있지만,
        // lastSent 조건으로 중복 발송을 막을 수 있습니다.
        timer.schedule(task, 0, 30 * 1000);
    } else {
        Log.d("[Log] 타이머는 이미 실행 중입니다.");
    }
}
function getRandomFood() {
    return foodList[Math.floor(Math.random() * foodList.length)];
}

function onMessage(msg) {
    Log.i(`[Log] 메시지 수신: 방='${msg.room}', 보낸 사람='${msg.author.name}', 내용='${msg.content}'`);

    //메뉴 추천
    const validKeywords = ["ㅈㅁㅊ", "점메추", "저메추"];
    // 메시지 내용 양쪽 공백 제거 후 정확히 키워드와 일치하는지 검사
    const cleanedMsg = msg.content.trim();

    if (validKeywords.includes(cleanedMsg)) {
        msg.reply(`🍽️ ${getRandomFood()}`);
    }


    // 랜덤확률
    if (msg.content.endsWith("확률은?")) {
        const prefixes = ["저런!", "음...", "아마도", "과연..", "흠...", "장담할 순 없지만"];
        const endings = ["!", "ㅋ", "..."];
        const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const randomEndings = endings[Math.floor(Math.random() * endings.length)];
        const randomProbability = (Math.random() * 100).toFixed(1); // 0.0 ~ 100.0%

        msg.reply(`${randomPrefix} 확률은 ${randomProbability}%입니다${randomEndings}`);
    }
}


bot.addListener(Event.MESSAGE, onMessage);

function onStartCompile() {
    if (timer !== null) {
        Log.i("[Log] 컴파일 시 타이머 초기화");
        timer.cancel();
        timer = null;
    }
    lastSent = {};
    startTimer();
}

function onCommand(msg) {
  Log.i(`[Log] msg.command 값: '${msg.command}'`);
    const commands = {
        "명령어": help,
        "꼬마서윤": "뀨",
        "가녀린소녀": "댄서를버린",
        "쇼부": "모악귀",
        "귀염똥이": "멋쟁이",
        "잭콩": "테무산",
        "라떼냥": "우우",
        "in벼리": "연어",
        "머랭빵" : "머랭쿠키", 
        "일일": daily,
        "주간": weekly,
        "교환": exchange
    };

    if (commands[msg.command]) {
        msg.reply(commands[msg.command]);
        return;
    }

    const room = msg.room;
    const me   = msg.author.name;
    const cmd  = msg.command;

    // 8-1) 결계 알림 구독 (.결계알림)
    if (cmd === "결계알림") {
        // room에 대한 배열이 없으면 빈 배열 생성
        let thisRoomSubs = gaekyeSubscribers[room] || [];
        if (!thisRoomSubs.includes(me)) {
            thisRoomSubs.push(me);
            gaekyeSubscribers[room] = thisRoomSubs;
            saveGaekyeSubscribers();  // 파일에 즉시 저장
            msg.reply(`✅ 구독!`);
        } else {
            msg.reply(`이미 구독중!`);
        }
        return;
    }

    // 8-2) 결계 알림 구독 취소 (.결계알림취소)
    if (cmd === "결계알림취소") {
        let thisRoomSubs = gaekyeSubscribers[room] || [];
        const filtered   = thisRoomSubs.filter(name => name !== me);
        gaekyeSubscribers[room] = filtered;
        saveGaekyeSubscribers();  // 파일에 즉시 저장
        msg.reply(`🗑️구독취소ㅠ`);
        return;
    }

    // 8-3) 기존 .알림시작 처리
    if (cmd === "알림시작") {
        if (room === TARGET_ROOM) {
            roomCache[room] = msg;
            Log.i(`[Log] roomCache['${room}'] 설정됨`);
        }
        msg.reply("알림을 시작합니다.");
        startTimer();
        return;
    }

    // 타이머 종료 명령 처리
    if (cmd === "타이머종료") {
        if (timer !== null) {
            timer.cancel();
            timer = null;
            lastSent = {};
            Log.i("[Log] 타이머가 명령어로 종료되었습니다.");
            msg.reply("⏹️ 타이머가 종료되었습니다.");
        } else {
            Log.i("[Log] 종료 요청: 이미 타이머가 종료된 상태입니다.");
            msg.reply("⏹️ 이미 타이머가 종료된 상태입니다.");
        }
        return;
    }
}


bot.setCommandPrefix(".");
bot.addListener(Event.COMMAND, onCommand);