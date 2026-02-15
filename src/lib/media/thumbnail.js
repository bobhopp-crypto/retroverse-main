const swapExtension = (filePath, newExt) => {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot === -1 ? `${filePath}${newExt}` : `${filePath.slice(0, lastDot)}${newExt}`;
};
export const getThumbnailUrl = async (video_url) => {
    if (!video_url)
        return null;
    const thumbnailUrl = swapExtension(video_url, '.jpg');
    try {
        const res = await fetch(thumbnailUrl, { method: 'HEAD' });
        if (res.status === 200)
            return thumbnailUrl;
    }
    catch {
        // swallow network errors and treat as missing
    }
    return null;
};
