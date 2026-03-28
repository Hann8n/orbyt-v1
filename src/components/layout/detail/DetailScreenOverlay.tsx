import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { NativePressable } from '../../ui/NativePressable';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { BackArrowIcon } from '../../ui/Icon';
import { Colors } from '../../../theme';

export interface DetailScreenOverlayProps {
  showBackButton: boolean;
  actionButtonsTop: number;
  onBackPress: () => void;
  /** Color for back arrow (header text color) */
  backIconColor: string;
  backIconPrimaryStyle: AnimatedStyle<ViewStyle>;
  backIconSecondaryStyle: AnimatedStyle<ViewStyle>;
  overlayAnimatedStyle: AnimatedStyle<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Shared overlay for profile/channel: back/spacer + right content.
 * Single place for layout and styles; screens supply onBackPress and children (menu + actions).
 */
const DetailScreenOverlay: React.FC<DetailScreenOverlayProps> = ({
  showBackButton,
  actionButtonsTop,
  onBackPress,
  backIconColor,
  backIconPrimaryStyle,
  backIconSecondaryStyle,
  overlayAnimatedStyle,
  children,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <View style={[styles.overlayRow, { top: actionButtonsTop }]}>
        {showBackButton ? (
          <NativePressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={onBackPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.overlayBackButton}
            androidRippleBorderless
          >
            <View style={styles.backIconContainer}>
              <Animated.View style={[StyleSheet.absoluteFillObject, backIconPrimaryStyle]}>
                <BackArrowIcon size={30} color={backIconColor} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFillObject, backIconSecondaryStyle]}>
                <BackArrowIcon size={30} color={Colors.neutral[50]} />
              </Animated.View>
            </View>
          </NativePressable>
        ) : (
          <View style={styles.overlayBackSpacer} />
        )}

        <Animated.View style={[styles.overlayRightSection, overlayAnimatedStyle]}>
          {children}
        </Animated.View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  overlayRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  overlayBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIconContainer: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayBackSpacer: {
    width: 40,
    height: 40,
  },
  overlayRightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
});

export default memo(DetailScreenOverlay);
