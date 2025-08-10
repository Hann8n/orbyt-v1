import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import { Colors } from './UI';

interface PopUpModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: {
    label: string;
    onPress: () => void;
    isPrimary?: boolean;
  }[];
}

const PopUpModal: React.FC<PopUpModalProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  children,
  actions = [],
}) => {
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.modalBackdrop} 
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableWithoutFeedback>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>{title}</Text>
            {subtitle && (
              <Text style={styles.modalSubtitle}>{subtitle}</Text>
            )}
            
            <View style={styles.childrenContainer}>
              {children}
            </View>
            
            {actions.length > 0 && (
              <View style={styles.actionsContainer}>
                {actions.map((action, index) => (
                  <TouchableOpacity 
                    key={index}
                    style={[
                      styles.actionButton, 
                      action.isPrimary ? styles.primaryButton : styles.secondaryButton,
                      index > 0 && { marginLeft: 8 }
                    ]} 
                    onPress={action.onPress}
                  >
                    <Text 
                      style={[
                        styles.actionButtonText,
                        action.isPrimary && styles.primaryButtonText
                      ]}
                    >
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: Colors.darkGray,
    borderRadius: 12,
    padding: 20,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    fontFamily: 'Firma-Bold',
  },
  modalSubtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    marginBottom: 16,
    fontFamily: 'Firma-Regular',
  },
  childrenContainer: {
    marginBottom: 16,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  primaryButton: {
    backgroundColor: Colors.darkGray,
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
  },
  primaryButtonText: {
    fontFamily: 'Firma-Bold',
  },
});

export default PopUpModal;