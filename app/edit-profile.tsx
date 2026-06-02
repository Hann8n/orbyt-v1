import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  ScrollView,
  Dimensions,
  Keyboard,
  Platform,
} from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { SquircleView, SquircleNativePressable } from '@/components/ui/Squircle';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import Animated, {
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
  FadeOut,
  Easing,
} from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { MenuView } from '@react-native-menu/menu';
import type { MenuAction } from '@react-native-menu/menu';
import { Colors } from '@/theme';
import { Avatar } from '@/components/ui/UI';
import { CheckIcon, STROKE_WIDTH_THICK } from '@/components/ui/Icon';
import { useProfileUpdateMutation, useProfileByDid } from '@/services/data/ProfileService';
import { hexToRGBA, blendColors } from '@/utils/formatting/colors';
import { BORDER_RADIUS } from '@/utils/constants';
import {
  editProfileUploadButtonContainer,
  editProfileUploadButtonLabel,
  headerCancelContainer,
  headerCancelLabel,
  headerChromePillInnerSlot,
  headerSaveContainer,
  headerSaveLabel,
  headerSaveLabelMuted,
} from '@/components/ui/buttonPresets';
import { useCurrentUser } from '@/stores/userStore';
import { posthog } from '@/config/posthog';
import { splitHandleSuffix } from '@/utils/formatting/handles';
import { useOrbytColors } from '@/services/colors';
import type { ProfileViewWithOrbyt } from '@/services/api/types';
import { FontFamily, Typography, TextStyles } from '@/utils/components/typography';

export interface ProfileColorOption {
  backgroundColor: string;
  textColor: string;
}

const ABOUT_MAX_LENGTH = 256;
const COLOR_SQUARE_HIT_SLOP = { top: 8, bottom: 8, left: 2, right: 2 };

// Color picker layout constants (must match styles)
const COLOR_SQUARE_WIDTH = 42;
const COLOR_PICKER_GAP = 4;
const COLOR_RING_WIDTH = 4;
const COLOR_RING_OFFSET = COLOR_PICKER_GAP + COLOR_RING_WIDTH;
const COLOR_PICKER_PADDING = 15;
const COLOR_DIVIDER_WIDTH = 2;
const COLOR_DIVIDER_MARGIN = 8;
const COLOR_DIVIDER_TOTAL_WIDTH = COLOR_DIVIDER_WIDTH + COLOR_DIVIDER_MARGIN * 2;
const COLOR_ITEM_WIDTH = COLOR_SQUARE_WIDTH + COLOR_PICKER_GAP;

