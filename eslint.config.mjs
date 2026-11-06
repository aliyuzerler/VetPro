import nextPlugin from 'eslint-config-next';

/**
 * VetCore monorepo ESLint (flat config).
 * - apps/web: Next.js + React kuralları
 * - apps/api, apps/worker, packages: typescript-eslint önerileri
 */
const nextFlat = nextPlugin;

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      'apps/mobile/**',
      'extracted/**',
      'upload/**',
      'download/**',
      'skills/**',
      '.zscripts/**',
      'examples/**',
      'mini-services/**',
      'scripts/**',
      'prisma/migrations/**',
      '**/*.config.mjs',
      '**/*.config.js',
      'tests/*.sh',
    ],
  },
  ...nextFlat,
  {
    // Vendored shadcn/ui bileşenleri (Faz 02'de tasarım sistemiyle yeniden ele alınır):
    // react-hooks v6 kuralları shadcn'in kanonik desenlerinde yanlış pozitif üretir.
    files: ['apps/web/src/components/ui/**'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
    },
  },
  {
    files: ['apps/api/**/*.ts', 'apps/worker/**/*.ts', 'packages/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-console': 'warn',
    },
  },
];
