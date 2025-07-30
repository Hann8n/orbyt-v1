import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
  Image,
  Platform,
} from 'react-native';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { Avatar, Icon } from '../../ui/UI';
import AccountManager, { SavedAccount } from '../../../services/storage/AccountManager';
import ProfileCache, { useProfile, CachedProfile } from '../../../services/cache/ProfileCache';
import { BRAND, TEXT, UI } from '../../../utils/formatting/Colors';
import VerificationBadge from '../verification/VerificationBadge';

interface AccountSwitcherProps {
  visible: boolean;
  onDismiss: () => void;
  onAccountSwitch: (account: SavedAccount) => void;
  onAddAccount?: () => void;
}

// Extended interface to include cached profile data
interface AccountWithProfile extends SavedAccount {
  cachedProfile?: CachedProfile;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Standardized card size for consistency
const CARD_SIZE = 160; // Fixed size for uniformity
// Avatar size proportional to card size
const AVATAR_SIZE = CARD_SIZE * 0.5; // 50% of card size

const AccountSwitcher: React.FC<AccountSwitcherProps> = ({
  visible,
  onDismiss,
  onAccountSwitch,
  onAddAccount,
}) => {
  const [accounts, setAccounts] = useState<AccountWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  // Bottom sheet ref and snap points
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['50%'], []);

