import React from 'react';
import ListScreen from '../../src/components/ui/ListScreen';
import { useUserList, useProfileNavigation } from '../../src/hooks';

const FollowingScreen: React.FC = () => {
  const { users: following, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, error } = useUserList({ type: 'following' });
  const { navigateToProfile } = useProfileNavigation();

  return (
    <ListScreen
      title="People you follow"
      data={following}
      isLoading={isLoading}
      error={error}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      emptyIcon="user-plus"
      emptyTitle="Not following anyone yet"
      emptySubtitle="When you follow people, they'll appear here"
      showFollowButton={true}
      followButtonIcon="user-check"
      followButtonAction="unfollow"
      onUserPress={navigateToProfile}
    />
  );
};

export default FollowingScreen;
