/**
 * @description 원격 업데이트 결과 확인용 테스트 스크립트
 * @author Hehee
 */

const bot = BotManager.getCurrentBot();
/**
 * [중요] 리스너 중복 방지
 * 스크립트가 컴파일될 때마다 기존에 등록된 모든 MESSAGE 리스너를 제거합니다.
 */
bot.removeAllListeners(Event.MESSAGE);
/**
 * 메시지 수신 이벤트 핸들러
 */
bot.addListener(Event.MESSAGE, (msg) => {
    // 업데이트 성공 여부를 확인하기 위한 간단한 명령어
    if (msg.content === ".테스트5") {
        msg.reply("✅ 원격 업데이트 테스트 성공!\n현재 이 스크립트는 PC에서 전송된 최신 버전입니다.");
    }
});