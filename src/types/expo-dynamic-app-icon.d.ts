declare module '@variant-systems/expo-dynamic-app-icon' {
  const ExpoDynamicAppIcon: {
    setAppIcon: (icon: string | null) => string | void;
    getAppIcon: () => string;
  };

  export default ExpoDynamicAppIcon;
}
