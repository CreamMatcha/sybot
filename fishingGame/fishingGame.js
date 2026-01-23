const bot = BotManager.getCurrentBot();

const ALLOWED_ROOMS = ["아크라시아인의 휴식처"];
const fishingSpots = [
    {
        name: "작은 낚시터",
        level: 1,
        items: ["축축한 편지 뭉치", "이끼 낀 쇳조각", "병에 든 편지"],
        fishes: [
            { name: "브리흐네 잉어", min: 10, max: 20, exp: 10 },
            { name: "은붕어", min: 10, max: 20, exp: 10 }
        ]
    },
    {
        name: "남쪽 성벽 낚시터",
        level: 5,
        items: ["훼손된 계약서", "얼룩덜룩한 옷감", "병에 든 편지"],
        fishes: [
            { name: "무지개 송어", min: 10, max: 40, exp: 20 },
            { name: "은어", min: 10, max: 40, exp: 20 }
        ]
    },
    {
        name: "해변 낚시터",
        level: 10,
        items: ["보석 빠진 반지", "변이된 물보라초", "조개"],
        fishes: [
            { name: "고등어", min: 30, max: 80, exp: 30 },
            { name: "연어", min: 30, max: 80, exp: 30 }
        ]
    },
    {
        name: "옛 낚시터",
        level: 20,
        items: ["부러진 악몽의 검", "사령의 구슬"],
        fishes: [
            { name: "메기", min: 60, max: 120, exp: 40 }
        ]
    },
    {
        name: "하구 낚시터",
        level: 25,
        items: ["오래된 발톱 화석", "용 석상 스케치", "윤이 나는 천 조각", "춤추는 꽃가지"],
        fishes: [
            { name: "농어", min: 100, max: 200, exp: 50 }
        ]
    }
];

const sdcard = android.os.Environment.getExternalStorageDirectory().getAbsolutePath();
const SAVE_PATH = `${sdcard}/FishingGame/user_data.json`;
const userData = loadUserData();

function save(path, content) {
    const folder = path.split("/").slice(0, -1).join("/");
    new java.io.File(folder).mkdirs();
    const file = new java.io.File(path);
    const fos = new java.io.FileOutputStream(file);
    fos.write(new java.lang.String(content).getBytes());
    fos.close();
    Log.d("[SAVE] Data saved to " + path);
}

function read(path) {
    const file = new java.io.File(path);
    if (!file.exists()) return null;
    const br = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(file)));
    let line = br.readLine(), content = line;
    while ((line = br.readLine()) !== null) content += "\n" + line;
    br.close();
    Log.d("[READ] Data read from " + path);
    return content;
}

function loadUserData() {
    Log.d("[LOAD] Loading user data");
    const raw = read(SAVE_PATH);
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        Log.d("[LOAD] User data parsed successfully");
        return parsed;
    } catch (e) {
        Log.e("[ERROR] Failed to parse user data: " + e);
        return {};
    }
}

function saveUserData() {
    Log.d("[SAVE] Saving user data");
    save(SAVE_PATH, JSON.stringify(userData));
}

function getTodayString() {
    const now = new Date();
    const offset = now.getTime() + 9 * 60 * 60 * 1000;
    const today = new Date(offset).toISOString().slice(0, 10);
    Log.d("[DATE] getTodayString => " + today);
    return today;
}

function getExpForLevel(level) {
    const exp = level * 5 + 20;
    Log.d(`[LEVEL] getExpForLevel(${level}) => ${exp}`);
    return exp;
}

function tryLevelUp(user) {
    const data = userData[user];
    while (data.level < 30 && data.exp >= getExpForLevel(data.level)) {
        const required = getExpForLevel(data.level);
        data.exp -= required;
        data.level++;
        Log.d(`[LEVEL UP] ${user} 레벨업! 현재 레벨: ${data.level}`);
    }
}

function getAvailableFishingSpots(level) {
    const available = fishingSpots.filter(function (spot) { return level >= spot.level; });
    Log.d(`[SPOT] getAvailableFishingSpots(${level}) => ${available.map(function (s) { return s.name; }).join(", ")}`);
    return available;
}

function getPrimaryFishingSpot(level) {
    const available = getAvailableFishingSpots(level);
    const spot = available[available.length - 1];
    Log.d(`[SPOT] Primary fishing spot for level ${level} => ${spot.name}`);
    return spot;
}

function getRandomItem(arr) {
    const item = arr[Math.floor(Math.random() * arr.length)];
    Log.d(`[RANDOM] getRandomItem => ${typeof item === "object" ? JSON.stringify(item) : item}`);
    return item;
}

function randomInRange(min, max) {
    const value = Math.floor(Math.random() * (max - min + 1)) + min;
    Log.d(`[RANDOM] randomInRange(${min}, ${max}) => ${value}`);
    return value;
}

