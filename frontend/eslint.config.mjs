import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@next/next/no-img-element': 'off',
      // React Compiler rules (eslint-plugin-react-hooks v7). The compiler is not
      // enabled, and the flagged patterns - hydrating from localStorage, resetting
      // state when the source image changes - are correct without it. Re-enable
      // these together with `reactCompiler` in next.config.mjs.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
