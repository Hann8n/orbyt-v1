import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '@/theme';
import { SquircleNativePressable, SquircleView } from '@/components/ui/Squircle';
import { authSheetStyles } from '@/components/ui/AuthSheetStyles';
import AuthModalLayout, { AUTH_KEYBOARD_OVERLAP_SIGN_IN } from '@/components/ui/AuthModalLayout';
import Icon, {
  CheckboxCuteFilledDuotoneIcon,
  CuteRegularSquareBoxEmptyIcon,
} from '@/components/ui/Icon';
import { NativePressable } from '@/components/ui/NativePressable';
import { authorListRowStyle } from '@/components/ui/ItemStyles';
import {
  CURATED_BACKENDS,
  getProviderMetadata,
  isCuratedBackend,
  normalizeBackendUrl,
} from '@/services/auth';
import { useServiceProviderStore } from '@/stores/serviceProviderStore';
import { FontFamily, Typography } from '@/utils/components/typography';
import { BORDER_RADIUS } from '@/utils/constants';

export default function ServiceProviderSelectScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { target } = useLocalSearchParams<{ target?: string }>();
  const isPdsMode = target === 'pds';
  const selectedServiceProvider = useServiceProviderStore(state => state.selectedServiceProvider);
  const selectedPdsBackend = useServiceProviderStore(state => state.selectedPdsBackend);
  const setSelectedServiceProvider = useServiceProviderStore(
    state => state.setSelectedServiceProvider
  );
  const setSelectedPdsBackend = useServiceProviderStore(state => state.setSelectedPdsBackend);

  const [providerInput, setProviderInput] = useState('');
  const [pendingServiceProvider, setPendingServiceProvider] = useState(
    isPdsMode ? selectedPdsBackend : selectedServiceProvider
  );

  const filteredProviders = useMemo(() => {
    const query = providerInput.trim().toLowerCase();
    if (!query) return CURATED_BACKENDS;
    return CURATED_BACKENDS.filter(
      provider =>
        provider.label.toLowerCase().includes(query) ||
        provider.key.toLowerCase().includes(query) ||
        provider.backend.toLowerCase().includes(query)
    );
  }, [providerInput]);

  const handleSelect = (provider: string) => {
    setPendingServiceProvider(provider);
  };

  const handleDone = () => {
    const nextProvider =
      providerInput.trim().length > 0 ? normalizeBackendUrl(providerInput) : pendingServiceProvider;
    if (isPdsMode) {
      setSelectedPdsBackend(nextProvider);
      router.back();
      return;
    }

    setSelectedServiceProvider(nextProvider);

    if (!isCuratedBackend(nextProvider)) {
      setSelectedPdsBackend(nextProvider);
      router.replace({
        pathname: '/service-provider-select',
        params: { target: 'pds' },
      });
      return;
    }

    router.back();
  };

  const canApply = pendingServiceProvider.trim().length > 0 || providerInput.trim().length > 0;

  const fixedBody = (
    <SquircleView style={styles.searchInputContainer}>
      <View style={styles.searchRow}>
        <Icon name="search" size={22} color={Colors.neutral[300]} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('auth.accountProviderPlaceholder')}
          placeholderTextColor={Colors.neutral[500]}
          value={providerInput}
          onChangeText={setProviderInput}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          accessibilityLabel={
            isPdsMode ? t('auth.pdsBackendInput') : t('auth.accountProviderInput')
          }
          autoFocus
        />
      </View>
    </SquircleView>
  );

  const stickyFooter = (
    <SquircleNativePressable
      style={[authSheetStyles.button, styles.stickyCta, canApply && authSheetStyles.buttonActive]}
      onPress={handleDone}
      disabled={!canApply}
      accessibilityRole="button"
      accessibilityLabel={t('common.done')}
      accessibilityState={{ disabled: !canApply }}
    >
      <View style={authSheetStyles.buttonContentRow}>
        <Text style={[authSheetStyles.buttonText, canApply && authSheetStyles.buttonTextActive]}>
          {t('common.done')}
        </Text>
        <Icon
          name="arrow_right"
          size={24}
          color={canApply ? Colors.neutral[975] : Colors.neutral[500]}
        />
      </View>
    </SquircleNativePressable>
  );

  return (
    <AuthModalLayout
      title={isPdsMode ? t('auth.pdsBackendInput') : t('auth.accountProviderInput')}
      fixedBody={fixedBody}
      keyboardOverlapSpace={AUTH_KEYBOARD_OVERLAP_SIGN_IN}
      disableStickyFooterChrome
      stickyFooter={stickyFooter}
    >
      <View style={styles.content}>
        <View style={styles.providersSection}>
          <View style={styles.list}>
            {filteredProviders.map(provider => {
              const normalized = normalizeBackendUrl(provider.backend);
              const isSelected = pendingServiceProvider === normalized;
              const providerMetadata = getProviderMetadata(provider.backend);
              return (
                <NativePressable
                  key={provider.key}
                  onPress={() => handleSelect(normalized)}
                  style={[styles.providerRow, authorListRowStyle]}
                  accessibilityRole="button"
                  accessibilityLabel={provider.label}
                >
                  {providerMetadata.iconName ? (
                    <View style={styles.providerLogoWrap}>
                      <Icon name={providerMetadata.iconName} size={24} color={Colors.neutral[50]} />
                    </View>
                  ) : null}
                  <View style={styles.providerTextGroup}>
                    <Text style={styles.providerTitle}>{providerMetadata.displayName}</Text>
                    <Text style={styles.providerDescription}>{providerMetadata.domain}</Text>
                  </View>
                  <View style={styles.providerCheckWrap}>
                    {isSelected ? (
                      <CheckboxCuteFilledDuotoneIcon
                        size={24}
                        boxColor={Colors.neutral[50]}
                        checkColor={Colors.neutral[975]}
                        checkOpacity={1}
                      />
                    ) : (
                      <CuteRegularSquareBoxEmptyIcon size={24} color={Colors.neutral[200]} />
                    )}
                  </View>
                </NativePressable>
              );
            })}
            {filteredProviders.length === 0 ? (
              <View style={styles.emptyStateWrap}>
                <Text style={styles.emptyStateTitle}>{t('auth.noProvidersFoundSingleLine')}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </AuthModalLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 16,
    gap: 10,
  },
  searchInputContainer: {
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.neutral[800],
  },
  searchRow: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: Colors.neutral[50],
    fontSize: Typography.sizes.subtitle,
    lineHeight: Typography.lineHeights.subtitle,
    fontFamily: FontFamily.medium,
    padding: 0,
    paddingVertical: 0,
    textAlignVertical: 'center',
    ...(Platform.OS === 'android' && {
      includeFontPadding: false,
    }),
  },
  providersSection: {
    gap: 4,
  },
  list: {
    backgroundColor: Colors.transparent,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  providerLogoWrap: {
    width: 32,
    height: 32,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerTextGroup: {
    flex: 1,
    paddingRight: 12,
    gap: 1,
  },
  providerTitle: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.subtitle,
    lineHeight: Typography.lineHeights.subtitle,
    fontFamily: FontFamily.medium,
  },
  providerDescription: {
    color: Colors.neutral[300],
    fontSize: Typography.sizes.bodySmall,
    lineHeight: Typography.lineHeights.bodySmall,
    fontFamily: FontFamily.regular,
  },
  providerCheckWrap: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateWrap: {
    width: '100%',
    paddingTop: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateTitle: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.subtitle,
    lineHeight: Typography.lineHeights.subtitle,
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
  },
  stickyCta: {
    marginTop: 0,
    marginBottom: 0,
  },
});
