import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
  SafeAreaView,
  Switch,
  Modal,
  FlatList,
} from 'react-native';
import Video, { VideoRef } from 'react-native-video';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, TextOverlay } from '../navigation/types';
import { Colors } from '../components/ui/UI';
import AtprotoService from '../services/api/AtprotoService';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import VideoPreviewModal from '../components/features/video/Preview/VideoPreviewModal';
import { useProfile, useProfileColors } from '../services/cache/ProfileCache';
import { Avatar } from '../components/ui/UI';
import VerificationBadge from '../components/features/verification/VerificationBadge';
import ProfileCache from '../services/cache/ProfileCache';
import Icon, { BackArrowIcon, DownloadIcon, ChevronDownIcon, ChevronUpIcon } from '../components/ui/Icon';
import VideoProcessingService from '../services/VideoProcessingService';
import { VideoInfoDisplay } from '../components/ui';
import AuthorItem from '../components/ui/AuthorItem';
import * as Device from 'expo-device';
import { isTablet } from '../utils/helpers/screenSize';
import AccountManager, { SavedAccount } from '../services/storage/AccountManager';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIDEO_WIDTH = SCREEN_WIDTH * 0.4; // Keep the same relative width as before

// Content warning options
const CONTENT_WARNINGS = [
  { id: 'nsfw', label: 'Adult Content (NSFW)' },
  { id: 'nudity', label: 'Nudity' },
  { id: 'violence', label: 'Violence' },
  { id: 'sensitive', label: 'Sensitive Content' },
];

// Comment filtering options
const COMMENT_FILTERS = [
  { id: 'all', label: 'Allow all comments' },
  { id: 'followers', label: 'Only followers can comment' },
  { id: 'mentioned', label: 'Only mentioned users can comment' },
  { id: 'none', label: 'No one can comment' },
];

type Props = NativeStackScreenProps<RootStackParamList, 'VideoPost'>;

