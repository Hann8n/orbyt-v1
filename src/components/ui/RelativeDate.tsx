import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Colors } from '../ui/UI';

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
  
  return (
    <Text style={[styles.dateText, style]}>{formattedDate}</Text>
  );
};

/**
 * Format a date string into a relative time string (e.g., "3m", "2h", "1d")
 * For dates older than 7 days, returns a formatted date string
 *
 * @param dateString - ISO date string to format
 * @param showTime - Whether to show the time for older dates
 * @returns Formatted relative date string
 */
export const formatRelativeDate = (dateString?: string, showTime: boolean = false): string => {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  
  // Less than a minute
  if (diffMins < 1) {
    return 'now';
  }
  
  // Less than an hour
  if (diffMins < 60) {
    return `${diffMins}m`;
  }
  
  // Less than a day
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  
  // Less than a week
  if (diffDays < 7) {
    return `${diffDays}d`;
  }
  
  // After 1 week, use Month Day (Mar 7) for current year, MM/DD/YYYY (03/07/2023) if from previous year
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const currentYear = now.getFullYear();

  // If from previous year, use MM/DD/YYYY format
  if (year < currentYear) {
    const monthNum = String(date.getMonth() + 1).padStart(2, '0');
    const dayNum = String(date.getDate()).padStart(2, '0');
    return `${monthNum}/${dayNum}/${year}`;
  } else {
    return `${month} ${day}`;
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
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const currentYear = now.getFullYear();
  
  // If the post is from a different year, include the year
  if (year !== currentYear) {
    return `${month} ${day}, ${year}`;
  }
  
  return `${month} ${day}`;
};

const styles = StyleSheet.create({
  dateText: {
    color: Colors.lightGray,
    fontSize: 13,
    fontFamily: 'Firma-Regular',
  },
});

export default RelativeDate;
