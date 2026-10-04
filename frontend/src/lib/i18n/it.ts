import type { TranslationKey } from './en';

/**
 * Italian translation catalogue.
 *
 * Typed as `Record<TranslationKey, string>` so TypeScript rejects this file
 * the moment a key is added to `en.ts` and not translated here.
 */
export const it: Record<TranslationKey, string> = {
  'skipToStudio': 'Vai allo studio',

  /* --- header ----------------------------------------------------------- */
  'header.title': 'Generatore di Pixel Art e Schemi',
  'header.tagline':
    'Pixelizza una foto, quantizzala su una palette retro, esporta uno schema ricamabile.',
  'header.apiChecking': 'Controllo API…',
  'header.apiOnline': 'API online',
  'header.apiOffline': 'API offline',
  'header.apiDocs': 'Documentazione API',
  'header.language': 'Lingua',
  'header.version': 'Versione {version}',

  /* --- sidebar ---------------------------------------------------------- */
  'sidebar.source': 'Sorgente',
  'sidebar.settings': 'Impostazioni',
  'sidebar.reset': 'Ripristina',

  /* --- dropzone --------------------------------------------------------- */
  'dropzone.alt': 'Sorgente selezionata: {name}',
  'dropzone.replace': 'Sostituisci immagine',
  'dropzone.prompt': 'Trascina qui un’immagine, incollala o fai clic per sfogliare',
  'dropzone.formats': 'PNG, JPEG, GIF, WEBP, BMP o TIFF · fino a {size} MB',
  'dropzone.choose': 'Scegli un file',
  'dropzone.remove': 'Rimuovi immagine',
  'dropzone.errorNotImage': '“{file}” non è un’immagine. Usa PNG, JPEG, GIF, WEBP, BMP o TIFF.',
  'dropzone.errorTooLarge': '“{file}” è {size} MB - il limite è 15 MB.',
  'dropzone.errorEmpty': '“{file}” è vuoto.',
  'dropzone.errorDecode': 'Non è stato possibile decodificare “{file}” come immagine.',

  /* --- status / errors -------------------------------------------------- */
  'status.errorTitle': 'Qualcosa è andato storto',
  'status.processing': 'Elaborazione…',
  'status.unexpected': 'Errore imprevisto durante l’elaborazione.',
  'status.patternFailed': 'Generazione dello schema non riuscita: {message}',
  'status.patternFailedShort': 'Generazione dello schema non riuscita.',
  'status.apiUnreachable': 'Impossibile raggiungere l’API su {url}. Il backend è in esecuzione?',
  'status.requestFailed': 'Richiesta non riuscita ({status})',

  /* --- empty state / view tabs ------------------------------------------ */
  'empty.title': 'Trascina un’immagine per iniziare',
  'empty.body':
    'Tutto viene elaborato sul tuo computer e sul nostro backend FastAPI — l’immagine non viene mai archiviata.',
  'tab.pixels': 'Pixel art',
  'tab.pattern': 'Schema per lavori',
  'toolbar.updating': 'Aggiornamento…',
  'toolbar.serverMs': '{ms} ms sul server',
  'toolbar.rerun': '↻ Rielabora',

  /* --- canvas ----------------------------------------------------------- */
  'canvas.zoom': 'Zoom',
  'canvas.fit': 'Adatta',
  'canvas.fitTitle': 'Riduci l’anteprima finché l’intera griglia non è visibile',
  'canvas.dimensions': '{width} × {height} celle',
  'canvas.hint': 'Passa il mouse su una cella per ispezionarla · clicca per copiare il colore',
  'canvas.editingHint': 'Fai clic o trascina sul canvas per applicare lo strumento attivo',
  'canvas.alt': 'Anteprima pixel, {width} per {height} celle, {colours} colori',

  /* --- pixel editor ------------------------------------------------------ */
  'editor.tools': 'Strumenti di modifica',
  'editor.inspect': 'Ispeziona',
  'editor.paint': 'Pennello',
  'editor.eyedropper': 'Seleziona colore',
  'editor.fill': 'Riempimento',
  'editor.eraser': 'Gomma',
  'editor.dirty': 'Modificato',
  'editor.undo': 'Annulla',
  'editor.redo': 'Ripeti',
  'editor.undoTitle': 'Annulla l’ultima modifica',
  'editor.redoTitle': 'Ripeti l’ultima modifica annullata',
  'editor.activeColour': 'Colore attivo:',
  'editor.pickFromPalette': 'scegline uno dalla palette qui sotto',
  'editor.shortcuts':
    'Fai clic o trascina sul canvas. Tastiera: {undo} per annullare, {redo} per ripetere.',
  'editor.discardConfirm':
    'Rielaborare ricostruisce la griglia dall’immagine originale e scarta le tue modifiche. Continuare?',
  'editor.editsDiscarded': 'Le modifiche manuali sono state scartate: l’immagine è stata rielaborata.',

  /* --- palette ---------------------------------------------------------- */
  'palette.title': 'Palette',
  'palette.colours': '{count} colori',
  'palette.cells': '{count} celle',
  'palette.copy': 'Copia esadecimale',
  'palette.hint': 'Clicca un campione per copiarne il colore esadecimale.',
  'palette.hintEdit': 'Clicca un campione per usarlo come colore di pittura attivo.',
  'palette.swatchTitle': '{label} — {hex} — {count} celle ({percent}%)',
/* --- settings --------------------------------------------------------- */
  'settings.gridWidth': 'Larghezza griglia',
  'settings.gridWidthHintImage': '≈ {width} × {height} punti',
  'settings.gridWidthHintRange': '{min}–{max} colonne',
  'settings.colours': 'Colori',
  'settings.coloursHint': 'Limite massimo della palette',
  'settings.resampling': 'Ricampionamento',
  'settings.quantization': 'Quantizzazione',
  'settings.dithering': 'Dithering',
  'settings.ditherHint': 'La diffusione dell’errore rivela sfumature extra',
  'settings.palette': 'Palette',
  'settings.paletteCustom': 'Personalizzata…',
  'settings.customColours': 'Colori personalizzati',
  'settings.customColoursHint': 'Colori esadecimali separati da virgola, fino a {max}.',
  'settings.paletteOrder': 'Ordine palette',
  'settings.background': 'Sfondo trasparente',
  'settings.useWhite': 'Usa bianco',
  'settings.usingWhite': 'Bianco',
  'settings.gridLines': 'Linee della griglia',
  'settings.disabledHint': 'Aggiungi un’immagine per attivare questi controlli.',

  /* --- settings options ------------------------------------------------- */
  'resize.pixelate': 'Pixelizza (blocchi medi)',
  'resize.sample': 'Campiona (bordi netti)',
  'resize.smooth': 'Liscia (Lanczos)',
  'quantize.mediancut': 'Median cut (equilibrato)',
  'quantize.maxcoverage': 'Max coverage (brillante)',
  'quantize.fastoctree': 'Fast octree (rapido)',
  'quantize.libimagequant': 'libimagequant (migliore)',
  'dither.none': 'Nessuno',
  'dither.floyd_steinberg': 'Floyd–Steinberg',
  'dither.bayer': 'Bayer (ordinato)',
  'sort.usage': 'Più usati prima',
  'sort.luminance': 'Dal scuro al chiaro',
  'sort.hex': 'Alfabetico',

  /* --- craft pattern ---------------------------------------------------- */
  'pattern.details': 'Dettagli dello schema',
  'pattern.title': 'Titolo',
  'pattern.repeatX': 'Ripeti in orizzontale',
  'pattern.repeatY': 'Ripeti in verticale',
  'pattern.stitchesTotal': '{count} punti in totale',
  'pattern.repeatsNote': 'Le ripetizioni moltiplicano il numero di punti.',
  'pattern.building': 'Creazione dello schema…',
  'pattern.empty': 'Lo schema compare dopo l’elaborazione di un’immagine.',
  'pattern.dimensions': '{width} × {height} punti',
  'pattern.total': '{count} totali',
  'pattern.repeated': 'ripetuto {x} × {y}',
  'pattern.tooLargeTitle': 'Schema troppo grande da mostrare ({width} × {height} celle)',
  'pattern.tooLargeBody':
    'Mostrare {count} celle bloccherebbe il browser. Lo schema completo è comunque incluso nelle esportazioni CSV e Markdown qui sotto, e funziona bene in un foglio di calcolo o in un visualizzatore di schemi.',
  'pattern.caption': 'Schema di {title}',
  'pattern.legend': 'Legenda',
  'pattern.threads': '{count} fili',

  /* --- export ----------------------------------------------------------- */
  'export.title': 'Esporta',
  'export.png': '⬇ PNG {scale}×',
  'export.pngScaleLabel': 'Scala di esportazione PNG',
  'export.csv': '⬇ Schema CSV',
  'export.markdown': '⬇ Markdown',
  'export.json': '⬇ JSON',
  'export.saved': 'Salvato {file}',
  'export.failed': 'Esportazione PNG non riuscita.',
  'export.emptyGrid': 'Niente da esportare: la griglia è vuota.',
  'export.noCanvas': 'Canvas non disponibile in questo browser.',
  'export.encodeFailed': 'Impossibile codificare il PNG.',

  /* --- toasts / footer -------------------------------------------------- */
  'toast.copied': '{value} copiato',
  'toast.clipboardUnavailable': 'Gli appunti non sono disponibili in questo browser.',
  'footer.lead':
    'La conversione in pixel art avviene sul server con Pillow · gli schemi sono generati dall’API FastAPI su',
};