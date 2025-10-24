import React from 'react';
import { useGlobalAccountSwitcher } from '../../hooks/useGlobalModals';
import AccountSwitcher from '../features/profile/AccountSwitcher';
import { useAuth } from '../../stores/userStore';

const GlobalAccountSwitcher: React.FC = () => {
  const { visible, dismissAccountSwitcher } = useGlobalAccountSwitcher();
  const { signOut } = useAuth();

  const handleAccountSwitch = async (account: any) => {
    try {
      // Account switching is handled by the AccountSwitcher component
log('Account switched to:', account.handle);
    } catch (error) {
error('Error in account switch callback:', error);
    }
  };

  const handleAddAccount = async () => {
    dismissAccountSwitcher();
    // Navigate to login to add new account
    await signOut(false);
  };

  return (
    <AccountSwitcher
      visible={visible}
      onDismiss={dismissAccountSwitcher}
      onAccountSwitch={handleAccountSwitch}
      onAddAccount={handleAddAccount}
      onLogout={signOut}
    />
  );
};

export default GlobalAccountSwitcher;
