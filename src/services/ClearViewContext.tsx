import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ClearViewContextType {
  isClearViewMode: boolean;
  toggleClearViewMode: () => void;
  setClearViewMode: (enabled: boolean) => void;
}

const ClearViewContext = createContext<ClearViewContextType | undefined>(undefined);

interface ClearViewProviderProps {
  children: ReactNode;
}

export const ClearViewProvider: React.FC<ClearViewProviderProps> = ({ children }) => {
  const [isClearViewMode, setIsClearViewMode] = useState(false);

  const toggleClearViewMode = useCallback(() => {
    setIsClearViewMode(prev => !prev);
  }, []);

  const setClearViewMode = useCallback((enabled: boolean) => {
    setIsClearViewMode(enabled);
  }, []);

  const value: ClearViewContextType = {
    isClearViewMode,
    toggleClearViewMode,
    setClearViewMode,
  };

  return (
    <ClearViewContext.Provider value={value}>
      {children}
    </ClearViewContext.Provider>
  );
};

export const useClearView = (): ClearViewContextType => {
  const context = useContext(ClearViewContext);
  if (context === undefined) {
    throw new Error('useClearView must be used within a ClearViewProvider');
  }
  return context;
}; 