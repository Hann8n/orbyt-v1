import React, { memo, useMemo, useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StatusBar, StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  interpolate,
  Extrapolate,
  type SharedValue,
} from 'react-native-reanimated';
import UniversalHeader, { HeaderContent } from './UniversalHeader';
import type { ProfileViewWithOrbyt } from '../../../services/api/types';
import { getProfileColors } from '../../../utils/formatting/colors';
import { useProfileFlags } from '../../../stores/profileInteractionStore';
import { useOrbytColors } from '../../../services/colors';
import VerificationBadge from '../../features/badging/VerificationBadge';
import BotBadge from '../../features/badging/BotBadge';
import BetaBadge from '../../features/badging/BetaBadge';
import BetaInfoSheet from '../../features/badging/BetaInfoSheet';
import { getStatusBarStyle } from '../../../utils/formatting/colors';
import { RichText } from '@atproto/api';
import { formatHandle } from '../../../utils/formatting/handles';
import { openListInBluesky } from '../../../utils/links/bluesky';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import { format, isValid, parseISO } from 'date-fns';

/**
 * Renders StatusBar only when this screen is focused (React Navigation recommended pattern).
 * When unfocused, the component unmounts and the root layout's StatusBar takes effect automatically.
 */

interface ProfileHeaderProps {
  children?: React.ReactNode;
  applySafeArea?: boolean;
  headerStyle?: StyleProp<ViewStyle>;
  onColorsChange?: (colors: { backgroundColor: string; textColor: string }) => void;
  contentFadeDisabled?: boolean;
  dimOverlayDisabled?: boolean;
  onAvatarPress?: () => void;
  /** When true, this header controls StatusBar. Default true. */
  controlStatusBar?: boolean;
  /** DID to fetch colors for */
  did: string | null;
  /** Profile data */
  profileData: ProfileViewWithOrbyt | null;
  /** Explicit shared scroll progress (0..1) from the profile feed list. */
  contentScrollProgressSV: SharedValue<number>;
  /** Optional action link in subtitle area (e.g. Germ DM) */
  subtitleAction?: { label: string; onPress: () => void };
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  children,
  applySafeArea = false,
  headerStyle,
  onColorsChange,
  contentFadeDisabled = false,
  dimOverlayDisabled = false,
  onAvatarPress,
  controlStatusBar = true,
  did,
  profileData,
  contentScrollProgressSV,
  subtitleAction,
}) => {
  const { t } = useTranslation();
  const { navigateToProfile: goToProfile } = useProfileChannelNavigation();
  const [showBetaInfo, setShowBetaInfo] = useState(false);

  const showVerificationInfoAlert = useCallback(() => {
    if (!profileData) return;
    const verification = profileData.verification;
    if (!verification) {
      Alert.alert(t('common.error'), t('profile.couldNotLoadVerification'), [
        { text: t('common.ok') },
      ]);
      return;
    }

    if (verification.trustedVerifierStatus === 'valid') {
      const name = profileData.displayName || profileData.handle || '';
      let message = `${name} ${t('profile.trustedVerifierDescription')}`;
      const createdAt = verification.verifications?.[0]?.createdAt;
      if (createdAt) {
        const d = parseISO(createdAt);
        if (isValid(d)) {
          message += `\n\n${t('profile.sinceDate', { date: format(d, 'MMM d, yyyy') })}`;
        }
      }
      Alert.alert(t('profile.trustedVerifier'), message, [{ text: t('common.ok') }]);
      return;
    }

    const message = t('profile.verificationBadgeDescription');
    const validVerification = verification.verifications?.find(v => v.isValid);
    const verifierDid = validVerification?.issuer?.trim();

    const buttons: { text: string; onPress?: () => void }[] = [];
    if (verifierDid) {
      buttons.push({
        text: t('profile.viewVerifier'),
        onPress: () => {
          goToProfile(verifierDid);
        },
      });
    }
    buttons.push({ text: t('common.ok') });
    Alert.alert(t('profile.verified'), message, buttons);
  }, [goToProfile, profileData, t]);

  const showBotAccountAlert = useCallback(() => {
    Alert.alert(t('profile.botAccountTitle'), t('profile.botAccountDescription'), [
      { text: t('common.ok') },
    ]);
  }, [t]);
  const isFocused = useIsFocused();
  // Same scroll progress as header (contentScrollProgressSV); use profile status bar at top, app default when scrolled.
  // Only runOnJS when the decision flips (not every frame) so we don't cross the bridge on every scroll tick.
  const [useProfileStatusBar, setUseProfileStatusBar] = useState(true);

  useAnimatedReaction(
    () => (contentScrollProgressSV?.value ?? 0) < 0.25,
    (useProfile, prev) => {
      'worklet';
      if (prev === null || useProfile !== prev) {
        runOnJS(setUseProfileStatusBar)(useProfile);
      }
    },
    [contentScrollProgressSV]
  );

  // Merge profile payload + query colors, but prefer query for canonical Orbyt API fields.
  const { data: orbytColorsFromQuery } = useOrbytColors(did);
  const profileOrbytColors = profileData?.orbytColors;
  const orbytColors = useMemo(() => {
    if (!profileOrbytColors) return orbytColorsFromQuery;
    if (!orbytColorsFromQuery) return profileOrbytColors;
    return {
      ...profileOrbytColors,
      ...orbytColorsFromQuery,
    };
  }, [profileOrbytColors, orbytColorsFromQuery]);

  const profileColors = getProfileColors(orbytColors);
  const joinDate = orbytColors?.joinedAt;

  const isBeta = orbytColors?.isBeta ?? false;

  // Block status and flags (used for avatar blur only; actions moved to ProfileScreen)
  // Use moderation flags directly from ProfileView viewer fields
  // Fallback to store flags for optimistic updates during mutations
  const { flags } = useProfileFlags(profileData?.did, profileData?.handle);
  const isBlocked =
    !!(profileData?.viewer?.blocking || profileData?.viewer?.blockingByList) ||
    (flags?.isBlocked ?? false);
  const blockingByList = profileData?.viewer?.blockingByList;

  // Handler to open the blocking list in Bluesky app
  const handleListPress = useCallback(async () => {
    if (blockingByList?.uri) {
      await openListInBluesky(blockingByList.uri);
    }
  }, [blockingByList]);

  // Create header content with custom description component
  const headerContent = useMemo((): HeaderContent => {
    if (!profileData) {
      return {
        title: '',
        subtitle: '',
      };
    }

    // Compose subtitle lines: handle only (joined date moved to Beta Info Sheet)
    const subtitle: string | undefined = profileData.handle ? profileData.handle : undefined;
    // Show blocking indicator if blocked by list
    const subtitleSecondary: string | undefined = blockingByList
      ? t('profile.blockedBy', { name: blockingByList.name })
      : undefined;

    // Parse description to generate rich text facets
    const richText = profileData.description
      ? (() => {
          const rt = new RichText({ text: profileData.description });
          rt.detectFacetsWithoutResolution();
          return rt;
        })()
      : null;

    return {
      avatar: profileData.avatar || undefined,
      title: profileData.displayName || formatHandle(profileData.handle) || t('feed.unknownUser'),
      subtitle,
      subtitleSecondary,
      onSubtitleSecondaryPress: blockingByList ? handleListPress : undefined,
      subtitleAction,
      // Hide description when blocked
      description: isBlocked ? undefined : richText?.text,
      facets: isBlocked ? undefined : richText?.facets,
      badge: profileData.handle ? (
        <>
          <VerificationBadge
            handle={profileData.handle}
            textSize={24}
            borderColor={profileColors.textColor}
            textColor={profileColors.textColor}
            onPress={showVerificationInfoAlert}
            verification={profileData.verification}
          />
          <BotBadge
            handle={profileData.handle}
            did={profileData.did}
            labels={profileData.labels}
            textSize={24}
            borderColor={profileColors.textColor}
            textColor={profileColors.textColor}
            onPress={showBotAccountAlert}
          />
          {isBeta && (
            <NativePressable onPress={() => setShowBetaInfo(true)}>
              <BetaBadge textSize={20} color={profileColors.textColor} opacity={0.6} scale={0.8} />
            </NativePressable>
          )}
        </>
      ) : undefined,
      avatarBlurRadius: isBlocked ? 30 : 0,
      status: profileData?.status,
      onAvatarPress,
    };
  }, [
    profileData,
    profileColors.textColor,
    isBeta,
    isBlocked,
    blockingByList,
    handleListPress,
    onAvatarPress,
    subtitleAction,
    showBotAccountAlert,
    showVerificationInfoAlert,
    t,
  ]);

  // Get colors for description and tab navigation
  const dynamicColors = useMemo(
    () => ({
      backgroundColor: profileColors.backgroundColor,
      textColor: profileColors.textColor,
    }),
    [profileColors.backgroundColor, profileColors.textColor]
  );

  // Profile status bar: used when at top; when scrolled we use app default so status bar transitions with header
  const profileStatusBarStyle = useMemo(() => {
    if (!controlStatusBar) return 'light-content';
    const style = getStatusBarStyle(profileColors.backgroundColor);
    return style === 'light' ? 'light-content' : 'dark-content';
  }, [controlStatusBar, profileColors.backgroundColor]);

  const effectiveBarStyle = useProfileStatusBar ? profileStatusBarStyle : 'light-content';
  const effectiveBackgroundColor = useProfileStatusBar
    ? dynamicColors.backgroundColor
    : 'transparent';

  // Notify parent of color changes
  useEffect(() => {
    onColorsChange?.(dynamicColors);
  }, [dynamicColors, onColorsChange]);

  const dimOverlayStyle = useAnimatedStyle(() => {
    const progress = contentScrollProgressSV?.value ?? 0;
    if (dimOverlayDisabled) {
      return { ...StyleSheet.absoluteFillObject, opacity: 0, pointerEvents: 'none' };
    }
    // More gradual dim: start dimming at 40% progress, reach 30% black opacity at max scroll
    return {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'black',
      opacity: interpolate(progress, [0, 0.5, 1], [0, 0, 0.3], Extrapolate.CLAMP),
      pointerEvents: 'none',
    };
  }, [contentScrollProgressSV]);

  return (
    <>
      {controlStatusBar && isFocused && (
        <StatusBar
          barStyle={effectiveBarStyle}
          backgroundColor={effectiveBackgroundColor}
          translucent={true}
        />
      )}
      <View>
        <UniversalHeader
          content={headerContent}
          actions={[]}
          customActions={[]}
          showBackButton={false}
          onBackPress={undefined}
          backgroundColor={dynamicColors.backgroundColor}
          textColor={dynamicColors.textColor}
          isLoading={false}
          applySafeArea={applySafeArea}
          reserveTopForOverlayButtons={!headerStyle}
          contentScrollProgress={contentFadeDisabled ? undefined : contentScrollProgressSV}
          style={headerStyle}
          showShadowGradient={false}
        >
          {/* Hide tabs when blocked */}
          {!isBlocked && children}
        </UniversalHeader>
        {/* Dim overlay above background as user scrolls */}
        <Animated.View style={dimOverlayStyle} />
      </View>

      {profileData?.handle && (
        <BetaInfoSheet
          visible={showBetaInfo}
          handle={profileData.handle}
          joinDate={joinDate}
          onDismiss={() => setShowBetaInfo(false)}
        />
      )}
    </>
  );
};

export default memo(ProfileHeader);
