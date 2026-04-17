import { format, parseISO, isValid, isToday, isYesterday } from 'date-fns';
import i18n from '@/i18n';

export function getDateGroupLabel(sentAt: string): string {
  const date = parseISO(sentAt);
  if (!isValid(date)) return '';
  if (isToday(date)) return i18n.t('chat.today');
  if (isYesterday(date)) return i18n.t('chat.yesterday');
  return format(date, 'EEEE, MMM d');
}

export function getDateKey(sentAt: string): string {
  const date = parseISO(sentAt);
  if (!isValid(date)) return '';
  return format(date, 'yyyy-MM-dd');
}

export function formatMessageTime(sentAt?: string): string {
  if (!sentAt) return '';
  const date = parseISO(sentAt);
  return isValid(date) ? format(date, 'h:mm a') : '';
}
