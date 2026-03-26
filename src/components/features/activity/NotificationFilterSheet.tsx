import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VerticalListSheet, { TrueSheet } from '../../ui/VerticalListSheet';
import CancelButton from '../../ui/CancelButton';
import { CheckboxCuteFilledDuotoneIcon, CuteRegularSquareBoxEmptyIcon } from '../../ui/Icon';
import { Colors } from '../../../theme';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  DEFAULT_CONTENT_PADDING_HORIZONTAL,
  FOOTER_TOP_PADDING_DEFAULT,
  getFooterBottomPadding,
  SHEET_SPACING,
  SHEET_STYLES,
} from '../../../utils/components/truesheet';
import type { NotificationReason } from '../../../services/api/types';
import { FontFamily, Typography } from '../../../utils/components/typography';

// Valid notification reasons - use labelKey for i18n
const NOTIFICATION_REASONS_LABEL_KEY: Record<NotificationReason, string> = {
  like: 'activity.likes',
  repost: 'activity.reposts',
  follow: 'activity.follows',
  mention: 'activity.mentions',
  reply: 'activity.replies',
  quote: 'activity.quotes',
  'subscribed-post': 'activity.subscriptions',
  'like-via-repost': 'activity.likesViaRepost',
  'repost-via-repost': 'activity.repostsViaRepost',
  'starterpack-joined': 'activity.starterPackJoins',
  verified: 'activity.verification',
  unverified: 'activity.verification',
} as const;

// Grouped options that combine multiple reasons
interface GroupedFilterOption {
  labelKey: string;
  reasons: NotificationReason[];
  primaryReason: NotificationReason; // The first reason in original order
}

const GROUPED_OPTIONS: GroupedFilterOption[] = [
  {
    labelKey: 'activity.likes',
    reasons: ['like', 'like-via-repost'],
    primaryReason: 'like',
  },
  {
    labelKey: 'activity.reposts',
    reasons: ['repost', 'repost-via-repost'],
    primaryReason: 'repost',
  },
  {
    labelKey: 'activity.verification',
    reasons: ['verified', 'unverified'],
    primaryReason: 'verified',
  },
];

// Get all reasons (for checking if all are selected)
const ALL_REASONS = (Object.keys(NOTIFICATION_REASONS_LABEL_KEY) as NotificationReason[])
  .filter(reason => !GROUPED_OPTIONS.some(group => group.reasons.includes(reason)))
  .concat(GROUPED_OPTIONS.flatMap(group => group.reasons)) as NotificationReason[];

// Ordered list maintaining original sequence
// When we encounter a grouped option's primary reason, show the grouped option and skip the other reasons in that group
const ORDERED_FILTER_OPTIONS = (() => {
  const originalOrder: NotificationReason[] = [
    'like',
    'repost',
    'follow',
    'mention',
    'reply',
    'quote',
    'subscribed-post',
    'like-via-repost',
    'repost-via-repost',
    'starterpack-joined',
    'verified',
    'unverified',
  ];

  const options: Array<
    | { type: 'grouped'; option: GroupedFilterOption }
    | { type: 'individual'; reason: NotificationReason }
  > = [];
  const processedReasons = new Set<NotificationReason>();

  for (const reason of originalOrder) {
    if (processedReasons.has(reason)) continue;

    // Check if this reason is part of a grouped option
    const groupedOption = GROUPED_OPTIONS.find(group => group.primaryReason === reason);
    if (groupedOption) {
      options.push({ type: 'grouped', option: groupedOption });
      groupedOption.reasons.forEach(r => processedReasons.add(r));
    } else {
      options.push({ type: 'individual', reason });
      processedReasons.add(reason);
    }
  }

  return options;
})();

interface NotificationFilterSheetProps {
  visible: boolean;
  selectedReasons?: NotificationReason[];
  onDismiss: () => void;
  onFilterChange: (reasons: NotificationReason[] | undefined) => void;
}

interface FilterOptionProps {
  label: string;
  checked: boolean;
  onPress: () => void;
}

