import React from 'react';
import { useRouter } from 'expo-router';
import { type MusicTrack } from '../../constants/musicLibrary';
import MusicHubModal from '../../components/music/MusicHubModal';

export default function MusicHubScreen() {
  const router = useRouter();

  const handleUseSound = (track: MusicTrack) => {
    const payload = encodeURIComponent(JSON.stringify({
      id: track.id,
      title: track.title,
      artist: track.artist,
      url: track.url,
    }));
    router.replace(`/(tabs)/create?tab=story&music=${payload}` as any);
  };

  return (
    <MusicHubModal
      visible
      onClose={() => router.back()}
      title="Nomli Music"
      subtitle="Browse, preview, and save sounds"
      ctaLabel="Use in story"
      closeOnSelect={false}
      onSelectTrack={handleUseSound}
    />
  );
}

