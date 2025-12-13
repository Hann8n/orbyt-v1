const fs = require('fs');
const path = require('path');
const {
  withPlugins,
  withDangerousMod,
  withAppBuildGradle,
  withProjectBuildGradle,
} = require('@expo/config-plugins');
const {
  mergeContents,
} = require('@expo/config-plugins/build/utils/generateCode');

const withFfmpegKitIos = (config, { iosUrl }) => {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const { platformProjectRoot } = cfg.modRequest;
      const podspecPath = path.join(
        platformProjectRoot,
        'ffmpeg-kit-ios-full-gpl.podspec',
      );
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
            anchor: new RegExp(
              `^\\s*${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
            ),
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
              anchor: new RegExp(
                `^\\s*${targetAnchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
              ),
              offset: 1,
              comment: '#',
            }).contents;
            console.log(
              `[ffmpeg-kit-plugin] Used fallback anchor "target '${appName}' do" for Podfile modification.`,
            );
          } else {
            console.warn(
              `[ffmpeg-kit-plugin] Could not find "use_expo_modules!" or "target '${appName}' do" in Podfile. Custom pod for ffmpeg-kit may not be added correctly.`,
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
  const source = path.resolve(
    projectRoot,
    androidLocalPath || 'patches/ffmpeg-kit-full-gpl.aar',
  );
  const destDir = path.join(platformProjectRoot, 'libs');
  const dest = path.join(destDir, 'ffmpeg-kit-full-gpl.aar');

  if (!fs.existsSync(source)) {
    throw new Error(
      `[ffmpeg-kit-plugin] Missing AAR at ${source}. Please place ffmpeg-kit-full-gpl.aar in the patches folder or configure androidLocalPath.`,
    );
  }

  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(source, dest);
  console.log(`[ffmpeg-kit-plugin] Copied ffmpeg-kit-full-gpl.aar to ${dest}`);
};

const removeDownloadBlock = (contents) => {
  const downloadRegex =
    /\/\/ Download AAR[\s\S]*?preBuild\.dependsOn\("downloadAar"\)\s*\}\s*/;
  return contents.replace(downloadRegex, '\n');
};

const withFfmpegKitAndroid = (config, { androidLocalPath }) => {
  // First, copy the local AAR and patch the ffmpeg-kit-react-native build.gradle
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const { platformProjectRoot, projectRoot } = cfg.modRequest;
      copyAndroidAar(platformProjectRoot, projectRoot, androidLocalPath);

      const ffmpegKitBuildGradlePath = path.join(
        platformProjectRoot,
        '..',
        'node_modules',
        'ffmpeg-kit-react-native',
        'android',
        'build.gradle'
      );

      if (fs.existsSync(ffmpegKitBuildGradlePath)) {
        let buildGradle = fs.readFileSync(ffmpegKitBuildGradlePath, 'utf-8');
        
        // Add flatDir repository if not present
        const flatDirRepo = `flatDir {\n    dirs "$rootDir/libs"\n  }`;
        const repositoriesRegex = /repositories\s*\{[\s\S]*?mavenCentral\(\)[\s\S]*?google\(\)/;
        if (!buildGradle.includes('flatDir') && buildGradle.match(repositoriesRegex)) {
          buildGradle = buildGradle.replace(
            /(google\(\))/,
            `$1\n  ${flatDirRepo}`
          );
        }
        
        // Replace the Maven dependency with local AAR
        const originalDependency = /implementation 'com\.arthenica:ffmpeg-kit-'.*/;
        const replacement = `implementation(name: 'ffmpeg-kit-full-gpl', ext: 'aar')`;
        
        if (buildGradle.match(originalDependency)) {
          buildGradle = buildGradle.replace(originalDependency, replacement);
          
          // Also add the smart-exception dependency if not present
          if (!buildGradle.includes('smart-exception-java')) {
            buildGradle = buildGradle.replace(
              replacement,
              `${replacement}\n  implementation 'com.arthenica:smart-exception-java:0.2.1'`
            );
          }
          
          fs.writeFileSync(ffmpegKitBuildGradlePath, buildGradle);
          console.log('[ffmpeg-kit-plugin] Patched ffmpeg-kit-react-native build.gradle');
        }
      }
      
      return cfg;
    },
  ]);

  config = withAppBuildGradle(config, (cfg) => {
    let buildGradle = cfg.modResults.contents;

    const appFlatDirLibsPath = '\\${projectDir}/../libs';
    const appFlatDirRepo = `
    repositories {
        flatDir {
            dirs "${appFlatDirLibsPath}"
        }
    }`;

    if (
      !buildGradle.match(
        new RegExp(
          `repositories\\s*\\{[\\s\\S]*?flatDir\\s*\\{[\\s\\S]*?dirs\\s*['"]${appFlatDirLibsPath.replace(
            /[$.]/g,
            '\\\\$&',
          )}['"]`,
        ),
      )
    ) {
      buildGradle = mergeContents({
        tag: 'ffmpeg-kit-app-flatdir-repo',
        src: buildGradle,
        newSrc: appFlatDirRepo,
        anchor: /android\s*\{/,
        offset: 1,
        comment: '//',
      }).contents;
    }

    const newDependencies = `
    implementation(name: 'ffmpeg-kit-full-gpl', ext: 'aar')
    implementation 'com.arthenica:smart-exception-java:0.2.1'`;
    if (!buildGradle.includes("name: 'ffmpeg-kit-full-gpl', ext: 'aar'")) {
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

  config = withProjectBuildGradle(config, (cfg) => {
    let buildGradle = cfg.modResults.contents;

    buildGradle = buildGradle.replace(
      /^\s*ffmpegKitPackage\s*=\s*"full-gpl"\s*(\r?\n)?/m,
      '',
    );

    const projectFlatDirLibsPath = '$rootDir/libs';
    const flatDirString = `        flatDir {\n            dirs "${projectFlatDirLibsPath}"\n        }`;
    const allProjectsRepositoriesRegex =
      /(allprojects\s*\{\s*repositories\s*\{)/;
    const existingFlatDirRegex = new RegExp(
      `allprojects\\s*\\{[\\s\\S]*?repositories\\s*\\{[\\s\\S]*?flatDir\\s*\\{[\\s\\S]*?dirs\\s*['"]${projectFlatDirLibsPath.replace(
        /[$.]/g,
        '\\$&',
      )}['"]`,
    );

    if (!buildGradle.match(existingFlatDirRegex)) {
      const match = buildGradle.match(allProjectsRepositoriesRegex);
      if (match) {
        const insertionPoint = match.index + match[0].length;
        buildGradle =
          buildGradle.substring(0, insertionPoint) +
          '\n' +
          flatDirString +
          buildGradle.substring(insertionPoint);
      }
    }

    cfg.modResults.contents = buildGradle;
    return cfg;
  });

  return config;
};

module.exports = (config, options = {}) => {
  const { iosUrl, androidLocalPath } = options;

  if (!iosUrl) {
    throw new Error(
      'FFmpeg Kit plugin requires "iosUrl" option. Please provide the iOS download URL in your app.config.ts',
    );
  }

  return withPlugins(config, [
    (config) => withFfmpegKitIos(config, { iosUrl }),
    (config) => withFfmpegKitAndroid(config, { androidLocalPath }),
  ]);
};







