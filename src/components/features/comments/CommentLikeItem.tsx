import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Colors } from '../../../theme';
import { formatHandle } from '../../../utils/formatting/handles';
import { useProfile } from '../../../services/data/ProfileService';
import { useAvatarProfileRing } from '../../../services/colors';
import type { Like } from '../../../services/api/types';

import UI from '../../ui/UI';
import { VerificationBadge } from '../badging';

type CommentLikeItemProps = {
  like: Like;
  onPress?: () => void;
};

const AVATAR_SIZE = 40;

const CommentLikeItemComponent: React.FC<CommentLikeItemProps> = ({ like, onPress }) => {
  const router = useRouter();

  const actor = like?.actor;
  const handle = actor?.handle ?? '';
  const did = actor?.did ?? null;

  const { data: actorProfile } = useProfile(handle);
  const ringProps = useAvatarProfileRing(did);
  const isActorBlocked = !!(actorProfile?.viewer?.blocking || actorProfile?.viewer?.blockingByList);

  const displayHandle = useMemo(() => formatHandle(handle) || handle || 'unknown', [handle]);

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress();
      return;
    }
    if (!did) return;
    router.navigate({
      pathname: '/profile/[did]',
      params: { did },
    });
  }, [onPress, did, router]);

  return (
    <Pressable onPress={handlePress} style={styles.row}>
      <View style={styles.avatarWrap}>
        <UI.Avatar
          uri={actor?.avatar}
          type="profile"
          size={AVATAR_SIZE}
          showRing={ringProps.showRing}
          ringColor={ringProps.ringColor}
          profileColors={ringProps.profileColors}
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
        </View>
      </View>
    </Pressable>
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
    gap: 6,
    minWidth: 0,
  },
  name: {
    flexShrink: 1,
    minWidth: 0,
    color: Colors.neutral[50],
    fontSize: 16,
    fontFamily: 'Figtree-Bold',
    lineHeight: 20,
  },
});
