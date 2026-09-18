import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['out/**', 'dist/**', 'web/**', '**/*.d.ts'],
    },
    {
        files: ['src/**/*.ts'],
        extends: [...tseslint.configs.recommended],
        rules: {
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    selector: 'import',
                    format: ['camelCase', 'PascalCase'],
                },
            ],
            '@typescript-eslint/no-explicit-any': 'off',
            'curly': 'warn',
            'eqeqeq': 'warn',
            'no-throw-literal': 'warn',
            'semi': 'warn',
        },
    },
);
