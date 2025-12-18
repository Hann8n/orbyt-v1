import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { BackArrowIcon, CloseFillIcon } from './Icon';
import { Colors } from './UI';

export type ListHeaderMode = 'sheet' | 'root' | 'stacked';

interface ListHeaderProps {
  mode: ListHeaderMode;
  title?: string;
  backgroundColor?: string;
  textColor?: string;
  showBackButton?: boolean;
  onBackPress?: () => void;
  showCloseButton?: boolean;
  onClosePress?: () => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
  applySafeAreaTop?: boolean;
  style?: ViewStyle | ViewStyle[];
  titleIndent?: boolean;
}

const ListHeader: React.FC<ListHeaderProps> = ({
  mode,
  title,
  backgroundColor = Colors.black,
  textColor = Colors.white,
  showBackButton = false,
  onBackPress,
  showCloseButton = false,
  onClosePress,
  left,
  right,
  applySafeAreaTop = false,
  style,
  titleIndent = false,
}) => {
  const insets = useSafeAreaInsets();

  const containerStyle = [
    styles.container,
    mode === 'root' && styles.containerRoot,
    mode === 'stacked' && styles.containerStacked,
    mode === 'sheet' && styles.containerSheet,
    { backgroundColor, ...(applySafeAreaTop ? { paddingTop: insets.top } : null) },
    style,
  ];

  const titleStyle = [
    styles.title,
    mode === 'root' && styles.titleRoot,
    mode === 'stacked' && styles.titleStacked,
    mode === 'sheet' && styles.titleSheet,
    mode === 'sheet' && titleIndent && styles.titleSheetIndent,
    { color: textColor },
  ];

  if (mode === 'sheet') {
    return (
      <View style={containerStyle}>
        <View style={styles.sheetLeft}>
          {left ?? (title ? <Text style={titleStyle} numberOfLines={1}>{title}</Text> : null)}
        </View>
        <View style={[styles.rightSection, styles.sheetRightSection]}>
          {right ?? (
            showCloseButton ? (
              <Pressable onPress={onClosePress}>
                <CloseFillIcon size={20} color={Colors.white} />
              </Pressable>
            ) : (
              <View style={styles.rightSpacer} />
            )
          )}
        </View>
      </View>
    );
  }

  // Stacked mode: left-aligned back button + title, optional right action
  if (mode === 'stacked') {
    return (
      <View style={containerStyle}>
        <View style={styles.stackedLeftRow}>
          {left ?? (
            showBackButton ? (
              <Pressable onPress={onBackPress}>
                <BackArrowIcon size={28} color={textColor} />
              </Pressable>
            ) : null
          )}
          {!!title && (
            <Text style={[titleStyle, styles.titleStackedLeft]} numberOfLines={1}>{title}</Text>
          )}
        </View>
        <View style={styles.rightSection}>
          {right ?? (showCloseButton ? (
            <Pressable onPress={onClosePress}>
              <CloseFillIcon size={20} color={textColor} />
            </Pressable>
          ) : (
            <View style={styles.rightSpacer} />
          ))}
        </View>
      </View>
    );
  }

  // Root mode: back on left, centered title, optional right
  return (
    <View style={containerStyle}>
      <View style={styles.leftSection}>
        {left ?? (
          showBackButton ? (
            <Pressable onPress={onBackPress}>
              <BackArrowIcon size={28} color={textColor} />
            </Pressable>
          ) : (
            <View style={styles.leftSpacer} />
          )
        )}
      </View>
      <Text style={titleStyle} numberOfLines={1}>{title}</Text>
      <View style={styles.rightSection}>
        {right ?? (showCloseButton ? (
          <Pressable onPress={onClosePress}>
            <CloseFillIcon size={20} color={textColor} />
          </Pressable>
        ) : (
          <View style={styles.rightSpacer} />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  containerRoot: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  containerStacked: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  containerSheet: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  leftSection: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightSection: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRightSection: {
    width: 40,
    height: 40,
  },
  stackedLeftRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftSpacer: {
    width: 40,
    height: 40,
  },
  rightSpacer: {
    width: 40,
    height: 40,
  },
  sheetCloseButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Firma-Bold',
  },
  titleRoot: {
    fontSize: 22,
    fontWeight: '700',
  },
  titleStacked: {
    fontSize: 20,
    fontWeight: '700',
  },
  titleStackedLeft: {
    textAlign: 'left',
    marginLeft: 6,
  },
  titleSheet: {
    textAlign: 'left',
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
    marginLeft: 5,
  },
  titleSheetIndent: {
    marginLeft: 14,
  },
});

export default ListHeader;


