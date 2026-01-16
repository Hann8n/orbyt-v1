import React, { memo, useMemo, useCallback, useState, useEffect } from 'react';
import { StatusBar, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import UniversalHeader, { HeaderContent } from './UniversalHeader';
import { useProfile } from '../../../services/data/ProfileService';
import { getProfileColors } from '../../../utils/formatting/colors';
import { useProfileFlags } from '../../../stores/profileInteractionStore';
import { useOrbytColors } from '../../../hooks/useOrbytColors';
import VerificationBadge from '../../features/badging/VerificationBadge';
import BetaBadge from '../../features/badging/BetaBadge';
import BetaInfoSheet from '../../features/badging/BetaInfoSheet';
import VerificationInfoSheet from '../../features/badging/VerificationInfoSheet';
import { getStatusBarStyle } from '../../../utils/formatting/colors';
import { RichText } from '@atproto/api';
import { formatHandle } from '../../../utils/formatting/handles';
import { openListInBluesky } from '../../../utils/links/bluesky';

interface ProfileHeaderProps {
  handle: string | null;
  children?: React.ReactNode;
  applySafeArea?: boolean;
  headerStyle?: ViewStyle;
  onColorsChange?: (colors: { backgroundColor: string; textColor: string }) => void;
  headerScrollProgress?: SharedValue<number>;
  contentFadeDisabled?: boolean;
  dimOverlayDisabled?: boolean;
  onAvatarPress?: () => void;
  /** Beta status from Orbyt API */
  isBeta?: boolean;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  handle,
  children,
  applySafeArea = false,
  headerStyle,
  onColorsChange,
  headerScrollProgress,
  contentFadeDisabled = false,
  dimOverlayDisabled = false,
  onAvatarPress,
  isBeta = false,
}) => {
  const [showVerificationInfo, setShowVerificationInfo] = useState(false);
  const [showBetaInfo, setShowBetaInfo] = useState(false);

  // Use profile data from React Query cache
  const { data: profile } = useProfile(handle);
  const profileData = profile;

  // Get colors from Orbyt API
  const { data: orbytColors } = useOrbytColors(profileData?.did);

  // Get colors from Orbyt API (primary) or defaults
  const profileColors = getProfileColors(orbytColors);
  const joinDate = orbytColors?.joinedAt;

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
      ? `Blocked by ${blockingByList.name}`
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
      title: profileData.displayName || formatHandle(profileData.handle) || 'Unknown User',
      subtitle,
      subtitleSecondary,
      onSubtitleSecondaryPress: blockingByList ? handleListPress : undefined,
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
  ]);

  // Get colors for description and tab navigation
  const dynamicColors = useMemo(
    () => ({
      backgroundColor: profileColors.backgroundColor,
      textColor: profileColors.textColor,
    }),
    [profileColors.backgroundColor, profileColors.textColor]
  );

  // Determine status bar style based on background color brightness
  const statusBarStyle = useMemo(() => {
    const style = getStatusBarStyle(profileColors.backgroundColor);
    return style === 'light' ? 'light-content' : 'dark-content';
  }, [profileColors.backgroundColor]);

  // Notify parent of color changes
  useEffect(() => {
    onColorsChange?.(dynamicColors);
  }, [dynamicColors, onColorsChange]);

  const dimOverlayStyle = useAnimatedStyle(() => {
    const progress = headerScrollProgress?.value ?? 0;
    if (dimOverlayDisabled) {
      return { ...StyleSheet.absoluteFillObject, opacity: 0, pointerEvents: 'none' };
    }
    // More gradual dim: start dimming at 40% progress, reach 30% black opacity at max scroll
    return {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'black',
      opacity: interpolate(progress, [0, 0.4, 1], [0, 0, 0.3], Extrapolate.CLAMP),
      pointerEvents: 'none',
    };
  }, [headerScrollProgress]);

  return (
    <>
      <StatusBar
        barStyle={statusBarStyle}
        backgroundColor={dynamicColors.backgroundColor}
        translucent={true}
      />
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
          contentScrollProgress={contentFadeDisabled ? undefined : headerScrollProgress}
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
