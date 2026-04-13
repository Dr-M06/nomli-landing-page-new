import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TextInput
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Calendar, Clock, Megaphone } from 'lucide-react-native';
import { supabase } from '../../utils/supabase';
import { getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Spacing } from '../../constants/Theme';
import { useTheme } from '../../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import Input from '../../components/Input';
import Button from '../../components/Button';
import useAuth from '../../hooks/useAuth';
import useLocation from '../../hooks/useLocation';
import DateTimePicker from '@react-native-community/datetimepicker';
import { initializeEventAttendeesTable } from '../../utils/createEventAttendeesTable';
import { joinEvent } from '../../utils/eventActions';
import CategoryPicker from '../../components/CategoryPicker';
import EventImagePicker from '../../components/EventImagePicker';
import { setupEventCategories, EVENT_IMAGES, getImagesByCategory, EVENT_CATEGORIES } from '../../utils/eventCategories';
import LocationSuggestionInput from '../../components/LocationSuggestionInput';
import * as Location from 'expo-location';
import { uploadPostImage } from '../../utils/communityUtils';
import { OFFICIAL_ACCOUNT_ID } from '../../constants/ContactEmails';
import { log, warn, error } from '../../utils/productionLogger';


export default function CreateEventScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { location } = useLocation();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  const [postType, setPostType] = useState<'event' | 'ad'>('event'); // New: Event or Ad selector
  const [isAdminOrOfficial, setIsAdminOrOfficial] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [maxAttendees, setMaxAttendees] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [hasSetAdEndDate, setHasSetAdEndDate] = useState(false); // Track if user explicitly set ad end date
  
  const [titleError, setTitleError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [descriptionError, setDescriptionError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  
  const [creating, setCreating] = useState(false);
  
  // Check if user is admin or official account
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user?.id) {
        setCheckingAdmin(false);
        return;
      }
      
      try {
        // Check if user is official account
        const isOfficial = user.id === OFFICIAL_ACCOUNT_ID;
        
        if (isOfficial) {
          setIsAdminOrOfficial(true);
          setCheckingAdmin(false);
          return;
        }
        
        // Check if user is admin
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .maybeSingle();
        
        if (!error && profile) {
          setIsAdminOrOfficial(profile.is_admin === true);
        }
      } catch (error) {
        error('[CreateEventScreen] Error checking admin status:', error);
        setIsAdminOrOfficial(false);
      } finally {
        setCheckingAdmin(false);
      }
    };
    
    checkAdminStatus();
  }, [user?.id]);

  // Reset postType to 'event' if user is not admin/official and postType is 'ad'
  useEffect(() => {
    if (!checkingAdmin && !isAdminOrOfficial && postType === 'ad') {
      setPostType('event');
    }
  }, [isAdminOrOfficial, checkingAdmin, postType]);

  // Clear custom uploaded image if user is not admin/official (but keep bundled images)
  useEffect(() => {
    if (!checkingAdmin && !isAdminOrOfficial && imageUrl && imageUrl.startsWith('file://')) {
      setImageUrl(null);
    }
  }, [isAdminOrOfficial, checkingAdmin, imageUrl]);

  // Initialize event categories in the database
  useEffect(() => {
    setupEventCategories().then(success => {
      if (!success) {
        warn('Failed to set up event categories');
      }
    });
  }, []);
  
  // Auto-select ads category when post type is changed to 'ad'
  // Also reset the ad end date flag when switching types
  useEffect(() => {
    if (postType === 'ad') {
      // Only allow ad selection if user is admin or official account
      if (!isAdminOrOfficial) {
        setPostType('event');
        Alert.alert('Restricted', 'Only admins and the official account can create ads.');
        return;
      }
      
      const adsCategory = EVENT_CATEGORIES.find(cat => cat.id === 'ads');
      if (adsCategory) {
        setCategoryId('ads');
      }
    } else {
      // Reset ad-specific state when switching back to event
      setHasSetAdEndDate(false);
    }
  }, [postType, isAdminOrOfficial]);

  // Auto-select default image when category changes
  useEffect(() => {
    if (categoryId && !imageUrl) {
      const categoryImages = getImagesByCategory(categoryId);
      if ((categoryImages?.length || 0) > 0) {
        // Select the first image from the category
        setImageUrl(categoryImages[0].url);
      } else if ((EVENT_IMAGES?.length || 0) > 0) {
        // Fallback to first image from all images if no category-specific images
        setImageUrl(EVENT_IMAGES[0].url);
      }
    }
  }, [categoryId]);
  
  const validateForm = () => {
    let isValid = true;
    
    if (!title) {
      setTitleError(`${postType === 'ad' ? 'Ad' : 'Event'} title is required`);
      isValid = false;
    } else {
      setTitleError('');
    }
    
    // Location is only required for events, optional for ads
    if (postType === 'event' && !eventLocation) {
      setLocationError('Event location is required');
      isValid = false;
    } else {
      setLocationError('');
    }
    
    if (!description) {
      setDescriptionError(`${postType === 'ad' ? 'Ad' : 'Event'} description is required`);
      isValid = false;
    } else {
      setDescriptionError('');
    }
    
    if (!categoryId) {
      setCategoryError('Category is required');
      isValid = false;
    } else {
      setCategoryError('');
    }
    
    return isValid;
  };
  
  const handleCreateEvent = async () => {
    // Restrict ad creation to admin and official account only
    if (postType === 'ad' && !isAdminOrOfficial) {
      Alert.alert('Restricted', 'Only admins and the official account can create ads.');
      return;
    }
    if (!user) {
      router.push('/auth/signin');
      return;
    }
    
    if (!validateForm()) return;
    
    try {
      setCreating(true);
      
      // Format date and time
      // - Events: always use the selected date/time
      // - Ads: only use date if user explicitly set one (as end date)
      const formattedDate = postType === 'event' 
        ? selectedDate.toISOString().split('T')[0] 
        : (hasSetAdEndDate ? selectedDate.toISOString().split('T')[0] : null);
      const formattedTime = postType === 'event' 
        ? `${String(selectedTime.getHours()).padStart(2, '0')}:${String(selectedTime.getMinutes()).padStart(2, '0')}:00`
        : null; // Ads don't use time
      
      // Get the category name instead of the ID for the database
      const selectedCategory = EVENT_CATEGORIES.find(cat => cat.id === categoryId);
      const categoryName = selectedCategory ? selectedCategory.name : categoryId;
      
      // Geocode the event location to get coordinates (only if location is provided)
      let latitude: number | null = null;
      let longitude: number | null = null;
      
      if (eventLocation) {
        try {
          const geocodeResults = await Location.geocodeAsync(eventLocation);
          if (geocodeResults && geocodeResults.length > 0) {
            latitude = geocodeResults[0].latitude;
            longitude = geocodeResults[0].longitude;
            log(`Geocoded location: ${latitude}, ${longitude}`);
          }
        } catch (error) {
          warn('Error geocoding location:', error);
          // Continue without coordinates if geocoding fails
        }
      }
      
      // Upload custom image if it's a local file
      // Only admin/official accounts can upload custom images (for homescreen slider visibility)
      // Bundled/in-app images from EVENT_IMAGES are allowed for everyone
      let finalImageUrl = imageUrl;
      if (imageUrl && imageUrl.startsWith('file://')) {
        // Custom uploaded image - only allow for admin/official accounts
        if (!isAdminOrOfficial) {
          Alert.alert(
            'Restricted', 
            'Only admins and the official account can upload custom images for events. Please select an in-app image instead.'
          );
          finalImageUrl = null; // Remove custom image for non-admin users
        } else {
          log('Uploading custom image to Supabase...');
          const uploadedUrl = await uploadPostImage(imageUrl, user.id);
          if (uploadedUrl) {
            finalImageUrl = uploadedUrl;
            log('Image uploaded successfully:', uploadedUrl);
          } else {
            error('Failed to upload image, using original URL');
            // Continue with original URL if upload fails
          }
        }
      }
      // Bundled images (URLs from EVENT_IMAGES) are allowed for everyone - no restriction needed
      
      log(`Creating ${postType} with data:`, {
        title,
        description,
        location: eventLocation || null,
        latitude,
        longitude,
        category: categoryName,
        max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
        date: formattedDate,
        time: formattedTime,
        host_id: user.id,
        image_url: finalImageUrl,
        post_type: postType
      });
      
      // Event data - no content validation/flagging applied
      // Users can include social media handles, emails, phone numbers, URLs, etc.
      // Admins will manually review and flag content if needed
      const eventData: any = {
        title,
        description,
        location: eventLocation || null, // Optional for ads
        category: categoryName,
        max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
        host_id: user.id,
        image_url: finalImageUrl,
        post_type: postType // Store the type (event or ad)
      };
      
      // Only include date and time if they are provided (for events)
      if (formattedDate) {
        eventData.date = formattedDate;
      }
      if (formattedTime) {
        eventData.time = formattedTime;
      }
      
      // Add coordinates if available (only if database columns exist)
      if (latitude !== null && longitude !== null) {
        eventData.latitude = latitude;
        eventData.longitude = longitude;
      }
      
      const { data, error } = await supabase
        .from('events')
        .insert([eventData])
        .select()
        .single();
      
      if (error) {
        error('Supabase error creating event:', error);
        throw error;
      }
      
      log('Event created successfully:', data);
      
      // Automatically join the event as the creator
      if (data) {
        try {
          // Join the event using the utility function
          const result = await joinEvent(data.id, user.id);
            
          if (!result.success) {
            warn('Auto-join failed:', result.message);
          }
        } catch (joinErr) {
          error('Exception when joining event:', joinErr);
        }
        
        // Navigate to the events screen
        router.push('/(tabs)/events');
      }
    } catch (error) {
      error('Error creating event:', error);
      Alert.alert('Error', 'Failed to create the event. Please try again.');
    } finally {
      setCreating(false);
    }
  };
  
  const handleDateChange = (event, date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
      // For ads, track that the user explicitly set a date
      if (postType === 'ad') {
        setHasSetAdEndDate(true);
      }
    }
  };
  
  const handleTimeChange = (event, selectedTime) => {
    setShowTimePicker(false);
    if (selectedTime) {
      setSelectedTime(selectedTime);
    }
  };
  
  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };
  
  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };
  
  return (
    <SafeAreaView style={[GlobalStyles.safeArea, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView
        style={[GlobalStyles.container, { backgroundColor: themeColors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Header with Gradient */}
        <LinearGradient
          colors={isDarkMode ? ['#1e293b', '#0f172a'] : ['#FFFFFF', '#F8FAFC']}
          style={styles.headerGradient}
        >
          <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
              <ChevronLeft size={24} color={themeColors.text} strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>
            {postType === 'ad' ? 'Create Ad' : 'Create Event'}
          </Text>
          <View style={{ width: 32 }} />
        </View>
        </LinearGradient>
        
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { backgroundColor: themeColors.background }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Post Type Selector - Ad option only visible to admin/official account */}
          <View style={styles.typeSelectorContainer}>
            <TouchableOpacity
              style={[
                styles.typeSelectorButton,
                postType === 'event' && styles.typeSelectorButtonActive,
                {
                  backgroundColor: postType === 'event' 
                    ? (isDarkMode ? 'rgba(0, 217, 255, 0.15)' : 'rgba(0, 217, 255, 0.1)')
                    : (isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)'),
                  borderColor: postType === 'event' 
                    ? '#00D9FF' 
                    : (isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'),
                }
              ]}
              onPress={() => setPostType('event')}
              activeOpacity={0.7}
            >
              <Calendar size={18} color={postType === 'event' ? '#00D9FF' : themeColors.textSecondary} strokeWidth={2.5} />
              <Text style={[
                styles.typeSelectorText,
                { color: postType === 'event' ? '#00D9FF' : themeColors.textSecondary }
              ]}>
                Event
              </Text>
            </TouchableOpacity>
            
            {/* Only show Ad option if user is admin or official account */}
            {isAdminOrOfficial && (
              <TouchableOpacity
                style={[
                  styles.typeSelectorButton,
                  postType === 'ad' && styles.typeSelectorButtonActive,
                  {
                    backgroundColor: postType === 'ad' 
                      ? (isDarkMode ? 'rgba(167, 139, 250, 0.15)' : 'rgba(167, 139, 250, 0.1)')
                      : (isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)'),
                    borderColor: postType === 'ad' 
                      ? '#A78BFA' 
                      : (isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'),
                  }
                ]}
                onPress={() => setPostType('ad')}
                activeOpacity={0.7}
              >
                <Megaphone size={18} color={postType === 'ad' ? '#A78BFA' : themeColors.textSecondary} strokeWidth={2.5} />
                <Text style={[
                  styles.typeSelectorText,
                  { color: postType === 'ad' ? '#A78BFA' : themeColors.textSecondary }
                ]}>
                  Ad
                </Text>
              </TouchableOpacity>
            )}
          </View>
          
          {/* Title Input */}
          <TextInput
            style={[
              styles.genZInput,
              { 
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                borderColor: titleError 
                  ? themeColors.error.main 
                  : isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                color: themeColors.text
              }
            ]}
            placeholder={postType === 'ad' ? 'Ad title' : 'Event title'}
            placeholderTextColor={themeColors.textSecondary}
            value={title}
            onChangeText={setTitle}
          />
          {titleError ? <Text style={[styles.errorText, { color: themeColors.error.main }]}>{titleError}</Text> : null}
          
          {/* Location Input - Optional for ads */}
          <LocationSuggestionInput
            value={eventLocation}
            onChangeText={setEventLocation}
            error={locationError}
            placeholder={postType === 'ad' ? 'Location (optional)' : 'Where is this happening?'}
          />
          {postType === 'ad' && (
            <Text style={[styles.optionalHint, { color: themeColors.textSecondary }]}>
              Optional - Leave blank for ads without location
            </Text>
          )}
          
          {/* Category Chips */}
          <View style={styles.categorySection}>
            <CategoryPicker 
              selectedCategory={categoryId}
              onSelectCategory={setCategoryId}
            />
            {categoryError ? <Text style={[styles.errorText, { color: themeColors.error.main }]}>{categoryError}</Text> : null}
          </View>
          
          {/* Image Picker - Visible to everyone (bundled images allowed), but custom upload restricted to admin/official */}
          <EventImagePicker
            selectedImage={imageUrl}
            selectedCategory={categoryId}
            onSelectImage={setImageUrl}
          />
          
          {/* Date & Time Buttons - Optional for ads */}
          {postType === 'event' ? (
            <View style={styles.dateTimeContainer}>
              <TouchableOpacity 
                style={[
                  styles.genZDateTimeButton, 
                  { 
                    backgroundColor: isDarkMode ? 'rgba(0, 217, 255, 0.1)' : 'rgba(0, 217, 255, 0.08)',
                    borderColor: 'rgba(0, 217, 255, 0.3)',
                  }
                ]}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Calendar size={18} color="#00D9FF" strokeWidth={2.5} />
                <Text style={[styles.genZDateTimeText, { color: themeColors.text }]}>
                  {formatDate(selectedDate)}
                </Text>
              </TouchableOpacity>
            
              <TouchableOpacity 
                style={[
                  styles.genZDateTimeButton, 
                  { 
                    backgroundColor: isDarkMode ? 'rgba(167, 139, 250, 0.1)' : 'rgba(167, 139, 250, 0.08)',
                    borderColor: 'rgba(167, 139, 250, 0.3)',
                  }
                ]}
                onPress={() => setShowTimePicker(true)}
                activeOpacity={0.7}
              >
                <Clock size={18} color="#A78BFA" strokeWidth={2.5} />
                <Text style={[styles.genZDateTimeText, { color: themeColors.text }]}>
                  {formatTime(selectedTime)}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Ad End Date Section */}
              <View style={styles.adEndDateSection}>
                <Text style={[styles.adEndDateLabel, { color: themeColors.textSecondary }]}>
                  Ad End Date (optional)
                </Text>
                <Text style={[styles.adEndDateHint, { color: themeColors.textSecondary }]}>
                  {hasSetAdEndDate 
                    ? 'Ad will stop showing after this date'
                    : 'Tap to set an end date, or leave to run indefinitely'}
                </Text>
              </View>
              <View style={styles.dateTimeContainer}>
                <TouchableOpacity 
                  style={[
                    styles.genZDateTimeButton, 
                    styles.adEndDateButton,
                    { 
                      backgroundColor: hasSetAdEndDate 
                        ? (isDarkMode ? 'rgba(167, 139, 250, 0.1)' : 'rgba(167, 139, 250, 0.08)')
                        : (isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)'),
                      borderColor: hasSetAdEndDate 
                        ? 'rgba(167, 139, 250, 0.3)'
                        : (isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'),
                    }
                  ]}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <Calendar size={18} color={hasSetAdEndDate ? '#A78BFA' : themeColors.textSecondary} strokeWidth={2.5} />
                  <Text style={[styles.genZDateTimeText, { color: hasSetAdEndDate ? themeColors.text : themeColors.textSecondary }]}>
                    {hasSetAdEndDate ? `Ends ${formatDate(selectedDate)}` : 'No end date'}
                  </Text>
                </TouchableOpacity>
              
                {hasSetAdEndDate && (
                  <TouchableOpacity 
                    style={[
                      styles.genZDateTimeButton, 
                      styles.clearEndDateButton,
                      { 
                        backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                        borderColor: 'rgba(239, 68, 68, 0.3)',
                      }
                    ]}
                    onPress={() => setHasSetAdEndDate(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.genZDateTimeText, { color: '#EF4444' }]}>
                      Clear
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
          
          {/* Description Input */}
          <TextInput
            style={[
              styles.genZInput,
              styles.genZTextArea,
              { 
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                borderColor: descriptionError 
                  ? themeColors.error.main 
                  : isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                color: themeColors.text
              }
            ]}
            placeholder={postType === 'ad' ? "What's this ad about?" : "What's this event about?"}
            placeholderTextColor={themeColors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          {descriptionError ? <Text style={[styles.errorText, { color: themeColors.error.main }]}>{descriptionError}</Text> : null}
          
          {/* Optional Max Attendees */}
          <View 
            style={[
              styles.genZOptionalField, 
              { 
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.015)',
                borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
              }
            ]}
          >
            <Text style={[styles.genZOptionalLabel, { color: themeColors.textSecondary }]}>
              Max attendees (optional)
            </Text>
            <TextInput
              style={[styles.genZOptionalInput, { color: themeColors.text }]}
              placeholder="∞"
              value={maxAttendees}
              onChangeText={setMaxAttendees}
              keyboardType="numeric"
              placeholderTextColor={themeColors.textSecondary}
          />
          </View>
          
          {/* Create Button with Gradient */}
          <TouchableOpacity
            style={styles.genZCreateButton}
            onPress={handleCreateEvent}
            disabled={creating}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#00D9FF', '#A78BFA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.genZCreateButtonGradient}
            >
              <Text style={styles.genZCreateButtonText}>
                {creating ? 'Creating...' : postType === 'ad' ? 'Create Ad' : 'Create Event'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
        
        {/* Date/Time Pickers */}
        {showDatePicker && (
          <View style={Platform.OS === 'ios' ? { 
            backgroundColor: isDarkMode ? 'rgba(20, 20, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderRadius: 16,
            padding: 8
          } : undefined}>
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleDateChange}
              minimumDate={new Date()}
              themeVariant={Platform.OS === 'ios' ? (isDarkMode ? 'dark' : 'light') : undefined}
              textColor={Platform.OS === 'android' ? themeColors.text : undefined}
              accentColor="#00D9FF"
            />
          </View>
        )}
        
        {showTimePicker && (
          <View style={Platform.OS === 'ios' ? { 
            backgroundColor: isDarkMode ? 'rgba(20, 20, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderRadius: 16,
            padding: 8
          } : undefined}>
            <DateTimePicker
              value={selectedTime}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleTimeChange}
              themeVariant={Platform.OS === 'ios' ? (isDarkMode ? 'dark' : 'light') : undefined}
              textColor={Platform.OS === 'android' ? themeColors.text : undefined}
              accentColor="#00D9FF"
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerGradient: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md + 2,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingTop: Spacing.md,
  },
  
  // Gen Z Input Styles
  genZInput: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md + 2,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    marginBottom: Spacing.sm,
  },
  genZTextArea: {
    minHeight: 100,
    paddingTop: Spacing.md,
  },
  
  // Category Section
  categorySection: {
    marginBottom: Spacing.md,
  },
  
  // Gen Z Date/Time Buttons
  dateTimeContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  genZDateTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  genZDateTimeText: {
    fontSize: FontSizes.sm + 1,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  
  // Gen Z Optional Field
  genZOptionalField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md + 2,
    marginBottom: Spacing.lg,
  },
  genZOptionalLabel: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
    letterSpacing: 0.2,
  },
  genZOptionalInput: {
    flex: 1,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    textAlign: 'right',
    marginLeft: Spacing.sm,
  },
  
  // Gen Z Create Button
  genZCreateButton: {
    marginTop: Spacing.sm,
    borderRadius: 16,
    overflow: 'hidden',
  },
  genZCreateButtonGradient: {
    paddingVertical: Spacing.md + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genZCreateButtonText: {
    fontSize: FontSizes.body + 1,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  
  // Error Text
  errorText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  
  // Type Selector
  typeSelectorContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  typeSelectorButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  typeSelectorButtonActive: {
    // Active state handled by inline styles
  },
  typeSelectorText: {
    fontSize: FontSizes.sm + 1,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  
  // Optional Hint
  optionalHint: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
    fontStyle: 'italic',
  },
  
  // Ad End Date Section
  adEndDateSection: {
    marginBottom: Spacing.sm,
  },
  adEndDateLabel: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    marginBottom: 4,
  },
  adEndDateHint: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  adEndDateButton: {
    flex: 1,
  },
  clearEndDateButton: {
    flex: 0,
  },
  
  // Image Restriction Notice
  imageRestrictionNotice: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  imageRestrictionText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    lineHeight: 20,
    textAlign: 'center',
  },
});