const bot = BotManager.getCurrentBot();

/************************************************************
 * [설정] 로스트아크 API 키
 ************************************************************/
const LOSTARK_API_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6IktYMk40TkRDSTJ5NTA5NWpjTWk5TllqY2lyZyIsImtpZCI6IktYMk40TkRDSTJ5NTA5NWpjTWk5TllqY2lyZyJ9.eyJpc3MiOiJodHRwczovL2x1ZHkuZ2FtZS5vbnN0b3ZlLmNvbSIsImF1ZCI6Imh0dHBzOi8vbHVkeS5nYW1lLm9uc3RvdmUuY29tL3Jlc291cmNlcyIsImNsaWVudF9pZCI6IjEwMDAwMDAwMDAyNTQ2NjAifQ.E9LoI03kRumrluMGtS5G1XlIH0sRY7-xRWaa6G_-t_X5mhoeJqEsyz-aknmSFf8BbVX00S8Gl7TibmaQCwY5nbMARPLwfhJJ_kN3u1euaf0PWnr4hI-WnsSqt0fDfv5OWcXDaAaY21-lJwSSst9JhQbQlnvBB4dH9le0tl4ZSn_DWsvrHk972MSPJYZuHt3oggsnaD2_X8fDEjHpv3UDV1im7DWmCKUlSk-60I9al4OKxxOvaJCtAcz5rAOrEDj1XyrxaLwfvFF5jBVZiZygot6VjnuFdfyP0fmz2lKmzloXWekquDjL4mWLnubkSm5JkZvQbdS1vm2mVPu6_bFULA";

// [설정] 봇이 동작할 방 목록
const ALLOWED_ROOMS = ["테스트1"];


/************************************************************
 * [유틸] HTTP POST 요청 함수 (거래소 조회용)
 ************************************************************/
function httpPost(urlStr, headers, bodyObj) {
    var conn = null;
    try {
        var url = new java.net.URL(urlStr);
        conn = url.openConnection();
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(5000);

        for (var k in headers) {
            conn.setRequestProperty(k, headers[k]);
        }

        var os = conn.getOutputStream();
        var writer = new java.io.BufferedWriter(new java.io.OutputStreamReader(os, "UTF-8"));
        writer.write(JSON.stringify(bodyObj));
        writer.flush();
        writer.close();

        var code = conn.getResponseCode();
        var stream = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
        var reader = new java.io.BufferedReader(new java.io.InputStreamReader(stream, "UTF-8"));
        var response = "";
        var line;
        while ((line = reader.readLine()) !== null) response += line;
        reader.close();

        return { code: code, body: response };
    } catch (e) {
        return { code: -1, body: e.toString() };
    } finally {
        if (conn != null) conn.disconnect();
    }
}

// 천 단위 콤마 포맷
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/************************************************************
 * [메인] 명령어 처리 리스너
 ************************************************************/
bot.addListener(Event.MESSAGE, function (msg) {
    // 1. 방 제한
    if (ALLOWED_ROOMS.length > 0 && ALLOWED_ROOMS.indexOf(msg.room) === -1) return;

    var content = msg.content.trim();

    // ---------------------------------------------------------
    // 기능: 유물 각인서 비싼 순 조회 (.유각)
    // ---------------------------------------------------------
    if (content === ".유각" || content === ".ㅇㄱ") {

        try {
            var url = "https://developer-lostark.game.onstove.com/markets/items";

            // 헤더
            var headers = {
                "accept": "application/json",
                "authorization": "bearer " + LOSTARK_API_KEY,
                "content-Type": "application/json"
            };

            // 요청 바디 (검색 조건)
            var body = JSON.stringify({
                "Sort": "CURRENT_MIN_PRICE",
                "SortCondition": "DESC",
                "CategoryCode": 40000,
                "ItemGrade": "유물",
                "PageNo": 1,
            });

            var response = httpPost(url, headers, body);

            if (response.code === 200) {
                var data = JSON.parse(response.body);
                var items = data.Items; // 결과 배열

                if (!items || items.length === 0) {
                    msg.reply("검색된 유물 각인서가 없어요. (조건을 확인해주세요)");
                    return;
                }

                // 결과 메시지 만들기 (Top 10만 출력)
                var resultMsg = "◦ 유각 시세 Top 10\n\n";

                var limit = Math.min(items.length, 10);
                for (var i = 0; i < limit; i++) {
                    var item = items[i];

                    // 예: "유물 원한 각인서" -> "원한"
                    var name = item.Name.replace(" 각인서", "").replace("유물 ", "").replace("유물", "").trim();
                    var price = formatNumber(item.CurrentMinPrice);

                    // [수정됨] 끝에 줄바꿈(\n) 추가
                    resultMsg += name + " : " + price + "\n";
                }

                msg.reply(resultMsg.trim());

            } else {
                Log.e("[Market] 조회 실패: " + response.code + " / " + response.body);
                msg.reply("거래소 조회에 실패했어요. (상태코드: " + response.code + ")");
            }

        } catch (e) {
            Log.e("[Market] 스크립트 에러: " + e);
            msg.reply("앗차차! 뭔가 잘못됐어요..");
        }
    }
});