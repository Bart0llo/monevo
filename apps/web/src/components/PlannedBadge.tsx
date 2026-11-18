import type { ReactNode } from 'react';
import './components.css';

/**
 * Marks something as planned rather than actual. The dashed outline is reserved for planned and
 * projected things (user-experience.md#design-direction); actual values never use it.
 */
export function PlannedBadge({ children }: { readonly children: ReactNode }) {
  return <span className="mv-planned-badge">{children}</span>;
}
