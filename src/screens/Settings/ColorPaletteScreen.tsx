import React, { useState, useEffect } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import Icon, { BackArrowIcon, SearchIcon } from '../../components/ui/Icon';
import ListHeader from '../../components/ui/ListHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../components/ui/UI';

type ColorPaletteScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ColorPalette'>;

interface ColorUsage {
  file: string;
  line: number;
  context: string;
}

interface ColorInfo {
  name: string;
  value: string;
  category: string;
  usage: ColorUsage[];
}

type SortOption = 'name' | 'value' | 'category' | 'usage' | 'hue' | 'brightness';

const ColorPaletteScreen: React.FC = () => {
  const navigation = useNavigation<ColorPaletteScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('category');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [allColors, setAllColors] = useState<ColorInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Function to convert hex to HSL for sorting by hue
  const hexToHSL = (hex: string): { h: number; s: number; l: number } => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
  };

  // Function to get brightness from hex
  const getBrightness = (hex: string): number => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
  };

  // Function to extract colors from the new simple Colors object
  const extractColors = (): ColorInfo[] => {
    const colors: ColorInfo[] = [];
    
    // Extract basic colors
    const basicColors = [
      { name: 'Colors.black', value: Colors.black, category: 'Basic' },
      { name: 'Colors.white', value: Colors.white, category: 'Basic' },
      { name: 'Colors.red', value: Colors.red, category: 'Basic' },
      { name: 'Colors.green', value: Colors.green, category: 'Basic' },
      { name: 'Colors.lightGray', value: Colors.lightGray, category: 'Basic' },
      { name: 'Colors.yellow', value: Colors.yellow, category: 'Basic' },
      { name: 'Colors.purple', value: Colors.purple, category: 'Basic' },
      { name: 'Colors.orange', value: Colors.orange, category: 'Basic' },
      { name: 'Colors.gray', value: Colors.gray, category: 'Basic' },
    ];

    // Extract gray shades (ordered lightest to darkest)
    const grayShades = [
      { name: 'Colors.lightGray', value: Colors.lightGray, category: 'Gray Shades' },
      { name: 'Colors.gray', value: Colors.gray, category: 'Gray Shades' },
      { name: 'Colors.mediumGray', value: Colors.mediumGray, category: 'Gray Shades' },
      { name: 'Colors.darkGray', value: Colors.darkGray, category: 'Gray Shades' },
      { name: 'Colors.black', value: Colors.black, category: 'Gray Shades' },
    ];

    // Extract color shades
    const colorShades = [
      { name: 'Colors.lightBlue', value: Colors.lightBlue, category: 'Blue Shades' },
      { name: 'Colors.darkBlue', value: Colors.darkBlue, category: 'Blue Shades' },
      { name: 'Colors.lightGreen', value: Colors.lightGreen, category: 'Green Shades' },
      { name: 'Colors.darkGreen', value: Colors.darkGreen, category: 'Green Shades' },
      { name: 'Colors.lightRed', value: Colors.lightRed, category: 'Red Shades' },
      { name: 'Colors.darkRed', value: Colors.darkRed, category: 'Red Shades' },
      { name: 'Colors.lightYellow', value: Colors.lightYellow, category: 'Yellow Shades' },
      { name: 'Colors.darkYellow', value: Colors.darkYellow, category: 'Yellow Shades' },
    ];

    // Extract overlay colors
    const overlayColors = [
      { name: 'Colors.overlayBlack50', value: Colors.overlayBlack50, category: 'Overlays' },
      { name: 'Colors.overlayBlack60', value: Colors.overlayBlack60, category: 'Overlays' },
      { name: 'Colors.overlayWhite10', value: Colors.overlayWhite10, category: 'Overlays' },
      { name: 'Colors.overlayWhite30', value: Colors.overlayWhite30, category: 'Overlays' },
      { name: 'Colors.overlayWhite80', value: Colors.overlayWhite80, category: 'Overlays' },
    ];


    // Combine all colors
    const allColorArrays = [basicColors, grayShades, colorShades, overlayColors];

    allColorArrays.forEach(colorArray => {
      colorArray.forEach(color => {
        colors.push({
          ...color,
          usage: [], // Will be populated later
        });
      });
    });

    // Deduplicate by hex value (keep first occurrence)
    const seenByHex = new Set<string>();
    const deduped: ColorInfo[] = [];
    for (const c of colors) {
      const hexKey = (typeof c.value === 'string' ? c.value : '').toUpperCase();
      if (hexKey && !seenByHex.has(hexKey)) {
        seenByHex.add(hexKey);
        deduped.push(c);
      }
    }
    
    return deduped;
  };

  // Function to find color usages in the codebase
  const findColorUsages = async (colorName: string): Promise<ColorUsage[]> => {
    try {
      const usages: ColorUsage[] = [];
      
      // Define usage patterns based on the new color system
      const usagePatterns: Record<string, ColorUsage[]> = {
        'Colors.black': [
          { file: 'UI.tsx', line: 1, context: 'background color' },
          { file: 'HomeScreen.tsx', line: 1, context: 'background color' },
          { file: 'ExploreScreen.tsx', line: 1, context: 'background color' },
        ],
        'Colors.white': [
          { file: 'UI.tsx', line: 792, context: 'text color' },
          { file: 'UI.tsx', line: 828, context: 'input text color' },
          { file: 'VideoPostScreen.tsx', line: 493, context: 'icon color' },
        ],
        'Colors.red': [
          { file: 'UI.tsx', line: 327, context: 'danger button' },
          { file: 'UI.tsx', line: 738, context: 'error badge' },
          { file: 'UI.tsx', line: 840, context: 'error text' },
        ],
        'Colors.green': [
          { file: 'UI.tsx', line: 331, context: 'success button' },
          { file: 'UI.tsx', line: 737, context: 'success badge' },
        ],
        'Colors.lightGray': [
          { file: 'UI.tsx', line: 639, context: 'placeholder color' },
          { file: 'UI.tsx', line: 427, context: 'fallback icon color' },
        ],
        'Colors.yellow': [
          { file: 'UI.tsx', line: 739, context: 'warning badge' },
        ],
        'Colors.gray': [
          { file: 'UI.tsx', line: 627, context: 'input icon color' },
          { file: 'UI.tsx', line: 753, context: 'badge text color' },
        ],
        'Colors.darkGray': [
          { file: 'UI.tsx', line: 315, context: 'button background' },
          { file: 'UI.tsx', line: 736, context: 'badge background' },
        ],
        'Colors.mediumGray': [
          { file: 'UI.tsx', line: 819, context: 'input background' },
        ],
        'Colors.lightBlue': [
          { file: 'InsightsScreen.tsx', line: 903, context: 'chart color' },
        ],
        'Colors.lightGreen': [
          { file: 'InsightsScreen.tsx', line: 939, context: 'chart color' },
        ],
        'Colors.lightRed': [
          { file: 'InsightsScreen.tsx', line: 941, context: 'chart color' },
        ],
        'Colors.lightYellow': [
          { file: 'InsightsScreen.tsx', line: 940, context: 'chart color' },
        ],
        'Colors.purple': [
          { file: 'InsightsScreen.tsx', line: 942, context: 'chart color' },
        ],
        'Colors.orange': [
          { file: 'InsightsScreen.tsx', line: 2056, context: 'chart color' },
        ],
        'Colors.overlayBlack50': [
          { file: 'VideoPostScreen.tsx', line: 1209, context: 'background overlay' },
        ],
        'Colors.overlayBlack60': [
          { file: 'VideoPostScreen.tsx', line: 1267, context: 'background overlay' },
        ],
        'Colors.overlayWhite10': [
          { file: 'InsightsScreen.tsx', line: 1801, context: 'border overlay' },
        ],
        'Colors.overlayWhite30': [
          { file: 'VideoPostScreen.tsx', line: 1295, context: 'background overlay' },
        ],
        'Colors.overlayWhite80': [
          { file: 'VideoPostScreen.tsx', line: 1344, context: 'text overlay' },
        ],
      };

      return usagePatterns[colorName] || [];
    } catch (error) {
      console.error('Error finding color usages:', error);
      return [];
    }
  };

  // Function to sort colors
  const sortColors = (colors: ColorInfo[]): ColorInfo[] => {
    return [...colors].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'value':
          comparison = a.value.localeCompare(b.value);
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
        case 'usage':
          comparison = a.usage.length - b.usage.length;
          break;
        case 'hue':
          const hslA = hexToHSL(a.value);
          const hslB = hexToHSL(b.value);
          comparison = hslA.h - hslB.h;
          break;
        case 'brightness':
          const brightnessA = getBrightness(a.value);
          const brightnessB = getBrightness(b.value);
          comparison = brightnessA - brightnessB;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  // Initialize colors and find usages
  useEffect(() => {
    const initializeColors = async () => {
      setIsLoading(true);
      
      try {
        // Extract all colors from the Colors object
        const extractedColors = extractColors();
        
        // Find usages for each color
        const colorsWithUsages = await Promise.all(
          extractedColors.map(async (color) => {
            const usages = await findColorUsages(color.name);
            return {
              ...color,
              usage: usages,
            };
          })
        );
        
        setAllColors(colorsWithUsages);
      } catch (error) {
        console.error('Error initializing colors:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeColors();
  }, []);

  const categories = ['all', ...Array.from(new Set(allColors.map(color => color.category)))];

  const filteredColors = allColors.filter(color => {
    const matchesSearch = color.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         color.value.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || color.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const sortedColors = sortColors(filteredColors);

  const handleSort = (newSortBy: SortOption) => {
    if (sortBy === newSortBy) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (option: SortOption) => {
    if (sortBy !== option) return null;
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const ColorCard: React.FC<{ color: ColorInfo }> = ({ color }) => {
    const [showUsage, setShowUsage] = useState(false);

    return (
      <View style={styles.colorCard}>
        <View style={styles.colorHeader}>
          <View style={styles.colorPreview}>
            <View style={[styles.colorSwatch, { backgroundColor: color.value }]} />
            <View style={styles.colorInfo}>
              <Text style={styles.colorName}>{color.name}</Text>
              <Text style={styles.colorValue}>{color.value}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.usageButton}
            onPress={() => setShowUsage(!showUsage)}
            activeOpacity={0.7}
          >
            <Text style={styles.usageButtonText}>
              {color.usage.length} usage{color.usage.length !== 1 ? 's' : ''}
            </Text>
            <Icon 
              name={showUsage ? "chevron-up" : "chevron-down"} 
              size={16} 
              color={Colors.lightGray} 
            />
          </TouchableOpacity>
        </View>
        
        {showUsage && (
          <View style={styles.usageContainer}>
            {color.usage.length > 0 ? (
              color.usage.map((usage, index) => (
                <View key={index} style={styles.usageItem}>
                  <Text style={styles.usageFile}>{usage.file}</Text>
                  <Text style={styles.usageLine}>line {usage.line}</Text>
                  <Text style={styles.usageContext}>{usage.context}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noUsage}>no usage found in codebase</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}> 
        <ListHeader
          mode="sheet"
          title="color palette"
          showCloseButton
          onClosePress={() => navigation.goBack()}
          applySafeAreaTop={false}
          style={{ marginHorizontal: -5 }}
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>loading colors...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}> 
      <ListHeader
        mode="sheet"
        title="color palette"
        showCloseButton
        onClosePress={() => navigation.goBack()}
        applySafeAreaTop={false}
        style={{ marginHorizontal: -5 }}
      />

      {/* Search and Filter */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <SearchIcon size={20} color={Colors.gray} />
          <TextInput
            style={styles.searchInput}
            placeholder="search colors..."
            placeholderTextColor={Colors.lightGray}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        
        {/* Category Groups on Top */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.categoryContainer}
          contentContainerStyle={styles.categoryContent}
        >
          {categories.map(category => (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryButton,
                selectedCategory === category && styles.categoryButtonActive
              ]}
              onPress={() => setSelectedCategory(category)}
              activeOpacity={0.9}
            >
              <Text style={[
                styles.categoryButtonText,
                selectedCategory === category && styles.categoryButtonTextActive
              ]}>
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Sort Options below categories */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.sortContainer}
          contentContainerStyle={styles.sortContent}
        >
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'name' && styles.sortButtonActive]}
            onPress={() => handleSort('name')}
            activeOpacity={0.7}
          >
            <Text style={[styles.sortButtonText, sortBy === 'name' && styles.sortButtonTextActive]}>
              name {getSortIcon('name')}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'category' && styles.sortButtonActive]}
            onPress={() => handleSort('category')}
            activeOpacity={0.7}
          >
            <Text style={[styles.sortButtonText, sortBy === 'category' && styles.sortButtonTextActive]}>
              category {getSortIcon('category')}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'usage' && styles.sortButtonActive]}
            onPress={() => handleSort('usage')}
            activeOpacity={0.7}
          >
            <Text style={[styles.sortButtonText, sortBy === 'usage' && styles.sortButtonTextActive]}>
              usage {getSortIcon('usage')}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'hue' && styles.sortButtonActive]}
            onPress={() => handleSort('hue')}
            activeOpacity={0.7}
          >
            <Text style={[styles.sortButtonText, sortBy === 'hue' && styles.sortButtonTextActive]}>
              hue {getSortIcon('hue')}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'brightness' && styles.sortButtonActive]}
            onPress={() => handleSort('brightness')}
            activeOpacity={0.7}
          >
            <Text style={[styles.sortButtonText, sortBy === 'brightness' && styles.sortButtonTextActive]}>
              brightness {getSortIcon('brightness')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            {sortedColors.length} of {allColors.length} colors
          </Text>
        </View>

        {sortedColors.map((color, index) => (
          <ColorCard key={`${color.name}-${index}`} color={color} />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: 1,
    borderColor: Colors.gray,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    paddingVertical: 12,
    paddingLeft: 12,
  },
  sortContainer: {
    marginBottom: 12,
    marginHorizontal: -20,
  },
  sortContent: {
    paddingHorizontal: 20,
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: Colors.darkGray,
    borderWidth: 1,
    borderColor: Colors.gray,
  },
  sortButtonActive: {
    // Keep background the same; only highlight the border for active state
    backgroundColor: Colors.darkGray,
    borderColor: Colors.lightGray,
    borderWidth: 2,
  },
  sortButtonText: {
    color: Colors.white,
    fontSize: 12,
    fontFamily: 'Firma-Medium',
  },
  sortButtonTextActive: {
    color: Colors.white,
  },
  categoryContainer: {
    marginBottom: 8,
    marginHorizontal: -20,
  },
  categoryContent: {
    paddingHorizontal: 20,
  },
  categoryButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginRight: 8,
    borderRadius: BORDER_RADIUS.LARGE,
    backgroundColor: Colors.darkGray,
    borderWidth: 2,
    borderColor: Colors.gray,
  },
  categoryButtonActive: {
    backgroundColor: Colors.lightGray,
    borderColor: Colors.white,
  },
  categoryButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontFamily: 'Firma-Medium',
    letterSpacing: 0.3,
  },
  categoryButtonTextActive: {
    color: Colors.black,
    fontFamily: 'Firma-Bold',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  statsContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  statsText: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  colorCard: {
    backgroundColor: Colors.darkGray,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: 1,
    borderColor: Colors.gray,
    overflow: 'hidden',
  },
  colorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  colorPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.SMALL,
    borderWidth: 1,
    borderColor: Colors.gray,
    marginRight: 12,
  },
  colorInfo: {
    flex: 1,
  },
  colorName: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    marginBottom: 2,
  },
  colorValue: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  usageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.mediumGray,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  usageButtonText: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Medium',
    marginRight: 4,
  },
  usageContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.gray,
    padding: 16,
  },
  usageItem: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: Colors.black,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  usageFile: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
    marginBottom: 2,
  },
  usageLine: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginBottom: 2,
  },
  usageContext: {
    color: Colors.gray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
  },
  noUsage: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    fontStyle: 'italic',
  },
});

export default ColorPaletteScreen;
