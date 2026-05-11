import React from 'react';
import i18n from 'i18next';
import { getDateFnsLocale } from '../../i18n';
import { Text, StyleSheet, StyleProp, TextStyle } from 'react-native';
import {
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInSeconds,
  format,
  isValid,
  parseISO,
} from 'date-fns';
import { Colors } from '../../theme';
import { FontFamily, Typography } from '../../utils/components/typography';

interface RelativeDateProps {
  dateString?: string;
  style?: StyleProp<TextStyle>;
  showTime?: boolean;
}

/**
 * Component to display a relative date string (e.g., "1h", "2d", compact format for all locales)
 * For older dates, shows the actual date
 */
const RelativeDate: React.FC<RelativeDateProps> = ({ dateString, style, showTime = false }) => {
  if (!dateString) return null;

  const formattedDate = formatRelativeDate(dateString, showTime);

  return <Text style={[styles.dateText, style]}>{formattedDate}</Text>;
};

/**
 * Format a date string into a relative time string.
 * For dates within 7 days: short format (1s, 30m, 2h, 5d) for all locales.
 * For older dates: formatted date string with localized month names.
 *
 * @param dateString - ISO date string to format
 * @param showTime - Whether to show the time for older dates (currently unused, kept for API compatibility)
 * @returns Formatted relative date string
 */
export const formatRelativeDate = (dateString?: string, _showTime: boolean = false): string => {
  if (!dateString) return '';

  const date = parseISO(dateString);
  if (!isValid(date)) return '';

  const now = new Date();
  const diffDays = differenceInDays(now, date);
  const dateFnsLocale = getDateFnsLocale();

  if (diffDays < 7) {
    // Short format (now, 1s, 30m, 2h, 5d) for all locales — compact and widely understood.
    const seconds = differenceInSeconds(now, date);
    if (seconds < 60) {
      if (seconds === 0) return i18n.t('common.now');
      return `${seconds}s`;
    }
    const minutes = differenceInMinutes(now, date);
    if (minutes < 60) return `${minutes}m`;
    const hours = differenceInHours(now, date);
    if (hours < 24) return `${hours}h`;
    return `${diffDays}d`;
  }

  if (diffDays >= 365) {
    return format(date, 'MM/dd/yy', { locale: dateFnsLocale });
  }
  return format(date, 'MMM d', { locale: dateFnsLocale });
};

const styles = StyleSheet.create({
  dateText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.regular,
    lineHeight: Typography.lineHeights.caption,
  },
});

export default RelativeDate;
