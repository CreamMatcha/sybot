const bot = BotManager.getCurrentBot();
const ALLOWED_ROOMS = ["테스트1", "아크라시아인의 휴식처"];

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
        var br = new java.io.BufferedReader(isr);

        // 첫 줄 읽기
        var temp_br = br.readLine();
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

// -------------------------
const FOOD_FILE = "sdcard/Sybot/foodList.json";
let foodList = [];
const roomCache = {};

let help = (
    "--------------------------------\n" +
    "ㅈㅁㅊ, 점메추, 저메추\n" +
    "~~ 확률은?\n" +
    "--------------------------------"
);

// 스크립트 로드 시점에 파일에서 메뉴 목록 읽기
function loadFoodList() {
    try {
        const text = read(FOOD_FILE);
        if (!text || typeof text !== "string") {
            Log.e("[Food] 메뉴 파일을 읽지 못했어요: " + FOOD_FILE);
            foodList = [];
            return;
        }

        const arr = JSON.parse(text);

        if (!Array.isArray(arr)) {
            Log.e("[Food] 메뉴 파일 형식이 배열이 아니에요.");
            foodList = [];
            return;
        }

        // 문자열만 남기고 양쪽 공백 제거
        foodList = arr
            .filter(v => typeof v === "string")
            .map(v => v.trim())
            .filter(v => v.length > 0);

        Log.i("[Food] 메뉴 " + foodList.length + "개 로드 완료");
    } catch (e) {
        Log.e("[Food] 메뉴 파일 파싱 실패: " + e);
        foodList = [];
    }
}
loadFoodList();

function getRandomFood() {
    if (!Array.isArray(foodList) || foodList.length === 0) {
        return null;
    }
    return foodList[Math.floor(Math.random() * foodList.length)];
}
function onMessage(msg) {
    Log.i(`[Log] 메시지 수신: 방='${msg.room}', 보낸 사람='${msg.author.name}', 내용='${msg.content}'`);

    if (!ALLOWED_ROOMS.includes(room)) return;

    const content = msg.content.trim();

    var mHelp = content.match(/^\.?명령어$/);
    if (mHelp) {
        msg.reply(help);
        return;
    }

    // 메뉴 추천
    var mMenu = content.match(/^\.?(ㅈㅁㅊ|점메추|저메추)$/);
    if (mMenu) {
        const food = getRandomFood();
        if (food) {
            msg.reply(`🍽️ ${food}`);
        } else {
            msg.reply("🍽️ 등록된 메뉴가 없어요. 메뉴 파일을 확인해 주세요!");
        }
        return;
    }

    var mVs = content.match(/\(([^()]+)\)\s*vs\s*\(([^()]+)\)/i);
    if (mVs) {
        var left = mVs[1].trim();
        var right = mVs[2].trim();

        var choice = Math.random() < 0.5 ? left : right;
        msg.reply(choice);
        return;
    }

    var mVsPlain = content.match(/^(.+)\s*vs\s*(.+)$/i);
    if (mVsPlain) {
        var left2 = mVsPlain[1].trim();
        var right2 = mVsPlain[2].trim();

        // 둘 중 하나 랜덤 선택
        var choice2 = Math.random() < 0.5 ? left2 : right2;
        msg.reply(choice2);
        return;
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