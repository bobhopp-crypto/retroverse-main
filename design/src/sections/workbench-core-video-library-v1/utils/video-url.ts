import type { VideoFile } from '../types'

/**
 * R2 base URL for ChartTube videos (public CDN endpoint)
 */
const PUBLIC_R2_BASE_URL = "https://pub-5c80acab1a7448259a26f1161a3fe649.r2.dev/";

/**
 * Resolves a video file path to a playable HTTPS URL.
 * 
 * Uses the exact stored R2 object path from FilePath field.
 * No encoding, no transformation - uses the path exactly as stored.
 * 
 * @param video - The VideoFile object
 * @returns Resolved HTTPS URL
 */
export function resolveVideoSrc(video: VideoFile): string {
  // Use exact stored R2 object path - no encoding, no transformation
  // The FilePath field must contain the exact R2 object key as stored in R2
  const url = PUBLIC_R2_BASE_URL + video.FilePath;
  console.log('Video URL:', url);
  return url;
}
