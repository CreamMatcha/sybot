/**
 * @description Shizuku ADB 연동 및 자동 컴파일 기능 (GraalJS 최적화 및 오류 수정)
 * @author 로미 (Original), Hehee (Fix/Update)
 * @environment v0.7.41-alpha (GraalJS)
 * @license CC BY-NC-SA 4.0
 */

const bot = BotManager.getCurrentBot();

/**
 * [중요] 리스너 중복 방지
 * 스크립트가 컴파일될 때마다 기존에 등록된 모든 MESSAGE 리스너를 제거합니다.
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

        // GraalJS에서는 java.lang.Runtime을 직접 참조하는 것이 안정적입니다.
        const runtime = java.lang.Runtime.getRuntime();

        /**
         * [오류 수정] ArrayIndexOutOfBoundsException 방지
         * GraalJS에서 자바 메서드에 배열을 넘길 때는 Java.to()를 사용하여 
         * 명시적으로 자바 타입 배열(String[])로 변환해야 합니다.
         */
        const setupCmd = Java.to([
            "sh", "-c",
            `mkdir -p ${internalDir} && cp ${sdcardDir}/rish* ${internalDir}/ && chmod 755 ${internalDir}/rish`
        ], "java.lang.String[]");

        runtime.exec(setupCmd).waitFor();

        const execCmd = Java.to([
            "sh", "-c",
            `export LD_LIBRARY_PATH=${shizukuLibPath} && sh ${internalDir}/rish -c '${cmd}'`
        ], "java.lang.String[]");

        const process = runtime.exec(execCmd);

        const out = [];
        // 자바 클래스 참조 최적화
        const reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream()));
        const errorReader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getErrorStream()));

        let line;
        // 표준 출력 읽기
        while ((line = reader.readLine()) !== null) {
            line = String(line); // 자바 문자열을 자바스크립트 문자열로 강제 변환
            if (!line.includes("Android 14+") && !line.includes("permission")) {
                out.push(line);
            }
        }

        // 에러 출력 읽기
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
    // 1. ADB 명령어 처리
    if (msg.content.startsWith("!adb ")) {
        const command = msg.content.substring(5).trim();
        msg.reply("명령어를 실행합니다...");
        const adbResult = adb(command);
        msg.reply(adbResult || "실행 완료(결과 데이터 없음)");
    }

    // 2. PC 원격 업데이트 및 자동 컴파일
    if (msg.content === "!업데이트") {
        const PC_IP = "14.52.154.27";
        const PORT = "5500";
        const FILENAME = "test_sy.js";

        const BOT_NAME = test_sy;
        const TARGET_PATH = `/sdcard/msgbot/Bots/${BOT_NAME}/${BOT_NAME}.js`;

        msg.reply("🔄 PC로부터 코드를 가져오는 중...");

        const downloadCmd = `curl -L http://${PC_IP}:${PORT}/${FILENAME} -o ${TARGET_PATH}`;
        const updateResult = adb(downloadCmd);

        // curl의 출력 결과에 에러가 없는지 확인
        if (!updateResult.toLowerCase().includes("failed") && !updateResult.toLowerCase().includes("error")) {
            msg.reply("✅ 업데이트 성공! 자동 컴파일을 시작합니다.");

            try {
                // 현재 봇을 재컴파일하여 변경사항 즉시 적용
                bot.compile();
            } catch (e) {
                msg.reply("⚠️ 자동 컴파일 실패: " + e.message);
            }
        } else {
            msg.reply("❌ 업데이트 실패\n" + updateResult);
        }
    }
}

bot.addListener(Event.MESSAGE, onMessage);