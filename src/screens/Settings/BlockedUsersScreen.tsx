import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { BackArrowIcon } from '../../components/ui/Icon';
import ListHeader from '../../components/ui/ListHeader';
import { Colors } from '../../components/ui/UI';
import UI from '../../components/ui/UI';
import { ModerationService } from '../../services/ModerationService';
import AtprotoService from '../../services/api/AtprotoService';
import { settingsButtonStyles, settingsTextStyles, settingsLayoutStyles, settingsAvatarStyles, settingsActiveStyles } from './SettingsStyles';

interface BlockedUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

const BlockedUsersScreen: React.FC = () => {
  const navigation = useNavigation();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingUsers, setUnblockingUsers] = useState<Set<string>>(new Set());
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadBlockedUsers();
  }, []);

  const loadBlockedUsers = async () => {
    try {
      setLoading(true);
      const blockedDids = await ModerationService.getBlockedUsers();
      
      // Convert Set<string> to BlockedUser objects
      const userPromises = Array.from(blockedDids).map(async (did) => {
        try {
          // Try to get profile info for each blocked user
          const profile = await AtprotoService.getProfile(did);
          return {
            did,
            handle: profile?.handle || did,
            displayName: profile?.displayName,
            avatar: profile?.avatar,
          };
        } catch (error) {
          // If we can't get profile info, use basic info
          return {
            did,
            handle: did,
            displayName: 'Unknown User',
            avatar: undefined,
          };
        }
      });
      
      const users = await Promise.all(userPromises);
      setBlockedUsers(users);
    } catch (error) {
      console.error('Error loading blocked users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnblockUser = async (userDid: string) => {
    try {
      setUnblockingUsers(prev => new Set(prev).add(userDid));
      await AtprotoService.unblockUser(userDid);
      setBlockedUsers(prev => prev.filter(user => user.did !== userDid));
    } catch (error) {
      console.error('Error unblocking user:', error);
    } finally {
      setUnblockingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userDid);
        return newSet;
      });
    }
  };

  const renderUserItem = ({ item }: { item: BlockedUser }) => {
    const isUnblocking = unblockingUsers.has(item.did);

    return (
      <View style={styles.userItem}>
        <View style={styles.userInfo}>
          <View style={settingsAvatarStyles.avatarMedium}>
            {item.avatar ? (
              <Image source={{ uri: item.avatar }} style={settingsAvatarStyles.avatarImage} />
            ) : (
              <Icon name="user" size={20} color={Colors.lightGray} />
            )}
          </View>
          <View style={styles.userDetails}>
            <Text style={settingsTextStyles.userDisplayName} numberOfLines={1} ellipsizeMode="tail">
              {item.displayName || 'Unknown User'}
            </Text>
            <Text style={settingsTextStyles.userHandle} numberOfLines={1} ellipsizeMode="tail">@{item.handle}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[
            settingsButtonStyles.actionButton,
            isUnblocking && settingsActiveStyles.buttonDisabled
          ]}
          onPress={() => handleUnblockUser(item.did)}
          disabled={isUnblocking}
          activeOpacity={0.7}
        >
          {isUnblocking ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={settingsTextStyles.actionButtonText}>Unblock</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={settingsLayoutStyles.safeArea}>
        <ListHeader
          mode="stacked"
          title="blocked accounts"
          showBackButton
          onBackPress={() => navigation.goBack()}
          applySafeAreaTop
        />
        <View style={settingsLayoutStyles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.white} />
          <Text style={settingsTextStyles.loadingText}>Loading blocked accounts...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={settingsLayoutStyles.safeArea}>
      <ListHeader
        mode="stacked"
        title="blocked accounts"
        showBackButton
        onBackPress={() => navigation.goBack()}
        applySafeAreaTop
      />

      <FlatList
        data={blockedUsers}
        keyExtractor={(item) => item.did}
        renderItem={renderUserItem}
        contentContainerStyle={settingsLayoutStyles.listContainerNoPadding}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={settingsLayoutStyles.emptyContainer}>
            <Icon name="shield-shape-fill" size={24} color={Colors.white} />
            <Text style={settingsTextStyles.emptyTitle}>no blocked accounts</Text>
            <Text style={settingsTextStyles.emptyDescription}>
              you haven't blocked any accounts yet. blocked accounts won't be able to see your content or interact with you.
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userDetails: {
    flex: 1,
  },
});

export default BlockedUsersScreen; 