import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../../theme';
import { FOOTER_TOP_PADDING_DEFAULT, getFooterBottomPadding } from './utils';
import { SHEET_STYLES } from './sheetStyles';

interface SheetActionFooterProps {
  children: React.ReactNode;
  topPadding?: number;
  backgroundColor?: string;
}

const SheetActionFooter: React.FC<SheetActionFooterProps> = ({
  children,
  topPadding = FOOTER_TOP_PADDING_DEFAULT,
  backgroundColor = Colors.neutral[975],
}) => {
  const insets = useSafeAreaInsets();
  const bottomPadding = getFooterBottomPadding(insets.bottom);
  return (
    <View style={[styles.footerContainer, { backgroundColor, paddingBottom: bottomPadding }]}>
      <View style={[styles.actionsContainer, { paddingTop: topPadding }]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  footerContainer: SHEET_STYLES.footerContainer,
  actionsContainer: SHEET_STYLES.footerCenteredActions,
});

export default SheetActionFooter;
