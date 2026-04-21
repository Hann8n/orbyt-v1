type ComputeShouldPlayVideoArgs = {
  cannotShowMedia: boolean;
  isBlurred: boolean;
  shouldDisablePlayback: boolean;
  hasError: boolean;
  userPaused: boolean;
  isVisible: boolean;
  videoUrl: string | null;
};

export const computeShouldPlayVideo = ({
  cannotShowMedia,
  isBlurred,
  shouldDisablePlayback,
  hasError,
  userPaused,
  isVisible,
  videoUrl,
}: ComputeShouldPlayVideoArgs): boolean =>
  !cannotShowMedia &&
  !isBlurred &&
  !shouldDisablePlayback &&
  !hasError &&
  !userPaused &&
  isVisible &&
  Boolean(videoUrl);
