import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { useTheme } from '../contexts/ThemeContext';
import { EVENT_CATEGORIES } from '../utils/eventCategories';

interface CategoryPickerProps {
  selectedCategory: string | null;
  onSelectCategory: (category: string) => void;
}

const { width: screenWidth } = Dimensions.get('window');

export default function CategoryPicker({ selectedCategory, onSelectCategory }: CategoryPickerProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);

  const renderCategoryItem = ({ item }: { item: typeof EVENT_CATEGORIES[0] }) => {
    const isSelected = selectedCategory === item.id;
    
    return (
      <TouchableOpacity
        onPress={() => onSelectCategory(item.id)}
        activeOpacity={0.7}
        style={styles.categoryChip}
      >
        {isSelected ? (
          <LinearGradient
            colors={[item.color, item.color + 'DD']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.selectedChip}
          >
            <Text style={styles.categoryEmoji}>{item.icon}</Text>
            <Text style={styles.selectedChipText}>{item.name}</Text>
          </LinearGradient>
        ) : (
          <View style={[
            styles.unselectedChip,
            { 
              backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
              borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
            }
          ]}>
            <Text style={styles.categoryEmoji}>{item.icon}</Text>
            <Text style={[
              styles.unselectedChipText,
              { color: themeColors.text }
            ]}>
          {item.name}
        </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };



  return (
    <View style={styles.container}>
      <FlatList
        data={EVENT_CATEGORIES}
        renderItem={renderCategoryItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesList}
        ItemSeparatorComponent={() => <View style={{ width: Spacing.sm }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  categoriesList: {
    paddingVertical: Spacing.xs,
    paddingRight: Spacing.md,
  },
  categoryChip: {
    marginRight: Spacing.sm,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: Spacing.xs + 4,
    borderRadius: 20,
    gap: Spacing.xs - 2,
  },
  unselectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: Spacing.xs + 4,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: Spacing.xs - 2,
  },
  categoryEmoji: {
    fontSize: 16,
  },
  selectedChipText: {
    fontSize: FontSizes.sm - 1,
    fontFamily: FontFamily.semibold,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  unselectedChipText: {
    fontSize: FontSizes.sm - 1,
    fontFamily: FontFamily.medium,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
}); 