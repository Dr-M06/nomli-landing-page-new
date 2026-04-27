import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator
} from 'react-native';
import { MapPin, Navigation } from 'lucide-react-native';
import * as Location from '../utils/expoLocationStub';
import useLocation from '../hooks/useLocation';
import { getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing, Shadow } from '../constants/Theme';
import { useTheme } from '../contexts/ThemeContext';
import { log, warn, error } from '../utils/productionLogger';


interface LocationSuggestionInputProps {
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  placeholder?: string;
}

// Common location types people might use for events
const LOCATION_TYPES = [
  'café', 'restaurant', 'park', 'bar', 'museum', 'library', 
  'gallery', 'hotel', 'beach', 'gym', 'center', 'studio', 'hall'
];

export default function LocationSuggestionInput({
  value,
  onChangeText,
  error,
  placeholder = 'Enter event location'
}: LocationSuggestionInputProps) {
  const { location } = useLocation();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch current location address when location changes
  useEffect(() => {
    if (location) {
      getCurrentAddress();
    }
  }, [location]);

  // Get formatted address of user's current location
  const getCurrentAddress = async () => {
    if (!location) return;

    try {
      setIsLoading(true);
      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude: location.latitude,
        longitude: location.longitude
      });

      if ((reverseGeocode?.length || 0) > 0) {
        const address = reverseGeocode[0];
        const formattedAddress = [
          address.name,
          address.street,
          address.city,
          address.region,
          address.country
        ]
          .filter(Boolean)
          .join(', ');

        setCurrentAddress(formattedAddress);
      }
    } catch (error) {
      error('Error getting current address:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Search for location suggestions based on user input
  const searchPlaces = async (query: string) => {
    if (!query || (query?.length || 0) < 3) {
      setSuggestions([]);
      return;
    }

    try {
      setIsSearching(true);
      const geocodeResults = await Location.geocodeAsync(query);

      if ((geocodeResults?.length || 0) > 0) {
        // Get addresses for the geocode results
        const suggestions = await Promise.all(
          geocodeResults.slice(0, 5).map(async (result) => {
            const address = await Location.reverseGeocodeAsync({
              latitude: result.latitude,
              longitude: result.longitude
            });
            return {
              ...result,
              address: address[0]
            };
          })
        );

        setSuggestions(suggestions);
      } else {
        // If no geocode results, suggest places based on the current location
        if (location) {
          try {
            // Generate local suggestions based on types
            const suggestedTypes = LOCATION_TYPES.filter(type => 
              query.toLowerCase().includes(type) || type.includes(query.toLowerCase())
            );
            
            if ((suggestedTypes?.length || 0) > 0) {
              const nearbyResults = await Location.reverseGeocodeAsync({
                latitude: location.latitude,
                longitude: location.longitude
              });
              
              if ((nearbyResults?.length || 0) > 0) {
                const city = nearbyResults[0].city || nearbyResults[0].region;
                if (city) {
                  // Create suggestions based on the search term and current city
                  const localSuggestions = suggestedTypes.map(type => ({
                    id: `suggested-${type}`,
                    name: `${query} in ${city}`,
                    address: {
                      city,
                      region: nearbyResults[0].region,
                      country: nearbyResults[0].country
                    }
                  }));
                  setSuggestions(localSuggestions);
                }
              }
            } else {
              setSuggestions([]);
            }
          } catch (error) {
            error('Error generating local suggestions:', error);
            setSuggestions([]);
          }
        }
      }
    } catch (error) {
      error('Error searching places:', error);
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle input change
  const handleChangeText = (text: string) => {
    // Always update the parent state immediately to preserve user input
    onChangeText(text);
    
    // Clear any pending search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Clear suggestions if text is too short
    if ((text?.length || 0) < 3) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }
    
    // Debounce the search to avoid interfering with typing
    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(() => {
      searchPlaces(text);
    }, 500); // 500ms debounce
  };
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
    }
  };
  }, []);

  // Handle suggestion selection
  const handleSelectSuggestion = (suggestion: any) => {
    let formattedAddress = '';
    
    if (suggestion.address) {
      formattedAddress = [
        suggestion.name,
        suggestion.address.name,
        suggestion.address.street,
        suggestion.address.city,
        suggestion.address.region,
        suggestion.address.country
      ]
        .filter(Boolean)
        .join(', ');
    } else {
      formattedAddress = suggestion.name;
    }
    
    onChangeText(formattedAddress);
    setSuggestions([]);
  };

  // Use current location
  const useCurrentLocation = () => {
    if (currentAddress) {
      onChangeText(currentAddress);
      setSuggestions([]);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[
        styles.genZInputContainer,
        { 
          backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
          borderColor: error 
            ? themeColors.error.main 
            : isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
        }
      ]}>
        <MapPin size={20} color={themeColors.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={[styles.genZInput, { color: themeColors.text }]}
          value={value}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={themeColors.textSecondary}
        />
        {isSearching && (
          <ActivityIndicator size="small" color="#00D9FF" style={styles.loadingIndicator} />
        )}
      </View>

      {error ? <Text style={[styles.errorText, { color: themeColors.error.main }]}>{error}</Text> : null}

      {currentAddress && !value && (
        <TouchableOpacity 
          style={[
            styles.genZCurrentLocationButton,
            { 
              backgroundColor: isDarkMode ? 'rgba(0, 217, 255, 0.1)' : 'rgba(0, 217, 255, 0.08)',
              borderColor: 'rgba(0, 217, 255, 0.3)',
            }
          ]} 
          onPress={useCurrentLocation}
          activeOpacity={0.7}
        >
          <Navigation size={16} color="#00D9FF" strokeWidth={2.5} />
          <Text style={[styles.genZCurrentLocationText, { color: themeColors.text }]}>
            {isLoading ? 'Getting location...' : 'Use current location'}
          </Text>
        </TouchableOpacity>
      )}

      {(suggestions?.length || 0) > 0 && (
        <View style={[
          styles.genZSuggestionsContainer,
          { 
            backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
            borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
          }
        ]}>
          {suggestions.map((item, index) => (
    <TouchableOpacity
              key={`suggestion-${index}`}
              style={[
                styles.genZSuggestionItem,
                { borderBottomColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }
              ]}
      onPress={() => handleSelectSuggestion(item)}
              activeOpacity={0.7}
    >
              <MapPin size={16} color="#00D9FF" strokeWidth={2.5} />
      <View style={styles.suggestionContent}>
                <Text style={[styles.genZSuggestionName, { color: themeColors.text }]}>
                  {item.name}
                </Text>
        {item.address && (
                  <Text style={[styles.genZSuggestionAddress, { color: themeColors.textSecondary }]}>
            {[
              item.address.street,
              item.address.city,
              item.address.region,
              item.address.country
            ]
              .filter(Boolean)
              .join(', ')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.sm,
  },
  
  // Gen Z Input Container
  genZInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: Spacing.md + 2,
    paddingVertical: Spacing.sm + 2,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  genZInput: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: FontSizes.body,
  },
  loadingIndicator: {
    marginLeft: Spacing.sm,
  },
  
  // Error Text
  errorText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    marginTop: Spacing.xs - 2,
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  
  // Gen Z Current Location Button
  genZCurrentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  genZCurrentLocationText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  
  // Gen Z Suggestions Container
  genZSuggestionsContainer: {
    marginTop: Spacing.xs,
    borderWidth: 1.5,
    borderRadius: 16,
    maxHeight: 200,
    overflow: 'hidden',
  },
  genZSuggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
  },
  suggestionContent: {
    flex: 1,
  },
  genZSuggestionName: {
    fontSize: FontSizes.sm + 1,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  genZSuggestionAddress: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    marginTop: 2,
    letterSpacing: 0.1,
  },
}); 