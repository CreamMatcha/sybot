import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },

    languageOptions: {
      globals: {
        ...globals.node,    // Node.js 기본 변수 (require, module 등)
        ...globals.browser, // 브라우저 변수 (setTimeout, console 등 메신저봇에서 지원하는 일부 겹침)

        // ==========================================
        // 1. 메신저봇R API2 주요 전역 객체
        // ==========================================
        BotManager: "readonly",
        Event: "readonly",
        Log: "readonly",
        GlobalLog: "readonly",
        FileStream: "readonly",
        AppData: "readonly",
        Device: "readonly",
        Http: "readonly",
        Security: "readonly",
        Broadcast: "readonly",
        Database: "readonly",
        App: "readonly",
        MediaSender: "readonly", // v0.7.40+ 내장

        // ==========================================
        // 2. GraalJS Java 접근 관련 내장 객체
        // ==========================================
        Java: "readonly",
        Packages: "readonly",
        java: "readonly",
        org: "readonly",
        com: "readonly",
        javax: "readonly",

        // ==========================================
        // 3. 레거시(Legacy) API 전역 객체 (하위 호환)
        // ==========================================
        Api: "readonly",
        Bridge: "readonly",
        Utils: "readonly",
        DataBase: "readonly", // 레거시 대문자 B

        // 레거시 메인 함수명 (필요 시 유지, API2만 쓴다면 제거 권장)
        response: "readonly",
        onStartCompile: "readonly",
        onNotificationPosted: "readonly",
      }
    }
  },
  {
    rules: {
      "no-undef": "error",         // 선언되지 않은 변수 체크
      "no-unused-vars": "warn",    // 사용하지 않는 변수 경고
    }
  }
]);