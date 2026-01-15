const fs = require('fs');
const path = require('path');
const {
  withPlugins,
  withDangerousMod,
  withAppBuildGradle,
  withProjectBuildGradle,
} = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const withFfmpegKitIos = (config, { iosUrl }) => {
  return withDangerousMod(config, [
    'ios',
    async cfg => {
      const { platformProjectRoot } = cfg.modRequest;
      const podspecPath = path.join(platformProjectRoot, 'ffmpeg-kit-ios-full-gpl.podspec');
      const podspec = `
Pod::Spec.new do |s|
    s.name             = 'ffmpeg-kit-ios-full-gpl'
    s.version          = '6.0' # Must match what ffmpeg-kit-react-native expects for this subspec
    s.summary          = 'Custom full-gpl FFmpegKit iOS frameworks from self-hosted source.'
    s.homepage         = 'https://github.com/arthenica/ffmpeg-kit'
    s.license          = { :type => 'LGPL' }
    s.author           = { 'Your Name' => 'your.email@example.com' }
    s.platform         = :ios, '12.1'
    s.static_framework = true
    # Use the HTTP source to fetch the zipped package directly.
    s.source           = { :http => '${iosUrl}' }
    # Adjust these paths if your zip structure is different.
    # These paths are relative to the root of the extracted zip.
    s.vendored_frameworks = [
      'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/libswscale.xcframework',
      'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/libswresample.xcframework',
      'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/libavutil.xcframework',
      'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/libavformat.xcframework',
      'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/libavfilter.xcframework',
      'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/libavdevice.xcframework',
      'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/libavcodec.xcframework',
      'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/ffmpegkit.xcframework'
    ]
end
`;

      fs.writeFileSync(podspecPath, podspec);

      const podfilePath = path.join(platformProjectRoot, 'Podfile');
      let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

      const newPodEntry = `pod 'ffmpeg-kit-ios-full-gpl', :podspec => './ffmpeg-kit-ios-full-gpl.podspec'`;

      if (!podfileContent.includes(newPodEntry)) {
        const anchor = `use_expo_modules!`;
        if (podfileContent.includes(anchor)) {
          podfileContent = mergeContents({
            tag: 'ffmpeg-kit-custom-pod',
            src: podfileContent,
            newSrc: newPodEntry,
            anchor: new RegExp(`^\\s*${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
            offset: 1,
            comment: '#',
          }).contents;
        } else {
          const appName = config.name;
          const targetAnchor = `target '${appName}' do`;
          if (appName && podfileContent.includes(targetAnchor)) {
            podfileContent = mergeContents({
              tag: 'ffmpeg-kit-custom-pod-fallback',
              src: podfileContent,
              newSrc: `  ${newPodEntry}`,
              anchor: new RegExp(`^\\s*${targetAnchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
              offset: 1,
              comment: '#',
            }).contents;
            console.log(
              `[ffmpeg-kit-plugin] Used fallback anchor "target '${appName}' do" for Podfile modification.`
            );
          } else {
            console.warn(
              `[ffmpeg-kit-plugin] Could not find "use_expo_modules!" or "target '${appName}' do" in Podfile. Custom pod for ffmpeg-kit may not be added correctly.`
            );
          }
        }
        fs.writeFileSync(podfilePath, podfileContent);
      }
      return cfg;
    },
  ]);
};

const copyAndroidAar = (platformProjectRoot, projectRoot, androidLocalPath) => {
  const source = path.resolve(projectRoot, androidLocalPath || 'patches/ffmpeg-kit-full-gpl.aar');
  const destDir = path.join(platformProjectRoot, 'libs');
  const dest = path.join(destDir, 'ffmpeg-kit-full-gpl.aar');

  if (!fs.existsSync(source)) {
    throw new Error(
      `[ffmpeg-kit-plugin] Missing AAR at ${source}. Please place ffmpeg-kit-full-gpl.aar in the patches folder or configure androidLocalPath.`
    );
  }

  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(source, dest);
  console.log(`[ffmpeg-kit-plugin] Copied ffmpeg-kit-full-gpl.aar to ${dest}`);
};

const removeDownloadBlock = contents => {
  const downloadRegex = /\/\/ Download AAR[\s\S]*?preBuild\.dependsOn\("downloadAar"\)\s*\}\s*/;
  return contents.replace(downloadRegex, '\n');
};

const withFfmpegKitAndroid = (config, { androidLocalPath }) => {
  // Copy the local AAR file - the build.gradle modifications are handled by patch-package
  config = withDangerousMod(config, [
    'android',
    async cfg => {
      const { platformProjectRoot, projectRoot } = cfg.modRequest;
      copyAndroidAar(platformProjectRoot, projectRoot, androidLocalPath);
      return cfg;
    },
  ]);

  config = withAppBuildGradle(config, cfg => {
    let buildGradle = cfg.modResults.contents;

    // Use direct file dependency instead of flatDir
    // AAR is in android/libs/, app module is in android/app/, so use ../libs/
    const newDependencies = `
    implementation files('../libs/ffmpeg-kit-full-gpl.aar')
    implementation 'com.arthenica:smart-exception-java:0.2.1'`;

    // Remove old flatDir-based dependency if it exists
    buildGradle = buildGradle.replace(
      /implementation\s*\(name:\s*['"]ffmpeg-kit-full-gpl['"],\s*ext:\s*['"]aar['"]\)/g,
      ''
    );

    if (!buildGradle.includes("files('libs/ffmpeg-kit-full-gpl.aar')")) {
      buildGradle = mergeContents({
        tag: 'ffmpeg-kit-dependencies',
        src: buildGradle,
        newSrc: newDependencies,
        anchor: /dependencies\s*\{/,
        offset: 1,
        comment: '//',
      }).contents;
    }

    buildGradle = removeDownloadBlock(buildGradle);

    cfg.modResults.contents = buildGradle;
    return cfg;
  });

  config = withProjectBuildGradle(config, cfg => {
    let buildGradle = cfg.modResults.contents;

    // Remove ffmpegKitPackage variable if it exists
    buildGradle = buildGradle.replace(/^\s*ffmpegKitPackage\s*=\s*"full-gpl"\s*(\r?\n)?/m, '');

    cfg.modResults.contents = buildGradle;
    return cfg;
  });

  return config;
};

module.exports = (config, options = {}) => {
  const { iosUrl, androidLocalPath } = options;

  if (!iosUrl) {
    throw new Error(
      'FFmpeg Kit plugin requires "iosUrl" option. Please provide the iOS download URL in your app.config.ts'
    );
  }

  return withPlugins(config, [
    config => withFfmpegKitIos(config, { iosUrl }),
    config => withFfmpegKitAndroid(config, { androidLocalPath }),
  ]);
};
