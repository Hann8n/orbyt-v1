import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { Svg, Path } from 'react-native-svg';

interface AnimatedTVProps {
  size?: number;
}

export const AnimatedTV: React.FC<AnimatedTVProps> = ({ size = 120 }) => {
  // Shared animated values for coordinated movement
  const eyeX = useRef(new Animated.Value(0)).current;
  const eyeY = useRef(new Animated.Value(0)).current;
  const blinkAnimation = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Create interpolated values for independent variations
    const leftEyeXInterpolated = eyeX.interpolate({
      inputRange: [-4, 4],
      outputRange: [-4, 4],
      extrapolate: 'clamp',
    });

    const leftEyeYInterpolated = eyeY.interpolate({
      inputRange: [-3, 3],
      outputRange: [-3, 3],
      extrapolate: 'clamp',
    });

    // Right eye gets slight independent variation through interpolation
    const rightEyeXInterpolated = eyeX.interpolate({
      inputRange: [-4, 4],
      outputRange: [-3.8, 4.2], // Slight offset for natural variation
      extrapolate: 'clamp',
    });

    const rightEyeYInterpolated = eyeY.interpolate({
      inputRange: [-3, 3],
      outputRange: [-2.8, 3.2], // Slight offset for natural variation
      extrapolate: 'clamp',
    });

    const createEyeMovement = () => {
      // Generate random target positions
      const targetX = Math.random() * 8 - 4; // -4 to 4
      const targetY = Math.random() * 6 - 3; // -3 to 3
      const duration = 800 + Math.random() * 400; // 800-1200ms
      
      return Animated.parallel([
        Animated.timing(eyeX, {
          toValue: targetX,
          duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(eyeY, {
          toValue: targetY,
          duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]);
    };

    const blink = () => {
      return Animated.sequence([
        Animated.timing(blinkAnimation, {
          toValue: 0,
          duration: 100,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(blinkAnimation, {
          toValue: 1,
          duration: 100,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]);
    };

    const animateEyes = () => {
      const movement = createEyeMovement();
      
      Animated.sequence([
        movement,
        Animated.delay(1000 + Math.random() * 3000), // Linger for 1-4 seconds after looking
        Animated.delay(2000 + Math.random() * 4000), // Wait 2-6 seconds before next movement
        // More frequent blinking - blink 30% of the time
        ...(Math.random() < 0.30 ? [blink(), Animated.delay(400 + Math.random() * 600)] : [Animated.delay(800)]),
      ]).start(() => {
        animateEyes();
      });
    };

    // Start the animation
    animateEyes();
  }, [eyeX, eyeY, blinkAnimation]);

  const eyeSize = size * 0.08; // Eyes are 8% of TV size
  const eyeSpacing = size * 0.18; // Distance between eyes

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {/* SVG TV */}
      <Svg
        width={size}
        height={size}
        viewBox="21.57 26.65 1436.49 1549.1"
        style={{ position: 'absolute' }}
      >
        <Path
          fill="white"
          d="M 1013.72 119.675 C 1004.99 103.802 1001.31 88.2788 1006.41 70.4476 C 1010.69 55.4853 1020.52 42.0954 1034.22 34.5405 C 1049.38 26.18 1068.34 24.4967 1084.89 29.3289 C 1100.8 33.9734 1112.85 43.7222 1120.78 58.2707 C 1128.83 72.9747 1130.58 90.3154 1125.62 106.331 C 1120.86 122.166 1111.46 133.89 1096.75 141.618 C 1080.56 150.128 1062.56 149.515 1045.25 144.985 C 1028.09 163.099 1013.44 183.434 996.989 202.126 L 945.636 261.462 C 929.67 279.68 912.385 298.079 898.472 317.915 C 932.279 331.272 967.185 360.257 981.746 393.821 C 984.996 401.312 987.816 408.886 988.984 416.995 C 989.095 417.766 989.234 418.533 989.353 419.303 C 1014.66 419.614 1039.97 419.63 1065.28 419.352 C 1078.9 419.119 1092.74 417.793 1106.34 418.15 C 1118.58 418.472 1130.88 420.622 1143.14 421.359 C 1230.34 426.602 1320.9 439.474 1385.18 504.683 C 1415.16 535.091 1437.73 578.084 1447.79 619.424 C 1457.57 659.606 1457.06 703.799 1457.44 744.977 L 1457.68 854.398 C 1457.63 928.534 1458.61 1002.77 1457.62 1076.89 C 1456.92 1129.34 1455.71 1187.53 1432.1 1235.64 C 1424.92 1250.36 1417.23 1264.09 1408.22 1277.74 C 1390.97 1299.32 1373.49 1319.05 1350.26 1334.38 C 1346.72 1336.72 1342.83 1339.76 1338.89 1341.33 C 1330.61 1346.15 1322.34 1350.88 1313.83 1355.3 C 1309.77 1357.04 1305.08 1358.57 1301.26 1360.73 C 1292.71 1363.55 1284.2 1366.52 1275.75 1369.65 C 1253.95 1377.37 1218.52 1383.36 1195.51 1384.47 C 1201.52 1400.19 1208.27 1415.55 1214.46 1431.18 C 1223.81 1455.53 1233.29 1480.61 1244.17 1504.3 C 1246.5 1514.67 1249.11 1524.65 1247.36 1535.35 C 1245.37 1547.52 1237.64 1558.55 1227.69 1565.66 C 1216.16 1573.89 1200.98 1576.97 1187.11 1574.46 C 1176.55 1572.55 1168.41 1567.56 1160.59 1560.36 C 1145 1545.99 1133.02 1526.49 1120.43 1509.45 C 1093.67 1473.22 1067.66 1436.73 1041.79 1399.87 L 1033.21 1388.44 L 995.43 1389.08 C 980.83 1389.21 966.268 1390.35 951.678 1390.5 C 935.881 1390.66 919.702 1389.85 903.947 1391.07 C 887.563 1390.84 871.148 1391.79 854.759 1391.95 L 745.1 1392.42 C 644.851 1392.79 544.604 1391.34 444.407 1388.09 C 438.003 1397.19 423.071 1415.61 419.55 1425.01 C 410.453 1436.25 402.976 1448.72 394.494 1460.41 C 379.308 1481.35 363.618 1501.95 348.132 1522.66 C 337.761 1536.54 327.396 1552.43 314.104 1563.69 C 306.497 1570.13 298.543 1574.39 288.528 1575.47 C 274.591 1576.93 260.653 1572.72 249.851 1563.8 C 240.279 1556.05 232.028 1544.36 230.686 1531.86 C 229.308 1519.04 235.266 1506.9 239.375 1495.1 C 246.784 1482.34 255.189 1457.5 262.136 1442.42 C 265.218 1433.88 269.254 1425.65 272.73 1417.26 C 277.411 1405.95 281.651 1394.33 287.061 1383.35 C 276.824 1382.94 266.196 1380.77 256.099 1379.07 C 203.75 1370.3 147.737 1351.85 107.448 1315.93 C 51.7383 1266.27 27.9095 1202.25 23.8339 1128.91 C 23.8146 1102.46 22.8425 1075.97 22.6516 1049.51 C 21.8773 942.161 20.9948 834.609 22.0815 727.269 C 22.2528 710.357 23.6795 693.497 23.9466 676.587 C 26.6776 643.662 32.1745 611.004 44.6344 580.248 C 49.3417 574.173 52.8053 563.021 56.2781 555.832 C 71.4389 529.504 89.9465 507.728 112.579 487.513 C 122.057 479.047 132.605 472.689 143.563 466.364 C 220.692 421.841 317.042 420.668 403.64 419.819 C 432.269 419.539 461.399 418.234 489.968 419.894 C 491.463 412.975 493.475 405.984 496.012 399.37 C 510.452 361.713 545.09 333.323 581.224 317.443 C 546.692 275.649 510.499 235.159 475.655 193.605 C 462.089 177.427 447.639 161.552 435.182 144.493 C 421.251 149.096 407.619 150.562 393.436 146.098 C 377.735 141.157 365.673 129.813 358.325 115.221 C 350.654 99.9841 350.947 82.1508 356.277 66.2114 C 363.331 52.1607 372.176 42.5755 385.002 33.6856 C 401.779 26.0319 420.827 24.5399 438.342 30.9686 C 453.364 36.4825 464.812 48.5837 471.317 63.0214 C 477.076 75.802 478.61 92.5084 473.512 105.743 C 471.422 111.171 469.027 116.506 466.724 121.846 L 617.337 299.772 C 693.244 273.734 785.725 273.162 861.932 298.589 C 876.168 279.739 893.63 263.483 907.629 244.494 C 914.355 240.027 957.771 186.56 966.004 176.217 C 979.987 162.939 1002.55 135.446 1013.72 119.675 z M 194.691 1043.03 C 199.985 1070.34 205.723 1102.86 219.945 1127.12 C 224.242 1134.8 227.389 1143.09 231.668 1150.83 C 245.559 1175.94 265.72 1198.97 289.011 1215.79 C 328.122 1244.02 379.298 1257.45 426.123 1265.66 C 460.816 1271.74 495.995 1274.39 531.091 1276.64 C 608.339 1281.58 685.942 1281.28 763.326 1281.03 C 837.814 1280.79 912.393 1281.01 986.64 1274.32 C 1005.78 1272.59 1025.08 1271.16 1044.05 1268.05 C 1118.88 1255.8 1192.56 1233.88 1238.74 1169.34 C 1253.26 1149.05 1265.07 1124.83 1272.59 1101.04 C 1299.88 1014.59 1300.97 857.057 1285.97 768.12 C 1274.71 701.329 1250.46 628.87 1192.76 587.925 C 1164.59 568.264 1132.89 554.242 1099.4 546.633 C 1090.85 544.732 1082.05 544.001 1073.43 542.463 C 1062.52 540.514 1051.76 537.858 1040.76 536.369 C 1020.96 533.691 1001.4 532.781 981.519 531.592 C 951.829 529.818 922.398 528.42 892.648 527.597 C 827.841 525.308 762.987 524.641 698.146 525.597 C 636.666 526.066 575.538 527.002 514.136 530.549 C 479.019 532.578 444.693 534.666 409.934 540.595 C 346.291 551.451 283.953 575.56 245.511 629.989 C 228.082 654.593 214.825 681.899 206.271 710.812 C 182.024 792.071 181.923 909.675 189.374 994.421 C 190.809 1010.74 191.902 1026.86 194.691 1043.03 z"
        />
      </Svg>
      
      {/* Animated Eyes Overlay */}
      <View
        style={{
          position: 'absolute',
          width: size * 0.5,
          height: size * 0.35,
          top: size * 0.40,
          left: size * 0.25,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Left Eye */}
        <Animated.View
          style={{
            position: 'absolute',
            width: eyeSize,
            height: eyeSize * 1.8, // Vertical oval
            backgroundColor: '#ffffff',
            borderRadius: eyeSize / 2,
            left: size * 0.25 - eyeSpacing / 2 - eyeSize / 2,
            transform: [
              { translateX: eyeX },
              { translateY: eyeY },
              { translateY: (eyeSize * 1.8) / 2 }, // Move to center before scaling
              { scaleY: blinkAnimation },
              { translateY: -(eyeSize * 1.8) / 2 }, // Move back after scaling
            ],
          }}
        />
        
        {/* Right Eye */}
        <Animated.View
          style={{
            position: 'absolute',
            width: eyeSize,
            height: eyeSize * 1.8, // Vertical oval
            backgroundColor: '#ffffff',
            borderRadius: eyeSize / 2,
            left: size * 0.25 + eyeSpacing / 2 - eyeSize / 2,
            transform: [
              { translateX: eyeX.interpolate({
                inputRange: [-4, 4],
                outputRange: [-3.8, 4.2], // Slight offset for natural variation
                extrapolate: 'clamp',
              }) },
              { translateY: eyeY.interpolate({
                inputRange: [-3, 3],
                outputRange: [-2.8, 3.2], // Slight offset for natural variation
                extrapolate: 'clamp',
              }) },
              { translateY: (eyeSize * 1.8) / 2 }, // Move to center before scaling
              { scaleY: blinkAnimation },
              { translateY: -(eyeSize * 1.8) / 2 }, // Move back after scaling
            ],
          }}
        />
      </View>
    </View>
  );
};





