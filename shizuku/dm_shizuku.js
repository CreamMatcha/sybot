/**
 * @description Shizuku ADB 연동 및 특정 봇 원격 업데이트 (GraalJS 최적화)
 * @author 로미 (Original), Hehee (Fix/Update)
 * @environment v0.7.41-alpha (GraalJS)
 * @license CC BY-NC-SA 4.0
 */

const bot = BotManager.getCurrentBot();

/**
 * [중요] 리스너 중복 방지
 * 업데이트 스크립트 자체의 중복 반응을 방지합니다.
 */
bot.removeAllListeners(Event.MESSAGE);

/**
 * Shizuku rish를 이용한 ADB 명령어 실행 함수
 * @param {string} cmd 실행할 ADB 명령어
 */
function adb(cmd) {
    const context = App.getContext();
    const internalDir = context.getFilesDir().getAbsolutePath() + "/bin";
    const sdcardDir = "/sdcard/msgbot/shizuku";

    try {
        const pm = context.getPackageManager();
        const shizukuInfo = pm.getApplicationInfo("moe.shizuku.privileged.api", 0);
        const shizukuLibPath = shizukuInfo.nativeLibraryDir;
        const runtime = java.lang.Runtime.getRuntime();

        // 환경 설정 명령어 배열 생성 및 자바 배열로 변환
        const setupCmd = Java.to([
            "sh", "-c",
            `mkdir -p ${internalDir} && cp ${sdcardDir}/rish* ${internalDir}/ && chmod 755 ${internalDir}/rish`
        ], "java.lang.String[]");
        runtime.exec(setupCmd).waitFor();

        // 실제 실행 명령어 배열 생성 및 자바 배열로 변환
        const execCmd = Java.to([
            "sh", "-c",
            `export LD_LIBRARY_PATH=${shizukuLibPath} && sh ${internalDir}/rish -c '${cmd}'`
        ], "java.lang.String[]");

        const process = runtime.exec(execCmd);
        const out = [];
        const reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream()));
        const errorReader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getErrorStream()));

        let line;
        while ((line = reader.readLine()) !== null) {
            line = String(line);
            if (!line.includes("Android 14+") && !line.includes("permission")) out.push(line);
        }

        while ((line = errorReader.readLine()) !== null) {
            line = String(line);
            if (!line.includes("Android 14+") && !line.includes("permission") &&
                !line.includes("chmod") && !line.includes("librish.so")) {
                out.push(line);
            }
        }

        process.waitFor();
        return out.join("\n").trim();
    } catch (e) {
        return "ADB 실행 중 오류 발생: " + e.toString();
    }
}

/**
 * 메시지 수신 이벤트 핸들러
 */
function onMessage(msg) {
    // 1. ADB 명령어 처리 (디버깅용)
    if (msg.content.startsWith("!adb ")) {
        const command = msg.content.substring(5).trim();
        const adbResult = adb(command);
        msg.reply(adbResult || "실행 완료");
    }

    // 2. PC 원격 업데이트 및 자동 컴파일
    if (msg.content === "!업데이트") {
        // === [설정 영역] ===
        const PC_IP = "14.52.154.27";
        const PORT = "5500";
        const FILENAME = "test_sy.js"; // PC에서 가져올 파일명
        const TARGET_BOT_NAME = "test_sy"; // 업데이트를 적용할 봇의 이름 (폴더명)
        // ===================

        const TARGET_PATH = `/sdcard/msgbot/Bots/${TARGET_BOT_NAME}/${TARGET_BOT_NAME}.js`;

        msg.reply(`🔄 [${TARGET_BOT_NAME}] 코드를 PC에서 가져오는 중...`);

        const downloadCmd = `curl -L http://${PC_IP}:${PORT}/${FILENAME} -o ${TARGET_PATH}`;
        const updateResult = adb(downloadCmd);

        // 결과 확인 및 컴파일
        if (!updateResult.toLowerCase().includes("failed") && !updateResult.toLowerCase().includes("error")) {
            msg.reply(`✅ [${TARGET_BOT_NAME}] 다운로드 성공! 즉시 재컴파일합니다.`);

            try {
                // 지정한 타겟 봇만 새로고침하여 적용합니다.
                BotManager.compile(TARGET_BOT_NAME);
            } catch (e) {
                msg.reply(`⚠️ [${TARGET_BOT_NAME}] 컴파일 실패: ` + e.message);
            }
        } else {
            msg.reply("❌ 업데이트 실패\n" + updateResult);
        }
    }
}

bot.addListener(Event.MESSAGE, onMessage);