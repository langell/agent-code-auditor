import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginN from 'eslint-plugin-n';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslintPluginSecurity from 'eslint-plugin-security';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginN.configs['flat/recommended-module'],
  eslintPluginSecurity.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    ignores: ['dist/', 'node_modules/', 'test-project/'],
  },
  {
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off'
    }
  }
);
