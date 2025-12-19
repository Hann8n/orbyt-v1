import React, { createContext, useContext } from 'react';
import { useFollowMutation } from '../services/cache/ProfileCache';
import { useUserStore } from '../stores/userStore';

type FollowContextValue = {
  followMutation: ReturnType<typeof useFollowMutation>;
  currentUser: any;
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





