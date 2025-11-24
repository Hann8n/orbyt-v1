import React from 'react';
import { useRouter } from 'expo-router';
import ListScreen from '../../src/components/ui/ListScreen';
import { useModerationList } from '../../src/hooks';

const BlockedUsersScreen: React.FC = () => {
  const navigation = useRouter();
  const { users: blockedUsers, loading, handleAction } = useModerationList({ type: 'blocked' });

  return (
    <ListScreen
      title="Blocked accounts"
      data={blockedUsers}
      isLoading={loading}
      error={null}
      emptyIcon="shield-shape-fill"
      emptyTitle="No blocked accounts"
      emptySubtitle="You haven't blocked any accounts yet. Blocked accounts won't be able to see your content or interact with you."
      showFollowButton={true}
      followButtonIcon="minus-fill"
      followButtonAction="unblock"
      onActionPress={handleAction}
    />
  );
};

export default BlockedUsersScreen; 