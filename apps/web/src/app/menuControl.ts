import type { FloatingPosition, MantineColorScheme } from '@mantine/core';

/** Shared props for the preference menus that sit on the rail or the mobile top bar. */
export interface MenuControlProps {
  readonly className: string;
  readonly position?: FloatingPosition;
}

export interface LanguageMenuProps extends MenuControlProps {
  /** Called after the UI language changes, e.g. to save it to the user's settings. */
  readonly onChange?: (language: string) => void;
}

export interface ColorSchemeMenuProps extends MenuControlProps {
  readonly onChange?: (scheme: MantineColorScheme) => void;
}
