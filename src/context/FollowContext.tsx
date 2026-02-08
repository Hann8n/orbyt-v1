import React, { createContext, useContext } from 'react';
import { useFollowMutation } from '../services/data/ProfileService';
import { useUserStore } from '../stores/userStore';
import type { UserState } from '../stores/userStore';

type FollowContextValue = {
  followMutation: ReturnType<typeof useFollowMutation>;
  currentUser: UserState['currentUser'];
};

const FollowContext = createContext<FollowContextValue | null>(null);

export const FollowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const followMutation = useFollowMutation();
  const currentUser = useUserStore(state => state.currentUser);

  return (
    <FollowContext.Provider value={{ followMutation, currentUser }}>
      {children}
    </FollowContext.Provider>
  );
};

export const useFollowContext = () => {
  const context = useContext(FollowContext);
  if (!context) {
    throw new Error('useFollowContext must be used within a FollowProvider');
  }
  return context;
};
