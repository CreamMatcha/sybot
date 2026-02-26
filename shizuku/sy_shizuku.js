/**
 * @description Shizuku ADB 연동 및 특정 봇 원격 업데이트 (파일 변경 검증 강화)
 * @author Hehee
 * @environment v0.7.41-alpha (GraalJS)
 */

const bot = BotManager.getCurrentBot();

// 리스너 중복 방지
bot.removeAllListeners(Event.MESSAGE);

/**
 * Shizuku rish를 이용한 ADB 명령어 실행 함수
 */
function adbDetailed(cmd) {
    const context = App.getContext();
    const internalDir = context.getFilesDir().getAbsolutePath() + "/bin";
    const sdcardDir = "/sdcard/msgbot/shizuku";

    const Runtime = java.lang.Runtime.getRuntime();
    const BufferedReader = java.io.BufferedReader;
    const InputStreamReader = java.io.InputStreamReader;
    const File = java.io.File;

    try {
        const pm = context.getPackageManager();
        const shizukuInfo = pm.getApplicationInfo("moe.shizuku.privileged.api", 0);
        const shizukuLibPath = shizukuInfo.nativeLibraryDir;

        const rishFile = new File(internalDir, "rish");
        if (!rishFile.exists()) {
            const setupCmd = Java.to([
                "sh", "-c",
                `mkdir -p ${internalDir} && cp ${sdcardDir}/rish* ${internalDir}/ && chmod 755 ${internalDir}/rish`
            ], "java.lang.String[]");
            Runtime.exec(setupCmd).waitFor();
        }

        const execCmd = Java.to([
            "sh", "-c",
            `export LD_LIBRARY_PATH=${shizukuLibPath} && sh ${internalDir}/rish -c "${cmd.replace(/"/g, '\\"')}"`
        ], "java.lang.String[]");

        const process = Runtime.exec(execCmd);
        const stdOut = [];
        const stdErr = [];

        const outReader = new BufferedReader(new InputStreamReader(process.getInputStream()));
        const errReader = new BufferedReader(new InputStreamReader(process.getErrorStream()));

        let line;
        while ((line = outReader.readLine()) !== null) stdOut.push(String(line));
        while ((line = errReader.readLine()) !== null) stdErr.push(String(line));

        const exitCode = process.waitFor();

        return {
            output: stdOut.join("\n").trim(),
            error: stdErr.join("\n").trim(),
            exitCode: exitCode
        };
    } catch (e) {
        return {
            output: "",
            error: "Exception: " + e.toString(),
            exitCode: -1
        };
    }
}

/**
 * 메시지 수신 이벤트 핸들러
 */
function onMessage(msg) {
    if (msg.content.startsWith("!adb ")) {
        const command = msg.content.substring(5).trim();
        const res = adbDetailed(command);
        msg.reply(`[Exit ${res.exitCode}]\nOut: ${res.output || "None"}\nErr: ${res.error || "None"}`);
    }

    if (msg.content === "!업데이트") {
        const PC_IP = "121.135.162.225";
        const PORT = "5500";
        const FILENAME = "test_sy.js";
        const TARGET_BOT_NAME = "test_sy";

        const TARGET_PATH = `/sdcard/msgbot/Bots/${TARGET_BOT_NAME}/${TARGET_BOT_NAME}.js`;
        const URL = `http://${PC_IP}:${PORT}/${FILENAME}`;

        msg.reply(`🔄 [${TARGET_BOT_NAME}] 업데이트 검증 모드...`);

        // 1. 업데이트 전 상태 기록 (파일 크기 및 수정 시간)
        const beforeRes = adbDetailed(`stat -c "%s %Y" "${TARGET_PATH}"`);
        const beforeInfo = beforeRes.exitCode === 0 ? beforeRes.output : "파일 없음";

        // 2. 파일 다운로드 시도
        // -f (fail silently) 옵션을 빼서 에러 메시지를 명확히 보고, -o로 덮어쓰기 강제
        const downloadCmd = `curl -L -v --connect-timeout 5 "${URL}" -o "${TARGET_PATH}" 2>&1`;
        const dlRes = adbDetailed(downloadCmd);

        if (dlRes.exitCode !== 0) {
            msg.reply(`❌ 다운로드 중 오류 발생\nCode: ${dlRes.exitCode}\n${dlRes.output}`);
            return;
        }

        // 3. 업데이트 후 상태 확인 및 비교
        const afterRes = adbDetailed(`stat -c "%s %Y" "${TARGET_PATH}"`);
        const afterInfo = afterRes.output;

        if (beforeInfo === afterInfo) {
            msg.reply(`⚠️ [경고] 파일이 바뀌지 않았습니다!\n기존 정보: ${beforeInfo}\n현재 정보: ${afterInfo}\n\n사유 추정: PC 서버에서 같은 파일을 보내주고 있거나, 쓰기 권한 문제입니다.`);
        } else {
            // 4. 내용 확인 (파일 앞부분 100자 출력)
            const previewRes = adbDetailed(`head -c 100 "${TARGET_PATH}"`);
            msg.reply(`✅ 파일 변경 감지!\n[기존]: ${beforeInfo}\n[변경]: ${afterInfo}\n\n[내용 미리보기]:\n${previewRes.output}...`);

            try {
                // 컴파일 전 캐시를 확실히 비우기 위해 강제 재컴파일
                BotManager.compile(TARGET_BOT_NAME);
                msg.reply(`🚀 [${TARGET_BOT_NAME}] 리로드 완료!`);
            } catch (e) {
                msg.reply(`⚠️ 컴파일 에러: ${e.message}`);
            }
        }
    }
}

bot.addListener(Event.MESSAGE, onMessage);