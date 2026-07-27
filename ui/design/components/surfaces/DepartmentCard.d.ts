import React from 'react';

export interface DepartmentCardProps {
  /** Department name (rendered after «دپارتمان»). */
  name: string;
  /** SVG path `d` for the 24×24 line icon. */
  icon: string;
  /** Ghosted index numeral (Persian digits), e.g. "۰۱". */
  index?: string;
  /** Process count (Persian digits). */
  count?: string;
  /** Accent family. */
  accent?: 'violet' | 'coral';
  /** Optional sub-process count badge. */
  subs?: string | null;
  /** Optional open-conflict count badge. */
  conflicts?: string | null;
  onOpen?: () => void;
  style?: React.CSSProperties;
}

/**
 * Department feature card for the overview grid.
 * @startingPoint section="Surfaces" subtitle="Department grid feature card" viewport="360x220"
 */
export function DepartmentCard(props: DepartmentCardProps): JSX.Element;
