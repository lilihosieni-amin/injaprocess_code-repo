import React from 'react';

export interface ToggleProps {
  /** On/off state. */
  checked?: boolean;
  /** Called with the next boolean. */
  onChange?: (next: boolean) => void;
  /** Optional trailing label. */
  label?: string;
  style?: React.CSSProperties;
}

/** Pill switch; green track when on. */
export function Toggle(props: ToggleProps): JSX.Element;
