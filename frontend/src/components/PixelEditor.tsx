'use client';

import { memo } from 'react';

import { useTranslate } from '@/components/I18nProvider';
import type { TranslationKey } from '@/lib/i18n';
import { contrastText } from '@/lib/download';
import type { EditTool, PaletteColor } from '@/types';

const TOOLS: Array<{ id: EditTool; label: TranslationKey; icon: string }> = [
  { id: 'inspect', label: 'editor.inspect', icon: '🔍' },
  { id: 'paint', label: 'editor.paint', icon: '🖌️' },
  { id: 'eyedropper', label: 'editor.eyedropper', icon: '💧' },
  { id: 'fill', label: 'editor.fill', icon: '🪣' },
  { id: 'eraser', label: 'editor.eraser', icon: '🧽' },
];

interface PixelEditorProps {
  tool: EditTool;
  onToolChange: (tool: EditTool) => void;
  /** The colour the paint and fill tools will use, or `null` if there is none. */
  activeColor: PaletteColor | null;
  activeIndex: number | null;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * Tool palette, history buttons and shortcut help for the pixel canvas.
 *
 * The tools are real `<button>`s carrying `aria-pressed`, which is what lets
 * assistive technology announce which one is armed.  They sit in a `toolbar`
 * role so the group is reachable as a unit.
 */
function PixelEditor({
  tool,
  onToolChange,
  activeColor,
  activeIndex,
  canUndo,
  canRedo,
  isDirty,
  onUndo,
  onRedo,
}: PixelEditorProps) {
  const t = useTranslate();

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="toolbar" aria-label={t('editor.tools')} className="flex flex-wrap gap-1">
          {TOOLS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={tool === id}
              title={t(label)}
              onClick={() => onToolChange(id)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                tool === id
                  ? 'border-accent-soft bg-accent/20 text-white'
                  : 'border-ink-600 text-slate-300 hover:border-ink-500 hover:text-white'
              }`}
            >
              <span aria-hidden="true">{icon}</span>
              {t(label)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {isDirty ? <span className="chip border-accent-soft text-accent-soft">{t('editor.dirty')}</span> : null}
          <button
            type="button"
            className="btn btn-ghost px-2 py-1"
            onClick={onUndo}
            disabled={!canUndo}
            title={t('editor.undoTitle')}
          >
            ↶ {t('editor.undo')}
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2 py-1"
            onClick={onRedo}
            disabled={!canRedo}
            title={t('editor.redoTitle')}
          >
            ↷ {t('editor.redo')}
          </button>
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span>{t('editor.activeColour')}</span>
        {activeColor && activeIndex !== null ? (
          <span className="chip">
            <span
              className="mr-2 inline-block h-3 w-3 rounded-sm border border-ink-600"
              style={{
                backgroundColor: activeColor.hex,
                // The swatch can be any colour the quantiser produced, so the
                // label has to be legible against the swatch itself rather than
                // against the theme.
                color: contrastText(activeColor.hex),
              }}
            />
            <span className="font-mono">{activeColor.hex}</span>
          </span>
        ) : (
          <span>{t('editor.pickFromPalette')}</span>
        )}
      </p>

      {/* Spelled platform-neutrally: the same binding is Cmd on macOS and Ctrl
          everywhere else, and the hook listens for both. */}
      <p className="text-[11px] text-slate-400">
        {t('editor.shortcuts', { undo: 'Ctrl/⌘ + Z', redo: 'Ctrl/⌘ + Shift + Z' })}
      </p>
    </div>
  );
}

export default memo(PixelEditor);