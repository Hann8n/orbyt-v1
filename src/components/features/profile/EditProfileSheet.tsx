import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  Modal,
  Dimensions,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import { Button, Host } from '@expo/ui/swift-ui';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Colors } from '../../ui/UI';
import { Loading3FillIcon } from '../../ui/Icon';
import { useProfileUpdateMutation } from '../../../services/cache/ProfileCache';

export interface ProfileColorOption {
  id: string;
  backgroundColor: string;
  textColor: string;
  label: string;
}
import { hexToRGBA, extractColorsFromImage, isColorDark } from '../../../utils/formatting/colorUtils';
import Icon from '../../ui/Icon';

interface EditProfileSheetProps {
  visible: boolean;
  onDismiss: () => void;
  profileData: {
    displayName?: string;
    description?: string;
    avatar?: string;
    handle?: string;
    did?: string;
  } | null;
  defaultColors?: {
    backgroundColor: string;
    textColor: string;
  };
}

const INPUT_BACKGROUND_OPACITY = 0.06;

const EditProfileSheet: React.FC<EditProfileSheetProps> = ({
  visible,
  onDismiss,
  profileData,
  defaultColors,
}) => {
  // Form state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAvatar, setEditAvatar] = useState<string | undefined>(undefined);
  
  // Color selection state
  const [selectedColorId, setSelectedColorId] = useState<string>('default');
  const [selectedColorType, setSelectedColorType] = useState<'background' | 'text'>('background');
  const [customColors, setCustomColors] = useState<{
    backgroundColor: string;
    textColor: string;
  } | null>(null);

  // Mutation
  const profileUpdateMutation = useProfileUpdateMutation();

  // Initialize form when sheet opens
  useEffect(() => {
    if (visible && profileData) {
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
        
        const match = presetColors.find(preset => 
          preset.backgroundColor === defaultColors.backgroundColor && 
          preset.textColor === defaultColors.textColor
        );
        
        if (match) {
          setSelectedColorId(match.id);
          setCustomColors({
            backgroundColor: match.backgroundColor,
            textColor: match.textColor,
          });
        } else {
          setSelectedColorId('default');
          setCustomColors(null);
        }
      } else {
        setSelectedColorId('default');
        setCustomColors(null);
      }
      
      setSelectedColorType('background');
    }
  }, [visible, profileData, defaultColors]);

  // Extract colors from avatar when it changes
  const [extractedColors, setExtractedColors] = useState<{
    backgroundColor: string;
    textColor: string;
  } | null>(null);
  
  useEffect(() => {
    const extractAvatarColors = async () => {
      if (profileData?.avatar) {
        try {
          const colors = await extractColorsFromImage(profileData.avatar);
          setExtractedColors({
            backgroundColor: colors.backgroundColor,
            textColor: colors.foregroundColor,
          });
        } catch (error) {
          // Silently fail if extraction fails
        }
      }
    };
    
    extractAvatarColors();
  }, [profileData?.avatar]);
  
  // Predefined color options
  const predefinedColors: ProfileColorOption[] = useMemo(() => [
    // Current colors - use extracted colors if available, otherwise use default colors
    {
      id: 'default',
      backgroundColor: extractedColors?.backgroundColor || defaultColors?.backgroundColor || '#000000',
      textColor: extractedColors?.textColor || defaultColors?.textColor || '#FFFFFF',
      label: 'Current',
    },
    // Separator - will be rendered as a visual divider
    {
      id: 'separator',
      backgroundColor: 'transparent',
      textColor: 'transparent',
      label: 'separator',
    },
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
  ], [defaultColors, extractedColors]);

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
    setSelectedColorId(colorOption.id);
    if (colorOption.id === 'default') {
      setCustomColors(null);
    } else {
      setCustomColors({
        backgroundColor: colorOption.backgroundColor,
        textColor: colorOption.textColor,
      });
    }
  }, []);

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
      
      onDismiss();
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    }
  }, [profileData, editDisplayName, editDescription, editAvatar, customColors, defaultColors, profileUpdateMutation, onDismiss]);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  // Get current colors for display
  const currentColors = useMemo(() => {
    if (customColors) {
      return customColors;
    }
    return {
      backgroundColor: extractedColors?.backgroundColor || defaultColors?.backgroundColor || Colors.black,
      textColor: extractedColors?.textColor || defaultColors?.textColor || Colors.white,
    };
  }, [customColors, defaultColors, extractedColors]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaView style={[styles.safeArea, { backgroundColor: currentColors.backgroundColor }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleDismiss} style={styles.cancelButton}>
              <Text style={[styles.cancelButtonText, { color: currentColors.textColor }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            
            <Text style={[styles.headerTitle, { color: currentColors.textColor }]}>
              Edit Profile
            </Text>
            
            <TouchableOpacity 
              onPress={handleSave}
              activeOpacity={0.8}
              disabled={profileUpdateMutation.isPending}
            >
              {isLiquidGlassAvailable ? (
                <GlassView 
                  style={styles.saveButtonGlass}
                  glassEffectStyle="clear"
                  tintColor={hexToRGBA(currentColors.textColor, 0.9)}
                  isInteractive
                >
                  {profileUpdateMutation.isPending ? (
                    <Loading3FillIcon size={24} color={currentColors.backgroundColor} />
                  ) : (
                    <Text style={[styles.saveButtonText, { color: currentColors.backgroundColor }]}>Save</Text>
                  )}
                </GlassView>
              ) : (
                <View style={styles.saveButton}>
                  {profileUpdateMutation.isPending ? (
                    <Loading3FillIcon size={24} color={Colors.black} />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Color Theme Section */}
            {true && (
              <View style={[styles.section, { marginBottom: 16 }]}>
                {/* Color Picker */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.colorPickerContainer}
                  style={styles.colorPickerScrollView}
                >
                  {predefinedColors.map((colorOption) => {
                    const isSelected = selectedColorId === colorOption.id;
                    
                    // Render separator
                    if (colorOption.id === 'separator') {
                      return (
                        <View key={colorOption.id} style={styles.separatorContainer}>
                          <View style={[styles.separator, { backgroundColor: currentColors.textColor }]} />
                        </View>
                      );
                    }
                    
                    return (
                      <View key={colorOption.id} style={styles.colorSquareContainer}>
                        <TouchableOpacity
                          style={[
                            styles.colorSquare,
                            {
                              borderColor: isSelected ? currentColors.textColor : 'transparent',
                              borderWidth: isSelected ? 3 : 0,
                            },
                          ]}
                          onPress={() => handleColorSelect(colorOption)}
                          activeOpacity={0.7}
                        >
                          {/* Background color section (75%) */}
                          <View
                            style={[
                              styles.colorSection,
                              styles.backgroundSection,
                              { backgroundColor: colorOption.backgroundColor }
                            ]}
                          />
                          
                          {/* Text color section (25%) */}
                          <View
                            style={[
                              styles.colorSection,
                              styles.textSection,
                              { backgroundColor: colorOption.textColor }
                            ]}
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Avatar Section */}
            <View style={styles.section}>
              <View style={styles.avatarContainer}>
                <View style={[styles.avatar, { borderColor: currentColors.textColor }]}>
                  {editAvatar ? (
                    <Image source={{ uri: editAvatar }} style={styles.avatarImage} />
                  ) : profileData?.avatar ? (
                    <Image source={{ uri: profileData.avatar }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarText}>👤</Text>
                  )}
                </View>
                <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.8}>
                  {isLiquidGlassAvailable ? (
                    <GlassView 
                      style={styles.uploadButton}
                      glassEffectStyle="clear"
                      tintColor={hexToRGBA(currentColors.textColor, 0.15)}
                    >
                      <Text style={[styles.uploadButtonText, { color: currentColors.textColor }]}>
                        Upload
                      </Text>
                    </GlassView>
                  ) : (
                    <View style={[styles.uploadButton, styles.uploadButtonFallback, { borderColor: currentColors.textColor }]}> 
                      <Text style={[styles.uploadButtonText, { color: currentColors.textColor }]}>
                        Upload
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Display Name Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: currentColors.textColor }]}>
                Display Name
              </Text>
              <TextInput
                style={[styles.textInput, {
                  color: currentColors.textColor,
                  backgroundColor: hexToRGBA(currentColors.textColor, INPUT_BACKGROUND_OPACITY),
                  borderColor: 'transparent',
                }]}
                value={editDisplayName}
                onChangeText={setEditDisplayName}
                placeholder="Enter display name"
                placeholderTextColor={hexToRGBA(currentColors.textColor, 0.5)}
                maxLength={64}
              />
            </View>

            {/* Bio Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: currentColors.textColor }]}>
                Bio
              </Text>
              <TextInput
                style={[styles.textArea, {
                  color: currentColors.textColor,
                  backgroundColor: hexToRGBA(currentColors.textColor, 0.05),
                  borderColor: 'transparent',
                }]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Tell us about yourself"
                placeholderTextColor={hexToRGBA(currentColors.textColor, 0.5)}
                multiline
                maxLength={256}
              />
            </View>

          </ScrollView>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
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
  saveButtonText: {
    fontFamily: 'Firma-Bold',
    fontSize: 17,
    color: Colors.black,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 0,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontFamily: 'Firma-Bold',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontFamily: 'Firma-Regular',
    fontSize: 14,
    marginBottom: 16,
  },
  avatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 112,
    height: 112,
    borderRadius: 56,
  },
  avatarText: {
    fontSize: 48,
  },
  uploadButton: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  uploadButtonFallback: {
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  uploadButtonText: {
    fontFamily: 'Firma-Bold',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  colorPickerScrollView: {
    marginHorizontal: -20,
  },
  colorPickerContainer: {
    paddingHorizontal: 20,
    gap: 8,
  },
  colorSquareContainer: {
    alignItems: 'center',
    justifyContent: 'center',
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
  backgroundSection: {
    flex: 3, // 75% of the space
  },
  textSection: {
    flex: 1, // 25% of the space
  },
  colorLabelContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    flexDirection: 'row',
  },
  colorLabel: {
    fontSize: 10,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  colorLabelIcon: {
    marginLeft: 2,
  },
  separatorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  separator: {
    width: 1.5,
    height: 35,
  },
  textInput: {
    fontFamily: 'Firma-Medium',
    fontSize: 16,
    borderWidth: 0,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
    minHeight: 48,
    textAlignVertical: 'center',
    backgroundColor: 'transparent',
  },
  textArea: {
    fontFamily: 'Firma-Medium',
    fontSize: 16,
    borderWidth: 0,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
    minHeight: 100,
    maxHeight: 220,
    textAlignVertical: 'top',
    backgroundColor: 'transparent',
  },
  colorPickerPlaceholder: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorPreview: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
});

export default EditProfileSheet;
