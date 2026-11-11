// The one Flower Shop stylesheet (design kit sections 3, 4, 6, 7). Injected once by the page
// shell and by transcript cards via <FsStyles/>. Every class is prefixed `fs-` so nothing
// leaks into the host. Layout is driven by CONTAINER queries on .fs-root, so a narrow Hermes
// pane on a wide window gets the compact layout too.
import { h } from './h.js'

export const CSS = `
.fs-root{container-type:inline-size;container-name:fs;--fs-rose:#E07A93;--fs-rose-soft:color-mix(in srgb,#E07A93 16%,transparent);--fs-leaf:#6FB07A;--fs-kraft:#D8B98D;
  --fs-card:color-mix(in srgb,var(--ui-bg-tertiary) 35%,transparent);--fs-card-hi:color-mix(in srgb,var(--ui-bg-tertiary) 60%,transparent);
  --fs-line:var(--ui-stroke-secondary);--fs-t1:var(--ui-text-primary);--fs-t2:var(--ui-text-secondary);--fs-t3:var(--ui-text-tertiary);--fs-t4:var(--ui-text-quaternary);
  --fs-ok:var(--ui-green);--fs-warn:var(--ui-yellow);--fs-bad:var(--ui-red);
  --fs-dur-1:120ms;--fs-dur-2:220ms;--fs-dur-3:420ms;--fs-dur-4:900ms;--fs-ease:cubic-bezier(.2,.8,.2,1);--fs-pop:cubic-bezier(.34,1.56,.64,1);
  --fs-pad:20px;--fs-gap:12px;--fs-hit:32px;
  display:flex;flex-direction:column;height:100%;min-height:0;color:var(--fs-t1)}
.fs-root *{box-sizing:border-box}
.fs-num{font-variant-numeric:tabular-nums}
.fs-clip{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.fs-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:16px var(--fs-pad) 28px}
.fs-overline{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--fs-t3);line-height:1.2}
.fs-section{margin:0;font-size:12px;font-weight:600;color:var(--fs-t2);letter-spacing:.01em}
.fs-muted{color:var(--fs-t3)}

/* ---- header + tabs ---- */
.fs-head{display:flex;align-items:center;gap:12px;padding:8px var(--fs-pad);border-bottom:1px solid var(--fs-line);flex:none;min-width:0}
.fs-brand{display:flex;align-items:center;gap:8px;flex:none;font-weight:650;font-size:13px;white-space:nowrap}
.fs-tabs{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;min-width:0;flex:1;scroll-snap-type:x proximity;
  -webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 24px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 24px),transparent)}
.fs-tabs::-webkit-scrollbar{display:none}
.fs-tab{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;height:var(--fs-hit);padding:0 10px;border-radius:8px;font-size:12px;color:var(--fs-t3);
  cursor:pointer;white-space:nowrap;scroll-snap-align:start;position:relative;transition:color var(--fs-dur-1) var(--fs-ease),background var(--fs-dur-1) var(--fs-ease)}
.fs-tab:hover{color:var(--fs-t1);background:var(--fs-card)}
.fs-tab:focus-visible{outline:2px solid var(--ui-accent);outline-offset:-2px}
.fs-tab[aria-selected=true]{color:var(--fs-t1);background:var(--fs-card-hi)}
.fs-tab[aria-selected=true]::after{content:"";position:absolute;left:10px;right:10px;bottom:2px;height:2px;border-radius:2px;background:var(--fs-rose)}
.fs-tab-badge{min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--fs-warn);color:#1b1b1f;font-size:10px;font-weight:700;display:inline-grid;place-items:center}

/* ---- cards ---- */
.fs-card{border:1px solid var(--fs-line);border-radius:12px;background:var(--fs-card);min-width:0;display:flex;flex-direction:column}
.fs-card-h{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px 0}
.fs-card-b{padding:12px 14px 14px;min-width:0;flex:1}
.fs-click{cursor:pointer;transition:background var(--fs-dur-1) var(--fs-ease),transform var(--fs-dur-1) var(--fs-ease),border-color var(--fs-dur-1) var(--fs-ease)}
.fs-click:hover{background:var(--fs-card-hi);transform:translateY(-1px)}
.fs-click:active{transform:translateY(0)}
.fs-click:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}
button.fs-click{all:unset;box-sizing:border-box;cursor:pointer}

/* ---- grids ---- */
.fs-stack{display:flex;flex-direction:column;gap:var(--fs-gap);min-width:0}
.fs-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:var(--fs-gap);align-items:start}
.fs-grid>*{grid-column:span 12;min-width:0}
.fs-s8{grid-column:span 8!important}.fs-s7{grid-column:span 7!important}.fs-s6{grid-column:span 6!important}.fs-s5{grid-column:span 5!important}.fs-s4{grid-column:span 4!important}
.fs-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--fs-gap)}
.fs-split{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}
.fs-table-wrap{overflow-x:auto;min-width:0}

/* ---- KPI tile ---- */
.fs-kpi{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border:1px solid var(--fs-line);border-radius:12px;background:var(--fs-card);min-width:0;text-align:left;color:inherit}
.fs-kpi-v{font-size:24px;font-weight:650;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fs-kpi-sub{font-size:11px;color:var(--fs-t3);display:flex;align-items:center;gap:6px;min-width:0}

/* ---- hero ---- */
.fs-hero{display:grid;grid-template-columns:auto minmax(0,1fr);gap:22px;align-items:center;padding:18px 20px;border-radius:16px;border:1px solid var(--fs-line);
  background:radial-gradient(120% 140% at 0% 0%,color-mix(in srgb,#E07A93 14%,transparent),transparent 55%),var(--fs-card)}
.fs-hero-title{margin:0;font-size:20px;font-weight:600;line-height:1.2}
.fs-hero-story{margin:6px 0 0;font-size:14px;line-height:1.5;color:var(--fs-t2);max-width:62ch}
.fs-hero-story b{color:var(--fs-t1);font-weight:600}
.fs-hero-facts{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:14px}
.fs-fact{display:flex;flex-direction:column;gap:2px;min-width:0}
.fs-fact-v{font-size:18px;font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap}

/* ---- bloom ---- */
.fs-bloom{display:block;overflow:visible}
.fs-petal{transform-box:fill-box;transform-origin:50% 100%;cursor:pointer;transition:filter var(--fs-dur-1) var(--fs-ease)}
.fs-petal:hover,.fs-petal:focus-visible{filter:brightness(1.12) drop-shadow(0 0 4px color-mix(in srgb,#E07A93 60%,transparent));outline:none}
.fs-anim .fs-petal{animation:fs-grow var(--fs-dur-4) var(--fs-pop) both;animation-delay:calc(var(--i,0) * 70ms + 120ms)}
@keyframes fs-grow{from{transform:scale(0)}to{transform:scale(1)}}

/* ---- flow strip ---- */
.fs-flow{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));position:relative;gap:6px}
.fs-flow::before{content:"";position:absolute;left:8%;right:8%;top:21px;height:2px;border-radius:2px;background:linear-gradient(90deg,#B9A6E8,#F2B97E,#F09AAE,#8FD3AE,#93C3EC,#7CCBC0);opacity:.55}
.fs-node{all:unset;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;min-width:0;padding:0 2px 4px;border-radius:10px;position:relative;
  transition:background var(--fs-dur-1) var(--fs-ease)}
.fs-node:hover{background:var(--fs-card-hi)}
.fs-node:focus-visible{outline:2px solid var(--ui-accent)}
.fs-node-dot{width:44px;height:44px;border-radius:999px;display:grid;place-items:center;border:2px solid var(--hue);background:color-mix(in srgb,var(--hue) 22%,var(--ui-bg-primary,#14181d));
  font-weight:700;font-size:15px;font-variant-numeric:tabular-nums;color:var(--fs-t1);position:relative;z-index:1}
.fs-node[data-empty=true] .fs-node-dot{background:var(--ui-bg-primary,#14181d);color:var(--fs-t4);border-style:dashed;opacity:.8}
.fs-node-late{position:absolute;top:-4px;right:calc(50% - 30px);z-index:2;min-width:18px;height:18px;padding:0 4px;border-radius:999px;background:var(--fs-bad);color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center}
.fs-node-l{font-size:11.5px;color:var(--fs-t2);text-align:center;max-width:100%}
.fs-node-buds{display:flex;gap:3px;flex-wrap:wrap;justify-content:center;min-height:8px}
.fs-bud{width:8px;height:8px;border-radius:999px;box-shadow:0 0 0 1.5px var(--ui-bg-primary,#14181d)}
.fs-bud[data-late=true]{box-shadow:0 0 0 1.5px var(--fs-bad)}

/* ---- day timeline ---- */
.fs-tl{position:relative;height:74px;margin:4px 6px 0}
.fs-tl-axis{position:absolute;left:0;right:0;bottom:18px;height:6px;border-radius:999px;background:var(--ui-bg-tertiary)}
.fs-tl-past{position:absolute;left:0;bottom:18px;height:6px;border-radius:999px;background:color-mix(in srgb,#E07A93 35%,transparent)}
.fs-tl-now{position:absolute;bottom:10px;width:2px;height:40px;background:var(--fs-rose);border-radius:2px}
.fs-tl-now::after{content:"now";position:absolute;top:-15px;left:50%;transform:translateX(-50%);font-size:10px;color:var(--fs-rose);font-weight:600}
.fs-tl-tick{position:absolute;bottom:0;font-size:10px;color:var(--fs-t4);transform:translateX(-50%);font-variant-numeric:tabular-nums}
.fs-tl-pin{all:unset;position:absolute;bottom:14px;width:14px;height:14px;margin-left:-7px;border-radius:999px;border:2px solid var(--ui-bg-primary,#14181d);cursor:pointer;
  transition:transform var(--fs-dur-1) var(--fs-pop)}
.fs-tl-pin:hover,.fs-tl-pin:focus-visible{transform:scale(1.35);outline:none}
.fs-tl-pin[data-stack]{bottom:calc(14px + var(--stack) * 16px)}

/* ---- action list ---- */
.fs-action{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--fs-line)}
.fs-action:first-child{border-top:0;padding-top:2px}
.fs-sev{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:color-mix(in srgb,var(--sev) 16%,transparent);color:var(--sev)}
.fs-action-t{font-size:12.5px;font-weight:550;color:var(--fs-t1)}
.fs-action-d{font-size:11.5px;color:var(--fs-t3)}
.fs-action-btns{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}

/* ---- meters ---- */
.fs-meter{height:8px;border-radius:999px;background:var(--ui-bg-tertiary);position:relative;overflow:hidden}
.fs-meter>i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--c,var(--fs-rose));transition:width var(--fs-dur-4) var(--fs-ease)}
.fs-meter>b{position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--fs-t3);border-radius:2px}
.fs-chip{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;border-radius:999px;background:var(--fs-card-hi);font-size:11px;color:var(--fs-t2);white-space:nowrap}
.fs-dot{width:8px;height:8px;border-radius:999px;flex:none;display:inline-block}

/* ---- 3D frame ---- */
.fs-stage{position:relative;border:1px solid var(--fs-line);border-radius:14px;overflow:hidden;min-width:0;
  background:radial-gradient(90% 80% at 50% 35%,color-mix(in srgb,#E07A93 10%,transparent),transparent 70%),linear-gradient(180deg,color-mix(in srgb,#93C3EC 10%,transparent),transparent 60%)}
.fs-label{position:absolute;left:0;top:0;transform:translate(-50%,-100%);pointer-events:none;display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px 0 6px;border-radius:999px;
  background:color-mix(in srgb,var(--ui-bg-primary,#14181d) 82%,transparent);border:1px solid color-mix(in srgb,var(--hue) 55%,transparent);font-size:11px;color:var(--fs-t1);white-space:nowrap;
  backdrop-filter:blur(4px);transition:opacity var(--fs-dur-2) var(--fs-ease)}
.fs-label b{font-variant-numeric:tabular-nums}
.fs-label .fs-late{color:var(--fs-bad);font-weight:700}
.fs-stage-hint{position:absolute;left:12px;bottom:10px;font-size:11px;color:var(--fs-t3);pointer-events:none}
.fs-stage-tools{position:absolute;right:10px;top:10px;display:flex;gap:6px}
.fs-icon-btn{all:unset;box-sizing:border-box;width:var(--fs-hit);height:var(--fs-hit);border-radius:8px;display:grid;place-items:center;cursor:pointer;color:var(--fs-t2);
  background:color-mix(in srgb,var(--ui-bg-primary,#14181d) 70%,transparent);border:1px solid var(--fs-line)}
.fs-icon-btn:hover{color:var(--fs-t1)}
.fs-icon-btn:focus-visible{outline:2px solid var(--ui-accent)}

/* ---- entrance ---- */
.fs-anim .fs-enter{animation:fs-up var(--fs-dur-3) var(--fs-ease) both;animation-delay:calc(var(--i,0) * 40ms)}
@keyframes fs-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

/* ---- responsive: container queries ---- */
@container fs (max-width: 1279px){.fs-split{grid-template-columns:minmax(0,1fr) 290px}}
@container fs (max-width: 959px){
  .fs-root{--fs-pad:16px}
  .fs-s8,.fs-s7,.fs-s5,.fs-s4{grid-column:span 12!important}
  .fs-s6{grid-column:span 6!important}
  .fs-split{grid-template-columns:minmax(0,1fr)}
  .fs-tab-l{display:none}
  .fs-tab[aria-selected=true] .fs-tab-l{display:inline}
}
@container fs (max-width: 599px){
  .fs-root{--fs-pad:12px;--fs-gap:10px}
  .fs-s6{grid-column:span 12!important}
  .fs-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .fs-kpi-v{font-size:20px}
  .fs-hero{grid-template-columns:minmax(0,1fr);justify-items:center;text-align:center;padding:16px 14px;gap:12px}
  .fs-hero-facts{justify-content:center}
  .fs-hero-title{font-size:18px}
  .fs-brand-l{display:none}
  .fs-flow{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:14px}
  .fs-flow::before{display:none}
  .fs-action{grid-template-columns:28px minmax(0,1fr)}
  .fs-action-btns{grid-column:2;justify-content:flex-start}
  .fs-hide-compact{display:none!important}
}
@media (pointer: coarse){.fs-root{--fs-hit:40px}}
@media (prefers-reduced-motion: reduce){
  .fs-root *{animation:none!important;transition:none!important}
}
`

export function FsStyles() {
  return h('style', { 'data-fs-styles': '1' }, CSS)
}
