import { StyleSheet } from 'react-native';

export const videoTrimmerStyles = StyleSheet.create({
  container: { flex: 1 },
  slider: {
    position: 'absolute',
    bottom: 20,
    width: '100%',
    alignItems: 'center',
  },
  video: { flex: 1 },
});

export const sliderStyles = StyleSheet.create({
  container: {
    width: '95%',
    alignSelf: 'center',
  },
  sliderWrapper: {
    position: 'relative',
    height: 70,
    justifyContent: 'center',
  },
  framesBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 70,
    borderRadius: 7.5,
    overflow: 'hidden',
  },
  sliderContainer: {
    position: 'relative',
    zIndex: 1,
  },
  trackStyle: {
    borderRadius: 2,
    height: 70,
    shadowColor: 'black',
    shadowOffset: {
      width: 0,
      height: 1,
    },
  },
  thumbStyle: {
    height: 70,
    paddingHorizontal: 5,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 5,
  },
  text: {
    alignSelf: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
    marginBottom: 5,
  },
});

export const progressBarStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', overflow: 'hidden' },
  progress: {
    flex: 1,
    opacity: 0.3,
  },
  framesContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  frame: {
    position: 'absolute',
    height: '100%',
  },
  darkOverlay: {
    position: 'absolute',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
});
