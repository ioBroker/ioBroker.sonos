// Dev-only replacement for `@iobroker/dm-widgets` - referenced through a `resolve.alias` in
// `vite.config.ts`, so the widget files can keep their normal
// `import { MuiMaterial } from '@iobroker/dm-widgets'` and still get a working bridge when the
// widgets run standalone.
//
// Why the import paths look unusual:
//   - The alias redirects the bare specifier `@iobroker/dm-widgets` to THIS file. Re-exporting
//     from the bare specifier here would resolve back into this very file - an import cycle in
//     which `WidgetGeneric` ends up being the module namespace, and React fails with
//     "Class extends value [object Module] is not a constructor or null".
//   - The alias regex is anchored (`^@iobroker\/dm-widgets$`), so SUB-PATH imports such as
//     `@iobroker/dm-widgets/build/index.js` are not intercepted. Reaching the runtime values
//     through the sub-path therefore gives us the real module.

import * as ReactRuntime from 'react';
import * as MuiMaterialAll from '@mui/material';
import * as MuiIconsAll from '@mui/icons-material';
import momentRuntime from 'moment';
import * as AdapterReactRuntime from '@iobroker/gui-components';

export { WidgetGeneric, default, isNeumorphicTheme, StateContext } from '@iobroker/dm-widgets/build/index.js';

/**
 * The packaged `getTileStyles` is a compile-time stub returning `{}` - the real card background
 * and border come from the host at runtime. For the standalone harness it is approximated here,
 * so the widget is not shown floating on a bare page.
 */
export function getTileStyles(
    _theme: unknown,
    isActive: boolean,
    accentColor?: string,
): Record<string, unknown> {
    return {
        backgroundColor: isActive ? 'rgba(227, 28, 35, 0.10)' : 'rgba(255, 255, 255, 0.04)',
        border: `1px solid ${accentColor || (isActive ? 'rgba(227, 28, 35, 0.45)' : 'rgba(255, 255, 255, 0.12)')}`,
        borderRadius: '12px',
        transition: 'background-color 0.25s ease, border-color 0.25s ease',
        color: '#e6eaef',
    };
}

export type {
    WidgetGenericProps,
    WidgetGenericState,
    WidgetSettingsBase,
    WidgetInfo,
    CategoryInfo,
    CustomWidgetBase,
    CustomWidgetPlugin,
    CustomWidgetType,
    DeviceStatus,
    DevicesDetectorState,
    DevicesPatternControl,
    ItemInfo,
    IndicatorValues,
    ChartSeries,
    ExtraInfoEntry,
    StateChangeListener,
    ObjectChangeListener,
    IStateContext,
} from '@iobroker/dm-widgets';

// Replace the host-bridged values with the dev environment's real modules.
export const React = ReactRuntime;
export const MuiMaterial = MuiMaterialAll;
export const MuiIcons = MuiIconsAll;
export const moment = momentRuntime;
export const AdapterReact = AdapterReactRuntime;
