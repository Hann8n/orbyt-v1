import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';
import { Directory, File, Paths } from 'expo-file-system';

const ORBYT_MERGE_DIR = new Directory(Paths.cache, 'orbyt-fast-merge');

const normalizePathForFfmpeg = path =>
  path.startsWith('file://') ? path.replace('file://', '') : path;

const escapeForConcatFile = path => path.replace(/'/g, "'\\''");

const toInputPath = item => {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    if (typeof item.path === 'string') return item.path;
    if (typeof item.uri === 'string') return item.uri;
  }
  return '';
};

const ensureMergeDir = () => {
  ORBYT_MERGE_DIR.create({ intermediates: true, idempotent: true });
};

const buildPaths = () => {
  const stamp = `${Date.now()}`;
  const listFile = new File(ORBYT_MERGE_DIR, `videos-${stamp}.txt`);
  const outputFile = new File(ORBYT_MERGE_DIR, `output-${stamp}.mp4`);
  return { listFile, outputFile };
};

export const processAndMergeVideos = async recordedVideos => {
  const normalizedInputs = recordedVideos.map(toInputPath).filter(Boolean);
  if (normalizedInputs.length < 2) {
    return null;
  }

  ensureMergeDir();
  const { listFile, outputFile } = buildPaths();

  const concatFileBody = normalizedInputs
    .map(path => `file '${escapeForConcatFile(normalizePathForFfmpeg(path))}'`)
    .join('\n');

  listFile.create({ intermediates: true, overwrite: true });
  listFile.write(concatFileBody);

  const listFilePath = normalizePathForFfmpeg(listFile.uri);
  const outputPath = normalizePathForFfmpeg(outputFile.uri);
  const command =
    `-y -f concat -safe 0 -i "${listFilePath}" ` +
    '-map 0:v:0 -map 0:a:0? -dn -sn ' +
    '-fflags +genpts -avoid_negative_ts make_zero ' +
    '-c:v libx264 -preset veryfast -crf 21 -pix_fmt yuv420p -r 30 ' +
    '-c:a aac -b:a 128k -ar 48000 -ac 2 ' +
    '-movflags +faststart ' +
    `"${outputPath}"`;

  const session = await FFmpegKit.execute(command);
  const returnCode = await session.getReturnCode();

  if (!ReturnCode.isSuccess(returnCode) || !outputFile.exists) {
    return null;
  }

  return outputFile.uri;
};

export const mergeVideos = processAndMergeVideos;

export default { processAndMergeVideos, mergeVideos };
