import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

interface ChatSettingsSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function ChatSettingsSheet({ visible, onDismiss }: ChatSettingsSheetProps) {
  const { t } = useTranslation();
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
      title={t('activity.whoCanMessage')}
      showCancelButton
      cancelButtonText={t('common.done')}
    >
      {[
        { value: 'all' as AllowIncoming, labelKey: 'activity.everyone' },
        { value: 'following' as AllowIncoming, labelKey: 'activity.peopleYouFollow' },
        { value: 'none' as AllowIncoming, labelKey: 'activity.noOne' },
      ].map(opt => (
        <VerticalListCheckboxButton
          key={opt.value}
          label={t(opt.labelKey)}
          checked={localAllowIncoming === opt.value}
          onPress={() => handleSelect(opt.value)}
        />
      ))}
    </VerticalListSheet>
  );
}
