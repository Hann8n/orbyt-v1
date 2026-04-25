package com.nitro.colors

import com.margelo.nitro.colors.HybridNitroColorsSpec
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

class HybridNitroColors : HybridNitroColorsSpec() {

  // MARK: - Hex parsing

  private fun parseHex(hex: String): Triple<Double, Double, Double> {
    val s = if (hex.startsWith("#")) hex.drop(1) else hex
    val value = s.toLongOrNull(16) ?: return Triple(0.0, 0.0, 0.0)
    val r = ((value shr 16) and 0xFF) / 255.0
    val g = ((value shr  8) and 0xFF) / 255.0
    val b = ( value         and 0xFF) / 255.0
    return Triple(r, g, b)
  }

  private fun toHex(r: Double, g: Double, b: Double): String {
    val ri = min(255, max(0, (r * 255).toInt()))
    val gi = min(255, max(0, (g * 255).toInt()))
    val bi = min(255, max(0, (b * 255).toInt()))
    return "#%02x%02x%02x".format(ri, gi, bi)
  }

  // MARK: - Methods

  override fun blendColors(hex1: String, hex2: String, ratio: Double): String {
    val (r1, g1, b1) = parseHex(hex1)
    val (r2, g2, b2) = parseHex(hex2)
    val t = ratio.coerceIn(0.0, 1.0)
    return toHex(r1 * (1 - t) + r2 * t, g1 * (1 - t) + g2 * t, b1 * (1 - t) + b2 * t)
  }

  override fun getRelativeLuminance(hex: String): Double {
    val (r, g, b) = parseHex(hex)
    fun lin(c: Double) = if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  }

  override fun getContrastRatio(hex1: String, hex2: String): Double {
    val l1 = getRelativeLuminance(hex1)
    val l2 = getRelativeLuminance(hex2)
    val lighter = max(l1, l2)
    val darker  = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)
  }

  override fun isColorDark(hex: String): Boolean {
    val (r, g, b) = parseHex(hex)
    val brightness = (r * 299 + g * 587 + b * 114) * 255 / 1000
    return brightness < 128
  }

  override fun darkenColor(hex: String, amount: Double): String {
    val (r, g, b) = parseHex(hex)
    val t = amount.coerceIn(0.0, 1.0)
    return toHex(r * (1 - t), g * (1 - t), b * (1 - t))
  }

  override fun enhanceColorSaturation(hex: String, saturationBoost: Double): String {
    val (r, g, b) = parseHex(hex)
    val cmax = max(r, max(g, b))
    val cmin = min(r, min(g, b))
    val delta = cmax - cmin
    val l = (cmax + cmin) / 2.0

    if (delta == 0.0) return hex

    var h = when (cmax) {
      r    -> ((g - b) / delta) % 6
      g    -> (b - r) / delta + 2
      else -> (r - g) / delta + 4
    }
    h = ((h / 6) + 1) % 1

    val s = min(1.0, (if (l > 0.5) delta / (2 - cmax - cmin) else delta / (cmax + cmin)) * saturationBoost)

    fun hue2rgb(p: Double, q: Double, tIn: Double): Double {
      var t = tIn
      if (t < 0) t += 1.0
      if (t > 1) t -= 1.0
      if (t < 1.0 / 6) return p + (q - p) * 6 * t
      if (t < 1.0 / 2) return q
      if (t < 2.0 / 3) return p + (q - p) * (2.0 / 3 - t) * 6
      return p
    }

    val q = if (l < 0.5) l * (1 + s) else l + s - l * s
    val p = 2 * l - q
    return toHex(hue2rgb(p, q, h + 1.0 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1.0 / 3))
  }

  override fun hexToRGBA(hex: String, alpha: Double): String {
    val (r, g, b) = parseHex(hex)
    val ri = min(255, max(0, (r * 255).toInt()))
    val gi = min(255, max(0, (g * 255).toInt()))
    val bi = min(255, max(0, (b * 255).toInt()))
    return "rgba($ri, $gi, $bi, $alpha)"
  }
}
