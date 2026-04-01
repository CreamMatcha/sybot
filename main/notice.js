/**
 * @description 개발자 전용 공지사항 브로드캐스트 스크립트
 * @environment v0.7.41-alpha (GraalJS)
 *
 * 명령어
 * - !공지 <내용>: 봇이 있는 모든 방에 공지사항을 전송합니다. (관리자 전용)
 * - !방공지 <방이름> | <내용>: 특정 방에만 공지를 전송합니다. (관리자 전용)
 * - !내해시: 본인의 고유 해시값을 확인합니다. (config.json 설정용)
 */




/* ==================== 전역 상수/변수 ==================== */


const bot = BotManager.getCurrentBot();
const PREFIX = "!";

// 설정 파일 경로 (스크립트 폴더 내 config.json)
const CONFIG_PATH = "/sdcard/Sybot/config.json";




/* ==================== 설정(Config) 관리 ==================== */


/** @type {object} 전역 설정 객체 선언 (누락 방지) */
let config = {};

// [설정] config 관련 기본 설정 데이터
const MAIN_DEFAULT_CONFIG = {
    NOTICE_ADMIN_HASH: "공지용 프로필 해시",
    NOTICE_HEADER: "[공지]\n\n"
};

/**
 * @description 설정 파일(config.json)을 불러오거나 누락된 속성을 갱신합니다.
 * @param {string} filePath 파일 경로
 * @param {object} defaultData 기본 설정 데이터
 * @return {object} 로드된 config 객체
 */
function loadConfig(filePath, defaultData) {
    try {
        if (!FileStream.exists(filePath)) {
            FileStream.writeJson(filePath, defaultData);
            Log.i("기본 설정 파일을 생성했습니다: " + filePath);
            return defaultData;
        }

        let loadedData = FileStream.readJson(filePath);
        let isUpdated = false;

        for (let key in defaultData) {
            if (loadedData[key] === undefined) {
                loadedData[key] = defaultData[key];
                isUpdated = true;
            }
        }

        if (isUpdated) {
            FileStream.writeJson(filePath, loadedData);
            Log.i("설정 파일에 누락된 새 항목을 추가했습니다.");
        }

        return loadedData;
    } catch (e) {
        Log.e("설정 로드 중 오류 발생: " + e.message);
        return defaultData;
    }
}

/**
 * @description 봇 초기 세팅 및 설정 로드
 */
function init() {
    config = loadConfig(CONFIG_PATH, MAIN_DEFAULT_CONFIG);
    Log.i("설정 로드 완료!");
}




/* ==================== 메인 로직 ==================== */


/**
 * @description 모든 채팅방에 공지사항을 전송합니다.
 * @param {string} content 전송할 공지 내용
 * @return {object} 전송 결과 통계 { total, success }
 */
function broadcastNotice(content) {
    const rooms = BotManager.getRooms();
    const Thread = java.lang.Thread;

    let successCount = 0;
    const noticeMessage = (config.NOTICE_HEADER || "") + content;

    // 엔진 호환성(syntax error 방지)을 위해 일반 for문 사용
    for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i];

        // bot.send는 해당 방에 세션이 없으면 false를 반환합니다.
        const isSuccess = bot.send(room, noticeMessage);
        if (isSuccess) {
            successCount++;
        }
        // 카카오톡 도배 방지 및 시스템 부하 방지를 위해 짧은 대기(50ms)
        Thread.sleep(50);
    }

    return { total: rooms.length, success: successCount };
}




/* ==================== 이벤트 핸들러 ==================== */


/**
 * @description 명령어 이벤트 핸들러
 * @param {Command} cmd
 */
