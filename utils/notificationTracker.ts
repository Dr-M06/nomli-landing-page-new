import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface NotificationActivity {
  type: 'like' | 'comment' | 'follow' | 'gift' | 'call' | 'event';
  data: any;
}

/**
 * Track user activities for daily email notifications
 */
export class NotificationTracker {
  
  /**
   * Track a like on a post
   */
  static async trackLike(postId: string, userId: string, postOwnerId: string) {
    try {
      const { error } = await supabase
        .from('post_likes')
        .insert({
          post_id: postId,
          user_id: userId,
          post_owner_id: postOwnerId
        });

      if (error) {
        error('Error tracking like:', error);
      }
    } catch (error) {
      error('Error tracking like:', error);
    }
  }

  /**
   * Track a comment on a post
   */
  static async trackComment(postId: string, userId: string, postOwnerId: string, content: string) {
    try {
      const { error } = await supabase
        .from('post_comments')
        .insert({
          post_id: postId,
          user_id: userId,
          post_owner_id: postOwnerId,
          content: content
        });

      if (error) {
        error('Error tracking comment:', error);
      }
    } catch (error) {
      error('Error tracking comment:', error);
    }
  }

  /**
   * Track a new follower
   */
  static async trackFollow(followerId: string, followingId: string) {
    try {
      const { error } = await supabase
        .from('followers')
        .insert({
          follower_id: followerId,
          following_id: followingId
        });

      if (error) {
        error('Error tracking follow:', error);
      }
    } catch (error) {
      error('Error tracking follow:', error);
    }
  }

  /**
   * Track a gift sent
   */
  static async trackGift(senderId: string, recipientId: string, giftType: string, giftValue: number, message?: string, streamId?: string) {
    try {
      const { error } = await supabase
        .from('gifts')
        .insert({
          sender_id: senderId,
          recipient_id: recipientId,
          gift_type: giftType,
          gift_value: giftValue,
          message: message,
          stream_id: streamId
        });

      if (error) {
        error('Error tracking gift:', error);
      }
    } catch (error) {
      error('Error tracking gift:', error);
    }
  }

  /**
   * Track a missed call
   */
  static async trackMissedCall(callerId: string, recipientId: string, callType: 'video' | 'audio' = 'video') {
    try {
      const { error } = await supabase
        .from('call_logs')
        .insert({
          caller_id: callerId,
          recipient_id: recipientId,
          call_type: callType,
          status: 'missed'
        });

      if (error) {
        error('Error tracking missed call:', error);
      }
    } catch (error) {
      error('Error tracking missed call:', error);
    }
  }

  /**
   * Track event attendance
   */
  static async trackEventAttendance(eventId: string, userId: string, status: 'attending' | 'maybe' | 'declined' = 'attending') {
    try {
      const { error } = await supabase
        .from('event_attendees')
        .upsert({
          event_id: eventId,
          user_id: userId,
          status: status
        });

      if (error) {
        error('Error tracking event attendance:', error);
      }
    } catch (error) {
      error('Error tracking event attendance:', error);
    }
  }

  /**
   * Update user's email notification preferences
   */
  static async updateEmailPreferences(userId: string, enabled: boolean) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ email_notifications_enabled: enabled })
        .eq('id', userId);

      if (error) {
        error('Error updating email preferences:', error);
        return false;
      }
      return true;
    } catch (error) {
      error('Error updating email preferences:', error);
      return false;
    }
  }

  /**
   * Get user's email notification preferences
   */
  static async getEmailPreferences(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('email_notifications_enabled')
        .eq('id', userId)
        .single();

      if (error) {
        error('Error getting email preferences:', error);
        return true; // Default to enabled
      }
      return data?.email_notifications_enabled ?? true;
    } catch (error) {
      error('Error getting email preferences:', error);
      return true; // Default to enabled
    }
  }
}

/**
 * Helper function to get user-friendly activity descriptions
 */
export function getActivityDescription(type: string, count: number): string {
  const descriptions = {
    likes: count === 1 ? 'like' : 'likes',
    comments: count === 1 ? 'comment' : 'comments',
    followers: count === 1 ? 'follower' : 'followers',
    gifts: count === 1 ? 'gift' : 'gifts',
    calls: count === 1 ? 'missed call' : 'missed calls',
    events: count === 1 ? 'upcoming event' : 'upcoming events'
  };

  return descriptions[type] || 'activity';
}

/**
 * Helper function to format notification summary
 */
export function formatNotificationSummary(activities: Record<string, number>): string {
  const parts = [];
  
  if (activities.likes > 0) {
    parts.push(`${activities.likes} ${getActivityDescription('likes', activities.likes)}`);
  }
  
  if (activities.comments > 0) {
    parts.push(`${activities.comments} ${getActivityDescription('comments', activities.comments)}`);
  }
  
  if (activities.followers > 0) {
    parts.push(`${activities.followers} new ${getActivityDescription('followers', activities.followers)}`);
  }
  
  if (activities.gifts > 0) {
    parts.push(`${activities.gifts} ${getActivityDescription('gifts', activities.gifts)}`);
  }
  
  if (activities.calls > 0) {
    parts.push(`${activities.calls} ${getActivityDescription('calls', activities.calls)}`);
  }
  
  if (activities.events > 0) {
    parts.push(`${activities.events} ${getActivityDescription('events', activities.events)}`);
  }

  if (parts.length === 0) {
    return 'No new activity';
  }
  
  if (parts.length === 1) {
    return parts[0];
  }
  
  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }
  
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}
