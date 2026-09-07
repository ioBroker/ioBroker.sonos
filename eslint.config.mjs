// ioBroker eslint template configuration file for js and ts files
import config from '@iobroker/eslint-config';

export default [
    ...config,
    {
        languageOptions: {
            parserOptions: {
                allowDefaultProject: {
                    allow: ['*.js', '*.mjs'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        // disable temporary the rule 'jsdoc/require-param' and enable 'jsdoc/require-jsdoc'
        rules: {
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
            'jsdoc/check-param-names': 'off',
        },
    },
    {
        ignores: [
            'build/**/*',
            'admin/**/*',
            'test/**/*',
            'widgets/**/*',
            // the three front-ends are built separately and have their own tsconfig
            'src-widgets/**/*',
            'src-admin/**/*',
            'src-devices/**/*',
            '**/*.mjs',
        ],
    },
];
