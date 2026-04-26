import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { NativePressable } from '@/components/ui/NativePressable';
import { ArrowRightFillIcon, CloseFillIcon } from '@/components/ui/Icon';

interface Props {
  topInset: number;
  showDone: boolean;
  doneDisabled: boolean;
  onBack: () => void;
  onDone: () => void;
}

const CreateTopBar: React.FC<Props> = ({ topInset, showDone, doneDisabled, onBack, onDone }) => {
  const backStyle: StyleProp<ViewStyle> = [styles.button, { top: topInset, left: 4 }];
  const doneStyle: StyleProp<ViewStyle> = [styles.button, { top: topInset, right: 4 }];

  return (
    <>
      <NativePressable style={backStyle} onPress={onBack} androidRippleBorderless>
        <CloseFillIcon size={26} color="white" />
      </NativePressable>

      {showDone && (
        <NativePressable
          style={doneStyle}
          onPress={onDone}
          disabled={doneDisabled}
          androidRippleBorderless
        >
          <ArrowRightFillIcon size={30} color="white" />
        </NativePressable>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    zIndex: 1000,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default React.memo(CreateTopBar);
