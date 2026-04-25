import NitroModules

class HybridNitroColors: HybridNitroColorsSpec {

  // MARK: - Hex parsing

  private func parseHex(_ hex: String) -> (r: Double, g: Double, b: Double) {
    let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    guard s.count == 6, let value = UInt64(s, radix: 16) else {
      return (0, 0, 0)
    }
    let r = Double((value >> 16) & 0xFF) / 255.0
    let g = Double((value >>  8) & 0xFF) / 255.0
    let b = Double( value        & 0xFF) / 255.0
    return (r, g, b)
  }

  private func toHex(r: Double, g: Double, b: Double) -> String {
    let ri = min(255, max(0, Int((r * 255).rounded())))
    let gi = min(255, max(0, Int((g * 255).rounded())))
    let bi = min(255, max(0, Int((b * 255).rounded())))
    return String(format: "#%02x%02x%02x", ri, gi, bi)
  }

  // MARK: - Methods

  func blendColors(hex1: String, hex2: String, ratio: Double) throws -> String {
    let (r1, g1, b1) = parseHex(hex1)
    let (r2, g2, b2) = parseHex(hex2)
    let t = min(1, max(0, ratio))
    return toHex(
      r: r1 * (1 - t) + r2 * t,
      g: g1 * (1 - t) + g2 * t,
      b: b1 * (1 - t) + b2 * t
    )
  }

  func getRelativeLuminance(hex: String) throws -> Double {
    let (r, g, b) = parseHex(hex)
    func lin(_ c: Double) -> Double {
      c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  }

  func getContrastRatio(hex1: String, hex2: String) throws -> Double {
    let l1 = try getRelativeLuminance(hex: hex1)
    let l2 = try getRelativeLuminance(hex: hex2)
    let lighter = max(l1, l2)
    let darker  = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)
  }

  func isColorDark(hex: String) throws -> Bool {
    let (r, g, b) = parseHex(hex)
    let brightness = (r * 299 + g * 587 + b * 114) * 255 / 1000
    return brightness < 128
  }

  func darkenColor(hex: String, amount: Double) throws -> String {
    let (r, g, b) = parseHex(hex)
    let t = min(1, max(0, amount))
    return toHex(r: r * (1 - t), g: g * (1 - t), b: b * (1 - t))
  }

  func enhanceColorSaturation(hex: String, saturationBoost: Double) throws -> String {
    let (r, g, b) = parseHex(hex)

    let cmax = max(r, max(g, b))
    let cmin = min(r, min(g, b))
    let delta = cmax - cmin
    let l = (cmax + cmin) / 2.0

    guard delta > 0 else { return hex }

    var h: Double = 0
    if cmax == r      { h = ((g - b) / delta).truncatingRemainder(dividingBy: 6) }
    else if cmax == g { h = (b - r) / delta + 2 }
    else              { h = (r - g) / delta + 4 }
    h = (h / 6 + 1).truncatingRemainder(dividingBy: 1)

    let s = min(1, (l > 0.5 ? delta / (2 - cmax - cmin) : delta / (cmax + cmin)) * saturationBoost)

    func hue2rgb(_ p: Double, _ q: Double, _ t: Double) -> Double {
      var t = t
      if t < 0 { t += 1 }
      if t > 1 { t -= 1 }
      if t < 1/6 { return p + (q - p) * 6 * t }
      if t < 1/2 { return q }
      if t < 2/3 { return p + (q - p) * (2/3 - t) * 6 }
      return p
    }

    let q = l < 0.5 ? l * (1 + s) : l + s - l * s
    let p = 2 * l - q
    return toHex(
      r: hue2rgb(p, q, h + 1/3),
      g: hue2rgb(p, q, h),
      b: hue2rgb(p, q, h - 1/3)
    )
  }

  func hexToRGBA(hex: String, alpha: Double) throws -> String {
    let (r, g, b) = parseHex(hex)
    let ri = min(255, max(0, Int((r * 255).rounded())))
    let gi = min(255, max(0, Int((g * 255).rounded())))
    let bi = min(255, max(0, Int((b * 255).rounded())))
    return "rgba(\(ri), \(gi), \(bi), \(alpha))"
  }
}
