import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Color tone. Default "neutral". */
  tone?: 'neutral' | 'violet' | 'danger';
  /** Square size in px. Default 38. */
  size?: number;
  /** Accessible tooltip. */
  title?: string;
  /** Inline line-SVG glyph. */
  children?: React.ReactNode;
}

/** Square icon-only button (toolbar / row action). */
export function IconButton(props: IconButtonProps): JSX.Element;