// Predefined color options — module-level constant (no deps, never changes)
const PREDEFINED_COLORS: ProfileColorOption[] = [
  // Neutral/Universal (orbyt grey - matches DEFAULT_PROFILE_COLORS / palette)
  { backgroundColor: Colors.neutral[900], textColor: Colors.neutral[200] },
  // Primary - colored backgrounds with white text
  { backgroundColor: '#C6142E', textColor: Colors.neutral[50] },
  { backgroundColor: '#CC9900', textColor: Colors.neutral[50] },
  { backgroundColor: '#3D9812', textColor: Colors.neutral[50] },
  { backgroundColor: '#0B9997', textColor: Colors.neutral[50] },
  { backgroundColor: '#0E94C6', textColor: Colors.neutral[50] },
  { backgroundColor: '#0E46C6', textColor: Colors.neutral[50] },
  { backgroundColor: '#5913C6', textColor: Colors.neutral[50] },
  { backgroundColor: '#B713C6', textColor: Colors.neutral[50] },
  { backgroundColor: '#f34965', textColor: Colors.neutral[900] },
  { backgroundColor: '#f3c949', textColor: Colors.neutral[900] },
  { backgroundColor: '#73f349', textColor: Colors.neutral[900] },
  { backgroundColor: '#49f3f1', textColor: Colors.neutral[900] },
  { backgroundColor: '#49c9f3', textColor: Colors.neutral[900] },
  { backgroundColor: '#5c8ff5', textColor: Colors.neutral[900] },
  { backgroundColor: '#8c57f4', textColor: Colors.neutral[900] },
  { backgroundColor: '#e549f3', textColor: Colors.neutral[900] },
  // Complementary
  { backgroundColor: '#fba9d5', textColor: '#45498f' },
  { backgroundColor: '#02e4bf', textColor: '#414a76' },
  { backgroundColor: '#c9d3fe', textColor: '#b71431' },
  { backgroundColor: '#fbb300', textColor: '#2b212a' },
  { backgroundColor: '#1f1d46', textColor: '#f85d4a' },
  { backgroundColor: '#2d615e', textColor: '#fdc1b8' },
  { backgroundColor: '#03df6e', textColor: '#19304d' },
  { backgroundColor: '#ddf59c', textColor: '#367746' },
  { backgroundColor: '#523b99', textColor: '#fba2c3' },
  { backgroundColor: '#ecf9fb', textColor: '#66737e' },
  { backgroundColor: '#34333f', textColor: '#f88667' },
  { backgroundColor: '#524864', textColor: '#91f7f8' },
  { backgroundColor: '#fbc36e', textColor: '#575567' },
  { backgroundColor: '#cfdae7', textColor: '#b61a59' },
  { backgroundColor: '#0e1420', textColor: '#ff2c6f' },
  { backgroundColor: '#61678a', textColor: '#c6f6ad' },
  { backgroundColor: '#297873', textColor: '#f4fcc3' },
  { backgroundColor: '#71acab', textColor: '#3a383f' },
  { backgroundColor: '#84366e', textColor: '#fcb1d4' },
  { backgroundColor: '#926879', textColor: '#fef9fb' },
  { backgroundColor: '#4f4085', textColor: '#fda29f' },
  { backgroundColor: '#464b61', textColor: '#caf7fb' },
  { backgroundColor: '#9584da', textColor: '#2d234b' },
  { backgroundColor: '#581b34', textColor: '#ff6340' },
  // Neon
  { backgroundColor: '#00132e', textColor: '#42aefa' },
  { backgroundColor: '#2e0005', textColor: '#fa4254' },
  { backgroundColor: '#11002e', textColor: '#ce42fa' },
  { backgroundColor: '#002e2e', textColor: '#42fadb' },
  { backgroundColor: '#002e13', textColor: '#42fa8f' },
  { backgroundColor: '#092e00', textColor: '#83fa42' },
  { backgroundColor: '#2e1b00', textColor: '#faad42' },
];

// Color swatch flex split: background ~80%, text accent ~20% (3 / (3 + 0.75))
const FLEX_BG = 3;
const FLEX_TEXT = 0.75;

// Module-level animation descriptors — created once, never recreated per render
const SPRING_LAYOUT = Layout.springify().duration(280);
const FADE_IN_SLOW = FadeIn.duration(280).easing(Easing.out(Easing.ease));
const FADE_OUT_FAST = FadeOut.duration(100).easing(Easing.in(Easing.ease));

// Find a color match in PREDEFINED_COLORS — normal or inverted
function findColorMatch(colors: { backgroundColor: string; textColor: string }) {
  for (let i = 0; i < PREDEFINED_COLORS.length; i++) {
    const p = PREDEFINED_COLORS[i]!;
    if (p.backgroundColor === colors.backgroundColor && p.textColor === colors.textColor)
      return { index: i, inverted: false };
  }
  for (let i = 0; i < PREDEFINED_COLORS.length; i++) {
    const p = PREDEFINED_COLORS[i]!;
    if (p.backgroundColor === colors.textColor && p.textColor === colors.backgroundColor)
      return { index: i, inverted: true };
  }
  return null;
}

// Animated Color Square Component
interface AnimatedColorSquareProps {
  colorOption: ProfileColorOption;
  isSelected: boolean;
  isInverted: boolean;
  onPress: () => void;
}

