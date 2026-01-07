import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Loading3FillIcon } from './Icon';
import { Colors } from './UI';

interface AccountSwitchToastProps {
  handle?: string | null;
  avatarUri?: string | null;
  topInset?: number;
}

/**
 * AccountSwitchToast
 * -------------------
 * Preserves the signed-in toast + overlay design used during account switching.
 * Not currently wired into navigation; kept for potential future use.
 */
export const AccountSwitchToast: React.FC<AccountSwitchToastProps> = ({
  handle,
  avatarUri,
  topInset = 0,
}) => {
  const displayHandle = handle?.startsWith('@') ? handle.slice(1) : handle;

  return (
    <>
      <View style={styles.overlay} pointerEvents="auto" />
      <View style={[styles.toastWrapper, { paddingTop: topInset + 5 }]}>
        <View style={styles.toast}>
          {avatarUri ? (
            <View style={styles.avatarWrapper}>
              <Loading3FillIcon size={40} color={Colors.black} style={styles.avatarSpinner} />
              <Image
                source={{ uri: avatarUri }}
                style={styles.toastAvatar}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </View>
          ) : (
            <View style={{ width: 12 }} />
          )}
          <Text
            style={[
              styles.toastText,
              { flexShrink: 1, flexGrow: 1, marginLeft: 12, marginRight: 8, textAlign: 'right' },
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {displayHandle ? `Signing in ${displayHandle}` : 'Signing in'}
          </Text>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  toastWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  toast: {
    backgroundColor: Colors.white,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 46,
    maxWidth: undefined,
    alignSelf: 'center',
    shadowColor: Colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  toastText: {
    color: Colors.black,
    fontSize: 17,
    fontFamily: 'Firma-Bold',
    textAlign: 'center',
  },
  toastAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    position: 'absolute',
    top: 6,
    left: 6,
  },
  avatarWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarSpinner: {
    position: 'absolute',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
});

export default AccountSwitchToast;
