import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet, Pressable, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { BackArrowIcon } from '../../ui/Icon';
import { Colors } from '../../../theme';

export interface DetailScreenOverlayProps {
  isModal: boolean;
  showBackButton: boolean;
  actionButtonsTop: number;
  onBackPress: () => void;
  /** Called when grab handle is tapped (modal only). Use to scroll list to top. */
  onGrabHandlePress?: () => void;
  /** Color for back arrow and grab bar (header text color) */
  backIconColor: string;
  backIconPrimaryStyle: AnimatedStyle<ViewStyle>;
  backIconSecondaryStyle: AnimatedStyle<ViewStyle>;
  overlayAnimatedStyle: AnimatedStyle<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Shared overlay for profile/channel: grab handle (when modal) + back/spacer + right content.
 * Single place for layout and styles; screens supply onBackPress and children (menu + actions).
 */
const DetailScreenOverlay: React.FC<DetailScreenOverlayProps> = ({
  isModal,
  showBackButton,
  actionButtonsTop,
  onBackPress,
  onGrabHandlePress,
  backIconColor,
  backIconPrimaryStyle,
  backIconSecondaryStyle,
  overlayAnimatedStyle,
  children,
}) => {
  const { t } = useTranslation();
  return (
    <>
      {isModal && (
        <Pressable
          style={styles.grabHandle}
          hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
          onPress={onGrabHandlePress}
        >
          <View style={styles.grabHandleContainer}>
            <Animated.View
              style={[
                StyleSheet.absoluteFillObject,
                backIconPrimaryStyle,
                styles.grabHandleBarWrapper,
              ]}
            >
              <View
                style={[
                  styles.grabHandleBar,
                  styles.grabHandleBarPrimary,
                  { backgroundColor: backIconColor },
                ]}
              />
            </Animated.View>
            <Animated.View
              style={[
                StyleSheet.absoluteFillObject,
                backIconSecondaryStyle,
                styles.grabHandleBarWrapper,
              ]}
            >
              <View style={[styles.grabHandleBar, styles.grabHandleBarSecondary]} />
            </Animated.View>
          </View>
        </Pressable>
      )}

      <View style={[styles.overlayRow, { top: actionButtonsTop }]}>
        {showBackButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={onBackPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.overlayBackButton}
          >
            <View style={styles.backIconContainer}>
              <Animated.View style={[StyleSheet.absoluteFillObject, backIconPrimaryStyle]}>
                <BackArrowIcon size={30} color={backIconColor} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFillObject, backIconSecondaryStyle]}>
                <BackArrowIcon size={30} color={Colors.neutral[50]} />
              </Animated.View>
            </View>
          </Pressable>
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
  grabHandle: {
    position: 'absolute',
    top: 5,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  grabHandleContainer: {
    width: 42,
    height: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabHandleBarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabHandleBar: {
    width: 42,
    height: 4,
    borderRadius: 2,
  },
  grabHandleBarPrimary: {
    opacity: 0.5,
  },
  grabHandleBarSecondary: {
    backgroundColor: Colors.neutral[50],
    opacity: 0.5,
  },
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
