import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, Avatar } from './UI';

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
              <ActivityIndicator size="large" color={Colors.black} style={styles.avatarSpinner} />
              <View style={styles.toastAvatarContainer}>
                <Avatar uri={avatarUri} type="profile" size={28} showRing={false} />
              </View>
            </View>
          ) : (
            <View style={styles.avatarSpacer} />
          )}
          <Text
            style={[styles.toastText, styles.toastTextCompact]}
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
    backgroundColor: Colors.neutral[50],
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
    fontFamily: 'Figtree-Bold',
    textAlign: 'center',
  },
  toastAvatarContainer: {
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
    backgroundColor: Colors.overlay.black70,
  },
  avatarSpacer: {
    width: 12,
  },
  toastTextCompact: {
    flexShrink: 1,
    flexGrow: 1,
    marginLeft: 12,
    marginRight: 8,
    textAlign: 'right',
  },
});

export default AccountSwitchToast;
