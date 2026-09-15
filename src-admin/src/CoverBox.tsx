import React from 'react';

import { Box } from '@mui/material';

interface CoverBoxProps {
    /** Cover URL - empty when there is no cover. */
    url: string;
    /** Size and shape, used for the cover and for the placeholder alike. */
    style: React.CSSProperties;
    /** Drawn when there is no cover or it does not load - the music note, for example. */
    children: React.ReactNode;
}

interface CoverBoxState {
    /** URL that did not load (404, for example). */
    broken: string;
}

/**
 * The cover as a background image, or the placeholder. A background image has no `onerror`, so the
 * URL is loaded once more with an `Image`: if that fails - the file was removed from the storage, for
 * example - the placeholder is drawn instead. A new URL is tried again.
 */
export default class CoverBox extends React.Component<CoverBoxProps, CoverBoxState> {
    private probe: HTMLImageElement | null = null;

    constructor(props: CoverBoxProps) {
        super(props);
        this.state = { broken: '' };
    }

    componentDidMount(): void {
        this.check();
    }

    componentDidUpdate(prevProps: CoverBoxProps): void {
        if (prevProps.url !== this.props.url) {
            this.check();
        }
    }

    componentWillUnmount(): void {
        this.stopProbe();
    }

    private stopProbe(): void {
        if (this.probe) {
            this.probe.onerror = null;
            this.probe = null;
        }
    }

    private check(): void {
        this.stopProbe();
        const url = this.props.url;
        if (!url || url === this.state.broken) {
            return;
        }
        const probe = new Image();
        probe.onerror = () => {
            if (this.probe === probe) {
                this.probe = null;
                this.setState({ broken: url });
            }
        };
        this.probe = probe;
        probe.src = encodeURI(url);
    }

    render(): React.JSX.Element {
        const { url, style, children } = this.props;
        if (url && url !== this.state.broken) {
            return <div style={{ ...style, backgroundImage: `url("${encodeURI(url)}")` }} />;
        }
        return <Box sx={{ ...style, backgroundColor: 'action.selected' }}>{children}</Box>;
    }
}
