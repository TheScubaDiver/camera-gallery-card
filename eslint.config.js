import js from "@eslint/js";
import tseslint from "typescript-eslint";
import litPlugin from "eslint-plugin-lit";
import wcPlugin from "eslint-plugin-wc";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "dev/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{js,ts}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        __VERSION__: "readonly",
      },
    },
    plugins: {
      lit: litPlugin,
      wc: wcPlugin,
    },
    rules: {
      ...litPlugin.configs.recommended.rules,
      ...wcPlugin.configs.recommended.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-console": ["warn", { allow: ["info", "warn", "error"] }],
    },
  },
  {
    // The legacy 12k-line blob is exempt from strict rules until it's broken
    // up into focused modules (see migration plan). New modules under src/
    // get the strict rules from the block above.
    files: ["src/index.js"],
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off",
      "no-useless-escape": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-this-alias": "off",
      "wc/guard-super-call": "off",
      "wc/no-constructor-attributes": "off",
      "wc/no-self-class": "off",
      "lit/no-legacy-template-syntax": "off",
      "lit/no-template-arrow": "off",
      "lit/no-this-assign-in-render": "off",
      "lit/no-property-change-update": "off",
      "lit/attribute-value-entities": "off",
    },
  },
  {
    files: [
      "rollup.config.js",
      "eslint.config.js",
      "*.config.{js,mjs,cjs}",
      "scripts/**/*.{js,mjs,cjs}",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
    },
  },
];
