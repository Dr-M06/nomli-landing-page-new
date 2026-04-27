import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Web shares may use /video/:id (shareVideoPostUrl). Same content is shown in-app via community post detail.
 */
export default function VideoShareDeepLink() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    return <Redirect href="/" />;
  }
  return <Redirect href={`/community/post/${encodeURIComponent(id)}`} />;
}
