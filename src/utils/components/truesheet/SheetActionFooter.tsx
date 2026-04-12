import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../../theme';
import { FOOTER_TOP_PADDING_DEFAULT } from './utils';
import { SHEET_STYLES } from './sheetStyles';

interface SheetActionFooterProps {
  children: React.ReactNode;
  bottomPadding: number;
  topPadding?: number;
  backgroundColor?: string;
}

const SheetActionFooter: React.FC<SheetActionFooterProps> = ({
  children,
  bottomPadding,
  topPadding = FOOTER_TOP_PADDING_DEFAULT,
  backgroundColor = Colors.neutral[975],
}) => {
  return (
    <View style={[styles.footerContainer, { paddingBottom: bottomPadding, backgroundColor }]}>
      <View style={[styles.actionsContainer, { paddingTop: topPadding }]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  footerContainer: SHEET_STYLES.footerContainer,
  actionsContainer: SHEET_STYLES.footerCenteredActions,
});

export default SheetActionFooter;
