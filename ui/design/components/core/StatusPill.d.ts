import React from 'react';

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Tone. Default "danger". */
  tone?: 'danger' | 'ok' | 'warn';
  children?: React.ReactNode;
}

/** Status pill with a leading colored dot (conflicts, states). */
export function StatusPill(props: StatusPillProps): JSX.Element;
