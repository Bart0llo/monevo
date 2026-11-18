import type { FloatingPosition } from '@mantine/core';

/** Shared props for the preference menus that sit on the rail or the mobile top bar. */
export interface MenuControlProps {
  readonly className: string;
  readonly position?: FloatingPosition;
}
