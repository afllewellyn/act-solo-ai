import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Supabase edge functions run on Deno, not the browser. Deno provides the
    // `Deno` global, and `@ts-ignore` is the safe directive here — forcing
    // `@ts-expect-error` would become an "unused directive" error once Deno's
    // own types resolve these APIs (e.g. Deno.serve / Deno.connectTls).
    files: ["supabase/functions/**/*.ts"],
    languageOptions: {
      globals: { Deno: "readonly" },
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
    },
  }
);
