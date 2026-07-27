import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Lift + deepen shadow on hover. */
  hover?: boolean;
  /** Interior padding in px. Default 20. */
  pad?: number;
  children?: React.ReactNode;
}

/** Base white surface with warm border + soft violet shadow. */
export function Card(props: CardProps): JSX.Element;
