import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { Colors } from './UI';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: Animated.Value;
  scale: Animated.Value;
  rotation: Animated.Value;
  brightness: 'dim' | 'normal' | 'bright' | 'special';
  duration: number;
  delay: number;
}

interface AnimatedStarsBackgroundProps {
  children: React.ReactNode;
}

export default function AnimatedStarsBackground({ children }: AnimatedStarsBackgroundProps) {
  const starsRef = useRef<Star[]>([]);
  const animationRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mathematical random number generator (Linear Congruential Generator)
  const random = (seed: number): number => {
    return (seed * 9301 + 49297) % 233280;
  };

  // Generate position using mathematical distribution
  const generatePosition = (index: number, seed: number) => {
    const xSeed = random(seed + index * 3);
    const ySeed = random(seed + index * 7);
    
    // Apply golden ratio distribution for more natural spacing
    const goldenRatio = 1.618033988749895;
    const x = (xSeed / 233280) * screenWidth;
    const y = (ySeed / 233280) * screenHeight;
    
    // Apply spiral distribution for more realistic star field
    const angle = (index * goldenRatio) % (2 * Math.PI);
    const radius = Math.sqrt(index) * 50;
    const spiralX = x + Math.cos(angle) * radius;
    const spiralY = y + Math.sin(angle) * radius;
    
    return {
      x: (spiralX + screenWidth) % screenWidth,
      y: (spiralY + screenHeight) % screenHeight
    };
  };

  // Generate animation parameters using mathematical formulas
  const generateAnimationParams = (index: number, seed: number) => {
    const durationSeed = random(seed + index * 11);
    const delaySeed = random(seed + index * 13);
    const brightnessSeed = random(seed + index * 17);
    
    // Create varied animation durations (3-10 seconds)
    const duration = 3 + (durationSeed / 233280) * 7;
    
    // Create varied delays (0-5 seconds)
    const delay = (delaySeed / 233280) * 5;
    
    // Determine star brightness using mathematical distribution
    const brightness = brightnessSeed / 233280;
    
    let brightnessLevel: 'dim' | 'normal' | 'bright' | 'special';
    if (brightness > 0.85) {
      brightnessLevel = 'special';
    } else if (brightness > 0.7) {
      brightnessLevel = 'bright';
    } else if (brightness < 0.3) {
      brightnessLevel = 'dim';
    } else {
      brightnessLevel = 'normal';
    }
    
    return { duration, delay, brightnessLevel };
  };

  // Generate stars with mathematical distribution
  const generateStars = (): Star[] => {
    const stars: Star[] = [];
    const numStars = 200; // Increased for more impressive effect
    const seed = Date.now();

    for (let i = 0; i < numStars; i++) {
      const position = generatePosition(i, seed);
      const animationParams = generateAnimationParams(i, seed);
      
      // Size variation based on brightness
      const sizeSeed = random(seed + i * 19);
      const sizeVariation = 0.5 + (sizeSeed / 233280) * 0.85; // 0.5x to 1.35x size
      const baseSize = 2; // Base size in pixels
      const size = baseSize * sizeVariation;
      
      // Rotation for more natural appearance
      const rotationSeed = random(seed + i * 23);
      const rotation = Math.floor((rotationSeed / 233280) * 360);
      
      stars.push({
        id: i,
        x: position.x,
        y: position.y,
        size,
        opacity: new Animated.Value(0),
        scale: new Animated.Value(0.8),
        rotation: new Animated.Value(rotation),
        brightness: animationParams.brightnessLevel,
        duration: animationParams.duration * 1000, // Convert to milliseconds
        delay: animationParams.delay * 1000,
      });
    }

    return stars;
  };

  // Animate individual star with unified animation
  const animateStar = (star: Star) => {
    const twinkleAnimation = Animated.sequence([
      // Fade in and scale up
      Animated.parallel([
        Animated.timing(star.opacity, {
          toValue: 1,
          duration: star.duration * 0.3,
          useNativeDriver: true,
        }),
        Animated.timing(star.scale, {
          toValue: 1.2,
          duration: star.duration * 0.3,
          useNativeDriver: true,
        }),
      ]),
      // Hold at peak
      Animated.timing(star.opacity, {
        toValue: 1,
        duration: star.duration * 0.2,
        useNativeDriver: true,
      }),
      // Fade out and scale down
      Animated.parallel([
        Animated.timing(star.opacity, {
          toValue: 0.3,
          duration: star.duration * 0.5,
          useNativeDriver: true,
        }),
        Animated.timing(star.scale, {
          toValue: 0.8,
          duration: star.duration * 0.5,
          useNativeDriver: true,
        }),
      ]),
    ]);

    // Start animation after delay
    setTimeout(() => {
      Animated.loop(twinkleAnimation).start();
    }, star.delay);
  };

  useEffect(() => {
    // Initialize stars
    starsRef.current = generateStars();

    // Start animations
    starsRef.current.forEach(star => {
      animateStar(star);
    });

    // Cleanup
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, []);

  // Get star style based on brightness level
  const getStarStyle = (star: Star) => {
    const baseStyle = {
      left: star.x,
      top: star.y,
      width: star.size,
      height: star.size,
      opacity: star.opacity,
      transform: [
        { scale: star.scale },
        { rotate: `${star.rotation}deg` }
      ] as const,
    };

    switch (star.brightness) {
      case 'special':
        return [
          styles.star,
          styles.specialStar,
          baseStyle,
        ];
      case 'bright':
        return [
          styles.star,
          styles.brightStar,
          baseStyle,
        ];
      case 'normal':
        return [
          styles.star,
          styles.normalStar,
          baseStyle,
        ];
      case 'dim':
        return [
          styles.star,
          styles.dimStar,
          baseStyle,
        ];
      default:
        return [
          styles.star,
          styles.normalStar,
          baseStyle,
        ];
    }
  };

  return (
    <View style={styles.container}>
      {/* Animated stars overlay */}
      {starsRef.current.map(star => (
        <Animated.View
          key={star.id}
          style={getStarStyle(star)}
        />
      ))}
      
      {/* Content */}
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
    position: 'relative',
  },
  star: {
    position: 'absolute',
    backgroundColor: Colors.white,
    borderRadius: 50,
  },
  // Cross-shaped flare effects for different brightness levels
  specialStar: {
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1.0,
    shadowRadius: 12,
    elevation: 16,
  },
  brightStar: {
    shadowColor: Colors.white,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 10,
  },
  normalStar: {
    shadowColor: Colors.white,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 4,
    elevation: 6,
  },
  dimStar: {
    shadowColor: Colors.white,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 3,
  },
  content: {
    flex: 1,
    zIndex: 1,
  },
});
