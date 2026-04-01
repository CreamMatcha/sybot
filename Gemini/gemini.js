/**
 * @description 제미나이(Gemini) API 연동 봇
 * @environment v0.7.40-alpha 이상 (Graal JS)
 *
 * 명령어
 * - .제미나이 <질문>: 제미나이에게 질문하고 답변을 출력 (예: .제미나이 안녕!)
 * - .모델확인: 사용 가능한 제미나이 모델 목록 출력
 */

/* ==================== 전역 상수/변수 ==================== */

const bot = BotManager.getCurrentBot();
const PREFIX = ".";

// 파일 경로
const CONFIG_PATH = "/sdcard/Sybot/config.json";

// 자바 클래스 임포트 (GraalJS 권장 방식)
const Jsoup = Java.type("org.jsoup.Jsoup");
const Thread = Java.type("java.lang.Thread");

/** @type {object} 전역 설정 객체 선언 (누락 방지) */
let config = {};

// [설정] config 관련 설정
const MAIN_DEFAULT_CONFIG = {
    GEMINI_API_KEY: "no_GEMINI_API_KEY"
};

/**
 * @description 설정 파일을 불러오거나 생성합니다.
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

function init() {
    config = loadConfig(CONFIG_PATH, MAIN_DEFAULT_CONFIG);
    Log.i("설정 로드 완료!");
}

/* ==================== 유틸/헬퍼 ==================== */

/**
 * @description Gemini API에 HTTP POST 요청을 보내어 답변을 받아옵니다.
 * @param {string} prompt 사용자 질문
 * @return {string} Gemini의 답변 또는 에러 메시지
 */
function askGemini(prompt) {
    Log.d("[Gemini API] 답변 생성 요청 시작..."); // 📝 작동 로그 추가

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${config.GEMINI_API_KEY}`;

    try {
        const requestBody = {
            contents: [{
                parts: [{ text: prompt }]
            }]
        };

        const response = Jsoup.connect(url)
            .ignoreContentType(true)
            .ignoreHttpErrors(true) // 🌟 에러 상세 메시지 확인용
            .header("Content-Type", "application/json")
            .requestBody(JSON.stringify(requestBody))
            .timeout(0) // ⏱️ 타임아웃 무제한 설정
            .post();

        const jsonRes = JSON.parse(response.body().text());

        if (jsonRes.candidates && jsonRes.candidates.length > 0) {
            Log.d("[Gemini API] 답변 생성 완료 성공!"); // 📝 작동 로그 추가
            return jsonRes.candidates[0].content.parts[0].text.trim();
        } else if (jsonRes.error) {
            Log.e("[Gemini API] 서버 에러: " + jsonRes.error.message); // 📝 에러 로그 보강
            return `[API 에러] ${jsonRes.error.message}`;
        } else {
            Log.w("[Gemini API] 예상치 못한 응답 포맷 (답변 없음)"); // 📝 경고 로그 추가
            return "제미나이가 답변을 생성하지 못했습니다.";
        }
    } catch (e) {
        Log.e(`[Gemini API] 호출 실패:\n${e.name}\n${e.message}\n${e.stack}`);
        return "API 호출 중 오류가 발생했습니다. (타임아웃 또는 연결 오류)";
    }
}

/**
 * @description 현재 API 키로 사용 가능한 Gemini 모델 목록 확인
 */
function getAvailableModels() {
    Log.d("[Gemini API] 모델 목록 조회 요청 시작..."); // 📝 작동 로그 추가

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.GEMINI_API_KEY}`;

        // GET 요청으로 모델 목록 가져오기
        const response = Jsoup.connect(url)
            .ignoreContentType(true)
            .ignoreHttpErrors(true)
            .timeout(30000) // ⏱️ 타임아웃 30초 설정
            .get();

        const jsonRes = JSON.parse(response.body().text());

        if (jsonRes.models) {
            Log.d("[Gemini API] 모델 목록 조회 완료 성공!"); // 📝 작동 로그 추가
            // 모델들의 'name' 속성만 추출해서 줄바꿈으로 연결
            const modelNames = jsonRes.models
                .filter(m => m.supportedGenerationMethods.includes("generateContent")) // 텍스트 생성 지원 모델만 필터링
                .map(m => m.name.replace("models/", "")) // "models/" 접두사 제거
                .join("\n");
            return "✅ [사용 가능한 모델 목록]\n" + modelNames;
        } else if (jsonRes.error) {
            Log.e("[Gemini API] 모델 조회 서버 에러: " + jsonRes.error.message); // 📝 에러 로그 보강
            return `[API 에러] ${jsonRes.error.message}`;
        }

        Log.w("[Gemini API] 모델 목록 조회 실패 - 알 수 없는 응답"); // 📝 경고 로그 추가
        return "목록을 불러오지 못했습니다.";
    } catch (e) {
        Log.e("[Gemini API] 모델 조회 중 예외 발생: " + e.message); // 📝 에러 로그 보강
        return `오류 발생: ${e.message}`;
    }
}

/* ==================== 이벤트 핸들러 ==================== */

/**
 * @description 명령어 이벤트 핸들러
 * @param {Command} cmd
 */
function onCommand(cmd) {
    if (cmd.command === "제미나이") {
        const question = cmd.args.join(" ");

        if (!question) {
            cmd.reply("사용법: .제미나이 <질문할 내용>");
            return;
        }

        Log.i(`[명령어 실행] '.제미나이' 호출됨 (질문: ${question})`); // 📝 작동 로그 추가

        // 🧵 메인 스레드 멈춤 방지를 위한 비동기 처리
        new Thread(() => {
            try {
                const answer = askGemini(question);
                cmd.reply(answer);
                Log.i(`[명령어 완료] '.제미나이' 답변 전송 성공`); // 📝 작동 로그 추가
            } catch (e) {
                Log.e(`[명령어 에러] '.제미나이' 처리 중 오류:\n${e.name}\n${e.message}\n${e.stack}`);
                cmd.reply("처리 중 내부 오류가 발생했습니다.");
            }
        }).start();

        return; // 명령어 처리 종료
    }

    if (cmd.command === "모델확인") {
        Log.i(`[명령어 실행] '.모델확인' 호출됨`); // 📝 작동 로그 추가

        // 🧵 네트워크 요청이 포함되어 있으므로 비동기로 처리
        new Thread(() => {
            const list = getAvailableModels();
            cmd.reply(list);
            Log.i(`[명령어 완료] '.모델확인' 전송 성공`); // 📝 작동 로그 추가
        }).start();

        return;
    }
}

/* ==================== 봇 초기화 및 리스너 등록 ==================== */

init();

bot.addListener(Event.START_COMPILE, init);

bot.setCommandPrefix(PREFIX);
bot.addListener(Event.COMMAND, onCommand);