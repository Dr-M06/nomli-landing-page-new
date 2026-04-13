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
  ActivityIndicator
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, CalendarClock, MapPin, AlignLeft, Tag, Users } from 'lucide-react-native';
import { supabase } from '../../../utils/supabase';
import { Colors, getThemeColors } from '../../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Spacing } from '../../../constants/Theme';
import { useTheme } from '../../../contexts/ThemeContext';
import Input from '../../../components/Input';
import Button from '../../../components/Button';
import useAuth from '../../../hooks/useAuth';
import DateTimePicker from '@react-native-community/datetimepicker';
import EventImagePicker from '../../../components/EventImagePicker';
import CategoryPicker from '../../../components/CategoryPicker';
import { uploadPostImage } from '../../../utils/communityUtils';
import { EVENT_CATEGORIES } from '../../../utils/eventCategories';
import { OFFICIAL_ACCOUNT_ID } from '../../../constants/ContactEmails';
import { log, warn, error } from '../../../utils/productionLogger';


export default function EditEventScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isLoaded: authLoaded } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isAdminOrOfficial, setIsAdminOrOfficial] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  
  const [postType, setPostType] = useState<'event' | 'ad'>('event'); // Track if this is an event or ad
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [category, setCategory] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [maxAttendees, setMaxAttendees] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [hasAdEndDate, setHasAdEndDate] = useState(false); // Track if ad has an end date
  
  const [titleError, setTitleError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [descriptionError, setDescriptionError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  
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
        error('[EditEventScreen] Error checking admin status:', error);
        setIsAdminOrOfficial(false);
      } finally {
        setCheckingAdmin(false);
      }
    };
    
    checkAdminStatus();
  }, [user?.id]);

  useEffect(() => {
    // Wait for auth to be loaded before checking user
    if (!authLoaded) return;
    
    // Only check for user after auth has loaded
    if (authLoaded && !user) {
      log("Auth loaded but no user found");
      Alert.alert('Unauthorized', 'Please sign in to edit events.');
      router.replace('/auth/signin');
      return;
    }
    
    if (authLoaded && user) {
      log("User authenticated:", user.id);
      fetchEvent();
    }
  }, [id, user, authLoaded]);

  // Clear custom uploaded image if user is not admin/official (but keep bundled images)
  useEffect(() => {
    if (!checkingAdmin && !isAdminOrOfficial && imageUrl && imageUrl.startsWith('file://')) {
      setImageUrl(null);
    }
  }, [isAdminOrOfficial, checkingAdmin, imageUrl]);
  
  const fetchEvent = async () => {
    if (!id || !user) return;
    
    try {
      setLoading(true);
      log("Fetching event with ID:", id);
      
      const { data: event, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .single();
      
      if (error) throw error;
      
      if (!event) {
        Alert.alert('Not Found', 'Event or ad does not exist or was removed.');
        router.back();
        return;
      }
      
      // Check if current user is the event owner
      if (event.host_id !== user?.id) {
        Alert.alert('Unauthorized', 'You can only edit events or ads you created.');
        router.back();
        return;
      }
      
      // Set post type (event or ad)
      setPostType(event.post_type || 'event');
      
      // Populate form with event data
      setTitle(event.title || '');
      setDescription(event.description || '');
      setEventLocation(event.location || '');
      setCategory(event.category || '');
      setImageUrl(event.image_url || null);
      setMaxAttendees(event.max_attendees ? String(event.max_attendees) : '');
      
      // Find category ID from category name
      if (event.category) {
        const foundCategory = EVENT_CATEGORIES.find(cat => cat.name === event.category);
        if (foundCategory) {
          setCategoryId(foundCategory.id);
        }
      }
      
      // Parse date (only if it exists)
      if (event.date) {
        try {
          const eventDate = new Date(event.date);
          if (!isNaN(eventDate.getTime())) {
            setSelectedDate(eventDate);
            // For ads, track that an end date exists
            if (event.post_type === 'ad') {
              setHasAdEndDate(true);
            }
          }
        } catch (e) {
          error('Error parsing date:', e);
        }
      }
      
      // Parse time (only if it exists)
      if (event.time) {
        try {
          const [hours, minutes] = event.time.split(':').map(Number);
          
          if (!isNaN(hours) && !isNaN(minutes)) {
            const timeDate = new Date();
            timeDate.setHours(hours, minutes, 0);
            setSelectedTime(timeDate);
          }
        } catch (e) {
          error('Error parsing time:', e);
        }
      }
      
    } catch (error) {
      error('Error fetching event:', error);
      Alert.alert('Error', 'Failed to load details. Please try again.');
      router.back();
    } finally {
      setLoading(false);
    }
  };
  
  const validateForm = () => {
    let isValid = true;
    
    if (!title) {
      setTitleError(postType === 'ad' ? 'Ad title is required' : 'Event title is required');
      isValid = false;
    } else {
      setTitleError('');
    }
    
    // Location is required for events, optional for ads
    if (postType === 'event' && !eventLocation) {
      setLocationError('Event location is required');
      isValid = false;
    } else {
      setLocationError('');
    }
    
    if (!description) {
      setDescriptionError(postType === 'ad' ? 'Ad description is required' : 'Event description is required');
      isValid = false;
    } else {
      setDescriptionError('');
    }
    
    if (!categoryId && !category) {
      setCategoryError('Category is required');
      isValid = false;
    } else {
      setCategoryError('');
    }
    
    return isValid;
  };
  
  const handleUpdateEvent = async () => {
    if (!user || !id) {
      log("Missing user or id:", { userId: user?.id, eventId: id });
      return;
    }
    
    if (!validateForm()) {
      log("Form validation failed");
      return;
    }
    
    try {
      setUpdating(true);
      log("Updating event:", id);
      
      // Format date for the database
      // - Events: always use the selected date
      // - Ads: only use date if user set an end date (as expiration date)
      const formattedDate = postType === 'event' 
        ? selectedDate.toISOString().split('T')[0] 
        : (hasAdEndDate ? selectedDate.toISOString().split('T')[0] : null);
      
      // Format time for the database (only for events, ads don't use time)
      const formattedTime = postType === 'event' 
        ? `${String(selectedTime.getHours()).padStart(2, '0')}:${String(selectedTime.getMinutes()).padStart(2, '0')}:00`
        : null;
      
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
      
      // Get category name from categoryId if category is not set
      let categoryName = category;
      if (!categoryName && categoryId) {
        const foundCategory = EVENT_CATEGORIES.find(cat => cat.id === categoryId);
        if (foundCategory) {
          categoryName = foundCategory.name;
        }
      }
      
      // Event data - no content validation/flagging applied
      // Users can include social media handles, emails, phone numbers, URLs, etc.
      // Admins will manually review and flag content if needed
      const eventData = {
        title,
        description,
        location: eventLocation || null, // Optional for ads
        category: categoryName,
        max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
        date: formattedDate,
        time: formattedTime,
        image_url: finalImageUrl,
        updated_at: new Date().toISOString()
      };
      
      log("Event data to update:", eventData);
      
      const { data, error } = await supabase
        .from('events')
        .update(eventData)
        .eq('id', id)
        .eq('host_id', user.id)
        .select();
      
      if (error) {
        error("Supabase error updating event:", error);
        throw error;
      }
      
      log("Event updated successfully:", data);
      
      Alert.alert(
        'Success',
        postType === 'ad' ? 'Ad updated successfully' : 'Event updated successfully',
        [{ text: 'OK', onPress: () => router.back() }]
      );
      
    } catch (error) {
      error('Error updating event:', error);
      Alert.alert('Error', postType === 'ad' ? 'Failed to update the ad. Please try again.' : 'Failed to update the event. Please try again.');
    } finally {
      setUpdating(false);
    }
  };
  
  const handleDateChange = (event, date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
      // For ads, track that the user set an end date
      if (postType === 'ad') {
        setHasAdEndDate(true);
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
  
  if (loading) {
    return (
      <SafeAreaView style={GlobalStyles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={themeColors.primary.main} size="large" />
          <Text style={[styles.loadingText, { color: themeColors.neutral.text }]}>Loading details...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={[GlobalStyles.safeArea, { backgroundColor: themeColors.neutral.background }]}>
      <KeyboardAvoidingView
        style={[GlobalStyles.container, { backgroundColor: themeColors.neutral.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={[styles.header, { borderBottomColor: themeColors.neutral.border }]}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ChevronLeft size={24} color={themeColors.neutral.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.neutral.text }]}>{postType === 'ad' ? 'Edit Ad' : 'Edit Event'}</Text>
          <View style={{ width: 32 }} />
        </View>
        
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ backgroundColor: themeColors.neutral.background }}
        >
          <View style={styles.inputWrapper}>
            <Input
              label={postType === 'ad' ? 'Ad Title' : 'Event Title'}
              placeholder={postType === 'ad' ? 'Give your ad a name' : 'Give your event a name'}
              value={title}
              onChangeText={setTitle}
              error={titleError}
            />
          </View>
          
          <View style={styles.inputWrapper}>
            <Input
              label="Location"
              placeholder={postType === 'ad' ? 'Location (optional)' : 'Where is this event happening?'}
              value={eventLocation}
              onChangeText={setEventLocation}
              error={locationError}
              leftIcon={<MapPin size={20} color={themeColors.neutral.textSecondary} />}
            />
            {postType === 'ad' && (
              <Text style={[styles.optionalHint, { color: themeColors.neutral.textSecondary }]}>
                Optional - Leave blank for ads without location
              </Text>
            )}
          </View>
          
          {/* Category Picker */}
          <View style={styles.categorySection}>
            <CategoryPicker 
              selectedCategory={categoryId}
              onSelectCategory={setCategoryId}
            />
            {categoryError ? <Text style={[styles.errorText, { color: themeColors.error?.main || themeColors.error.main }]}>{categoryError}</Text> : null}
          </View>
          
          {/* Image Picker - Visible to everyone (bundled images allowed), but custom upload restricted to admin/official */}
          <View style={styles.imagePickerWrapper}>
            <EventImagePicker
              selectedImage={imageUrl}
              selectedCategory={categoryId}
              onSelectImage={setImageUrl}
            />
          </View>
          
          {/* Maximum Attendees - Only show for events, not ads */}
          {postType === 'event' && (
            <View style={styles.inputWrapper}>
              <Input
                label="Maximum Attendees (Optional)"
                placeholder="Enter a number"
                value={maxAttendees}
                onChangeText={setMaxAttendees}
                keyboardType="numeric"
                leftIcon={<Users size={20} color={themeColors.neutral.textSecondary} />}
              />
            </View>
          )}
          
          {/* Date & Time Section - Events */}
          {postType === 'event' && (
            <View style={styles.dateSection}>
              <Text style={[styles.dateLabel, { color: themeColors.neutral.text }]}>Event Date & Time</Text>
              
              <View style={styles.dateRow}>
                <Text style={[styles.dateSubLabel, { color: themeColors.neutral.text }]}>Date:</Text>
                <TouchableOpacity 
                  style={[styles.dateButton, { backgroundColor: themeColors.neutral.card, borderColor: themeColors.neutral.border }]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={[styles.dateButtonText, { color: themeColors.neutral.text }]}>{formatDate(selectedDate)}</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.dateRow}>
                <Text style={[styles.dateSubLabel, { color: themeColors.neutral.text }]}>Time:</Text>
                <TouchableOpacity 
                  style={[styles.timeButton, { backgroundColor: themeColors.neutral.card, borderColor: themeColors.neutral.border }]}
                  onPress={() => setShowTimePicker(true)}
                >
                  <Text style={[styles.dateButtonText, { color: themeColors.neutral.text }]}>{formatTime(selectedTime)}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          
          {/* Ad End Date Section - Ads only */}
          {postType === 'ad' && (
            <View style={styles.dateSection}>
              <Text style={[styles.dateLabel, { color: themeColors.neutral.text }]}>Ad End Date (Optional)</Text>
              <Text style={[styles.optionalHint, { color: themeColors.neutral.textSecondary, marginBottom: Spacing.sm }]}>
                {hasAdEndDate 
                  ? 'Ad will stop showing after this date'
                  : 'Set a date when this ad should stop showing, or leave blank to run indefinitely'}
              </Text>
              
              <View style={styles.dateRow}>
                <TouchableOpacity 
                  style={[
                    styles.dateButton, 
                    { 
                      backgroundColor: hasAdEndDate 
                        ? (isDarkMode ? 'rgba(167, 139, 250, 0.1)' : 'rgba(167, 139, 250, 0.08)')
                        : themeColors.neutral.card, 
                      borderColor: hasAdEndDate 
                        ? 'rgba(167, 139, 250, 0.3)'
                        : themeColors.neutral.border,
                      flex: 1,
                    }
                  ]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={[styles.dateButtonText, { color: hasAdEndDate ? themeColors.neutral.text : themeColors.neutral.textSecondary }]}>
                    {hasAdEndDate ? `Ends ${formatDate(selectedDate)}` : 'No end date'}
                  </Text>
                </TouchableOpacity>
                
                {hasAdEndDate && (
                  <TouchableOpacity 
                    style={[
                      styles.clearButton, 
                      { 
                        backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                        borderColor: 'rgba(239, 68, 68, 0.3)',
                      }
                    ]}
                    onPress={() => setHasAdEndDate(false)}
                  >
                    <Text style={[styles.clearButtonText, { color: '#EF4444' }]}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          
          <View style={styles.inputWrapper}>
            <Input
              label="Description"
              placeholder={postType === 'ad' ? 'Tell people what this ad is about' : 'Tell people what this event is about'}
              value={description}
              onChangeText={setDescription}
              error={descriptionError}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              leftIcon={<AlignLeft size={20} color={themeColors.neutral.textSecondary} />}
              inputStyle={styles.descriptionInput}
            />
          </View>
          
          <Button
            title={postType === 'ad' ? 'Update Ad' : 'Update Event'}
            onPress={handleUpdateEvent}
            loading={updating}
            fullWidth
            style={styles.updateButton}
          />
        </ScrollView>
        
        {/* Date Picker (iOS) - Events and Ads */}
        {Platform.OS === 'ios' && showDatePicker && (
          <View style={{ 
            backgroundColor: isDarkMode ? 'rgba(20, 20, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderRadius: 16,
            padding: 8
          }}>
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="spinner"
              onChange={handleDateChange}
              themeVariant={isDarkMode ? 'dark' : 'light'}
              accentColor={postType === 'ad' ? '#A78BFA' : '#00D9FF'}
            />
          </View>
        )}
        
        {/* Time Picker (iOS) - Events only */}
        {postType === 'event' && Platform.OS === 'ios' && showTimePicker && (
          <View style={{ 
            backgroundColor: isDarkMode ? 'rgba(20, 20, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderRadius: 16,
            padding: 8
          }}>
            <DateTimePicker
              value={selectedTime}
              mode="time"
              display="spinner"
              onChange={handleTimeChange}
              themeVariant={isDarkMode ? 'dark' : 'light'}
              accentColor="#00D9FF"
            />
          </View>
        )}
        
        {/* Date Picker (Android) - Events and Ads */}
        {Platform.OS === 'android' && showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default"
            onChange={handleDateChange}
            textColor={themeColors.text}
            accentColor={postType === 'ad' ? '#A78BFA' : '#00D9FF'}
          />
        )}
        
        {/* Time Picker (Android) - Events only */}
        {postType === 'event' && Platform.OS === 'android' && showTimePicker && (
          <DateTimePicker
            value={selectedTime}
            mode="time"
            display="default"
            onChange={handleTimeChange}
            textColor={themeColors.text}
            accentColor="#00D9FF"
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.subhead,
    fontFamily: FontFamily.medium,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
  },
  dateSection: {
    marginBottom: Spacing.md,
  },
  dateLabel: {
    marginBottom: Spacing.sm,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  dateSubLabel: {
    width: 50,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
  },
  dateButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  timeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  dateButtonText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: Spacing.sm,
  },
  updateButton: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  inputWrapper: {
    marginBottom: Spacing.md,
  },
  optionalHint: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    marginTop: Spacing.xs,
    marginBottom: 0,
    marginLeft: Spacing.sm,
  },
  categorySection: {
    marginBottom: Spacing.md,
  },
  imagePickerWrapper: {
    marginBottom: Spacing.md,
  },
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
  errorText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    marginTop: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  clearButton: {
    marginLeft: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  clearButtonText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
  },
}); 