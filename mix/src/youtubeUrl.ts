/** Canonicalize a single YouTube video link for both dropped links and imports. */
export function normaliseYoutubeUrl(text: string): string | null {
  try {
    const url = new URL(text.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const youtube =
      host === 'youtu.be' ||
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtube-nocookie.com' ||
      host.endsWith('.youtube-nocookie.com');
    if (!youtube) return null;

    let id = url.searchParams.get('v');
    if (!id) {
      const parts = url.pathname.split('/').filter(Boolean);
      if (host === 'youtu.be') id = parts[0] ?? null;
      else if (['embed', 'shorts', 'live'].includes(parts[0] ?? '')) id = parts[1] ?? null;
    }
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
    return `https://www.youtube.com/watch?v=${id}`;
  } catch {
    return null;
  }
}

