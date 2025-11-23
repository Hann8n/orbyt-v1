import ExpoModulesCore
import AVFoundation
import UIKit

public class NativeVideoProcessorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeVideoProcessor")
    
    // Merge multiple video files into a single video
    AsyncFunction("mergeVideos") { (videoPaths: [String], outputPath: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let result = try self.mergeVideoFiles(videoPaths: videoPaths, outputPath: outputPath)
          promise.resolve(result)
        } catch {
          promise.reject("MERGE_ERROR", error.localizedDescription)
        }
      }
    }
    
    // Trim a video to a specific time range
    AsyncFunction("trimVideo") { (videoPath: String, startTime: Double, endTime: Double, outputPath: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let result = try self.trimVideoFile(videoPath: videoPath, startTime: startTime, endTime: endTime, outputPath: outputPath)
          promise.resolve(result)
        } catch {
          promise.reject("TRIM_ERROR", error.localizedDescription)
        }
      }
    }
    
    // Get video metadata
    AsyncFunction("getVideoMetadata") { (videoPath: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let metadata = try self.getVideoMetadata(videoPath: videoPath)
          promise.resolve(metadata)
        } catch {
          promise.reject("METADATA_ERROR", error.localizedDescription)
        }
      }
    }
    
    // Compress a video
    AsyncFunction("compressVideo") { (videoPath: String, outputPath: String, quality: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let result = try self.compressVideoFile(videoPath: videoPath, outputPath: outputPath, quality: quality)
          promise.resolve(result)
        } catch {
          promise.reject("COMPRESS_ERROR", error.localizedDescription)
        }
      }
    }
  }
  
  // MARK: - Native Video Processing Methods
  
  private func mergeVideoFiles(videoPaths: [String], outputPath: String) throws -> [String: Any] {
    let composition = AVMutableComposition()
    
    guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
          let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw NSError(domain: "NativeVideoProcessor", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to create composition tracks"])
    }
    
    var currentTime = CMTime.zero
    var totalDuration: CMTime = .zero
    
    for videoPath in videoPaths {
      let url = URL(fileURLWithPath: videoPath.replacingOccurrences(of: "file://", with: ""))
      let asset = AVURLAsset(url: url)
      
      guard let assetVideoTrack = asset.tracks(withMediaType: .video).first else {
        continue
      }
      
      let duration = asset.duration
      let timeRange = CMTimeRangeMake(start: .zero, duration: duration)
      
      // Add video track
      try videoTrack.insertTimeRange(timeRange, of: assetVideoTrack, at: currentTime)
      
      // Add audio track if available
      if let assetAudioTrack = asset.tracks(withMediaType: .audio).first {
        try? audioTrack.insertTimeRange(timeRange, of: assetAudioTrack, at: currentTime)
      }
      
      currentTime = CMTimeAdd(currentTime, duration)
      totalDuration = CMTimeAdd(totalDuration, duration)
    }
    
    // Export the composition
    let outputURL = URL(fileURLWithPath: outputPath.replacingOccurrences(of: "file://", with: ""))
    
    // Remove existing file if present
    try? FileManager.default.removeItem(at: outputURL)
    
    guard let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
      throw NSError(domain: "NativeVideoProcessor", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to create export session"])
    }
    
    exportSession.outputURL = outputURL
    exportSession.outputFileType = .mp4
    exportSession.shouldOptimizeForNetworkUse = true
    
    let semaphore = DispatchSemaphore(value: 0)
    var exportError: Error?
    
    exportSession.exportAsynchronously {
      if exportSession.status == .failed {
        exportError = exportSession.error
      }
      semaphore.signal()
    }
    
    semaphore.wait()
    
    if let error = exportError {
      throw error
    }
    
    guard exportSession.status == .completed else {
      throw NSError(domain: "NativeVideoProcessor", code: 3, userInfo: [NSLocalizedDescriptionKey: "Export failed with status: \(exportSession.status.rawValue)"])
    }
    
    // Get final video info
    let finalAsset = AVURLAsset(url: outputURL)
    let videoInfo = try self.extractVideoInfo(from: finalAsset, path: outputURL.path)
    
    return videoInfo
  }
  
  private func trimVideoFile(videoPath: String, startTime: Double, endTime: Double, outputPath: String) throws -> [String: Any] {
    let url = URL(fileURLWithPath: videoPath.replacingOccurrences(of: "file://", with: ""))
    let asset = AVURLAsset(url: url)
    
    let start = CMTime(seconds: startTime, preferredTimescale: 600)
    let end = CMTime(seconds: endTime, preferredTimescale: 600)
    let timeRange = CMTimeRangeMake(start: start, duration: CMTimeSubtract(end, start))
    
    let outputURL = URL(fileURLWithPath: outputPath.replacingOccurrences(of: "file://", with: ""))
    
    // Remove existing file if present
    try? FileManager.default.removeItem(at: outputURL)
    
    guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality) else {
      throw NSError(domain: "NativeVideoProcessor", code: 4, userInfo: [NSLocalizedDescriptionKey: "Failed to create export session"])
    }
    
    exportSession.outputURL = outputURL
    exportSession.outputFileType = .mp4
    exportSession.timeRange = timeRange
    exportSession.shouldOptimizeForNetworkUse = true
    
    let semaphore = DispatchSemaphore(value: 0)
    var exportError: Error?
    
    exportSession.exportAsynchronously {
      if exportSession.status == .failed {
        exportError = exportSession.error
      }
      semaphore.signal()
    }
    
    semaphore.wait()
    
    if let error = exportError {
      throw error
    }
    
    guard exportSession.status == .completed else {
      throw NSError(domain: "NativeVideoProcessor", code: 5, userInfo: [NSLocalizedDescriptionKey: "Export failed"])
    }
    
    let finalAsset = AVURLAsset(url: outputURL)
    return try self.extractVideoInfo(from: finalAsset, path: outputURL.path)
  }
  
  private func compressVideoFile(videoPath: String, outputPath: String, quality: String) throws -> [String: Any] {
    let url = URL(fileURLWithPath: videoPath.replacingOccurrences(of: "file://", with: ""))
    let asset = AVURLAsset(url: url)
    
    let outputURL = URL(fileURLWithPath: outputPath.replacingOccurrences(of: "file://", with: ""))
    
    // Remove existing file if present
    try? FileManager.default.removeItem(at: outputURL)
    
    // Determine preset based on quality
    let preset: String
    switch quality.lowercased() {
    case "low":
      preset = AVAssetExportPresetLowQuality
    case "medium":
      preset = AVAssetExportPresetMediumQuality
    case "high":
      preset = AVAssetExportPresetHighestQuality
    default:
      preset = AVAssetExportPresetMediumQuality
    }
    
    guard let exportSession = AVAssetExportSession(asset: asset, presetName: preset) else {
      throw NSError(domain: "NativeVideoProcessor", code: 6, userInfo: [NSLocalizedDescriptionKey: "Failed to create export session"])
    }
    
    exportSession.outputURL = outputURL
    exportSession.outputFileType = .mp4
    exportSession.shouldOptimizeForNetworkUse = true
    
    let semaphore = DispatchSemaphore(value: 0)
    var exportError: Error?
    
    exportSession.exportAsynchronously {
      if exportSession.status == .failed {
        exportError = exportSession.error
      }
      semaphore.signal()
    }
    
    semaphore.wait()
    
    if let error = exportError {
      throw error
    }
    
    guard exportSession.status == .completed else {
      throw NSError(domain: "NativeVideoProcessor", code: 7, userInfo: [NSLocalizedDescriptionKey: "Export failed"])
    }
    
    let finalAsset = AVURLAsset(url: outputURL)
    return try self.extractVideoInfo(from: finalAsset, path: outputURL.path)
  }
  
  private func getVideoMetadata(videoPath: String) throws -> [String: Any] {
    let url = URL(fileURLWithPath: videoPath.replacingOccurrences(of: "file://", with: ""))
    let asset = AVURLAsset(url: url)
    
    return try self.extractVideoInfo(from: asset, path: videoPath)
  }
  
  private func extractVideoInfo(from asset: AVURLAsset, path: String) throws -> [String: Any] {
    var info: [String: Any] = [:]
    
    // Duration
    let duration = CMTimeGetSeconds(asset.duration)
    info["duration"] = duration
    
    // File size
    if let fileSize = try? FileManager.default.attributesOfItem(atPath: path)[.size] as? NSNumber {
      info["size"] = fileSize.intValue
    }
    
    // Video track info
    if let videoTrack = asset.tracks(withMediaType: .video).first {
      let size = videoTrack.naturalSize
      let transform = videoTrack.preferredTransform
      
      // Handle rotation
      let width: CGFloat
      let height: CGFloat
      if transform.a == 0 && abs(transform.b) == 1 {
        // 90 or 270 degree rotation
        width = size.height
        height = size.width
      } else {
        width = size.width
        height = size.height
      }
      
      info["width"] = Int(width)
      info["height"] = Int(height)
      info["frameRate"] = videoTrack.nominalFrameRate
      
      // Bitrate (estimated)
      if let bitrate = try? FileManager.default.attributesOfItem(atPath: path)[.size] as? NSNumber {
        let estimatedBitrate = (bitrate.doubleValue * 8) / duration
        info["bitrate"] = Int(estimatedBitrate)
      }
    }
    
    info["path"] = "file://" + path
    
    return info
  }
}
