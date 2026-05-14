import React, { useRef, useCallback } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
  type TextInputProps,
} from 'react-native';
import { SquircleView } from './Squircle';
import { Colors } from './UI';
import { SearchBanner, useSearchTrigger } from './usersearch';
import type { ProfileViewBasic } from '../../services/api/types';

interface MentionInputWithSearchProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  maxLength?: number;
  inputRef?: React.RefObject<TextInput | null>;
  multiline?: boolean;
  selection?: { start: number; end: number };
  onSelectionChange?: (e: { nativeEvent: { selection: { start: number; end: number } } }) => void;
  layoutMode?: 'horizontal-pills' | 'vertical-list';
  searchBannerPosition?: 'above' | 'below';
  renderLeftAccessory?: () => React.ReactNode;
  renderRightAccessory?: () => React.ReactNode;
  renderAboveInput?: () => React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputWrapperStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  searchBannerContainerStyle?: StyleProp<ViewStyle>;
  onSubmit?: () => void;
  onMentionInsert?: (user: ProfileViewBasic) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  textInputProps?: Omit<TextInputProps, 'value' | 'onChangeText' | 'onSelectionChange' | 'placeholder' | 'maxLength' | 'multiline' | 'ref'>;
}

const MentionInputWithSearch: React.FC<MentionInputWithSearchProps> = ({
  value,
  onChangeText,
  placeholder,
  maxLength,
  inputRef: externalInputRef,
  multiline = true,
  selection: externalSelection,
  onSelectionChange: externalOnSelectionChange,
  layoutMode = 'horizontal-pills',
  searchBannerPosition = 'above',
  renderLeftAccessory,
  renderRightAccessory,
  renderAboveInput,
  containerStyle,
  inputWrapperStyle,
  inputStyle,
  searchBannerContainerStyle,
  onSubmit,
  onMentionInsert,
  onFocus,
  onBlur,
  textInputProps,
}) => {
  const internalInputRef = useRef<TextInput | null>(null);
  const inputRef = externalInputRef ?? internalInputRef;
  
  const [inputSelection, setInputSelection] = React.useState({ start: 0, end: 0 });
  const selection = externalSelection ?? inputSelection;
  
  const handleSelectionChange = useCallback((e: { nativeEvent: { selection: { start: number; end: number } } }) => {
    if (!externalSelection) {
      setInputSelection(e.nativeEvent.selection);
    }
    externalOnSelectionChange?.(e);
  }, [externalSelection, externalOnSelectionChange]);

  const { inputProps: mentionInputProps, bannerProps: searchProps } = useSearchTrigger({
    value,
    selection,
    onChangeText,
    onSelectionChange: handleSelectionChange,
    inputRef,
    horizontalPillStyle: layoutMode === 'horizontal-pills',
    enableHashtags: true,
    onMentionInsert,
  });

  const isHorizontalPills = layoutMode === 'horizontal-pills';

  const banner = (
    <SearchBanner
      {...searchProps}
      containerStyle={[
        isHorizontalPills ? styles.horizontalBannerContainer : styles.verticalBannerContainer,
        searchBannerContainerStyle,
      ]}
    />
  );

  return (
    <View style={[styles.container, containerStyle]}>
      {searchBannerPosition === 'above' && banner}

      {renderAboveInput?.()}

      <View style={styles.inputRow}>
        {renderLeftAccessory?.()}

        <SquircleView style={[styles.inputWrapper, inputWrapperStyle]}>
          <TextInput
            ref={inputRef}
            {...mentionInputProps}
            {...textInputProps}
            value={value}
            onChangeText={onChangeText}
            onSelectionChange={handleSelectionChange}
            placeholder={placeholder}
            placeholderTextColor={Colors.neutral[500]}
            multiline={multiline}
            maxLength={maxLength ? maxLength + 25 : undefined}
            style={[styles.textInput, inputStyle, textInputProps?.style]}
            onFocus={onFocus}
            onBlur={onBlur}
            onSubmitEditing={onSubmit}
            blurOnSubmit={!multiline}
            keyboardType="default"
            returnKeyType={multiline ? 'default' : 'send'}
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            textAlignVertical="top"
          />
        </SquircleView>

        {renderRightAccessory?.()}
      </View>

      {searchBannerPosition === 'below' && banner}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: Colors.transparent,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  textInput: {
    color: Colors.neutral[50],
    fontSize: 16,
    lineHeight: 20,
    padding: 0,
    margin: 0,
  },
  horizontalBannerContainer: {
    maxHeight: 80,
  },
  verticalBannerContainer: {
    maxHeight: 200,
  },
});

interface UseMentionInputOptions {
  value: string;
  selection: { start: number; end: number };
  onChangeText: (text: string) => void;
  onSelectionChange?: (e: { nativeEvent: { selection: { start: number; end: number } } }) => void;
  inputRef?: React.RefObject<TextInput | null>;
  layoutMode?: 'horizontal-pills' | 'vertical-list';
  searchBannerContainerStyle?: StyleProp<ViewStyle>;
}

/** Hook variant — use when you need to render the SearchBanner outside the input container. */
export function useMentionInput({
  value,
  selection,
  onChangeText,
  onSelectionChange,
  inputRef,
  layoutMode = 'horizontal-pills',
  searchBannerContainerStyle,
}: UseMentionInputOptions) {
  const isHorizontalPills = layoutMode === 'horizontal-pills';
  const { inputProps, bannerProps } = useSearchTrigger({
    value,
    selection,
    onChangeText,
    onSelectionChange,
    inputRef,
    horizontalPillStyle: isHorizontalPills,
    enableHashtags: true,
  });

  const banner = (
    <SearchBanner
      {...bannerProps}
      containerStyle={[
        isHorizontalPills ? styles.horizontalBannerContainer : styles.verticalBannerContainer,
        searchBannerContainerStyle,
      ]}
    />
  );

  return { mentionInputProps: inputProps, banner };
}

export { MentionInputWithSearch };
export type { MentionInputWithSearchProps };
