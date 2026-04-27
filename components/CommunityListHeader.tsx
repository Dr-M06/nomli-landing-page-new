/**
 * Memoized list header for Community feed.
 * Renders PullToRefreshBanner and UserStatusBar.
 * Used as FlatList ListHeaderComponent to avoid re-creating header on every parent re-render.
 */
import React from 'react';
import { View } from 'react-native';
import PullToRefreshBanner from './PullToRefreshBanner';
import UserStatusBar from './StatusBar';

export interface CommunityListHeaderProps {
  styles: Record<string, object>;
  showPullToRefreshBanner: boolean;
  pullToRefreshVariant: 'loading' | 'refreshing' | 'loading-posts';
  user: { id: string; username?: string } | null;
  liveStreams: any[];
  onPressLive: (streamId: string) => void;
  onPressStory: (userId: string, storyId?: string) => Promise<void>;
  onPressCreate: () => void;
}

function CommunityListHeader({
  styles,
  showPullToRefreshBanner,
  pullToRefreshVariant,
  user,
  liveStreams,
  onPressLive,
  onPressStory,
  onPressCreate,
}: CommunityListHeaderProps) {
  return (
    <View style={{ position: 'relative' }} collapsable={false}>
      <PullToRefreshBanner visible={showPullToRefreshBanner} variant={pullToRefreshVariant} />

      <UserStatusBar
        liveStreams={liveStreams}
        stories={[]}
        onPressLive={onPressLive}
        onPressStory={onPressStory}
        onPressCreate={onPressCreate}
      />
    </View>
  );
}

export default React.memo(CommunityListHeader);
