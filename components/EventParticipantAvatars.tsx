import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Animated, useColorScheme } from 'react-native';
import { supabase, Profile } from '../utils/supabase';
import { Colors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { useRouter } from 'expo-router';
import { log, warn, error } from '../utils/productionLogger';



type EventParticipantAvatarsProps = {
  eventId: string;
  initialParticipants?: Profile[];
  maxDisplay?: number;
  maxToShow?: number;
  size?: number;
  onPress?: () => void;
};

export default function EventParticipantAvatars({
  eventId,
  initialParticipants = [],
  maxDisplay = 5,
  maxToShow,
  size = 36,
  onPress
}: EventParticipantAvatarsProps) {
  const router = useRouter();
  const [participants, setParticipants] = useState<Profile[]>(initialParticipants);
  const [loading, setLoading] = useState((initialParticipants?.length || 0) === 0);
  const [newAvatarIndex, setNewAvatarIndex] = useState<number | null>(null);
  const newAvatarAnim = useRef(new Animated.Value(0)).current;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  

  
  // Maximum number of avatars to display
  const maxDisplayCount = maxToShow || maxDisplay;

  // Initialize with initialParticipants if available
  useEffect(() => {
    if ((initialParticipants?.length || 0) > 0) {
      setParticipants(initialParticipants);
      setLoading(false);
    }
  }, [initialParticipants]);
  
  useEffect(() => {
    // Fetch participants
    fetchParticipants();
    
    // Set up realtime subscription
    const subscription = supabase
      .channel(`event-participants-avatars-${eventId}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'event_attendees',
          filter: `event_id=eq.${eventId}`
        }, 
        (payload) => {
          log('Participant avatars update:', payload);
          
          // INSERT: Someone joined
          if (payload.eventType === 'INSERT' && payload.new && payload.new.user_id) {
            fetchUserProfile(payload.new.user_id, true);
          }
          // DELETE: Someone left
          else if (payload.eventType === 'DELETE' && payload.old && payload.old.user_id) {
            removeUserFromList(payload.old.user_id);
          }
        }
      )
      .subscribe();
    
    // Clean up subscription
    return () => {
      supabase.removeChannel(subscription);
    };
  }, [eventId]);
  
  const fetchParticipants = async () => {
    try {
      setLoading(true);
      
      // Fetch with user_id
      const { data, error } = await supabase
        .from('event_attendees')
        .select('user_id, profiles(*)')
        .eq('event_id', eventId)
        .limit(maxDisplayCount + 5); // Fetch a few more for the count
      
      if (error) {
        error('Error fetching participant avatars:', error);
        return;
      }
      
      if (data && (data?.length || 0) > 0) {
        const profiles = data
          .map(item => item.profiles)
          .filter(Boolean) as Profile[];
        
        setParticipants(profiles);
      } else {
        setParticipants([]);
      }
    } catch (error) {
      error('Exception fetching participant avatars:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchUserProfile = async (userId: string, isNew = false) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (!error && data) {
        // Add to the list if not already present
        setParticipants(current => {
          if (!current.find(p => p.id === data.id)) {
            const newList = [data, ...current].slice(0, maxDisplayCount + 5);
            
            // Animate the new avatar if requested
            if (isNew) {
              setNewAvatarIndex(0);
              animateNewAvatar();
            }
            
            return newList;
          }
          return current;
        });
      }
    } catch (error) {
      error('Error fetching user profile for avatars:', error);
    }
  };
  
  const removeUserFromList = (userId: string) => {
    setParticipants(current => current.filter(p => p.id !== userId));
  };
  
  const animateNewAvatar = () => {
    newAvatarAnim.setValue(0);
    Animated.sequence([
      Animated.timing(newAvatarAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true
      }),
      Animated.delay(500),
      Animated.timing(newAvatarAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true
      })
    ]).start(() => {
      setNewAvatarIndex(null);
    });
  };
  
  // Generate avatar URL from profile
  const getAvatarUrl = (profile: Profile) => {
    if (!profile || !profile.avatar_url) {
      return null;
    }
    
    // Handle DiceBear avatars
    if (profile.avatar_url.startsWith('dicebear:')) {
      const avatarData = profile.avatar_url.replace('dicebear:', '');
      if (avatarData.includes(':')) {
        const [style, seed] = avatarData.split(':');
        return `https://api.dicebear.com/9.x/${style}/png?seed=${seed}&size=${size}`;
      } else {
        // Handle old format (style only) - use profile id as seed
        return `https://api.dicebear.com/9.x/${avatarData}/png?seed=${profile.id}&size=${size}`;
      }
    }
    
    // Return regular avatar URL
    return profile.avatar_url;
  };
  
  // If no participants and still loading, show placeholder
  if ((participants?.length || 0) === 0 && loading) {
    return (
      <TouchableOpacity 
        style={styles.container}
        onPress={onPress}
        disabled={!onPress}
      >
        <Text style={styles.emptyText}>Loading participants...</Text>
      </TouchableOpacity>
    );
  }
  
  // If no participants and not loading, show empty state
  if ((participants?.length || 0) === 0) {
    return (
      <TouchableOpacity 
        style={styles.container}
        onPress={onPress}
        disabled={!onPress}
      >
        <Text style={styles.emptyText}>No participants yet</Text>
      </TouchableOpacity>
    );
  }
  
  const displayParticipants = participants.slice(0, maxDisplayCount);
  const extraCount = Math.max(0, (participants?.length || 0) - maxDisplayCount);
  
  return (
    <TouchableOpacity 
      style={styles.container}
      onPress={onPress}
      disabled={!onPress}
    >
      {displayParticipants.map((profile, index) => (
        <View key={profile.id} style={[
          styles.avatarContainer,
          { 
            marginLeft: index === 0 ? 0 : -size/4,
            zIndex: (displayParticipants?.length || 0) - index
          }
        ]}>
          {newAvatarIndex === index ? (
            <Animated.View style={{
              position: 'absolute',
              top: -3,
              left: -3,
              right: -3,
              bottom: -3,
              borderRadius: (size + 6) / 2,
              borderWidth: 2,
              borderColor: Colors.primary.main,
              opacity: newAvatarAnim,
              transform: [{
                scale: newAvatarAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1.2, 1]
                })
              }]
            }} />
          ) : null}
          
          <Image
            source={
              getAvatarUrl(profile)
                ? { uri: getAvatarUrl(profile) }
                : require('../assets/images/default-avatar.png')
            }
            style={[
              styles.avatar,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
              }
            ]}
            defaultSource={require('../assets/images/default-avatar.png')}
          />
        </View>
      ))}
      
      {extraCount > 0 && (
        <View style={[
          styles.extraContainer, 
          { 
            width: size, 
            height: size,
            borderRadius: size / 2,
            marginLeft: -size/4
          }
        ]}>
          <Text style={[styles.extraText, { fontSize: size * 0.3 }]}>+{extraCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  avatarContainer: {
    borderWidth: 1.5,
    borderColor: Colors.neutral.card,
    borderRadius: 100,
  },
  avatar: {
    backgroundColor: Colors.neutral.background,
    borderWidth: 1.5,
    borderColor: Colors.neutral.card,
  },
  extraContainer: {
    backgroundColor: Colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.neutral.card,
  },
  extraText: {
    color: 'white',
    fontFamily: FontFamily.bold,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.subtext,
  },
}); 