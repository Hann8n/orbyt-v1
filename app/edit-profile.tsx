import React, { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
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

export interface ProfileColorOption {
  id: string;
  backgroundColor: string;
  textColor: string;
  label: string;
}

const INPUT_BACKGROUND_OPACITY = 0.06;
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
  isInverted,
  customColors,
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
  
  // Handle formatting: detach ".bsky.social" suffix if present so we can
  // render the suffix separately in the UI (bottom-right of the section).
  const { handleBase, handleSuffix } = useMemo(() => {
    const rawHandle = profileData?.handle ?? userHandle ?? 'username';
    if (!rawHandle) {
      return { handleBase: 'username', handleSuffix: null as string | null };
    }
    
    const suffix = '.bsky.social';
    if (rawHandle.endsWith(suffix)) {
      return {
        handleBase: rawHandle.slice(0, -suffix.length),
        handleSuffix: suffix,
      };
    }
    
    return {
      handleBase: rawHandle,
      handleSuffix: null as string | null,
    };
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
  const [selectedColorType, setSelectedColorType] = useState<'background' | 'text'>('background');
  const [customColors, setCustomColors] = useState<{
    backgroundColor: string;
    textColor: string;
  } | null>(null);

  // Track inverted state per color ID
  const [invertedStates, setInvertedStates] = useState<Record<string, boolean>>({});
  
  // Ref to track if we've initialized colors to prevent infinite loops
  const hasInitializedColors = useRef(false);
  // Ref for color picker ScrollView to scroll to selected color
  const colorPickerScrollViewRef = useRef<ScrollView>(null);
  
  // Predefined color options
  const predefinedColors: ProfileColorOption[] = useMemo(() => [
    // First color option - black background with light gray text
    {
      id: 'black',
      backgroundColor: Colors.black,
      textColor: Colors.lightGray,
      label: 'Black',
    },
    // Custom color options with white text
    {
      id: 'teal',
      backgroundColor: '#06b4b1',
      textColor: Colors.white,
      label: 'Teal',
    },
    {
      id: 'purple',
      backgroundColor: '#7321fb',
      textColor: Colors.white,
      label: 'Purple',
    },
    {
      id: 'blue',
      backgroundColor: '#0046fc',
      textColor: Colors.white,
      label: 'Blue',
    },
    {
      id: 'green',
      backgroundColor: '#43b412',
      textColor: Colors.white,
      label: 'Green',
    },
    {
      id: 'red',
      backgroundColor: '#ba2740',
      textColor: Colors.white,
      label: 'Red',
    },
    {
      id: 'lightBlue',
      backgroundColor: '#09a6ed',
      textColor: Colors.white,
      label: 'Light Blue',
    },
    {
      id: 'pink',
      backgroundColor: '#d63fe3',
      textColor: Colors.white,
      label: 'Pink',
    },
    {
      id: 'gold',
      backgroundColor: '#ddaa21',
      textColor: Colors.white,
      label: 'Gold',
    },
    {
      id: 'lightPink',
      backgroundColor: '#f9a8d3',
      textColor: '#1a1a2e', // pastel blue
      label: 'Light Pink',
    },
    {
      id: 'darkPurple',
      backgroundColor: '#5913ce',
      textColor: '#87ceeb', // light blue
      label: 'Dark Purple',
    },
    {
      id: 'neonGreen',
      backgroundColor: '#01de6e',
      textColor: '#1a1a2e', // blueish black
      label: 'Neon Green',
    },
    {
      id: 'neonTeal',
      backgroundColor: '#00e4bf',
      textColor: '#414974', // blurple
      label: 'Neon Teal',
    },
    {
      id: 'golddark',
      backgroundColor: '#ddaa21',
      textColor: '#1a1a2e', // blueish black
      label: 'Gold',
    },
    {
      id: 'armyGreen',
      backgroundColor: '#433d3c',
      textColor: '#accb6d', // light lime green
      label: 'Army Green',
    },
    {
      id: 'lightMaroon',
      backgroundColor: '#85356e',
      textColor: '#fa5fab', // pink
      label: 'Light Maroon',
    },
    {
      id: 'mutedPink',
      backgroundColor: '#926979',
      textColor: '#f6a2bd', // light pink
      label: 'Muted Pink',
    },
    {
      id: 'darkPurple2',
      backgroundColor: '#4f4085',
      textColor: '#f85b56', // dark peach
      label: 'Dark Purple',
    },
    {
      id: 'blueishGray',
      backgroundColor: '#464b61',
      textColor: '#c5f6f9', // sky blue
      label: 'Blueish Gray',
    },
    {
      id: 'lightPurple2',
      backgroundColor: '#9584da',
      textColor: '#2f2353', // very dark purple
      label: 'Light Purple',
    },
    {
      id: 'darkMaroon',
      backgroundColor: '#581b34',
      textColor: '#d94938', // dark orange
      label: 'Dark Maroon',
    },
    {
      id: 'veryDarkBlue',
      backgroundColor: '#001b42',
      textColor: '#0090f6', // blue
      label: 'Very Dark Blue',
    },
    {
      id: 'veryDarkPeach',
      backgroundColor: '#30050d',
      textColor: '#fd5668', // peach
      label: 'Very Dark Peach',
    },
    {
      id: 'veryDarkPurple',
      backgroundColor: '#1d0640',
      textColor: '#c838fb', // purple
      label: 'Very Dark Purple',
    },
    {
      id: 'veryDarkTeal',
      backgroundColor: '#0a2b2b',
      textColor: '#00e4bf', // teal
      label: 'Very Dark Teal',
    },
    {
      id: 'veryDarkGreen',
      backgroundColor: '#061d00',
      textColor: '#4bc602', // green
      label: 'Very Dark Green',
    },
    {
      id: 'veryDarkOrange',
      backgroundColor: '#2b1900',
      textColor: '#f7a232', // orange
      label: 'Very Dark Orange',
    },
  ], []);
  
  // Create shared values for each color box - create them all explicitly
  const blackFlex = useSharedValue(3);
  const blackTextFlex = useSharedValue(1);
  const tealFlex = useSharedValue(3);
  const tealTextFlex = useSharedValue(1);
  const purpleFlex = useSharedValue(3);
  const purpleTextFlex = useSharedValue(1);
  const blueFlex = useSharedValue(3);
  const blueTextFlex = useSharedValue(1);
  const greenFlex = useSharedValue(3);
  const greenTextFlex = useSharedValue(1);
  const redFlex = useSharedValue(3);
  const redTextFlex = useSharedValue(1);
  const lightBlueFlex = useSharedValue(3);
  const lightBlueTextFlex = useSharedValue(1);
  const pinkFlex = useSharedValue(3);
  const pinkTextFlex = useSharedValue(1);
  const goldFlex = useSharedValue(3);
  const goldTextFlex = useSharedValue(1);
  const lightPinkFlex = useSharedValue(3);
  const lightPinkTextFlex = useSharedValue(1);
  const darkPurpleFlex = useSharedValue(3);
  const darkPurpleTextFlex = useSharedValue(1);
  const neonGreenFlex = useSharedValue(3);
  const neonGreenTextFlex = useSharedValue(1);
  const neonTealFlex = useSharedValue(3);
  const neonTealTextFlex = useSharedValue(1);
  const golddarkFlex = useSharedValue(3);
  const golddarkTextFlex = useSharedValue(1);
  const armyGreenFlex = useSharedValue(3);
  const armyGreenTextFlex = useSharedValue(1);
  const lightMaroonFlex = useSharedValue(3);
  const lightMaroonTextFlex = useSharedValue(1);
  const mutedPinkFlex = useSharedValue(3);
  const mutedPinkTextFlex = useSharedValue(1);
  const darkPurple2Flex = useSharedValue(3);
  const darkPurple2TextFlex = useSharedValue(1);
  const blueishGrayFlex = useSharedValue(3);
  const blueishGrayTextFlex = useSharedValue(1);
  const lightPurple2Flex = useSharedValue(3);
  const lightPurple2TextFlex = useSharedValue(1);
  const darkMaroonFlex = useSharedValue(3);
  const darkMaroonTextFlex = useSharedValue(1);
  const veryDarkBlueFlex = useSharedValue(3);
  const veryDarkBlueTextFlex = useSharedValue(1);
  const veryDarkPeachFlex = useSharedValue(3);
  const veryDarkPeachTextFlex = useSharedValue(1);
  const veryDarkPurpleFlex = useSharedValue(3);
  const veryDarkPurpleTextFlex = useSharedValue(1);
  const veryDarkTealFlex = useSharedValue(3);
  const veryDarkTealTextFlex = useSharedValue(1);
  const veryDarkGreenFlex = useSharedValue(3);
  const veryDarkGreenTextFlex = useSharedValue(1);
  const veryDarkOrangeFlex = useSharedValue(3);
  const veryDarkOrangeTextFlex = useSharedValue(1);
  
  // Map color IDs to their shared values
  const colorFlexValues = useMemo(() => ({
    black: { background: blackFlex, text: blackTextFlex },
    teal: { background: tealFlex, text: tealTextFlex },
    purple: { background: purpleFlex, text: purpleTextFlex },
    blue: { background: blueFlex, text: blueTextFlex },
    green: { background: greenFlex, text: greenTextFlex },
    red: { background: redFlex, text: redTextFlex },
    lightBlue: { background: lightBlueFlex, text: lightBlueTextFlex },
    pink: { background: pinkFlex, text: pinkTextFlex },
    gold: { background: goldFlex, text: goldTextFlex },
    lightPink: { background: lightPinkFlex, text: lightPinkTextFlex },
    darkPurple: { background: darkPurpleFlex, text: darkPurpleTextFlex },
    neonGreen: { background: neonGreenFlex, text: neonGreenTextFlex },
    neonTeal: { background: neonTealFlex, text: neonTealTextFlex },
    golddark: { background: golddarkFlex, text: golddarkTextFlex },
    armyGreen: { background: armyGreenFlex, text: armyGreenTextFlex },
    lightMaroon: { background: lightMaroonFlex, text: lightMaroonTextFlex },
    mutedPink: { background: mutedPinkFlex, text: mutedPinkTextFlex },
    darkPurple2: { background: darkPurple2Flex, text: darkPurple2TextFlex },
    blueishGray: { background: blueishGrayFlex, text: blueishGrayTextFlex },
    lightPurple2: { background: lightPurple2Flex, text: lightPurple2TextFlex },
    darkMaroon: { background: darkMaroonFlex, text: darkMaroonTextFlex },
    veryDarkBlue: { background: veryDarkBlueFlex, text: veryDarkBlueTextFlex },
    veryDarkPeach: { background: veryDarkPeachFlex, text: veryDarkPeachTextFlex },
    veryDarkPurple: { background: veryDarkPurpleFlex, text: veryDarkPurpleTextFlex },
    veryDarkTeal: { background: veryDarkTealFlex, text: veryDarkTealTextFlex },
    veryDarkGreen: { background: veryDarkGreenFlex, text: veryDarkGreenTextFlex },
    veryDarkOrange: { background: veryDarkOrangeFlex, text: veryDarkOrangeTextFlex },
  }), [blackFlex, blackTextFlex, tealFlex, tealTextFlex, purpleFlex, purpleTextFlex, blueFlex, blueTextFlex, 
      greenFlex, greenTextFlex, redFlex, redTextFlex, lightBlueFlex, lightBlueTextFlex, pinkFlex, pinkTextFlex,
      goldFlex, goldTextFlex, lightPinkFlex, lightPinkTextFlex, darkPurpleFlex, darkPurpleTextFlex,
      neonGreenFlex, neonGreenTextFlex, neonTealFlex, neonTealTextFlex, golddarkFlex, golddarkTextFlex,
      armyGreenFlex, armyGreenTextFlex, lightMaroonFlex, lightMaroonTextFlex, mutedPinkFlex, mutedPinkTextFlex,
      darkPurple2Flex, darkPurple2TextFlex, blueishGrayFlex, blueishGrayTextFlex, lightPurple2Flex, lightPurple2TextFlex,
      darkMaroonFlex, darkMaroonTextFlex, veryDarkBlueFlex, veryDarkBlueTextFlex, veryDarkPeachFlex, veryDarkPeachTextFlex,
      veryDarkPurpleFlex, veryDarkPurpleTextFlex, veryDarkTealFlex, veryDarkTealTextFlex, veryDarkGreenFlex, veryDarkGreenTextFlex,
      veryDarkOrangeFlex, veryDarkOrangeTextFlex]);

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
        const presetColors = [
          { id: 'black', backgroundColor: Colors.black, textColor: Colors.lightGray },
          { id: 'teal', backgroundColor: '#06b4b1', textColor: Colors.white },
          { id: 'purple', backgroundColor: '#7321fb', textColor: Colors.white },
          { id: 'blue', backgroundColor: '#0046fc', textColor: Colors.white },
          { id: 'green', backgroundColor: '#43b412', textColor: Colors.white },
          { id: 'red', backgroundColor: '#ba2740', textColor: Colors.white },
          { id: 'lightBlue', backgroundColor: '#09a6ed', textColor: Colors.white },
          { id: 'pink', backgroundColor: '#d63fe3', textColor: Colors.white },
          { id: 'gold', backgroundColor: '#ddaa21', textColor: Colors.white },
          { id: 'lightPink', backgroundColor: '#f9a8d3', textColor: '#1a1a2e' },
          { id: 'darkPurple', backgroundColor: '#5913ce', textColor: '#87ceeb' },
          { id: 'neonGreen', backgroundColor: '#01de6e', textColor: '#1a1a2e' },
          { id: 'neonTeal', backgroundColor: '#00e4bf', textColor: '#414974' },
          { id: 'golddark', backgroundColor: '#ddaa21', textColor: '#1a1a2e' },
          { id: 'armyGreen', backgroundColor: '#433d3c', textColor: '#accb6d' },
          { id: 'lightMaroon', backgroundColor: '#85356e', textColor: '#fa5fab' },
          { id: 'mutedPink', backgroundColor: '#926979', textColor: '#f6a2bd' },
          { id: 'darkPurple2', backgroundColor: '#4f4085', textColor: '#f85b56' },
          { id: 'blueishGray', backgroundColor: '#464b61', textColor: '#c5f6f9' },
          { id: 'lightPurple2', backgroundColor: '#9584da', textColor: '#2f2353' },
          { id: 'darkMaroon', backgroundColor: '#581b34', textColor: '#d94938' },
          { id: 'veryDarkBlue', backgroundColor: '#001b42', textColor: '#0090f6' },
          { id: 'veryDarkPeach', backgroundColor: '#30050d', textColor: '#fd5668' },
          { id: 'veryDarkPurple', backgroundColor: '#1d0640', textColor: '#c838fb' },
          { id: 'veryDarkTeal', backgroundColor: '#0a2b2b', textColor: '#00e4bf' },
          { id: 'veryDarkGreen', backgroundColor: '#061d00', textColor: '#4bc602' },
          { id: 'veryDarkOrange', backgroundColor: '#2b1900', textColor: '#f7a232' },
        ];
        
        // First check for normal match
        const normalMatch = presetColors.find(preset => 
          preset.backgroundColor === defaultColors.backgroundColor && 
          preset.textColor === defaultColors.textColor
        );
        
        // Then check for inverted match
        const invertedMatch = presetColors.find(preset => 
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
          const flexValues = colorFlexValues[normalMatch.id];
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
          const flexValues = colorFlexValues[invertedMatch.id];
          if (flexValues) {
            flexValues.background.value = 1;
            flexValues.text.value = 3;
          }
        } else {
          setSelectedColorId('black');
          setInvertedStates({});
          setCustomColors(null);
          const flexValues = colorFlexValues['black'];
          if (flexValues) {
            flexValues.background.value = 3;
            flexValues.text.value = 1;
          }
        }
      } else {
        setSelectedColorId('black');
        setInvertedStates({});
        setCustomColors(null);
        const flexValues = colorFlexValues['black'];
        if (flexValues) {
          flexValues.background.value = 3;
          flexValues.text.value = 1;
        }
      }
      
      setSelectedColorType('background');
      hasInitializedColors.current = true;
    }
  }, [profileData, defaultColors, colorFlexValues]);

  // Calculate and set scroll position when color picker is laid out
  const handleColorPickerLayout = useCallback(() => {
    if (!colorPickerScrollViewRef.current || !hasInitializedColors.current || !selectedColorId) {
      return;
    }

    const selectedColorIndex = predefinedColors.findIndex(c => c.id === selectedColorId);
    if (selectedColorIndex < 0) return;

    const colorWidth = 44;
    const gap = 8;
    const itemWidth = colorWidth + gap;
    const padding = 20;
    const screenWidth = Dimensions.get('window').width;
    const colorPosition = selectedColorIndex * itemWidth + padding + (colorWidth / 2);
    const scrollPosition = Math.max(0, colorPosition - (screenWidth / 2));

    colorPickerScrollViewRef.current.scrollTo({
      x: scrollPosition,
      animated: false,
    });
  }, [selectedColorId, predefinedColors]);

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
    const currentFlexValues = colorFlexValues[colorOption.id];
    
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
      const previousFlexValues = colorFlexValues[selectedColorId];
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
      // customColors already contains the correct colors (swapped if inverted)
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
          <Pressable onPress={handleDismiss} style={styles.cancelButton}>
            <Text style={[styles.cancelButtonText, { color: Colors.white }]}>
              Cancel
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
            {predefinedColors.map((colorOption) => {
              const isSelected = selectedColorId === colorOption.id;
              const isInverted = invertedStates[colorOption.id] || false;
              const flexValues = colorFlexValues[colorOption.id];
              
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
                              { color: hexToRGBA(currentColors.textColor, 0.50) },
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
                  <Text style={[styles.sectionTitle, { color: hexToRGBA(currentColors.textColor, 0.8) }]}>
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
  headerTitle: {
    fontFamily: 'Firma-Bold',
    fontSize: 18,
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
    fontSize: 14,
  },
  largeInput: {
    fontFamily: 'Firma-Black',
    fontSize: 32,
    lineHeight: 40,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 2,
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
  uploadButtonFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
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
  colorSquare: {
    width: 40,
    height: 40,
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
  textInput: {
    fontFamily: 'Firma-Medium',
    fontSize: 16,
    borderWidth: 0,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 6,
    minHeight: 48,
    textAlignVertical: 'center',
    backgroundColor: 'transparent',
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