function onCommand(cmd) {
    // 1. 내 해시 확인 명령어 (관리자 인증값 획득용)
    if (cmd.command === "내해시") {
        if (!cmd.author.hash) {
            cmd.reply("해시값을 가져올 수 없습니다. (안드로이드 11 이상 권장)");
            return;
        }
        cmd.reply(`사용자님의 해시값:\n${cmd.author.hash}\n\n이 값을 config.json의 ADMIN_HASH에 입력하세요.`);
        return;
    }

    // 2. 공지 브로드캐스트 명령어
    if (cmd.command === "공지") {
        try {
            // 관리자 인증 (초기 해시값이거나 일치하지 않으면 차단)
            if (config.NOTICE_ADMIN_HASH === "no_HASH" || cmd.author.hash !== config.NOTICE_ADMIN_HASH) {
                cmd.reply("명령어를 실행할 권한이 없습니다.");
                return;
            }

            // 공지 내용 확인
            const noticeContent = cmd.args.join(" ");
            if (!noticeContent) {
                cmd.reply("공지할 내용을 입력해주세요.\n사용법: !공지 <내용>");
                return;
            }

            // 전송 시작 안내
            cmd.reply("공지 전송을 시작합니다...\n(방 개수에 따라 시간이 소요될 수 있습니다.)");

            // 브로드캐스트 실행
            const result = broadcastNotice(noticeContent);

            // 전송 결과 보고
            cmd.reply(`✅ 공지 전송 완료\n- 전체 방: ${result.total}개\n- 전송 성공: ${result.success}개`);

        } catch (e) {
            Log.e(`${e.name}\n${e.message}\n${e.stack}`);
            cmd.reply("공지 전송 중 오류가 발생했습니다. 로그를 확인해주세요.");
        }
    }

    // 3. 특정 방 공지 명령어
    if (cmd.command === "방공지") {
        try {
            // 관리자 인증
            if (config.NOTICE_ADMIN_HASH === "no_HASH" || cmd.author.hash !== config.NOTICE_ADMIN_HASH) {
                cmd.reply("명령어를 실행할 권한이 없습니다.");
                return;
            }

            // 방 이름과 내용 분리 (기호 '|' 사용)
            const fullArgs = cmd.args.join(" ");
            const splitIdx = fullArgs.indexOf("|");

            if (splitIdx === -1) {
                cmd.reply("형식이 올바르지 않습니다.\n사용법: !방공지 <방이름> | <내용>\n(예: !방공지 개발자방 | 패치 안내)");
                return;
            }

            const targetRoom = fullArgs.substring(0, splitIdx).trim();
            // 엔진 스코프 버그 회피를 위해 변수명 변경 (redeclaration 방지)
            const roomNoticeContent = fullArgs.substring(splitIdx + 1).trim();

            if (!targetRoom || !roomNoticeContent) {
                cmd.reply("방 이름과 공지 내용을 모두 입력해주세요.");
                return;
            }

            // 전송 실행
            cmd.reply(`'${targetRoom}' 방에 공지 전송을 시도합니다...`);
            const roomNoticeMessage = (config.NOTICE_HEADER || "") + roomNoticeContent;

            // bot.send는 세션이 없으면 false를 반환합니다.
            const isSuccess = bot.send(targetRoom, roomNoticeMessage);

            // 전송 결과 보고
            if (isSuccess) {
                cmd.reply(`✅ '${targetRoom}' 방에 공지 전송을 완료했습니다.`);
            } else {
                cmd.reply(`❌ 전송 실패\n봇이 '${targetRoom}' 방에 없거나 최근 알림(세션)이 없을 수 있습니다.`);
            }

        } catch (e) {
            Log.e(`${e.name}\n${e.message}\n${e.stack}`);
            cmd.reply("공지 전송 중 오류가 발생했습니다. 로그를 확인해주세요.");
        }
    }
}


// 봇 초기 세팅 및 리스너 등록
init();
bot.addListener(Event.START_COMPILE, init); // 컴파일 시 설정 갱신
bot.setCommandPrefix(PREFIX);
bot.addListener(Event.COMMAND, onCommand);