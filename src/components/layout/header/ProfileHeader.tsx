import React, { memo, useMemo, useCallback, useState, useEffect } from 'react';
import { StatusBar, Pressable, StyleSheet } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import UniversalHeader, { HeaderContent } from './UniversalHeader';
import { useProfile, useProfileColors } from '../../../services/cache/ProfileCache';
import { useProfileFlags } from '../../../stores/profileInteractionStore';
import { useOrbytProfile } from '../../../hooks';
import VerificationBadge from '../../features/badging/VerificationBadge';
import BetaBadge from '../../features/badging/BetaBadge';
import BetaInfoSheet from '../../features/badging/BetaInfoSheet';
import VerificationInfoSheet from '../../features/badging/VerificationInfoSheet';
import ProfileCache from '../../../services/cache/ProfileCache';
import { getStatusBarStyle } from '../../../utils/formatting/colorUtils';
import { parseRichText } from '../../../utils/richTextParser';
import { formatHandle } from '../../../utils/helpers';
import { useUserSubscription } from '../../../stores/subscriptionStore';

interface ProfileHeaderProps {
  handle: string | null;
  showBackButton?: boolean; // kept for API compatibility (handled by ProfileScreen overlay)
  onBackPress?: () => void; // kept for API compatibility
  isOwnProfile?: boolean; // kept for API compatibility
  onLogout?: (clearAllAccounts?: boolean) => Promise<void>; // kept for API compatibility
  onSwitchAccount?: () => void; // kept for API compatibility
  forceLoading?: boolean;
  children?: React.ReactNode;
  applySafeArea?: boolean;
  headerStyle?: any;
  onColorsChange?: (colors: { backgroundColor: string; textColor: string }) => void;
  headerScrollProgress?: SharedValue<number>;
  contentFadeDisabled?: boolean;
  dimOverlayDisabled?: boolean;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  handle,
  showBackButton = false,
  onBackPress,
  isOwnProfile = false,
  onLogout,
  onSwitchAccount,
  forceLoading = false,
  children,
  applySafeArea = false,
  headerStyle,
  onColorsChange,
  headerScrollProgress,
  contentFadeDisabled = false,
  dimOverlayDisabled = false,
}) => {
  const [showVerificationInfo, setShowVerificationInfo] = useState(false);
  const [showBetaInfo, setShowBetaInfo] = useState(false);

  // Use profile data and colors from cache
  const {
    data: profile,
    isLoading: isProfileLoading,
    isError: isProfileError,
    refetch: refetchProfile,
  } = useProfile(handle);

  const { colors: profileColors } = useProfileColors(handle);

  // Ensure profile data is immediately available from cache to prevent flashing
  const profileData = profile || (handle ? ProfileCache.getProfileFromCacheSync(handle) : null);

  // Block status and flags (used for avatar blur only; actions moved to ProfileScreen)
  const { flags } = useProfileFlags(profileData?.did, profileData?.handle);
  const isBlocked = !!flags?.isBlocked;

  // Fetch Orbyt profile record join date for this DID
  const { joinDate } = useOrbytProfile(profileData?.did);
  
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
    // Do not show joined date in header; it's displayed in BetaInfoSheet

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
    const parsedDescription = profileData.description 
      ? parseRichText(profileData.description)
      : null;

    return {
      avatar: profileData.avatar || undefined,
      title: profileData.displayName || formatHandle(profileData.handle) || 'Unknown User',
      subtitle,
      // subtitleSecondary intentionally omitted (no joined date in header)
      description: parsedDescription?.text,
      facets: parsedDescription?.facets,
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
          />
        </>
      ) : undefined,
      avatarBlurRadius: isBlocked ? 30 : 0,
    };
  }, [profileData, profileColors.textColor, joinDate, isBlocked]);


  // Get colors for description and tab navigation
  const dynamicColors = useMemo(() => {
    return {
      backgroundColor: profileColors.backgroundColor,
      textColor: profileColors.textColor,
    };
  }, [profileColors.backgroundColor, profileColors.textColor]);

  // Determine status bar style based on background color brightness
  const statusBarStyle = useMemo(() => {
    const style = getStatusBarStyle(dynamicColors.backgroundColor);
    return style === 'light' ? 'light-content' : 'dark-content';
  }, [dynamicColors.backgroundColor]);

  // Notify parent of color changes
  useEffect(() => {
    onColorsChange?.(dynamicColors);
  }, [dynamicColors, onColorsChange]);

  // Animated styles driven by shared scroll progress (0 -> 1)
  const headerAnimatedStyle = useAnimatedStyle(() => {
    // Keep container fully opaque; inner UniversalHeader handles content fade
    return { opacity: 1 };
  }, []);

  const dimOverlayStyle = useAnimatedStyle(() => {
    const progress = headerScrollProgress?.value ?? 0;
    if (dimOverlayDisabled) {
      return { ...StyleSheet.absoluteFillObject, opacity: 0, pointerEvents: 'none' } as any;
    }
    // More gradual dim: start dimming at 40% progress, reach 30% black opacity at max scroll
    const overlayOpacity = interpolate(progress, [0, 0.4, 1], [0, 0, 0.3], Extrapolate.CLAMP);
    return {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'black',
      opacity: overlayOpacity,
      pointerEvents: 'none',
    } as any;
  }, [headerScrollProgress]);


  return (
    <>
      <StatusBar barStyle={statusBarStyle} backgroundColor={dynamicColors.backgroundColor} translucent={true} />
      <Animated.View style={headerAnimatedStyle}>
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
          contentStyle={[headerStyle]}
          showShadowGradient={false}
        >
          {children}
        </UniversalHeader>
        {/* Dim overlay above background as user scrolls */}
        <Animated.View style={dimOverlayStyle} />
      </Animated.View>

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