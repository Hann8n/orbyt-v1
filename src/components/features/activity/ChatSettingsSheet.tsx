import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import VerticalListSheet, { VerticalListCheckboxButton } from '../../ui/VerticalListSheet';
import { SHEET_STYLES } from '../../../utils/components/truesheet';
import { ChatService } from '../../../services/api/chat/ChatService';
import { useUserStore } from '../../../stores/userStore';
import { useProfileByDid } from '../../../services/data/ProfileService';
import { queryKeys } from '../../../utils/query/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { useSheetPresentation } from '../../../hooks';

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

  useSheetPresentation(visible, 'chat-settings-sheet');

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
    <VerticalListSheet name="chat-settings-sheet" onDismiss={onDismiss}>
      <Text style={SHEET_STYLES.sheetScreenTitle}>{t('activity.whoCanMessage')}</Text>
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
