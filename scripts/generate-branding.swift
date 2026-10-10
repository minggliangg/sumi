// Run from the repository root: swift scripts/generate-branding.swift
// Exports genuine font outlines; the SVGs require no installed fonts at runtime.
import Foundation
import CoreText
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func glyphPath(_ character: String, fontName: String) -> CGPath {
    let font = CTFontCreateWithName(fontName as CFString, 500, nil)
    let chars = Array(character.utf16)
    var glyphs = [CGGlyph](repeating: 0, count: chars.count)
    precondition(CTFontGetGlyphsForCharacters(font, chars, &glyphs, chars.count), "Missing glyph")
    precondition(CTFontCopyPostScriptName(font) as String == fontName, "Font unavailable: \(fontName)")
    return CTFontCreatePathForGlyph(font, glyphs[0], nil)!
}
func fitted(_ path: CGPath, in box: CGRect) -> CGPath {
    let bounds = path.boundingBoxOfPath
    let scale = min(box.width / bounds.width, box.height / bounds.height)
    let x = box.midX - bounds.width * scale / 2
    let y = box.midY - bounds.height * scale / 2
    var transform = CGAffineTransform(a: scale, b: 0, c: 0, d: -scale,
                                     tx: x - bounds.minX * scale, ty: y + bounds.maxY * scale)
    return path.copy(using: &transform)!
}
func wordmark() -> CGPath {
    let font = CTFontCreateWithName("HelveticaNeue" as CFString, 120, nil)
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: "sumi.", attributes: [
        NSAttributedString.Key(kCTFontAttributeName as String): font
    ]) as CFAttributedString)
    let result = CGMutablePath()
    for run in CTLineGetGlyphRuns(line) as! [CTRun] {
        let count = CTRunGetGlyphCount(run)
        var glyphs = [CGGlyph](repeating: 0, count: count)
        var positions = [CGPoint](repeating: .zero, count: count)
        CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
        CTRunGetPositions(run, CFRange(location: 0, length: 0), &positions)
        for i in 0..<count {
            if let path = CTFontCreatePathForGlyph(font, glyphs[i], nil) {
                result.addPath(path, transform: CGAffineTransform(translationX: positions[i].x, y: positions[i].y))
            }
        }
    }
    return result
}
func svgPath(_ path: CGPath) -> String {
    var parts: [String] = []
    func p(_ point: CGPoint) -> String { String(format: "%.3f %.3f", Double(point.x), Double(point.y)) }
    path.applyWithBlock { pointer in
        let e = pointer.pointee
        switch e.type {
        case .moveToPoint: parts.append("M" + p(e.points[0]))
        case .addLineToPoint: parts.append("L" + p(e.points[0]))
        case .addQuadCurveToPoint: parts.append("Q" + p(e.points[0]) + " " + p(e.points[1]))
        case .addCurveToPoint: parts.append("C" + p(e.points[0]) + " " + p(e.points[1]) + " " + p(e.points[2]))
        case .closeSubpath: parts.append("Z")
        @unknown default: fatalError("Unknown path element")
        }
    }
    return parts.joined(separator: " ")
}
let ink = glyphPath("墨", fontName: "HiraMinProN-W6")
let icon = CGMutablePath()
icon.addPath(fitted(ink, in: CGRect(x: 112, y: 112, width: 272, height: 288)))
icon.addEllipse(in: CGRect(x: 386, y: 348, width: 32, height: 32))
let logo = CGMutablePath()
logo.addPath(fitted(ink, in: CGRect(x: 270, y: 150, width: 440, height: 480)))
logo.addEllipse(in: CGRect(x: 752, y: 574, width: 56, height: 56))
logo.addPath(fitted(wordmark(), in: CGRect(x: 270, y: 730, width: 500, height: 130)))
func writeSVG(_ path: CGPath, size: Int, background: Bool, to file: String) throws {
    let bg = background ? "<rect width=\"\(size)\" height=\"\(size)\" fill=\"#fbfaf7\"/>" : ""
    let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 \(size) \(size)\"><title>sumi. — 墨</title>\(bg)<path fill=\"#141414\" d=\"\(svgPath(path))\"/></svg>\n"
    try svg.write(toFile: file, atomically: true, encoding: .utf8)
}
func writePNG(_ path: CGPath, canvas: Int, size: Int, background: Bool, to file: String) {
    let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    if background {
        context.setFillColor(CGColor(red: 251/255, green: 250/255, blue: 247/255, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: size, height: size))
    }
    context.translateBy(x: 0, y: CGFloat(size))
    context.scaleBy(x: CGFloat(size)/CGFloat(canvas), y: -CGFloat(size)/CGFloat(canvas))
    context.setFillColor(CGColor(red: 20/255, green: 20/255, blue: 20/255, alpha: 1))
    context.addPath(path)
    context.fillPath()
    let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: file) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, context.makeImage()!, nil)
    precondition(CGImageDestinationFinalize(destination))
}
try writeSVG(icon, size: 512, background: true, to: "assets/branding/app-icon.svg")
try writeSVG(icon, size: 512, background: true, to: "public/favicon.svg")
try writeSVG(logo, size: 1024, background: false, to: "assets/branding/sumi-logo.svg")
writePNG(icon, canvas: 512, size: 1024, background: true, to: "assets/branding/app-icon-source.png")
writePNG(logo, canvas: 1024, size: 1024, background: false, to: "assets/branding/sumi-logo.png")
for (name, size) in [("apple-touch-icon.png",180),("icon-192.png",192),("icon-512.png",512),("icon-maskable-512.png",512)] {
    writePNG(icon, canvas: 512, size: size, background: true, to: "public/\(name)")
}
print("Exported verified 墨 font outlines and PNG icons")
