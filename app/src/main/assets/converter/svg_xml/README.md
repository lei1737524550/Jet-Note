# SVG ↔ Android XML converter

This directory owns the JavaScript conversion runtime used by `BidirectionalConversionController`.

- `xml.js`: Android drawable XML parsing helpers.
- `path.js`: vector path parsing/conversion helpers.
- `converter.js`: Android VectorDrawable → SVG conversion.
- `shape_to_svg.js`: Android shape drawable → SVG conversion.
- `svg_to_vector.js`: SVG → Android VectorDrawable conversion.

The Android controller remains native code because it owns file selection, WebView execution and output persistence. It loads converter modules only from this directory.
