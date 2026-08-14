/**
 * The dock stylesheet, hand-written as a template string and injected once by
 * the plugin body: the web server serves exactly one file per client plugin,
 * so no separate CSS artifact may exist. Tokens come only from the shared
 * `--dsw-alias-*` design platform (no literal colors); class names carry the
 * `dsh_atFile` prefix to stay unique in the assembled shell.
 */

/** Stable `<style>` element id (idempotent injection across HMR re-runs). */
export const STYLE_ID = 'dsh-at-file-style'

/** The dock's injected stylesheet text. */
export const cssText = `
.dsh_atFile_rail {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.dsh_atFile_row {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
  height: 28px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1);
}
.dsh_atFile_path {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 360px;
  height: 100%;
  padding: 0 6px 0 10px;
  border: 0;
  background: none;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_atFile_path:hover {
  color: var(--dsw-alias-brand-primary);
}
.dsh_atFile_icon {
  flex: none;
  width: 14px;
  height: 14px;
}
.dsh_atFile_remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 20px;
  height: 20px;
  margin-right: 4px;
  border: 0;
  border-radius: 10px;
  background: none;
  color: var(--dsw-alias-label-dimmed);
  cursor: pointer;
}
.dsh_atFile_remove svg {
  width: 12px;
  height: 12px;
}
.dsh_atFile_remove:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh_atFile_section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.dsh_atFile_title {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 18px;
  line-height: 26px;
  font-weight: 600;
}
.dsh_atFile_card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  cursor: pointer;
}
.dsh_atFile_checkbox {
  flex: none;
  width: 18px;
  height: 18px;
  margin: 2px 0 0;
  accent-color: var(--dsw-alias-brand-primary);
  cursor: pointer;
}
.dsh_atFile_cardText {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dsh_atFile_cardTitle {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 22px;
}
.dsh_atFile_cardDesc {
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}
.dsh_atFile_filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.dsh_atFile_filterTitle {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 22px;
  font-weight: 600;
}
.dsh_atFile_filterDesc,
.dsh_atFile_filterHint {
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}
.dsh_atFile_filterInput {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 112px;
  padding: 8px 10px;
  resize: vertical;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  outline: none;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}
.dsh_atFile_filterInput:focus {
  border-color: var(--dsw-alias-brand-primary);
}
.dsh_atFile_filterActions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.dsh_atFile_filterSave {
  flex: none;
  min-height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 16px;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-inverted);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}
.dsh_atFile_filterSave:disabled {
  opacity: 0.45;
  cursor: default;
}
`

/**
 * Inject the dock stylesheet once (stable id; HMR-safe).
 */
export function adoptStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = cssText
  document.head.appendChild(style)
}
