/**
 * @description 로스트아크 유물 각인서 시세 조회 스크립트
 * @environment MessengerBotR (GraalJS v0.7.40+)
 */

const bot = BotManager.getCurrentBot();

/* ==================== [설정] ==================== */

// 로스트아크 API 키
const LOSTARK_API_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6IktYMk40TkRDSTJ5NTA5NWpjTWk5TllqY2lyZyIsImtpZCI6IktYMk40TkRDSTJ5NTA5NWpjTWk5TllqY2lyZyJ9.eyJpc3MiOiJodHRwczovL2x1ZHkuZ2FtZS5vbnN0b3ZlLmNvbSIsImF1ZCI6Imh0dHBzOi8vbHVkeS5nYW1lLm9uc3RvdmUuY29tL3Jlc291cmNlcyIsImNsaWVudF9pZCI6IjEwMDAwMDAwMDAyNTQ2NjAifQ.E9LoI03kRumrluMGtS5G1XlIH0sRY7-xRWaa6G_-t_X5mhoeJqEsyz-aknmSFf8BbVX00S8Gl7TibmaQCwY5nbMARPLwfhJJ_kN3u1euaf0PWnr4hI-WnsSqt0fDfv5OWcXDaAaY21-lJwSSst9JhQbQlnvBB4dH9le0tl4ZSn_DWsvrHk972MSPJYZuHt3oggsnaD2_X8fDEjHpv3UDV1im7DWmCKUlSk-60I9al4OKxxOvaJCtAcz5rAOrEDj1XyrxaLwfvFF5jBVZiZygot6VjnuFdfyP0fmz2lKmzloXWekquDjL4mWLnubkSm5JkZvQbdS1vm2mVPu6_bFULA";

// 봇이 동작할 방 목록 (비어있으면 모든 방에서 동작)
const ALLOWED_ROOMS = [];

// Java 클래스 로드
const Jsoup = Java.type("org.jsoup.Jsoup");
const Connection = Java.type("org.jsoup.Connection");


/* ==================== [유틸리티] ==================== */

/**
 * @description API 응답 데이터의 천 단위 콤마 포맷
 * @param {number|string} num 
 * @returns {string}
 */
function formatNumber(num) {
    if (!num) return "0";
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * @description Jsoup을 이용한 API 요청 함수
 * @param {string} urlStr 
 * @param {object} headers 
 * @param {object} bodyObj 
 * @returns {object} { code, body }
 */
function fetchLostarkApi(urlStr, headers, bodyObj) {
    try {
        const response = Jsoup.connect(urlStr)
            .header("accept", headers["accept"])
            .header("authorization", headers["authorization"])
            .header("Content-Type", headers["Content-Type"])
            .requestBody(JSON.stringify(bodyObj))
            .ignoreContentType(true) // JSON 응답 허용
            .ignoreHttpErrors(true)  // 에러 발생 시에도 body 읽기 허용
            .method(Connection.Method.POST)
            .execute();

        return {
            code: response.statusCode(),
            body: response.body()
        };
    } catch (e) {
        return {
            code: -1,
            body: e.message
        };
    }
}


/* ==================== [이벤트 핸들러] ==================== */

/**
 * @description 메시지 수신 이벤트
 */
bot.addListener(Event.MESSAGE, (msg) => {
    // 1. 방 제한 확인
    if (ALLOWED_ROOMS.length > 0 && !ALLOWED_ROOMS.includes(msg.room)) return;

    const content = msg.content.trim();

    // 명령어 확인: .유각 또는 .ㅇㄱ
    if (content === ".유각" || content === ".ㅇㄱ" || content === ".ㅂㅆㅇㄱ") {
        try {
            const url = "https://developer-lostark.game.onstove.com/markets/items";

            const headers = {
                "accept": "application/json",
                "authorization": `bearer ${LOSTARK_API_KEY}`,
                "Content-Type": "application/json"
            };

            const body = {
                "Sort": "CURRENT_MIN_PRICE",
                "SortCondition": "DESC",
                "CategoryCode": 40000,
                "ItemGrade": "유물",
                "PageNo": 1
            };

            const response = fetchLostarkApi(url, headers, body);

            if (response.code === 200) {
                const data = JSON.parse(response.body);
                const items = data.Items;

                if (!items || items.length === 0) {
                    msg.reply("현재 검색된 유물 각인서가 없습니다.");
                    return;
                }

                let resultMsg = "유각 시세\n\n";
                const limit = Math.min(items.length, 10);

                for (let i = 0; i < limit; i++) {
                    const item = items[i];
                    // 이름 정제
                    const cleanName = item.Name
                        .replace(" 각인서", "")
                        .replace("유물 ", "")
                        .trim();

                    const price = formatNumber(item.CurrentMinPrice);
                    resultMsg += `\n${cleanName}: ${price}`;
                }

                msg.reply(resultMsg.trim());

            } else if (response.code === 401) {
                msg.reply("⚠️ API 키가 만료되었거나 올바르지 않습니다.");
            } else {
                Log.e(`[Lostark API] Error: ${response.code}\n${response.body}`);
                msg.reply(`❌ 거래소 조회 실패 (코드: ${response.code})`);
            }

        } catch (e) {
            Log.e(`[Script Error] ${e.stack}`);
            msg.reply("앗차차! 뭔가 잘못됐어요..");
        }
    }
});