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
import Animated, { Layout, useSharedValue, useAnimatedStyle, withSpring, SharedValue } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Colors, Avatar } from '../src/components/ui/UI';
import { Loading3FillIcon } from '../src/components/ui/Icon';
import { useProfileUpdateMutation, useProfile } from '../src/services/cache/ProfileCache';
import { hexToRGBA } from '../src/utils/formatting/colorUtils';
import { BORDER_RADIUS } from '../src/utils/constants';
import { useCurrentUser } from '../src/stores/userStore';
import { splitHandleSuffix } from '../src/utils/helpers';

export interface ProfileColorOption {
  id: string;
  backgroundColor: string;
  textColor: string;
}

const ABOUT_MAX_LENGTH = 256;

// Animated Color Square Component
interface AnimatedColorSquareProps {
  colorOption: ProfileColorOption;
  isSelected: boolean;
  isInverted: boolean;
  customColors: { backgroundColor: string; textColor: string } | null;
  currentColors: { backgroundColor: string; textColor: string };
  backgroundFlex: SharedValue<number>;
  textFlex: SharedValue<number>;
  onPress: () => void;
}

const AnimatedColorSquare: React.FC<AnimatedColorSquareProps> = ({
  colorOption,
  isSelected,
  isInverted: _isInverted,
  customColors: _customColors,
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
            { backgroundColor: displayBackgroundColor }
          ]}
        />
        
        {/* Text color section */}
        <Animated.View
          style={[
            styles.colorSection,
            textAnimatedStyle,
            { backgroundColor: displayTextColor }
          ]}
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
  
  // Color selection state
  const [selectedColorId, setSelectedColorId] = useState<string>('black');
  const [customColors, setCustomColors] = useState<{
    backgroundColor: string;
    textColor: string;
  } | null>(null);

  // Track inverted state per color ID
  const [invertedStates, setInvertedStates] = useState<Record<string, boolean>>({});
  
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
  
  // Predefined color options
  const predefinedColors: ProfileColorOption[] = useMemo(() => [
    // Neutral/Universal
    {
      id: 'black',
      backgroundColor: Colors.black,
      textColor: Colors.lightGray,
    },
    // Primary - colored backgrounds with white text (organized by background hue in rainbow order)
    {
      id: 'primaryRed',
      backgroundColor: '#A60C26', // Red background
      textColor: Colors.white,
    },
    {
      id: 'primaryGreen',
      backgroundColor: '#2D800A', // Green background
      textColor: Colors.white,
    },
    {
      id: 'primaryTeal',
      backgroundColor: '#097B79', // Teal background
      textColor: Colors.white,
    },
    {
      id: 'primaryLightBlue',
      backgroundColor: '#0C78A6', // Light blue background
      textColor: Colors.white,
    },
    {
      id: 'primaryBlue',
      backgroundColor: '#0C38A6', // Blue background
      textColor: Colors.white,
    },
    {
      id: 'primaryPurple',
      backgroundColor: '#470CA6', // Purple background
      textColor: Colors.white,
    },
    {
      id: 'primaryPink',
      backgroundColor: '#990CA6', // Pink background
      textColor: Colors.white,
    },
    // Bright - bright backgrounds with dark text (cohesive palette at 75% lightness)
    {
      id: 'brightRed',
      backgroundColor: '#F98686', // Bright red background
      textColor: '#1a1a2e', // Dark text for WCAG compliance
    },
    {
      id: 'brightOrange',
      backgroundColor: '#F9BD86', // Bright orange background
      textColor: '#1a1a2e', // Dark text for WCAG compliance
    },
    {
      id: 'brightYellow',
      backgroundColor: '#F9DA86', // Bright yellow background
      textColor: '#1a1a2e', // Dark text
    },
    {
      id: 'brightGreen',
      backgroundColor: '#86F9BF', // Bright green background
      textColor: '#1a1a2e', // Dark text
    },
    {
      id: 'brightCyan',
      backgroundColor: '#86EDF9', // Bright cyan background
      textColor: '#1a1a2e', // Dark text for WCAG compliance
    },
    {
      id: 'brightPink',
      backgroundColor: '#F986C3', // Bright pink background
      textColor: '#1a1a2e', // Dark text
    },
    {
      id: 'brightPurple',
      backgroundColor: '#B0A2E7', // Bright purple background
      textColor: '#1a1a2e', // Dark text for WCAG compliance
    },
    // Pastel - dark backgrounds with pastel text colors (one per primary color)
    {
      id: 'pastelPink',
      backgroundColor: '#4A1A3D', // Deep mauve background
      textColor: '#FFD6E8', // Pastel pink text
    },
    {
      id: 'pastelPeach',
      backgroundColor: '#5C2A1A', // Deep rust background
      textColor: '#FFE5D4', // Pastel peach text
    },
    {
      id: 'pastelLemon',
      backgroundColor: '#4A3D1A', // Deep olive background
      textColor: '#FFF9D4', // Pastel lemon text
    },
    {
      id: 'pastelMint',
      backgroundColor: '#1A4A3A', // Deep teal background
      textColor: '#D4F4E5', // Pastel mint text
    },
    {
      id: 'pastelSky',
      backgroundColor: '#1A3A4A', // Deep blue-gray background
      textColor: '#D4E8F4', // Pastel sky text
    },
    {
      id: 'pastelLavender',
      backgroundColor: '#3D2A5C', // Deep purple background
      textColor: '#E6D9F2', // Pastel lavender text
    },
    // Complementary - colored backgrounds with complementary text colors (AAA compliant)
    {
      id: 'complementaryBlue',
      backgroundColor: '#1A3A52', // Deep blue background
      textColor: '#FF6B35', // Coral text (complementary)
    },
    {
      id: 'complementaryTeal',
      backgroundColor: '#0F4C3A', // Teal background
      textColor: '#FF8FA8', // Light rose text (complementary, lighter for better readability)
    },
    {
      id: 'complementaryPurple',
      backgroundColor: '#3D1F52', // Violet background
      textColor: '#A8FF9B', // Light lime text (complementary, lighter for better readability)
    },
    // Dark - dark/medium backgrounds with colored text
    {
      id: 'darkPurple',
      backgroundColor: '#5011B3', // Dark purple background
      textColor: '#D4EDF8', // Light blue text
    },
    {
      id: 'darkSlate',
      backgroundColor: '#4f4085', // Dark slate background
      textColor: '#fbb0ad', // Lightened peach text (for WCAG compliance)
    },
    {
      id: 'darkBlueGray',
      backgroundColor: '#464b61', // Dark blue-gray background
      textColor: '#c5f6f9', // Sky blue text
    },
    {
      id: 'darkOlive',
      backgroundColor: '#433d3c', // Dark olive background
      textColor: '#accb6d', // Light lime green text
    },
    {
      id: 'darkMaroon',
      backgroundColor: '#85356e', // Dark maroon background
      textColor: '#fdb7d9', // Lightened pink text (for WCAG compliance)
    },
    // Neon - very dark backgrounds with neon text colors
    {
      id: 'neonRed',
      backgroundColor: '#260309', // Very dark background
      textColor: '#F6283C', // Neon red text (slightly less saturated for consistency)
    },
    {
      id: 'neonOrange',
      backgroundColor: '#261703', // Very dark background
      textColor: '#F69D28', // Neon orange text
    },
    {
      id: 'neonGreen',
      backgroundColor: '#0A2603', // Very dark background
      textColor: '#73F628', // Neon green text
    },
    {
      id: 'neonTeal',
      backgroundColor: '#032626', // Very dark background
      textColor: '#28F6D4', // Neon teal text
    },
    {
      id: 'neonBlue',
      backgroundColor: '#031226', // Very dark background
      textColor: '#28A0F6', // Neon blue text
    },
    {
      id: 'neonPurple',
      backgroundColor: '#110326', // Very dark background
      textColor: '#BF28F6', // Neon purple text
    },
  ], []);
  
  // Create shared values for each color box - create them all explicitly
  const customFlex = useSharedValue(3);
  const customTextFlex = useSharedValue(1);
  const blackFlex = useSharedValue(3);
  const blackTextFlex = useSharedValue(1);
  const primaryRedFlex = useSharedValue(3);
  const primaryRedTextFlex = useSharedValue(1);
  const primaryGreenFlex = useSharedValue(3);
  const primaryGreenTextFlex = useSharedValue(1);
  const primaryTealFlex = useSharedValue(3);
  const primaryTealTextFlex = useSharedValue(1);
  const primaryLightBlueFlex = useSharedValue(3);
  const primaryLightBlueTextFlex = useSharedValue(1);
  const primaryBlueFlex = useSharedValue(3);
  const primaryBlueTextFlex = useSharedValue(1);
  const primaryPurpleFlex = useSharedValue(3);
  const primaryPurpleTextFlex = useSharedValue(1);
  const primaryPinkFlex = useSharedValue(3);
  const primaryPinkTextFlex = useSharedValue(1);
  const brightRedFlex = useSharedValue(3);
  const brightRedTextFlex = useSharedValue(1);
  const brightOrangeFlex = useSharedValue(3);
  const brightOrangeTextFlex = useSharedValue(1);
  const brightYellowFlex = useSharedValue(3);
  const brightYellowTextFlex = useSharedValue(1);
  const brightGreenFlex = useSharedValue(3);
  const brightGreenTextFlex = useSharedValue(1);
  const brightCyanFlex = useSharedValue(3);
  const brightCyanTextFlex = useSharedValue(1);
  const brightPinkFlex = useSharedValue(3);
  const brightPinkTextFlex = useSharedValue(1);
  const brightPurpleFlex = useSharedValue(3);
  const brightPurpleTextFlex = useSharedValue(1);
  const pastelPinkFlex = useSharedValue(3);
  const pastelPinkTextFlex = useSharedValue(1);
  const pastelPeachFlex = useSharedValue(3);
  const pastelPeachTextFlex = useSharedValue(1);
  const pastelLemonFlex = useSharedValue(3);
  const pastelLemonTextFlex = useSharedValue(1);
  const pastelMintFlex = useSharedValue(3);
  const pastelMintTextFlex = useSharedValue(1);
  const pastelSkyFlex = useSharedValue(3);
  const pastelSkyTextFlex = useSharedValue(1);
  const pastelLavenderFlex = useSharedValue(3);
  const pastelLavenderTextFlex = useSharedValue(1);
  const darkPurpleFlex = useSharedValue(3);
  const darkPurpleTextFlex = useSharedValue(1);
  const darkSlateFlex = useSharedValue(3);
  const darkSlateTextFlex = useSharedValue(1);
  const darkBlueGrayFlex = useSharedValue(3);
  const darkBlueGrayTextFlex = useSharedValue(1);
  const darkOliveFlex = useSharedValue(3);
  const darkOliveTextFlex = useSharedValue(1);
  const darkMaroonFlex = useSharedValue(3);
  const darkMaroonTextFlex = useSharedValue(1);
  const neonRedFlex = useSharedValue(3);
  const neonRedTextFlex = useSharedValue(1);
  const neonOrangeFlex = useSharedValue(3);
  const neonOrangeTextFlex = useSharedValue(1);
  const neonGreenFlex = useSharedValue(3);
  const neonGreenTextFlex = useSharedValue(1);
  const neonTealFlex = useSharedValue(3);
  const neonTealTextFlex = useSharedValue(1);
  const neonBlueFlex = useSharedValue(3);
  const neonBlueTextFlex = useSharedValue(1);
  const neonPurpleFlex = useSharedValue(3);
  const neonPurpleTextFlex = useSharedValue(1);
  const complementaryBlueFlex = useSharedValue(3);
  const complementaryBlueTextFlex = useSharedValue(1);
  const complementaryTealFlex = useSharedValue(3);
  const complementaryTealTextFlex = useSharedValue(1);
  const complementaryPurpleFlex = useSharedValue(3);
  const complementaryPurpleTextFlex = useSharedValue(1);
  
  // Map color IDs to their shared values
  const colorFlexValues = useMemo(() => ({
    custom: { background: customFlex, text: customTextFlex },
    black: { background: blackFlex, text: blackTextFlex },
    primaryRed: { background: primaryRedFlex, text: primaryRedTextFlex },
    primaryGreen: { background: primaryGreenFlex, text: primaryGreenTextFlex },
    primaryTeal: { background: primaryTealFlex, text: primaryTealTextFlex },
    primaryLightBlue: { background: primaryLightBlueFlex, text: primaryLightBlueTextFlex },
    primaryBlue: { background: primaryBlueFlex, text: primaryBlueTextFlex },
    primaryPurple: { background: primaryPurpleFlex, text: primaryPurpleTextFlex },
    primaryPink: { background: primaryPinkFlex, text: primaryPinkTextFlex },
    brightRed: { background: brightRedFlex, text: brightRedTextFlex },
    brightOrange: { background: brightOrangeFlex, text: brightOrangeTextFlex },
    brightYellow: { background: brightYellowFlex, text: brightYellowTextFlex },
    brightGreen: { background: brightGreenFlex, text: brightGreenTextFlex },
    brightCyan: { background: brightCyanFlex, text: brightCyanTextFlex },
    brightPink: { background: brightPinkFlex, text: brightPinkTextFlex },
    brightPurple: { background: brightPurpleFlex, text: brightPurpleTextFlex },
    pastelPink: { background: pastelPinkFlex, text: pastelPinkTextFlex },
    pastelPeach: { background: pastelPeachFlex, text: pastelPeachTextFlex },
    pastelLemon: { background: pastelLemonFlex, text: pastelLemonTextFlex },
    pastelMint: { background: pastelMintFlex, text: pastelMintTextFlex },
    pastelSky: { background: pastelSkyFlex, text: pastelSkyTextFlex },
    pastelLavender: { background: pastelLavenderFlex, text: pastelLavenderTextFlex },
    darkPurple: { background: darkPurpleFlex, text: darkPurpleTextFlex },
    darkSlate: { background: darkSlateFlex, text: darkSlateTextFlex },
    darkBlueGray: { background: darkBlueGrayFlex, text: darkBlueGrayTextFlex },
    darkOlive: { background: darkOliveFlex, text: darkOliveTextFlex },
    darkMaroon: { background: darkMaroonFlex, text: darkMaroonTextFlex },
    neonRed: { background: neonRedFlex, text: neonRedTextFlex },
    neonOrange: { background: neonOrangeFlex, text: neonOrangeTextFlex },
    neonGreen: { background: neonGreenFlex, text: neonGreenTextFlex },
    neonTeal: { background: neonTealFlex, text: neonTealTextFlex },
    neonBlue: { background: neonBlueFlex, text: neonBlueTextFlex },
    neonPurple: { background: neonPurpleFlex, text: neonPurpleTextFlex },
    complementaryBlue: { background: complementaryBlueFlex, text: complementaryBlueTextFlex },
    complementaryTeal: { background: complementaryTealFlex, text: complementaryTealTextFlex },
    complementaryPurple: { background: complementaryPurpleFlex, text: complementaryPurpleTextFlex },
  }), [customFlex, customTextFlex, blackFlex, blackTextFlex, primaryRedFlex, primaryRedTextFlex, primaryGreenFlex, primaryGreenTextFlex,
      primaryTealFlex, primaryTealTextFlex, primaryLightBlueFlex, primaryLightBlueTextFlex, primaryBlueFlex, primaryBlueTextFlex, primaryPurpleFlex, primaryPurpleTextFlex,
      primaryPinkFlex, primaryPinkTextFlex,
      brightRedFlex, brightRedTextFlex, brightOrangeFlex, brightOrangeTextFlex,
      brightYellowFlex, brightYellowTextFlex, brightGreenFlex, brightGreenTextFlex,
      brightCyanFlex, brightCyanTextFlex, brightPinkFlex, brightPinkTextFlex, brightPurpleFlex, brightPurpleTextFlex,
      pastelPinkFlex, pastelPinkTextFlex, pastelPeachFlex, pastelPeachTextFlex,
      pastelLemonFlex, pastelLemonTextFlex, pastelMintFlex, pastelMintTextFlex,
      pastelSkyFlex, pastelSkyTextFlex, pastelLavenderFlex, pastelLavenderTextFlex,
      darkPurpleFlex, darkPurpleTextFlex, darkSlateFlex, darkSlateTextFlex, darkBlueGrayFlex, darkBlueGrayTextFlex,
      darkOliveFlex, darkOliveTextFlex, darkMaroonFlex, darkMaroonTextFlex, neonRedFlex, neonRedTextFlex,
      neonOrangeFlex, neonOrangeTextFlex, neonGreenFlex, neonGreenTextFlex, neonTealFlex, neonTealTextFlex,
      neonBlueFlex, neonBlueTextFlex, neonPurpleFlex, neonPurpleTextFlex,
      complementaryBlueFlex, complementaryBlueTextFlex, complementaryTealFlex, complementaryTealTextFlex,
      complementaryPurpleFlex, complementaryPurpleTextFlex]);

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
        const normalMatch = predefinedColors.find(preset => 
          preset.backgroundColor === defaultColors.backgroundColor && 
          preset.textColor === defaultColors.textColor
        );
        
        // Then check for inverted match
        const invertedMatch = predefinedColors.find(preset => 
          preset.backgroundColor === defaultColors.textColor && 
          preset.textColor === defaultColors.backgroundColor
        );
        
        if (normalMatch) {
          setSelectedColorId(normalMatch.id);
          setInvertedStates({ [normalMatch.id]: false });
          setCustomColors({
            backgroundColor: normalMatch.backgroundColor,
            textColor: normalMatch.textColor,
          });
          // Set flex values for this specific color
          const flexValues = colorFlexValues[normalMatch.id as keyof typeof colorFlexValues];
          if (flexValues) {
            flexValues.background.value = 3;
            flexValues.text.value = 1;
          }
        } else if (invertedMatch) {
          setSelectedColorId(invertedMatch.id);
          setInvertedStates({ [invertedMatch.id]: true });
          // Store the actual reversed colors (from defaultColors) - these are what the user has saved
          setCustomColors({
            backgroundColor: defaultColors.backgroundColor,
            textColor: defaultColors.textColor,
          });
          // Set flex values to inverted state (bottom box is larger)
          const flexValues = colorFlexValues[invertedMatch.id as keyof typeof colorFlexValues];
          if (flexValues) {
            flexValues.background.value = 1;
            flexValues.text.value = 3;
          }
        } else {
          // Custom colors - no preset match
          setSelectedColorId('custom');
          setInvertedStates({});
          const originalColors = {
            backgroundColor: defaultColors.backgroundColor,
            textColor: defaultColors.textColor,
          };
          setCustomColors(originalColors);
          setOriginalCustomColors(originalColors); // Store original custom colors
          setHasCustomColors(true);
          const flexValues = colorFlexValues['custom'];
          if (flexValues) {
            flexValues.background.value = 3;
            flexValues.text.value = 1;
          }
        }
      } else {
        setSelectedColorId('black');
        setInvertedStates({});
        setCustomColors(null);
        setHasCustomColors(false);
        const flexValues = colorFlexValues['black'];
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
    if (!colorPickerScrollViewRef.current || !hasInitializedColors.current || !selectedColorId) {
      return;
    }

    const colorWidth = 44;
    const gap = 4; // Match the gap in colorPickerContainer style
    const itemWidth = colorWidth + gap;
    const dividerWidth = 2;
    const dividerMargin = 8;
    const dividerTotalWidth = dividerWidth + (dividerMargin * 2);
    const padding = 20; // Match paddingHorizontal in colorPickerContainer
    const screenWidth = Dimensions.get('window').width;
    
    let colorCenterX: number;
    
    if (selectedColorId === 'custom') {
      // Custom color is at the start
      colorCenterX = padding + (colorWidth / 2);
    } else {
      // Find index in predefined colors
      const selectedColorIndex = predefinedColors.findIndex(c => c.id === selectedColorId);
      if (selectedColorIndex < 0) return;
      
      // Account for custom color box and divider if shown
      const customColorOffset = hasCustomColors ? itemWidth + dividerTotalWidth : 0;
      colorCenterX = customColorOffset + (selectedColorIndex * itemWidth) + padding + (colorWidth / 2);
    }
    
    // Center the color box in the visible area
    // Subtract half the screen width to center it
    const scrollPosition = Math.max(0, colorCenterX - (screenWidth / 2));

    colorPickerScrollViewRef.current.scrollTo({
      x: scrollPosition,
      animated: false,
    });
  }, [selectedColorId, predefinedColors, hasCustomColors]);

  // Handle avatar selection
  const handleAvatarPress = useCallback(async () => {
    try {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (cameraStatus !== 'granted' || libraryStatus !== 'granted') {
        Alert.alert('Permission Required', 'Camera and photo library access are required to change your avatar.');
        return;
      }

      Alert.alert(
        'Change Avatar',
        'Choose how you want to update your avatar',
        [
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
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to open image picker. Please try again.');
    }
  }, []);

  // Handle color selection
  const handleColorSelect = useCallback((colorOption: ProfileColorOption) => {
    const isAlreadySelected = selectedColorId === colorOption.id;
    const currentFlexValues = colorFlexValues[colorOption.id as keyof typeof colorFlexValues];
    
    // If selecting a preset color from custom, reset custom flex values but keep the box visible
    if (selectedColorId === 'custom' && colorOption.id !== 'custom') {
      colorFlexValues.custom.background.value = 3;
      colorFlexValues.custom.text.value = 1;
    }
    
    if (isAlreadySelected) {
      // Invert colors - toggle inverted state for this specific color
      const currentInverted = invertedStates[colorOption.id] || false;
      const newInverted = !currentInverted;
      
      setInvertedStates(prev => ({ ...prev, [colorOption.id]: newInverted }));
      
      // Swap colors based on current customColors or colorOption
      const currentBg = customColors?.backgroundColor || colorOption.backgroundColor;
      const currentText = customColors?.textColor || colorOption.textColor;
      
      setCustomColors({
        backgroundColor: currentText,
        textColor: currentBg,
      });
      
      // Animate dimension swap for this specific color box
      if (currentFlexValues) {
        currentFlexValues.background.value = withSpring(newInverted ? 1 : 3);
        currentFlexValues.text.value = withSpring(newInverted ? 3 : 1);
      }
    } else {
      // Animate previous box back to normal if it was inverted
      const previousFlexValues = colorFlexValues[selectedColorId as keyof typeof colorFlexValues];
      if (previousFlexValues && invertedStates[selectedColorId]) {
        // Update inverted state first, then animate
        setInvertedStates(prev => ({ ...prev, [selectedColorId]: false }));
        previousFlexValues.background.value = withSpring(3);
        previousFlexValues.text.value = withSpring(1);
      }
      
      // Select new color
      setSelectedColorId(colorOption.id);
      const wasInverted = invertedStates[colorOption.id] || false;
      
      if (wasInverted) {
        // This color was previously inverted, restore its inverted state with animation
        setCustomColors({
          backgroundColor: colorOption.textColor,
          textColor: colorOption.backgroundColor,
        });
        if (currentFlexValues) {
          currentFlexValues.background.value = withSpring(1);
          currentFlexValues.text.value = withSpring(3);
        }
      } else {
        // Normal state - ensure it's animated even if already at these values
        setCustomColors({
          backgroundColor: colorOption.backgroundColor,
          textColor: colorOption.textColor,
        });
        if (currentFlexValues) {
          currentFlexValues.background.value = withSpring(3);
          currentFlexValues.text.value = withSpring(1);
        }
      }
    }
  }, [selectedColorId, invertedStates, customColors, colorFlexValues]);

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
      if (customColors && (
        !defaultColors || 
        customColors.backgroundColor !== defaultColors.backgroundColor ||
        customColors.textColor !== defaultColors.textColor
      )) {
        updates.customColors = customColors;
      }
      
      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        await profileUpdateMutation.mutateAsync({
          handle: profileData.handle,
          updates
        });
      }
      
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    }
  }, [profileData, editDisplayName, editDescription, editAvatar, customColors, defaultColors, profileUpdateMutation, router]);

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
                <Text style={[styles.aboutHeaderCurrent, aboutOverBy > 0 && styles.aboutHeaderCurrentOver]}>
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
                tintColor={hexToRGBA(
                  Colors.white,
                  isAboutFocused && aboutOverBy > 0 ? 0.35 : 0.9
                )}
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
                    id: 'custom',
                    backgroundColor: originalCustomColors.backgroundColor,
                    textColor: originalCustomColors.textColor,
                  }}
                  isSelected={selectedColorId === 'custom'}
                  isInverted={false}
                  customColors={selectedColorId === 'custom' ? customColors : null}
                  currentColors={currentColors}
                  backgroundFlex={colorFlexValues.custom.background}
                  textFlex={colorFlexValues.custom.text}
                  onPress={() => {
                    // Handle custom color selection/inversion
                    if (selectedColorId === 'custom') {
                      // Invert custom colors
                      const currentInverted = invertedStates['custom'] || false;
                      const newInverted = !currentInverted;
                      
                      setInvertedStates(prev => ({ ...prev, custom: newInverted }));
                      
                      // Use originalCustomColors as the base for inversion
                      const currentBg = customColors?.backgroundColor || originalCustomColors?.backgroundColor || '';
                      const currentText = customColors?.textColor || originalCustomColors?.textColor || '';
                      
                      setCustomColors({
                        backgroundColor: currentText,
                        textColor: currentBg,
                      });
                      
                      colorFlexValues.custom.background.value = withSpring(newInverted ? 1 : 3);
                      colorFlexValues.custom.text.value = withSpring(newInverted ? 3 : 1);
                    } else {
                      // Select custom color - restore to original custom colors
                      const previousFlexValues = colorFlexValues[selectedColorId as keyof typeof colorFlexValues];
                      if (previousFlexValues && invertedStates[selectedColorId]) {
                        setInvertedStates(prev => ({ ...prev, [selectedColorId]: false }));
                        previousFlexValues.background.value = withSpring(3);
                        previousFlexValues.text.value = withSpring(1);
                      }
                      
                      setSelectedColorId('custom');
                      // Restore to original custom colors
                      if (originalCustomColors) {
                        setCustomColors({
                          backgroundColor: originalCustomColors.backgroundColor,
                          textColor: originalCustomColors.textColor,
                        });
                      }
                      colorFlexValues.custom.background.value = withSpring(3);
                      colorFlexValues.custom.text.value = withSpring(1);
                    }
                  }}
                />
                <View style={styles.colorDivider} />
              </>
            )}
            
            {predefinedColors.map((colorOption) => {
              const isSelected = selectedColorId === colorOption.id;
              const isInverted = invertedStates[colorOption.id] || false;
              const flexValues = colorFlexValues[colorOption.id as keyof typeof colorFlexValues];
              
              if (!flexValues) return null;
              
              return (
                <AnimatedColorSquare
                  key={colorOption.id}
                  colorOption={colorOption}
                  isSelected={isSelected}
                  isInverted={isInverted}
                  customColors={isSelected ? customColors : null}
                  currentColors={currentColors}
                  backgroundFlex={flexValues.background}
                  textFlex={flexValues.text}
                  onPress={() => handleColorSelect(colorOption)}
                />
              );
            })}
          </ScrollView>
        </View>
      </SafeAreaView>

      {/* Profile Editing Fields - Sheet Content */}
      <View style={[styles.bottomSectionContainer, { backgroundColor: currentColors.backgroundColor }]}>
        <SafeAreaView style={[styles.safeArea, { backgroundColor: currentColors.backgroundColor }]} edges={['bottom']}>
          <ScrollView
            style={styles.content}
            contentContainerStyle={{ flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Username & Avatar & Display Name Sections */}
            {!isAboutFocused && (
              <Animated.View layout={Layout.springify().duration(220)}>
                {/* Username Section */}
                <View style={styles.usernameSection}>
                  <Text style={[styles.sectionTitle, { color: hexToRGBA(currentColors.textColor, 0.90) }]}>
                    USERNAME
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    bounces={false}
                    contentContainerStyle={{ flexGrow: 1 }}
                  >
                    <Text style={[styles.largeText, { color: currentColors.textColor }]}>
                      <Text style={[styles.handleAt, { color: hexToRGBA(currentColors.textColor, 0.50) }]}>
                        @
                      </Text>
                      <Text>
                        {' '}
                        {handleBase}
                        {handleSuffix && (
                          <Text
                            style={[
                              styles.handleSuffix,
                              { color: hexToRGBA(currentColors.textColor, 0.70) },
                            ]}
                          >
                            {handleSuffix}
                          </Text>
                        )}
                      </Text>
                    </Text>
                  </ScrollView>
                </View>

                <View style={[styles.divider, { backgroundColor: hexToRGBA(currentColors.textColor, 0.20) }]} />

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
                      <Text style={[styles.sectionTitle, { color: hexToRGBA(currentColors.textColor, 0.8), marginLeft: 6 }]}>
                        PROFILE PICTURE
                      </Text>
                      <Pressable 
                        style={[
                          styles.uploadButton, 
                          !isLiquidGlassAvailable() && {
                            backgroundColor: hexToRGBA(currentColors.textColor, 0.15),
                          }
                        ]}
                        onPress={handleAvatarPress} 
                      >
                        {isLiquidGlassAvailable() && (
                          <GlassView 
                            style={styles.glassBackground}
                            glassEffectStyle="clear"
                            tintColor={hexToRGBA(currentColors.textColor, 0.15)}
                            isInteractive
                          />
                        )}
                        <View pointerEvents="none">
                          <Text style={[styles.uploadButtonText, { color: currentColors.textColor }]}>
                            Upload
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View style={[styles.divider, { backgroundColor: hexToRGBA(currentColors.textColor, 0.12) }]} />

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
                    style={[styles.largeInput, {
                      color: currentColors.textColor,
                      backgroundColor: 'transparent',
                      borderColor: 'transparent',
                    }]}
                    value={editDisplayName}
                    onChangeText={setEditDisplayName}
                    placeholder="Name"
                    placeholderTextColor={hexToRGBA(currentColors.textColor, 0.30)}
                    scrollEnabled
                    maxLength={65}
                  />
                </View>
              </Animated.View>
            )}

            {!isAboutFocused && (
              <View style={[styles.divider, { backgroundColor: hexToRGBA(currentColors.textColor, 0.12) }]} />
            )}

            {/* About Section */}
            <Animated.View
              layout={Layout.springify().duration(220)}
              style={[styles.section, isAboutFocused && styles.aboutExpandedSection]}
            >
              <Text style={[styles.sectionTitle, { color: hexToRGBA(currentColors.textColor, 0.8) }]}>
                ABOUT
              </Text>
              <TextInput
                style={[styles.textArea, {
                  color: currentColors.textColor,
                }, isAboutFocused && { flex: 1 }]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Tell us about yourself"
                placeholderTextColor={hexToRGBA(currentColors.textColor, 0.30)}
                multiline
                onFocus={() => {
                  setIsAboutFocused(true);
                }}
              />
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
