import { Button, Group, Modal, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { startSignIn } from './session';

/**
 * Shown when an action answers REAUTH_REQUIRED: the user confirms their identity at the IdP and
 * comes back to this page (authentication.md#recent-authentication).
 */
export function ReauthModal({
  opened,
  onClose,
}: {
  readonly opened: boolean;
  readonly onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { pathname, search } = useLocation();
  return (
    <Modal opened={opened} onClose={onClose} title={t('reauth.title')} centered>
      <Text mb="lg">{t('reauth.body')}</Text>
      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button
          onClick={() =>
            startSignIn('reauth', `${pathname}${search}`, i18n.resolvedLanguage ?? 'en')
          }
        >
          {t('reauth.confirm')}
        </Button>
      </Group>
    </Modal>
  );
}
