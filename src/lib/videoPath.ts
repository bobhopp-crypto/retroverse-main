const CANONICAL_VIDEO_ROOT = '/Users/bobhopp/Library/CloudStorage/Dropbox/VIDEO'

type NormalizedPath = {
  relativePath: string | null
  absolutePath: string | null
}

export const normalizeVideoPath = (inputPath: string): NormalizedPath => {
  if (!inputPath) return { relativePath: null, absolutePath: null }
  const marker = '/VIDEO/'
  const idx = inputPath.indexOf(marker)
  if (idx === -1) return { relativePath: null, absolutePath: null }
  const tail = inputPath.slice(idx + 1) // keep leading VIDEO/
  const relativePath = tail.replace(/\\/g, '/')
  const absolutePath = `${CANONICAL_VIDEO_ROOT}/${relativePath.replace(/^VIDEO\//, '')}`
  return { relativePath, absolutePath }
}

export const toThumbnailPath = (relativePath: string | null): string | null => {
  if (!relativePath) return null
  return relativePath.replace(/\.[^.]+$/, '.jpg')
}

export const VIDEO_ROOT = CANONICAL_VIDEO_ROOT
