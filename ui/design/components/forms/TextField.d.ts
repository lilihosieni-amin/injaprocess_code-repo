import React from 'react';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Field label (above the input). */
  label?: string;
  /** Leading icon (line-SVG); adds inset padding. */
  icon?: React.ReactNode;
  /** Helper text below the field. */
  hint?: React.ReactNode;
}

/** Labelled text input; border focuses to coral. */
export function TextField(props: TextFieldProps): JSX.Element;
