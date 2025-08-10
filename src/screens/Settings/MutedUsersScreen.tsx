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
import { ModerationService } from '../../services/ModerationService';
import AtprotoService from '../../services/api/AtprotoService';

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
          <View style={styles.avatarContainer}>
            {item.avatar ? (
              <Image source={{ uri: item.avatar }} style={styles.avatar} />
            ) : (
              <Icon name="user" size={20} color={Colors.lightGray} />
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
            styles.unmuteButton,
            isUnmuting && styles.unmuteButtonDisabled
          ]}
          onPress={() => handleUnmuteUser(item.did)}
          disabled={isUnmuting}
          activeOpacity={0.7}
        >
          {isUnmuting ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <Icon name="volume-2" size={16} color={Colors.white} />
              <Text style={styles.unmuteButtonText}>Unmute</Text>
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
          <Text style={styles.headerTitle}>muted users</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.white} />
          <Text style={styles.loadingText}>Loading muted users...</Text>
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
                  <Text style={styles.headerTitle}>muted users</Text>
        <View style={styles.headerRight} />
      </View>

      <FlatList
        data={mutedUsers}
        keyExtractor={(item) => item.did}
        renderItem={renderUserItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="volume-x" size={48} color={Colors.lightGray} />
            <Text style={styles.emptyTitle}>no muted users</Text>
            <Text style={styles.emptyDescription}>
              you haven't muted any users yet. muted users' posts won't appear in your feed, but they can still see your content.
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
  unmuteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.darkGray,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    minWidth: 100,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.lightGray,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  unmuteButtonDisabled: {
    opacity: 0.7,
  },
  unmuteButtonText: {
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

export default MutedUsersScreen; 