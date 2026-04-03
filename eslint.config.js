import js from "@eslint/js";
import globals from "globals";

/** @type {import('eslint').Linter.Config[]} */
export default [
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,

        // 메신저봇R API2 전역 객체
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
        MediaSender: "readonly",

        // GraalJS/Java 관련
        Java: "readonly",
        Packages: "readonly",
        java: "readonly",
        org: "readonly",
        com: "readonly",
        javax: "readonly",

        // 레거시 API
        Api: "readonly",
        Bridge: "readonly",
        Utils: "readonly",
        DataBase: "readonly",
        response: "readonly",
        onStartCompile: "readonly",
        onNotificationPosted: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "warn",
    },
  },
];