import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // `_mode` on db.transaction() and friends are deliberately accepted-and-ignored: they keep
    // the libSQL-shaped signature the query layer was written against. Underscore is the
    // conventional "intentionally unused" marker; honour it instead of deleting the parameter
    // (removing `_mode` broke every db.transaction("write") call site).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // lib/pdf renders with @react-pdf/renderer, not the DOM. Its <Image> is a react-pdf
    // primitive that takes `src` and has no `alt` prop at all — the a11y rule is matching on the
    // element name and firing on something that never reaches a browser. Nothing here is
    // navigable by a screen reader; the output is a PDF file.
    files: ["lib/pdf/**"],
    rules: { "jsx-a11y/alt-text": "off" },
  },
]);

export default eslintConfig;
