import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { storageAdapter } from '@/utils/storage/storage';
import { CURATED_BACKENDS, isCuratedBackend, normalizeBackendUrl } from '@/services/auth';

const DEFAULT_SERVICE_PROVIDER = CURATED_BACKENDS[0]?.backend ?? 'https://bsky.social';

interface ServiceProviderState {
  selectedServiceProvider: string;
  selectedPdsBackend: string;
  setSelectedServiceProvider: (provider: string) => void;
  setSelectedPdsBackend: (provider: string) => void;
  resetSelectedServiceProvider: () => void;
}

export const useServiceProviderStore = create<ServiceProviderState>()(
  persist(
    set => ({
      selectedServiceProvider: DEFAULT_SERVICE_PROVIDER,
      selectedPdsBackend: DEFAULT_SERVICE_PROVIDER,
      setSelectedServiceProvider: provider => {
        const normalizedProvider = normalizeBackendUrl(provider);
        set(state => {
          const currentProvider = normalizeBackendUrl(state.selectedServiceProvider);
          const shouldSyncPds =
            normalizeBackendUrl(state.selectedPdsBackend) === currentProvider ||
            isCuratedBackend(normalizedProvider);

          return {
            selectedServiceProvider: normalizedProvider,
            selectedPdsBackend: shouldSyncPds
              ? normalizedProvider
              : normalizeBackendUrl(state.selectedPdsBackend),
          };
        });
      },
      setSelectedPdsBackend: provider => {
        set({ selectedPdsBackend: normalizeBackendUrl(provider) });
      },
      resetSelectedServiceProvider: () => {
        set({
          selectedServiceProvider: DEFAULT_SERVICE_PROVIDER,
          selectedPdsBackend: DEFAULT_SERVICE_PROVIDER,
        });
      },
    }),
    {
      name: 'service-provider-store',
      storage: createJSONStorage(() => storageAdapter),
    }
  )
);
