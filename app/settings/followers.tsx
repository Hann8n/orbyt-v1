import React from 'react';
import ListScreen from '../../src/components/ui/ListScreen';
import { useUserList, useProfileNavigation } from '../../src/hooks';

const FollowersScreen: React.FC = () => {
  const { users: followers, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, error } = useUserList({ type: 'followers' });
  const { navigateToProfile } = useProfileNavigation();

  return (
    <ListScreen
      title="Your followers"
      data={followers}
      isLoading={isLoading}
      error={error}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      emptyIcon="users"
      emptyTitle="No followers yet"
      emptySubtitle="When people follow you, they'll appear here"
      showFollowButton={true}
      followButtonIcon="user-plus"
      followButtonAction="follow"
      onUserPress={navigateToProfile}
    />
  );
};

export default FollowersScreen;
