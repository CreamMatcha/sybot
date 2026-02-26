/**
 * @description Shizuku ADB 연동 및 다중 사용자 원격 업데이트 지원 (캐시 무효화 강화)
 * @author Hehee
 * @environment v0.7.41-alpha (GraalJS)
 * @license CC BY-NC-SA 4.0
 */

const bot = BotManager.getCurrentBot();
let isUpdating = false;

// 리스너 중복 방지
bot.removeAllListeners(Event.MESSAGE);

/**
 * Shizuku rish를 이용한 ADB 명령어 실행 함수
 */
function adb(cmd) {
    const context = App.getContext();
    const internalDir = context.getFilesDir().getAbsolutePath() + "/bin";
    const sdcardDir = "/sdcard/msgbot/shizuku";
    const Runtime = java.lang.Runtime.getRuntime();
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
        const out = [];
        const reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream()));
        const errReader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getErrorStream()));

        let line;
        while ((line = reader.readLine()) !== null) out.push(String(line));
        while ((line = errReader.readLine()) !== null) out.push(String(line));

        const exitCode = process.waitFor();
        return { output: out.join("\n").trim(), exitCode: exitCode };
    } catch (e) {
        return { output: "Error: " + e.toString(), exitCode: -1 };
    }
}

/**
 * 파일의 SHA-256 해시를 가져오는 함수
 */
function getFileHash(path) {
    const res = adb(`sha256sum "${path}" 2>/dev/null`);
    if (res.exitCode !== 0 || !res.output) return null;
    return res.output.split(/\s+/)[0];
}

/**
 * 메시지 수신 이벤트 핸들러
 */
function onMessage(msg) {
    if (msg.content.startsWith("!adb ")) {
        const res = adb(msg.content.substring(5).trim());
        msg.reply(`[Exit ${res.exitCode}]\n${res.output || "결과 없음"}`);
    }

    if (msg.content.startsWith("!업데이트")) {
        if (isUpdating) {
            msg.reply("⚠️ 현재 다른 업데이트가 진행 중입니다.");
            return;
        }

        /* === [다중 사용자 설정 영역] === */
        const IP_MAP = {
            "서윤": "100.85.198.20",
            "댐SLAYER / 니나브": "100.110.179.40"
        };
        const DEFAULT_PORT = "8080";
        const TARGET_BOT_NAME = "test_dm";
        const FILENAME = "test_dm.js";
        /* ============================ */

        const args = msg.content.split(" ");
        let targetIp = IP_MAP[msg.author.name];

        if (args.length > 1 && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(args[1])) {
            targetIp = args[1];
        }

        const TARGET_PATH = `/sdcard/msgbot/Bots/${TARGET_BOT_NAME}/${TARGET_BOT_NAME}.js`;

        // [수정] URL 뒤에 타임스탬프를 추가하여 캐시를 강제로 무효화합니다.
        const timestamp = Date.now();
        const URL = `http://${targetIp}:${DEFAULT_PORT}/${FILENAME}?t=${timestamp}`;

        isUpdating = true;
        msg.reply(`🔄 [${msg.author.name}] 업데이트 확인 중... (ID: ${timestamp})`);

        try {
            const beforeHash = getFileHash(TARGET_PATH);
            const beforeRes = adb(`stat -c "%s" "${TARGET_PATH}" 2>/dev/null`);
            const beforeSize = beforeRes.exitCode === 0 ? beforeRes.output : "0";

            // [수정] curl 명령어에 캐시 방지 헤더(-H)를 추가했습니다.
            const downloadRes = adb(`curl -L -f -sS --connect-timeout 5 -H "Cache-Control: no-cache" -H "Pragma: no-cache" "${URL}" -o "${TARGET_PATH}" 2>&1`);

            if (downloadRes.exitCode !== 0) {
                msg.reply(`❌ 다운로드 실패\nURL: ${URL}\n${downloadRes.output}`);
                isUpdating = false;
                return;
            }

            adb("sync");

            const afterHash = getFileHash(TARGET_PATH);
            const afterRes = adb(`stat -c "%s" "${TARGET_PATH}" 2>/dev/null`);
            const afterSize = afterRes.output;

            if (afterRes.exitCode !== 0 || !afterSize) {
                msg.reply("❌ 업데이트 확인 실패: 파일 생성 오류");
            } else if (beforeHash === afterHash && beforeHash !== null) {
                msg.reply(`⚠️ 변경 사항이 없습니다.\n[상태]: 크기(${afterSize} bytes)와 해시가 동일함.\n\n팁: PC에서 Ctrl+S로 저장했는지, 혹은 서버 자체가 갱신되지 않았는지 확인하세요.`);
            } else {
                const changeMsg = (beforeSize === afterSize)
                    ? `✅ 성공! (내용 변경됨, 크기 동일: ${afterSize}B)`
                    : `✅ 성공! (${beforeSize}B -> ${afterSize}B)`;

                msg.reply(changeMsg);
                BotManager.compile(TARGET_BOT_NAME);
                msg.reply(`🚀 [${TARGET_BOT_NAME}] 리로드 완료!`);
            }
        } catch (e) {
            msg.reply(`⚠️ 오류: ${e.message}`);
        } finally {
            isUpdating = false;
        }
    }
}

bot.addListener(Event.MESSAGE, onMessage);