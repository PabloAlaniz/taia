import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Global ignores
  {
    ignores: [
      '**/.next/**',
      '**/node_modules/**',
      '**/out/**',
      '**/coverage/**',
      '**/dist/**',
      '**/next-env.d.ts',
      '**/.astro/**',
    ],
  },

  // Next.js rules (react-hooks, core-web-vitals, @next/next) scoped to apps/web
  ...nextCoreWebVitals.map((c) => ({ ...c, files: ['apps/web/**/*.{ts,tsx,js,jsx}'] })),

  // React 19 strict hooks rules
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/immutability': 'error',
      'react-hooks/purity': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // JS config files (CommonJS / ESM)
  {
    files: ['**/*.{js,cjs,mjs}'],
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-assignment': 'error',
      '@typescript-eslint/no-unused-expressions': [
        'error',
        {
          allowTernary: true,
          allowShortCircuit: true,
        },
      ],
    },
  },

  // Tests: relax `any` usage — mocks and stubs need it
  {
    files: ['**/__tests__/**'],
    rules: {
      'no-constant-binary-expression': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Atomic design: ban native elements outside design-system atoms
  {
    files: ['**/*.tsx', '**/*.jsx'],
    ignores: [
      'apps/web/components/atoms/button.tsx',
      'apps/web/components/atoms/icon-button.tsx',
      'apps/web/components/atoms/input.tsx',
      'apps/web/components/atoms/checkbox.tsx',
      'apps/web/components/atoms/select.tsx',
      'apps/web/components/atoms/textarea.tsx',
      'apps/web/components/atoms/theme-toggle.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='button']",
          message:
            'Use <Button> or <IconButton> from @/components/atoms instead of native <button>.',
        },
        {
          selector: "JSXOpeningElement[name.name='input']",
          message: 'Use <Input> from @/components/atoms instead of native <input>.',
        },
        {
          selector: "JSXOpeningElement[name.name='select']",
          message: 'Use <Select> from @/components/atoms instead of native <select>.',
        },
        {
          selector: "JSXOpeningElement[name.name='textarea']",
          message: 'Use <Textarea> from @/components/atoms instead of native <textarea>.',
        },
      ],
    },
  },
)
