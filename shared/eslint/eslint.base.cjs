/* Shared ESLint base config for all packages */
module.exports = {
  root: false,
  env: { es2021: true, node: true, browser: false },
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "import", "unused-imports"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript"
  ],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  settings: {
    "import/resolver": {
      typescript: {
        project: ["./apps/*/tsconfig.json", "./packages/*/tsconfig.json"]
      }
    }
  },
  rules: {
    "no-console": "warn",
    "no-debugger": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "unused-imports/no-unused-imports": "warn",
    "import/order": [
      "warn",
      {
        "groups": ["builtin", "external", "internal", "parent", "sibling", "index", "object", "type"],
        "alphabetize": { order: "asc", caseInsensitive: true },
        "newlines-between": "always"
      }
    ]
  },
  ignorePatterns: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/out/**", "**/.next/**", "**/coverage/**"]
};