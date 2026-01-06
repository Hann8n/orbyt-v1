import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
import { Colors, Avatar } from '../src/components/ui/UI';
import { Loading3FillIcon } from '../src/components/ui/Icon';
import { useProfileUpdateMutation, useProfile } from '../src/services/data/ProfileService';
import { hexToRGBA } from '../src/utils/formatting/colors';
import { BORDER_RADIUS } from '../src/utils/constants';
import { useCurrentUser } from '../src/stores/userStore';
import { splitHandleSuffix } from '../src/utils/formatting/handles';

export interface ProfileColorOption {
  backgroundColor: string;
  textColor: string;
}

const ABOUT_MAX_LENGTH = 256;

// Animated Color Square Component
interface AnimatedColorSquareProps {
  colorOption: ProfileColorOption;
  isSelected: boolean;
  currentColors: { backgroundColor: string; textColor: string };
  backgroundFlex: SharedValue<number>;
  textFlex: SharedValue<number>;
  onPress: () => void;
}

const AnimatedColorSquare: React.FC<AnimatedColorSquareProps> = ({
  colorOption,
  isSelected,
  currentColors,
  backgroundFlex,
  textFlex,
  onPress,
}) => {
  const backgroundAnimatedStyle = useAnimatedStyle(() => {
    return {
      flex: backgroundFlex.value,
    };
  });

  const textAnimatedStyle = useAnimatedStyle(() => {
    return {
      flex: textFlex.value,
    };
  });

  // Determine colors to display for the color box itself.
  // We intentionally always use the preset colors here so that toggling
  // inversion does not swap the visual colors inside the box; only the
  // proportions (flex) change.
  const displayBackgroundColor = colorOption.backgroundColor;
  const displayTextColor = colorOption.textColor;

  return (
    <View style={styles.colorSquareContainer}>
      <Pressable
        style={[
          styles.colorSquare,
          {
            borderColor: isSelected ? currentColors.textColor : 'transparent',
            borderWidth: isSelected ? 3 : 0,
          },
        ]}
        onPress={onPress}
      >
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
};

const EditProfileScreen: React.FC = () => {
  const router = useRouter();
  const { currentUser } = useCurrentUser();
  const userHandle = currentUser?.handle || null;

  // Fetch profile data - use cache directly, no refetch
  const { data: profileData } = useProfile(userHandle);
  const [isAboutFocused, setIsAboutFocused] = useState(false);

  // Handle formatting: detach ".bsky.social" or ".orbyt.video" suffix if present so we can
  // render the suffix separately in the UI (bottom-right of the section).
  const { handleBase, handleSuffix } = useMemo(() => {
    const rawHandle = profileData?.handle ?? userHandle ?? 'username';
    return splitHandleSuffix(rawHandle);
  }, [profileData?.handle, userHandle]);

  // Form state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAvatar, setEditAvatar] = useState<string | undefined>(undefined);

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

  // Ref to track if we've initialized colors to prevent infinite loops
  const hasInitializedColors = useRef(false);
  // Ref for color picker ScrollView to scroll to selected color
  const colorPickerScrollViewRef = useRef<ScrollView>(null);

  // Predefined color options - just the pairings
  const predefinedColors: ProfileColorOption[] = useMemo(
    () => [
      // Neutral/Universal
      {
        backgroundColor: Colors.black,
        textColor: Colors.lightGray,
      },
      // Primary - colored backgrounds with white text (ordered by hue - reverse rainbow order, red first)
      // Colors adjusted using HSL to be between original and brightened versions, ensuring WCAG AA compliance (4.5:1 contrast with white text)
      {
        backgroundColor: '#C6142E', // Red background (HSL: ~350°, ~85%, ~35%)
        textColor: Colors.white,
      },
      {
        backgroundColor: '#CC9900', // Yellow background (HSL: ~45°, ~100%, ~40% - vibrant yellow matching other primary colors, WCAG AA compliant)
        textColor: Colors.white,
      },
      {
        backgroundColor: '#3D9812', // Green background (HSL: ~105°, ~80%, ~32%)
        textColor: Colors.white,
      },
      {
        backgroundColor: '#0B9997', // Teal background (HSL: ~179°, ~88%, ~32%)
        textColor: Colors.white,
      },
      {
        backgroundColor: '#0E94C6', // Light blue background (HSL: ~195°, ~88%, ~42%)
        textColor: Colors.white,
      },
      {
        backgroundColor: '#0E46C6', // Blue background (HSL: ~220°, ~88%, ~42%)
        textColor: Colors.white,
      },
      {
        backgroundColor: '#5913C6', // Purple background (HSL: ~260°, ~88%, ~42%)
        textColor: Colors.white,
      },
      {
        backgroundColor: '#B713C6', // Pink background (HSL: ~295°, ~88%, ~42%)
        textColor: Colors.white,
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

  // Mutation
  const profileUpdateMutation = useProfileUpdateMutation();

  // Get colors directly from cached profile data (more efficient than separate hook)
  const defaultColors = useMemo(() => {
    const colors = profileData?.profileColors;
    if (!colors?.backgroundColor || !colors?.foregroundColor) {
      return undefined;
    }
    return {
      backgroundColor: colors.backgroundColor,
      textColor: colors.foregroundColor, // foregroundColor is the text color
    };
  }, [profileData?.profileColors?.backgroundColor, profileData?.profileColors?.foregroundColor]);

  // Initialize form when component mounts and profile data is available
  useEffect(() => {
    if (profileData && !hasInitializedColors.current) {
      setEditDisplayName(profileData.displayName || '');
      setEditDescription(profileData.description || '');
      setEditAvatar(undefined);

      // Check if default colors match a preset
      if (defaultColors) {
        // First check for normal match
        const normalMatch = predefinedColors.find(
          preset =>
            preset.backgroundColor === defaultColors.backgroundColor &&
            preset.textColor === defaultColors.textColor
        );

        // Then check for inverted match
        const invertedMatch = predefinedColors.find(
          preset =>
            preset.backgroundColor === defaultColors.textColor &&
            preset.textColor === defaultColors.backgroundColor
        );

        if (normalMatch) {
          const matchIndex = predefinedColors.indexOf(normalMatch);
          setSelectedColorIndex(matchIndex);
          setInvertedStates({ [matchIndex]: false });
          setCustomColors({
            backgroundColor: normalMatch.backgroundColor,
            textColor: normalMatch.textColor,
          });
          // Set flex values for this specific color
          const flexValues = colorFlexValues[matchIndex];
          if (flexValues) {
            flexValues.background.value = 3;
            flexValues.text.value = 1;
          }
        } else if (invertedMatch) {
          const matchIndex = predefinedColors.indexOf(invertedMatch);
          setSelectedColorIndex(matchIndex);
          setInvertedStates({ [matchIndex]: true });
          // Store the actual reversed colors (from defaultColors) - these are what the user has saved
          setCustomColors({
            backgroundColor: defaultColors.backgroundColor,
            textColor: defaultColors.textColor,
          });
          // Set flex values to inverted state (bottom box is larger)
          const flexValues = colorFlexValues[matchIndex];
          if (flexValues) {
            flexValues.background.value = 1;
            flexValues.text.value = 3;
          }
        } else {
          // Custom colors - no preset match
          setSelectedColorIndex(null);
          setInvertedStates({});
          const originalColors = {
            backgroundColor: defaultColors.backgroundColor,
            textColor: defaultColors.textColor,
          };
          setCustomColors(originalColors);
          setOriginalCustomColors(originalColors); // Store original custom colors
          setHasCustomColors(true);
          customFlexValues.background.value = 3;
          customFlexValues.text.value = 1;
        }
      } else {
        setSelectedColorIndex(0); // First color (black)
        setInvertedStates({});
        setCustomColors(null);
        setHasCustomColors(false);
        const flexValues = colorFlexValues[0];
        if (flexValues) {
          flexValues.background.value = 3;
          flexValues.text.value = 1;
        }
      }

      hasInitializedColors.current = true;
    }
  }, [profileData, defaultColors, colorFlexValues, predefinedColors]);

  // Calculate and set scroll position when color picker is laid out
  const handleColorPickerLayout = useCallback(() => {
    if (
      !colorPickerScrollViewRef.current ||
      !hasInitializedColors.current ||
      (selectedColorIndex === null && !hasCustomColors)
    ) {
      return;
    }

    const colorWidth = 44;
    const gap = 4; // Match the gap in colorPickerContainer style
    const itemWidth = colorWidth + gap;
    const dividerWidth = 2;
    const dividerMargin = 8;
    const dividerTotalWidth = dividerWidth + dividerMargin * 2;
    const padding = 20; // Match paddingHorizontal in colorPickerContainer
    const screenWidth = Dimensions.get('window').width;

    let colorCenterX: number;

    if (selectedColorIndex === null) {
      // Custom color is at the start
      colorCenterX = padding + colorWidth / 2;
    } else {
      // Account for custom color box and divider if shown
      const customColorOffset = hasCustomColors ? itemWidth + dividerTotalWidth : 0;
      colorCenterX = customColorOffset + selectedColorIndex * itemWidth + padding + colorWidth / 2;
    }

    // Center the color box in the visible area
    // Subtract half the screen width to center it
    const scrollPosition = Math.max(0, colorCenterX - screenWidth / 2);

    colorPickerScrollViewRef.current.scrollTo({
      x: scrollPosition,
      animated: false,
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
                setEditAvatar(result.assets[0].uri || undefined);
              }
            } catch (error) {
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
                setEditAvatar(result.assets[0].uri || undefined);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to open photo library. Please try again.');
            }
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to open image picker. Please try again.');
    }
  }, []);

  // Handle color selection - unified for both predefined and custom colors
  const handleColorSelect = useCallback(
    (colorIndex: number | null, colorOption: ProfileColorOption) => {
      const isAlreadySelected = selectedColorIndex === colorIndex;
      const isCustom = colorIndex === null;
      const stateKey = isCustom ? -1 : colorIndex;
      const currentFlexValues = isCustom ? customFlexValues : colorFlexValues[colorIndex];
      const previousFlexValues =
        selectedColorIndex === null
          ? customFlexValues
          : selectedColorIndex !== null
            ? colorFlexValues[selectedColorIndex]
            : null;

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

        if (currentFlexValues) {
          currentFlexValues.background.value = withSpring(newInverted ? 1 : 3);
          currentFlexValues.text.value = withSpring(newInverted ? 3 : 1);
        }
      } else {
        // Animate previous box back to normal if it was inverted
        if (
          previousFlexValues &&
          invertedStates[selectedColorIndex === null ? -1 : selectedColorIndex]
        ) {
          const prevStateKey = selectedColorIndex === null ? -1 : selectedColorIndex;
          setInvertedStates(prev => ({ ...prev, [prevStateKey]: false }));
          previousFlexValues.background.value = withSpring(3);
          previousFlexValues.text.value = withSpring(1);
        }

        // Select new color
        setSelectedColorIndex(colorIndex);
        const wasInverted = invertedStates[stateKey] || false;
        const colorsToUse = isCustom && originalCustomColors ? originalCustomColors : colorOption;

        setCustomColors({
          backgroundColor: wasInverted ? colorsToUse.textColor : colorsToUse.backgroundColor,
          textColor: wasInverted ? colorsToUse.backgroundColor : colorsToUse.textColor,
        });

        if (currentFlexValues) {
          currentFlexValues.background.value = withSpring(wasInverted ? 1 : 3);
          currentFlexValues.text.value = withSpring(wasInverted ? 3 : 1);
        }
      }
    },
    [
      selectedColorIndex,
      invertedStates,
      customColors,
      colorFlexValues,
      customFlexValues,
      originalCustomColors,
    ]
  );

  // Handle save
  const handleSave = useCallback(async () => {
    if (!profileData?.handle) return;

    try {
      // Create updates object
      const updates: any = {};

      if (editDisplayName !== profileData.displayName) {
        updates.displayName = editDisplayName || undefined;
      }

      if (editDescription !== profileData.description) {
        updates.description = editDescription || undefined;
      }

      if (editAvatar) {
        updates.avatar = editAvatar;
      }

      // Only include custom colors if they're different from default
      if (
        customColors &&
        (!defaultColors ||
          customColors.backgroundColor !== defaultColors.backgroundColor ||
          customColors.textColor !== defaultColors.textColor)
      ) {
        updates.customColors = customColors;
      }

      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        await profileUpdateMutation.mutateAsync({
          handle: profileData.handle,
          updates,
        });
      }

      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    }
  }, [
    profileData,
    editDisplayName,
    editDescription,
    editAvatar,
    customColors,
    defaultColors,
    profileUpdateMutation,
    router,
  ]);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    router.back();
  }, [router]);

  // Get current colors for display
  const currentColors = useMemo(() => {
    if (customColors) {
      return customColors;
    }
    return {
      backgroundColor: defaultColors?.backgroundColor || Colors.black,
      textColor: defaultColors?.textColor || Colors.white,
    };
  }, [customColors, defaultColors]);

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
                setIsAboutFocused(false);
                Keyboard.dismiss();
              } else {
                handleDismiss();
              }
            }}
            style={styles.cancelButton}
          >
            <Text style={[styles.cancelButtonText, { color: Colors.white }]}>
              {isAboutFocused ? 'Back' : 'Cancel'}
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
            pointerEvents={
              profileUpdateMutation.isPending || (isAboutFocused && aboutOverBy > 0)
                ? 'none'
                : 'auto'
            }
            onPress={() => {
              if (isAboutFocused) {
                if (aboutOverBy > 0) {
                  return;
                }
                setIsAboutFocused(false);
                Keyboard.dismiss();
              } else {
                handleSave();
              }
            }}
            disabled={profileUpdateMutation.isPending || (isAboutFocused && aboutOverBy > 0)}
          >
            {isLiquidGlassAvailable() && (
              <GlassView
                style={styles.glassBackground}
                glassEffectStyle="clear"
                tintColor={hexToRGBA(Colors.white, isAboutFocused && aboutOverBy > 0 ? 0.35 : 0.9)}
                isInteractive
              />
            )}
            <View pointerEvents="none">
              {profileUpdateMutation.isPending ? (
                <Loading3FillIcon size={24} color={Colors.black} />
              ) : (
                <Text
                  style={[
                    styles.saveButtonText,
                    isLiquidGlassAvailable() && { color: Colors.black },
                    isAboutFocused && aboutOverBy > 0 && { color: hexToRGBA(Colors.black, 0.25) },
                  ]}
                >
                  {isAboutFocused ? 'Done' : 'Save'}
                </Text>
              )}
            </View>
          </Pressable>
        </View>

        {/* Color Picker */}
        <View style={styles.colorPickerSection}>
          <ScrollView
            ref={colorPickerScrollViewRef}
            onLayout={handleColorPickerLayout}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.colorPickerContainer}
            style={styles.colorPickerScrollView}
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
            contentContainerStyle={{ flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Username & Avatar & Display Name Sections */}
            {!isAboutFocused && (
              <Animated.View
                layout={Layout.springify().duration(280)}
                entering={FadeIn.duration(280).easing(Easing.out(Easing.ease))}
                exiting={FadeOut.duration(100).easing(Easing.in(Easing.ease))}
              >
                {/* Username Section */}
                <View style={styles.usernameSection}>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: hexToRGBA(currentColors.textColor, 0.9) },
                    ]}
                  >
                    USERNAME
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    bounces={false}
                    contentContainerStyle={{ flexGrow: 1 }}
                  >
                    <Text style={[styles.largeText, { color: currentColors.textColor }]}>
                      <Text
                        style={[
                          styles.handleAt,
                          { color: hexToRGBA(currentColors.textColor, 0.5) },
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
                              { color: hexToRGBA(currentColors.textColor, 0.7) },
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
                    { backgroundColor: hexToRGBA(currentColors.textColor, 0.2) },
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
                          { color: hexToRGBA(currentColors.textColor, 0.8), marginLeft: 6 },
                        ]}
                      >
                        PROFILE PICTURE
                      </Text>
                      <Pressable
                        style={[
                          styles.uploadButton,
                          {
                            backgroundColor: hexToRGBA(currentColors.textColor, 0.15),
                          },
                        ]}
                        onPress={handleAvatarPress}
                      >
                        <Text style={[styles.uploadButtonText, { color: currentColors.textColor }]}>
                          Upload
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View
                  style={[
                    styles.divider,
                    { backgroundColor: hexToRGBA(currentColors.textColor, 0.12) },
                  ]}
                />

                {/* Display Name Section */}
                <View style={styles.section}>
                  <Text
                    style={[
                      styles.sectionTitle,
                      {
                        color: hexToRGBA(currentColors.textColor, 0.8),
                        // Slightly tighter margin than default to visually
                        // match the username header-to-value spacing.
                        marginBottom: 2,
                      },
                    ]}
                  >
                    DISPLAY NAME
                  </Text>
                  <TextInput
                    nativeID="edit-profile-display-name-input"
                    style={[
                      styles.largeInput,
                      {
                        color: currentColors.textColor,
                        backgroundColor: 'transparent',
                        borderColor: 'transparent',
                      },
                    ]}
                    value={editDisplayName}
                    onChangeText={setEditDisplayName}
                    placeholder="Name"
                    placeholderTextColor={hexToRGBA(currentColors.textColor, 0.3)}
                    scrollEnabled
                    maxLength={65}
                    autoComplete="name"
                    textContentType="name"
                    importantForAutofill="yes"
                    caretHidden={false}
                  />
                </View>
              </Animated.View>
            )}

            {!isAboutFocused && (
              <View
                style={[
                  styles.divider,
                  { backgroundColor: hexToRGBA(currentColors.textColor, 0.12) },
                ]}
              />
            )}

            {/* About Section */}
            <Animated.View
              layout={Layout.springify().duration(280)}
              style={[styles.section, isAboutFocused && styles.aboutExpandedSection]}
            >
              <Animated.View entering={FadeIn.duration(150).easing(Easing.out(Easing.ease))}>
                <Text
                  style={[styles.sectionTitle, { color: hexToRGBA(currentColors.textColor, 0.8) }]}
                >
                  ABOUT
                </Text>
                <TextInput
                  nativeID="edit-profile-about-input"
                  style={[
                    styles.textArea,
                    {
                      color: currentColors.textColor,
                    },
                    isAboutFocused && { flex: 1 },
                  ]}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="Tell us about yourself"
                  placeholderTextColor={hexToRGBA(currentColors.textColor, 0.3)}
                  multiline
                  autoComplete="off"
                  textContentType="none"
                  importantForAutofill="no"
                  caretHidden={false}
                  onFocus={() => {
                    setIsAboutFocused(true);
                  }}
                />
              </Animated.View>
            </Animated.View>
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
    fontFamily: 'Firma-Bold',
    fontSize: 17,
  },
  saveButton: {
    backgroundColor: Colors.white,
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
    fontFamily: 'Firma-Bold',
    fontSize: 17,
    color: Colors.black,
    fontWeight: '600',
  },
  aboutHeaderCounter: {
    marginHorizontal: 8,
    fontFamily: 'Firma-SemiBold',
    fontSize: 14,
    color: Colors.white,
  },
  aboutHeaderCurrent: {
    fontFamily: 'Firma-SemiBold',
    fontSize: 16,
  },
  aboutHeaderCurrentOver: {
    color: Colors.red,
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
  section: {
    marginTop: 0,
  },
  aboutExpandedSection: {
    flex: 1,
  },
  usernameSection: {
    marginTop: 0,
    position: 'relative',
  },
  sectionTitle: {
    fontFamily: 'Firma-SemiBold',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  largeText: {
    fontFamily: 'Firma-Black',
    fontSize: 26,
    lineHeight: 32,
  },
  handleAt: {
    fontFamily: 'Firma-Medium',
    fontWeight: '400',
    fontSize: 30,
    lineHeight: 32,
  },
  handleSuffix: {
    fontFamily: 'Firma-Medium',
    fontSize: 18,
  },
  largeInput: {
    fontFamily: 'Firma-Black',
    fontSize: 32,
    lineHeight: 40,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginTop: 0,
    textAlignVertical: 'center',
    backgroundColor: 'transparent',
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
    fontFamily: 'Firma-Bold',
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 8,
  },
  colorSquare: {
    width: 44,
    height: 44,
    overflow: 'hidden',
    shadowColor: '#000',
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
    fontFamily: 'Firma-Medium',
    fontSize: 16,
    marginTop: 0,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: 'transparent',
  },
});

export default EditProfileScreen;
