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
import { ModerationService } from '../../services/ModerationService';
import AtprotoService from '../../services/api/AtprotoService';
import { settingsButtonStyles, settingsTextStyles, settingsLayoutStyles, settingsAvatarStyles, settingsActiveStyles } from './SettingsStyles';

interface MutedUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

const MutedUsersScreen: React.FC = () => {
  const navigation = useNavigation();
  const [mutedUsers, setMutedUsers] = useState<MutedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unmutingUsers, setUnmutingUsers] = useState<Set<string>>(new Set());
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadMutedUsers();
  }, []);

  const loadMutedUsers = async () => {
    try {
      setLoading(true);
      const mutedDids = await ModerationService.getMutedUsers();
      
      // Convert Set<string> to MutedUser objects
      const userPromises = Array.from(mutedDids).map(async (did) => {
        try {
          // Try to get profile info for each muted user
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
      setMutedUsers(users);
    } catch (error) {
      console.error('Error loading muted users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnmuteUser = async (userDid: string) => {
    try {
      setUnmutingUsers(prev => new Set(prev).add(userDid));
      await AtprotoService.unmuteUser(userDid);
      setMutedUsers(prev => prev.filter(user => user.did !== userDid));
    } catch (error) {
      console.error('Error unmuting user:', error);
    } finally {
      setUnmutingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userDid);
        return newSet;
      });
    }
  };

  const renderUserItem = ({ item }: { item: MutedUser }) => {
    const isUnmuting = unmutingUsers.has(item.did);

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
            isUnmuting && settingsActiveStyles.buttonDisabled
          ]}
          onPress={() => handleUnmuteUser(item.did)}
          disabled={isUnmuting}
          activeOpacity={0.7}
        >
          {isUnmuting ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={settingsTextStyles.actionButtonText}>Unmute</Text>
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
          title="muted accounts"
          showBackButton
          onBackPress={() => navigation.goBack()}
          applySafeAreaTop
        />
        <View style={settingsLayoutStyles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.white} />
          <Text style={settingsTextStyles.loadingText}>Loading muted accounts...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={settingsLayoutStyles.safeArea}>
      <ListHeader
        mode="stacked"
        title="muted accounts"
        showBackButton
        onBackPress={() => navigation.goBack()}
        applySafeAreaTop
      />

      <FlatList
        data={mutedUsers}
        keyExtractor={(item) => item.did}
        renderItem={renderUserItem}
        contentContainerStyle={settingsLayoutStyles.listContainerNoPadding}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={settingsLayoutStyles.emptyContainer}>
            <Icon name="volume-x" size={48} color={Colors.lightGray} />
            <Text style={settingsTextStyles.emptyTitle}>no muted accounts</Text>
            <Text style={settingsTextStyles.emptyDescription}>
              you haven't muted any accounts yet. muted accounts' posts won't appear in your feed, but they can still see your content.
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

export default MutedUsersScreen; 