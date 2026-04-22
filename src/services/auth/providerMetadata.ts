import { CURATED_BACKENDS, normalizeBackendUrl } from './backendResolver';

const CURATED_PROVIDER_ICONS: Record<string, string> = {
  bluesky: 'bluesky-logo',
  blacksky: 'blacksky-algo',
};

type ProviderMetadata = {
  displayName: string;
  domain: string;
  iconName?: string;
};

export function getProviderMetadata(provider?: string | null): ProviderMetadata {
  const normalizedProvider = normalizeBackendUrl(provider);
  const curatedProvider = CURATED_BACKENDS.find(
    backend => normalizeBackendUrl(backend.backend) === normalizedProvider
  );

  const domain = normalizedProvider.replace(/^https?:\/\//, '');
  if (!curatedProvider) {
    return { displayName: domain, domain };
  }

  return {
    displayName: curatedProvider.label,
    domain,
    iconName: CURATED_PROVIDER_ICONS[curatedProvider.key],
  };
}
