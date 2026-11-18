import type { ReactNode } from 'react';
import './components.css';

/**
 * A quiet panel for empty, planned, error and not-found states. `planned` draws the dashed
 * outline used for things that do not exist yet.
 */
export function StatePanel({
  children,
  planned = false,
}: {
  readonly children: ReactNode;
  readonly planned?: boolean;
}) {
  return (
    <div className="mv-state-panel" data-planned={planned || undefined}>
      {children}
    </div>
  );
}