const FilterOption: React.FC<FilterOptionProps> = ({ label, checked, onPress }) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.filterOption, pressed && styles.filterOptionPressed]}
    >
      <Text style={styles.filterOptionLabel}>{label}</Text>
      <View style={styles.checkboxWrap}>
        {checked ? (
          <CheckboxCuteFilledDuotoneIcon
            size={24}
            boxColor={Colors.neutral[50]}
            checkColor={Colors.black}
            checkOpacity={1}
          />
        ) : (
          <CuteRegularSquareBoxEmptyIcon size={24} color={Colors.neutral[200]} />
        )}
      </View>
    </Pressable>
  );
};

interface GroupedFilterOptionProps {
  option: GroupedFilterOption;
  checked: boolean;
  onToggle: (reasons: NotificationReason[]) => void;
}

const GroupedFilterOptionItem: React.FC<GroupedFilterOptionProps> = ({
  option,
  checked,
  onToggle,
}) => {
  const { t } = useTranslation();
  return (
    <FilterOption
      label={t(option.labelKey)}
      checked={checked}
      onPress={() => onToggle(option.reasons)}
    />
  );
};

// Inner component that manages local state - gets reset when key changes
const NotificationFilterContent: React.FC<{
  selectedReasons?: NotificationReason[];
  onFilterChange: (reasons: NotificationReason[] | undefined) => void;
  onDismiss: () => void;
  onClearButtonChange: (button: React.ReactNode) => void;
  onFooterChange: (footer: React.ReactNode) => void;
}> = ({ selectedReasons, onFilterChange, onDismiss, onClearButtonChange, onFooterChange }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const footerBottomPadding = getFooterBottomPadding(insets.bottom);

  // Initialize state from prop - will reset when parent component remounts with new key
  const [localSelected, setLocalSelected] = useState<NotificationReason[]>(
    () => selectedReasons || []
  );

  // Check if a grouped option is fully selected (all reasons in the group are selected)
  const isGroupedOptionSelected = useCallback(
    (reasons: NotificationReason[]) => {
      return reasons.every(reason => localSelected.includes(reason));
    },
    [localSelected]
  );

  // Toggle individual reason
  const handleToggleReason = useCallback((reason: NotificationReason) => {
    setLocalSelected(prev => {
      const isSelected = prev.includes(reason);
      return isSelected ? prev.filter(r => r !== reason) : [...prev, reason];
    });
  }, []);

  // Toggle grouped reasons (all reasons in the group)
  const handleToggleGrouped = useCallback((reasons: NotificationReason[]) => {
    setLocalSelected(prev => {
      const allSelected = reasons.every(r => prev.includes(r));
      if (allSelected) {
        // Deselect all reasons in the group
        return prev.filter(r => !reasons.includes(r));
      } else {
        // Select all reasons in the group
        const newSelected = [...prev];
        reasons.forEach(reason => {
          if (!newSelected.includes(reason)) {
            newSelected.push(reason);
          }
        });
        return newSelected;
      }
    });
  }, []);

  const handleClear = useCallback(() => {
    setLocalSelected([]);
  }, []);

  // Clear button using edit button style - always render to maintain header size
  const clearButton = useMemo(() => {
    const hasFilters = localSelected.length > 0;
    return (
      <Pressable
        onPress={handleClear}
        disabled={!hasFilters}
        style={[styles.clearButton, !hasFilters && styles.clearButtonDisabled]}
      >
        <Text style={styles.clearButtonText}>{t('activity.clear')}</Text>
      </Pressable>
    );
  }, [handleClear, localSelected.length, t]);

  const footer = useMemo(
    () => (
      <View style={styles.footer}>
        <CancelButton
          onPress={() => {
            // If all are selected or none are selected, pass undefined (no filter)
            if (localSelected.length === 0 || localSelected.length === ALL_REASONS.length) {
              onFilterChange(undefined);
            } else {
              onFilterChange(localSelected);
            }
            onDismiss();
          }}
          text={t('common.done')}
        />
      </View>
    ),
    [localSelected, onFilterChange, onDismiss, t]
  );

  // Update parent with clear button and footer
  React.useEffect(() => {
    onClearButtonChange(clearButton);
    onFooterChange(footer);
  }, [clearButton, footer, onClearButtonChange, onFooterChange]);

  // Ensure scroll content has enough bottom padding so last options aren't cut off by footer
  const CANCEL_BUTTON_HEIGHT = 44;
  const scrollContentPaddingBottom =
    FOOTER_TOP_PADDING_DEFAULT + CANCEL_BUTTON_HEIGHT + footerBottomPadding;

  return (
    <ScrollView
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollContentPaddingBottom }]}
    >
      {ORDERED_FILTER_OPTIONS.map((item, index) => {
        if (item.type === 'grouped') {
          return (
            <GroupedFilterOptionItem
              key={`grouped-${index}`}
              option={item.option}
              checked={isGroupedOptionSelected(item.option.reasons)}
              onToggle={handleToggleGrouped}
            />
          );
        } else {
          return (
            <FilterOption
              key={item.reason}
              label={t(NOTIFICATION_REASONS_LABEL_KEY[item.reason])}
              checked={localSelected.includes(item.reason)}
              onPress={() => handleToggleReason(item.reason)}
            />
          );
        }
      })}
    </ScrollView>
  );
};

