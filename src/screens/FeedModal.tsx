import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform, Dimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedGestureHandler,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import FeedRenderer from '../components/features/feed/FeedRenderer';
import { BackArrowIcon } from '../components/ui/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { feedService } from '../services/FeedService';
import { getViewportDimensions } from '../utils/helpers/screenSize';
import { Colors } from '../components/ui/UI';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

const FeedModal: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const {
    feed: feedFromParams,
    initialIndex: initialIndexRaw,
    initialUri,
    feedOption,
    userDid,
    backgroundColor,
    secondaryColor,
    searchQuery,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = route.params || {};

  // Swipe-to-dismiss animation values
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  // Get viewport dimensions for modal
  const viewportDimensions = getViewportDimensions(true, false);
  
  // Calculate initial scroll offset for the list
  // Each video card takes up the full viewport height
  const initialPosition = initialIndexRaw * viewportDimensions.height;

  // Dismiss modal
  const handleClose = () => {
    feedService.clearCurrentFeed();
    navigation.goBack();
  };

  // Animated dismiss function
  const animatedDismiss = () => {
    'worklet';
    translateX.value = withTiming(SCREEN_WIDTH, { duration: 300 });
    translateY.value = withTiming(SCREEN_HEIGHT * 0.3, { duration: 300 });
    scale.value = withTiming(0.8, { duration: 300 });
    opacity.value = withTiming(0, { duration: 300 }, () => {
      runOnJS(handleClose)();
    });
  };

  // Gesture handler for swipe-to-dismiss
  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, context: any) => {
      context.startX = translateX.value;
      context.startY = translateY.value;
    },
    onActive: (event, context: any) => {
      // Only allow horizontal swipes for dismiss
      if (Math.abs(event.translationX) > Math.abs(event.translationY)) {
        translateX.value = context.startX + event.translationX;
        // Add some vertical movement for natural feel
        translateY.value = context.startY + event.translationY * 0.3;
        // Scale and opacity based on horizontal movement
        const progress = Math.abs(event.translationX) / SCREEN_WIDTH;
        scale.value = interpolate(progress, [0, 1], [1, 0.8], Extrapolate.CLAMP);
        opacity.value = interpolate(progress, [0, 1], [1, 0], Extrapolate.CLAMP);
      }
    },
    onEnd: (event) => {
      const shouldDismiss = Math.abs(event.translationX) > SCREEN_WIDTH * 0.4 || 
                           Math.abs(event.velocityX) > 500;
      if (shouldDismiss) {
        animatedDismiss();
      } else {
        // Reset to original position
        translateX.value = withTiming(0, { duration: 200 });
        translateY.value = withTiming(0, { duration: 200 });
        scale.value = withTiming(1, { duration: 200 });
        opacity.value = withTiming(1, { duration: 200 });
      }
    },
  });

  // Animated styles
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
      opacity: opacity.value,
    };
  });

  return (
    <PanGestureHandler onGestureEvent={gestureHandler}>
      <Animated.View style={[styles.container, animatedStyle]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.backButton, { top: insets.top + 15 }]}
          activeOpacity={0.7}
        >
          <BackArrowIcon size={32} color={Colors.white} />
        </TouchableOpacity>
        <FeedRenderer
          feedOption={feedOption}
          userDid={userDid}
          backgroundColor={backgroundColor}
          secondaryColor={secondaryColor}
          initialIndex={initialIndexRaw}
          initialUri={initialUri}
          isVisible={true}
          isProfileLoading={false}
          isModal={true}
          searchQuery={searchQuery}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
        />
      </Animated.View>
    </PanGestureHandler>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  closeButton: {
    position: 'absolute',
    top: 48,
    right: 24,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 24,
    padding: 8,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
  },
  swipeIndicator: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  swipeBar: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },
});

export default FeedModal; 