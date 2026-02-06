import { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Icon from '../../ui/Icon';
import VerticalListSheet from '../../ui/VerticalListSheet';
import { OptionsButton } from '../../ui/OptionsButton';
import { Colors } from '../../../theme';
import { ChatService } from '../../../services/api/chat/ChatService';
import { useUserStore } from '../../../stores/userStore';
import { useProfileByDid } from '../../../services/data/ProfileService';
import { queryKeys } from '../../../utils/query/queryKeys';
import { useQueryClient } from '@tanstack/react-query';

type AllowIncoming = 'all' | 'none' | 'following';

const OPTIONS: { value: AllowIncoming; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'following', label: 'People you follow' },
  { value: 'none', label: 'No one' },
];

interface ChatSettingsSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function ChatSettingsSheet({ visible, onDismiss }: ChatSettingsSheetProps) {
  const queryClient = useQueryClient();
  const currentUser = useUserStore(s => s.currentUser);
  const did = currentUser?.did ?? null;
  const { data: profile } = useProfileByDid(did);
  const initialAllowIncoming: AllowIncoming =
    (profile as { associated?: { chat?: { allowIncoming?: AllowIncoming } } })?.associated?.chat
      ?.allowIncoming ?? 'all';

  const [localAllowIncoming, setLocalAllowIncoming] = useState<AllowIncoming>(initialAllowIncoming);

  useEffect(() => {
    setLocalAllowIncoming(initialAllowIncoming);
  }, [initialAllowIncoming]);

  const handleSelect = useCallback(
    (value: AllowIncoming) => {
      setLocalAllowIncoming(value);
      if (did) {
        ChatService.updateChatDeclaration(did, value).then(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.profiles.detail(did) });
        });
      }
    },
    [did, queryClient]
  );

  return (
    <VerticalListSheet
      visible={visible}
      onDismiss={onDismiss}
      title="Who can message you"
      showCancelButton={true}
      cancelButtonText="Done"
      detents={['auto']}
    >
      <View style={styles.content}>
        {OPTIONS.map(opt => (
          <OptionsButton
            key={opt.value}
            label={opt.label}
            onPress={() => handleSelect(opt.value)}
            linkType="none"
            rightContent={
              localAllowIncoming === opt.value ? (
                <Icon name="checkmark" size={22} color={Colors.neutral[50]} />
              ) : undefined
            }
            containerStyle={styles.option}
          />
        ))}
      </View>
    </VerticalListSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 10,
  },
  option: {
    marginBottom: 12,
  },
});