const NotificationFilterSheet: React.FC<NotificationFilterSheetProps> = ({
  visible,
  selectedReasons,
  onDismiss,
  onFilterChange,
}) => {
  const { t } = useTranslation();
  // Track when sheet opens to generate reset key for inner component
  const prevVisibleRef = useRef(visible);
  const [openingTimestamp, setOpeningTimestamp] = useState<number | null>(null);

  useEffect(() => {
    if (visible) TrueSheet.present('notification-filter-sheet');
  }, [visible]);

  // Store timestamp when opening to reset inner component state
  React.useEffect(() => {
    const isOpening = visible && !prevVisibleRef.current;
    if (isOpening) setOpeningTimestamp(Date.now());
    else if (!visible) setOpeningTimestamp(null);
    prevVisibleRef.current = visible;
  }, [visible]);

  // Generate a key that changes when sheet opens to reset inner component state
  // This causes React to remount NotificationFilterContent and reset its useState
  const resetKey = useMemo(() => {
    return openingTimestamp !== null && selectedReasons !== undefined
      ? `reset-${openingTimestamp}-${JSON.stringify(selectedReasons)}`
      : 'default';
  }, [openingTimestamp, selectedReasons]);

  // Get clear button and footer from inner component via render prop pattern
  // For simplicity, we'll pass a callback to get the clear button
  const [clearButtonState, setClearButtonState] = useState<React.ReactNode>(null);
  const [footerState, setFooterState] = useState<React.ReactNode>(null);

  return (
    <VerticalListSheet
      name="notification-filter-sheet"
      onDismiss={onDismiss}
      title={t('activity.filterOptions')}
      showCancelButton={false}
      hideCloseButton={false}
      customHeaderButton={clearButtonState}
      scrollable={true}
      customFooter={footerState}
    >
      <NotificationFilterContent
        key={resetKey}
        selectedReasons={selectedReasons}
        onFilterChange={onFilterChange}
        onDismiss={onDismiss}
        onClearButtonChange={setClearButtonState}
        onFooterChange={setFooterState}
      />
    </VerticalListSheet>
  );
};

export default NotificationFilterSheet;

const styles = StyleSheet.create({
  filterOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SHEET_SPACING.headerBottom,
    paddingHorizontal: SHEET_SPACING.headerHorizontal,
    marginHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
    marginBottom: DEFAULT_CONTENT_PADDING_HORIZONTAL,
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.LARGE,
  },
  filterOptionPressed: {
    opacity: 0.7,
  },
  filterOptionLabel: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.title,
    lineHeight: Typography.lineHeights.title,
    fontFamily: FontFamily.semibold,
    flex: 1,
  },
  checkboxWrap: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    alignItems: 'center',
    // No backgroundColor – gradient from VerticalListSheet shows through to match other sheets
  },
  clearButton: {
    ...SHEET_STYLES.headerActionButton,
  },
  clearButtonDisabled: {
    opacity: 0.6,
  },
  clearButtonText: {
    ...SHEET_STYLES.headerActionButtonText,
  },
  scrollContent: {
    paddingBottom: DEFAULT_CONTENT_PADDING_HORIZONTAL,
  },
});
