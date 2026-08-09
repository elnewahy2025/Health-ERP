import { formatDate as sharedFormatDate, formatTime as sharedFormatTime, formatDateTime as sharedFormatDateTime } from '@healthcare/shared/utils/formatters';
import i18n from '../i18n/config';

const locale = (): 'ar' | 'en' => (i18n.language === 'ar' ? 'ar' : 'en');

export function formatDate(value?: string | Date | null): string {
  if (!value) return '';
  return sharedFormatDate(value, locale());
}

export function formatTime(value?: string | Date | null): string {
  if (!value) return '';
  return sharedFormatTime(value, locale());
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '';
  return sharedFormatDateTime(value, locale());
}
