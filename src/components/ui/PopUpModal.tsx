import React from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from './UI';
import { SquircleView, SquircleNativePressable } from './Squircle';
import { FontFamily, Typography } from '@/utils/components/typography';
import { hexToRGBA } from '@/utils/formatting/colors';

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
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()}>
          <SquircleView style={styles.modalContainer}>
            <Text style={styles.modalTitle}>{title}</Text>
            {subtitle && <Text style={styles.modalSubtitle}>{subtitle}</Text>}

            <View style={styles.childrenContainer}>{children}</View>

            {actions.length > 0 && (
              <View style={styles.actionsContainer}>
                {actions.map((action, index) => (
                  <SquircleNativePressable
                    key={index}
                    style={[
                      styles.actionButton,
                      action.isPrimary ? styles.primaryButton : styles.secondaryButton,
                    ]}
                    onPress={action.onPress}
                  >
                    <Text
                      style={[
                        styles.actionButtonText,
                        action.isPrimary && styles.primaryButtonText,
                      ]}
                    >
                      {action.label}
                    </Text>
                  </SquircleNativePressable>
                ))}
              </View>
            )}
          </SquircleView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay.black60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 20,
    boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
  },
  modalTitle: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.title,
    fontWeight: 'bold',
    marginBottom: 8,
    fontFamily: FontFamily.bold,
  },
  modalSubtitle: {
    color: hexToRGBA(Colors.neutral[50], 0.7),
    fontSize: Typography.sizes.bodySmall,
    marginBottom: 16,
    fontFamily: FontFamily.regular,
  },
  childrenContainer: {
    marginBottom: 16,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  secondaryButton: {
    backgroundColor: Colors.overlay.white10,
  },
  primaryButton: {
    backgroundColor: Colors.neutral[900],
  },
  actionButtonText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.medium,
  },
  primaryButtonText: {
    fontFamily: FontFamily.bold,
  },
});

export default PopUpModal;
