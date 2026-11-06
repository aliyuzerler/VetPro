import * as React from 'react';

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

/**
 * Görünüm alanı mobil kırılımının altında mı?
 * useSyncExternalStore ile effect içinde setState çağrısı yapılmadan çözümlenir.
 */
export function useIsMobile(): boolean {
  const isMobile = React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
  return isMobile;
}
