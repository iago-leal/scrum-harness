/**
 * Global stylesheet of the SCRUM board (class-prefixed `scrum-`). Injected by
 * apply as an effect; the disposer removes the tag with the plugin.
 *
 * Since v0.8 the palette speaks Primer (GitHub's design system): every value
 * with a semantic equivalent consumes a `@primer/primitives` CSS variable
 * (see primer.ts), with the previous artisanal value kept as literal fallback
 * so a missing token degrades to the pre-Primer look instead of breaking.
 * @module @scrum-harness/ui/client/styles
 */

/** The whole board stylesheet. */
export const SCRUM_CSS = `
/* The panel fills its seat inline (v0.9 retired the fixed overlay + sidebar
   button; v0.23 retired the conversation-view tab — the seat is the details column). */
.scrum-view { display: flex; flex: 1; min-height: 0; }
.scrum-panel {
  width: 100%; height: 100%;
  background: var(--bgColor-inset, #f6f7f9); color: var(--fgColor-default, #1d1f24);
  font-family: var(--fontStack-system, system-ui, sans-serif);
  display: flex; flex-direction: column; overflow: hidden;
  font-size: 13px;
}
.scrum-head {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 18px;
  background: var(--bgColor-emphasis, #23262e); color: var(--fgColor-onEmphasis, #f2f3f5);
}
.scrum-head h1 { font-size: 15px; margin: 0; font-weight: 600; }
.scrum-head .scrum-ws {
  background: rgba(255,255,255,0.14); border-radius: var(--borderRadius-full, 999px);
  padding: 2px 10px; font-size: 12px; white-space: nowrap;
  max-width: 220px; overflow: hidden; text-overflow: ellipsis;
}
.scrum-head .scrum-sub { opacity: 0.65; font-size: 12px; }
.scrum-head .scrum-spacer { flex: 1; }
.scrum-tabs { display: flex; gap: 4px; }
.scrum-tab {
  border: none; background: transparent; color: inherit; cursor: pointer;
  padding: 6px 12px; border-radius: var(--borderRadius-medium, 7px); font-size: 13px; opacity: 0.75;
}
.scrum-tab:hover { background: rgba(255,255,255,0.12); opacity: 1; }
.scrum-tab.is-active, .scrum-tab.is-on { background: rgba(255,255,255,0.18); opacity: 1; font-weight: 600; }
.scrum-close {
  border: none; background: transparent; color: inherit; cursor: pointer;
  font-size: 18px; line-height: 1; padding: 4px 8px; border-radius: var(--borderRadius-medium, 6px); opacity: 0.8;
}
.scrum-close:hover { background: rgba(255,255,255,0.15); opacity: 1; }
.scrum-close.dark { font-size: 14px; color: var(--fgColor-muted, #3f4657); }
.scrum-close.dark:hover { background: var(--bgColor-neutral-muted, rgba(20, 24, 40, 0.08)); }

.scrum-body { flex: 1; overflow: auto; padding: 0 18px 16px; }
.scrum-error {
  margin: 0 18px; margin-top: 10px; padding: 8px 12px; border-radius: var(--borderRadius-medium, 8px);
  background: var(--bgColor-danger-muted, #fbe3e4); color: var(--fgColor-danger, #8f1f26); font-size: 12.5px;
}
.scrum-busy { opacity: 0.55; pointer-events: none; }

.scrum-id {
  font-family: var(--fontStack-monospace, ui-monospace, monospace); font-size: 11px;
  color: var(--fgColor-muted, #6b7280);
  background: var(--bgColor-neutral-muted, rgba(105, 115, 135, 0.12));
  border-radius: var(--borderRadius-small, 5px); padding: 1px 6px;
  white-space: nowrap; flex: none;
}
.scrum-pts {
  font-size: 11px; font-weight: 600; color: var(--fgColor-muted, #5a6172);
  background: var(--counter-bgColor-muted, var(--bgColor-neutral-muted, #eceef4));
  border-radius: var(--borderRadius-full, 5px); padding: 1px 7px;
  white-space: nowrap;
}
/* Task kind chip (comp-45): test = accent, code = success; kind other renders nothing. */
.scrum-kind {
  font-family: var(--fontStack-monospace, ui-monospace, monospace); font-size: 11px; font-weight: 600;
  border-radius: var(--borderRadius-full, 10px); padding: 0 6px; line-height: 16px;
  white-space: nowrap; flex: none;
}
.scrum-kind-test { color: var(--fgColor-accent, #0969da); background: var(--bgColor-accent-muted, #ddf4ff); }
.scrum-kind-code { color: var(--fgColor-success, #1a7f37); background: var(--bgColor-success-muted, #dafbe1); }
/* Component phase chip (comp-43 R7): the raw phase id (or done), plus the ready-for-done marker. */
.scrum-phase {
  font-family: var(--fontStack-monospace, ui-monospace, monospace); font-size: 11px; font-weight: 600;
  border-radius: var(--borderRadius-full, 10px); padding: 0 6px; line-height: 16px;
  white-space: nowrap; flex: none;
  color: var(--fgColor-muted, #59636e); background: var(--bgColor-neutral-muted, rgba(105, 115, 135, 0.14));
}
.scrum-phase-ready { color: var(--fgColor-success, #1a7f37); background: var(--bgColor-success-muted, #dafbe1); }
.scrum-muted { color: var(--fgColor-muted, #6b7280); font-size: 12px; }
.scrum-empty { color: var(--fgColor-muted, #6b7280); padding: 26px; text-align: center; }
.scrum-section-head {
  display: flex; align-items: center; gap: 10px; margin: 12px 0;
}
.scrum-section-head h2 { font-size: 14px; margin: 0; }

/* Primer buttons: default / primary (GitHub green) / danger / invisible. */
.scrum-btn {
  border: 1px solid var(--button-default-borderColor-rest, #c9cedb);
  background: var(--button-default-bgColor-rest, #fff);
  color: var(--button-default-fgColor-rest, #333a49); cursor: pointer;
  border-radius: var(--borderRadius-medium, 7px); padding: 3px 10px; font-size: 12px;
  font-weight: 500; line-height: 1.6; white-space: nowrap;
  transition: background-color 0.12s, color 0.12s, border-color 0.12s;
}
.scrum-btn:hover { background: var(--button-default-bgColor-hover, #eef1f6); border-color: var(--button-default-borderColor-hover, #c9cedb); }
.scrum-btn:focus-visible { outline: 2px solid var(--focus-outlineColor, #2f6fed); outline-offset: -2px; }
.scrum-btn.primary {
  background: var(--button-primary-bgColor-rest, #2f6fed);
  border-color: var(--button-primary-borderColor-rest, #2f6fed);
  color: var(--button-primary-fgColor-rest, #fff);
}
.scrum-btn.primary:hover { background: var(--button-primary-bgColor-hover, #245cd0); border-color: var(--button-primary-borderColor-hover, #245cd0); }
.scrum-btn.danger { color: var(--button-danger-fgColor-rest, #a12832); border-color: var(--button-default-borderColor-rest, #dcb3b7); }
.scrum-btn.danger:hover {
  background: var(--button-danger-bgColor-hover, #f9e9ea);
  border-color: var(--button-danger-borderColor-hover, #dcb3b7);
  color: var(--button-danger-fgColor-hover, #a12832);
}
.scrum-btn.ghost { border-color: transparent; background: transparent; color: var(--button-invisible-fgColor-rest, inherit); }
.scrum-btn.ghost:hover { background: var(--button-invisible-bgColor-hover, rgba(70, 90, 140, 0.1)); }

.scrum-form {
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  margin: 6px 0; padding: 8px 10px; border-radius: var(--borderRadius-medium, 9px);
  background: var(--bgColor-muted, #eef1f6); border: 1px solid var(--borderColor-default, #dde1ea);
}
.scrum-form input, .scrum-form textarea, .scrum-form select {
  border: 1px solid var(--control-borderColor-rest, #c6ccda); border-radius: var(--borderRadius-medium, 6px);
  padding: 4px 8px;
  font-size: 12.5px; background: var(--bgColor-default, #fff); color: var(--fgColor-default, #1d1f24);
  font-family: inherit;
}
.scrum-form input:focus, .scrum-form textarea:focus {
  border-color: var(--focus-outlineColor, #9db9f2);
  outline: 1px solid var(--focus-outlineColor, #9db9f2); outline-offset: -1px;
}
.scrum-form textarea { width: 100%; min-height: 56px; resize: vertical; }
.scrum-form .grow { flex: 1; min-width: 160px; }

/* ---- Shared visual vocabulary: type icons and state dots ---- */
.scrum-kind-icon {
  width: 17px; height: 17px; border-radius: var(--borderRadius-small, 4px); flex: none;
  color: var(--fgColor-onEmphasis, #fff); font-size: 10px; font-weight: 700; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
}
.scrum-state {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--fgColor-muted, #3f4657); white-space: nowrap;
}
.scrum-state-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.scrum-dash { color: var(--fgColor-disabled, #b3b9c7); }

/* ---- Backlog: hierarchical grid, GitHub issue-tracker skin ---- */
.scrum-bl {
  background: var(--bgColor-default, #fff);
  border: 1px solid var(--borderColor-default, #e2e5ec); border-radius: var(--borderRadius-medium, 10px);
}
.scrum-bl-row {
  display: grid; grid-template-columns: minmax(0, 1fr) 140px 120px 180px;
  align-items: center; min-height: 34px; border-bottom: 1px solid var(--borderColor-muted, #eef0f4);
}
.scrum-bl-row:last-child { border-bottom: none; }
.scrum-bl-row:not(.scrum-bl-head):hover { background: var(--bgColor-muted, #f4f7fd); }
.scrum-bl-row.is-selected {
  background: var(--bgColor-accent-muted, #e9f1fe);
  box-shadow: inset 3px 0 0 var(--bgColor-accent-emphasis, #2f6fed);
}
/* List header à la GitHub: muted band, normal case, semibold. */
.scrum-bl-head {
  position: sticky; top: 0; z-index: 6;
  background: var(--bgColor-muted, #eef0f5); border-radius: var(--borderRadius-medium, 10px) var(--borderRadius-medium, 10px) 0 0;
  border-bottom: 1px solid var(--borderColor-default, #eef0f4);
  font-size: 12px; font-weight: 600; text-transform: none; letter-spacing: normal;
  color: var(--fgColor-muted, #59606f); min-height: 30px;
}
.scrum-bl-head .scrum-bl-item { padding-left: 10px; }
.scrum-bl-item {
  display: flex; align-items: center; gap: 7px; min-width: 0; padding-right: 10px;
}
/* Cells clip: whatever does not fit its column is hidden, never painted over the board's edge. */
.scrum-bl-cell { display: flex; align-items: center; gap: 5px; padding-right: 10px; min-width: 0; overflow: hidden; }
.scrum-bl-cell .scrum-chip { flex: none; }
.scrum-bl-title {
  border: none; background: transparent; cursor: pointer; padding: 0;
  font: inherit; color: inherit; text-align: left; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 0 1 auto;
}
.scrum-bl-title:hover { color: var(--fgColor-accent, #2f6fed); text-decoration: underline; }
.scrum-bl-row.lvl-release .scrum-bl-title { font-weight: 700; font-size: 13.5px; }
.scrum-bl-row.lvl-feature .scrum-bl-title { font-weight: 600; }
.scrum-bl-hover { margin-left: auto; opacity: 0; }
.scrum-bl-row:hover .scrum-bl-hover,
.scrum-bl-hover:focus-within,
.scrum-bl-hover:has(.is-open) { opacity: 1; }
.scrum-chev {
  width: 18px; height: 18px; flex: none; display: inline-flex;
  align-items: center; justify-content: center;
  border: none; background: transparent; cursor: pointer;
  color: var(--fgColor-muted, #59606f); font-size: 11px; border-radius: var(--borderRadius-small, 4px); padding: 0;
}
button.scrum-chev:hover { background: var(--bgColor-neutral-muted, rgba(70, 90, 140, 0.12)); }

.scrum-rollup { display: inline-flex; align-items: center; gap: 7px; min-width: 0; }
.scrum-rollup-bar {
  width: 54px; height: 6px; border-radius: var(--borderRadius-full, 999px);
  background: var(--bgColor-neutral-muted, #e5e8f0);
  overflow: hidden; flex: none;
}
.scrum-rollup-bar > span {
  display: block; height: 100%; border-radius: var(--borderRadius-full, 999px);
  background: var(--progressBar-bgColor-success, var(--bgColor-success-emphasis, #2da44e));
}
.scrum-rollup-txt { font-size: 11px; color: var(--fgColor-muted, #5a6172); white-space: nowrap; }

.scrum-bl-add .scrum-bl-item { padding-top: 2px; padding-bottom: 2px; }
.scrum-bl-add-btn {
  border: none; background: transparent; cursor: pointer;
  color: var(--fgColor-muted, #6b7280); font-size: 12.5px; padding: 3px 6px; border-radius: var(--borderRadius-medium, 6px);
}
.scrum-bl-add-btn:hover { color: var(--fgColor-accent, #2f6fed); background: var(--bgColor-accent-muted, rgba(47, 111, 237, 0.08)); }
.scrum-bl-add-input, .scrum-bl-add-extra {
  border: 1px solid var(--control-borderColor-rest, #c6ccda); border-radius: var(--borderRadius-medium, 6px);
  padding: 3px 8px;
  font-size: 12.5px; background: var(--bgColor-default, #fff); color: var(--fgColor-default, #1d1f24);
  font-family: inherit;
}
.scrum-bl-add-input { flex: 1; min-width: 120px; }
.scrum-bl-add-input:focus, .scrum-bl-add-extra:focus {
  border-color: var(--focus-outlineColor, #9db9f2);
  outline: 1px solid var(--focus-outlineColor, #9db9f2); outline-offset: -1px;
}
.scrum-bl-add-extra { width: 150px; }

.scrum-menu-wrap { position: relative; display: inline-flex; }
.scrum-menu-backdrop { position: fixed; inset: 0; z-index: 20; }
.scrum-menu {
  position: absolute; right: 0; top: calc(100% + 2px); z-index: 21;
  background: var(--bgColor-default, #fff); border: 1px solid var(--borderColor-default, #d8dce6);
  border-radius: var(--borderRadius-medium, 9px);
  box-shadow: var(--shadow-floating-small, 0 10px 28px rgba(15, 20, 40, 0.18));
  min-width: 195px; padding: 4px; display: flex; flex-direction: column;
}
.scrum-menu-item {
  border: none; background: transparent; cursor: pointer; text-align: left;
  padding: 7px 10px; border-radius: var(--borderRadius-medium, 6px); font-size: 12.5px;
  color: var(--fgColor-default, #2a3040);
  white-space: nowrap;
}
.scrum-menu-item:hover { background: var(--bgColor-muted, #eef1f6); }
.scrum-menu-item.danger { color: var(--fgColor-danger, #a12832); }
.scrum-menu-item.danger:hover { background: var(--bgColor-danger-muted, #f9e9ea); }

/* ---- Work item form (Primer-style dialog/overlay) ---- */
.scrum-wi-overlay {
  position: fixed; inset: 0; z-index: 940;
  background: var(--overlay-backdrop-bgColor, rgba(15, 16, 20, 0.45));
  display: flex; align-items: center; justify-content: center;
}
.scrum-wi {
  width: min(660px, 92vw); max-height: min(640px, 86vh); overflow: auto;
  background: var(--overlay-bgColor, #fff); color: var(--fgColor-default, #1d1f24);
  border-radius: var(--borderRadius-large, 12px);
  border: 1px solid var(--overlay-borderColor, #e2e5ec);
  box-shadow: var(--shadow-floating-large, 0 24px 64px rgba(0,0,0,0.35));
  padding: 0 0 16px; font-size: 13px;
}
/* Primer dialog anatomy: bordered header, padded body, footer actions. The
   header is the drag handle (comp-56 R1): no native selection there — the
   pointerdown preventDefault plus user-select keep a drag from painting text
   across the chat; the id stays copyable in the crumb and in the tree. */
.scrum-wi .scrum-details-head {
  padding: 12px 16px;
  border-bottom: 1px solid var(--borderColor-muted, #eef0f4);
  cursor: grab; touch-action: none; user-select: none;
}
.scrum-wi .scrum-details-head.is-dragging { cursor: grabbing; }
/* Moved (comp-56 R3): the dialog is fixed at the remembered left/top (inline,
   clamped on read — never transform: it must not become the containing block
   of its own fixed menus) and the overlay stops being a backdrop — transparent
   and click-through, so the chat underneath is readable, scrollable, clickable. */
.scrum-wi.is-moved { position: fixed; }
.scrum-wi-overlay.is-moved { background: transparent; pointer-events: none; }
.scrum-wi-overlay.is-moved .scrum-wi { pointer-events: auto; }
.scrum-wi .scrum-details-crumb { margin: 8px 16px 0; }
.scrum-wi > .scrum-field { margin: 12px 16px 0; }
.scrum-wi .scrum-wi-grid { margin: 0 16px; }
.scrum-wi .scrum-details-meta { margin: 12px 16px 0; }
.scrum-wi .scrum-details-foot {
  padding: 12px 16px 0; margin-top: 16px;
  border-top: 1px solid var(--borderColor-muted, #eef0f4);
}
.scrum-wi-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; align-items: start;
}
.scrum-details-head { display: flex; align-items: center; gap: 8px; }
.scrum-details-kind { font-weight: 600; font-size: 14px; }
.scrum-details-crumb { color: var(--fgColor-muted, #8a90a0); font-size: 11.5px; margin-top: 4px; }
.scrum-field { display: flex; flex-direction: column; gap: 4px; margin: 10px 0 0; font-size: 12px; color: var(--fgColor-muted, #4b5265); }
.scrum-field > span { font-weight: 600; color: var(--fgColor-default, #1d1f24); }
.scrum-field input, .scrum-field textarea, .scrum-field select {
  border: 1px solid var(--control-borderColor-rest, #c6ccda); border-radius: var(--borderRadius-medium, 6px);
  padding: 5px 8px;
  font-size: 12.5px; background: var(--bgColor-default, #fff); color: var(--fgColor-default, #1d1f24);
  font-family: inherit;
}
.scrum-field input:focus, .scrum-field textarea:focus {
  border-color: var(--focus-outlineColor, #9db9f2);
  outline: 1px solid var(--focus-outlineColor, #9db9f2); outline-offset: -1px;
}
.scrum-field textarea { resize: vertical; }
.scrum-details-meta { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.scrum-details-foot { display: flex; justify-content: flex-end; gap: 6px; margin-top: 14px; }

/* ---- Traceability section of a component (comp-49 R7): read-only matrix ---- */
.scrum-wi .scrum-trace-section { margin: 14px 16px 0; }
.scrum-trace-head {
  display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px;
  font-size: 12px; font-weight: 600; color: var(--fgColor-default, #1d1f24);
}
.scrum-trace-source { font-weight: 400; color: var(--fgColor-muted, #6b7280); font-size: 11.5px; }
.scrum-trace {
  width: 100%; border-collapse: collapse; font-size: 12px;
  border: 1px solid var(--borderColor-default, #d0d7de); border-radius: var(--borderRadius-medium, 6px);
}
.scrum-trace th {
  text-align: left; font-weight: 600; font-size: 11px; padding: 5px 8px;
  background: var(--bgColor-muted, #f6f8fa); color: var(--fgColor-muted, #59636e);
  border-bottom: 1px solid var(--borderColor-default, #d0d7de);
}
.scrum-trace td {
  padding: 6px 8px; vertical-align: top;
  border-bottom: 1px solid var(--borderColor-muted, #eef0f4);
}
.scrum-trace tr:last-child td { border-bottom: none; }
.scrum-trace-reqs { display: flex; flex-wrap: wrap; gap: 4px; }
.scrum-trace-reqs .scrum-chip { cursor: default; }
.scrum-trace-paths { display: flex; flex-direction: column; gap: 2px; }
.scrum-trace-paths code {
  font-family: var(--fontStack-monospace, ui-monospace, monospace); font-size: 11px;
  color: var(--fgColor-default, #1d1f24); word-break: break-all;
}
.scrum-trace-holes { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.scrum-chip.scrum-trace-hole {
  cursor: default;
  color: var(--fgColor-danger, #d1242f); background: var(--bgColor-danger-muted, #ffebe9);
  border-color: var(--borderColor-danger-muted, transparent);
}
.scrum-trace-issues { margin: 8px 0 0; padding-left: 18px; }
.scrum-trace-issues li { margin: 2px 0; word-break: break-word; }

/* ---- The spiral in the work item form (comp-43 R8) ---- */
.scrum-wi.is-component { width: min(820px, 94vw); max-height: 90vh; }
.scrum-wi-section-head {
  font-size: 12px; font-weight: 600; color: var(--fgColor-default, #1d1f24); margin-bottom: 6px;
}
.scrum-wi .scrum-spiral-section, .scrum-wi .scrum-artifacts, .scrum-wi .scrum-history, .scrum-wi .scrum-wi-notice { margin: 14px 16px 0; }
.scrum-spiral { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.scrum-spiral-arrow { color: var(--fgColor-muted, #8a90a0); font-size: 11px; }
.scrum-spiral-step {
  font-family: var(--fontStack-monospace, ui-monospace, monospace); font-size: 11.5px; font-weight: 600;
  border: 1px solid var(--borderColor-default, #d0d7de); border-radius: var(--borderRadius-full, 12px);
  padding: 1px 9px; line-height: 18px; cursor: pointer;
  background: var(--bgColor-default, #fff); color: var(--fgColor-muted, #59636e);
}
.scrum-spiral-step[data-state="past"] { color: var(--fgColor-success, #1a7f37); border-color: var(--borderColor-success-muted, #aceebb); background: var(--bgColor-success-muted, #dafbe1); }
.scrum-spiral-step[data-state="current"] { color: var(--fgColor-onEmphasis, #fff); background: var(--bgColor-accent-emphasis, #0969da); border-color: var(--bgColor-accent-emphasis, #0969da); }
.scrum-spiral-step[data-state="next"] { color: var(--fgColor-accent, #0969da); border-color: var(--borderColor-accent-emphasis, #0969da); border-style: dashed; }
.scrum-spiral-step[data-state="future"] { opacity: 0.55; }
.scrum-spiral-step:disabled { cursor: default; }
.scrum-spiral-step:disabled:not([data-state="current"]) { opacity: 0.55; }
.scrum-spiral-step:not(:disabled):hover { filter: brightness(0.94); }
.scrum-spiral-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.scrum-spiral-reason { color: var(--fgColor-muted, #6b7280); font-size: 11.5px; }
.scrum-btn.primary:disabled { opacity: 0.55; cursor: default; }
.scrum-checklist { margin-top: 8px; font-size: 12px; }
.scrum-checklist-head { font-weight: 600; }
.scrum-checklist.is-ok .scrum-checklist-head { color: var(--fgColor-success, #1a7f37); }
.scrum-checklist.is-block .scrum-checklist-head { color: var(--fgColor-danger, #d1242f); }
.scrum-checklist ul { margin: 4px 0 0; padding-left: 18px; }
.scrum-checklist.is-block li { color: var(--fgColor-danger, #d1242f); margin: 2px 0; word-break: break-word; }
.scrum-notice {
  margin-top: 8px; padding: 6px 10px; border-radius: var(--borderRadius-medium, 6px); font-size: 12px;
  word-break: break-word;
}
.scrum-notice.is-ok { background: var(--bgColor-success-muted, #dafbe1); color: var(--fgColor-success, #1a7f37); }
.scrum-notice.is-error { background: var(--bgColor-danger-muted, #ffebe9); color: var(--fgColor-danger, #d1242f); }
.scrum-artifact {
  border: 1px solid var(--borderColor-default, #d0d7de); border-radius: var(--borderRadius-medium, 6px);
  margin-top: 6px; overflow: hidden;
}
.scrum-artifact > summary {
  display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none;
  padding: 5px 10px; font-size: 12px; font-weight: 600;
  background: var(--bgColor-muted, #f6f8fa); color: var(--fgColor-default, #1d1f24);
}
.scrum-artifact[open] > summary { border-bottom: 1px solid var(--borderColor-default, #d0d7de); }
.scrum-artifact-size { font-weight: 400; color: var(--fgColor-muted, #59636e); }
.scrum-artifact-dirty { color: var(--fgColor-attention, #9a6700); font-size: 16px; line-height: 12px; }
.scrum-artifact textarea {
  display: block; width: 100%; box-sizing: border-box; border: none; resize: vertical;
  padding: 8px 10px; font-size: 12px; line-height: 1.45;
  font-family: var(--fontStack-monospace, ui-monospace, monospace);
  background: var(--bgColor-default, #fff); color: var(--fgColor-default, #1d1f24);
}
.scrum-artifact textarea:focus { outline: 1px solid var(--focus-outlineColor, #9db9f2); outline-offset: -1px; }
/* comp-44: the Diagramas faixa and the rendered blocks, between summary and textarea. */
.scrum-diagrams-bar {
  display: flex; align-items: center; gap: 8px; padding: 4px 10px; font-size: 12px;
  background: var(--bgColor-muted, #f6f8fa); color: var(--fgColor-default, #1d1f24);
  border-bottom: 1px solid var(--borderColor-default, #d0d7de);
}
.scrum-diagrams-count { font-weight: 600; }
.scrum-diagrams-draft {
  padding: 0 6px; border-radius: 10px; font-size: 11px; font-weight: 600;
  background: var(--bgColor-attention-muted, #fff8c5); color: var(--fgColor-attention, #9a6700);
}
.scrum-diagrams-unavailable { color: var(--fgColor-danger, #d1242f); }
.scrum-diagrams-bar .scrum-btn { padding: 1px 8px; font-size: 11px; }
.scrum-diagrams { display: flex; flex-direction: column; gap: 8px; padding: 8px 10px; background: var(--bgColor-default, #fff); border-bottom: 1px solid var(--borderColor-default, #d0d7de); }
.scrum-diagram { margin: 0; min-width: 0; border: 1px solid var(--borderColor-muted, #d8dee4); border-radius: var(--borderRadius-medium, 6px); }
.scrum-diagram > figcaption {
  padding: 3px 8px; font-size: 11px; font-weight: 600; color: var(--fgColor-muted, #59636e);
  background: var(--bgColor-muted, #f6f8fa); border-bottom: 1px solid var(--borderColor-muted, #d8dee4);
  font-family: var(--fontStack-monospace, ui-monospace, monospace);
}
/* The one scroll container: both axes, capped height, the svg free to be wider than the form (r2 M6).
   mermaid emits width="100%" + max-width: <natural>px, which SHRINKS a wide diagram to the form; the
   inner wrapper carries the viewBox width inline (svgNaturalWidth), so the svg renders 1:1 and scrolls. */
.scrum-diagram-svg { width: 100%; max-height: 420px; overflow: auto; padding: 8px; box-sizing: border-box; }
.scrum-diagram-natural { max-width: none; }
.scrum-diagram-svg svg { max-width: none; height: auto; display: block; }
.scrum-diagram-loading { padding: 8px; font-size: 12px; }
.scrum-diagram-error {
  margin: 0; padding: 8px; font-size: 12px; white-space: pre-wrap; word-break: break-word;
  font-family: var(--fontStack-monospace, ui-monospace, monospace);
  background: var(--bgColor-danger-muted, #ffebe9); color: var(--fgColor-danger, #d1242f);
}
.scrum-diagram.is-error { border-color: var(--borderColor-danger-muted, #ff818266); }
.scrum-diagram-unavailable { display: flex; align-items: center; gap: 8px; padding: 8px; font-size: 12px; flex-wrap: wrap; }

/* ---- comp-58: Visualizar | Escrever and the rendered artifact ----
   The tabs live OUTSIDE .scrum-md (raw html can carry role/aria-*; the e2e
   selects them by this class). The textarea stays mounted in Visualizar with
   the hidden attribute — the display: block above would win over the UA's
   [hidden], so the attribute gets its own rule (R1). */
.scrum-artifact-tabs {
  display: flex; gap: 2px; padding: 4px 10px 0;
  background: var(--bgColor-muted, #f6f8fa); border-bottom: 1px solid var(--borderColor-default, #d0d7de);
}
.scrum-artifact-tabs [role="tab"] {
  border: 1px solid transparent; border-bottom: none; background: transparent; cursor: pointer;
  padding: 4px 10px; font-size: 12px; color: var(--fgColor-muted, #59636e);
  border-radius: var(--borderRadius-medium, 6px) var(--borderRadius-medium, 6px) 0 0; margin-bottom: -1px;
}
.scrum-artifact-tabs [role="tab"]:hover { color: var(--fgColor-default, #1d1f24); }
.scrum-artifact-tabs [role="tab"][aria-selected="true"] {
  background: var(--bgColor-default, #fff); color: var(--fgColor-default, #1d1f24); font-weight: 600;
  border-color: var(--borderColor-default, #d0d7de);
}
.scrum-artifact-tabs [role="tab"]:focus-visible { outline: 2px solid var(--focus-outlineColor, #9db9f2); outline-offset: -2px; }
.scrum-artifact textarea[hidden] { display: none; }

/* The rendered artifact (R5): GitHub's .markdown-body, written only on Primer
   tokens with literal fallbacks and BY ELEMENT — the sanitized html carries no
   class (R2), and the dark theme comes from the same tokens (no dark rule). */
.scrum-md {
  padding: 12px 16px; font-family: var(--fontStack-system, system-ui, sans-serif); font-size: 14px; line-height: 1.5;
  color: var(--fgColor-default, #1d1f24); background: var(--bgColor-default, #fff);
  word-wrap: break-word; overflow-wrap: break-word;
}
.scrum-md > .scrum-md-html > :first-child { margin-top: 0; }
.scrum-md > .scrum-md-html > :last-child { margin-bottom: 0; }
.scrum-md h1, .scrum-md h2, .scrum-md h3, .scrum-md h4, .scrum-md h5, .scrum-md h6 {
  margin: 24px 0 16px; font-weight: 600; line-height: 1.25;
}
.scrum-md h1 { font-size: 2em; padding-bottom: .3em; border-bottom: 1px solid var(--borderColor-muted, #d8dee4); }
.scrum-md h2 { font-size: 1.5em; padding-bottom: .3em; border-bottom: 1px solid var(--borderColor-muted, #d8dee4); }
.scrum-md h3 { font-size: 1.25em; }
.scrum-md h4 { font-size: 1em; }
.scrum-md h5 { font-size: .875em; }
.scrum-md h6 { font-size: .85em; color: var(--fgColor-muted, #59636e); }
.scrum-md p, .scrum-md blockquote, .scrum-md ul, .scrum-md ol, .scrum-md dl, .scrum-md table, .scrum-md pre, .scrum-md details {
  margin-top: 0; margin-bottom: 16px;
}
.scrum-md ul, .scrum-md ol { padding-left: 2em; }
.scrum-md ul ul, .scrum-md ul ol, .scrum-md ol ol, .scrum-md ol ul { margin-top: 0; margin-bottom: 0; }
.scrum-md li + li { margin-top: .25em; }
.scrum-md li > p { margin-top: 16px; }
.scrum-md li:has(> input[type="checkbox"]) { list-style-type: none; margin-left: -1.5em; }
.scrum-md input[type="checkbox"] { margin: 0 .4em .25em -.2em; vertical-align: middle; }
.scrum-md code, .scrum-md tt {
  padding: .2em .4em; margin: 0; font-size: 85%; white-space: break-spaces;
  font-family: var(--fontStack-monospace, ui-monospace, monospace);
  background: var(--bgColor-neutral-muted, rgba(105, 115, 135, 0.12)); border-radius: var(--borderRadius-medium, 6px);
}
.scrum-md pre {
  padding: 16px; overflow: auto; font-size: 85%; line-height: 1.45;
  font-family: var(--fontStack-monospace, ui-monospace, monospace);
  background: var(--bgColor-muted, #f6f8fa); border-radius: var(--borderRadius-medium, 6px);
}
.scrum-md pre code { padding: 0; margin: 0; font-size: 100%; white-space: pre; background: transparent; border: 0; }
.scrum-md blockquote {
  padding: 0 1em; color: var(--fgColor-muted, #59636e);
  border-left: .25em solid var(--borderColor-default, #d0d7de);
}
.scrum-md blockquote > :last-child { margin-bottom: 0; }
.scrum-md hr { height: 4px; padding: 0; margin: 24px 0; border: 0; background: var(--borderColor-default, #d0d7de); }
.scrum-md a { color: var(--fgColor-accent, #0969da); text-decoration: none; }
.scrum-md a:hover { text-decoration: underline; }
.scrum-md strong { font-weight: 600; }
.scrum-md img { max-width: 100%; box-sizing: content-box; }
.scrum-md span[title] { color: var(--fgColor-muted, #59636e); font-style: italic; }
.scrum-md table { display: block; width: max-content; max-width: 100%; overflow: auto; border-spacing: 0; border-collapse: collapse; }
.scrum-md table th { font-weight: 600; }
.scrum-md table th, .scrum-md table td { padding: 6px 13px; border: 1px solid var(--borderColor-default, #d0d7de); }
.scrum-md table tr { background: var(--bgColor-default, #fff); border-top: 1px solid var(--borderColor-muted, #d8dee4); }
.scrum-md table tr:nth-child(2n) { background: var(--bgColor-muted, #f6f8fa); }
.scrum-md table img { background: transparent; }
.scrum-md-fm { margin-bottom: 16px; overflow-x: auto; }
.scrum-md-fm table { font-size: 12.5px; }
.scrum-md-fm td { vertical-align: top; }
.scrum-md-fm pre { margin: 4px 0 0; padding: 6px 8px; font-size: 100%; }
.scrum-md-notice { color: var(--fgColor-muted, #59636e); font-style: italic; }
.scrum-md figure.scrum-diagram { margin: 0 0 16px; }
.scrum-history-list { margin: 0; padding: 6px 10px 6px 28px; font-size: 12px; font-family: var(--fontStack-monospace, ui-monospace, monospace); }
.scrum-history-list li { margin: 2px 0; }
.scrum-history-empty { padding: 6px 10px; }

/* ---- Shelf rows (Archive / Trash) ---- */
.scrum-node { margin: 2px 0; }
.scrum-row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 8px; border-radius: var(--borderRadius-medium, 8px);
}
.scrum-row:hover { background: var(--bgColor-neutral-muted, rgba(70, 90, 140, 0.08)); }
.scrum-row .scrum-title { font-weight: 500; }
.scrum-row .scrum-actions { margin-left: auto; display: flex; gap: 4px; visibility: hidden; }
.scrum-row:hover .scrum-actions { visibility: visible; }

/* ---- Sprint charts (SVG) ---- */
.scrum-chart {
  background: var(--bgColor-default, #fff); border: 1px solid var(--borderColor-default, #e2e5ec);
  border-radius: var(--borderRadius-large, 11px);
  padding: 10px 14px 6px; margin: 10px 0;
}
.scrum-chart-title { font-weight: 700; font-size: 12.5px; margin-bottom: 6px; }
.scrum-chart svg { display: block; }

/* ---- Kanban board ---- */
/* The column count rides a custom property set inline by Board.tsx (comp-55 R7):
   the sheet owns the template, so the side mode can override it. */
.scrum-board { display: grid; grid-template-columns: repeat(var(--scrum-cols, 4), 1fr); gap: 12px; align-items: start; }
.scrum-col.slim { min-height: 90px; }
.scrum-col.heads-only { min-height: 0; padding: 6px 10px; }
.scrum-col.heads-only .scrum-col-head { margin-bottom: 0; }
.scrum-lane { margin-top: 10px; }
.scrum-lane-head {
  display: flex; align-items: center; gap: 10px;
  padding: 5px 4px; margin-bottom: 6px;
  border-bottom: 2px solid var(--borderColor-default, #dde1ea);
}
.scrum-lane-head .scrum-lane-title { font-weight: 700; font-size: 12.5px; color: var(--fgColor-muted, #3f4657); }
.scrum-btn.ghost.is-on { background: var(--bgColor-accent-muted, rgba(47, 111, 237, 0.12)); color: var(--fgColor-accent, #2f6fed); }
.scrum-count.editable { cursor: pointer; border: none; font: inherit; }
.scrum-count.editable:hover { filter: brightness(0.92); }
.scrum-count.over { background: var(--bgColor-danger-muted, #f8d7da); color: var(--fgColor-danger, #8f1f26); font-weight: 700; }
.scrum-wip-input {
  width: 52px; border: 1px solid var(--borderColor-accent-muted, #9db9f2); border-radius: var(--borderRadius-full, 999px);
  font-size: 11px; padding: 0 8px; background: var(--bgColor-default, #fff); color: var(--fgColor-default, #1d1f24);
}
.scrum-pivot {
  display: inline-flex; gap: 2px; background: var(--bgColor-neutral-muted, #e5e8f0);
  border-radius: var(--borderRadius-medium, 8px); padding: 2px;
}
.scrum-pivot-btn {
  border: none; background: transparent; cursor: pointer;
  padding: 4px 12px; border-radius: var(--borderRadius-medium, 7px); font-size: 12px; color: var(--fgColor-muted, #4b5265);
}
.scrum-pivot-btn:hover { background: var(--button-invisible-bgColor-hover, rgba(255,255,255,0.7)); }
.scrum-pivot-btn.is-active {
  background: var(--bgColor-default, #fff); color: var(--fgColor-default, #1d1f24); font-weight: 600;
  box-shadow: var(--shadow-resting-xsmall, 0 1px 2px rgba(20,24,40,0.15));
}
/* Columns à la GitHub Projects: inset surface with border, dot-labeled head. */
.scrum-col {
  background: var(--bgColor-inset, #eceef4);
  border: 1px solid var(--borderColor-default, transparent);
  border-radius: var(--borderRadius-medium, 11px);
  padding: 10px; min-height: 260px;
}
.scrum-col.drag-over {
  outline: 2px dashed var(--borderColor-accent-emphasis, #2f6fed); outline-offset: -2px;
  background: var(--bgColor-accent-muted, #eceef4);
}
.scrum-col-head {
  display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: 12.5px;
  color: var(--fgColor-default, #454c5e); text-transform: none; letter-spacing: normal; margin-bottom: 8px;
}
.scrum-col-head .scrum-state-dot { width: 10px; height: 10px; }
/* Column counters: GitHub counter labels (pill, semibold, neutral tint). */
.scrum-col-head .scrum-count {
  background: var(--counter-bgColor-muted, var(--bgColor-neutral-muted, #d9dde8));
  border-radius: var(--borderRadius-full, 999px);
  padding: 0 8px; font-size: 11px; font-weight: 600;
  min-width: 22px; text-align: center;
  color: var(--fgColor-default, inherit); text-transform: none;
}
/* Cards à la GitHub Projects: bordered surface, whisper of a shadow. */
.scrum-card {
  background: var(--bgColor-default, #fff);
  border: 1px solid var(--borderColor-default, transparent);
  border-radius: var(--borderRadius-medium, 9px);
  padding: 8px 10px; margin-bottom: 8px;
  box-shadow: var(--shadow-resting-xsmall, 0 1px 2px rgba(20, 24, 40, 0.12)); cursor: grab; user-select: none;
}
.scrum-card:hover { box-shadow: var(--shadow-resting-small, 0 1px 2px rgba(20, 24, 40, 0.12)); }
.scrum-card:active { cursor: grabbing; }
.scrum-card .scrum-card-title {
  display: block; border: none; background: transparent; cursor: pointer;
  padding: 0; font: inherit; color: inherit; text-align: left;
  font-weight: 600; margin-bottom: 4px;
}
.scrum-card .scrum-card-title:hover { color: var(--fgColor-accent, #2f6fed); text-decoration: underline; }
.scrum-card .scrum-card-meta {
  display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--fgColor-muted, #6b7280);
}
.scrum-card .scrum-card-crumb { font-size: 11px; color: var(--fgColor-muted, #8a90a0); margin-bottom: 4px; }

/* ---- Sprints ---- */
.scrum-sprint {
  background: var(--bgColor-default, #fff); border: 1px solid var(--borderColor-default, #e0e3eb);
  border-radius: var(--borderRadius-large, 11px);
  padding: 12px 14px; margin-bottom: 12px;
}
.scrum-sprint-head { display: flex; align-items: center; gap: 8px 10px; flex-wrap: wrap; }
.scrum-sprint-head .scrum-goal {
  font-weight: 700; font-size: 13.5px;
  /* The goal owns the line: a healthy base width, wrapping as prose — never
     squeezed into a one-word column by the rigid release <select>. */
  flex: 1 1 340px; min-width: 240px;
}
.scrum-sprint-head select { max-width: 300px; }
/* Sprint completion bar: GitHub milestones are green, so is ours. */
.scrum-progress {
  height: 8px; border-radius: var(--borderRadius-full, 999px);
  background: var(--bgColor-neutral-muted, #e5e8f0); overflow: hidden; margin: 8px 0;
}
.scrum-progress > div {
  height: 100%; border-radius: var(--borderRadius-full, 999px);
  background: var(--progressBar-bgColor-success, var(--bgColor-success-emphasis, #2da44e));
  transition: width 0.2s;
}
.scrum-cer { border-top: 1px dashed var(--borderColor-default, #e0e3eb); margin-top: 8px; padding-top: 8px; }
.scrum-cer-note { margin: 2px 0 2px 14px; font-size: 12.5px; }
.scrum-cer-cat {
  font-size: 10.5px; background: var(--bgColor-neutral-muted, #eceef4);
  border-radius: var(--borderRadius-small, 5px); padding: 1px 6px;
  color: var(--fgColor-muted, #4b5265); margin-right: 6px; text-transform: none;
}

/* Sprint chips, GitHub issue-label style: pill, bold small text, tinted
   background with a matching muted border. */
.scrum-chip {
  cursor: pointer; font-size: 10.5px; font-weight: 600;
  border-radius: var(--borderRadius-full, 999px); padding: 1px 8px;
  border: 1px solid var(--borderColor-neutral-muted, transparent);
  background: var(--bgColor-neutral-muted, #e2e6ee); color: var(--fgColor-muted, #3c4356);
  font-family: var(--fontStack-monospace, ui-monospace, monospace);
  white-space: nowrap;
}
.scrum-chip:hover { filter: brightness(0.93); }
.scrum-chip.st-active {
  background: var(--bgColor-accent-muted, #d8ecff); color: var(--fgColor-accent, #135a9e);
  border-color: var(--borderColor-accent-muted, transparent);
}
/* comp-53: the title counter, the legacy-overflow chip and the inline refusal beside inline creation. */
.scrum-counter { margin-left: 6px; font-weight: 400; font-size: 11px; font-family: var(--fontStack-monospace, ui-monospace, monospace); color: var(--fgColor-muted, #59636e); white-space: nowrap; }
.scrum-counter.is-warn { color: var(--fgColor-attention, #9a6700); }
.scrum-counter.is-over { color: var(--fgColor-danger, #d1242f); font-weight: 600; }
.scrum-chip.st-overflow {
  cursor: default; flex: none;
  color: var(--fgColor-attention, #9a6700); background: var(--bgColor-attention-muted, #fff8c5);
  border-color: var(--borderColor-attention-muted, transparent);
}
.scrum-inline-error {
  font-size: 11px; color: var(--fgColor-danger, #d1242f);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 420px;
}
.scrum-chip.st-completed {
  background: var(--bgColor-success-muted, #d9f2df); color: var(--fgColor-success, #1d6b37);
  border-color: var(--borderColor-success-muted, transparent);
}
.scrum-chip.st-planned {
  background: var(--bgColor-neutral-muted, #e2e6ee); color: var(--fgColor-muted, #3c4356);
  border-color: var(--borderColor-neutral-muted, transparent);
}

/* Linked-release chips on sprint cards, issue-label style: accent pill with
   a discreet inline × to unlink that one release. */
.scrum-rel-chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10.5px; font-weight: 600;
  border-radius: var(--borderRadius-full, 999px); padding: 1px 8px;
  border: 1px solid var(--borderColor-accent-muted, transparent);
  background: var(--bgColor-accent-muted, #d8ecff); color: var(--fgColor-accent, #135a9e);
  white-space: nowrap;
}
.scrum-rel-chip-x {
  border: 0; background: none; cursor: pointer; padding: 0 1px;
  font-size: 12px; line-height: 1; color: var(--fgColor-accent, #135a9e);
  opacity: 0.55; border-radius: var(--borderRadius-full, 999px);
}
.scrum-rel-chip-x:hover { opacity: 1; background: var(--bgColor-accent-emphasis, #2f6fed); color: var(--fgColor-onEmphasis, #fff); }

/* ---- The board in the AppFrame details column (comp-55) ----
   Since v0.23 the column is the board's only seat and renders exactly what
   the retired ▦ SCRUM tab did (same head, four-column backlog, board with
   lanes) — no narrow mode. The root only fills the column's height.
   No transform / perspective / filter / backdrop-filter / will-change / contain /
   container-type on any ancestor of the (position: fixed) work item form. */
.scrum-view.is-side { display: flex; height: 100%; min-height: 0; }
/* The column can be dragged down to 300px, narrower than the head and the
   grids were drawn for: the head wraps (identical when it fits) and the
   backlog / board keep a floor — below it the body scrolls sideways instead
   of crushing the Item column to 0px (dogfood at 420: 760 leaves the Item
   cell 320px, enough for a task row's indent + icon + kind + id + title). */
.is-side .scrum-head { flex-wrap: wrap; row-gap: 6px; }
.is-side .scrum-section-head { flex-wrap: wrap; }
.is-side .scrum-bl { min-width: 760px; }
.is-side .scrum-board { min-width: 620px; }

/* ---- The «▦ SCRUM» capsule in the session header (comp-55 R6b) ----
   Lives outside the panel's Primer wrapper: shell tokens only, the geometry of
   the «Session log» capsule beside it. */
.scrum-capsule {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  height: 32px; padding: 6px 12px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 18px;
  background: transparent; color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family, inherit); font-size: 13px; font-weight: 400; line-height: 20px;
  cursor: pointer; white-space: nowrap;
}
.scrum-capsule:hover, .scrum-capsule.is-on { background: var(--dsw-alias-interactive-bg-hover); }
`
