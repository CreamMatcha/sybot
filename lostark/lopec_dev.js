// [test_kakao.js]
// 카카오링크 기능 개발 서버(3101) 테스트용 스크립트

// ★중요★: 구글 클라우드 VM의 [외부 IP]를 여기에 적으세요.
// 예: "http://34.64.xxx.xxx:3101"
const DEV_SERVER_URL = "http://34.64.244.233:3101";

function response(room, msg, sender, isGroup, replier, imageDB, packageName) {
    // 명령어: .카링테스트
    if (msg == ".카링테스트") {
        try {
            replier.reply("🚀 3101번 개발 서버로 요청을 보냅니다...");

            // 1. 보낼 데이터 준비 (방 이름, 제목, 설명)
            // 방 이름(room)은 한글일 수 있으니 인코딩(encodeURIComponent) 필수!
            var params = "?room=" + encodeURIComponent(room)
                + "&title=" + encodeURIComponent("테스트 제목")
                + "&desc=" + encodeURIComponent("테스트 내용입니다.");

            // 2. 서버로 GET 요청 보내기
            var targetUrl = DEV_SERVER_URL + "/kakao/send" + params;
            var resultJson = org.jsoup.Jsoup.connect(targetUrl)
                .ignoreContentType(true) // JSON 응답을 받기 위해 필수
                .get()
                .text();

            // 3. 결과 확인
            var result = JSON.parse(resultJson);

            if (result.ok) {
                replier.reply("✅ 서버 응답: 전송 성공!");
            } else {
                replier.reply("❌ 서버 응답 에러: " + result.msg);
            }

        } catch (e) {
            replier.reply("⛔ 연결 실패!\n이유: " + e + "\n\n(혹시 방화벽 3101번을 안 열었거나 IP가 틀렸는지 확인하세요)");
            Log.e(e);
        }
    }
}