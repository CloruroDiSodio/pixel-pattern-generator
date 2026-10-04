/**
 * English translation catalogue - the single source of truth for the app.
 *
 * Every other locale is typed as `Record<TranslationKey, string>`, so adding a
 * key here immediately breaks the build of any locale that has not translated
 * it. That is deliberate: a half-translated locale should fail loudly in CI
 * rather than silently fall back to English at runtime.
 *
 * Placeholders use `{name}` and are substituted by `translate()`; numeric
 * values are formatted with `Intl.NumberFormat` for the active locale.
 */
export const en = {
  'skipToStudio': 'Skip to the studio',

  /* --- header ----------------------------------------------------------- */
  'header.title': 'Pixel Art & Pattern Generator',
  'header.tagline':
    'Pixelate a photo, quantize it to a retro palette, export a stitchable chart.',
  'header.apiChecking': 'Checking API…',
  'header.apiOnline': 'API online',
  'header.apiOffline': 'API offline',
  'header.apiDocs': 'API docs',
  'header.language': 'Language',
  'header.version': 'Version {version}',

  /* --- sidebar ---------------------------------------------------------- */
  'sidebar.source': 'Source',
  'sidebar.settings': 'Settings',
  'sidebar.reset': 'Reset',

  /* --- dropzone --------------------------------------------------------- */
  'dropzone.alt': 'Selected source: {name}',
  'dropzone.replace': 'Replace image',
  'dropzone.prompt': 'Drop an image here, paste it, or click to browse',
  'dropzone.formats': 'PNG, JPEG, GIF, WEBP, BMP or TIFF · up to {size} MB',
  'dropzone.choose': 'Choose a file',
  'dropzone.remove': 'Remove image',
  'dropzone.errorNotImage': '“{file}” is not an image. Use PNG, JPEG, GIF, WEBP, BMP or TIFF.',
  'dropzone.errorTooLarge': '“{file}” is {size} MB - the limit is 15 MB.',
  'dropzone.errorEmpty': '“{file}” is empty.',
  'dropzone.errorDecode': '“{file}” could not be decoded as an image.',

  /* --- status / errors -------------------------------------------------- */
  'status.errorTitle': 'Something went wrong',
  'status.processing': 'Processing…',
  'status.unexpected': 'Unexpected error while processing.',
  'status.patternFailed': 'Pattern generation failed: {message}',
  'status.patternFailedShort': 'Pattern generation failed.',
  'status.apiUnreachable': 'Could not reach the API at {url}. Is the backend running?',
  'status.requestFailed': 'Request failed ({status})',

  /* --- empty state / view tabs ------------------------------------------ */
  'empty.title': 'Drop an image to begin',
  'empty.body':
    'Everything runs on your own machine and our FastAPI backend — the image is never stored.',
  'tab.pixels': 'Pixel art',
  'tab.pattern': 'Craft pattern',
  'toolbar.updating': 'Updating…',
  'toolbar.serverMs': '{ms} ms on the server',
  'toolbar.rerun': '↻ Re-run',

  /* --- canvas ----------------------------------------------------------- */
  'canvas.zoom': 'Zoom',
  'canvas.fit': 'Fit',
  'canvas.fitTitle': 'Shrink the canvas until the whole grid is visible',
  'canvas.dimensions': '{width} × {height} cells',
  'canvas.hint': 'Hover to inspect a cell · click to copy its hex value',
  'canvas.editingHint': 'Click or drag on the canvas to apply the armed tool',
  'canvas.alt': 'Pixel preview, {width} by {height} cells, {colours} colours',

  /* --- pixel editor ------------------------------------------------------ */
  'editor.tools': 'Editing tools',
  'editor.inspect': 'Inspect',
  'editor.paint': 'Paint',
  'editor.eyedropper': 'Pick colour',
  'editor.fill': 'Fill',
  'editor.eraser': 'Erase',
  'editor.dirty': 'Edited',
  'editor.undo': 'Undo',
  'editor.redo': 'Redo',
  'editor.undoTitle': 'Undo the last edit',
  'editor.redoTitle': 'Redo the last undone edit',
  'editor.activeColour': 'Active colour:',
  'editor.pickFromPalette': 'pick one from the palette below',
  'editor.shortcuts': 'Click or drag on the canvas. Keyboard: {undo} to undo, {redo} to redo.',
  'editor.discardConfirm':
    'Re-running rebuilds the pixel grid from the source image and discards your manual edits. Continue?',
  'editor.editsDiscarded': 'Manual edits were discarded — the image was re-processed.',

  /* --- palette ---------------------------------------------------------- */
  'palette.title': 'Palette',
  'palette.colours': '{count} colours',
  'palette.cells': '{count} cells',
  'palette.copy': 'Copy hex',
  'palette.hint': 'Click a swatch to copy its hex value.',
  'palette.hintEdit': 'Click a swatch to make it the active painting colour.',
  'palette.swatchTitle': '{label} — {hex} — {count} cells ({percent}%)',
/* --- settings --------------------------------------------------------- */
  'settings.gridWidth': 'Grid width',
  'settings.gridWidthHintImage': '≈ {width} × {height} stitches',
  'settings.gridWidthHintRange': '{min}–{max} columns',
  'settings.colours': 'Colours',
  'settings.coloursHint': 'Cap on the palette size',
  'settings.resampling': 'Resampling',
  'settings.quantization': 'Quantization',
  'settings.dithering': 'Dithering',
  'settings.ditherHint': 'Error diffusion reveals extra shades',
  'settings.palette': 'Palette',
  'settings.paletteCustom': 'Custom…',
  'settings.customColours': 'Custom colours',
  'settings.customColoursHint': 'Comma separated hex colours, up to {max}.',
  'settings.paletteOrder': 'Palette order',
  'settings.background': 'Transparent background',
  'settings.useWhite': 'Use white',
  'settings.usingWhite': 'Using white',
  'settings.gridLines': 'Grid lines',
  'settings.disabledHint': 'Add an image to turn these controls on.',

  /* --- settings options ------------------------------------------------- */
  'resize.pixelate': 'Pixelate (average blocks)',
  'resize.sample': 'Sample (keep hard edges)',
  'resize.smooth': 'Smooth (Lanczos)',
  'quantize.mediancut': 'Median cut (balanced)',
  'quantize.maxcoverage': 'Max coverage (vivid)',
  'quantize.fastoctree': 'Fast octree (quick)',
  'quantize.libimagequant': 'libimagequant (best)',
  'dither.none': 'None',
  'dither.floyd_steinberg': 'Floyd–Steinberg',
  'dither.bayer': 'Bayer (ordered)',
  'sort.usage': 'Most used first',
  'sort.luminance': 'Dark to light',
  'sort.hex': 'Alphabetical',

  /* --- craft pattern ---------------------------------------------------- */
  'pattern.details': 'Pattern details',
  'pattern.title': 'Title',
  'pattern.repeatX': 'Repeat across',
  'pattern.repeatY': 'Repeat down',
  'pattern.stitchesTotal': '{count} stitches in total',
  'pattern.repeatsNote': 'Repeats multiply the stitch count.',
  'pattern.building': 'Building the pattern chart…',
  'pattern.empty': 'The pattern chart appears once an image is processed.',
  'pattern.dimensions': '{width} × {height} stitches',
  'pattern.total': '{count} total',
  'pattern.repeated': 'repeated {x} × {y}',
  'pattern.tooLargeTitle': 'Chart too large to display ({width} × {height} cells)',
  'pattern.tooLargeBody':
    'Rendering {count} cells would freeze the browser. The full chart is still included in the CSV and Markdown exports below, and works fine in a spreadsheet or chart viewer.',
  'pattern.caption': '{title} pattern chart',
  'pattern.legend': 'Legend',
  'pattern.threads': '{count} threads',
  'pattern.thread': '{brand} {code} · {name}',
  'pattern.skeins': '{count} skeins',
  'pattern.skeinOne': '1 skein',
  'pattern.skeinNote':
    'Skeins assume {count}-count fabric (about {stitches} stitches per skein). Check a shade card before buying.',

  /* --- thread matching ---------------------------------------------------- */
  'thread.brand': 'Thread brand',
  'thread.none': 'Plain colours (no brand)',
  'thread.noneHint': 'Keep the hex labels, with no thread codes or skein counts.',
  'thread.brandHint':
    'Match every colour onto the closest {name} shade ({colors} in the table) and estimate the skeins to buy.',

  /* --- export ----------------------------------------------------------- */
  'export.title': 'Export',
  'export.png': '⬇ PNG {scale}×',
  'export.pngScaleLabel': 'PNG export scale',
  'export.csv': '⬇ CSV chart',
  'export.markdown': '⬇ Markdown',
  'export.json': '⬇ JSON',
  'export.saved': 'Saved {file}',
  'export.failed': 'PNG export failed.',
  'export.emptyGrid': 'Nothing to export: the grid is empty.',
  'export.noCanvas': 'Canvas is not available in this browser.',
  'export.encodeFailed': 'Could not encode the PNG.',

  /* --- toasts / footer -------------------------------------------------- */
  'toast.copied': 'Copied {value}',
  'toast.clipboardUnavailable': 'Clipboard is not available in this browser.',
  'footer.lead':
    'Pixel art conversion runs server-side with Pillow · patterns are generated by the FastAPI API at',
} as const;

/** Every translatable string in the app. */
export type TranslationKey = keyof typeof en;