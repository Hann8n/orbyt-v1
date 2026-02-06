import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VerticalListSheet from '../../ui/VerticalListSheet';
import CancelButton from '../../ui/CancelButton';
import Icon from '../../ui/Icon';
import { Colors } from '../../../theme';
import { BORDER_RADIUS } from '../../../utils/constants';
import { FOOTER_BOTTOM_PADDING_MIN } from '../../../utils/components/truesheet';
import type { NotificationReason } from '../../../services/api/types';

// Valid notification reasons extracted from API type with user-friendly labels
const NOTIFICATION_REASONS_MAP: Record<NotificationReason, string> = {
  like: 'likes',
  repost: 'reposts',
  follow: 'follows',
  mention: 'mentions',
  reply: 'replies',
  quote: 'quotes',
  'subscribed-post': 'subscriptions',
  'like-via-repost': 'likes via repost',
  'repost-via-repost': 'reposts via repost',
  'starterpack-joined': 'starter pack joins',
  verified: 'verified',
  unverified: 'unverified',
} as const;

// Grouped options that combine multiple reasons
interface GroupedFilterOption {
  label: string;
  reasons: NotificationReason[];
  primaryReason: NotificationReason; // The first reason in original order
}

const GROUPED_OPTIONS: GroupedFilterOption[] = [
  {
    label: 'likes',
    reasons: ['like', 'like-via-repost'],
    primaryReason: 'like',
  },
  {
    label: 'reposts',
    reasons: ['repost', 'repost-via-repost'],
    primaryReason: 'repost',
  },
  {
    label: 'verification',
    reasons: ['verified', 'unverified'],
    primaryReason: 'verified',
  },
];

// Get all reasons (for checking if all are selected)
const ALL_REASONS = (Object.keys(NOTIFICATION_REASONS_MAP) as NotificationReason[])
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
      <View style={[styles.checkbox, checked && styles.checkboxSelected]}>
        {checked && <Icon name="checkmark" size={16} color={Colors.black} />}
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
  return (
    <FilterOption label={option.label} checked={checked} onPress={() => onToggle(option.reasons)} />
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
  const insets = useSafeAreaInsets();
  const footerBottomPadding = Math.max(insets.bottom, FOOTER_BOTTOM_PADDING_MIN);

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
        style={[styles.clearButton, { opacity: !hasFilters ? 0.6 : 1 }]}
      >
        <Text style={styles.clearButtonText}>clear</Text>
      </Pressable>
    );
  }, [handleClear, localSelected.length]);

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
          text="Done"
        />
      </View>
    ),
    [localSelected, onFilterChange, onDismiss]
  );

  // Update parent with clear button and footer
  React.useEffect(() => {
    onClearButtonChange(clearButton);
    onFooterChange(footer);
  }, [clearButton, footer, onClearButtonChange, onFooterChange]);

  // Ensure scroll content has enough bottom padding so last options aren't cut off by footer
  const scrollContentPaddingBottom = 12 + 8 + 44 + footerBottomPadding;

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
              label={NOTIFICATION_REASONS_MAP[item.reason]}
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
  // Track when sheet opens to generate reset key for inner component
  const prevVisibleRef = useRef(visible);
  const [openingTimestamp, setOpeningTimestamp] = useState<number | null>(null);

  // Store timestamp when opening in useEffect to avoid calling impure function during render
  React.useEffect(() => {
    const isOpening = visible && !prevVisibleRef.current;
    if (isOpening) {
      setOpeningTimestamp(Date.now());
    } else if (!visible) {
      // Reset timestamp when sheet closes
      setOpeningTimestamp(null);
    }
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
      visible={visible}
      onDismiss={onDismiss}
      title="filter options"
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
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.LARGE,
  },
  filterOptionPressed: {
    opacity: 0.7,
  },
  filterOptionLabel: {
    color: Colors.neutral[50],
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
    flex: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.SMALL,
    borderWidth: 2,
    borderColor: Colors.neutral[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: Colors.neutral[50],
    borderColor: Colors.neutral[50],
  },
  footer: {
    alignItems: 'center',
    // No backgroundColor – gradient from VerticalListSheet shows through to match other sheets
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
    height: 32,
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  clearButtonText: {
    color: Colors.neutral[50],
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
  },
  scrollContent: {
    paddingBottom: 12,
  },
});
