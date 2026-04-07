const bot = BotManager.getCurrentBot();
const ALLOWED_ROOMS = [];


// [설정] 파일 경로
const SD_ROOT = FileStream.getSdcardPath();
const CONFIG_PATH = "/sdcard/Sybot/config.json";
const FOOD_FILE_PATH = SD_ROOT + "/Sybot/foodList.json";

/** @type {object} 전역 설정 객체 선언 (누락 방지) */
let config = {};

/** @type {object} 방별 뽑기 세션 상태 관리 */
const drawSessions = {};

// [설정] config 관련 설정
const MAIN_DEFAULT_CONFIG = {
    ADMIN_HASH: "no_HASH",
    DISCORD_WEBHOOK_URL: "no_URL"
};


function loadConfig(filePath, defaultData) {
    try {
        if (!FileStream.exists(filePath)) {
            FileStream.writeJson(filePath, defaultData);
            Log.i("기본 설정 파일을 생성했습니다: " + filePath);
            return defaultData;
        }

        let loadedData = FileStream.readJson(filePath);
        let isUpdated = false;

        for (let key in defaultData) {
            if (loadedData[key] === undefined) {
                loadedData[key] = defaultData[key];
                isUpdated = true;
            }
        }

        if (isUpdated) {
            FileStream.writeJson(filePath, loadedData);
            Log.i("설정 파일에 누락된 새 항목을 추가했습니다.");
        }

        return loadedData;
    } catch (e) {
        Log.e("설정 로드 중 오류 발생: " + e.message);
        return defaultData;
    }
}

function init() {
    config = loadConfig(CONFIG_PATH, MAIN_DEFAULT_CONFIG);
    Log.i("설정 로드 완료!");
}

// [로깅 헬퍼]
function logCommand(msg, cmdType, arg) {
    try {
        Log.i("[" + msg.room + "/" + msg.author.name + "] " + cmdType + ": " + (arg || ""));
    } catch (e) {
        Log.e("로깅 에러: " + e);
    }
}

// [에러 핸들러]
function handleError(msg, error, context) {
    Log.e("[ERROR] " + context + " 실패\n방: " + msg.room + "\n내용: " + error);
    msg.reply("앗차차! 뭔가 잘못됐어요. 😵");
}

// 메뉴 데이터 로드
function getRandomFood() {
    try {
        var list = FileStream.readJson(FOOD_FILE_PATH);
        if (!list || !Array.isArray(list) || list.length === 0) return null;
        var idx = Math.floor(Math.random() * list.length);
        return list[idx];
    } catch (e) {
        Log.e("메뉴 데이터 로드 실패: " + e);
        return null;
    }
}

/**
 * [API 2 메인 리스너]
 */
init();

