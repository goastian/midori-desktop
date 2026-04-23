// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Global ignores
  {
    ignores: [
      'engine/**',
      'build/**',
      'locales/**',
      'node_modules/**',
      'dist/**',
      'obj-*/**',
      // Mozilla pref files use special syntax (pref(), #include) that ESLint cannot parse
      'src/browser/app/profile/**',
    ],
  },

  // Base recommended rules for all JS/MJS files
  js.configs.recommended,

  // Mozilla system module globals (.sys.mjs and .mjs files in src/)
  {
    files: ['src/**/*.mjs', 'src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // Mozilla privileged globals
        ChromeUtils: 'readonly',
        Components: 'readonly',
        Ci: 'readonly',
        Cc: 'readonly',
        Cr: 'readonly',
        Cu: 'readonly',
        Services: 'readonly',
        XPCOMUtils: 'readonly',
        PrivateBrowsingUtils: 'readonly',
        // Mozilla I/O and path utilities
        IOUtils: 'readonly',
        PathUtils: 'readonly',
        // Common Mozilla lazy getters
        console: 'readonly',
        dump: 'readonly',
      },
    },
    rules: {
      // Relax rules for Mozilla-style code
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'off',
    },
  },

  // Scripts at project root level
  {
    files: ['*.js', '*.mjs', 'scripts/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },

  // Disable rules that conflict with Prettier
  eslintConfigPrettier,
];
