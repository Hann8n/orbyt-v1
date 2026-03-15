import React, { memo, useMemo, useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBar, Pressable, StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
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
import BetaBadge from '../../features/badging/BetaBadge';
import BetaInfoSheet from '../../features/badging/BetaInfoSheet';
import VerificationInfoSheet from '../../features/badging/VerificationInfoSheet';
import { getStatusBarStyle } from '../../../utils/formatting/colors';
import { RichText } from '@atproto/api';
import { formatHandle } from '../../../utils/formatting/handles';
import { openListInBluesky } from '../../../utils/links/bluesky';

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
  /** When true, this header controls StatusBar (root profile or classic card). When false (modal), StatusBar is not part of this screen. Default true. */
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
  const [showVerificationInfo, setShowVerificationInfo] = useState(false);
  const [showBetaInfo, setShowBetaInfo] = useState(false);
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
            onPress={() => setShowVerificationInfo(true)}
            verification={profileData.verification}
          />
          {isBeta && (
            <Pressable onPress={() => setShowBetaInfo(true)}>
              <BetaBadge textSize={20} color={profileColors.textColor} opacity={0.6} scale={0.8} />
            </Pressable>
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
        <VerificationInfoSheet
          visible={showVerificationInfo}
          handle={profileData.handle}
          onDismiss={() => setShowVerificationInfo(false)}
        />
      )}

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