function simulateFishing(user) {
    Log.d(`[SIMULATE] simulateFishing() for ${user}`);
    const today = getTodayString();
    if (!userData[user]) {
        Log.d(`[SIMULATE] New user initialized: ${user}`);
        userData[user] = { level: 1, exp: 0, biggestFish: 0, biggestFishName: "", lastFishDate: null, dailyResults: {}, fishCount: {} };
    }
    const data = userData[user];

    if (!data.fishCount) data.fishCount = {};
    if (!data.fishCount[today]) data.fishCount[today] = 0;
    if (data.fishCount[today] >= 2) {
        Log.d(`[SIMULATE] ${user} reached today's fishing limit.`);
        return `${user}님은 오늘 낚시를 2회 진행하셨습니다. 내일 다시 시도해주세요.`;
    }

    data.fishCount[today]++;
    data.lastFishDate = today;
    const level = data.level;
    let totalExp = 0;
    data.dailyResults = { [today]: [] }; // 이전 기록 제거

    function doSingleFishing(index) {
        const currentSpot = getPrimaryFishingSpot(level);
        const availableSpots = getAvailableFishingSpots(level);
        const spot = Math.random() < 0.1 && availableSpots.length > 1 ? getRandomItem(availableSpots.slice(0, -1)) : currentSpot;

        let formatted, exp = 0;
        if (Math.random() < 0.5) {
            const item = getRandomItem(spot.items);
            formatted = item;
            exp = 2;
        } else {
            const fish = getRandomItem(spot.fishes);
            const isSpecial = Math.random() < 0.1;
            const size = isSpecial ? randomInRange(fish.min, fish.max * 2) : randomInRange(fish.min, fish.max);
            formatted = `${isSpecial ? "⭐" : ""}${fish.name} (${size}cm)`;
            exp = isSpecial ? fish.exp * 2 : fish.exp;

            if (!data.biggestFish || data.biggestFish < size) {
                data.biggestFish = size;
                data.biggestFishName = fish.name;
                Log.d(`[FISH] New biggest fish for ${user}: ${fish.name} (${size}cm)`);
            }
        }

        data.dailyResults[today][index] = formatted;
        Log.d(`[SAVE] ${user} - 낚시 결과 저장 [${index}]: ${formatted}`);
        saveUserData();
        return exp;
    }

    totalExp += doSingleFishing(0);
    totalExp += doSingleFishing(1);
    totalExp += doSingleFishing(2);

    data.exp += totalExp;
    tryLevelUp(user);

    const spotName = getPrimaryFishingSpot(data.level).name;
    return `낚시 결과 (Lv.${data.level} - ${spotName}):\n` + data.dailyResults[today].join(", ") + `\n획득한 경험치: ${totalExp}`;
}

function getLevelInfo(user) {
    const data = userData[user];
    if (!data) return `${user}님의 낚시 정보가 없습니다.`;
    return `${user}님의 낚시 레벨: ${data.level} (${data.exp}/${getExpForLevel(data.level)})`;
}

function getRanking() {
    const sorted = Object.keys(userData).map(user => {
        return {
            user: user,
            level: userData[user].level,
            fishSize: userData[user].biggestFish,
            fishName: userData[user].biggestFishName || ""
        };
    }).sort((a, b) => b.fishSize - a.fishSize);

    let result = "🎣 낚시 랭킹 (물고기 크기 기준):\n";
    sorted.forEach((entry, idx) => {
        result += `${idx + 1}. ${entry.user}(${entry.level}) - ${entry.fishSize}cm${entry.fishName ? `(${entry.fishName})` : ""}\n`;
    });

    return result.trim();
}

function getFishingGuide() {
    return (
        "🎣 낚시게임 사용법\n\n" +
        ".낚시 - 하루 1회 자동 3회 낚시 진행\n" +
        ".레벨 - 현재 낚시 레벨 및 경험치 확인\n" +
        ".랭킹 - 물고기 크기 기준 상위 10명 랭킹\n" +
        ".낚시게임 - 낚시게임 규칙 및 명령어 확인\n\n" +
        "🌊 레벨에 따라 낚시터가 해금되며,\n" +
        "특별 물고기(⭐)는 각 물고기마다 10% 확률로 출현,\n" +
        "일반보다 최대 2배 크기로 낚일 수 있습니다."
    );
}


bot.setCommandPrefix(".");
bot.addListener(Event.MESSAGE, function (msg) {
    if (!ALLOWED_ROOMS.includes(room)) return;
    const content = msg.content.trim();
    const user = msg.author.name;

    Log.d(`[EVENT] Message received: ${content} from ${user}`);

    if (content === ".낚시") {
        msg.reply(simulateFishing(user));
    } else if (content === ".레벨") {
        msg.reply(getLevelInfo(user));
    } else if (content === ".랭킹") {
        msg.reply(getRanking());
    } else if (content === ".낚시게임") {
        msg.reply(getFishingGuide());
    } else if (content === ".리셋 0") {
        Object.keys(userData).forEach(function (k) { delete userData[k]; });
        saveUserData();
        Log.d("[RESET] All user data cleared");
        msg.reply("🎣 모든 유저의 낚시 데이터가 초기화되었습니다.");
    }
});

