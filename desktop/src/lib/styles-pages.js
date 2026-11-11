// Shared CSS for the secondary pages (orders, inventory, production, delivery, finance, team,
// approvals, setup). Builds on the base kit in styles.js: same fs- prefix, same container
// breakpoints (compact < 600, medium 600-959, wide >= 960). Dialog rules (.fs-dlg-*) use plain
// @media because dialogs render in a portal outside the .fs-root container.
import { h } from './h.js'

export const PAGES_CSS = `
/* ---- page head + toolbar ---- */
.fs-ph{display:flex;align-items:flex-end;justify-content:space-between;gap:8px 14px;flex-wrap:wrap;margin-bottom:14px;min-width:0}
.fs-ph-t{margin:0;font-size:15px;font-weight:600;line-height:1.3;color:var(--fs-t1)}
.fs-ph-s{font-size:12px;line-height:1.45;color:var(--fs-t3)}
.fs-ph-r{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.fs-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;min-width:0}
.fs-bar>.fs-grow{flex:1 1 220px;min-width:0;max-width:340px}
.fs-bar>.fs-fill{flex:1 1 0;min-width:0}
.fs-seg{max-width:100%;overflow-x:auto;scrollbar-width:none}
.fs-seg::-webkit-scrollbar{display:none}
.fs-only-narrow{display:none!important}
.fs-page{min-width:0}
.fs-page .fs-kpis{margin-bottom:12px}
.fs-page-stack{display:flex;flex-direction:column;gap:14px;min-width:0}
.fs-minis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:var(--fs-gap)}
.fs-minis .fs-kpi{background:transparent}
.fs-kpis3{grid-template-columns:repeat(3,minmax(0,1fr))}
@container fs (max-width: 959px){.fs-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
.fs-note{font-size:11px;line-height:1.45;color:var(--fs-t3)}
.fs-hr{border-top:1px solid var(--fs-line)}
.fs-callout{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--fs-line);border-radius:12px;background:var(--fs-card);font-size:12.5px;line-height:1.45;color:var(--fs-t2);min-width:0}
.fs-callout-ic{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--hue) 18%,transparent);color:var(--hue)}

/* ---- key/value rows that wrap instead of overflowing ---- */
.fs-kv{display:flex;align-items:baseline;justify-content:space-between;gap:12px;min-width:0;font-size:12px;line-height:1.45}
.fs-kv>span:first-child{color:var(--fs-t3);flex:none}
.fs-kv>span:last-child{color:var(--fs-t1);text-align:right;min-width:0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}

/* ---- master / detail ---- */
.fs-md{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
.fs-md-main,.fs-md-side{min-width:0}
.fs-md-side{position:sticky;top:0;max-height:calc(100vh - 160px)}
@container fs (min-width: 960px){
  .fs-md[data-open=true]{grid-template-columns:minmax(0,1fr) minmax(340px,420px)}
  .fs-md-side{overflow-y:auto;padding-right:2px}
}
@container fs (max-width: 959px){
  .fs-md[data-open=true] .fs-md-main{display:none}
  .fs-md-side{position:static;max-height:none}
  .fs-only-narrow{display:inline-flex!important}
}

/* ---- table <-> row-card switch ---- */
.fs-conly{display:none}
@container fs (max-width: 859px){.fs-tonly{display:none!important}.fs-conly{display:grid!important}}
.fs-md[data-open=true] .fs-tonly{display:none!important}
.fs-md[data-open=true] .fs-conly{display:grid!important}
.fs-rows{grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:8px}
.fs-md[data-open=true] .fs-rows{grid-template-columns:minmax(0,1fr)}
.fs-rowcard{all:unset;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;min-width:0;padding:10px 12px;border:1px solid var(--fs-line);border-radius:12px;background:var(--fs-card);color:var(--fs-t1);cursor:pointer;
  transition:background var(--fs-dur-1) var(--fs-ease),transform var(--fs-dur-1) var(--fs-ease),border-color var(--fs-dur-1) var(--fs-ease)}
div.fs-rowcard{cursor:default}
button.fs-rowcard:hover{background:var(--fs-card-hi);transform:translateY(-1px)}
button.fs-rowcard:active{transform:none}
.fs-rowcard:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}
.fs-rowcard[aria-current=true]{border-color:var(--fs-rose);background:var(--fs-rose-soft)}
.fs-rowcard[data-late=true]{border-color:color-mix(in srgb,var(--fs-bad) 60%,var(--fs-line))}
.fs-rc-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;min-width:0}
.fs-rc-bot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.fs-rc-bot .fs-spacer{flex:1}
.fs-trow{all:unset;box-sizing:border-box;display:grid;grid-template-columns:84px minmax(0,1.4fr) minmax(0,150px) minmax(0,120px) minmax(0,110px) minmax(0,100px);gap:10px;align-items:center;width:100%;padding:8px;border-top:1px solid var(--fs-line);cursor:pointer;color:var(--fs-t1);
  transition:background var(--fs-dur-1) var(--fs-ease)}
.fs-trow:hover{background:var(--fs-card)}
.fs-trow:focus-visible{outline:2px solid var(--ui-accent);outline-offset:-2px}
.fs-trow[aria-current=true]{background:var(--fs-rose-soft);box-shadow:inset 3px 0 0 var(--fs-rose)}
.fs-thead{display:grid;grid-template-columns:84px minmax(0,1.4fr) minmax(0,150px) minmax(0,120px) minmax(0,110px) minmax(0,100px);gap:10px;padding:4px 8px}
.fs-ptable{width:100%;border-collapse:collapse}
.fs-ptable tbody tr{transition:background var(--fs-dur-1) var(--fs-ease)}
.fs-ptable tbody tr:hover{background:var(--fs-card)}
.fs-ptable tbody tr[data-active=true]{background:var(--fs-rose-soft)}

/* ---- stock ---- */
.fs-stockbar{width:96px}
.fs-stockbar .fs-meter{height:6px}
.fs-ghostbtn{all:unset;box-sizing:border-box;cursor:pointer;color:var(--fs-t1);font-weight:550;font-size:12.5px;line-height:1.35;min-width:0;overflow-wrap:anywhere}
.fs-ghostbtn:hover{text-decoration:underline;text-underline-offset:3px}
.fs-ghostbtn:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px;border-radius:4px}

/* ---- production board ---- */
.fs-board{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;align-items:start}
@container fs (max-width: 1099px){.fs-board{grid-template-columns:repeat(3,minmax(0,1fr))}}
@container fs (max-width: 759px){.fs-board{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container fs (max-width: 599px){.fs-board{grid-template-columns:minmax(0,1fr)}}
.fs-col{display:flex;flex-direction:column;gap:8px;min-width:0;padding:8px;border-radius:12px;border:1px solid var(--fs-line);border-top:3px solid var(--hue);background:color-mix(in srgb,var(--hue) 5%,transparent)}
.fs-col-h{display:flex;align-items:center;gap:8px;min-width:0}
.fs-col-h .fs-section{flex:1;min-width:0}
.fs-col-ic{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--hue) 22%,transparent);color:var(--hue)}
.fs-col-n{min-width:20px;height:20px;padding:0 6px;border-radius:999px;display:inline-grid;place-items:center;font-size:11px;font-weight:650;background:color-mix(in srgb,var(--hue) 20%,transparent);color:var(--fs-t1);font-variant-numeric:tabular-nums}
.fs-col-empty{font-size:11px;color:var(--fs-t4);border:1px dashed var(--fs-line);border-radius:10px;padding:10px;text-align:center}
.fs-task{display:flex;flex-direction:column;gap:5px;min-width:0;padding:10px;border:1px solid var(--fs-line);border-left:3px solid var(--hue,var(--fs-line));border-radius:10px;background:var(--fs-card)}
.fs-task[data-late=true]{border-color:var(--fs-bad);border-left-color:var(--fs-bad)}
.fs-task[data-blocked=true]{border-color:var(--fs-warn);border-left-color:var(--fs-warn)}
.fs-task-h{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.fs-task-mats{margin:0;padding:0 0 0 14px;font-size:11px;color:var(--fs-t2);overflow-wrap:anywhere}
.fs-blocked{display:flex;flex-direction:column;gap:8px;border:1px solid var(--fs-warn);border-radius:12px;padding:10px;background:color-mix(in srgb,var(--fs-warn) 6%,transparent)}
.fs-blocked-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:8px}

/* ---- delivery ---- */
.fs-daynav{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.fs-daynav input{width:150px}
.fs-dl{display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:6px 14px;align-items:center;padding:12px 14px;border:1px solid var(--fs-line);border-radius:12px;background:var(--fs-card);min-width:0}
.fs-dl[data-late=true]{border-color:var(--fs-bad)}
.fs-dl-time{display:flex;flex-direction:column;align-items:flex-start;gap:4px;font-size:16px;font-weight:650;font-variant-numeric:tabular-nums}
.fs-dl-time i{font-style:normal;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:color-mix(in srgb,var(--hue) 22%,transparent);color:var(--hue)}
.fs-dl-main{display:flex;flex-direction:column;gap:2px;min-width:0;overflow-wrap:anywhere}
.fs-dl-act{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.fs-dl-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,480px),1fr));gap:10px;align-items:stretch}
@container fs (max-width: 599px){
  .fs-dl{grid-template-columns:minmax(0,1fr);padding:12px}
  .fs-dl-time{flex-direction:row;align-items:center;gap:8px}
  .fs-dl-act{justify-content:flex-start}
  .fs-daynav{width:100%}
  .fs-daynav input{flex:1;width:auto;min-width:0}
}

/* ---- finance bars ---- */
.fs-legend{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:11px;color:var(--fs-t3)}
.fs-legend span{display:inline-flex;align-items:center;gap:5px}
.fs-legend i{width:8px;height:8px;border-radius:2px;display:inline-block}
.fs-days{display:flex;align-items:flex-end;gap:10px;height:150px;overflow-x:auto;padding-bottom:2px}
.fs-day{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;flex:1 0 44px}
.fs-day-bars{display:flex;align-items:flex-end;gap:2px;height:124px}
.fs-day-bars i{display:block;width:10px;border-radius:3px 3px 0 0;transform-origin:bottom}
.fs-anim .fs-day-bars i{animation:fs-bar var(--fs-dur-4) var(--fs-ease) both}
@keyframes fs-bar{from{transform:scaleY(0)}to{transform:none}}
.fs-cat{display:flex;flex-direction:column;gap:3px}
.fs-cat-h{display:flex;justify-content:space-between;gap:8px;font-size:12px}

/* ---- team ---- */
.fs-dept-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px;align-items:start}
.fs-dept-ic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--hue) 22%,transparent);color:var(--hue)}
.fs-ask{all:unset;box-sizing:border-box;display:block;width:100%;text-align:left;cursor:pointer;padding:7px 10px;border-radius:8px;background:var(--ui-bg-tertiary);color:var(--fs-t2);font-size:12px;line-height:1.4;
  transition:background var(--fs-dur-1) var(--fs-ease),transform var(--fs-dur-1) var(--fs-ease)}
.fs-ask:hover{background:var(--fs-card-hi);transform:translateY(-1px)}
.fs-ask:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}
.fs-act{display:grid;grid-template-columns:10px minmax(0,1fr) auto auto;gap:8px;align-items:baseline;padding:7px 0;border-top:1px solid var(--fs-line)}
.fs-act:first-child{border-top:0}
@container fs (max-width: 599px){.fs-act{grid-template-columns:10px minmax(0,1fr) auto}.fs-act>:nth-child(3){grid-column:2;justify-self:start}}

/* ---- approvals ---- */
.fs-ap-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:10px;align-items:start}
.fs-ap{display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px 14px;border:1px solid var(--fs-line);border-radius:12px;background:var(--fs-card)}
.fs-ap[data-state=PENDING]{border-left:3px solid var(--fs-warn)}
.fs-ap[data-state=APPROVED]{border-left:3px solid var(--fs-ok)}
.fs-ap[data-state=REJECTED],.fs-ap[data-state=FAILED]{border-left:3px solid var(--fs-bad)}
.fs-ap.fs-ap-compact{padding:8px 0;border:0;border-top:1px solid var(--fs-line);border-radius:0;background:none}
.fs-ap-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;min-width:0}
.fs-ap-sum{font-size:12.5px;font-weight:550;line-height:1.4;overflow-wrap:anywhere;min-width:0}
.fs-ap-meta{font-size:11px;line-height:1.45;color:var(--fs-t3);overflow-wrap:anywhere}
.fs-ap-btns{display:flex;gap:8px;flex-wrap:wrap}
.fs-pay{display:flex;flex-direction:column;gap:2px;background:var(--ui-bg-tertiary);border-radius:8px;padding:8px 10px}
.fs-pay>div{display:flex;justify-content:space-between;gap:10px;font-size:11px;min-width:0}
.fs-pay>div>span:first-child{color:var(--fs-t3);flex:none}
.fs-pay>div>span:last-child{color:var(--fs-t2);text-align:right;min-width:0;overflow-wrap:anywhere}

/* ---- setup ---- */
.fs-setup{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
.fs-steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:6px}
.fs-step{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;min-height:var(--fs-hit);padding:8px 10px;border-radius:10px;border:1px solid var(--fs-line);background:var(--fs-card);cursor:pointer;color:var(--fs-t1);min-width:0;
  transition:background var(--fs-dur-1) var(--fs-ease),border-color var(--fs-dur-1) var(--fs-ease)}
.fs-step:hover{background:var(--fs-card-hi)}
.fs-step:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}
.fs-step[aria-current=step]{border-color:var(--fs-rose);background:var(--fs-rose-soft)}
.fs-step-t{display:flex;flex-direction:column;gap:2px;min-width:0}
button.fs-kpi.fs-click{all:unset;box-sizing:border-box;display:flex;flex-direction:column;gap:4px;padding:12px 14px;border:1px solid var(--fs-line);border-radius:12px;background:var(--fs-card);min-width:0;text-align:left;color:inherit;cursor:pointer}
.fs-step-ic{width:22px;height:22px;border-radius:999px;display:grid;place-items:center;flex:none;font-size:11px;font-weight:700;background:var(--ui-bg-tertiary);color:var(--fs-t2)}
.fs-step[data-done=true] .fs-step-ic{background:color-mix(in srgb,var(--fs-ok) 20%,transparent);color:var(--fs-ok)}
.fs-setup-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--fs-line);border-radius:10px;padding:8px 12px;min-width:0}
.fs-btnrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.fs-intro{display:flex;flex-direction:column;gap:4px}
.fs-intro-r{display:grid;grid-template-columns:88px minmax(0,1fr);gap:4px 10px;align-items:baseline;font-size:12px;line-height:1.45}
.fs-intro-n{font-weight:600;color:var(--fs-t1)}
@container fs (min-width: 960px){
  .fs-setup{grid-template-columns:250px minmax(0,1fr)}
  .fs-steps{grid-template-columns:minmax(0,1fr)}
}

/* ---- entering rows ---- */
.fs-anim .fs-rowcard.fs-enter,.fs-anim .fs-task.fs-enter,.fs-anim .fs-dl.fs-enter,.fs-anim .fs-ap.fs-enter{animation-name:fs-up}

/* ---- touch ---- */
@media (pointer: coarse){
  .fs-page button,.fs-page select,.fs-page input,.fs-page textarea{min-height:var(--fs-hit)}
  .fs-rowcard,.fs-task{min-height:var(--fs-hit)}
}

/* ---- dialogs (portal): viewport media queries ---- */
.fs-dlg-lines{display:flex;flex-direction:column;gap:6px;min-width:0}
.fs-dlg-line{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1.4fr) 64px 130px 28px;gap:6px;align-items:center;min-width:0}
@media (max-width: 640px){
  .fs-dlg-line{grid-template-columns:minmax(0,1fr) 64px 28px;grid-template-areas:"a a x" "b b b" "q p p"}
  .fs-dlg-line>:nth-child(1){grid-area:a}
  .fs-dlg-line>:nth-child(2){grid-area:b}
  .fs-dlg-line>:nth-child(3){grid-area:q}
  .fs-dlg-line>:nth-child(4){grid-area:p}
  .fs-dlg-line>:nth-child(5){grid-area:x}
  .fs-dlg-line{padding-bottom:8px;border-bottom:1px solid var(--ui-stroke-secondary)}
}
.fs-twrap{overflow-x:auto;min-width:0;max-width:100%}
`

export function FsPageStyles() {
  return h('style', { 'data-fs-page-styles': '1' }, PAGES_CSS)
}
