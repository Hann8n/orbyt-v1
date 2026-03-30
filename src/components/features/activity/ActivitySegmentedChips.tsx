import React from 'react';
import { ScrollView, StyleSheet, Text, type StyleProp, type ViewStyle, View } from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { BORDER_RADIUS, SCROLL_INDICATOR_CONSTANTS } from '../../../utils/constants';
import { FontFamily, Typography } from '../../../utils/components/typography';
import { Colors } from '../../../theme';
import { useUserStore } from '../../../stores/userStore';
import {
  blendColors,
  getContrastRatio,
  getTabBarActiveTintFromProfile,
  isColorDark,
} from '../../../utils/formatting/colors';

export interface ActivitySegmentedChipOption {
  key: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}

interface ActivitySegmentedChipsProps {
  options: ActivitySegmentedChipOption[];
  scrollable?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  trackStyle?: StyleProp<ViewStyle>;
}

const ActivitySegmentedChips: React.FC<ActivitySegmentedChipsProps> = ({
  options,
  scrollable = false,
  containerStyle,
  trackStyle,
}) => {
  const profileColors = useUserStore(state => state.currentUserProfileColors);
  const activeChipColor = getTabBarActiveTintFromProfile(profileColors);
  const activeTextColor = isColorDark(activeChipColor) ? Colors.neutral[50] : Colors.black;
  const inactiveChipColor = blendColors(Colors.neutral[950], activeChipColor, 0.16);

  // Keep inactive text subdued but ensure it stays readable on inactive chip fill.
  let inactiveTextColor = blendColors(Colors.neutral[300], activeChipColor, 0.45);
  if (getContrastRatio(inactiveTextColor, inactiveChipColor) < 4.5) {
    for (let i = 1; i <= 5; i += 1) {
      const candidate = blendColors(inactiveTextColor, Colors.neutral[50], i * 0.15);
      if (getContrastRatio(candidate, inactiveChipColor) >= 4.5) {
        inactiveTextColor = candidate;
        break;
      }
    }
  }

  const content = (
    <View style={[styles.track, trackStyle]}>
      {options.map(option => (
        <NativePressable
          key={option.key}
          onPress={option.onPress}
          style={[
            styles.chip,
            { backgroundColor: option.selected ? activeChipColor : inactiveChipColor },
          ]}
        >
          <Text
            style={[
              styles.chipText,
              { color: option.selected ? activeTextColor : inactiveTextColor },
            ]}
          >
            {option.label}
          </Text>
        </NativePressable>
      ))}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={
          options.length >= SCROLL_INDICATOR_CONSTANTS.SEGMENTED_CHIPS_MIN_ITEMS
        }
        style={[styles.scrollContainer, containerStyle]}
        contentContainerStyle={styles.scrollContent}
      >
        {content}
      </ScrollView>
    );
  }

  return <View style={[styles.container, containerStyle]}>{content}</View>;
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
  },
  scrollContainer: {
    marginHorizontal: -10,
    paddingBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 10,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: Colors.neutral[950],
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BORDER_RADIUS.FULL,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.neutral[900],
  },
  chipText: {
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.semibold,
    color: Colors.neutral[300],
  },
});

export default ActivitySegmentedChips;
