// The icons both SONOS widgets use, resolved through the host's shared MUI bridge.

import { React, MuiMaterial, MuiIcons } from '@iobroker/dm-widgets';
import type { BoxProps } from '@mui/material';

const Box: React.ComponentType<BoxProps> = MuiMaterial?.Box;

/** Accent of the SONOS brand, the same colour the vis-2 widget set uses as `visSetColor`. */
export const SONOS_RED = '#e31c23';

export interface GlyphProps {
    sx?: BoxProps['sx'];
}

/**
 * An icon from the host's `@mui/icons-material` bridge, with a text glyph as fallback.
 *
 * The host bridges the whole icon namespace, but rendering `undefined` as a component would tear
 * down the entire category - so a missing icon degrades to its glyph instead of to a crash.
 */
export function bridgedIcon(name: string, glyph: string): React.ComponentType<GlyphProps> {
    const Component = (MuiIcons as Record<string, React.ComponentType<GlyphProps>> | undefined)?.[name];
    if (Component) {
        return Component;
    }
    return function GlyphIcon({ sx }: GlyphProps): React.JSX.Element {
        return (
            <Box
                component="span"
                sx={{ lineHeight: 1, ...(sx as object) }}
            >
                {glyph}
            </Box>
        );
    };
}

export const PlayIcon = bridgedIcon('PlayArrowRounded', '▶');
export const PauseIcon = bridgedIcon('PauseRounded', '⏸');
export const PrevIcon = bridgedIcon('SkipPreviousRounded', '⏮');
export const NextIcon = bridgedIcon('SkipNextRounded', '⏭');
export const VolumeIcon = bridgedIcon('VolumeUp', '◉');
export const MutedIcon = bridgedIcon('VolumeOff', '⊘');
export const MusicIcon = bridgedIcon('MusicNote', '♪');
export const TvIcon = bridgedIcon('Tv', '▣');
export const ShuffleIcon = bridgedIcon('ShuffleRounded', '⇄');
export const RepeatIcon = bridgedIcon('Repeat', '↻');
export const RepeatOneIcon = bridgedIcon('RepeatOne', '↺');
export const SpeakerIcon = bridgedIcon('SpeakerGroup', '▤');
export const LinkIcon = bridgedIcon('Link', '⛓');
export const CloseIcon = bridgedIcon('Close', '✕');
export const LibraryIcon = bridgedIcon('LibraryMusic', '☰');
export const StarIcon = bridgedIcon('Star', '★');
export const PlaylistIcon = bridgedIcon('QueueMusic', '≣');
export const FolderIcon = bridgedIcon('Folder', '🗀');
export const BackIcon = bridgedIcon('ArrowBack', '←');
export const SearchIcon = bridgedIcon('Search', '⌕');
export const ClearIcon = bridgedIcon('Clear', '✕');
export const LoginIcon = bridgedIcon('Login', '⇥');
export const HistoryIcon = bridgedIcon('History', '⟲');
