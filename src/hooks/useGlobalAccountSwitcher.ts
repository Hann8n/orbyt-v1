import { useState, useEffect, useCallback } from 'react';

// Global state for AccountSwitcher
let currentAccountSwitcherVisible = false;
const listeners: (() => void)[] = [];

const notifyListeners = () => {
  listeners.forEach(listener => listener());
};

export const useGlobalAccountSwitcher = () => {
  const [visible, setVisible] = useState<boolean>(currentAccountSwitcherVisible);

  useEffect(() => {
    const listener = () => {
      setVisible(currentAccountSwitcherVisible);
    };
    
    listeners.push(listener);
    
    return () => {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  const presentAccountSwitcher = useCallback(() => {
    currentAccountSwitcherVisible = true;
    notifyListeners();
  }, []);

  const dismissAccountSwitcher = useCallback(() => {
    currentAccountSwitcherVisible = false;
    notifyListeners();
  }, []);

  return {
    visible,
    presentAccountSwitcher,
    dismissAccountSwitcher,
  };
};
