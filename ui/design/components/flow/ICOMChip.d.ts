import React from 'react';

export interface ICOMChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** ICOM role — sets color. */
  role?: 'input' | 'control' | 'output' | 'mechanism';
  children?: React.ReactNode;
}

/** IDEF0 ICOM tag (input=blue, control=amber, output=green, mechanism=violet). */
export function ICOMChip(props: ICOMChipProps): JSX.Element;
