import React from 'react';
import { Text, StyleSheet } from 'react-native';
import {
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  format,
  getYear,
  isValid,
  parseISO,
} from 'date-fns';
import { Colors } from '../../theme';

interface RelativeDateProps {
  dateString?: string;
  style?: any;
  showTime?: boolean;
}

/**
 * Component to display a relative date string (e.g., "3m", "2h", "1d" ago)
 * For older dates, shows the actual date
 */
const RelativeDate: React.FC<RelativeDateProps> = ({ dateString, style, showTime = false }) => {
  if (!dateString) return null;

  const formattedDate = formatRelativeDate(dateString, showTime);

  return <Text style={[styles.dateText, style]}>{formattedDate}</Text>;
};

/**
 * Format a date string into a relative time string (e.g., "3m", "2h", "1d")
 * For dates older than 7 days, returns a formatted date string
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
  const diffMins = differenceInMinutes(now, date);

  // Less than a minute
  if (diffMins < 1) {
    return 'now';
  }

  // Less than an hour
  if (diffMins < 60) {
    return `${diffMins}m`;
  }

  const diffHours = differenceInHours(now, date);

  // Less than a day
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  const diffDays = differenceInDays(now, date);

  // Less than a week
  if (diffDays < 7) {
    return `${diffDays}d`;
  }

  // After 1 week, use Month Day (Mar 7) if less than a year, MM/DD/YY (03/07/23) if over a year ago
  // If over a year ago, use MM/DD/YY format
  if (diffDays >= 365) {
    return format(date, 'MM/dd/yy');
  } else {
    return format(date, 'MMM d');
  }
};

/**
 * Format a post date in "Month Day" format (e.g., "Jan 15")
 * If the post is from a different year than current, also shows the year (e.g., "Jan 15, 2023")
 * @param dateString - ISO date string to format
 * @returns Formatted date string
 */
export const formatPostDate = (dateString?: string): string => {
  if (!dateString) return '';

  const date = parseISO(dateString);
  if (!isValid(date)) return '';

  const now = new Date();
  const year = getYear(date);
  const currentYear = getYear(now);

  // If the post is from a different year, include the year
  if (year !== currentYear) {
    return format(date, 'MMM d, yyyy');
  }

  return format(date, 'MMM d');
};

const styles = StyleSheet.create({
  dateText: {
    color: Colors.neutral[200],
    fontSize: 13,
    fontFamily: 'Figtree-Regular',
  },
});

export default RelativeDate;
