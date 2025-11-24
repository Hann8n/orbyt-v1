import React from 'react';
import { useRouter } from 'expo-router';
import ListScreen from '../../src/components/ui/ListScreen';
import { useModerationList } from '../../src/hooks';

const MutedUsersScreen: React.FC = () => {
  const navigation = useRouter();
  const { users: mutedUsers, loading, handleAction } = useModerationList({ type: 'muted' });

  return (
    <ListScreen
      title="Muted accounts"
      data={mutedUsers}
      isLoading={loading}
      error={null}
      emptyIcon="volume-x"
      emptyTitle="No muted accounts"
      emptySubtitle="You haven't muted any accounts yet. Muted accounts' posts won't appear in your feed, but they can still see your content."
      showFollowButton={true}
      followButtonIcon="minus-fill"
      followButtonAction="unmute"
      onActionPress={handleAction}
    />
  );
};

export default MutedUsersScreen; 