import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  SafeAreaView,
} from 'react-native';
import { ModerationService } from '../../../services/ModerationService';
import { ModerationDecision } from '../../../services/ModerationTypes';
import Icon, { BackArrowIcon } from '../../ui/Icon';
import { Colors } from '../../ui/UI';

interface ModerationDebugProps {
  visible: boolean;
  onClose: () => void;
}

const ModerationDebug: React.FC<ModerationDebugProps> = ({ visible, onClose }) => {
  const [testResults, setTestResults] = useState<Array<{post: any, decision: ModerationDecision}>>([]);

  useEffect(() => {
    if (visible) {
      runTests();
    }
  }, [visible]);

  const runTests = async () => {
    // Removed debug log statements and test code for production
    setTestResults([]);
  };

  const getDecisionColor = (decision: ModerationDecision) => {
    if (decision.filter) return '#FF4444';
    if (decision.blur) return '#FFAA00';
    return '#44FF44';
  };

  const getDecisionText = (decision: ModerationDecision) => {
    if (decision.filter) return 'FILTERED';
    if (decision.blur) return 'BLURRED';
    return 'ALLOWED';
  };

  if (!visible) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <BackArrowIcon size={24} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Debug Moderation</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content}>
        {/* Test Results Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Test Results</Text>
          {testResults.map((result, index) => (
            <View key={index} style={styles.testResult}>
              <View style={styles.testHeader}>
                <Text style={styles.testUri}>{result.post.post.uri}</Text>
                <View style={[
                  styles.decisionBadge,
                  { backgroundColor: getDecisionColor(result.decision) }
                ]}>
                  <Text style={styles.decisionText}>
                    {getDecisionText(result.decision)}
                  </Text>
                </View>
              </View>
              {result.decision.reason && (
                <Text style={styles.reasonText}>Reason: {result.decision.reason}</Text>
              )}
              {result.decision.source && (
                <Text style={styles.sourceText}>Source: {result.decision.source}</Text>
              )}
              {result.decision.informs.length > 0 && (
                <Text style={styles.informsText}>
                  Informs: {result.decision.informs.join(', ')}
                </Text>
              )}
            </View>
          ))}
        </View>

        {/* Actions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          {/* Removed debug/test action buttons for production */}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
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
    borderBottomColor: Colors.mediumGray,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.darkGray,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.mediumGray,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15,
    fontFamily: 'Firma-SemiBold',
  },
  testResult: {
    backgroundColor: Colors.darkGray,
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  testHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  testUri: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
    flex: 1,
  },
  decisionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  decisionText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
  },
  reasonText: {
    color: Colors.yellow,
    fontSize: 12,
    marginBottom: 5,
    fontFamily: 'Firma-Regular',
  },
  sourceText: {
    color: Colors.lightGray,
    fontSize: 12,
    marginBottom: 5,
    fontFamily: 'Firma-Regular',
  },
  informsText: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
  },
  actionButton: {
    backgroundColor: Colors.lightGray,
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  });
  
export default ModerationDebug; 