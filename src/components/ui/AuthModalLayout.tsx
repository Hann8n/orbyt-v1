import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { Colors } from './UI';
import { AUTH_INPUT_CONTENT_PADDING_START } from './AuthSheetStyles';
import { DEFAULT_GRABBER_OPTIONS, SHEET_STYLES } from '@/utils/components/truesheet';
import { Typography } from '@/utils/components/typography';

/** Horizontal padding for auth modal body; fixed-body top inset matches this (symmetric with sides). */
const AUTH_MODAL_HORIZONTAL_GUTTER = 20;

/** Default top inset inside the sticky footer (above primary CTA). */
const AUTH_STICKY_INNER_PADDING_TOP = 8;

/**
 * Gap above the keyboard when open — see KeyboardStickyView `offset.opened`:
 * https://kirillzyusko.github.io/react-native-keyboard-controller/docs/api/components/keyboard-sticky-view
 */
const KEYBOARD_STICKY_OFFSET_OPENED = 20;

/**
 * Extra bottom space for `KeyboardAwareScrollView` so focused fields stay above the sticky CTA
 * while the keyboard is open (approx. primary button + sticky padding).
 */
export const AUTH_KEYBOARD_OVERLAP_SIGN_IN = 112;
export const AUTH_KEYBOARD_OVERLAP_SIGN_UP = 112;

interface AuthModalLayoutProps {
  /**
   * Visible page title (left-aligned). Above `fixedBody`, or above the scroll area when there is no
   * fixed body (with optional `description` under the title in that case).
   */
  title?: string;
  /** Shown under the title for scroll-only layouts only. Not used when `fixedBody` is set. */
  description?: string;
  /**
   * Pinned above the scroll area (not scrolled with `children`). Use for fields that should stay
   * fixed while a list below scrolls (e.g. sign-in handle + search results).
   */
  fixedBody?: React.ReactNode;
  /** Scrollable body below `fixedBody`. Primary CTA lives in `stickyFooter`. */
  children: React.ReactNode;
  /** Primary action(s) pinned above the keyboard via `KeyboardStickyView`. */
  stickyFooter: React.ReactNode;
  /** Passed to `KeyboardAwareScrollView.extraKeyboardSpace`. */
  keyboardOverlapSpace: number;
  /**
   * Top padding inside the sticky footer. Use `0` when the first row uses symmetric vertical
   * padding (e.g. add-account copy above the CTA). Defaults to `AUTH_STICKY_INNER_PADDING_TOP`.
   */
  stickyInnerPaddingTop?: number;
}

/**
 * Auth modal: top grabber (pull down to dismiss), keyboard-aware scroll, and a footer that tracks
 * the keyboard (`react-native-keyboard-controller` — KeyboardAwareScrollView + KeyboardStickyView).
 */
const AuthModalLayout: React.FC<AuthModalLayoutProps> = ({
  title,
  description,
  fixedBody,
  children,
  stickyFooter,
  keyboardOverlapSpace,
  stickyInnerPaddingTop = AUTH_STICKY_INNER_PADDING_TOP,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  /** Safe-area only; keyboard–button spacing uses `KeyboardStickyView` `offset.opened`. */
  const stickyBottomPad = insets.bottom;

  const grabberTopPad =
    (Platform.OS === 'android' ? insets.top : 0) + (DEFAULT_GRABBER_OPTIONS.topMargin ?? 0);

  /** Title (+ optional description) live in the chrome row; grabber should not repeat the title. */
  const hasVisibleTitle = Boolean(title);
  const scrollOnlyHeader = !fixedBody && hasVisibleTitle;

  return (
    <View style={styles.root}>
      <View
        style={[styles.grabberHost, { paddingTop: grabberTopPad }]}
        accessible
        accessibilityLabel={hasVisibleTitle ? undefined : title}
        accessibilityHint={t('auth.pullDownToDismiss')}
        accessibilityRole="none"
      >
        <View
          style={[
            styles.grabberPill,
            {
              width: DEFAULT_GRABBER_OPTIONS.width,
              height: DEFAULT_GRABBER_OPTIONS.height,
              borderRadius: DEFAULT_GRABBER_OPTIONS.cornerRadius,
              backgroundColor: DEFAULT_GRABBER_OPTIONS.color,
            },
          ]}
        />
      </View>
      {fixedBody ? (
        <View style={styles.fixedBodySection}>
          {title ? (
            <Text style={styles.fixedBodyTitle} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          <View style={styles.fixedBody}>{fixedBody}</View>
        </View>
      ) : scrollOnlyHeader ? (
        <View style={styles.fixedBodySection}>
          <Text style={styles.fixedBodyTitle} accessibilityRole="header">
            {title}
          </Text>
          {description ? <Text style={styles.descriptionBelowTitle}>{description}</Text> : null}
        </View>
      ) : null}
      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          fixedBody || scrollOnlyHeader ? styles.scrollContentWithFixedBody : null,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        bottomOffset={16}
        extraKeyboardSpace={keyboardOverlapSpace}
      >
        {description && !(fixedBody || scrollOnlyHeader) ? (
          <View style={styles.descriptionWrap}>
            <Text style={styles.descriptionText}>{description}</Text>
          </View>
        ) : null}
        {children}
      </KeyboardAwareScrollView>

      <KeyboardStickyView
        offset={{ closed: 0, opened: KEYBOARD_STICKY_OFFSET_OPENED }}
        style={styles.stickyOuter}
      >
        <View
          style={[
            styles.stickyInner,
            { paddingTop: stickyInnerPaddingTop, paddingBottom: stickyBottomPad },
          ]}
        >
          {stickyFooter}
        </View>
      </KeyboardStickyView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  grabberHost: {
    alignItems: 'center',
    paddingBottom: 0,
  },
  grabberPill: {
    alignSelf: 'center',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: AUTH_MODAL_HORIZONTAL_GUTTER,
    paddingBottom: 20,
    paddingHorizontal: AUTH_MODAL_HORIZONTAL_GUTTER,
  },
  /** Top padding lives on `fixedBodySection` when present (sign-in fixed field or sign-up header). */
  scrollContentWithFixedBody: {
    paddingTop: 0,
  },
  fixedBodySection: {
    paddingTop: AUTH_MODAL_HORIZONTAL_GUTTER,
    paddingHorizontal: AUTH_MODAL_HORIZONTAL_GUTTER,
  },
  fixedBodyTitle: {
    ...SHEET_STYLES.headerTitle,
    flex: 0,
    alignSelf: 'stretch',
    marginLeft: AUTH_INPUT_CONTENT_PADDING_START,
    marginBottom: 12,
    fontSize: Typography.sizes.h2,
    lineHeight: Typography.lineHeights.h2,
  },
  descriptionBelowTitle: {
    ...SHEET_STYLES.descriptionText,
    marginLeft: AUTH_INPUT_CONTENT_PADDING_START,
    marginTop: 0,
    marginBottom: 12,
    alignSelf: 'stretch',
  },
  fixedBody: {
    alignSelf: 'stretch',
  },
  descriptionWrap: {
    marginTop: 0,
    marginBottom: 20,
    paddingHorizontal: 0,
  },
  descriptionText: SHEET_STYLES.descriptionText,
  stickyOuter: {
    backgroundColor: Colors.black,
  },
  stickyInner: {
    paddingHorizontal: AUTH_MODAL_HORIZONTAL_GUTTER,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.neutral[800],
    backgroundColor: Colors.black,
  },
});

export default AuthModalLayout;
