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
import FeedFetcher from '../components/features/feed/FeedFetcher';
import Icon from '../components/ui/Icon';
import { getCurrentFeed } from '../services/FeedStore';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

const FeedModal: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const {
    feed: feedFromParams,
    initialIndex: initialIndexRaw,
    initialUri,
    feedOption,
    userDid,
    backgroundColor,
    secondaryColor,
  } = route.params || {};

  // Swipe-to-dismiss animation values
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  // Calculate initial scroll offset for the list
  // Each video card takes up the full screen height
  const initialPosition = initialIndexRaw * SCREEN_HEIGHT;

  // Dismiss modal
  const handleClose = () => {
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
        {/* Removed grab bar/swipe indicator and X close button */}
        <FeedFetcher
          feedOption={feedOption}
          userDid={userDid}
          backgroundColor={backgroundColor}
          secondaryColor={secondaryColor}
          initialIndex={initialIndexRaw}
          initialUri={initialUri}
          isVisible={true}
          isProfileLoading={false}
          isModal={true}
        />
      </Animated.View>
    </PanGestureHandler>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent', // Make background transparent
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
    top: 48,
    left: 24,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 24,
    padding: 8,
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