const AnimatedColorSquare: React.FC<AnimatedColorSquareProps> = React.memo(
  function AnimatedColorSquare({ colorOption, isSelected, isInverted, onPress }) {
    const backgroundFlex = useSharedValue(isInverted ? FLEX_TEXT : FLEX_BG);
    const textFlex = useSharedValue(isInverted ? FLEX_BG : FLEX_TEXT);

    useEffect(() => {
      backgroundFlex.value = withTiming(isInverted ? FLEX_TEXT : FLEX_BG, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      textFlex.value = withTiming(isInverted ? FLEX_BG : FLEX_TEXT, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
    }, [isInverted, backgroundFlex, textFlex]);

    const backgroundAnimatedStyle = useAnimatedStyle(() => ({
      flex: backgroundFlex.value,
    }));

    const textAnimatedStyle = useAnimatedStyle(() => ({
      flex: textFlex.value,
    }));

    const displayBackgroundColor = colorOption.backgroundColor;
    const displayTextColor = colorOption.textColor;
    return (
      <View
        style={[styles.colorSquareContainer, isSelected && styles.colorSquareContainerSelected]}
      >
        {isSelected && (
          <View
            pointerEvents="none"
            style={[styles.colorSquareRing, { borderColor: Colors.neutral[50] }]}
          />
        )}
        <NativePressable
          style={styles.colorSquare}
          onPress={onPress}
          hitSlop={COLOR_SQUARE_HIT_SLOP}
        >
          <Animated.View
            style={[
              styles.colorSection,
              backgroundAnimatedStyle,
              { backgroundColor: displayBackgroundColor },
            ]}
          />
          <Animated.View
            style={[styles.colorSection, textAnimatedStyle, { backgroundColor: displayTextColor }]}
          />
        </NativePressable>
      </View>
    );
  }
);

const EditProfileScreen: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentUser } = useCurrentUser();
  const userDid = currentUser?.did || null;
  const userHandle = currentUser?.handle || null;

  // Fetch profile data from the same DID detail query used by the profile screen.
  const { data: profileData } = useProfileByDid(userDid, {
    placeholderData:
      userDid && userHandle
        ? ({
            did: userDid,
            handle: userHandle,
            displayName: currentUser?.displayName ?? undefined,
            avatar: currentUser?.avatar ?? undefined,
            description: '',
            viewer: {},
          } as ProfileViewWithOrbyt)
        : undefined,
  });
  const { data: orbytColors } = useOrbytColors(currentUser?.did);

  // Compute initial color picker state once, synchronously.
  // useOrbytColors returns initialData from getPersistedColorsSync so orbytColors
  // is already populated on the first render — no effect or timing dance needed.
  const [colorPickerInit] = useState(() => {
    const colors =
      orbytColors?.backgroundColor && orbytColors?.textColor
        ? { backgroundColor: orbytColors.backgroundColor, textColor: orbytColors.textColor }
        : null;
    const match = colors ? findColorMatch(colors) : null;
    const index: number | null = !colors ? 0 : match ? match.index : null;
    const inverted = match?.inverted ?? false;
    const hasCustom = !!colors && !match;

    // Compute initial contentOffset so the selected swatch is centered on first render
    // (synchronous — no flash). Clamp both edges using known content width.
    const customOffset = hasCustom ? COLOR_ITEM_WIDTH + COLOR_DIVIDER_TOTAL_WIDTH : 0;
    const colorCenterX =
      index === null
        ? COLOR_PICKER_PADDING + COLOR_SQUARE_WIDTH / 2
        : customOffset + index * COLOR_ITEM_WIDTH + COLOR_PICKER_PADDING + COLOR_SQUARE_WIDTH / 2;
    const screenWidth = Dimensions.get('window').width;
    const contentWidth =
      2 * COLOR_PICKER_PADDING +
      customOffset +
      (PREDEFINED_COLORS.length - 1) * COLOR_ITEM_WIDTH +
      COLOR_SQUARE_WIDTH;
    const maxScroll = Math.max(0, contentWidth - screenWidth);
    const offsetX = Math.min(Math.max(0, colorCenterX - screenWidth / 2), maxScroll);

    return {
      index,
      inverted,
      hasCustom,
      colors,
      contentOffset: { x: offsetX, y: 0 },
    };
  });

  const [isAboutFocused, setIsAboutFocused] = useState(false);
  const [isDisplayNameFocused, setIsDisplayNameFocused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Handle formatting: detach ".bsky.social" or ".orbyt.video" suffix if present so we can
  // render the suffix separately in the UI (bottom-right of the section).
  const { handleBase, handleSuffix } = useMemo(() => {
    const rawHandle = profileData?.handle ?? userHandle ?? 'handle';
    return splitHandleSuffix(rawHandle);
  }, [profileData?.handle, userHandle]);

  // Form state — both seeded synchronously from cached profile data on first render
  const [editDisplayName, setEditDisplayName] = useState(() => profileData?.displayName || '');
  const [editDescription, setEditDescription] = useState(() => profileData?.description || '');
  // Track the last seen server description to seed the edit field once when real data arrives
  // (placeholder has description: ''). Calling setState during render is React's documented
  // pattern for derived-state-from-props; it triggers an immediate re-render, not a cascading one.
  const [lastProfileDescription, setLastProfileDescription] = useState(profileData?.description);
  if (profileData?.description && !lastProfileDescription) {
    setLastProfileDescription(profileData.description);
    setEditDescription(profileData.description);
  }
  const [editAvatar, setEditAvatar] = useState<string | undefined>(undefined);

  // About length tracking
  const aboutCount = editDescription.length;
  const aboutOverBy = Math.max(0, aboutCount - ABOUT_MAX_LENGTH);
  const aboutRemaining = Math.max(0, ABOUT_MAX_LENGTH - aboutCount);

  // Color state — all seeded from colorPickerInit (sync, first render correct)
  const [selectedColorIndex, setSelectedColorIndex] = useState<number | null>(
    colorPickerInit.index
  );
  const selectedColorIndexRef = useRef<number | null>(colorPickerInit.index);
  const [customColors, setCustomColors] = useState<{
    backgroundColor: string;
    textColor: string;
  } | null>(colorPickerInit.colors);
  // Inversion state: ref for synchronous reads inside the handler; state for rendering children.
  const initialInvertedStates: Partial<Record<number | 'custom', boolean>> =
    colorPickerInit.inverted && colorPickerInit.index !== null
      ? { [colorPickerInit.index]: true }
      : {};
  const invertedStatesRef =
    useRef<Partial<Record<number | 'custom', boolean>>>(initialInvertedStates);
  const [invertedStates, setInvertedStates] =
    useState<Partial<Record<number | 'custom', boolean>>>(initialInvertedStates);
  const hasCustomColors = colorPickerInit.hasCustom;
  const originalCustomColors = colorPickerInit.hasCustom ? colorPickerInit.colors : null;

  // Mutation
  const profileUpdateMutation = useProfileUpdateMutation();

  // Get colors from orbyt API (used by handleSave to detect changes)
  const defaultColors = useMemo(() => {
    if (!orbytColors?.backgroundColor || !orbytColors?.textColor) {
      return undefined;
    }
    return {
      backgroundColor: orbytColors.backgroundColor,
      textColor: orbytColors.textColor,
    };
  }, [orbytColors]);

  const colorPickerScrollRef = useRef<ScrollView>(null);
  const isMountedColorScroll = useRef(false);

  // Animate to center the newly selected swatch on user selection.
  // Initial position is handled synchronously via contentOffset (no flash).
  useEffect(() => {
    if (!isMountedColorScroll.current) {
      isMountedColorScroll.current = true;
      return;
    }
    const screenWidth = Dimensions.get('window').width;
    const customOffset = hasCustomColors ? COLOR_ITEM_WIDTH + COLOR_DIVIDER_TOTAL_WIDTH : 0;
    const colorCenterX =
      selectedColorIndex === null
        ? COLOR_PICKER_PADDING + COLOR_SQUARE_WIDTH / 2
        : customOffset +
          selectedColorIndex * COLOR_ITEM_WIDTH +
          COLOR_PICKER_PADDING +
          COLOR_SQUARE_WIDTH / 2;
    const contentWidth =
      2 * COLOR_PICKER_PADDING +
      customOffset +
      (PREDEFINED_COLORS.length - 1) * COLOR_ITEM_WIDTH +
      COLOR_SQUARE_WIDTH;
    const maxScroll = Math.max(0, contentWidth - screenWidth);
    const scrollX = Math.min(Math.max(0, colorCenterX - screenWidth / 2), maxScroll);
    colorPickerScrollRef.current?.scrollTo({ x: scrollX, animated: true });
  }, [selectedColorIndex, hasCustomColors]);

  const handleOpenCamera = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.permissionRequired'), t('profile.avatarPermissionRequired'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0] && result.assets[0].uri) {
        setEditAvatar(result.assets[0].uri || undefined);
      }
    } catch (_error) {
      Alert.alert(t('common.error'), t('profile.failedToOpenCamera'));
    }
  }, [t]);

  const handleOpenPhotoLibrary = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.permissionRequired'), t('profile.avatarPermissionRequired'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0] && result.assets[0].uri) {
        setEditAvatar(result.assets[0].uri || undefined);
      }
    } catch (_error) {
      Alert.alert(t('common.error'), t('profile.failedToOpenPhotoLibrary'));
    }
  }, [t]);

  const avatarMenuActions = useMemo<MenuAction[]>(
    () => [
      { id: 'camera', title: t('profile.camera') },
      { id: 'library', title: t('profile.photoLibrary') },
    ],
    [t]
  );

  const handleAvatarMenuPressAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      if (nativeEvent.event === 'camera') {
        void handleOpenCamera();
        return;
      }

      if (nativeEvent.event === 'library') {
        void handleOpenPhotoLibrary();
      }
    },
    [handleOpenCamera, handleOpenPhotoLibrary]
  );

  // Handle color selection - unified for both predefined and custom colors.
  // Reads selectedColorIndex and invertedStates via refs so this callback is stable.
  const handleColorSelect = useCallback(
    (colorIndex: number | null, colorOption: ProfileColorOption) => {
      const currentSelectedIndex = selectedColorIndexRef.current;
      const isAlreadySelected = currentSelectedIndex === colorIndex;
      const isCustom = colorIndex === null;
      const stateKey = isCustom ? 'custom' : colorIndex!;

      if (isAlreadySelected) {
        const currentInverted = invertedStatesRef.current[stateKey] || false;
        const newInverted = !currentInverted;
        invertedStatesRef.current[stateKey] = newInverted;
        setInvertedStates(prev => ({ ...prev, [stateKey]: newInverted }));

        const baseColors = isCustom && originalCustomColors ? originalCustomColors : colorOption;
        setCustomColors({
          backgroundColor: newInverted ? baseColors.textColor : baseColors.backgroundColor,
          textColor: newInverted ? baseColors.backgroundColor : baseColors.textColor,
        });
      } else {
        // Reset previous swatch inversion if needed
        const prevStateKey = currentSelectedIndex === null ? 'custom' : currentSelectedIndex;
        if (invertedStatesRef.current[prevStateKey]) {
          invertedStatesRef.current[prevStateKey] = false;
          setInvertedStates(prev => ({ ...prev, [prevStateKey]: false }));
        }

        // Select new color
        selectedColorIndexRef.current = colorIndex;
        setSelectedColorIndex(colorIndex);
        const wasInverted = invertedStatesRef.current[stateKey] || false;
        const colorsToUse = isCustom && originalCustomColors ? originalCustomColors : colorOption;

        setCustomColors({
          backgroundColor: wasInverted ? colorsToUse.textColor : colorsToUse.backgroundColor,
          textColor: wasInverted ? colorsToUse.backgroundColor : colorsToUse.textColor,
        });
      }
    },
    [originalCustomColors]
  );

  // Stable per-index press handlers — recreated only if handleColorSelect changes (which is now rare)
  const colorPressHandlers = useMemo(
    () =>
      PREDEFINED_COLORS.map((colorOption, index) => () => handleColorSelect(index, colorOption)),
    [handleColorSelect]
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

      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        await profileUpdateMutation.mutateAsync({
          handle: profileData.handle,
          updates,
        });

        posthog.capture('profile_edited', {
          updated_display_name: !!updates.displayName,
          updated_description: !!updates.description,
          updated_avatar: !!updates.avatar,
          updated_colors: !!updates.customColors,
        });
      }

      router.dismiss();
    } catch (_error) {
      setIsSaving(false);
      Alert.alert(t('common.error'), t('profile.failedToUpdateProfile'));
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
    t,
  ]);

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

  // Memoize derived colors so inline style objects don't recompute on every keystroke
  const derivedColors = useMemo(
    () => ({
      sectionTitle: hexToRGBA(currentColors.textColor, 0.9),
      avatarTitle: hexToRGBA(currentColors.textColor, 0.8),
      handleAt: hexToRGBA(currentColors.textColor, 0.5),
      handleSuffix: hexToRGBA(currentColors.textColor, 0.7),
      placeholder: hexToRGBA(currentColors.textColor, 0.3),
      dividerStrong: blendColors(currentColors.backgroundColor, currentColors.textColor, 0.2),
      dividerFaint: blendColors(currentColors.backgroundColor, currentColors.textColor, 0.12),
      uploadButton: blendColors(currentColors.backgroundColor, currentColors.textColor, 0.15),
    }),
    [currentColors.backgroundColor, currentColors.textColor]
  );

  const isSaveDisabled = isSaving || (isAboutFocused && aboutOverBy > 0);

  const handleCancelPress = useCallback(() => {
    if (isAboutFocused) {
      setEditDescription(profileData?.description || '');
      dismissKeyboardAndFocus();
    } else if (isDisplayNameFocused) {
      setEditDisplayName(profileData?.displayName || '');
      dismissKeyboardAndFocus();
    } else {
      router.dismiss();
    }
  }, [isAboutFocused, isDisplayNameFocused, profileData, dismissKeyboardAndFocus, router]);

  const handleSavePress = useCallback(() => {
    if (isAboutFocused) {
      if (aboutOverBy > 0) return;
      dismissKeyboardAndFocus();
    } else if (isDisplayNameFocused) {
      dismissKeyboardAndFocus();
    } else {
      handleSave();
    }
  }, [isAboutFocused, isDisplayNameFocused, aboutOverBy, dismissKeyboardAndFocus, handleSave]);

  return (
    <View style={styles.container}>
      {/* Header and Color Picker - Black Background Section */}
      <View style={[styles.topSafeArea, Platform.OS === 'android' && { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <SquircleNativePressable
            onPress={handleCancelPress}
            style={headerCancelContainer}
            accessibilityRole="button"
            accessibilityLabel={
              isAboutFocused || isDisplayNameFocused ? t('common.back') : t('common.cancel')
            }
          >
            <View style={headerChromePillInnerSlot}>
              <Text style={headerCancelLabel}>
                {isAboutFocused || isDisplayNameFocused ? t('common.back') : t('common.cancel')}
              </Text>
            </View>
          </SquircleNativePressable>

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

          <SquircleNativePressable
            style={[headerSaveContainer, isSaveDisabled && styles.saveButtonDisabled]}
            onPress={handleSavePress}
            disabled={isSaveDisabled}
            accessibilityRole="button"
            accessibilityLabel={
              isAboutFocused || isDisplayNameFocused ? t('common.done') : t('common.save')
            }
            accessibilityState={{ disabled: isSaveDisabled }}
          >
            <View style={headerChromePillInnerSlot}>
              {isSaving ? (
                <CheckIcon size={17} color={Colors.black} strokeWidth={STROKE_WIDTH_THICK} />
              ) : (
                <Text
                  style={[
                    headerSaveLabel,
                    isAboutFocused && aboutOverBy > 0 && headerSaveLabelMuted,
                  ]}
                >
                  {isAboutFocused || isDisplayNameFocused ? t('common.done') : t('common.save')}
                </Text>
              )}
            </View>
          </SquircleNativePressable>
        </View>

        {/* Color Picker */}
        <View style={styles.colorPickerSection}>
          <ScrollView
            ref={colorPickerScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentOffset={colorPickerInit.contentOffset}
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
                  isInverted={invertedStates['custom'] ?? false}
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

            {PREDEFINED_COLORS.map((colorOption, index) => (
              <AnimatedColorSquare
                key={`${colorOption.backgroundColor}-${colorOption.textColor}`}
                colorOption={colorOption}
                isSelected={selectedColorIndex === index}
                isInverted={invertedStates[index] ?? false}
                onPress={colorPressHandlers[index]!}
              />
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Profile Editing Fields - Sheet Content */}
      <SquircleView
        style={[styles.bottomSectionContainer, { backgroundColor: currentColors.backgroundColor }]}
      >
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: currentColors.backgroundColor }]}
          edges={['bottom']}
        >
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainerFlexGrow}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="always"
          >
            {/* Handle & Avatar Sections */}
            {!isAboutFocused && !isDisplayNameFocused && (
              <Animated.View layout={SPRING_LAYOUT} entering={FADE_IN_SLOW} exiting={FADE_OUT_FAST}>
                {/* Handle Section */}
                <View style={styles.handleSection}>
                  <Text style={[styles.sectionTitle, { color: derivedColors.sectionTitle }]}>
                    {t('editProfile.handle')}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={true}
                    bounces={false}
                    contentContainerStyle={styles.contentContainerFlexGrow}
                  >
                    <Text style={[styles.largeText, { color: currentColors.textColor }]}>
                      <Text style={[styles.handleAt, { color: derivedColors.handleAt }]}>@</Text>
                      <Text>
                        {' '}
                        {handleBase}
                        {handleSuffix && (
                          <Text
                            style={[styles.handleSuffix, { color: derivedColors.handleSuffix }]}
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
                      backgroundColor: derivedColors.dividerStrong,
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
                      showRing
                      ringColor={currentColors.textColor}
                      profileColors={{
                        backgroundColor: currentColors.backgroundColor,
                        textColor: currentColors.textColor,
                        foregroundColor: currentColors.textColor,
                      }}
                    />
                    <View style={styles.avatarButtonColumn}>
                      <Text
                        style={[
                          styles.sectionTitle,
                          styles.sectionTitleAvatar,
                          { color: derivedColors.avatarTitle },
                        ]}
                      >
                        {t('editProfile.profilePicture')}
                      </Text>
                      <MenuView
                        title=""
                        actions={avatarMenuActions}
                        onPressAction={handleAvatarMenuPressAction}
                        shouldOpenOnLongPress={false}
                        themeVariant="dark"
                        isAnchoredToRight={true}
                      >
                        <SquircleNativePressable
                          style={[
                            editProfileUploadButtonContainer,
                            {
                              backgroundColor: derivedColors.uploadButton,
                            },
                          ]}
                          onPress={handleOpenPhotoLibrary}
                        >
                          <Text
                            style={[
                              editProfileUploadButtonLabel,
                              { color: currentColors.textColor },
                            ]}
                          >
                            {t('editProfile.upload')}
                          </Text>
                        </SquircleNativePressable>
                      </MenuView>
                    </View>
                  </View>
                </View>

                <View
                  style={[
                    styles.divider,
                    {
                      backgroundColor: derivedColors.dividerFaint,
                    },
                  ]}
                />
              </Animated.View>
            )}

            {/* Display Name Section */}
            {!isAboutFocused && (
              <Animated.View
                layout={SPRING_LAYOUT}
                style={[styles.section, isDisplayNameFocused && styles.expandedSection]}
              >
                <NativePressable
                  onPress={() => {
                    if (!isDisplayNameFocused) {
                      setIsDisplayNameFocused(true);
                      setIsAboutFocused(false);
                    }
                  }}
                >
                  <View>
                    <Text
                      style={[
                        styles.sectionTitle,
                        styles.sectionTitleDisplayName,
                        { color: derivedColors.avatarTitle },
                      ]}
                    >
                      {t('editProfile.displayName')}
                    </Text>
                    <TextInput
                      nativeID="edit-profile-display-name-input"
                      style={[
                        styles.largeInput,
                        styles.largeInputTransparent,
                        { color: currentColors.textColor },
                        isDisplayNameFocused && styles.flex1,
                      ]}
                      value={editDisplayName}
                      onChangeText={setEditDisplayName}
                      placeholder={t('profile.namePlaceholder')}
                      placeholderTextColor={derivedColors.placeholder}
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
                  </View>
                </NativePressable>
              </Animated.View>
            )}

            {!isAboutFocused && !isDisplayNameFocused && (
              <View
                style={[
                  styles.divider,
                  {
                    backgroundColor: derivedColors.dividerFaint,
                  },
                ]}
              />
            )}

            {/* About Section */}
            {!isDisplayNameFocused && (
              <Animated.View
                layout={SPRING_LAYOUT}
                style={[
                  styles.section,
                  styles.aboutSectionContainer,
                  isAboutFocused && styles.expandedSection,
                ]}
              >
                <NativePressable
                  onPress={() => {
                    if (!isAboutFocused) {
                      setIsAboutFocused(true);
                      setIsDisplayNameFocused(false);
                    }
                  }}
                  style={styles.aboutContentWrapper}
                >
                  <View style={styles.flex1}>
                    <Text style={[styles.sectionTitle, { color: derivedColors.avatarTitle }]}>
                      {t('editProfile.about')}
                    </Text>
                    <TextInput
                      nativeID="edit-profile-about-input"
                      style={[
                        styles.textArea,
                        {
                          color: currentColors.textColor,
                        },
                      ]}
                      value={editDescription}
                      onChangeText={setEditDescription}
                      placeholder={t('profile.aboutPlaceholder')}
                      placeholderTextColor={derivedColors.placeholder}
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
                  </View>
                </NativePressable>
              </Animated.View>
            )}
          </ScrollView>
        </SafeAreaView>
      </SquircleView>
    </View>
  );
};

const styles = StyleSheet.create({
  topSafeArea: {
    backgroundColor: Colors.black,
  },
  colorPickerSection: {
    paddingBottom: 8,
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
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 12,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  aboutHeaderCounter: {
    marginHorizontal: 8,
    fontFamily: FontFamily.semibold,
    fontSize: Typography.sizes.bodySmall,
    color: Colors.neutral[50],
  },
  aboutHeaderCurrent: {
    fontFamily: FontFamily.semibold,
    fontSize: Typography.sizes.subtitle,
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
    fontFamily: FontFamily.semibold,
    fontSize: Typography.sizes.caption,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  largeText: {
    ...TextStyles.editLabelLarge,
    fontFamily: FontFamily.black,
    lineHeight: Typography.lineHeights.h1,
    textTransform: 'lowercase',
  },
  handleAt: {
    ...TextStyles.heroTitle,
    fontFamily: FontFamily.medium,
    fontWeight: '400',
    lineHeight: Typography.lineHeights.h1,
  },
  handleSuffix: {
    fontFamily: FontFamily.medium,
    fontSize: Typography.sizes.title,
    textTransform: 'lowercase',
  },
  largeInput: {
    ...TextStyles.displayLarge,
    fontFamily: FontFamily.black,
    lineHeight: Typography.lineHeights.display,
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
  colorPickerScrollView: {
    marginHorizontal: 0,
  },
  colorPickerContainer: {
    paddingHorizontal: 20,
    paddingVertical: COLOR_RING_OFFSET,
    gap: 4,
  },
  colorSquareContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSquareContainerSelected: {
    zIndex: 1,
  },
  colorSquareRing: {
    position: 'absolute',
    top: -COLOR_RING_OFFSET,
    left: -COLOR_RING_OFFSET,
    right: -COLOR_RING_OFFSET,
    bottom: -COLOR_RING_OFFSET,
    borderWidth: COLOR_RING_WIDTH,
  },
  colorDivider: {
    width: 2,
    height: COLOR_SQUARE_WIDTH,
    backgroundColor: Colors.overlay.white30,
    marginHorizontal: 8,
  },
  colorSquare: {
    width: COLOR_SQUARE_WIDTH,
    height: COLOR_SQUARE_WIDTH,
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
    fontFamily: FontFamily.medium,
    fontSize: Typography.sizes.subtitle,
    marginTop: 0,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: Colors.transparent,
    flex: 1,
  },
});

export default EditProfileScreen;
