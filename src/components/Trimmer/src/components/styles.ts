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
    width: '80%',
    alignSelf: 'center',
  },
  sliderWrapper: {
    position: 'relative',
    height: 40,
  },
  framesBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 2,
    overflow: 'hidden',
  },
  trackStyle: {
    borderRadius: 2,
    height: 40,
    shadowColor: 'black',
    shadowOffset: {
      width: 0,
      height: 1,
    },
  },
  thumbStyle: {
    paddingVertical: 5,
    paddingHorizontal: 5,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 5,
  },
  thumbTextStyle: {
    fontSize: 30,
    color: 'gray',
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
