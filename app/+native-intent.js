/**
 * Native link/intent routing (native-only file; ignored on web and never
 * rendered). expo-sharing's Android receive flow surfaces each incoming
 * share as a link whose host is `expo-sharing`; every one of them — image,
 * text, or both — lands on the receipt-import screen, which then reads the
 * payload itself. Anything else keeps the router's default handling.
 */
export function redirectSystemPath({ path }) {
  try {
    const url = new URL(path);
    if (url.hostname === 'expo-sharing') return '/receipt-import';
  } catch {
    // Not a parseable URL: fall back to the router's normal behavior.
  }
  return path;
}
