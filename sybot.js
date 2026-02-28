const bot = BotManager.getCurrentBot();
const ALLOWED_ROOMS = [];

// [설정] 건의사항을 받을 관리자 방 이름 (정확해야 합니다!)
const FEEDBACK_ROOM = "서윤봇 제보방";

// [설정] 파일 경로
const SD_ROOT = FileStream.getSdcardPath();
const FOOD_FILE_PATH = SD_ROOT + "/Sybot/foodList.json";

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
            "   .클골(ㅋㄱ) : 레이드 클골(보상) 조회\n" +
            "   .지옥(ㅈㅇ) : 지옥 강하 추천\n" +
            "   .유각(ㅇㄱ) : 유각 시세\n" +
            "   .패치(ㅍㅊ) : 최신 패치노트 조회\n" +
            "   .모험섬(.쌀) : 골드 모험섬 조회\n" +
            "\n\n2. 기타 기능\n\n" +
            "   .점메추/저메추(ㅈㅁㅊ)\n" +
            "   A vs B\n" +
            "   ...확률은?\n" +
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

            // 보낸 사람 이름 가져오기
            var name = msg.author.name;

            msg.reply(name + "이(가) " + question + " 확률은 " + p + "%...");

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
            var reportMsg = "📢 [건의/제보 도착]\n" +
                "--------------------\n" +
                "발신: " + msg.room + "\n" +
                "인물: " + msg.author.name + "\n" +
                "내용: " + feedback;

            // ★ 핵심 변경: bot.send(방이름, 내용) 사용
            var success = bot.send(FEEDBACK_ROOM, reportMsg);

            if (success) {
                msg.reply("소중한 의견 감사합니다! 개발자에게 바로 전송됐어요. 🚀");
            } else {
                // 봇이 그 방에 없거나 세션이 끊긴 경우
                Log.e("전송 실패: '" + FEEDBACK_ROOM + "' 방 세션 없음");
                msg.reply("전송에 실패했어요. \n@chococo_7로 dm주세요.");
            }

        } catch (e) {
            handleError(msg, e, "건의사항 전송");
        }
        return;
    }
});