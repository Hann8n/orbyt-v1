import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
  View,
  Pressable,
} from 'react-native';
import { BORDER_RADIUS } from '../../../utils/constants';
import { FontFamily, Typography } from '../../../utils/components/typography';
import { Colors } from '../../../theme';
import { useUserStore } from '../../../stores/userStore';
import { getTabBarActiveTintFromProfile, isColorDark } from '../../../utils/formatting/colors';

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

  const content = (
    <View style={[styles.track, trackStyle]}>
      {options.map(option => (
        <Pressable
          key={option.key}
          onPress={option.onPress}
          style={[styles.chip, option.selected && { backgroundColor: activeChipColor }]}
        >
          <Text style={[styles.chipText, option.selected && { color: activeTextColor }]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
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
