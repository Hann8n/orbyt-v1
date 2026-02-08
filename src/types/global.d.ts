/**
 * Global type augmentations for React Native environment.
 * Some libraries expect web-like globals (e.g. location) that RN doesn't provide.
 */

declare global {
  /** Minimal location-like object for RN libs that expect web globals */
  interface LocationLike {
    href: string;
    origin: string;
    protocol: string;
    host: string;
    hostname: string;
    port: string;
    pathname: string;
    search: string;
    hash: string;
    reload: () => void;
    replace: (url?: string) => void;
    assign: (url?: string) => void;
    /** Location compat: read-only list of origins (RN mock uses empty array) */
    ancestorOrigins?: readonly string[];
  }

  var location: LocationLike | undefined;
}

export {};
