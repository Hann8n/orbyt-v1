import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from '../../src/components/ui/Icon';
import ListHeader from '../../src/components/ui/ListHeader';
import { Colors } from '../../src/theme';
import { BORDER_RADIUS } from '../../src/utils/constants';
import type { NotificationReason } from '../../src/services/api/types';
import { useActivityFilterStore } from '../../src/stores/activityFilterStore';

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
};

interface GroupedFilterOption {
  labelKey: string;
  reasons: NotificationReason[];
  primaryReason: NotificationReason;
}

const GROUPED_OPTIONS: GroupedFilterOption[] = [
  { labelKey: 'activity.likes', reasons: ['like', 'like-via-repost'], primaryReason: 'like' },
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

const ALL_REASONS = (Object.keys(NOTIFICATION_REASONS_LABEL_KEY) as NotificationReason[])
  .filter(reason => !GROUPED_OPTIONS.some(group => group.reasons.includes(reason)))
  .concat(GROUPED_OPTIONS.flatMap(group => group.reasons)) as NotificationReason[];

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

const FilterOption: React.FC<{
  label: string;
  checked: boolean;
  onPress: () => void;
}> = ({ label, checked, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.filterOption, pressed && styles.filterOptionPressed]}
  >
    <Text style={styles.filterOptionLabel}>{label}</Text>
    <View style={[styles.checkbox, checked && styles.checkboxSelected]}>
      {checked && <Icon name="check" size={16} color={Colors.black} />}
    </View>
  </Pressable>
);

export default function NotificationFilterModal() {
  const { t } = useTranslation();
  const router = useRouter();
  const filterReasons = useActivityFilterStore(s => s.filterReasons);
  const setFilterReasons = useActivityFilterStore(s => s.setFilterReasons);

  const [localSelected, setLocalSelected] = useState<NotificationReason[]>(
    () => filterReasons ?? []
  );

  // Keep local selection in sync with global filterReasons without
  // calling setState synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;

    Promise.resolve(filterReasons ?? []).then(next => {
      if (!cancelled) {
        setLocalSelected(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [filterReasons]);

  const isGroupedOptionSelected = useCallback(
    (reasons: NotificationReason[]) => reasons.every(r => localSelected.includes(r)),
    [localSelected]
  );

  const handleToggleReason = useCallback((reason: NotificationReason) => {
    setLocalSelected(prev =>
      prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]
    );
  }, []);

  const handleToggleGrouped = useCallback((reasons: NotificationReason[]) => {
    setLocalSelected(prev => {
      const allSelected = reasons.every(r => prev.includes(r));
      return allSelected
        ? prev.filter(r => !reasons.includes(r))
        : [...new Set([...prev, ...reasons])];
    });
  }, []);

  const handleClear = useCallback(() => setLocalSelected([]), []);

  const hasFilters = localSelected.length > 0;

  // Apply filter when selection changes (no Done button)
  useEffect(() => {
    if (localSelected.length === 0 || localSelected.length === ALL_REASONS.length) {
      setFilterReasons(undefined);
    } else {
      setFilterReasons(localSelected);
    }
  }, [localSelected, setFilterReasons]);

  return (
    <View style={styles.container}>
      <ListHeader
        mode="sheet"
        title={t('activity.filterOptions')}
        applySafeAreaTop={Platform.OS === 'android'}
        showCloseButton
        onClosePress={() => router.dismiss()}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>{t('activity.showNotificationsFor')}</Text>
            <Pressable
              onPress={handleClear}
              disabled={!hasFilters}
              style={({ pressed }) => [
                styles.clearBtn,
                { opacity: hasFilters ? (pressed ? 0.85 : 1) : 0.5 },
              ]}
            >
              <Text style={styles.clearBtnText}>{t('activity.clear')}</Text>
            </Pressable>
          </View>
          <View style={styles.optionGroup}>
            {ORDERED_FILTER_OPTIONS.map((item, index) => {
              if (item.type === 'grouped') {
                return (
                  <FilterOption
                    key={`grouped-${index}`}
                    label={t(item.option.labelKey)}
                    checked={isGroupedOptionSelected(item.option.reasons)}
                    onPress={() => handleToggleGrouped(item.option.reasons)}
                  />
                );
              }
              return (
                <FilterOption
                  key={item.reason}
                  label={t(NOTIFICATION_REASONS_LABEL_KEY[item.reason])}
                  checked={localSelected.includes(item.reason)}
                  onPress={() => handleToggleReason(item.reason)}
                />
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    minHeight: 36,
  },
  clearBtn: {
    backgroundColor: Colors.neutral[800],
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.MEDIUM,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtnText: {
    color: Colors.neutral[300],
    fontSize: 14,
    fontFamily: 'Figtree-SemiBold',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: Colors.neutral[100],
    fontSize: 17,
    fontFamily: 'Figtree-Bold',
    letterSpacing: 0.2,
    lineHeight: 22,
  },
  sectionSubtitle: {
    color: Colors.neutral[500],
    fontSize: 13,
    fontFamily: 'Figtree-Medium',
    marginBottom: 12,
    marginTop: 4,
  },
  optionGroup: {
    gap: 8,
  },
  filterOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.LARGE,
  },
  filterOptionPressed: {
    opacity: 0.8,
  },
  filterOptionLabel: {
    color: Colors.neutral[50],
    fontSize: 17,
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
});
