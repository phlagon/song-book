interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  platform?: string;
}

/**
 * Returns true when running inside the packaged Capacitor Android/iOS APK,
 * and false when accessed as a regular website in a browser.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const cap = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  if (cap) {
    if (typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
      return true;
    }
    const platform =
      typeof cap.getPlatform === 'function' ? cap.getPlatform() : cap.platform;
    if (platform === 'android' || platform === 'ios') {
      return true;
    }
  }

  const protocol = window.location.protocol;
  if (protocol === 'capacitor:' || protocol === 'file:') {
    return true;
  }

  // Fallback guard for Capacitor Android WebView serving bundled assets on https://localhost
  const isCapacitorLocalhost =
    window.location.hostname === 'localhost' && window.location.port === '';
  const isAndroidWebView = /;\s*wv\)/i.test(navigator.userAgent);
  if (isCapacitorLocalhost && isAndroidWebView) {
    return true;
  }

  return false;
}
