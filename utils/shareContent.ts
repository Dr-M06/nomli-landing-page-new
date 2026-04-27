import { Platform, Share } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { getFileUrlForSharing, downloadImageForSharing } from './fileCache';
import { log, warn } from './productionLogger';
import type { Post } from './communityUtils';
import { shareCommunityPostUrl } from '../constants/shareLinks';

/** App-only sharing: no store/web fallback line. */
export function getAppStoreLine(): string {
  return '';
}

/**
 * Share sheet behavior:
 * - **iOS**: React Native `Share` can attach a **local image file** (`url: file://...`) plus text.
 *   Put the canonical HTTPS link in `message` so chat apps can unfurl it when your site has OG tags.
 * - **Android**: `Share` only supports plain text (`title` + `message`). Images are **not** attached
 *   by the core RN module — users get the link + copy; rich previews come from **web** OG metadata.
 */

function composeShareMessage(parts: { headline?: string; snippet: string; link: string; footer?: string }) {
  const lines: string[] = [];
  if (parts.headline?.trim()) lines.push(parts.headline.trim(), '');
  lines.push(parts.snippet.trim(), '', parts.link.trim());
  if (parts.footer?.trim()) lines.push('', parts.footer.trim());
  return lines.join('\n').trim();
}

/** Share a community post: optional local image file on iOS; always includes public URL in text. */
export async function shareCommunityPost(opts: {
  title: string;
  snippet: string;
  link: string;
  /** Local file URI from downloadImageForSharing (file://...) */
  localImageFileUri: string | null;
  storeLine?: string;
}): Promise<void> {
  const footer = opts.storeLine?.trim();
  const message = composeShareMessage({
    headline: opts.title,
    snippet: opts.snippet || 'Check this out on Nomli Mingle.',
    link: opts.link,
    footer,
  });

  try {
    if (Platform.OS === 'ios' && opts.localImageFileUri) {
      const fileUrl = await getFileUrlForSharing(opts.localImageFileUri);
      if (fileUrl?.startsWith('file://')) {
        await Share.share({ title: opts.title, message, url: fileUrl });
        return;
      }
    }
  } catch (e) {
    warn('[shareContent] iOS image share failed, falling back to text:', e);
  }

  await Share.share({ title: opts.title, message });
}

/** Share a video: try to attach a generated thumbnail on iOS. */
export async function shareVideoPost(opts: {
  title: string;
  description: string;
  link: string;
  videoUrl: string;
  thumbnailUrl?: string | null;
  storeLine?: string;
}): Promise<void> {
  let localThumb: string | null = null;
  try {
    if (opts.thumbnailUrl && (opts.thumbnailUrl.startsWith('http') || opts.thumbnailUrl.startsWith('https'))) {
      const downloaded = await downloadImageForSharing(opts.thumbnailUrl);
      localThumb = downloaded ? (await getFileUrlForSharing(downloaded)) || null : null;
    } else if (opts.videoUrl) {
      const { uri } = await VideoThumbnails.getThumbnailAsync(opts.videoUrl, {
        time: 500,
        quality: 0.85,
      });
      localThumb = uri ? (await getFileUrlForSharing(uri)) || null : null;
    }
  } catch (e) {
    log('[shareContent] thumbnail for share failed:', e);
  }

  const snippet = (opts.description || 'Check out this video on Nomli Mingle.').slice(0, 280);
  const message = composeShareMessage({
    headline: opts.title,
    snippet,
    link: opts.link,
    footer: opts.storeLine,
  });

  try {
    if (Platform.OS === 'ios' && localThumb?.startsWith('file://')) {
      await Share.share({ title: opts.title, message, url: localThumb });
      return;
    }
  } catch (e) {
    warn('[shareContent] video iOS image share failed, falling back to text:', e);
  }

  await Share.share({ title: opts.title, message });
}

function getShareImageUrlFromPost(post: Post): string | null {
  if (post.image_urls?.length) {
    for (const u of post.image_urls) {
      if (u && (u.startsWith('http://') || u.startsWith('https://'))) return u;
    }
  }
  if (post.image_url && (post.image_url.startsWith('http://') || post.image_url.startsWith('https://'))) {
    return post.image_url;
  }
  return null;
}

/** Home feed + fullscreen rail: text, images, or video — one public post link. */
export async function shareHomeFeedPost(post: Post): Promise<void> {
  const uname = post.username?.trim() || 'someone';
  const title = `Post from @${uname} on Nomli Mingle`;
  const link = shareCommunityPostUrl(post.id);
  const snippet =
    post.content?.trim().slice(0, 280) ||
    'Check this out on Nomli Mingle.';
  const storeLine = getAppStoreLine();

  if (post.video_url?.trim()) {
    await shareVideoPost({
      title,
      description: snippet,
      link,
      videoUrl: post.video_url.trim(),
      thumbnailUrl: null,
      storeLine,
    });
    return;
  }

  let localImage: string | null = null;
  const imgUrl = getShareImageUrlFromPost(post);
  if (imgUrl) {
    localImage = await downloadImageForSharing(imgUrl);
  }

  await shareCommunityPost({
    title,
    snippet,
    link,
    localImageFileUri: localImage,
    storeLine,
  });
}
