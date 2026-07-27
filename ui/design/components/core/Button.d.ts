import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Default "primary". */
  variant?: 'primary' | 'coral' | 'danger' | 'ok' | 'secondary' | 'ghost';
  /** Size. Default "md". */
  size?: 'sm' | 'md' | 'lg';
  /** Optional leading icon (inline line-SVG element). */
  icon?: React.ReactNode;
  /** Full-width. */
  block?: boolean;
  children?: React.ReactNode;
}

/**
 * Inja Food primary action button.
 * @startingPoint section="Core" subtitle="Brand buttons: primary, coral, danger, ghost" viewport="700x150"
 */
export function Button(props: ButtonProps): JSX.Element;
