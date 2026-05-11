import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';

import { Colors } from '../../../theme';
import { formatHandle } from '../../../utils/formatting/handles';
import { useProfileByDid } from '../../../services/data/ProfileService';
import type { Like } from '../../../services/api/types';

import UI from '../../ui/UI';
import { VerificationBadge, BotBadge } from '../badging';
import { TextStyles } from '@/utils/components/typography';

type CommentLikeItemProps = {
  like: Like;
  onPress?: () => void;
};

const AVATAR_SIZE = 40;

const CommentLikeItemComponent: React.FC<CommentLikeItemProps> = ({ like, onPress }) => {
  const { navigateToProfile: goToProfile } = useProfileChannelNavigation();

  const actor = like?.actor;
  const handle = actor?.handle ?? '';
  const did = actor?.did ?? null;

  const { data: actorProfile } = useProfileByDid(did);
  const isActorBlocked = !!(actorProfile?.viewer?.blocking || actorProfile?.viewer?.blockingByList);

  const displayHandle = useMemo(() => formatHandle(handle) || handle || 'unknown', [handle]);

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress();
      return;
    }
    if (!did) return;
    goToProfile(did);
  }, [onPress, did, goToProfile]);

  return (
    <NativePressable onPress={handlePress} style={styles.row}>
      <View style={styles.avatarWrap}>
        <UI.Avatar
          uri={actor?.avatar}
          type="profile"
          size={AVATAR_SIZE}
          blurRadius={isActorBlocked ? 30 : 0}
          status={actorProfile?.status}
          style={styles.avatar}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {displayHandle}
          </Text>
          {handle ? (
            <VerificationBadge
              handle={handle}
              textSize={16}
              textColor={Colors.neutral[50]}
              verification={actorProfile?.verification}
            />
          ) : null}
          {handle ? (
            <BotBadge
              handle={handle}
              did={did ?? undefined}
              labels={actorProfile?.labels}
              textSize={16}
              textColor={Colors.neutral[50]}
            />
          ) : null}
        </View>
      </View>
    </NativePressable>
  );
};

export const CommentLikeItem = React.memo(CommentLikeItemComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  avatarWrap: {
    marginRight: 12,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  name: {
    ...TextStyles.profileHandle,
    flexShrink: 1,
    minWidth: 0,
    color: Colors.neutral[50],
  },
});
