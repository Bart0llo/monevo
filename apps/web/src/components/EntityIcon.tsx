import { ActionIcon, ColorSwatch, Input, SimpleGrid, ThemeIcon } from '@mantine/core';
import {
  type Icon,
  IconBabyCarriage,
  IconBarbell,
  IconBeach,
  IconBike,
  IconBolt,
  IconBook,
  IconBriefcase,
  IconBuilding,
  IconBuildingBank,
  IconBus,
  IconCar,
  IconCash,
  IconCheck,
  IconCoffee,
  IconCoins,
  IconCreditCard,
  IconDeviceGamepad2,
  IconDeviceTv,
  IconDots,
  IconDroplet,
  IconFlame,
  IconGasStation,
  IconGift,
  IconHeart,
  IconHome,
  IconMovie,
  IconMusic,
  IconPaw,
  IconPhone,
  IconPigMoney,
  IconPill,
  IconPlane,
  IconReceipt,
  IconSchool,
  IconShirt,
  IconShoppingBag,
  IconShoppingCart,
  IconStethoscope,
  IconTag,
  IconToolsKitchen2,
  IconTrendingUp,
  IconWallet,
  IconWifi,
} from '@tabler/icons-react';
import { createElement } from 'react';
import { useTranslation } from 'react-i18next';
import { COLOR_TOKENS, type ColorToken, ICON_KEYS, type IconKey } from '@monevo/contracts';

// Curated icons and colors for accounts and categories (contracts ICON_KEYS / COLOR_TOKENS).

export const ENTITY_ICONS = {
  wallet: IconWallet,
  bank: IconBuildingBank,
  cash: IconCash,
  'credit-card': IconCreditCard,
  'piggy-bank': IconPigMoney,
  coins: IconCoins,
  receipt: IconReceipt,
  briefcase: IconBriefcase,
  gift: IconGift,
  'trending-up': IconTrendingUp,
  home: IconHome,
  bolt: IconBolt,
  droplet: IconDroplet,
  flame: IconFlame,
  wifi: IconWifi,
  phone: IconPhone,
  'shopping-cart': IconShoppingCart,
  'shopping-bag': IconShoppingBag,
  'tools-kitchen': IconToolsKitchen2,
  coffee: IconCoffee,
  car: IconCar,
  'gas-station': IconGasStation,
  bus: IconBus,
  plane: IconPlane,
  bike: IconBike,
  heart: IconHeart,
  pill: IconPill,
  stethoscope: IconStethoscope,
  school: IconSchool,
  book: IconBook,
  'device-tv': IconDeviceTv,
  'device-gamepad': IconDeviceGamepad2,
  music: IconMusic,
  movie: IconMovie,
  shirt: IconShirt,
  paw: IconPaw,
  baby: IconBabyCarriage,
  barbell: IconBarbell,
  beach: IconBeach,
  building: IconBuilding,
  tag: IconTag,
  dots: IconDots,
} as const satisfies Record<IconKey, Icon>;

function iconFor(key: string): Icon {
  return (ENTITY_ICONS as Record<string, Icon>)[key] ?? IconDots;
}

/** A theme token or an explicit `#rrggbb` color as a CSS color. */
export function cssColor(color: string): string {
  return color.startsWith('#') ? color : `var(--mantine-color-${color}-6)`;
}

/** The entity's icon on its color; decorative (the name is always shown next to it). */
export function EntityIcon({
  icon,
  color,
  size = 'md',
}: {
  readonly icon: string;
  readonly color: string;
  readonly size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <ThemeIcon size={size} radius="sm" color={cssColor(color)} aria-hidden="true">
      {createElement(iconFor(icon), { size: size === 'sm' ? 14 : 18, stroke: 1.75 })}
    </ThemeIcon>
  );
}

export function IconPicker({
  value,
  onChange,
  color,
  label,
}: {
  readonly value: string;
  readonly onChange: (value: IconKey) => void;
  readonly color: string;
  readonly label: string;
}) {
  const { t } = useTranslation();
  return (
    <Input.Wrapper label={label}>
      <SimpleGrid cols={{ base: 7, xs: 9 }} spacing={6} verticalSpacing={6} role="radiogroup">
        {ICON_KEYS.map((key) => {
          const Glyph = ENTITY_ICONS[key];
          const selected = key === value;
          return (
            <ActionIcon
              key={key}
              role="radio"
              aria-checked={selected}
              aria-label={t(`entityIcons.${key}`)}
              variant={selected ? 'filled' : 'default'}
              {...(selected ? { color: cssColor(color) } : {})}
              size="lg"
              onClick={() => onChange(key)}
            >
              <Glyph size={18} stroke={1.75} aria-hidden="true" />
            </ActionIcon>
          );
        })}
      </SimpleGrid>
    </Input.Wrapper>
  );
}

export function ColorPicker({
  value,
  onChange,
  label,
}: {
  readonly value: string;
  readonly onChange: (value: ColorToken) => void;
  readonly label: string;
}) {
  const { t } = useTranslation();
  return (
    <Input.Wrapper label={label}>
      <SimpleGrid cols={{ base: 7, xs: 13 }} spacing={6} verticalSpacing={6} role="radiogroup">
        {COLOR_TOKENS.map((token) => (
          <ColorSwatch
            key={token}
            component="button"
            type="button"
            role="radio"
            aria-checked={token === value}
            aria-label={t(`entityColors.${token}`)}
            color={cssColor(token)}
            onClick={() => onChange(token)}
            style={{ cursor: 'pointer', color: 'var(--mantine-color-white)' }}
          >
            {token === value ? <IconCheck size={14} aria-hidden="true" /> : null}
          </ColorSwatch>
        ))}
      </SimpleGrid>
    </Input.Wrapper>
  );
}
