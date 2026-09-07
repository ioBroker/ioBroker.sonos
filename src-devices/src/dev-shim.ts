// Dev-only shim for the dm-widgets runtime resolver.
//
// `@iobroker/dm-widgets` re-exports `React`, `MuiMaterial`, `MuiIcons`, `moment` from
// `window.__iobrokerShared__` at MODULE-INIT time. In production the host (ioBroker.devices)
// populates that global before any plugin loads. In this Vite dev harness nobody sets it, so
// `MuiMaterial?.Box` etc. would evaluate to `undefined` and every widget referencing MUI would
// crash with "Element type is invalid".
//
// This file populates the global from the dev environment's real React + MUI instances. It must
// run BEFORE the widget files import `@iobroker/dm-widgets` - which is why `index.tsx` imports
// this module FIRST (ahead of `./App`) and this file itself depends on no widget. ES-module
// evaluation is depth-first along the dependency graph, so this body runs before App's transitive
// imports initialise dm-widgets.
//
// Named imports rather than `import *`: Vite's dependency pre-bundling can wrap a star namespace
// in a way where `.Box`, `.Slider` etc. are not own properties of the namespace object. Building
// the bridge object by hand is bulletproof regardless of how the bundler exposes the module.

import * as ReactRuntime from 'react';
import {
    Box,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    LinearProgress,
    Menu,
    MenuItem,
    Paper,
    Slider,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    Close,
    Link,
    MusicNote,
    PauseRounded,
    PlayArrowRounded,
    Repeat,
    RepeatOne,
    Settings,
    ShuffleRounded,
    SkipNextRounded,
    SkipPreviousRounded,
    SpeakerGroup,
    Tv,
    VolumeOff,
    VolumeUp,
} from '@mui/icons-material';
import momentRuntime from 'moment';
import * as AdapterReact from '@iobroker/gui-components';

const muiMaterial = {
    Box,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    LinearProgress,
    Menu,
    MenuItem,
    Paper,
    Slider,
    Switch,
    TextField,
    Tooltip,
    Typography,
};

const muiIcons = {
    Close,
    Link,
    MusicNote,
    PauseRounded,
    PlayArrowRounded,
    Repeat,
    RepeatOne,
    Settings,
    ShuffleRounded,
    SkipNextRounded,
    SkipPreviousRounded,
    SpeakerGroup,
    Tv,
    VolumeOff,
    VolumeUp,
};

(window as unknown as Record<string, unknown>).__iobrokerShared__ = {
    react: ReactRuntime,
    '@mui/material': muiMaterial,
    '@mui/icons-material': muiIcons,
    moment: momentRuntime,
    '@iobroker/gui-components': AdapterReact,
};

// Sanity log, so opening DevTools immediately shows whether the bridge is wired up.
console.log('[dev-shim] __iobrokerShared__ initialised - Box=', typeof Box, 'PlayArrow=', typeof PlayArrowRounded);
