import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, PanResponder, Animated, Dimensions, Modal, TouchableOpacity, Text, Image } from 'react-native';
import { Maximize2, X, Pin } from 'lucide-react-native';
import { Image as ExpoImage } from 'expo-image';
import LiveComments from './LiveComments';
import { supabase } from '../utils/supabase';
import { log, warn, error } from '../utils/productionLogger';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface DraggableCommentContainerProps {
  streamId: string;
  isStreamer?: boolean;
  showInput?: boolean;
  canModerate?: boolean;
  onReplyToComment?: (comment: any) => void;
  onInviteUser?: (userId: string) => void;
  onWarnUser?: (userId: string, userName: string) => void;
  onKickUser?: (userId: string, userName: string) => void;
  initialX?: number;
  initialY?: number;
  containerWidth?: number;
  containerHeight?: number;
  onPositionChange?: (x: number, y: number) => void;
}

export default function DraggableCommentContainer({
  streamId,
  isStreamer = false,
  showInput = true,
  canModerate = false,
  onReplyToComment,
  onInviteUser,
  onWarnUser,
  onKickUser,
  initialX = SCREEN_WIDTH - 220,
  initialY = SCREEN_HEIGHT - 200,
  containerWidth = 200,
  containerHeight = 150,
  onPositionChange,
}: DraggableCommentContainerProps) {
  const pan = useRef(new Animated.ValueXY({ x: initialX, y: initialY })).current;
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [isExpanded, setIsExpanded] = useState(false);
  const [pinnedComment, setPinnedComment] = useState<any>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const expandedPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const expandedDragStartRef = useRef({ x: 0, y: 0 });
  const isExpandedDraggingRef = useRef(false);

  // Fetch pinned comment
  useEffect(() => {
    const fetchPinnedComment = async () => {
      try {
        const { data, error } = await supabase
          .from('live_stream_comments')
          .select(`
            id,
            user_id,
            message,
            created_at,
            is_pinned,
            pinned_at,
            pinned_by,
            profiles (
              id,
              full_name,
              avatar_url
            )
          `)
          .eq('stream_id', streamId)
          .eq('is_pinned', true)
          .maybeSingle();

        if (error) {
          error('[DraggableCommentContainer] Error fetching pinned comment:', error);
          return;
        }

        if (data) {
          const profile = (data.profiles as any) || {};
          setPinnedComment({
            id: data.id,
            user_id: data.user_id,
            user_name: profile.full_name || 'User',
            user_avatar: profile.avatar_url,
            message: data.message,
            timestamp: data.created_at,
            is_pinned: true,
          });
        } else {
          setPinnedComment(null);
        }
      } catch (error) {
        error('[DraggableCommentContainer] Exception fetching pinned comment:', error);
      }
    };

    fetchPinnedComment();

    // Subscribe to pin updates
    const channel = supabase
      .channel(`pinned_comment_${streamId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_stream_comments',
          filter: `stream_id=eq.${streamId}`,
        },
        async (payload) => {
          if (payload.new.is_pinned) {
            // Fetch the pinned comment with profile
            const { data: commentData, error } = await supabase
              .from('live_stream_comments')
              .select(`
                id,
                user_id,
                message,
                created_at,
                is_pinned,
                pinned_at,
                pinned_by,
                profiles (
                  id,
                  full_name,
                  avatar_url
                )
              `)
              .eq('id', payload.new.id)
              .single();

            if (!error && commentData) {
              const profile = (commentData.profiles as any) || {};
              setPinnedComment({
                id: commentData.id,
                user_id: commentData.user_id,
                user_name: profile.full_name || 'User',
                user_avatar: profile.avatar_url,
                message: commentData.message,
                timestamp: commentData.created_at,
                is_pinned: true,
              });
            }
          } else {
            // Comment was unpinned
            setPinnedComment(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [streamId]);

  // Pan responder for dragging the container (only on header)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true, // Capture touches on header
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
        dragStartRef.current = {
          x: evt.nativeEvent.pageX,
          y: evt.nativeEvent.pageY,
        };
        isDraggingRef.current = false;
      },
      onPanResponderMove: (_, gestureState) => {
        const moveDistance = Math.sqrt(gestureState.dx ** 2 + gestureState.dy ** 2);
        if (moveDistance > 10) {
          isDraggingRef.current = true;
        }
        pan.setValue({ x: gestureState.dx, y: gestureState.dy });
      },
      onPanResponderRelease: (evt) => {
        pan.flattenOffset();
        
        const currentX = (pan.x as any)._value;
        const currentY = (pan.y as any)._value;
        
        const moveDistance = Math.sqrt(
          (evt.nativeEvent.pageX - dragStartRef.current.x) ** 2 +
          (evt.nativeEvent.pageY - dragStartRef.current.y) ** 2
        );
        
        // If it was a tap (small movement), expand the modal
        if (moveDistance < 15 && !isDraggingRef.current) {
          setIsExpanded(true);
          isDraggingRef.current = false;
          return;
        }
        
        // Keep container within screen bounds
        const halfWidth = containerWidth / 2;
        const halfHeight = containerHeight / 2;
        const minX = halfWidth;
        const maxX = SCREEN_WIDTH - halfWidth;
        const minY = halfHeight + 50;
        const maxY = SCREEN_HEIGHT - halfHeight - 50;
        
        const boundedX = Math.max(minX, Math.min(maxX, currentX));
        const boundedY = Math.max(minY, Math.min(maxY, currentY));
        
        Animated.spring(pan, {
          toValue: { x: boundedX, y: boundedY },
          useNativeDriver: false,
          tension: 50,
          friction: 7,
        }).start();
        
        const newPosition = { x: boundedX, y: boundedY };
        setPosition(newPosition);
        
        if (onPositionChange) {
          onPositionChange(boundedX, boundedY);
        }
        
        isDraggingRef.current = false;
      },
    })
  ).current;

  const handleCloseExpanded = () => {
    setIsExpanded(false);
    // Reset position when closing
    expandedPan.setValue({ x: 0, y: 0 });
  };

  // Pan responder for dragging the expanded modal
  const expandedPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        expandedPan.setOffset({
          x: (expandedPan.x as any)._value,
          y: (expandedPan.y as any)._value,
        });
        expandedPan.setValue({ x: 0, y: 0 });
        expandedDragStartRef.current = {
          x: evt.nativeEvent.pageX,
          y: evt.nativeEvent.pageY,
        };
        isExpandedDraggingRef.current = false;
      },
      onPanResponderMove: (_, gestureState) => {
        const moveDistance = Math.sqrt(gestureState.dx ** 2 + gestureState.dy ** 2);
        if (moveDistance > 10) {
          isExpandedDraggingRef.current = true;
        }
        expandedPan.setValue({ x: gestureState.dx, y: gestureState.dy });
      },
      onPanResponderRelease: (evt) => {
        expandedPan.flattenOffset();
        
        const currentX = (expandedPan.x as any)._value;
        const currentY = (expandedPan.y as any)._value;
        
        // Keep modal within screen bounds
        const modalWidth = SCREEN_WIDTH * 0.55;
        const modalHeight = SCREEN_HEIGHT * 0.35;
        
        // Calculate bounds (accounting for padding)
        const minX = -(SCREEN_WIDTH - modalWidth - 32) / 2; // Left bound
        const maxX = (SCREEN_WIDTH - modalWidth - 32) / 2; // Right bound
        const minY = -(SCREEN_HEIGHT - modalHeight - 150); // Top bound
        const maxY = 0; // Bottom bound (default position)
        
        const boundedX = Math.max(minX, Math.min(maxX, currentX));
        const boundedY = Math.max(minY, Math.min(maxY, currentY));
        
        Animated.spring(expandedPan, {
          toValue: { x: boundedX, y: boundedY },
          useNativeDriver: false,
          tension: 50,
          friction: 7,
        }).start();
        
        isExpandedDraggingRef.current = false;
      },
    })
  ).current;

  return (
    <>
      {/* Compact Draggable Container - Hide when expanded */}
      {!isExpanded && (
        <Animated.View
          style={[
            styles.draggableContainer,
            {
              width: containerWidth,
              height: containerHeight,
              transform: [{ translateX: pan.x }, { translateY: pan.y }],
            },
          ]}
        >
        <View style={styles.containerContent}>
          {/* Header with expand button - This is the drag handle */}
          <View 
            style={styles.containerHeader}
            {...panResponder.panHandlers}
          >
            <Text style={styles.containerHeaderText}>Comments</Text>
            <TouchableOpacity
              onPress={() => setIsExpanded(true)}
              style={styles.expandButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Maximize2 size={14} color="#FFFFFF" strokeWidth={2} />
            </TouchableOpacity>
          </View>
          
          {/* Pinned Comment Section - Compact Single Line */}
          {pinnedComment && (
            <View style={styles.pinnedCommentSection}>
              <View style={styles.pinnedCommentContent}>
                <Pin size={6} color="#FFD700" fill="#FFD700" />
                <Text style={styles.pinnedMessage} numberOfLines={1}>
                  <Text style={styles.pinnedUserName}>
                    {pinnedComment.user_name || 'User'}:
                  </Text>
                  {' '}{pinnedComment.message}
                </Text>
              </View>
            </View>
          )}
          
          {/* Comments content */}
          <View style={styles.commentsContainer} pointerEvents="box-none">
            <View pointerEvents="auto">
              <LiveComments
                streamId={streamId}
                isStreamer={isStreamer}
                showInput={showInput}
                canModerate={canModerate}
                onReplyToComment={onReplyToComment}
                onInviteUser={onInviteUser}
                onWarnUser={onWarnUser}
                onKickUser={onKickUser}
              />
            </View>
          </View>
        </View>
        </Animated.View>
      )}

      {/* Expanded Modal */}
      <Modal
        visible={isExpanded}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCloseExpanded}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCloseExpanded}
        >
          <Animated.View 
            style={[
              styles.modalContent,
              {
                transform: [{ translateX: expandedPan.x }, { translateY: expandedPan.y }],
              },
            ]}
          >
            {/* Header - Draggable handle */}
            <View 
              style={styles.modalHeader}
              {...expandedPanResponder.panHandlers}
            >
              <Text style={styles.modalHeaderText}>Comments</Text>
              <TouchableOpacity
                onPress={handleCloseExpanded}
                style={styles.closeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
            
            {/* Expanded comments */}
            <View style={styles.expandedCommentsContainer}>
              <LiveComments
                streamId={streamId}
                isStreamer={isStreamer}
                showInput={showInput}
                canModerate={canModerate}
                onReplyToComment={onReplyToComment}
                onInviteUser={onInviteUser}
                onWarnUser={onWarnUser}
                onKickUser={onKickUser}
              />
            </View>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  draggableContainer: {
    position: 'absolute',
    zIndex: 1000,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  containerContent: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  containerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  containerHeaderText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  expandButton: {
    padding: 4,
  },
  pinnedCommentSection: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginBottom: 2,
    maxHeight: 20, // Very compact - single line only
  },
  pinnedCommentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  pinnedUserName: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 1,
  },
  pinnedMessage: {
    color: '#FFFFFF',
    fontSize: 8,
    lineHeight: 10,
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 1,
    flex: 1,
    flexShrink: 1,
    marginLeft: 3,
  },
  commentsContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.2)', // Lighter overlay - less dark
    justifyContent: 'flex-end', // Position at bottom
    alignItems: 'flex-end', // Position at right
    paddingBottom: 100, // Space from bottom (above input/controls)
    paddingRight: 16, // Space from right edge
    paddingTop: 50, // Space from top
  },
  modalContent: {
    width: SCREEN_WIDTH * 0.55, // Even smaller width - 55% instead of 65%
    maxWidth: 350, // Reduced max width for more compact size
    height: SCREEN_HEIGHT * 0.35, // Much shorter height - 35% instead of 40%
    maxHeight: 380, // Further reduced max height
    backgroundColor: 'rgba(20, 20, 20, 0.85)', // Less dark - lighter background
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)', // Lighter border
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 9999, // Ensure it's above other elements
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(30, 30, 30, 0.6)', // Less dark header
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)', // Lighter border
  },
  modalHeaderText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  expandedCommentsContainer: {
    flex: 1,
  },
});

