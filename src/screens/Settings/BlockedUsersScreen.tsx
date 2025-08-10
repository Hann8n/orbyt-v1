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
import { Colors } from '../../components/ui/UI';
import UI from '../../components/ui/UI';
import { ModerationService } from '../../services/ModerationService';
import AtprotoService from '../../services/api/AtprotoService';

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
          <View style={styles.avatarContainer}>
            {item.avatar ? (
              <Image source={{ uri: item.avatar }} style={styles.avatar} />
            ) : (
              <Icon name="user" size={24} color={Colors.white} />
            )}
          </View>
          <View style={styles.userDetails}>
            <Text style={styles.displayName}>
              {item.displayName || 'Unknown User'}
            </Text>
            <Text style={styles.handle}>@{item.handle}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[
            styles.unblockButton,
            isUnblocking && styles.unblockButtonDisabled
          ]}
          onPress={() => handleUnblockUser(item.did)}
          disabled={isUnblocking}
          activeOpacity={0.7}
        >
          {isUnblocking ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <Icon name="user-check" size={16} color={Colors.white} />
              <Text style={styles.unblockButtonText}>Unblock</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.safeArea, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <BackArrowIcon size={28} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>blocked users</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.white} />
          <Text style={styles.loadingText}>Loading blocked users...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <BackArrowIcon size={28} color={Colors.white} />
        </TouchableOpacity>
                  <Text style={styles.headerTitle}>blocked users</Text>
        <View style={styles.headerRight} />
      </View>

      <FlatList
        data={blockedUsers}
        keyExtractor={(item) => item.did}
        renderItem={renderUserItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="shield-shape-fill" size={24} color={Colors.white} />
            <Text style={styles.emptyTitle}>no blocked users</Text>
            <Text style={styles.emptyDescription}>
              you haven't blocked any users yet. blocked users won't be able to see your content or interact with you.
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray,
    backgroundColor: Colors.black,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  headerRight: {
    width: 40,
  },
  listContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.darkGray,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.gray,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  userDetails: {
    flex: 1,
  },
  displayName: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  handle: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginTop: 2,
  },
  unblockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI.Colors.STATUS.SUCCESS,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    minWidth: 100,
    height: 40,
    borderWidth: 1,
    borderColor: UI.Colors.STATUS.SUCCESS,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  unblockButtonDisabled: {
    opacity: 0.7,
  },
  unblockButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Firma-Medium',
    marginLeft: 6,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 120,
  },
  emptyTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default BlockedUsersScreen; 