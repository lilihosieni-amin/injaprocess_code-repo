import React from 'react';

export interface JunctionNodeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Logic type — sets the diamond color. */
  type?: 'XOR' | 'AND' | 'OR';
  /** Square size in px. Default 46. */
  size?: number;
  /** Selection glow. */
  selected?: boolean;
}

/** IDEF3 junction diamond (XOR=coral, AND=violet, OR=amber). */
export function JunctionNode(props: JunctionNodeProps): JSX.Element;