  // Show/hide bottom sheet based on visible prop
  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible]);

  // Get current active account for custom colors
  const activeAccount = accounts.find(acc => acc.isActive);
  const { data: activeProfile } = useProfile(activeAccount?.handle || null);
  
  // Get custom colors for active account
  const customColors = activeProfile?.profileColors;

  useEffect(() => {
    if (visible) {
      loadAccounts();
      setEditMode(false); // Reset edit mode when modal opens
    }
  }, [visible]);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const savedAccounts = await AccountManager.getSavedAccounts();
      
      // Enhance accounts with cached profile data
      const accountsWithProfiles = await Promise.all(
        savedAccounts.map(async (account) => {
          try {
            // Try to get cached profile data for each account
            // First try to get from cache, then refresh if needed
            let cachedProfile = await ProfileCache.getProfile(account.handle);
            
            // If no cached data or cache is stale, try to refresh
            if (!cachedProfile) {
              try {
                cachedProfile = await ProfileCache.refreshProfile(account.handle);
              } catch (refreshError) {
                console.warn(`Failed to refresh profile for ${account.handle}:`, refreshError);
              }
            }
            
            // Update saved account data with fresh profile information if available
            if (cachedProfile) {
              try {
                await AccountManager.updateAccountProfile(account.id, {
                  displayName: cachedProfile.displayName,
                  avatar: cachedProfile.avatar,
                  handle: cachedProfile.handle,
                });
              } catch (updateError) {
                console.warn(`Failed to update account profile for ${account.handle}:`, updateError);
              }
            }
            
            return {
              ...account,
              cachedProfile: cachedProfile || undefined
            };
          } catch (error) {
            console.warn(`Failed to load profile for ${account.handle}:`, error);
            return account;
          }
        })
      );
      
      setAccounts(accountsWithProfiles);
    } catch (error) {
      console.error('Error loading accounts:', error);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = async (account: SavedAccount) => {
    if (editMode) return; // Don't switch in edit mode
    try {
      setSwitchingAccount(account.id);
      await AccountManager.switchAccount(account.id);
      onAccountSwitch(account);
      onDismiss();
    } catch (error) {
      console.error('Error switching account:', error);
      Alert.alert('Error', 'Failed to switch account. Please try again.');
    } finally {
      setSwitchingAccount(null);
    }
  };

  const handleRemoveAccount = async (account: SavedAccount) => {
    Alert.alert(
      'Remove Account',
      `Are you sure you want to remove @${account.handle}? This will delete the saved credentials.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await AccountManager.removeAccount(account.id);
              await loadAccounts(); // Reload the list
            } catch (error) {
              console.error('Error removing account:', error);
              Alert.alert('Error', 'Failed to remove account. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleAddAccount = () => {
    if (onAddAccount) {
      onAddAccount();
    } else {
      onDismiss();
    }
  };

  // Add Account card at the end only when in edit mode
  const dataWithAdd = editMode 
    ? [...accounts, { id: 'add', handle: '', did: '', displayName: '', avatar: '', lastUsed: 0, isActive: false } as AccountWithProfile]
    : accounts;

  const renderAccountItem = ({ item }: { item: AccountWithProfile }) => {
    if (item.id === 'add') {
      return (
        <TouchableOpacity
          style={[styles.accountCard, styles.addCard]}
          onPress={handleAddAccount}
          activeOpacity={0.8}
        >
          <View style={[styles.avatarCircle, styles.addAvatarCircle]}>
            <Icon name="plus" size={CARD_SIZE * 0.3} color={BRAND.ACCENT} />
          </View>
          <Text style={[styles.addText, { color: BRAND.ACCENT }]}>Add Account</Text>
        </TouchableOpacity>
      );
    }

    const isActive = item.isActive;
    const isSwitching = switchingAccount === item.id;
    
    // Use cached profile data if available, otherwise fall back to saved account data
    const displayName = item.cachedProfile?.displayName || item.displayName || item.handle;
    const avatar = item.cachedProfile?.avatar || item.avatar;
    const handle = item.cachedProfile?.handle || item.handle;
    
    return (
      <TouchableOpacity
        style={[
          styles.accountCard, 
          isActive && [
            styles.activeAccountCard,
            customColors && {
              borderColor: customColors.foregroundColor,
              borderWidth: 2,
            }
          ]
        ]}
        onPress={() => !isActive && !editMode && handleSwitchAccount(item)}
        activeOpacity={isActive || editMode ? 1 : 0.8}
      >
        {/* Delete button in top right corner when in edit mode */}
        {editMode && (
          <TouchableOpacity
            style={styles.deleteButtonTopRight}
            onPress={() => handleRemoveAccount(item)}
            activeOpacity={0.7}
          >
            <Icon name="trash" size={16} color="#FE4359" />
          </TouchableOpacity>
        )}
        
        <View style={[
          styles.avatarCircle,
          isActive && customColors && {
            backgroundColor: customColors.backgroundColor,
          }
        ]}>
          <Avatar
            uri={avatar}
            type="profile"
            size={AVATAR_SIZE}
            fallbackIcon="user"
            fallbackIconColor={isActive && customColors ? customColors.foregroundColor : TEXT.LIGHT_GREY}
          />
        </View>
        <View style={styles.displayNameContainer}>
          <Text style={styles.displayName} numberOfLines={1}>
            {displayName}
          </Text>
          <VerificationBadge 
            handle={handle}
            textSize={16}
            textColor={isActive && customColors ? customColors.foregroundColor : TEXT.PRIMARY}
            borderColor={isActive && customColors ? customColors.foregroundColor : BRAND.ACCENT}
            autoPosition={true}
            style={styles.verificationBadge}
          />
        </View>
        <Text style={styles.handle} numberOfLines={1}>
          @{handle}
        </Text>
        <View style={styles.accountActions}>
          {isSwitching ? (
            <View style={[
              styles.switchingSpinnerContainer,
              item.cachedProfile?.profileColors && {
                backgroundColor: item.cachedProfile.profileColors.backgroundColor,
              }
            ]}>
              <Icon 
                name="loader" 
                size={16} 
                color={item.cachedProfile?.profileColors?.foregroundColor || BRAND.ACCENT} 
              />
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  // Backdrop component
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      onDismiss={onDismiss}
      backgroundStyle={styles.bottomSheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetView style={styles.content}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>
                Switch Account
              </Text>
            </View>
            <View style={styles.headerActions}>
              {!editMode && (
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => setEditMode(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              )}
              {editMode && (
                <TouchableOpacity
                  style={styles.doneButton}
                  onPress={() => setEditMode(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={BRAND.ACCENT} />
            </View>
          ) : dataWithAdd.length <= 2 ? (
            // Center 1-2 cards for better visual balance
            <View style={styles.centeredContainer}>
              {dataWithAdd.map((item) => (
                <View key={item.id} style={styles.centeredCardWrapper}>
                  {renderAccountItem({ item })}
                </View>
              ))}
            </View>
          ) : (
            // Horizontal scroll for 3+ cards to accommodate more accounts
            <FlatList
              data={dataWithAdd}
              renderItem={renderAccountItem}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.listContainer}
            />
          )}
          <View style={styles.cancelContainer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onDismiss} activeOpacity={0.7}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    paddingBottom: 80,

    minHeight: 320,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 5,
    minHeight: 44,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    fontFamily: 'Firma-Bold',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 60,
    justifyContent: 'flex-end',
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {
    color: BRAND.ACCENT,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  doneButtonText: {
    color: BRAND.ACCENT,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 120,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
  },
  accountCard: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    alignItems: 'center',
    backgroundColor: UI.BACKGROUND.ITEM,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY,
    position: 'relative',
    justifyContent: 'space-between',
  },
  activeAccountCard: {
    backgroundColor: UI.BACKGROUND.ITEM,
  },
  avatarCircle: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: BRAND.ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  addAvatarCircle: {
    backgroundColor: UI.BACKGROUND.ITEM,
    borderWidth: 2,
    borderColor: BRAND.ACCENT,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: BRAND.ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: BRAND.SECONDARY,
    fontSize: AVATAR_SIZE * 0.4, // Proportional to avatar size
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
  },
  displayNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    maxWidth: CARD_SIZE - 24,
  },
  displayName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    fontFamily: 'Firma-Bold',
    marginRight: 4,
  },
  verificationBadge: {
    marginLeft: 2,
  },
  handle: {
    fontSize: 14,
    color: TEXT.LIGHT_GREY,
    fontFamily: 'Firma-Regular',

    textAlign: 'center',
    maxWidth: CARD_SIZE - 24,
  },

  accountActions: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchingSpinnerContainer: {
    backgroundColor: UI.BACKGROUND.ITEM,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY,
  },
  deleteButton: {
    padding: 8,
  },
  deleteButtonTopRight: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 4,
    zIndex: 3,
  },
  addCard: {
    borderStyle: 'dashed',
    borderColor: BRAND.ACCENT,
    backgroundColor: UI.BACKGROUND.ITEM,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.95,
  },
  addText: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
    marginTop: 6,
    textAlign: 'center',
  },
  cancelContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  cancelButton: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
  centeredContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    flexWrap: 'wrap',
    gap: 16,
  },
  centeredCardWrapper: {
    // No additional styling needed, the card itself handles its own styling
  },
  bottomSheetBackground: {
    backgroundColor: '#000',
    borderTopWidth: 0.5,
    borderTopColor: '#333',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  handleIndicator: {
    backgroundColor: '#666',
    width: 40,
    height: 5,
  },
  content: {
    paddingHorizontal: 0,
    paddingBottom: Platform.OS === 'ios' ? 20 : 30,
  },
});

export default AccountSwitcher; 