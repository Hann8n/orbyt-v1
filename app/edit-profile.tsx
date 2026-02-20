import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  startTransition,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ScrollView,
  Dimensions,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  SharedValue,
  FadeIn,
  FadeOut,
  Easing,
} from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Colors } from '../src/theme';
import { Avatar } from '../src/components/ui/UI';
import { CheckIcon } from '../src/components/ui/Icon';
import { useProfileUpdateMutation, useProfileByDid } from '../src/services/data/ProfileService';
import { hexToRGBA, blendColors } from '../src/utils/formatting/colors';
import { BORDER_RADIUS } from '../src/utils/constants';
import { useCurrentUser } from '../src/stores/userStore';
import { splitHandleSuffix } from '../src/utils/formatting/handles';
import { saveAndSyncColors } from '../src/services/colors';
import {
  PROFILE_FONT_OPTIONS,
  getHeaderFontSet,
  sanitizeProfileFontPreference,
} from '../src/utils/profileFonts';

export interface ProfileColorOption {
  backgroundColor: string;
  textColor: string;
}

const ABOUT_MAX_LENGTH = 256;

// Color picker layout constants (must match styles)
const COLOR_SQUARE_WIDTH = 44;
const COLOR_PICKER_GAP = 4;
const COLOR_PICKER_PADDING = 20;
const COLOR_DIVIDER_WIDTH = 2;
const COLOR_DIVIDER_MARGIN = 8;
const COLOR_DIVIDER_TOTAL_WIDTH = COLOR_DIVIDER_WIDTH + COLOR_DIVIDER_MARGIN * 2;
const COLOR_ITEM_WIDTH = COLOR_SQUARE_WIDTH + COLOR_PICKER_GAP;

// Animated Color Square Component
interface AnimatedColorSquareProps {
  colorOption: ProfileColorOption;
  isSelected: boolean;
  currentColors: { backgroundColor: string; textColor: string };
  backgroundFlex: SharedValue<number>;
  textFlex: SharedValue<number>;
  onPress: () => void;
}

const AnimatedColorSquare: React.FC<AnimatedColorSquareProps> = React.memo(
  function AnimatedColorSquare({
    colorOption,
    isSelected,
    currentColors,
    backgroundFlex,
    textFlex,
    onPress,
  }) {
    const backgroundAnimatedStyle = useAnimatedStyle(() => ({
      flex: backgroundFlex.value,
    }));

    const textAnimatedStyle = useAnimatedStyle(() => ({
      flex: textFlex.value,
    }));

    const displayBackgroundColor = colorOption.backgroundColor;
    const displayTextColor = colorOption.textColor;
    const colorSquareBorder = {
      borderColor: isSelected ? currentColors.textColor : Colors.transparent,
      borderWidth: isSelected ? 3 : 0,
    };

    return (
      <View style={styles.colorSquareContainer}>
        <Pressable style={[styles.colorSquare, colorSquareBorder]} onPress={onPress}>
          {/* Background color section */}
          <Animated.View
            style={[
              styles.colorSection,
              backgroundAnimatedStyle,
              { backgroundColor: displayBackgroundColor },
            ]}
          />

          {/* Text color section */}
          <Animated.View
            style={[styles.colorSection, textAnimatedStyle, { backgroundColor: displayTextColor }]}
          />
        </Pressable>
      </View>
    );
  }
);

