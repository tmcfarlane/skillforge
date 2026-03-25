# TypeScript Node Project Setup

Initialize a production-quality TypeScript Node.js project with strict type checking, linting, formatting, testing, and a clean build pipeline. All dependency versions pinned with exact versions (no `^` or `~`).

## When to Use

Start every new TypeScript Node project with this pattern. Prevents type safety drift, ensures reproducible installs, and establishes test infrastructure from day one.

## Steps

1. **Initialize npm**:
   ```bash
   mkdir project-name && cd project-name
   git init
   npm init -y
   ```

2. **Set `"type": "module"`** in `package.json` for ESM. Set `"main": "dist/index.js"`.

3. **Install dev dependencies with exact versions**:
   ```bash
   npm install --save-exact --save-dev \
     typescript@5.7.3 \
     @types/node@22.13.10 \
     tsx@4.21.0 \
     vitest@3.0.8 \
     eslint@9.39.0 \
     prettier@3.5.2 \
     @typescript-eslint/eslint-plugin@8.25.0 \
     @typescript-eslint/parser@8.25.0
   ```

4. **Create `tsconfig.json`** with:
   - `target: ES2022`
   - `moduleResolution: bundler`
   - `strict: true`
   - `exactOptionalPropertyTypes: true`
   - `noUncheckedIndexedAccess: true`
   - `outDir: dist`

5. **Add `package.json` scripts**:
   ```json
   {
     "dev": "tsx watch src/index.ts",
     "build": "tsc --project tsconfig.json",
     "test": "vitest run",
     "typecheck": "tsc --noEmit",
     "lint": "eslint src --ext .ts"
   }
   ```

6. **Create `eslint.config.js`** (flat config format for ESLint 9+) with `@typescript-eslint` rules.

7. **Create `.prettierrc`** with `singleQuote: false`, `trailingComma: all`, `printWidth: 100`.

8. **Create `src/index.ts`** as the entry point.

9. **Run `npm audit`** after every install. Fix any high/critical vulnerabilities before proceeding.

10. **Run `npm run typecheck`** to verify the TypeScript config works before writing logic.

## Security Rules

- Pin all deps with exact versions — no `^` or `~`
- Run `npm audit` after every `npm install`
- No Python dependencies

## Algorithm

```
init git → npm init → install deps (exact) → tsconfig → scripts → eslint → prettier → entry point → audit
```

## Primitives

- validation, data-transform

## Tags

typescript, node, vitest, eslint
