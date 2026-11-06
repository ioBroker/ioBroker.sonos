import config, { reactConfig } from '@iobroker/eslint-config';

export default [
    ...config,
    ...reactConfig,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['*.js', '*.mjs'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        ignores: ['build/', 'node_modules/', 'vite.config.*'],
    },
    {
        rules: {
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
            // the JSX runtime of React 17+ (`jsx: react-jsx`) needs no `React` in scope
            'react/react-in-jsx-scope': 'off',
            // the base class asks these for the settings, they need not read the element
            'class-methods-use-this': [
                'warn',
                { exceptMethods: ['getStateIds', 'getObjectIds', 'getRoomsNamespace', 'getWantedStateIds'] },
            ],
        },
    },
];
