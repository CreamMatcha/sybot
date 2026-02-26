const bot = BotManager.getCurrentBot();
bot.removeAllListeners(); // 이전 리스너 완전 제거

bot.addListener(Event.START_COMPILE, () => {
    bot.removeAllListeners(); // 컴파일 전 한 번 더 제거
});
/**
 * 메시지 수신 이벤트 핸들러
 */
bot.addListener(Event.MESSAGE, (msg) => {
    // 업데이트 성공 여부를 확인하기 위한 간단한 명령어
    if (msg.content === ".테스트23") {
        msg.reply("✅ 원격 업데이트 테스트 성공!\n현재 이 스크립트는 PC에서 전송된 최신 버전입니다.");
    }
});