/**
 * Global stylesheet of the SCRUM board (class-prefixed `scrum-`). Injected by
 * apply as an effect; the disposer removes the tag with the plugin.
 * @module @scrum-harness/ui/client/styles
 */

/** The whole board stylesheet. */
export const SCRUM_CSS = `
.scrum-fab {
  display: flex; align-items: center; gap: 8px;
  width: 100%; border: none; background: transparent; cursor: pointer;
  padding: 8px 10px; border-radius: 8px; font-size: 13px; color: inherit;
}
.scrum-fab:hover { background: rgba(125, 125, 140, 0.15); }
.scrum-fab .scrum-fab-glyph { font-size: 15px; line-height: 1; }

.scrum-overlay {
  position: fixed; inset: 0; z-index: 900;
  background: rgba(15, 16, 20, 0.55);
  display: flex; align-items: center; justify-content: center;
}
.scrum-panel {
  width: min(1180px, 94vw); height: min(780px, 92vh);
  background: #f6f7f9; color: #1d1f24; border-radius: 14px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.35);
  display: flex; flex-direction: column; overflow: hidden;
  font-size: 13px;
}
.scrum-head {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 18px; background: #23262e; color: #f2f3f5;
}
.scrum-head h1 { font-size: 15px; margin: 0; font-weight: 600; }
.scrum-head .scrum-ws {
  background: rgba(255,255,255,0.14); border-radius: 999px;
  padding: 2px 10px; font-size: 12px; white-space: nowrap;
  max-width: 220px; overflow: hidden; text-overflow: ellipsis;
}
.scrum-head .scrum-sub { opacity: 0.65; font-size: 12px; }
.scrum-head .scrum-spacer { flex: 1; }
.scrum-tabs { display: flex; gap: 4px; }
.scrum-tab {
  border: none; background: transparent; color: inherit; cursor: pointer;
  padding: 6px 12px; border-radius: 7px; font-size: 13px; opacity: 0.75;
}
.scrum-tab:hover { background: rgba(255,255,255,0.12); opacity: 1; }
.scrum-tab.is-active { background: rgba(255,255,255,0.18); opacity: 1; font-weight: 600; }
.scrum-close {
  border: none; background: transparent; color: inherit; cursor: pointer;
  font-size: 18px; line-height: 1; padding: 4px 8px; border-radius: 6px; opacity: 0.8;
}
.scrum-close:hover { background: rgba(255,255,255,0.15); opacity: 1; }
.scrum-close.dark { font-size: 14px; color: #3f4657; }
.scrum-close.dark:hover { background: rgba(20, 24, 40, 0.08); }

.scrum-body { flex: 1; overflow: auto; padding: 0 18px 16px; }
.scrum-error {
  margin: 0 18px; margin-top: 10px; padding: 8px 12px; border-radius: 8px;
  background: #fbe3e4; color: #8f1f26; font-size: 12.5px;
}
.scrum-busy { opacity: 0.55; pointer-events: none; }

.scrum-id {
  font-family: ui-monospace, monospace; font-size: 11px; color: #6b7280;
  background: rgba(105, 115, 135, 0.12); border-radius: 5px; padding: 1px 6px;
}
.scrum-pts {
  font-size: 11px; color: #5a6172; background: #eceef4; border-radius: 5px; padding: 1px 6px;
  white-space: nowrap;
}
.scrum-muted { color: #6b7280; font-size: 12px; }
.scrum-empty { color: #6b7280; padding: 26px; text-align: center; }
.scrum-section-head {
  display: flex; align-items: center; gap: 10px; margin: 12px 0;
}
.scrum-section-head h2 { font-size: 14px; margin: 0; }

.scrum-btn {
  border: 1px solid #c9cedb; background: #fff; color: #333a49; cursor: pointer;
  border-radius: 7px; padding: 3px 9px; font-size: 12px; white-space: nowrap;
}
.scrum-btn:hover { background: #eef1f6; }
.scrum-btn.primary { background: #2f6fed; border-color: #2f6fed; color: #fff; }
.scrum-btn.primary:hover { background: #245cd0; }
.scrum-btn.danger { color: #a12832; border-color: #dcb3b7; }
.scrum-btn.danger:hover { background: #f9e9ea; }
.scrum-btn.ghost { border-color: transparent; background: transparent; }
.scrum-btn.ghost:hover { background: rgba(70, 90, 140, 0.1); }

.scrum-form {
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  margin: 6px 0; padding: 8px 10px; border-radius: 9px;
  background: #eef1f6; border: 1px solid #dde1ea;
}
.scrum-form input, .scrum-form textarea, .scrum-form select {
  border: 1px solid #c6ccda; border-radius: 6px; padding: 4px 8px;
  font-size: 12.5px; background: #fff; color: #1d1f24; font-family: inherit;
}
.scrum-form input:focus, .scrum-form textarea:focus { outline: 2px solid #9db9f2; }
.scrum-form textarea { width: 100%; min-height: 56px; resize: vertical; }
.scrum-form .grow { flex: 1; min-width: 160px; }

/* ---- Shared visual vocabulary: type icons and state dots ---- */
.scrum-kind-icon {
  width: 17px; height: 17px; border-radius: 4px; flex: none;
  color: #fff; font-size: 10px; font-weight: 700; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
}
.scrum-state {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; color: #3f4657; white-space: nowrap;
}
.scrum-state-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.scrum-dash { color: #b3b9c7; }

/* ---- Backlog: Azure DevOps-style hierarchical grid ---- */
.scrum-bl { background: #fff; border: 1px solid #e2e5ec; border-radius: 10px; }
.scrum-bl-row {
  display: grid; grid-template-columns: minmax(0, 1fr) 140px 130px 150px;
  align-items: center; min-height: 34px; border-bottom: 1px solid #eef0f4;
}
.scrum-bl-row:last-child { border-bottom: none; }
.scrum-bl-row:not(.scrum-bl-head):hover { background: #f4f7fd; }
.scrum-bl-row.is-selected { background: #e9f1fe; box-shadow: inset 3px 0 0 #2f6fed; }
.scrum-bl-head {
  position: sticky; top: 0; z-index: 6;
  background: #eef0f5; border-radius: 10px 10px 0 0;
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
  color: #59606f; min-height: 30px;
}
.scrum-bl-head .scrum-bl-item { padding-left: 10px; }
.scrum-bl-item {
  display: flex; align-items: center; gap: 7px; min-width: 0; padding-right: 10px;
}
.scrum-bl-cell { display: flex; align-items: center; gap: 5px; padding-right: 10px; min-width: 0; }
.scrum-bl-title {
  border: none; background: transparent; cursor: pointer; padding: 0;
  font: inherit; color: inherit; text-align: left; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 0 1 auto;
}
.scrum-bl-title:hover { color: #2f6fed; text-decoration: underline; }
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
  color: #59606f; font-size: 11px; border-radius: 4px; padding: 0;
}
button.scrum-chev:hover { background: rgba(70, 90, 140, 0.12); }

.scrum-rollup { display: inline-flex; align-items: center; gap: 7px; min-width: 0; }
.scrum-rollup-bar {
  width: 54px; height: 6px; border-radius: 999px; background: #e5e8f0;
  overflow: hidden; flex: none;
}
.scrum-rollup-bar > span { display: block; height: 100%; background: #2da44e; }
.scrum-rollup-txt { font-size: 11px; color: #5a6172; white-space: nowrap; }

.scrum-bl-add .scrum-bl-item { padding-top: 2px; padding-bottom: 2px; }
.scrum-bl-add-btn {
  border: none; background: transparent; cursor: pointer;
  color: #6b7280; font-size: 12.5px; padding: 3px 6px; border-radius: 6px;
}
.scrum-bl-add-btn:hover { color: #2f6fed; background: rgba(47, 111, 237, 0.08); }
.scrum-bl-add-input, .scrum-bl-add-extra {
  border: 1px solid #c6ccda; border-radius: 6px; padding: 3px 8px;
  font-size: 12.5px; background: #fff; color: #1d1f24; font-family: inherit;
}
.scrum-bl-add-input { flex: 1; min-width: 120px; }
.scrum-bl-add-input:focus, .scrum-bl-add-extra:focus { outline: 2px solid #9db9f2; }
.scrum-bl-add-extra { width: 150px; }

.scrum-menu-wrap { position: relative; display: inline-flex; }
.scrum-menu-backdrop { position: fixed; inset: 0; z-index: 20; }
.scrum-menu {
  position: absolute; right: 0; top: calc(100% + 2px); z-index: 21;
  background: #fff; border: 1px solid #d8dce6; border-radius: 9px;
  box-shadow: 0 10px 28px rgba(15, 20, 40, 0.18);
  min-width: 195px; padding: 4px; display: flex; flex-direction: column;
}
.scrum-menu-item {
  border: none; background: transparent; cursor: pointer; text-align: left;
  padding: 7px 10px; border-radius: 6px; font-size: 12.5px; color: #2a3040;
  white-space: nowrap;
}
.scrum-menu-item:hover { background: #eef1f6; }
.scrum-menu-item.danger { color: #a12832; }
.scrum-menu-item.danger:hover { background: #f9e9ea; }

/* ---- Work item form (Azure-style modal dialog) ---- */
.scrum-wi-overlay {
  position: fixed; inset: 0; z-index: 940;
  background: rgba(15, 16, 20, 0.45);
  display: flex; align-items: center; justify-content: center;
}
.scrum-wi {
  width: min(660px, 92vw); max-height: min(640px, 86vh); overflow: auto;
  background: #fff; color: #1d1f24; border-radius: 12px;
  border: 1px solid #e2e5ec; box-shadow: 0 24px 64px rgba(0,0,0,0.35);
  padding: 14px 18px 16px; font-size: 13px;
}
.scrum-wi-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; align-items: start;
}
.scrum-details-head { display: flex; align-items: center; gap: 8px; }
.scrum-details-kind { font-weight: 700; font-size: 13px; }
.scrum-details-crumb { color: #8a90a0; font-size: 11.5px; margin-top: 4px; }
.scrum-field { display: flex; flex-direction: column; gap: 4px; margin: 10px 0 0; font-size: 12px; color: #4b5265; }
.scrum-field input, .scrum-field textarea, .scrum-field select {
  border: 1px solid #c6ccda; border-radius: 6px; padding: 5px 8px;
  font-size: 12.5px; background: #fff; color: #1d1f24; font-family: inherit;
}
.scrum-field input:focus, .scrum-field textarea:focus { outline: 2px solid #9db9f2; }
.scrum-field textarea { resize: vertical; }
.scrum-details-meta { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.scrum-details-foot { display: flex; justify-content: flex-end; gap: 6px; margin-top: 14px; }

/* ---- Shelf rows (Archive / Trash) ---- */
.scrum-node { margin: 2px 0; }
.scrum-row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 8px; border-radius: 8px;
}
.scrum-row:hover { background: rgba(70, 90, 140, 0.08); }
.scrum-row .scrum-title { font-weight: 500; }
.scrum-row .scrum-actions { margin-left: auto; display: flex; gap: 4px; visibility: hidden; }
.scrum-row:hover .scrum-actions { visibility: visible; }

/* ---- Sprint charts (SVG) ---- */
.scrum-chart {
  background: #fff; border: 1px solid #e2e5ec; border-radius: 11px;
  padding: 10px 14px 6px; margin: 10px 0;
}
.scrum-chart-title { font-weight: 700; font-size: 12.5px; margin-bottom: 6px; }
.scrum-chart svg { display: block; }

/* ---- Kanban board ---- */
.scrum-board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; align-items: start; }
.scrum-col.slim { min-height: 90px; }
.scrum-col.heads-only { min-height: 0; padding: 6px 10px; }
.scrum-col.heads-only .scrum-col-head { margin-bottom: 0; }
.scrum-lane { margin-top: 10px; }
.scrum-lane-head {
  display: flex; align-items: center; gap: 10px;
  padding: 5px 4px; margin-bottom: 6px;
  border-bottom: 2px solid #dde1ea;
}
.scrum-lane-head .scrum-lane-title { font-weight: 700; font-size: 12.5px; color: #3f4657; }
.scrum-btn.ghost.is-on { background: rgba(47, 111, 237, 0.12); color: #2f6fed; }
.scrum-count.editable { cursor: pointer; border: none; font: inherit; }
.scrum-count.editable:hover { filter: brightness(0.92); }
.scrum-count.over { background: #f8d7da; color: #8f1f26; font-weight: 700; }
.scrum-wip-input {
  width: 52px; border: 1px solid #9db9f2; border-radius: 999px;
  font-size: 11px; padding: 0 8px; background: #fff; color: #1d1f24;
}
.scrum-pivot {
  display: inline-flex; gap: 2px; background: #e5e8f0;
  border-radius: 8px; padding: 2px;
}
.scrum-pivot-btn {
  border: none; background: transparent; cursor: pointer;
  padding: 4px 12px; border-radius: 7px; font-size: 12px; color: #4b5265;
}
.scrum-pivot-btn:hover { background: rgba(255,255,255,0.7); }
.scrum-pivot-btn.is-active { background: #fff; color: #1d1f24; font-weight: 600; box-shadow: 0 1px 2px rgba(20,24,40,0.15); }
.scrum-col {
  background: #eceef4; border-radius: 11px; padding: 10px; min-height: 260px;
}
.scrum-col.drag-over { outline: 2px dashed #2f6fed; outline-offset: -2px; }
.scrum-col-head {
  display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 12px;
  color: #454c5e; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px;
}
.scrum-col-head .scrum-count {
  background: #d9dde8; border-radius: 999px; padding: 0 8px; font-size: 11px;
}
.scrum-card {
  background: #fff; border-radius: 9px; padding: 8px 10px; margin-bottom: 8px;
  box-shadow: 0 1px 2px rgba(20, 24, 40, 0.12); cursor: grab; user-select: none;
}
.scrum-card:active { cursor: grabbing; }
.scrum-card .scrum-card-title {
  display: block; border: none; background: transparent; cursor: pointer;
  padding: 0; font: inherit; color: inherit; text-align: left;
  font-weight: 600; margin-bottom: 4px;
}
.scrum-card .scrum-card-title:hover { color: #2f6fed; text-decoration: underline; }
.scrum-card .scrum-card-meta {
  display: flex; gap: 6px; align-items: center; font-size: 11px; color: #6b7280;
}
.scrum-card .scrum-card-crumb { font-size: 11px; color: #8a90a0; margin-bottom: 4px; }

/* ---- Sprints ---- */
.scrum-sprint {
  background: #fff; border: 1px solid #e0e3eb; border-radius: 11px;
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
.scrum-progress {
  height: 7px; border-radius: 999px; background: #e5e8f0; overflow: hidden; margin: 8px 0;
}
.scrum-progress > div { height: 100%; background: #2f6fed; }
.scrum-cer { border-top: 1px dashed #e0e3eb; margin-top: 8px; padding-top: 8px; }
.scrum-cer-note { margin: 2px 0 2px 14px; font-size: 12.5px; }
.scrum-cer-cat {
  font-size: 10.5px; background: #eceef4; border-radius: 5px; padding: 1px 6px;
  color: #4b5265; margin-right: 6px; text-transform: none;
}

.scrum-chip {
  border: none; cursor: pointer; font-size: 10.5px;
  border-radius: 999px; padding: 1px 8px;
  background: #e2e6ee; color: #3c4356; font-family: ui-monospace, monospace;
  white-space: nowrap;
}
.scrum-chip:hover { filter: brightness(0.93); }
.scrum-chip.st-active { background: #d8ecff; color: #135a9e; }
.scrum-chip.st-completed { background: #d9f2df; color: #1d6b37; }
.scrum-chip.st-planned { background: #e2e6ee; color: #3c4356; }
`
