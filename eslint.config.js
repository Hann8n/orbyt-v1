const js = require('@eslint/js');
const typescript = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const reactNative = require('eslint-plugin-react-native');
const reactCompiler = require('eslint-plugin-react-compiler');
const reactPerf = require('eslint-plugin-react-perf');
const prettier = require('eslint-config-prettier');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        __DEV__: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        requestIdleCallback: 'readonly',
        cancelIdleCallback: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        fetch: 'readonly',
        Headers: 'readonly',
        Response: 'readonly',
        RequestInit: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        React: 'readonly',
        NodeJS: 'readonly',
        window: 'readonly',
        AbortController: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      react,
      'react-hooks': reactHooks,
      'react-native': reactNative,
      'react-perf': reactPerf,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // React Compiler adoption is about memoization safety; keep these stricter
      // hook rules as warnings because this app intentionally uses Reanimated
      // SharedValues and sync-effects in a way that would otherwise block lint.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'react-native/no-unused-styles': 'warn',
      'react-native/split-platform-components': 'warn',
      'react-native/no-inline-styles': 'warn',
      'react-native/no-color-literals': 'warn',
      'react-native/no-single-element-style-arrays': 'warn',
      'react/display-name': 'warn',
      'react-perf/jsx-no-new-object-as-prop': 'warn',
      'react-perf/jsx-no-new-array-as-prop': 'warn',
      'react-perf/jsx-no-new-function-as-prop': 'warn',
      'react-perf/jsx-no-jsx-as-prop': 'warn',
      'react/no-array-index-key': 'warn',
      'react/jsx-no-bind': 'warn',
      'react/jsx-no-constructed-context-values': 'warn',
      'react/no-unstable-nested-components': 'warn',
      'react/no-object-type-as-default-prop': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: false }],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  reactCompiler.configs.recommended,
  prettier,
  // Phase 3: keep api/* free of facade imports (avoids cycles; use AtprotoCore / leaf utils).
  {
    files: ['src/services/api/**/*.ts', 'src/services/api/**/*.tsx'],
    ignores: ['src/services/api/AtprotoService.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                './AtprotoService',
                '../AtprotoService',
                '../../AtprotoService',
                '../../../AtprotoService',
                '@/services/api/AtprotoService',
              ],
              message:
                'API namespace modules must not import the AtprotoService facade; use AtprotoCore, leaf modules (inFlightDedup, pdsEndpointResolver), or peer services.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/components/features/feed/ListFeedView.tsx'],
    rules: {
      // Reanimated: SharedValue `.value` updates in worklets / scroll handlers are intentional.
      'react-hooks/immutability': 'off',
    },
  },
  {
    files: [
      '**/*.test.{js,jsx,ts,tsx}',
      '**/*.spec.{js,jsx,ts,tsx}',
      '**/*.perf-test.{js,jsx,ts,tsx}',
      '**/__tests__/**/*.{js,jsx,ts,tsx}',
      'jest.setup.js',
    ],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
  {
    ignores: [
      'node_modules/**',
      'ios/**',
      'android/**',
      '.expo/**',
      'dist/**',
      'build/**',
      '*.config.js',
      'babel.config.js',
      'metro.config.js',
      'jest.config.js',
      'docs/**',
    ],
  },
];
