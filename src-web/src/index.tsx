import React from 'react';
import { createRoot } from 'react-dom/client';

import { createTheme, CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';

import App from './App';

/** Follows the theme of the browser, so the page fits a phone in night mode. */
function Root(): React.JSX.Element {
    const dark = useMediaQuery('(prefers-color-scheme: dark)');
    const theme = React.useMemo(
        () =>
            createTheme({
                palette: {
                    mode: dark ? 'dark' : 'light',
                    primary: { main: '#e31c23' },
                },
            }),
        [dark],
    );

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <App />
        </ThemeProvider>
    );
}

const container = document.getElementById('root');
if (container) {
    createRoot(container).render(
        <React.StrictMode>
            <Root />
        </React.StrictMode>,
    );
}
