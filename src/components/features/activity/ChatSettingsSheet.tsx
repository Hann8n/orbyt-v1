import { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import VerticalListSheet, {
  VerticalListCheckboxButton,
  TrueSheet,
} from '../../ui/VerticalListSheet';
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

  useEffect(() => {
    if (visible) TrueSheet.present('chat-settings-sheet');
  }, [visible]);

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
      name="chat-settings-sheet"
      onDismiss={onDismiss}
      title="Who can message you"
      showCancelButton
      cancelButtonText="Done"
    >
      <View style={styles.content}>
        {OPTIONS.map(opt => (
          <VerticalListCheckboxButton
            key={opt.value}
            label={opt.label}
            checked={localAllowIncoming === opt.value}
            onPress={() => handleSelect(opt.value)}
          />
        ))}
      </View>
    </VerticalListSheet>
  );
}

const styles = StyleSheet.create({
  content: {},
});
