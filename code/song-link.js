/*
  Pure URL builders for Retroverse song links.
  Context parameters never alter the canonical song ID.
*/

function buildQuery(baseParams, context) {
  const params = { ...baseParams };
  if (context && typeof context === "object") {
    Object.keys(context).forEach((key) => {
      const value = context[key];
      if (value !== undefined && value !== null && value !== "") {
        params[key] = value;
      }
    });
  }
  const query = Object.keys(params)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");
  return query ? `?${query}` : "";
}

function getVideoLibraryLink(songId, context) {
  const query = buildQuery({ song: songId }, context);
  return `/video-library/${query}`;
}

function getGameLink(gameId, songId, context) {
  const query = buildQuery({ song: songId }, context);
  return `/games/${gameId}.html${query}`;
}

function getWaybackLink(date, context) {
  const query = buildQuery({ date: date }, context);
  return `/wayback/${query}`;
}

export { getVideoLibraryLink, getGameLink, getWaybackLink };
