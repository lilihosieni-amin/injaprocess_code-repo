import React from 'react';

export interface ProcessRowProps {
  /** Process display name. */
  name: string;
  /** Process id (latin, mono, LTR). */
  id: string;
  /** Activity count (Persian digits). */
  count?: string;
  /** Right-hand tag label. */
  tag?: string;
  /** Tag tone. */
  tagTone?: 'violet' | 'warn' | 'danger' | 'ok' | 'neutral';
  onSummary?: () => void;
  onFlow?: () => void;
  onDelete?: () => void;
  style?: React.CSSProperties;
}

/** One row of the department's process list. Composes Badge + Button + IconButton. */
export function ProcessRow(props: ProcessRowProps): JSX.Element;
