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

.scrum-body { flex: 1; overflow: auto; padding: 16px 18px; }
.scrum-error {
  margin: 0 18px; margin-top: 10px; padding: 8px 12px; border-radius: 8px;
  background: #fbe3e4; color: #8f1f26; font-size: 12.5px;
}
.scrum-busy { opacity: 0.55; pointer-events: none; }

.scrum-node { margin: 2px 0; }
.scrum-row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 8px; border-radius: 8px;
}
.scrum-row:hover { background: rgba(70, 90, 140, 0.08); }
.scrum-row .scrum-id {
  font-family: ui-monospace, monospace; font-size: 11px; color: #6b7280;
  background: rgba(105, 115, 135, 0.12); border-radius: 5px; padding: 1px 6px;
}
.scrum-row .scrum-title { font-weight: 500; }
.scrum-row.lvl-release > .scrum-title { font-size: 14.5px; font-weight: 700; }
.scrum-row.lvl-feature > .scrum-title { font-size: 13.5px; font-weight: 600; }
.scrum-row .scrum-badge {
  font-size: 10.5px; border-radius: 999px; padding: 1px 8px;
  background: #e2e6ee; color: #3c4356; text-transform: uppercase; letter-spacing: 0.03em;
}
.scrum-badge.st-active, .scrum-badge.st-in_progress { background: #d8ecff; color: #135a9e; }
.scrum-badge.st-done, .scrum-badge.st-released, .scrum-badge.st-committed { background: #d9f2df; color: #1d6b37; }
.scrum-badge.st-review { background: #f4e8cf; color: #7a5b12; }
.scrum-row .scrum-pts {
  font-size: 11px; color: #5a6172; background: #eceef4; border-radius: 5px; padding: 1px 6px;
}
.scrum-row .scrum-actions { margin-left: auto; display: flex; gap: 4px; visibility: hidden; }
.scrum-row:hover .scrum-actions { visibility: visible; }
.scrum-children { margin-left: 22px; border-left: 1px solid #e2e5ec; padding-left: 10px; }

.scrum-btn {
  border: 1px solid #c9cedb; background: #fff; color: #333a49; cursor: pointer;
  border-radius: 7px; padding: 3px 9px; font-size: 12px;
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
  margin: 6px 0 6px 30px; padding: 8px 10px; border-radius: 9px;
  background: #eef1f6; border: 1px solid #dde1ea;
}
.scrum-form input, .scrum-form textarea, .scrum-form select {
  border: 1px solid #c6ccda; border-radius: 6px; padding: 4px 8px;
  font-size: 12.5px; background: #fff; color: #1d1f24; font-family: inherit;
}
.scrum-form input:focus, .scrum-form textarea:focus { outline: 2px solid #9db9f2; }
.scrum-form textarea { width: 100%; min-height: 56px; resize: vertical; }
.scrum-form .grow { flex: 1; min-width: 160px; }

.scrum-empty { color: #6b7280; padding: 26px; text-align: center; }
.scrum-section-head {
  display: flex; align-items: center; gap: 10px; margin: 4px 0 12px;
}
.scrum-section-head h2 { font-size: 14px; margin: 0; }

.scrum-board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; align-items: start; }
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
.scrum-card .scrum-card-title { font-weight: 600; margin-bottom: 4px; }
.scrum-card .scrum-card-meta {
  display: flex; gap: 6px; align-items: center; font-size: 11px; color: #6b7280;
}
.scrum-card .scrum-card-crumb { font-size: 11px; color: #8a90a0; margin-bottom: 4px; }

.scrum-sprint {
  background: #fff; border: 1px solid #e0e3eb; border-radius: 11px;
  padding: 12px 14px; margin-bottom: 12px;
}
.scrum-sprint-head { display: flex; align-items: center; gap: 10px; }
.scrum-sprint-head .scrum-goal { font-weight: 700; font-size: 13.5px; }
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
.scrum-muted { color: #6b7280; font-size: 12px; }

.scrum-chip {
  border: none; cursor: pointer; font-size: 10.5px;
  border-radius: 999px; padding: 1px 8px;
  background: #e2e6ee; color: #3c4356; font-family: ui-monospace, monospace;
}
.scrum-chip:hover { filter: brightness(0.93); }
.scrum-chip.st-active { background: #d8ecff; color: #135a9e; }
.scrum-chip.st-completed { background: #d9f2df; color: #1d6b37; }
`
