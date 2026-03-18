import globals from 'globals'
import eslintJs from '@eslint/js'
import prettierPlugin from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'

const rules = {
  ...eslintJs.configs.recommended.rules,
  'no-unused-vars': 'warn',
  'no-unreachable': 'warn',
}

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    files: ['vite.config.js', 'vite/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: 2021,
      sourceType: 'module', // Ensure ES module imports
    },
    rules,
  },
  {
    files: ['src/js/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser },
      ecmaVersion: 2021,
      sourceType: 'module', // Ensure ES module imports
    },
    rules,
    settings: {
      'import/resolver': {
        alias: {
          map: [['src', './src']],
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },
  },
  {
    files: ['src/pages/**/*.{js,jsx}', 'src/components/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      ecmaVersion: 2021,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      ...rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'warn',
      'no-undef': 'error', // This will catch undefined variables like 'Test'
      // For JSX files, ignore PascalCase variables (components) and the jsx pragma
      'no-unused-vars': [
        'warn',
        {
          varsIgnorePattern: '^[A-Z]|^h$|^Fragment$',
          argsIgnorePattern: '^_',
        },
      ],
    },
    settings: {
      'import/resolver': {
        alias: {
          map: [['src', './src']],
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },
  },
]
