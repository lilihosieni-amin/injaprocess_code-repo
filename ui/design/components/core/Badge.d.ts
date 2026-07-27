import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Color tone. Default "violet". */
  tone?: 'violet' | 'warn' | 'danger' | 'ok' | 'neutral';
  /** Render in the mono font, LTR (for ids). */
  mono?: boolean;
  children?: React.ReactNode;
}

/** Small rounded status/tag badge. */
export function Badge(props: BadgeProps): JSX.Element;