// Fix navigation type for proper type safety
const VideoPostScreen: React.FC<Props> = ({ route }) => {
  const { video, textOverlays = [] } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [description, setDescription] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<any>(null);

  // Content warning state
  const [selectedContentWarnings, setSelectedContentWarnings] = useState<string[]>([]);
  const [otherWarning, setOtherWarning] = useState('');
  const [showContentWarningInput, setShowContentWarningInput] = useState(false);
  
  // Comment filtering state
  const [commentFilter, setCommentFilter] = useState('all');

  // User profile state - using ProfileCache
  const [userHandle, setUserHandle] = useState<string | null>(null);
  const [contentWarningsCollapsed, setContentWarningsCollapsed] = useState(true);
  const [commentSettingsCollapsed, setCommentSettingsCollapsed] = useState(true);
  
  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  // Store video dimensions for aspect ratio
  const [videoDimensions, setVideoDimensions] = useState({ width: video.width || 360, height: video.height || 640 });
  const [videoVolume, setVideoVolume] = useState(1);

  // Video size and compression state
  const [videoSizeInfo, setVideoSizeInfo] = useState<{
    isValid: boolean;
    sizeMB: number;
    maxSizeMB: number;
    needsCompression: boolean;
  } | null>(null);

  // Enhanced video information state
  const [videoInfo, setVideoInfo] = useState<{
    originalInfo: any;
    compressionOptions: Array<{
      level: string;
      label: string;
      estimatedSize: string;
      quality: string;
      uploadTime: string;
    }>;
    recommendedLevel: string;
  } | null>(null);

  // Compression state
  const [compressionStats, setCompressionStats] = useState<{
    originalSize: string;
    compressedSize: string;
    compressionRatio: number;
    sizeReduction: string;
  } | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedVideoPath, setCompressedVideoPath] = useState<string | null>(null);

  // Add at the top of VideoPostScreen component:
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<SavedAccount | null>(null);

  const otherAccounts = accounts.filter(item => item.id !== activeAccount?.id);
  const hasOtherAccounts = otherAccounts.length > 0;

  // Use ProfileCache hooks for user profile data (must be after activeAccount is declared)
  const {
    data: userProfile,
    isLoading: isProfileLoading,
    isError: isProfileError,
  } = useProfile(activeAccount?.handle || userHandle);

  const { colors: profileColors } = useProfileColors(activeAccount?.handle || userHandle);

  // Ensure profile data is immediately available from cache to prevent flashing
  const profileData = userProfile || (activeAccount?.handle ? ProfileCache.getProfileFromCacheSync(activeAccount.handle) : (userHandle ? ProfileCache.getProfileFromCacheSync(userHandle) : null));

  // Load accounts on mount
  useEffect(() => {
    (async () => {
      const accs = await AccountManager.getSavedAccounts();
      setAccounts(accs);
      const active = await AccountManager.getActiveAccount();
      setActiveAccount(active);
    })();
  }, []);

  // When account switches, update profile
  const handleSwitchAccount = async (account: SavedAccount) => {
    await AccountManager.switchAccount(account.id);
    setActiveAccount(account);
    setAccountModalVisible(false);
    // Reload current user profile and update userHandle
    try {
      const user = await AtprotoService.getCurrentUser();
      if (user) {
        setUserHandle(user.handle);
        ProfileCache.setCurrentUserDid(user.did);
      }
    } catch (error) {
      console.error('Failed to load profile after switch:', error);
    }
  };

  useEffect(() => {
    // Load current user profile info using ProfileCache
    const loadUserProfile = async () => {
      try {
        const user = await AtprotoService.getCurrentUser();
        if (user) {
          setUserHandle(user.handle);
          ProfileCache.setCurrentUserDid(user.did);
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
      }
    };
    
    loadUserProfile();
  }, []);

  // Check video size on component mount
  useEffect(() => {
    const checkVideoSize = async () => {
      if (video?.path) {
        try {
          const sizeInfo = await VideoProcessingService.checkVideoSize(video.path);
          setVideoSizeInfo(sizeInfo);
          
          // Get comprehensive video information using video metadata from route params
          const compressionInfo = await VideoProcessingService.getCompressionInfo(video.path, {
            duration: video.duration,
            width: video.width,
            height: video.height,
          });
          setVideoInfo(compressionInfo);
        } catch (error) {
          console.error('Error checking video size:', error);
        }
      }
    };

    checkVideoSize();
  }, [video?.path]);

  // Compress video if needed
  const compressVideo = async () => {
    if (!video?.path || isCompressing) return;
    
    setIsCompressing(true);
    try {
      // Compress the video
      const compressedVideo = await VideoProcessingService.compressVideoWithSizeLimit(video.path);
      setCompressedVideoPath(compressedVideo.path);
      
      // Get compression statistics
      const stats = await VideoProcessingService.getCompressionStats(video.path, compressedVideo.path);
      setCompressionStats(stats);
      
      // Update video size info
      const newSizeInfo = await VideoProcessingService.checkVideoSize(compressedVideo.path);
      setVideoSizeInfo(newSizeInfo);
      
    } catch (error) {
        Alert.alert('compression error', 'failed to compress video. please try again.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleVideoLoad = (status: any) => {
    if (status.isLoaded) {
      setDuration(status.durationMillis || 0);
    }
  };

  const handleVideoProgress = (status: any) => {
    if (status.isLoaded) {
      setCurrentTime(status.positionMillis || 0);
      setProgress((status.positionMillis || 0) / (status.durationMillis || 1));
    }
  };


  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };



  const toggleContentWarning = (id: string) => {
    if (selectedContentWarnings.includes(id)) {
      setSelectedContentWarnings(selectedContentWarnings.filter(item => item !== id));
    } else {
      setSelectedContentWarnings([...selectedContentWarnings, id]);
    }
  };

  // Add a helper to get the Orbyt platform label
  const getOrbytPlatformLabel = async (): Promise<string> => {
    if (Platform.OS === 'ios') {
      const deviceType = await Device.getDeviceTypeAsync();
      if (deviceType === Device.DeviceType.TABLET) {
        return 'orbyt for iPad';
      } else {
        return 'orbyt for iPhone';
      }
    } else if (Platform.OS === 'android') {
      return 'orbyt for Android';
    } else if (Platform.OS === 'web') {
      return 'orbyt for Web';
    }
    return 'orbyt';
  };

  const handlePost = async () => {
    if (isPosting) return;
    
    if (!video?.path) {
      Alert.alert('error', 'no video selected');
      return;
    }

    // Validate video file exists
    try {
      const fileInfo = await FileSystem.getInfoAsync(video.path.replace('file://', ''));
      if (!fileInfo.exists) {
        Alert.alert('error', 'video file not found. please try again.');
        return;
      }
    } catch (error) {
      Alert.alert('error', 'unable to access video file. please try again.');
      return;
    }

    // Description is optional for video posts

    try {
      setIsPosting(true);
      setUploadProgress(0);
      
      // Collect all content warnings, including custom one if present
      const allContentWarnings = [...selectedContentWarnings];
      if (otherWarning.trim()) {
        allContentWarnings.push('other:' + otherWarning.trim());
      }
      
      // Simulate upload progress with realistic stages
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          // Slower progress for video processing
          return prev + 5;
        });
      }, 300);
      
      // Add Orbyt metadata with platform
      const platformLabel = await getOrbytPlatformLabel();
      const orbytMetadata = { orbyt: true, platform: platformLabel };
      // Use compressed video if available, otherwise use original
      const videoPathToUpload = compressedVideoPath || video.path;
      
      // Create the video post using AtprotoService
      const result = await AtprotoService.createVideoPost(
        description,
        videoPathToUpload,
        allContentWarnings.length > 0 ? allContentWarnings : undefined,
        commentFilter as 'all' | 'followers' | 'mentioned' | 'none',
        orbytMetadata
      );
      
      // Complete the progress
      setUploadProgress(100);
      
      // Small delay to show completion
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Close the current screen and navigate to profile
      navigation.reset({
        index: 0,
        routes: [
          { name: 'Main', params: { screen: 'Profile' } }
        ],
      });
      
    } catch (error: any) {
      let errorMessage = error.message || 'Failed to post video. Please try again.';
      
      // Add additional context for common errors
      if (error.message?.includes('Video upload failed')) {
        errorMessage = 'Video upload failed. This might be due to:\n• Video file size too large (max 50MB)\n• Network connection issues\n• Bluesky service temporarily unavailable\n\nPlease try again with a shorter video or the app will automatically compress it.';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Video processing timed out. Please try again with a shorter video.';
      } else if (error.message?.includes('unauthorized')) {
        errorMessage = 'Authentication failed. Please log out and log back in.';
      } else if (error.message?.includes('Video compression failed')) {
        errorMessage = 'Video compression failed. Please try again with a shorter video or check your device storage.';
      }
      
      Alert.alert(
        'error', 
        errorMessage.toLowerCase(),
        [{ text: 'OK' }]
      );
    } finally {
      setIsPosting(false);
      setUploadProgress(0);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'discard changes?',
      'are you sure you want to discard this post?',
      [
        { text: 'cancel', style: 'cancel' },
        { text: 'discard', style: 'destructive', onPress: () => navigation.goBack() }
      ]
    );
  };

  const handleDownloadToCameraRoll = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('permission required', 'please grant camera roll permissions to download the video');
        return;
      }
      const asset = await MediaLibrary.createAssetAsync(video.path);
      if (asset) {
        Alert.alert('success', 'video successfully downloaded to camera roll.');
      }
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('error', 'failed to download video. please try again.');
    }
  };

  // Fade audio utility
  const fadeVolume = (from: number, to: number, duration: number = 300) => {
    const steps = 10;
    const stepTime = duration / steps;
    let current = from;
    const step = (to - from) / steps;
    let count = 0;
    const interval = setInterval(() => {
      current += step;
      setVideoVolume(Math.max(0, Math.min(1, current)));
      count++;
      if (count >= steps) {
        setVideoVolume(to);
        clearInterval(interval);
      }
    }, stepTime);
  };

  // Handler to sync time when opening full screen modal
  const handleEditVideo = () => {
    // Fade out audio before opening modal
    fadeVolume(videoVolume, 0, 200);
    setTimeout(() => setShowPreviewModal(true), 200);
  };

  // Handler to sync time when closing full screen modal
  const handleClosePreviewModal = (modalCurrentTime?: number, modalIsPlaying?: boolean) => {
    setShowPreviewModal(false);
    // Fade in audio after closing modal
    fadeVolume(videoVolume, 1, 200);
    if (typeof modalCurrentTime === 'number') {
      setCurrentTime(modalCurrentTime);
      if (videoRef.current && videoRef.current.seek) {
        videoRef.current.seek(modalCurrentTime);
      }
    }
    if (typeof modalIsPlaying === 'boolean') {
      setIsPlaying(modalIsPlaying);
    }
  };

  // Ensure file:// prefix for local files
  const videoUri = video.path.startsWith('file://') ? video.path : `file://${video.path}`;

  // Calculate container size based on video aspect ratio and screen width
  const aspectRatio = videoDimensions.width / videoDimensions.height;
  const containerWidth = VIDEO_WIDTH;
  const containerHeight = containerWidth / aspectRatio;

  // Add orientation state
  const getOrientation = () => {
    const { width, height } = Dimensions.get('window');
    return width > height ? 'landscape' : 'portrait';
  };

  const [orientation, setOrientation] = useState(getOrientation());

  useEffect(() => {
    const onChange = ({ window }: { window: { width: number; height: number } }) => {
      const { width, height } = window;
      setOrientation(width > height ? 'landscape' : 'portrait');
    };
    const sub = Dimensions.addEventListener('change', onChange);
    return () => sub?.remove();
  }, []);

  // Layout for landscape mode
  if (orientation === 'landscape' && isTablet()) {
    return (
      <View style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.black} />
        <View style={styles.landscapeContainer}>
          {/* Left: Info Side */}
          <View style={styles.landscapeInfoSide}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.landscapeInfoScroll, { paddingBottom: 0 }]}>
              <View style={styles.header}>
                <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
                  <BackArrowIcon size={32} color={Colors.white} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDownloadToCameraRoll} style={styles.headerButton}>
                  <DownloadIcon size={32} color={Colors.white} />
                </TouchableOpacity>
              </View>
              {/* Description Section */}
              <View style={styles.descriptionSection}>
                <View style={styles.sectionHeader}>
                  <TouchableOpacity
                    style={[styles.userInfoContainer, { flex: 1 }]}
                    onPress={() => { if (hasOtherAccounts) setAccountModalVisible((v) => !v); }}
                    activeOpacity={0.8}
                  >
                    <Avatar
                      uri={activeAccount?.avatar || profileData?.avatar || ''}
                      type="profile"
                      size={45}
                      style={styles.avatar}
                      ringColor={profileData?.profileColors?.foregroundColor || Colors.PROFILE.DEFAULT_RING}
                    />
                    <View style={styles.userTextContainer}>
                      {isProfileLoading && !profileData ? (
                        <View style={styles.loadingContainer}>
                          <ActivityIndicator size="small" color={Colors.white} />
                          <Text style={styles.loadingText}>loading profile...</Text>
                        </View>
                      ) : (
                        <>
                          <View style={styles.usernameContainer}>
                            <Text style={styles.username}>
                              {activeAccount?.displayName || profileData?.displayName || profileData?.handle || 'Username'}
                            </Text>
                            {(activeAccount?.handle || profileData?.handle) && (
                              <VerificationBadge
                                handle={activeAccount?.handle || profileData?.handle || ''}
                                textSize={16}
                                textColor={Colors.white}
                                customMargin={2}
                              />
                            )}
                          </View>
                          {(activeAccount?.handle || profileData?.handle) && (
                            <Text style={styles.userHandle}>
                              @{activeAccount?.handle || profileData?.handle}
                            </Text>
                          )}
                        </>
                      )}
                    </View>
                    {hasOtherAccounts && (
                      accountModalVisible ? (
                        <ChevronUpIcon size={24} color={Colors.white} style={{ marginLeft: 8 }} />
                      ) : (
                        <ChevronDownIcon size={24} color={Colors.white} style={{ marginLeft: 8 }} />
                      )
                    )}
                  </TouchableOpacity>
                </View>
                {/* Dropdown list of accounts, shown if accountModalVisible */}
                {accountModalVisible && hasOtherAccounts && (
                  <View style={{
                    backgroundColor: Colors.darkGray,
                    borderRadius: 12,
                    marginTop: 4,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: Colors.gray,
                    paddingVertical: 0,
                    shadowColor: Colors.lightGray,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 8,
                    elevation: 3,
                  }}>
                    {otherAccounts
                      .map((item, idx, filteredAccounts) => (
                        <AuthorItem
                          key={item.id}
                          handle={item.handle}
                          displayName={item.displayName || item.handle}
                          avatar={item.avatar}
                          size="medium"
                          showArrow={false}
                          onPress={() => handleSwitchAccount(item)}
                          style={{
                            borderBottomWidth: idx !== filteredAccounts.length - 1 ? 0.5 : 0,
                            borderBottomColor: Colors.gray,
                            backgroundColor: 'transparent',
                            borderRadius: 0,
                            borderWidth: 0,
                          }}
                          textColor={Colors.white}
                          backgroundColor="transparent"
                        />
                      ))}
                  </View>
                )}
                <TextInput
              style={styles.descriptionInput}
              placeholder="add a description for your video..."
                  placeholderTextColor={Colors.lightGray}
                  multiline
                  maxLength={300}
                  value={description}
                  onChangeText={setDescription}
                />
                <Text style={styles.charCount}>
                  {description.length}/300
                </Text>
              </View>
              {/* Content Warnings */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>content warnings</Text>
                  <TouchableOpacity onPress={() => setContentWarningsCollapsed(!contentWarningsCollapsed)}>
                    {contentWarningsCollapsed ? (
                      <ChevronDownIcon size={24} color={Colors.white} />
                    ) : (
                      <ChevronUpIcon size={24} color={Colors.white} />
                    )}
                  </TouchableOpacity>
                </View>
                {!contentWarningsCollapsed && (
                  <>
                    <Text style={styles.sectionSubtitle}>
                      add appropriate warnings if your video contains sensitive content.
                    </Text>
                    {CONTENT_WARNINGS.map(warning => (
                      <TouchableOpacity 
                        key={warning.id} 
                        style={styles.optionRow}
                        onPress={() => toggleContentWarning(warning.id)}
                      >
                        <Text style={styles.optionText}>{warning.label.toLowerCase()}</Text>
                        <View style={[
                          styles.checkbox,
                          selectedContentWarnings.includes(warning.id) && styles.checkboxSelected
                        ]}>
                          {selectedContentWarnings.includes(warning.id) && (
                            <Icon name="checkmark" size={16} color={Colors.white} />
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity 
                      style={styles.optionRow}
                      onPress={() => setShowContentWarningInput(!showContentWarningInput)}
                    >
                      <Text style={styles.optionText}>other warning</Text>
                      <View style={[
                        styles.checkbox,
                        showContentWarningInput && styles.checkboxSelected
                      ]}>
                        {showContentWarningInput && (
                          <Icon name="checkmark" size={16} color={Colors.white} />
                        )}
                      </View>
                    </TouchableOpacity>
                    {showContentWarningInput && (
                      <TextInput
                        style={styles.otherWarningInput}
                        placeholder="specify content warning"
                        placeholderTextColor={Colors.lightGray}
                        value={otherWarning}
                        onChangeText={setOtherWarning}
                      />
                    )}
                  </>
                )}
              </View>
              {/* Comment Filtering */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>comment settings</Text>
                  <TouchableOpacity onPress={() => setCommentSettingsCollapsed(!commentSettingsCollapsed)}>
                    {commentSettingsCollapsed ? (
                      <ChevronDownIcon size={24} color={Colors.white} />
                    ) : (
                      <ChevronUpIcon size={24} color={Colors.white} />
                    )}
                  </TouchableOpacity>
                </View>
                {!commentSettingsCollapsed && (
                  <>
                    <Text style={styles.sectionSubtitle}>
                      control who can comment on your video.
                    </Text>
                    {COMMENT_FILTERS.map(filter => (
                      <TouchableOpacity 
                        key={filter.id} 
                        style={styles.optionRow}
                        onPress={() => setCommentFilter(filter.id)}
                      >
                        <Text style={styles.optionText}>{filter.label}</Text>
                        <View style={styles.radioContainer}>
                          <Ionicons
                            name={commentFilter === filter.id ? 'radio-button-on' : 'radio-button-off'}
                            size={22}
                            color={commentFilter === filter.id ? Colors.lightGray : Colors.lightGray}
                          />
                          {commentFilter === filter.id && (
                            <Icon
                              name="checkmark"
                              size={16}
                              color={Colors.white}
                              style={styles.radioCheckmark}
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </View>
              {/* Video Info */}
              {videoInfo && (
                <VideoInfoDisplay
                  videoInfo={videoInfo.originalInfo}
                />
              )}
              {/* Post Button */}
              <TouchableOpacity 
                onPress={handlePost} 
                style={[
                  styles.landscapePostButton,
                  isPosting && styles.floatingPostButtonDisabled
                ]}
                disabled={isPosting}
              >
                {isPosting ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={Colors.lightGray} />
                    <Text style={styles.floatingButtonLoadingText}>
                      {uploadProgress < 50 ? `Uploading video... ${uploadProgress}%` : 
                        uploadProgress < 90 ? `Processing video... ${uploadProgress}%` : 
                        'Creating post...'}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.floatingPostButtonText}>
                    Post
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
          {/* Right: Video Preview Side */}
          <View style={styles.landscapeVideoSide}>
            <View style={styles.previewSection}>
              <TouchableOpacity onPress={handleEditVideo} activeOpacity={0.8} style={[styles.videoContainer, { width: '100%', aspectRatio: aspectRatio, maxHeight: '90%' }]}> 
                {videoLoading && (
                  <View style={[styles.video, { justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 2, backgroundColor: Colors.darkGray }]}> 
                    <ActivityIndicator size="large" color={Colors.white} />
                  </View>
                )}
                <View style={{ width: '100%', aspectRatio: aspectRatio, justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
                  <Video
                    ref={videoRef}
                    source={{ uri: videoUri }}
                    style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
                    resizeMode="contain"
                    paused={!isPlaying}
                    repeat={true}
                    muted={true}
                    volume={videoVolume}
                    onLoadStart={() => {
                      setVideoLoading(true);
                      setVideoError(null);
                    }}
                    onLoad={e => {
                      setVideoLoading(false);
                      if (e?.naturalSize?.width && e?.naturalSize?.height) {
                        setVideoDimensions({ width: e.naturalSize.width, height: e.naturalSize.height });
                      }
                      if (currentTime > 0 && videoRef.current && videoRef.current.seek) {
                        videoRef.current.seek(currentTime);
                      }
                    }}
                    onProgress={status => {
                      if (status?.currentTime !== undefined) {
                        setCurrentTime(status.currentTime);
                      }
                    }}
                    onError={e => {
                      setVideoLoading(false);
                      setVideoError('Failed to load video');
                    }}
                  />
                </View>
                {videoError && (
                  <View style={[styles.video, { justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 3, backgroundColor: Colors.darkGray }]}> 
                    <Text style={{ color: Colors.white, fontSize: 16 }}>{videoError && videoError.toLowerCase()}</Text>
                  </View>
                )}
                {!videoLoading && !videoError && textOverlays && textOverlays.length > 0 && textOverlays.map((overlay: TextOverlay) => (
                  <View
                    key={overlay.id}
                    style={[
                      styles.textOverlayContainer,
                      {
                        left: overlay.position.x,
                        top: overlay.position.y,
                        transform: [{ scale: overlay.scale }]
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.textOverlay,
                        { 
                          fontFamily: overlay.fontFamily,
                          color: overlay.color
                        }
                      ]}
                    >
                      {overlay.text}
                    </Text>
                  </View>
                ))}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {/* Video Preview Modal (unchanged) */}
        <VideoPreviewModal
          visible={showPreviewModal}
          onClose={handleClosePreviewModal}
          videoPath={video.path}
          description={description}
          userProfile={profileData}
          initialTime={currentTime}
          initialIsPlaying={isPlaying}
        />
      </View>
    );
  }

  // ... existing portrait layout ...

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.black} />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
            <BackArrowIcon size={32} color={Colors.white} />
          </TouchableOpacity>
          {/* Remove the account avatar/user icon button here */}
          <TouchableOpacity onPress={handleDownloadToCameraRoll} style={styles.headerButton}>
            <DownloadIcon size={32} color={Colors.white} />
          </TouchableOpacity>
        </View>
  
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContentContainer}>
          {/* Video Preview Section */}
          <View style={styles.previewSection}>
            <TouchableOpacity onPress={handleEditVideo} activeOpacity={0.8} style={[styles.videoContainer, { width: containerWidth, height: containerHeight }]}>
              {/* Show loading indicator while video is loading */}
              {videoLoading && (
                <View style={[styles.video, { justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 2, backgroundColor: Colors.darkGray }]}> 
                  <ActivityIndicator size="large" color={Colors.white} />
                </View>
              )}
              <View style={{ width: containerWidth, height: containerHeight, justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
                <Video
                  ref={videoRef}
                  source={{ uri: videoUri }}
                  style={{ width: videoDimensions.width, height: videoDimensions.height, maxWidth: containerWidth, maxHeight: containerHeight, backgroundColor: 'transparent' }}
                  resizeMode="contain"
                  paused={!isPlaying}
                  repeat={true}
                  muted={true}
                  volume={videoVolume}
                  onLoadStart={() => {
                    setVideoLoading(true);
                    setVideoError(null);
                  }}
                  onLoad={e => {
                    setVideoLoading(false);
                    if (e?.naturalSize?.width && e?.naturalSize?.height) {
                      setVideoDimensions({ width: e.naturalSize.width, height: e.naturalSize.height });
                    }
                    // Seek to currentTime if not at start
                    if (currentTime > 0 && videoRef.current && videoRef.current.seek) {
                      videoRef.current.seek(currentTime);
                    }
                  }}
                  onProgress={status => {
                    if (status?.currentTime !== undefined) {
                      setCurrentTime(status.currentTime);
                    }
                  }}
                  onError={e => {
                    setVideoLoading(false);
                    setVideoError('Failed to load video');
                  }}
                />
              </View>
              {/* Error message if video fails to load */}
              {videoError && (
                <View style={[styles.video, { justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 3, backgroundColor: Colors.darkGray }]}> 
                  <Text style={{ color: Colors.white, fontSize: 16 }}>{videoError}</Text>
                </View>
              )}
              {/* Text Overlays - only show if they exist */}
              {!videoLoading && !videoError && textOverlays && textOverlays.length > 0 && textOverlays.map((overlay: TextOverlay) => (
                <View
                  key={overlay.id}
                  style={[
                    styles.textOverlayContainer,
                    {
                      left: overlay.position.x,
                      top: overlay.position.y,
                      transform: [{ scale: overlay.scale }]
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.textOverlay,
                      { 
                        fontFamily: overlay.fontFamily,
                        color: overlay.color
                      }
                    ]}
                  >
                    {overlay.text}
                  </Text>
                </View>
              ))}
            </TouchableOpacity>
          </View>
          
          {/* Description Section */}
          <View style={styles.descriptionSection}>
            <View style={styles.sectionHeader}>
              <TouchableOpacity
                style={[styles.userInfoContainer, { flex: 1 }]}
                onPress={() => { if (hasOtherAccounts) setAccountModalVisible((v) => !v); }}
                activeOpacity={0.8}
              >
                <Avatar
                  uri={activeAccount?.avatar || profileData?.avatar || ''}
                  type="profile"
                  size={45}
                  style={styles.avatar}
                  ringColor={profileData?.profileColors?.foregroundColor || Colors.PROFILE.DEFAULT_RING}
                />
                <View style={styles.userTextContainer}>
                  {isProfileLoading && !profileData ? (
                    <View style={styles.loadingContainer}>
                          <ActivityIndicator size="small" color={Colors.white} />
                          <Text style={styles.loadingText}>loading profile...</Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.usernameContainer}>
                        <Text style={styles.username}>
                          {activeAccount?.displayName || profileData?.displayName || profileData?.handle || 'Username'}
                        </Text>
                        {(activeAccount?.handle || profileData?.handle) && (
                          <VerificationBadge
                            handle={activeAccount?.handle || profileData?.handle || ''}
                            textSize={16}
                            textColor={Colors.white}
                            customMargin={2}
                          />
                        )}
                      </View>
                      {(activeAccount?.handle || profileData?.handle) && (
                        <Text style={styles.userHandle}>
                          @{activeAccount?.handle || profileData?.handle}
                        </Text>
                      )}
                    </>
                  )}
                </View>
                {hasOtherAccounts && (
                  accountModalVisible ? (
                    <ChevronUpIcon size={24} color={Colors.white} style={{ marginLeft: 8 }} />
                  ) : (
                    <ChevronDownIcon size={24} color={Colors.white} style={{ marginLeft: 8 }} />
                  )
                )}
              </TouchableOpacity>
            </View>
            {/* Dropdown list of accounts, shown if accountModalVisible */}
            {accountModalVisible && hasOtherAccounts && (
              <View style={{ backgroundColor: Colors.darkGray, borderRadius: 12, marginTop: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.gray, paddingVertical: 6, shadowColor: Colors.black, shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}>
                {otherAccounts
                  .map((item, idx, filteredAccounts) => (
                    <AuthorItem
                      key={item.id}
                      handle={item.handle}
                      displayName={item.displayName || item.handle}
                      avatar={item.avatar}
                      size="medium"
                      showArrow={false}
                      onPress={() => handleSwitchAccount(item)}
                      style={{
                        borderBottomWidth: idx !== filteredAccounts.length - 1 ? 1 : 0,
                        borderBottomColor: Colors.darkGray,
                        borderRadius: 0,
                        borderWidth: 0,
                      }}
                      textColor={Colors.white}
                      backgroundColor="transparent"
                    />
                  ))}
              </View>
            )}
            <TextInput
              style={styles.descriptionInput}
              placeholder="write a caption..."
              placeholderTextColor={Colors.gray}
              multiline
              maxLength={300}
              value={description}
              onChangeText={setDescription}
            />
            
                 <Text style={styles.charCount}>
                   {description.length}/300
                 </Text>
          </View>
          
          {/* Content Warning Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>content warnings</Text>
              <TouchableOpacity onPress={() => setContentWarningsCollapsed(!contentWarningsCollapsed)}>
                {contentWarningsCollapsed ? (
                  <ChevronDownIcon size={24} color={Colors.white} />
                ) : (
                  <ChevronUpIcon size={24} color={Colors.white} />
                )}
              </TouchableOpacity>
            </View>
            {!contentWarningsCollapsed && (
              <>
                    <Text style={styles.sectionSubtitle}>
                      add appropriate warnings if your video contains sensitive content.
                </Text>
                {CONTENT_WARNINGS.map(warning => (
                  <TouchableOpacity 
                    key={warning.id} 
                    style={styles.optionRow}
                    onPress={() => toggleContentWarning(warning.id)}
                  >
                         <Text style={styles.optionText}>{warning.label.toLowerCase()}</Text>
                    <View style={[
                      styles.checkbox,
                      selectedContentWarnings.includes(warning.id) && styles.checkboxSelected
                    ]}>
                      {selectedContentWarnings.includes(warning.id) && (
                        <Icon name="checkmark" size={16} color={Colors.white} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity 
                  style={styles.optionRow}
                  onPress={() => setShowContentWarningInput(!showContentWarningInput)}
                >
                       <Text style={styles.optionText}>other warning</Text>
                  <View style={[
                    styles.checkbox,
                    showContentWarningInput && styles.checkboxSelected
                  ]}>
                    {showContentWarningInput && (
                      <Icon name="checkmark" size={16} color={Colors.white} />
                    )}
                  </View>
                </TouchableOpacity>
                {showContentWarningInput && (
                  <TextInput
                    style={styles.otherWarningInput}
                    placeholder="Specify content warning"
                    placeholderTextColor={Colors.gray}
                    value={otherWarning}
                    onChangeText={setOtherWarning}
                  />
                )}
              </>
            )}
          </View>
          
          {/* Comment Filtering Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
                 <Text style={styles.sectionTitle}>comment settings</Text>
              <TouchableOpacity onPress={() => setCommentSettingsCollapsed(!commentSettingsCollapsed)}>
                {commentSettingsCollapsed ? (
                  <ChevronDownIcon size={24} color={Colors.white} />
                ) : (
                  <ChevronUpIcon size={24} color={Colors.white} />
                )}
              </TouchableOpacity>
            </View>
            {!commentSettingsCollapsed && (
              <>
                    <Text style={styles.sectionSubtitle}>
                      control who can comment on your video.
                </Text>
                {COMMENT_FILTERS.map(filter => (
                  <TouchableOpacity 
                    key={filter.id} 
                    style={styles.optionRow}
                    onPress={() => setCommentFilter(filter.id)}
                  >
                         <Text style={styles.optionText}>{filter.label.toLowerCase()}</Text>
                    <View style={styles.radioContainer}>
                      <Ionicons
                        name={commentFilter === filter.id ? 'radio-button-on' : 'radio-button-off'}
                        size={22}
                        color={commentFilter === filter.id ? Colors.lightGray : Colors.gray}
                      />
                      {commentFilter === filter.id && (
                        <Icon
                          name="checkmark"
                          size={16}
                          color={Colors.white}
                          style={styles.radioCheckmark}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
          
          {/* Video Information Display */}
          {videoInfo && (
            <VideoInfoDisplay
              videoInfo={videoInfo.originalInfo}
            />
          )}
          
        </ScrollView>
        

        
        <TouchableOpacity 
          onPress={handlePost} 
          style={[
            styles.floatingPostButton,
            isPosting && styles.floatingPostButtonDisabled
          ]}
          disabled={isPosting}
        >
          {isPosting ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={Colors.black} />
              <Text style={styles.floatingButtonLoadingText}>
                {uploadProgress < 50 ? `Uploading video... ${uploadProgress}%` : 
                 uploadProgress < 90 ? `Processing video... ${uploadProgress}%` : 
                 'Creating post...'}
              </Text>
            </View>
          ) : (
                   <Text style={styles.floatingPostButtonText}>
                     post
                   </Text>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
      
      {/* Video Preview Modal */}
      <VideoPreviewModal
        visible={showPreviewModal}
        onClose={handleClosePreviewModal}
        videoPath={video.path}
        description={description}
        userProfile={profileData}
        initialTime={currentTime}
        initialIsPlaying={isPlaying}
      />

      {/* Account Switcher Modal */}
      {/* This Modal is removed as per the edit hint to remove the account switcher from the header */}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
  },
  headerButton: {
    padding: 8,
    borderRadius: 20,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.overlayBlack50,
    marginHorizontal: 2,
  },
  postButton: {
    backgroundColor: Colors.darkGray,
    paddingHorizontal: 15,
  },
  postButtonText: {
    color: Colors.white,
    fontFamily: 'Firma-Bold',
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
    paddingBottom: 50,
  },
  previewSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0,
  },
  videoContainer: {
    backgroundColor: Colors.darkGray,
    position: 'relative',
    overflow: 'hidden',
    alignSelf: 'center',
    borderRadius: 15,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  textOverlayContainer: {
    position: 'absolute',
    padding: 8,
    minWidth: 50,
    zIndex: 2,
  },
  textOverlay: {
    color: Colors.white,
    fontSize: 22,
    fontFamily: 'Firma-Bold',
    textAlign: 'center',
    textShadowColor: Colors.overlayBlack50,
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    padding: 4,
  },
  playPauseButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -25,
    marginTop: -25,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.overlayBlack60,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  editButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.overlayBlack50,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 15,
    paddingBottom: 15,
    zIndex: 1,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: Colors.overlayWhite30,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.darkGray,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  timeText: {
    color: Colors.white,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
  },
  descriptionSection: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.overlayWhite10,
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  avatar: {
    marginRight: 12,
  },
  userTextContainer: {
    flex: 1,
  },
  usernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  username: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Black',
    marginRight: 3,
    textShadowColor: Colors.overlayBlack50,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  userHandle: {
    color: Colors.overlayWhite80,
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    textShadowColor: Colors.overlayBlack50,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
  descriptionInput: {
    color: Colors.white,
    fontFamily: 'Firma-Regular',
    fontSize: 16,
    minHeight: 80,
    maxHeight: 150,
    textAlignVertical: 'top',
    paddingBottom: 20,
  },
  charCount: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    textAlign: 'right',
    marginTop: 5,
  },
  section: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.overlayWhite10,
  },
  sectionTitle: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionSubtitle: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginBottom: 15,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  optionText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: Colors.darkGray,
    borderColor: Colors.lightGray,
  },
  radioButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: {
    borderColor: Colors.lightGray,
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.darkGray,
  },
  otherWarningInput: {
    backgroundColor: Colors.darkGray,
    borderRadius: 8,
    padding: 12,
    color: Colors.white,
    marginTop: 5,
    marginBottom: 10,
    fontFamily: 'Firma-Regular',
  },
  floatingPostButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: Colors.white,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  floatingPostButtonText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontFamily: 'Firma-Black',
  },
  floatingPostButtonDisabled: {
    opacity: 1,
  },
  floatingButtonLoadingText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
  },

  scrollViewContentContainer: {
    paddingBottom: 150,
  },
  radioContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCheckmark: {
    position: 'absolute',
    top: 3,
    left: 3,
  },
  landscapeContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.darkGray,
  },
  landscapeInfoSide: {
    flex: 1,
    padding: 20,
    backgroundColor: Colors.darkGray,
    justifyContent: 'flex-start',
    minWidth: 0,
  },
  landscapeInfoScroll: {
    paddingBottom: 40,
  },
  landscapeVideoSide: {
    flex: 1,
    backgroundColor: Colors.darkGray,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    padding: 0,
  },
  landscapePostButton: {
    marginTop: 24,
    backgroundColor: Colors.white,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },

});

export default VideoPostScreen;