bot.addListener(Event.START_COMPILE, init);
bot.addListener(Event.MESSAGE, function (msg) {
    // 1. 방 제한 체크
    if (ALLOWED_ROOMS.length > 0 && ALLOWED_ROOMS.indexOf(msg.room) === -1) return;

    var content = msg.content.trim();

    // ---------------------------------------------------------
    // 2. 도움말
    // ---------------------------------------------------------
    if (content === ".명령어" || content === ".help") {
        logCommand(msg, "도움말 조회", "");
        var help = "● 서윤봇 사용설명서\n\n\n" +
            "1. 로아 관련 기능\n\n" +
            "   .전투력(ㅈㅌㄹ) : 캐릭터 전투력 조회\n" +
            "   .낙원력(ㄴㅇㄹ) : 캐릭터 낙원력 조회\n" +
            "   .로펙(ㄹㅍ) : 캐릭터 로펙 조회\n" +
            "   .보석(ㅂㅅ) : 캐릭터 보석 조회\n" +
            "   .팔찌(ㅍㅉ) : 캐릭터 팔찌 조회\n" +
            "   .아크그리드(ㄱㄹㄷ) : 캐릭터 아크그리드 조회\n\n" +
            "   .악세(ㅇㅅ) : 캐릭터 악세 조회\n" +
            "   .부캐(ㅂㅋ) : 원정대 조회\n" +
            "   .클골(ㅋㄱ) : 레이드 클골(보상) 조회\n" +
            "   .지옥(ㅈㅇ) (숫자)(ex.ㅈㅇ 6) : 지옥 강하 추천\n" +
            "   .유각(ㅂㅆㅇㄱ) : 유각 시세\n" +
            "   .패치(ㅍㅊㄴㅌ, .ㅍㅊ) : 최신 패치노트 조회\n" +
            "   .모험섬(.쌀) : 골드 모험섬 조회\n" +
            "   .주급(ㅈㄱ) : 원정대 주급 조회\n" +
            "   .시너지(ㅅㄴㅈ) : 직업 시너지 조회\n" +
            "   .경매(ㄱㅁ) : 경매 추천 입찰가 계산\n" +
            "\n\n2. 기타 기능\n\n" +
            "   .점메추/저메추(ㅈㅁㅊ)\n" +
            "   A vs B\n" +
            "   ...확률은?\n" +
            "   .제미나이 : 제미나이에게 질문\n" +
            "\n⋆ 문의/건의사항은 '.봇 내용'으로  보내주세요. 감사합니다." +
            "\n\n서윤봇은 취미로 개발중인 봇입니다. 아직 부족한 부분이 많아 기능이 항시 작동하지 않을 수 있습니다. 양해 부탁드립니다. "
            ;
        msg.reply(help);
        return;
    }

    // ---------------------------------------------------------
    // 3. 메뉴 추천 (.점메추)
    // ---------------------------------------------------------
    var mMenu = content.match(/^\.?(ㅈㅁㅊ|점메추|저메추)$/);
    if (mMenu) {
        logCommand(msg, "메뉴 추천", "랜덤");
        try {
            const food = getRandomFood();
            if (food) msg.reply("🍽️ " + food);
            else {
                Log.w("[점메추] 파일 없음: " + FOOD_FILE_PATH);
                msg.reply("🍽️ 메뉴 목록이 없어요.");
            }
        } catch (e) { handleError(msg, e, "메뉴 추천"); }
        return;
    }

    // ---------------------------------------------------------
    // 4. VS 게임 (A vs B)
    // ---------------------------------------------------------
    var mVs = content.match(/\(([^()]+)\)\s*vs\s*\(([^()]+)\)/i);
    var mVsPlain = content.match(/^(.+)\s+vs\s+(.+)$/i);
    var left = null, right = null;

    if (mVs) { left = mVs[1].trim(); right = mVs[2].trim(); }
    else if (mVsPlain) { left = mVsPlain[1].trim(); right = mVsPlain[2].trim(); }

    if (left && right) {
        logCommand(msg, "VS 게임", left + " vs " + right);
        try {
            var choice = Math.random() < 0.5 ? left : right;
            msg.reply(choice);
        } catch (e) { handleError(msg, e, "VS 게임"); }
        return;
    }

    // ---------------------------------------------------------
    // 5. 확률 체크 (...확률은?)
    // ---------------------------------------------------------
    if (content.endsWith("확률은?")) {
        var question = content.replace("확률은?", "").trim();
        logCommand(msg, "확률 체크", question);

        try {
            var p = Math.floor(Math.random() * 101);

            msg.reply("음.. " + question + " 확률은 " + p + "%...");

        } catch (e) {
            handleError(msg, e, "확률 체크");
        }
        return;
    }

    // ---------------------------------------------------------
    // 6. 건의/제보 (.봇 내용) - [bot.send 적용됨!]
    // ---------------------------------------------------------
    if (content.startsWith(".봇")) {
        var feedback = content.replace(/^\.봇\s*/, "").trim();

        if (!feedback) {
            msg.reply("사용법: .봇 (보낼 내용)\n예: .봇 버그가 있어요!");
            return;
        }

        logCommand(msg, "건의사항 접수", feedback);

        try {
            var reportMsg = "📢 **[건의/제보 도착]**\n" +
                "> **발신:** " + msg.room + "\n" +
                "> **인물:** " + msg.author.name + "\n" +
                "> **내용:** " + feedback;

            // java.net 패키지를 이용한 HTTP POST 요청 (로아 API 요청과 비슷한 원리)
            var url = new java.net.URL(config.DISCORD_WEBHOOK_URL);
            var conn = url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json; utf-8");
            conn.setDoOutput(true);

            // 디스코드 웹훅 규격에 맞는 JSON 생성
            var jsonPayload = JSON.stringify({ "content": reportMsg });

            var os = conn.getOutputStream();
            os.write(new java.lang.String(jsonPayload).getBytes("UTF-8"));
            os.flush();
            os.close();

            var responseCode = conn.getResponseCode();
            if (responseCode >= 200 && responseCode < 300) {
                msg.reply("소중한 의견 감사합니다! 개발자에게 즉각 전송됐어요. 🚀");
            } else {
                throw new Error("HTTP " + responseCode);
            }

        } catch (e) {
            handleError(msg, e, "건의사항 웹훅 전송");
            msg.reply("전송에 실패했어요. \n@chococo_7로 dm주세요.");
        }
        return;
    }

    // ---------------------------------------------------------
    // 미니게임: 뽑기 (럭키 드로우)
    // ---------------------------------------------------------
    const hash = msg.author.hash;
    const name = msg.author.name;

    if (content === ".뽑기시작") {
        logCommand(msg, "뽑기 시작", "");

        if (drawSessions[msg.room]) {
            msg.reply("⚠️ 이미 진행 중인 뽑기가 있습니다. '.뽑기끝' 또는 '.뽑기취소'를 먼저 해주세요.");
            return;
        }

        // 세션 생성: 시작한 사람의 해시를 호스트로 지정하고, 자동으로 참여 목록에 추가
        drawSessions[msg.room] = {
            hostHash: hash,
            participants: {}
        };
        drawSessions[msg.room].participants[hash] = name;

        msg.reply("🎉 뽑기가 시작되었습니다!\n\n참여하시려면 '.뽑기'를 입력해주세요.\n(시작한 사람은 자동으로 참여됩니다.)\n\n종료하려면 '.뽑기끝'을 입력해주세요.");
        return;
    }

    if (content === ".뽑기") {
        if (!drawSessions[msg.room]) {
            msg.reply("⚠️ 진행 중인 뽑기가 없습니다. '.뽑기시작'으로 먼저 열어주세요.");
            return;
        }

        if (drawSessions[msg.room].participants[hash]) {
            msg.reply("❗ " + name + "님은 이미 참여하셨습니다!");
            return;
        }

        drawSessions[msg.room].participants[hash] = name;
        const currentCount = Object.keys(drawSessions[msg.room].participants).length;
        msg.reply("✅ " + name + "님 참여 완료!\n(현재 참여자: " + currentCount + "명)");
        return;
    }

    if (content === ".뽑기취소") {
        if (!drawSessions[msg.room]) return;
        if (drawSessions[msg.room].hostHash !== hash) {
            msg.reply("⚠️ 뽑기 취소는 시작한 사람만 할 수 있습니다!");
            return;
        }

        delete drawSessions[msg.room];
        msg.reply("🗑️ 진행 중이던 뽑기가 취소되었습니다.");
        return;
    }

    if (content === ".뽑기끝") {
        logCommand(msg, "뽑기 종료", "");

        if (!drawSessions[msg.room]) {
            msg.reply("⚠️ 진행 중인 뽑기가 없습니다.");
            return;
        }

        if (drawSessions[msg.room].hostHash !== hash) {
            msg.reply("⚠️ 뽑기 결과 발표는 시작한 사람만 할 수 있습니다!");
            return;
        }

        const players = Object.values(drawSessions[msg.room].participants);

        if (players.length === 0) { // 혹시 모를 예외 처리
            delete drawSessions[msg.room];
            msg.reply("참여자가 없어 뽑기가 종료되었습니다.");
            return;
        }

        // 랜덤 당첨자 추첨
        const winnerIndex = Math.floor(Math.random() * players.length);
        const winner = players[winnerIndex];

        msg.reply("🎊 뽑기 결과 발표 🎊\n\n총 " + players.length + "명 참여\n당첨자: 👑 " + winner + " 님! 축하합니다! 🎉");

        // 세션 초기화
        delete drawSessions[msg.room];
        return;
    }
});