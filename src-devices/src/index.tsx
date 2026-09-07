// Dev entry point - ONLY used by the Vite dev server (`npm run start`). The production bundle is
// produced by Module Federation from `Components.tsx`; `index.html` and this file are ignored there.
//
// IMPORTANT: `dev-shim` MUST be imported first, because it populates `window.__iobrokerShared__`,
// which `@iobroker/dm-widgets` reads at module-init time. If `App` (which transitively imports
// dm-widgets through the widget files) were evaluated first, dm-widgets would snapshot an empty
// global and `MuiMaterial?.Box` and friends would all be `undefined`.
import './dev-shim';

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
if (container) {
    createRoot(container).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>,
    );
}
