import { useEffect, useRef, useState, type CSSProperties, type JSX, type ReactNode } from 'react';

import { Icon, type IconName } from './icons';
import { getImageCandidates, rememberImage } from './images';

interface ButtonProps {
    icon: IconName;
    title: string;
    onClick: () => void;
    /** e.g. `main` for the big play button, `small` */
    className?: string;
    /** Shuffle, repeat, mute while they are on: drawn in the accent color */
    active?: boolean;
    disabled?: boolean;
    children?: ReactNode;
}

/** A round button with an icon; with children a pill with the icon and the text */
export function Button(props: ButtonProps): JSX.Element {
    const classes = [props.children ? 'pill' : 'icon'];
    if (props.className) {
        classes.push(props.className);
    }
    if (props.active) {
        classes.push('active');
    }
    return (
        <button
            type="button"
            className={classes.join(' ')}
            title={props.title}
            aria-label={props.title}
            aria-pressed={props.active === undefined ? undefined : props.active}
            disabled={props.disabled}
            onClick={e => {
                // a button inside a clickable area answers alone
                e.stopPropagation();
                props.onClick();
            }}
        >
            <Icon name={props.icon} />
            {props.children}
        </button>
    );
}

interface SliderProps {
    value: number;
    max: number;
    step?: number;
    label: string;
    disabled?: boolean;
    /** Called once the user lets go, not while dragging */
    onCommit: (value: number) => void;
    /** While the user drags: the value under the thumb; null once the state followed */
    onPreview?: (value: number | null) => void;
}

/**
 * A slider that writes when the user lets go. What the user picked stays shown for a moment, until the state
 * follows - otherwise the thumb would jump back to the old value first.
 */
export function Slider({ value, max, step, label, disabled, onCommit, onPreview }: SliderProps): JSX.Element {
    const [local, setLocal] = useState<number | null>(null);
    const ref = useRef<HTMLInputElement>(null);
    const callbacks = useRef({ onCommit, onPreview });
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        callbacks.current = { onCommit, onPreview };
    });

    useEffect(() => {
        const input = ref.current;
        if (!input) {
            return undefined;
        }
        // `change` of the DOM fires when the user lets go (or with each key), unlike `onChange` of React
        const onChange = (): void => {
            callbacks.current.onCommit(Number(input.value));
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
                setLocal(null);
                callbacks.current.onPreview?.(null);
            }, 2000);
        };
        input.addEventListener('change', onChange);
        return () => {
            input.removeEventListener('change', onChange);
            clearTimeout(timer.current);
        };
    }, []);

    const shown = Math.min(max, Math.max(0, local ?? value));
    const fill = max > 0 ? (shown / max) * 100 : 0;
    return (
        <input
            ref={ref}
            type="range"
            min={0}
            max={max}
            step={step || 1}
            value={shown}
            disabled={disabled}
            aria-label={label}
            title={label}
            style={{ '--fill': `${fill}%` } as CSSProperties}
            onClick={e => e.stopPropagation()}
            onChange={e => {
                clearTimeout(timer.current);
                const next = Number(e.currentTarget.value);
                setLocal(next);
                onPreview?.(next);
            }}
        />
    );
}

/**
 * A cover, or an icon when there is none or it cannot be loaded. A path of the file storage is tried under every
 * root a host may serve it at, see `images.ts`; the cover shown so far stays until the next one loaded.
 */
export function Cover({ url, icon, className }: { url: string; icon: IconName; className?: string }): JSX.Element {
    const [shown, setShown] = useState<{ url: string; src: string } | null>(null);

    useEffect(() => {
        if (!url) {
            return undefined;
        }
        const candidates = getImageCandidates(url);
        const probe = new Image();
        let index = 0;
        let done = false;
        const tryNext = (): void => {
            if (index < candidates.length) {
                probe.src = candidates[index];
            } else {
                done = true;
                setShown({ url, src: '' });
            }
        };
        probe.onload = () => {
            if (!done) {
                done = true;
                if (candidates.length > 1) {
                    rememberImage(candidates[index]);
                }
                setShown({ url, src: candidates[index] });
            }
        };
        probe.onerror = () => {
            if (!done) {
                index++;
                tryNext();
            }
        };
        tryNext();
        return () => {
            done = true;
            probe.onload = null;
            probe.onerror = null;
        };
    }, [url]);

    const src = url && shown ? shown.src : '';
    return (
        <div className={className ? `cover ${className}` : 'cover'}>
            {src ? (
                <img
                    src={src}
                    alt=""
                    referrerPolicy="no-referrer"
                />
            ) : (
                <Icon name={icon} />
            )}
        </div>
    );
}

/** A note instead of the content: a setting is missing or wrong; `children` e.g. a button that may help */
export function Hint({
    text,
    icon,
    editMode,
    children,
}: {
    text: string;
    icon: IconName;
    editMode: boolean;
    children?: ReactNode;
}): JSX.Element {
    return (
        <div className={`hint${editMode ? ' edit' : ''}`}>
            <Icon name={icon} />
            <span>{text}</span>
            {children}
        </div>
    );
}
