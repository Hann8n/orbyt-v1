import React, { memo, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../ui/UI';
import { hexToRGBA } from '../../../utils/formatting/colorUtils';

export interface ProfileColorOption {
  id: string;
  backgroundColor: string;
  textColor: string;
  label: string;
}

interface ProfileColorPickerProps {
  selectedColorId: string;
  onColorSelect: (colorOption: ProfileColorOption) => void;
  defaultColors?: {
    backgroundColor: string;
    textColor: string;
  };
  textColor: string;
  backgroundColor: string;
  onSave?: () => void;
  onCancel?: () => void;
  isSaving?: boolean;
  selectedColorType?: 'background' | 'text';
  onColorTypeSelect?: (colorType: 'background' | 'text') => void;
}

const ProfileColorPicker: React.FC<ProfileColorPickerProps> = memo(({
  selectedColorId,
  onColorSelect,
  defaultColors,
  textColor,
  backgroundColor,
  onSave,
  onCancel,
  isSaving = false,
  selectedColorType = 'background',
  onColorTypeSelect,
}) => {
  // Predefined color options from UI.tsx
  const predefinedColors: ProfileColorOption[] = useMemo(() => [
    // Default colors (extracted from avatar) - will be first option
    {
      id: 'default',
      backgroundColor: defaultColors?.backgroundColor || '#000000',
      textColor: defaultColors?.textColor || '#FFFFFF',
      label: 'Default',
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
  ], [defaultColors]);

  const handleColorPress = (colorOption: ProfileColorOption) => {
    onColorSelect(colorOption);
  };

  const handleColorSquarePress = (colorOption: ProfileColorOption, colorType: 'background' | 'text') => {
    // First select the color option
    onColorSelect(colorOption);
    // Then select the color type (background or text)
    onColorTypeSelect?.(colorType);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* Save/Cancel Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={onCancel}
            activeOpacity={0.7}
          >
            <Text style={[styles.buttonText, { color: textColor }]}>Cancel</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.button, 
              styles.saveButton,
              { opacity: isSaving ? 0.6 : 1 }
            ]}
            onPress={onSave}
            activeOpacity={0.7}
            disabled={isSaving}
          >
            <Text style={[
              styles.buttonText, 
              { color: backgroundColor }
            ]}>
              {isSaving ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Color Picker */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          style={[styles.scrollView, { marginHorizontal: -20 }]}
        >
                  {predefinedColors.map((colorOption) => {
          const isSelected = selectedColorId === colorOption.id;
          
          // Render separator
          if (colorOption.id === 'separator') {
            return (
              <View key={colorOption.id} style={styles.separatorContainer}>
                <View style={styles.separator} />
              </View>
            );
          }
          
          return (
            <View key={colorOption.id} style={styles.colorSquareContainer}>
              <TouchableOpacity
                style={[
                  styles.colorSquare,
                  {
                    borderColor: isSelected ? textColor : 'transparent',
                    borderWidth: isSelected ? 3 : 0,
                  },
                ]}
                onPress={() => handleColorPress(colorOption)}
                activeOpacity={0.7}
              >
                {/* Background color section (75%) */}
                <TouchableOpacity
                  style={[
                    styles.colorSection,
                    styles.backgroundSection,
                    { backgroundColor: colorOption.backgroundColor }
                  ]}
                  onPress={() => handleColorSquarePress(colorOption, 'background')}
                  activeOpacity={0.8}
                />
                
                {/* Text color section (25%) */}
                <TouchableOpacity
                  style={[
                    styles.colorSection,
                    styles.textSection,
                    { backgroundColor: colorOption.textColor }
                  ]}
                  onPress={() => handleColorSquarePress(colorOption, 'text')}
                  activeOpacity={0.8}
                />
              </TouchableOpacity>
            </View>
          );
        })}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: Colors.black,
  },
  container: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: Colors.black,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    width: '100%',
  },
  button: {
    borderRadius: 22, // BORDER_RADIUS.FULL equivalent
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    alignSelf: 'center',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 90,
    height: 44,
  },
  saveButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 90,
    height: 44,
  },
  buttonText: {
    fontFamily: 'Firma-Bold',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 17,
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingLeft: 20,
    paddingRight: 20,
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
  separatorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  separator: {
    width: 1.5,
    height: 35,
    backgroundColor: Colors.lightGray,
  },
});

export default ProfileColorPicker;
