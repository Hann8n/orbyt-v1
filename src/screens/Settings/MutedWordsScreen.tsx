import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { BackArrowIcon } from '../../components/ui/Icon';
import { Colors } from '../../components/ui/UI';
import UI from '../../components/ui/UI';
import { ModerationService } from '../../services/ModerationService';

interface MutedWord {
  id: string;
  word: string;
  createdAt: string;
}

const MutedWordsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [mutedWords, setMutedWords] = useState<MutedWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingWords, setRemovingWords] = useState<Set<string>>(new Set());
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadMutedWords();
  }, []);

  const loadMutedWords = async () => {
    try {
      setLoading(true);
      const settings = await ModerationService.getModerationSettings();
      const words = settings.mutedWords || [];
      const wordObjects = words.map((word, index) => ({
        id: `word-${index}`,
        word,
        createdAt: new Date().toISOString(), // Mock date since we don't have real timestamps
      }));
      setMutedWords(wordObjects);
    } catch (error) {
      console.error('Error loading muted words:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveWord = async (wordId: string) => {
    try {
      setRemovingWords(prev => new Set(prev).add(wordId));
      
      // Get current settings and remove the word
      const settings = await ModerationService.getModerationSettings();
      const wordToRemove = mutedWords.find(w => w.id === wordId);
      if (wordToRemove) {
        const updatedWords = settings.mutedWords.filter((word: string) => word !== wordToRemove.word);
        const updatedSettings = { ...settings, mutedWords: updatedWords };
        await ModerationService.saveModerationSettings(updatedSettings);
        setMutedWords(prev => prev.filter(word => word.id !== wordId));
      }
    } catch (error) {
      console.error('Error removing muted word:', error);
    } finally {
      setRemovingWords(prev => {
        const newSet = new Set(prev);
        newSet.delete(wordId);
        return newSet;
      });
    }
  };

  const renderWordItem = ({ item }: { item: MutedWord }) => {
    const isRemoving = removingWords.has(item.id);

    return (
      <View style={styles.wordItem}>
        <View style={styles.wordInfo}>
          <View style={styles.wordIconContainer}>
            <Icon name="message-delete" size={24} color={Colors.white} />
          </View>
          <View style={styles.wordDetails}>
            <Text style={styles.wordText}>{item.word}</Text>
            <Text style={styles.wordDate}>
              Added {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[
            styles.removeButton,
            isRemoving && styles.removeButtonDisabled
          ]}
          onPress={() => handleRemoveWord(item.id)}
          disabled={isRemoving}
          activeOpacity={0.7}
        >
          {isRemoving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
                              <Icon name="section-x" size={16} color={Colors.white} />
              <Text style={styles.removeButtonText}>Remove</Text>
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
          <Text style={styles.headerTitle}>muted words</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.white} />
          <Text style={styles.loadingText}>Loading muted words...</Text>
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
                  <Text style={styles.headerTitle}>muted words</Text>
        <View style={styles.headerRight} />
      </View>

      <FlatList
        data={mutedWords}
        keyExtractor={(item) => item.id}
        renderItem={renderWordItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="message-delete" size={24} color={Colors.white} />
            <Text style={styles.emptyTitle}>no muted words</Text>
            <Text style={styles.emptyDescription}>
              you haven't muted any words yet. posts containing muted words won't appear in your feed.
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
  wordItem: {
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
  wordInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  wordIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  wordDetails: {
    flex: 1,
  },
  wordText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  wordDate: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginTop: 2,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI.Colors.STATUS.ERROR,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    minWidth: 100,
    height: 40,
    borderWidth: 1,
    borderColor: UI.Colors.STATUS.ERROR,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  removeButtonDisabled: {
    opacity: 0.7,
  },
  removeButtonText: {
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

export default MutedWordsScreen; 