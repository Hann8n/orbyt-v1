import React, { memo, useMemo, useCallback, useState, useEffect } from 'react';
import { StatusBar, Pressable, StyleSheet, View } from 'react-native';
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
import { useOrbytProfile } from '../../../hooks';
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
  headerStyle?: any;
  onColorsChange?: (colors: { backgroundColor: string; textColor: string }) => void;
  headerScrollProgress?: SharedValue<number>;
  contentFadeDisabled?: boolean;
  dimOverlayDisabled?: boolean;
  onAvatarPress?: () => void;
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
}) => {
  const [showVerificationInfo, setShowVerificationInfo] = useState(false);
  const [showBetaInfo, setShowBetaInfo] = useState(false);

  // Use profile data and colors from React Query cache
  const { data: profile } = useProfile(handle);

  // React Query cache provides instant data on subsequent renders
  const profileData = profile;

  // Get colors from profile data
  const profileColors = getProfileColors(profileData);

  // Block status and flags (used for avatar blur only; actions moved to ProfileScreen)
  // Use moderation flags directly from ProfileView viewer fields
  // Fallback to store flags for optimistic updates during mutations
  const { flags } = useProfileFlags(profileData?.did, profileData?.handle);
  const isBlocked =
    !!(profileData?.viewer?.blocking || profileData?.viewer?.blockingByList) ||
    (flags?.isBlocked ?? false);
  const blockingByList = profileData?.viewer?.blockingByList;

  // Fetch Orbyt profile record join date for this DID
  const { joinDate } = useOrbytProfile(profileData?.did);

  // Extract live status

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

    // Determine beta user by join date cutoff
    const betaCutoff = new Date('2026-01-24T00:00:00.000Z');
    const isBeta = (() => {
      try {
        if (!joinDate) return false;
        const d = new Date(joinDate);
        return d.getTime() < betaCutoff.getTime();
      } catch {
        return false;
      }
    })();

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
          {isBeta && (
            <Pressable onPress={() => setShowBetaInfo(true)}>
              <BetaBadge textSize={24} color={profileColors.textColor} opacity={0.55} />
            </Pressable>
          )}
          <VerificationBadge
            handle={profileData.handle}
            textSize={24}
            borderColor={profileColors.textColor}
            textColor={profileColors.textColor}
            onPress={() => setShowVerificationInfo(true)}
            verification={profileData.verification}
          />
        </>
      ) : undefined,
      avatarBlurRadius: isBlocked ? 30 : 0,
      status: profileData?.status,
      onAvatarPress,
    };
  }, [
    profileData,
    profileColors.textColor,
    joinDate,
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
      return { ...StyleSheet.absoluteFillObject, opacity: 0, pointerEvents: 'none' } as any;
    }
    // More gradual dim: start dimming at 40% progress, reach 30% black opacity at max scroll
    return {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'black',
      opacity: interpolate(progress, [0, 0.4, 1], [0, 0, 0.3], Extrapolate.CLAMP),
      pointerEvents: 'none',
    } as any;
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
          reserveTopForOverlayButtons={true}
          contentScrollProgress={contentFadeDisabled ? undefined : headerScrollProgress}
          style={{ opacity: 1 }}
          contentStyle={headerStyle}
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
