import React from 'react';

export interface FlowNodeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Node kind. */
  kind?: 'activity' | 'start' | 'end';
  /** Title text (activity body / terminal label). */
  title?: string;
  /** Actor line (activity only). */
  actor?: string;
  /** Coral selection ring. */
  selected?: boolean;
  /** Show the sub-process chevron badge. */
  hasSub?: boolean;
}

/** Flowchart node: white activity card, or pill-shaped start/end terminal. */
export function FlowNode(props: FlowNodeProps): JSX.Element;
