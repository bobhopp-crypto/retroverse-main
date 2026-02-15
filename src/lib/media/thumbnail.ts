const swapExtension = (filePath: string, newExt: string) => {
  const lastDot = filePath.lastIndexOf('.')
  return lastDot === -1 ? `${filePath}${newExt}` : `${filePath.slice(0, lastDot)}${newExt}`
}

export const getThumbnailUrl = (video_url: string): string => swapExtension(video_url, '.jpg')