const EditProfileScreen: React.FC = () => {
  const router = useRouter();
  const { currentUser } = useCurrentUser();
  const currentUserDid = currentUser?.did ?? null;
  const userHandle = currentUser?.handle ?? null;

  // Single source of truth for edit profile data (includes orbytRecord + orbytColors).
  const { data: profileData, refetch: refetchProfile } = useProfileByDid(currentUserDid);
  const [isAboutFocused, setIsAboutFocused] = useState(false);
  const [isDisplayNameFocused, setIsDisplayNameFocused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Handle formatting: detach ".bsky.social" or ".orbyt.video" suffix if present so we can
  // render the suffix separately in the UI (bottom-right of the section).
  const { handleBase, handleSuffix } = useMemo(() => {
    const rawHandle = profileData?.handle ?? userHandle ?? 'handle';
    return splitHandleSuffix(rawHandle);
  }, [profileData?.handle, userHandle]);

  // Form state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAvatar, setEditAvatar] = useState<string | undefined>(undefined);
  const [editFontPreference, setEditFontPreference] =
    useState<import('../src/utils/profileFonts').ProfileFontPreference>('default');
  const [fontPreferenceOverrideDid, setFontPreferenceOverrideDid] = useState<string | null>(null);
  const hasUserChangedDisplayName = useRef(false);
  const hasUserChangedDescription = useRef(false);
  const hasUserChangedAvatar = useRef(false);
  const hasUserChangedColors = useRef(false);

  // About length tracking
  const aboutCount = editDescription?.length || 0;
  const aboutOverBy = Math.max(0, aboutCount - ABOUT_MAX_LENGTH);
  const aboutRemaining = Math.max(0, ABOUT_MAX_LENGTH - aboutCount);

  // Color selection state - use index (null = custom)
  const [selectedColorIndex, setSelectedColorIndex] = useState<number | null>(0);
  const [customColors, setCustomColors] = useState<{
    backgroundColor: string;
    textColor: string;
  } | null>(null);

  // Track inverted state per color index
  const [invertedStates, setInvertedStates] = useState<Record<number, boolean>>({});

  // Track if user has custom colors (not matching any preset)
  const [hasCustomColors, setHasCustomColors] = useState(false);

  // Store original custom colors separately - these never change unless user explicitly saves custom color
  const [originalCustomColors, setOriginalCustomColors] = useState<{
    backgroundColor: string;
    textColor: string;
  } | null>(null);

  // Ref for color picker ScrollView to scroll to selected color
  const colorPickerScrollViewRef = useRef<ScrollView>(null);
  // Ref to track if we've done the initial scroll (no animation)
  const hasDoneInitialScroll = useRef(false);
  // Ref to track previous selectedColorIndex to detect user changes
  const previousSelectedColorIndex = useRef<number | null | undefined>(undefined);

  // Predefined color options - just the pairings
  const predefinedColors: ProfileColorOption[] = useMemo(
    () => [
      // Neutral/Universal (orbyt grey - matches DEFAULT_PROFILE_COLORS / palette)
      {
        backgroundColor: Colors.neutral[900],
        textColor: Colors.neutral[200],
      },
      // Primary - colored backgrounds with white text (ordered by hue - reverse rainbow order, red first)
      // Colors adjusted using HSL to be between original and brightened versions, ensuring WCAG AA compliance (4.5:1 contrast with white text)
      {
        backgroundColor: '#C6142E', // Red background (HSL: ~350°, ~85%, ~35%)
        textColor: Colors.neutral[50],
      },
      {
        backgroundColor: '#CC9900', // Yellow background (HSL: ~45°, ~100%, ~40% - vibrant yellow matching other primary colors, WCAG AA compliant)
        textColor: Colors.neutral[50],
      },
      {
        backgroundColor: '#3D9812', // Green background (HSL: ~105°, ~80%, ~32%)
        textColor: Colors.neutral[50],
      },
      {
        backgroundColor: '#0B9997', // Teal background (HSL: ~179°, ~88%, ~32%)
        textColor: Colors.neutral[50],
      },
      {
        backgroundColor: '#0E94C6', // Light blue background (HSL: ~195°, ~88%, ~42%)
        textColor: Colors.neutral[50],
      },
      {
        backgroundColor: '#0E46C6', // Blue background (HSL: ~220°, ~88%, ~42%)
        textColor: Colors.neutral[50],
      },
      {
        backgroundColor: '#5913C6', // Purple background (HSL: ~260°, ~88%, ~42%)
        textColor: Colors.neutral[50],
      },
      {
        backgroundColor: '#B713C6', // Pink background (HSL: ~295°, ~88%, ~42%)
        textColor: Colors.neutral[50],
      },
      {
        backgroundColor: '#f34965',
        textColor: Colors.neutral[900],
      },
      {
        backgroundColor: '#f3c949',
        textColor: Colors.neutral[900],
      },
      {
        backgroundColor: '#73f349',
        textColor: Colors.neutral[900],
      },
      {
        backgroundColor: '#49f3f1',
        textColor: Colors.neutral[900],
      },
      {
        backgroundColor: '#49c9f3',
        textColor: Colors.neutral[900],
      },
      {
        backgroundColor: '#5c8ff5',
        textColor: Colors.neutral[900],
      },
      {
        backgroundColor: '#8c57f4',
        textColor: Colors.neutral[900],
      },
      {
        backgroundColor: '#e549f3',
        textColor: Colors.neutral[900],
      },
      // Complementary - colored backgrounds with complementary text colors (ordered by hue - reverse rainbow order, red first)
      {
        backgroundColor: '#fba9d5',
        textColor: '#45498f',
      },
      {
        backgroundColor: '#02e4bf',
        textColor: '#414a76',
      },
      {
        backgroundColor: '#c9d3fe',
        textColor: '#b71431',
      },
      {
        backgroundColor: '#fbb300',
        textColor: '#2b212a',
      },
      {
        backgroundColor: '#1f1d46',
        textColor: '#f85d4a',
      },
      {
        backgroundColor: '#2d615e',
        textColor: '#fdc1b8',
      },
      {
        backgroundColor: '#03df6e',
        textColor: '#19304d',
      },
      {
        backgroundColor: '#ddf59c',
        textColor: '#367746',
      },
      {
        backgroundColor: '#523b99',
        textColor: '#fba2c3',
      },
      {
        backgroundColor: '#ecf9fb',
        textColor: '#66737e',
      },
      {
        backgroundColor: '#34333f',
        textColor: '#f88667',
      },
      {
        backgroundColor: '#524864',
        textColor: '#91f7f8',
      },
      {
        backgroundColor: '#fbc36e',
        textColor: '#575567',
      },
      {
        backgroundColor: '#cfdae7',
        textColor: '#b61a59', // Adjusted for WCAG AA compliance (4.522:1 contrast ratio)
      },
      {
        backgroundColor: '#0e1420',
        textColor: '#ff2c6f',
      },
      {
        backgroundColor: '#61678a',
        textColor: '#c6f6ad',
      },
      {
        backgroundColor: '#297873',
        textColor: '#f4fcc3',
      },
      {
        backgroundColor: '#71acab',
        textColor: '#3a383f',
      },
      {
        backgroundColor: '#84366e',
        textColor: '#fcb1d4',
      },
      {
        backgroundColor: '#926879',
        textColor: '#fef9fb',
      },
      {
        backgroundColor: '#4f4085',
        textColor: '#fda29f',
      },
      {
        backgroundColor: '#464b61',
        textColor: '#caf7fb',
      },
      {
        backgroundColor: '#9584da',
        textColor: '#2d234b',
      },
      {
        backgroundColor: '#581b34',
        textColor: '#ff6340',
      },
      // Neon - very dark backgrounds with neon text colors (ordered by hue - reverse rainbow order, red first)
      // All backgrounds: HSL(*, 100%, ~9%) for consistent darkness
      // All text colors: HSL(*, ~95%, ~62%) for consistent brightness and vibrancy
      {
        backgroundColor: '#00132e', // Blue
        textColor: '#42aefa', // Blue
      },
      {
        backgroundColor: '#2e0005', // Red (normalized to match others)
        textColor: '#fa4254', // Red (normalized to match others)
      },
      {
        backgroundColor: '#11002e', // Purple
        textColor: '#ce42fa', // Purple
      },
      {
        backgroundColor: '#002e2e', // Teal
        textColor: '#42fadb', // Teal
      },
      {
        backgroundColor: '#002e13', // Green (adjusted for better separation from Teal)
        textColor: '#42fa8f', // Green (adjusted for better separation from Teal)
      },
      {
        backgroundColor: '#092e00', // Green Bright
        textColor: '#83fa42', // Green Bright
      },
      {
        backgroundColor: '#2e1b00', // Gold
        textColor: '#faad42', // Gold
      },
    ],
    []
  );

  // Generate shared values for all colors - create array matching predefinedColors length
  // Must create them all explicitly since hooks can't be called in loops
  // predefinedColors has 40 items, create all shared values at top level
  const colorFlexValues: Array<{ background: SharedValue<number>; text: SharedValue<number> }> = [
    { background: useSharedValue(3), text: useSharedValue(1) }, // 0
    { background: useSharedValue(3), text: useSharedValue(1) }, // 1
    { background: useSharedValue(3), text: useSharedValue(1) }, // 2
    { background: useSharedValue(3), text: useSharedValue(1) }, // 3
    { background: useSharedValue(3), text: useSharedValue(1) }, // 4
    { background: useSharedValue(3), text: useSharedValue(1) }, // 5
    { background: useSharedValue(3), text: useSharedValue(1) }, // 6
    { background: useSharedValue(3), text: useSharedValue(1) }, // 7
    { background: useSharedValue(3), text: useSharedValue(1) }, // 8
    { background: useSharedValue(3), text: useSharedValue(1) }, // 9
    { background: useSharedValue(3), text: useSharedValue(1) }, // 10
    { background: useSharedValue(3), text: useSharedValue(1) }, // 11
    { background: useSharedValue(3), text: useSharedValue(1) }, // 12
    { background: useSharedValue(3), text: useSharedValue(1) }, // 13
    { background: useSharedValue(3), text: useSharedValue(1) }, // 14
    { background: useSharedValue(3), text: useSharedValue(1) }, // 15
    { background: useSharedValue(3), text: useSharedValue(1) }, // 16
    { background: useSharedValue(3), text: useSharedValue(1) }, // 17
    { background: useSharedValue(3), text: useSharedValue(1) }, // 18
    { background: useSharedValue(3), text: useSharedValue(1) }, // 19
    { background: useSharedValue(3), text: useSharedValue(1) }, // 20
    { background: useSharedValue(3), text: useSharedValue(1) }, // 21
    { background: useSharedValue(3), text: useSharedValue(1) }, // 22
    { background: useSharedValue(3), text: useSharedValue(1) }, // 23
    { background: useSharedValue(3), text: useSharedValue(1) }, // 24
    { background: useSharedValue(3), text: useSharedValue(1) }, // 25
    { background: useSharedValue(3), text: useSharedValue(1) }, // 26
    { background: useSharedValue(3), text: useSharedValue(1) }, // 27
    { background: useSharedValue(3), text: useSharedValue(1) }, // 28
    { background: useSharedValue(3), text: useSharedValue(1) }, // 29
    { background: useSharedValue(3), text: useSharedValue(1) }, // 30
    { background: useSharedValue(3), text: useSharedValue(1) }, // 31
    { background: useSharedValue(3), text: useSharedValue(1) }, // 32
    { background: useSharedValue(3), text: useSharedValue(1) }, // 33
    { background: useSharedValue(3), text: useSharedValue(1) }, // 34
    { background: useSharedValue(3), text: useSharedValue(1) }, // 35
    { background: useSharedValue(3), text: useSharedValue(1) }, // 36
    { background: useSharedValue(3), text: useSharedValue(1) }, // 37
    { background: useSharedValue(3), text: useSharedValue(1) }, // 38
    { background: useSharedValue(3), text: useSharedValue(1) }, // 39
  ];

  // Custom color flex values (for non-preset colors)
  const customFlexValues = {
    background: useSharedValue(3),
    text: useSharedValue(1),
  };

  // Store refs to SharedValues to avoid immutability issues in callbacks
  // SharedValues are stable references, but the array/object containers are recreated each render
  const colorFlexValuesRef = useRef(colorFlexValues);
  const customFlexValuesRef = useRef(customFlexValues);

  // Update refs after render to always point to current containers
  // (SharedValue objects inside are stable, but containers are recreated)
  useLayoutEffect(() => {
    colorFlexValuesRef.current = colorFlexValues;
    customFlexValuesRef.current = customFlexValues;
  });

  // Helper function to update flex values for a color
  const updateFlexValues = useCallback(
    (colorIndex: number | null, inverted: boolean, animated: boolean = false) => {
      const flexValues =
        colorIndex === null ? customFlexValuesRef.current : colorFlexValuesRef.current[colorIndex];

      if (!flexValues) return;

      const backgroundValue = inverted ? 1 : 3;
      const textValue = inverted ? 3 : 1;

      if (animated) {
        flexValues.background.value = withSpring(backgroundValue);
        flexValues.text.value = withSpring(textValue);
      } else {
        flexValues.background.value = backgroundValue;
        flexValues.text.value = textValue;
      }
    },
    []
  );

  // Helper function to find color match (normal or inverted)
  const findColorMatch = useCallback(
    (colors: { backgroundColor: string; textColor: string }) => {
      // Check for normal match and track index during find
      for (let i = 0; i < predefinedColors.length; i++) {
        const preset = predefinedColors[i];
        if (
          preset.backgroundColor === colors.backgroundColor &&
          preset.textColor === colors.textColor
        ) {
          return {
            match: preset,
            index: i,
            inverted: false,
          };
        }
      }

      // Check for inverted match and track index during find
      for (let i = 0; i < predefinedColors.length; i++) {
        const preset = predefinedColors[i];
        if (
          preset.backgroundColor === colors.textColor &&
          preset.textColor === colors.backgroundColor
        ) {
          return {
            match: preset,
            index: i,
            inverted: true,
          };
        }
      }

      return null;
    },
    [predefinedColors]
  );

  // Mutation
  const profileUpdateMutation = useProfileUpdateMutation();

  // Get colors from profile record (single source of truth)
  const defaultColors = useMemo(() => {
    const colors = profileData?.orbytColors;
    if (!colors?.backgroundColor || !colors?.textColor) {
      return undefined;
    }
    return {
      backgroundColor: colors.backgroundColor,
      textColor: colors.textColor,
    };
  }, [profileData]);

  // Keep the saved profile font as the source of truth until user explicitly changes it.
  const syncedFontPreference = useMemo(
    () => sanitizeProfileFontPreference(profileData?.orbytRecord?.fontPreference) || 'default',
    [profileData?.orbytRecord?.fontPreference]
  );
  const activeFontPreference =
    fontPreferenceOverrideDid === currentUserDid ? editFontPreference : syncedFontPreference;

  // Refetch profile on screen focus so edits don't open on stale cache.
  useFocusEffect(
    useCallback(() => {
      refetchProfile();
    }, [refetchProfile])
  );

  // Reset "user edited" guards when account/profile changes.
  useEffect(() => {
    hasUserChangedDisplayName.current = false;
    hasUserChangedDescription.current = false;
    hasUserChangedAvatar.current = false;
    hasUserChangedColors.current = false;
  }, [currentUserDid]);

  // Keep text/avatar fields synced with profile until user edits them.
  useEffect(() => {
    if (!profileData) return;
    startTransition(() => {
      if (!hasUserChangedDisplayName.current) {
        setEditDisplayName(profileData.displayName || '');
      }
      if (!hasUserChangedDescription.current) {
        setEditDescription(profileData.description || '');
      }
      if (!hasUserChangedAvatar.current) {
        setEditAvatar(undefined);
      }
    });
  }, [profileData?.did, profileData?.displayName, profileData?.description, profileData]);

  // Keep color selection synced with profile colors until user edits colors.
  useEffect(() => {
    if (!profileData || hasUserChangedColors.current) return;

    if (defaultColors) {
      const match = findColorMatch(defaultColors);
      if (match) {
        startTransition(() => {
          setSelectedColorIndex(match.index);
          setInvertedStates({ [match.index]: match.inverted });
          setCustomColors({
            backgroundColor: defaultColors.backgroundColor,
            textColor: defaultColors.textColor,
          });
          setHasCustomColors(false);
        });
        updateFlexValues(match.index, match.inverted, false);
      } else {
        const originalColors = {
          backgroundColor: defaultColors.backgroundColor,
          textColor: defaultColors.textColor,
        };
        startTransition(() => {
          setSelectedColorIndex(null);
          setInvertedStates({});
          setCustomColors(originalColors);
          setOriginalCustomColors(originalColors);
          setHasCustomColors(true);
        });
        updateFlexValues(null, false, false);
      }
    } else {
      startTransition(() => {
        setSelectedColorIndex(0);
        setInvertedStates({});
        setCustomColors(null);
        setHasCustomColors(false);
      });
      updateFlexValues(0, false, false);
    }
  }, [profileData?.did, defaultColors, findColorMatch, updateFlexValues, profileData]);

  // Scroll to selected color - no animation on initial load, animated for user selections
  useEffect(() => {
    if (!colorPickerScrollViewRef.current) {
      return;
    }

    // Skip if selection hasn't changed (for user selections)
    if (hasDoneInitialScroll.current && previousSelectedColorIndex.current === selectedColorIndex) {
      return;
    }

    const screenWidth = Dimensions.get('window').width;

    // Calculate center X position of selected color
    let colorCenterX: number;
    if (selectedColorIndex === null) {
      // Custom color is at the start
      colorCenterX = COLOR_PICKER_PADDING + COLOR_SQUARE_WIDTH / 2;
    } else {
      // Account for custom color box and divider if shown
      const customColorOffset = hasCustomColors ? COLOR_ITEM_WIDTH + COLOR_DIVIDER_TOTAL_WIDTH : 0;
      colorCenterX =
        customColorOffset +
        selectedColorIndex * COLOR_ITEM_WIDTH +
        COLOR_PICKER_PADDING +
        COLOR_SQUARE_WIDTH / 2;
    }

    // Center the color box in the visible area
    const scrollPosition = Math.max(0, colorCenterX - screenWidth / 2);

    // Determine if this should be animated (only after initial scroll is done)
    const shouldAnimate = hasDoneInitialScroll.current;

    // Use requestAnimationFrame to ensure layout is complete
    requestAnimationFrame(() => {
      colorPickerScrollViewRef.current?.scrollTo({
        x: scrollPosition,
        animated: shouldAnimate,
      });
      hasDoneInitialScroll.current = true;
      previousSelectedColorIndex.current = selectedColorIndex;
    });
  }, [selectedColorIndex, hasCustomColors]);

  // Handle avatar selection
  const handleAvatarPress = useCallback(async () => {
    try {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (cameraStatus !== 'granted' || libraryStatus !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Camera and photo library access are required to change your avatar.'
        );
        return;
      }

      Alert.alert('Change Avatar', 'Choose how you want to update your avatar', [
        {
          text: 'Camera',
          onPress: async () => {
            try {
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              });

              if (!result.canceled && result.assets && result.assets[0] && result.assets[0].uri) {
                hasUserChangedAvatar.current = true;
                setEditAvatar(result.assets[0].uri || undefined);
              }
            } catch (_error) {
              Alert.alert('Error', 'Failed to open camera. Please try again.');
            }
          },
        },
        {
          text: 'Photo Library',
          onPress: async () => {
            try {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              });

              if (!result.canceled && result.assets && result.assets[0] && result.assets[0].uri) {
                hasUserChangedAvatar.current = true;
                setEditAvatar(result.assets[0].uri || undefined);
              }
            } catch (_error) {
              Alert.alert('Error', 'Failed to open photo library. Please try again.');
            }
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]);
    } catch (_error) {
      Alert.alert('Error', 'Failed to open image picker. Please try again.');
    }
  }, []);

  // Handle color selection - unified for both predefined and custom colors
  const handleColorSelect = useCallback(
    (colorIndex: number | null, colorOption: ProfileColorOption) => {
      hasUserChangedColors.current = true;
      const isAlreadySelected = selectedColorIndex === colorIndex;
      const isCustom = colorIndex === null;
      const stateKey = isCustom ? -1 : colorIndex;

      if (isAlreadySelected) {
        // Invert colors - toggle inverted state
        const currentInverted = invertedStates[stateKey] || false;
        const newInverted = !currentInverted;
        setInvertedStates(prev => ({ ...prev, [stateKey]: newInverted }));

        const baseColors = isCustom && originalCustomColors ? originalCustomColors : colorOption;
        const currentBg = customColors?.backgroundColor || baseColors.backgroundColor;
        const currentText = customColors?.textColor || baseColors.textColor;

        setCustomColors({
          backgroundColor: currentText,
          textColor: currentBg,
        });

        updateFlexValues(colorIndex, newInverted, true);
      } else {
        // Animate previous box back to normal if it was inverted
        const prevStateKey = selectedColorIndex === null ? -1 : selectedColorIndex;
        if (invertedStates[prevStateKey]) {
          setInvertedStates(prev => ({ ...prev, [prevStateKey]: false }));
          updateFlexValues(selectedColorIndex, false, true);
        }

        // Select new color
        setSelectedColorIndex(colorIndex);
        const wasInverted = invertedStates[stateKey] || false;
        const colorsToUse = isCustom && originalCustomColors ? originalCustomColors : colorOption;

        setCustomColors({
          backgroundColor: wasInverted ? colorsToUse.textColor : colorsToUse.backgroundColor,
          textColor: wasInverted ? colorsToUse.backgroundColor : colorsToUse.textColor,
        });

        updateFlexValues(colorIndex, wasInverted, true);
      }
    },
    [selectedColorIndex, invertedStates, customColors, originalCustomColors, updateFlexValues]
  );

  // Handle save
  const handleSave = useCallback(async () => {
    if (!profileData?.handle) {
      return;
    }

    setIsSaving(true);

    try {
      // Create updates object
      const updates: {
        displayName?: string;
        description?: string;
        avatar?: string;
        customColors?: {
          backgroundColor: string;
          textColor: string;
        };
        fontPreference?: import('../src/utils/profileFonts').ProfileFontPreference | null;
      } = {};

      // Check displayName — allow empty string to clear (no name)
      const displayNameChanged = (profileData.displayName ?? '') !== editDisplayName;
      if (displayNameChanged) {
        updates.displayName = editDisplayName;
      }

      // Check description — allow empty string to clear (no about)
      const descriptionChanged = (profileData.description ?? '') !== editDescription;
      if (descriptionChanged) {
        updates.description = editDescription;
      }

      // Check avatar
      if (editAvatar) {
        updates.avatar = editAvatar;
      }

      // Check custom colors
      const shouldIncludeColors =
        customColors &&
        (!defaultColors ||
          customColors.backgroundColor !== defaultColors.backgroundColor ||
          customColors.textColor !== defaultColors.textColor);
      if (shouldIncludeColors) {
        updates.customColors = customColors;
      }

      const savedFontPreference = sanitizeProfileFontPreference(
        profileData.orbytRecord?.fontPreference
      );
      const nextFontPreference = activeFontPreference === 'default' ? null : activeFontPreference;
      if ((savedFontPreference ?? 'default') !== activeFontPreference) {
        updates.fontPreference = nextFontPreference;
      }

      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        await profileUpdateMutation.mutateAsync({
          handle: profileData.handle,
          updates,
        });

        if (currentUser?.did && updates.customColors) {
          await saveAndSyncColors(currentUser.did, updates.customColors);
        }
      }

      router.dismiss();
    } catch (_error) {
      setIsSaving(false);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    }
  }, [
    profileData,
    editDisplayName,
    editDescription,
    editAvatar,
    customColors,
    defaultColors,
    activeFontPreference,
    profileUpdateMutation,
    router,
    currentUser,
    setIsSaving,
  ]);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    router.dismiss();
  }, [router]);

  // Helper to dismiss keyboard and reset focus states
  const dismissKeyboardAndFocus = useCallback(() => {
    Keyboard.dismiss();
    setIsAboutFocused(false);
    setIsDisplayNameFocused(false);
  }, []);

  // Get current colors for display
  const currentColors = useMemo(() => {
    if (customColors) {
      return customColors;
    }
    return {
      backgroundColor: defaultColors?.backgroundColor || Colors.black,
      textColor: defaultColors?.textColor || Colors.neutral[50],
    };
  }, [customColors, defaultColors]);
  const isSaveDisabled = isSaving || (isAboutFocused && aboutOverBy > 0);
  const selectedHeaderFontSet = useMemo(
    () => getHeaderFontSet(activeFontPreference),
    [activeFontPreference]
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Header and Color Picker - Black Background Section */}
      <SafeAreaView edges={['top']} style={styles.topSafeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              if (isAboutFocused) {
                setEditDescription(profileData?.description || '');
                dismissKeyboardAndFocus();
              } else if (isDisplayNameFocused) {
                setEditDisplayName(profileData?.displayName || '');
                dismissKeyboardAndFocus();
              } else {
                handleDismiss();
              }
            }}
            style={styles.cancelButton}
          >
            <Text style={[styles.cancelButtonText, { color: Colors.neutral[50] }]}>
              {isAboutFocused || isDisplayNameFocused ? 'Back' : 'Cancel'}
            </Text>
          </Pressable>

          {isAboutFocused && (aboutRemaining <= 50 || aboutOverBy > 0) && (
            <View style={styles.headerCenter}>
              <Text style={styles.aboutHeaderCounter}>
                <Text
                  style={[
                    styles.aboutHeaderCurrent,
                    aboutOverBy > 0 && styles.aboutHeaderCurrentOver,
                  ]}
                >
                  {aboutCount}
                </Text>
                <Text>{` / ${ABOUT_MAX_LENGTH}`}</Text>
              </Text>
            </View>
          )}

          <Pressable
            style={[
              styles.saveButtonGlass,
              !isLiquidGlassAvailable() && styles.saveButton,
              isAboutFocused && aboutOverBy > 0 && styles.saveButtonDisabled,
            ]}
            onPress={() => {
              if (isAboutFocused) {
                if (aboutOverBy > 0) {
                  return;
                }
                dismissKeyboardAndFocus();
              } else if (isDisplayNameFocused) {
                dismissKeyboardAndFocus();
              } else {
                handleSave();
              }
            }}
            disabled={isSaveDisabled}
          >
            {isLiquidGlassAvailable() && (
              <GlassView
                style={styles.glassBackground}
                glassEffectStyle="clear"
                tintColor={hexToRGBA(
                  Colors.neutral[50],
                  isAboutFocused && aboutOverBy > 0 ? 0.35 : 0.9
                )}
                isInteractive
              />
            )}
            <View pointerEvents="none">
              {isSaving ? (
                <CheckIcon size={17} color={Colors.black} strokeWidth={2.5} />
              ) : (
                <Text
                  style={[
                    styles.saveButtonText,
                    isLiquidGlassAvailable() && { color: Colors.black },
                    isAboutFocused && aboutOverBy > 0 && { color: hexToRGBA(Colors.black, 0.25) },
                  ]}
                >
                  {isAboutFocused || isDisplayNameFocused ? 'Done' : 'Save'}
                </Text>
              )}
            </View>
          </Pressable>
        </View>

        {/* Color Picker */}
        <View style={styles.colorPickerSection}>
          <ScrollView
            ref={colorPickerScrollViewRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.colorPickerContainer}
            style={styles.colorPickerScrollView}
            keyboardShouldPersistTaps="always"
          >
            {/* Custom Color Box - shown only when user has custom colors not matching presets */}
            {hasCustomColors && originalCustomColors && (
              <>
                <AnimatedColorSquare
                  colorOption={{
                    backgroundColor: originalCustomColors.backgroundColor,
                    textColor: originalCustomColors.textColor,
                  }}
                  isSelected={selectedColorIndex === null}
                  currentColors={currentColors}
                  backgroundFlex={customFlexValues.background}
                  textFlex={customFlexValues.text}
                  onPress={() =>
                    handleColorSelect(null, {
                      backgroundColor: originalCustomColors.backgroundColor,
                      textColor: originalCustomColors.textColor,
                    })
                  }
                />
                <View style={styles.colorDivider} />
              </>
            )}

            {predefinedColors.map((colorOption, index) => {
              const isSelected = selectedColorIndex === index;
              const flexValues = colorFlexValues[index];

              if (!flexValues) return null;

              return (
                <AnimatedColorSquare
                  key={index}
                  colorOption={colorOption}
                  isSelected={isSelected}
                  currentColors={currentColors}
                  backgroundFlex={flexValues.background}
                  textFlex={flexValues.text}
                  onPress={() => handleColorSelect(index, colorOption)}
                />
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.fontPickerSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.fontPickerContainer}
            style={styles.colorPickerScrollView}
            keyboardShouldPersistTaps="always"
          >
            {PROFILE_FONT_OPTIONS.map(option => {
              const isSelected = activeFontPreference === option.key;
              const optionFontSet = getHeaderFontSet(option.key);
              return (
                <Pressable
                  key={option.key}
                  style={[styles.fontOptionItem, isSelected && styles.fontOptionItemSelected]}
                  onPress={() => {
                    setFontPreferenceOverrideDid(currentUserDid);
                    setEditFontPreference(option.key);
                  }}
                >
                  <Text
                    style={[
                      styles.fontOptionText,
                      {
                        color: isSelected ? Colors.neutral[50] : Colors.neutral[400],
                        fontFamily: optionFontSet.actionBold,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </SafeAreaView>

      {/* Profile Editing Fields - Sheet Content */}
      <View
        style={[styles.bottomSectionContainer, { backgroundColor: currentColors.backgroundColor }]}
      >
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: currentColors.backgroundColor }]}
          edges={['bottom']}
        >
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainerFlexGrow}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
          >
            {/* Handle & Avatar Sections */}
            {!isAboutFocused && !isDisplayNameFocused && (
              <Animated.View
                layout={Layout.springify().duration(280)}
                entering={FadeIn.duration(280).easing(Easing.out(Easing.ease))}
                exiting={FadeOut.duration(100).easing(Easing.in(Easing.ease))}
              >
                {/* Handle Section */}
                <View style={styles.handleSection}>
                  <Text
                    style={[
                      styles.sectionTitle,
                      {
                        color: hexToRGBA(currentColors.textColor, 0.9),
                      },
                    ]}
                  >
                    HANDLE
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    bounces={false}
                    contentContainerStyle={styles.contentContainerFlexGrow}
                  >
                    <Text
                      style={[
                        styles.largeText,
                        { color: currentColors.textColor, fontFamily: selectedHeaderFontSet.title },
                      ]}
                    >
                      <Text
                        style={[
                          styles.handleAt,
                          {
                            color: hexToRGBA(currentColors.textColor, 0.5),
                            fontFamily: selectedHeaderFontSet.subtitle,
                          },
                        ]}
                      >
                        @
                      </Text>
                      <Text>
                        {' '}
                        {handleBase}
                        {handleSuffix && (
                          <Text
                            style={[
                              styles.handleSuffix,
                              {
                                color: hexToRGBA(currentColors.textColor, 0.7),
                                fontFamily: selectedHeaderFontSet.subtitle,
                              },
                            ]}
                          >
                            {handleSuffix}
                          </Text>
                        )}
                      </Text>
                    </Text>
                  </ScrollView>
                </View>

                <View
                  style={[
                    styles.divider,
                    {
                      backgroundColor: blendColors(
                        currentColors.backgroundColor,
                        currentColors.textColor,
                        0.2
                      ),
                    },
                  ]}
                />

                {/* Avatar Section */}
                <View style={styles.section}>
                  <View style={styles.avatarContainer}>
                    <Avatar
                      uri={editAvatar || profileData?.avatar}
                      type="profile"
                      size={112}
                      profileColors={{
                        backgroundColor: currentColors.backgroundColor,
                        textColor: currentColors.textColor,
                        foregroundColor: currentColors.textColor,
                      }}
                      showRing={true}
                    />
                    <View style={styles.avatarButtonColumn}>
                      <Text
                        style={[
                          styles.sectionTitle,
                          styles.sectionTitleAvatar,
                          {
                            color: hexToRGBA(currentColors.textColor, 0.8),
                          },
                        ]}
                      >
                        PROFILE PICTURE
                      </Text>
                      <Pressable
                        style={[
                          styles.uploadButton,
                          {
                            backgroundColor: blendColors(
                              currentColors.backgroundColor,
                              currentColors.textColor,
                              0.15
                            ),
                          },
                        ]}
                        onPress={handleAvatarPress}
                      >
                        <Text
                          style={[
                            styles.uploadButtonText,
                            {
                              color: currentColors.textColor,
                            },
                          ]}
                        >
                          Upload
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View
                  style={[
                    styles.divider,
                    {
                      backgroundColor: blendColors(
                        currentColors.backgroundColor,
                        currentColors.textColor,
                        0.12
                      ),
                    },
                  ]}
                />
              </Animated.View>
            )}

            {/* Display Name Section */}
            {!isAboutFocused && (
              <Animated.View
                layout={Layout.springify().duration(280)}
                style={[styles.section, isDisplayNameFocused && styles.expandedSection]}
              >
                <Pressable
                  onPress={() => {
                    if (!isDisplayNameFocused) {
                      setIsDisplayNameFocused(true);
                      setIsAboutFocused(false);
                    }
                  }}
                >
                  <Animated.View entering={FadeIn.duration(150).easing(Easing.out(Easing.ease))}>
                    <Text
                      style={[
                        styles.sectionTitle,
                        styles.sectionTitleDisplayName,
                        {
                          color: hexToRGBA(currentColors.textColor, 0.8),
                        },
                      ]}
                    >
                      DISPLAY NAME
                    </Text>
                    <TextInput
                      nativeID="edit-profile-display-name-input"
                      style={[
                        styles.largeInput,
                        styles.largeInputTransparent,
                        { color: currentColors.textColor, fontFamily: selectedHeaderFontSet.title },
                        isDisplayNameFocused && styles.flex1,
                      ]}
                      value={editDisplayName}
                      onChangeText={text => {
                        hasUserChangedDisplayName.current = true;
                        setEditDisplayName(text);
                      }}
                      placeholder="Name"
                      placeholderTextColor={hexToRGBA(currentColors.textColor, 0.3)}
                      scrollEnabled
                      maxLength={65}
                      autoComplete="name"
                      textContentType="name"
                      importantForAutofill="yes"
                      caretHidden={false}
                      onFocus={() => {
                        setIsDisplayNameFocused(true);
                        setIsAboutFocused(false);
                      }}
                    />
                  </Animated.View>
                </Pressable>
              </Animated.View>
            )}

            {!isAboutFocused && !isDisplayNameFocused && (
              <View
                style={[
                  styles.divider,
                  {
                    backgroundColor: blendColors(
                      currentColors.backgroundColor,
                      currentColors.textColor,
                      0.12
                    ),
                  },
                ]}
              />
            )}

            {/* About Section */}
            {!isDisplayNameFocused && (
              <Animated.View
                layout={Layout.springify().duration(280)}
                style={[
                  styles.section,
                  styles.aboutSectionContainer,
                  isAboutFocused && styles.expandedSection,
                ]}
              >
                <Pressable
                  onPress={() => {
                    if (!isAboutFocused) {
                      setIsAboutFocused(true);
                      setIsDisplayNameFocused(false);
                    }
                  }}
                  style={styles.aboutContentWrapper}
                >
                  <Animated.View
                    entering={FadeIn.duration(150).easing(Easing.out(Easing.ease))}
                    style={styles.flex1}
                  >
                    <Text
                      style={[
                        styles.sectionTitle,
                        {
                          color: hexToRGBA(currentColors.textColor, 0.8),
                        },
                      ]}
                    >
                      ABOUT
                    </Text>
                    <TextInput
                      nativeID="edit-profile-about-input"
                      style={[
                        styles.textArea,
                        {
                          color: currentColors.textColor,
                          fontFamily: selectedHeaderFontSet.description,
                        },
                      ]}
                      value={editDescription}
                      onChangeText={text => {
                        hasUserChangedDescription.current = true;
                        setEditDescription(text);
                      }}
                      placeholder="Tell us about yourself"
                      placeholderTextColor={hexToRGBA(currentColors.textColor, 0.3)}
                      multiline
                      autoComplete="off"
                      textContentType="none"
                      importantForAutofill="no"
                      caretHidden={false}
                      onFocus={() => {
                        setIsAboutFocused(true);
                        setIsDisplayNameFocused(false);
                      }}
                    />
                  </Animated.View>
                </Pressable>
              </Animated.View>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  topSafeArea: {
    backgroundColor: Colors.black,
  },
  colorPickerSection: {
    paddingBottom: 16,
  },
  fontPickerSection: {
    paddingBottom: 14,
  },
  fontPickerContainer: {
    paddingHorizontal: 20,
    gap: 18,
  },
  fontOptionItem: {
    paddingTop: 6,
    paddingBottom: 4,
    alignItems: 'center',
  },
  fontOptionItemSelected: {},
  fontOptionText: {
    fontSize: 14,
  },
  bottomSectionContainer: {
    flex: 1,
    borderTopLeftRadius: BORDER_RADIUS.LARGE,
    borderTopRightRadius: BORDER_RADIUS.LARGE,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelButtonText: {
    fontFamily: 'Figtree-Bold',
    fontSize: 17,
  },
  saveButton: {
    backgroundColor: Colors.neutral[50],
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonGlass: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glassBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
  },
  saveButtonText: {
    fontFamily: 'Figtree-Bold',
    fontSize: 17,
    color: Colors.black,
    fontWeight: '600',
  },
  aboutHeaderCounter: {
    marginHorizontal: 8,
    fontFamily: 'Figtree-SemiBold',
    fontSize: 14,
    color: Colors.neutral[50],
  },
  aboutHeaderCurrent: {
    fontFamily: 'Figtree-SemiBold',
    fontSize: 16,
  },
  aboutHeaderCurrentOver: {
    color: Colors.coral[500],
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  contentContainerFlexGrow: {
    flexGrow: 1,
  },
  sectionTitleAvatar: {
    marginLeft: 6,
  },
  sectionTitleDisplayName: {
    marginBottom: 2,
  },
  largeInputTransparent: {
    backgroundColor: Colors.transparent,
    borderColor: Colors.transparent,
  },
  flex1: {
    flex: 1,
  },
  section: {
    marginTop: 0,
  },
  aboutSectionContainer: {
    minHeight: 200,
    flexGrow: 1,
  },
  expandedSection: {
    flex: 1,
  },
  aboutContentWrapper: {
    flex: 1,
  },
  handleSection: {
    marginTop: 0,
    position: 'relative',
  },
  sectionTitle: {
    fontFamily: 'Figtree-SemiBold',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  largeText: {
    fontFamily: 'Figtree-Black',
    fontSize: 26,
    lineHeight: 32,
  },
  handleAt: {
    fontFamily: 'Figtree-Medium',
    fontWeight: '400',
    fontSize: 30,
    lineHeight: 32,
  },
  handleSuffix: {
    fontFamily: 'Figtree-Medium',
    fontSize: 18,
  },
  largeInput: {
    fontFamily: 'Figtree-Black',
    fontSize: 32,
    lineHeight: 40,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginTop: 0,
    textAlignVertical: 'center',
    backgroundColor: Colors.transparent,
  },
  divider: {
    height: 2,
    marginVertical: 20,
    marginHorizontal: -20,
  },
  avatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarButtonColumn: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 6,
  },
  uploadButton: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
    overflow: 'hidden',
  },
  uploadButtonText: {
    fontFamily: 'Figtree-Bold',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  colorPickerScrollView: {
    marginHorizontal: 0,
  },
  colorPickerContainer: {
    paddingHorizontal: 20,
    gap: 4,
  },
  colorSquareContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDivider: {
    width: 2,
    height: 44,
    backgroundColor: Colors.overlay.white30,
    marginHorizontal: 8,
  },
  colorSquare: {
    width: 44,
    height: 44,
    overflow: 'hidden',
    shadowColor: Colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  colorSection: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  textArea: {
    fontFamily: 'Figtree-Medium',
    fontSize: 16,
    marginTop: 0,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: Colors.transparent,
    flex: 1,
  },
});

export default EditProfileScreen;
