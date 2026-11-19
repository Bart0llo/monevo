import { useTranslation } from 'react-i18next';
import { type ErrorCode, FIELD_ERROR_CODES, type FieldErrorCode } from '@monevo/contracts';
import { isApiError } from './api';

/** Translates an API error by its stable `code` (errors namespace). */
export function useErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation('errors');
  return (error) => {
    const code: ErrorCode = isApiError(error) && error.code ? error.code : 'INTERNAL';
    return t(code);
  };
}

function isFieldErrorCode(code: string): code is FieldErrorCode {
  return (FIELD_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * Field-level problem errors (`errors[]`) as a map of top-level field → translated message, so a
 * form can show them next to the inputs. Unknown codes fall back to the server message.
 */
export function useFieldErrors(): (error: unknown) => Record<string, string> {
  const { t } = useTranslation();
  return (error) => {
    const result: Record<string, string> = {};
    if (!isApiError(error)) return result;
    for (const item of error.problem?.errors ?? []) {
      const field = item.path[0];
      if (typeof field !== 'string' || field in result) continue;
      result[field] = isFieldErrorCode(item.code) ? t(`fieldErrors.${item.code}`) : item.message;
    }
    return result;
  };
}
