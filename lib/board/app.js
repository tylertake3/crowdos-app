// ============================================================================
// Ported NEAR-VERBATIM from prototype_1.html — the prototype is the design
// spec. Markup, class names, CSS hooks, and behaviour deliberately mirror it;
// any visual difference from the prototype is a bug, not a design choice.
// Only two things differ: rate maths is imported from lib/engine (a tested
// faithful port — see tests/prototype-parity.test.ts), and PDF upload is
// stubbed until Supabase persistence lands.
// ============================================================================
/* eslint-disable */
import {
  PACT, OTINC, SP3,
  cdTimes, tierFwHours,
  cdPerHead as engineCdPerHead,
  cdDayCost as engineCdDayCost,
  computeCrowdCosts as engineComputeCrowdCosts,
  computeStuntCosts as engineComputeStuntCosts,
  locationBand, parseDayDate, weekKey, dayPeakSA,
  parseAny, parseSchedule, parseExpanded, prepModel, mergeModels,
} from "../engine";
import { layoutToLines } from "../engine/pdf-layout";
import { DEMO_FULLFAT } from "../engine/demo/demo-fullfat";
import { DEMO_2NDUNIT } from "../engine/demo/demo-2ndunit";
import { jsPDF } from "jspdf";
import * as cloud from "./cloud";

// The prototype's <body> markup, verbatim (prototype_1.html lines 483-599).
const SHELL = `<div class="topbar">
  <div class="brand"><span class="mark" id="brandMark">S</span><span><span id="brandName">Stunt<em>OS</em></span><small>Schedule · Breakdown · Cost</small></span></div>
  <div class="srcbar" id="modeBar">
    <button data-appmode="stunt" class="on">StuntOS</button>
    <button data-appmode="crowd">CrowdOS</button>
  </div>
  <div class="srcbar" id="srcBar"></div>
  <button class="tb-btn" id="btnAdd">+ Add schedule</button>
  <span class="colourpill" id="colourPill"></span>
  <div class="grow"></div>
  <button class="tb-btn" id="btnAccount" data-tip="Sync your productions across devices">Sign in</button>
  <button class="tb-btn" id="btnMode" data-tip="Light / dark">◐</button>
  <span id="status" role="status"></span>
  <input type="file" id="fileInput" accept="application/pdf" style="display:none">
</div>

<div id="gate" class="hidden">
  <div class="gate-card">
    <div class="brand" style="justify-content:center;margin-bottom:6px"><span class="mark">C</span><span>Crowd<em>OS</em><small style="text-align:center">SCHEDULE · BREAKDOWN · COST</small></span></div>
    <div style="color:var(--sub);font-size:12px;text-align:center;margin-bottom:18px">Crowd &amp; stunt budgeting for UK film and TV.<br>Sign in to open your productions.</div>
    <button class="tb-btn" id="auGoogle" style="width:100%;padding:11px;display:flex;align-items:center;justify-content:center;gap:9px;font-size:13px">
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      Continue with Google
    </button>
    <div style="display:flex;align-items:center;gap:10px;margin:14px 0;color:var(--faint);font-size:10px;text-transform:uppercase;letter-spacing:.1em">
      <span style="flex:1;height:1px;background:var(--line)"></span>or<span style="flex:1;height:1px;background:var(--line)"></span>
    </div>
    <div class="rates-grid" style="padding:0;grid-template-columns:1fr">
      <div class="rfield"><label>Email</label><div class="inwrap"><input id="auEmail" type="email" autocomplete="email" placeholder="you@company.com"></div></div>
      <div class="rfield"><label>Password</label><div class="inwrap"><input id="auPass" type="password" autocomplete="current-password" placeholder="••••••••"></div></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:14px;align-items:center">
      <button class="tb-btn" id="auSignIn" style="border-color:var(--hv-line);color:var(--hv)">Sign in</button>
      <button class="tb-btn" id="auSignUp">Create account</button>
    </div>
    <div id="auStatus" style="color:var(--note);font-size:11.5px;margin-top:10px"></div>
  </div>
</div>

<div class="layout">
<aside class="sidebar" id="sidebar">
  <button class="side-item" id="sideDash">Dashboard</button>
  <div class="side-label">Productions</div>
  <div id="sideList"></div>
  <button class="side-new tb-btn" id="sideNew">+ New production</button>
  <div class="side-label">Sample schedule</div>
  <div id="sideDemo"></div>
</aside>
<div class="maincol">
<div id="dashView" class="wrap hidden"></div>
<div id="boardView" class="wrap">
  <div class="summary" id="summary"></div>

  <details class="ratesbar" id="ratesBar">
    <summary><span class="dot"></span> Stunt rate card <span class="hint" id="ratesHint"></span></summary>
    <div class="rates-grid">
      <div class="rfield"><label>Performer day rate</label><div class="inwrap"><span>£</span><input id="rPerf" type="number" step="0.5" value="600"></div></div>
      <div class="rfield"><label>Holiday pay / day</label><div class="inwrap"><span>£</span><input id="rHol" type="number" step="0.5" value="17.50"></div></div>
      <div class="rfield"><label>Insurance / day</label><div class="inwrap"><span>£</span><input id="rIns" type="number" step="0.5" value="17.50"></div></div>
      <div class="rfield"><label>Insured days / week</label><div class="inwrap"><span>×</span><input id="rInsDays" type="number" step="1" min="0" value="2"></div></div>
      <div class="rfield"><label>Usage (% of day rate)</label><div class="inwrap"><span>%</span><input id="rUse" type="number" step="0.5" value="55.5"></div></div>
      <div class="rfield"><label>Coordinator day rate</label><div class="inwrap"><span>£</span><input id="rCoord" type="number" step="0.5" value="1000"></div></div>
      <div class="rfield"><label>Stunt dept coordinator (day rate)</label><div class="inwrap"><span>£</span><input id="rSDRate" type="number" step="0.5" value="350"></div></div>
      <div class="rfield"><label>Stunt dept coordinator days/wk</label><div class="inwrap"><span>×</span><input id="rSDDays" type="number" step="1" min="0" value="4"></div></div>
      <div class="rfield" style="display:flex;align-items:flex-end"><label class="chk" style="width:100%;justify-content:center"><input type="checkbox" id="rSDOn"> Include stunt dept coordinator</label></div>
      <div class="rates-note" id="ratesCalc"></div>
    </div>
  </details>

  <details class="ratesbar hidden" id="crowdRatesBar">
    <summary><span class="dot"></span> Crowd rate card <span class="hint" id="cratesHint"></span></summary>
    <div class="rates-grid">
      <div class="rfield"><label>SA basic daily rate</label><div class="inwrap"><span>£</span><input id="cSA" type="number" step="0.01" value="111.21"></div></div>
      <div class="rfield"><label>Holiday pay %</label><div class="inwrap"><span>%</span><input id="cHol" type="number" step="0.01" value="12.07"></div></div>
      <div class="rfield"><label>Day OT / 30 min (incl. hol)</label><div class="inwrap"><span>£</span><input id="cOTday" type="number" step="0.01" value="11.69"></div></div>
      <div class="rfield"><label>Night OT &amp; early call / 30 min</label><div class="inwrap"><span>£</span><input id="cOTnight" type="number" step="0.01" value="17.54"></div></div>
      <div class="rfield"><label>Early call travel (≤ 06:00)</label><div class="inwrap"><span>£</span><input id="cET" type="number" step="0.01" value="19.73"></div></div>
      <div class="rfield"><label>Travel Cat A (Zones 1–3)</label><div class="inwrap"><span>£</span><input id="cTravelA" type="number" step="0.01" value="17.09"></div></div>
      <div class="rfield"><label>Travel Cat B (Studios / beyond Z3)</label><div class="inwrap"><span>£</span><input id="cTravelB" type="number" step="0.01" value="23.89"></div></div>
      <div class="rates-note" id="cratesCalc"></div>
    </div>
  </details>
  <details class="ratesbar hidden" id="spactRatesBar">
    <summary><span class="dot"></span> SPACT rate card <span class="hint" id="spactHint"></span></summary>
    <div class="rates-grid">
      <div class="rfield"><label>SPACT basic daily rate</label><div class="inwrap"><span>£</span><input id="cSpact" type="number" step="0.01" value="255"></div></div>
      <div class="rfield"><label>Night basic rate</label><div class="inwrap"><span>£</span><input id="cSpactNight" type="number" step="0.01" value="372"></div></div>
      <div class="rfield"><label>Holiday in lieu / day</label><div class="inwrap"><span>£</span><input id="cSpactHol" type="number" step="0.01" value="15.50"></div></div>
      <div class="rfield"><label>Early call travel (≤ 06:00)</label><div class="inwrap"><span>£</span><input id="cSpactET" type="number" step="0.01" value="20.91"></div></div>
      <div class="rates-note" id="spactCalc"></div>
    </div>
  </details>

  <div class="controls">
    <div class="tabs" role="tablist">
      <button class="on" data-view="days">Day board</button>
      <button data-view="cal">Calendar</button>
      <button data-view="stunts" id="tabBreakdown">Stunt cost breakdown</button>
      <button data-view="crowd" id="tabCrowd">Stunts by day</button>
      <button data-view="calc" id="tabCalc">Calculator</button>
      <button data-view="cast">Cast list</button>
    </div>
    <div class="searchwrap"><input id="search" type="search" placeholder="Search day, scene, character…" autocomplete="off"><button id="searchClear" aria-label="Clear search">✕</button></div>
    <label class="chk"><input type="checkbox" id="fltStunt"> <span id="fltLabel">Stunt days only</span></label>
    <label class="chk"><input type="checkbox" id="tglCosts" checked> Show costs</label>
    <div class="grow"></div>
    <div class="legend">
      <span><i style="background:var(--dayext)"></i>Day EXT</span>
      <span><i style="background:var(--dayint)"></i>Day INT</span>
      <span><i style="background:var(--nightext)"></i>Night EXT</span>
      <span><i style="background:var(--nightint)"></i>Night INT</span>
      <span><i style="background:var(--dusk)"></i>Dawn / Dusk</span>
    </div>
  </div>
  <div id="viewDays"></div>
  <div id="viewCal" class="hidden"></div>
  <div id="viewStunts" class="hidden"></div>
  <div id="viewCrowd" class="hidden"></div>
  <div id="viewCalc" class="hidden"></div>
  <div id="viewCast" class="hidden"></div>
</div>

</div>
</div>

<div class="modal" id="costModal">
  <div class="box">
    <div class="mhead"><h3 id="cmTitle"></h3><span class="sub" id="cmSub"></span><button class="x" id="cmClose">Close</button></div>
    <div class="tscroll" id="cmBody"></div>
  </div>
</div>

<div class="modal" id="calModal">
  <div class="box">
    <div class="mhead"><h3 id="calTitle"></h3><span class="sub" id="calSub"></span><button class="x" id="calClose">Close</button></div>
    <div id="calBody"></div>
  </div>
</div>

<div class="modal" id="cdayModal">
  <div class="box" style="max-width:860px">
    <div class="mhead"><h3 id="cdTitle"></h3><span class="sub" id="cdSub"></span><button class="x" id="cdReset" style="margin-left:auto">Reset to schedule</button><button class="x" id="cdClose">Close</button></div>
    <div id="cdBody"></div>
  </div>
</div>

<div class="modal" id="authModal">
  <div class="box" style="max-width:420px">
    <div class="mhead"><h3>Account</h3><button class="x" id="auClose">Close</button></div>
    <div style="padding:16px">
      <div id="auSignedIn">
        <div style="font-size:12.5px;margin-bottom:12px">Signed in as <b id="auWho"></b> — productions sync automatically.</div>
        <button class="tb-btn" id="auSignOut">Sign out</button>
      </div>
    </div>
  </div>
</div>


<div class="modal" id="dayModal">
  <div class="box" style="max-width:560px">
    <div class="mhead"><h3>Add shoot day</h3><span class="sub">behaves exactly like a parsed day — same costing, calendar &amp; breakdown</span><button class="x" id="dmClose">Close</button></div>
    <div style="padding:16px">
      <div class="rates-grid" style="padding:0;grid-template-columns:repeat(2,1fr)">
        <div class="rfield"><label>Date</label><div class="inwrap"><input id="dmDate" type="date"></div></div>
        <div class="rfield"><label>Unit</label><div class="inwrap"><select id="dmUnit" style="width:100%;border:none;background:var(--panel2);color:var(--ink);padding:9px 10px;font-family:var(--mono);font-size:13px;font-weight:600"><option value="Main">Main Unit</option><option value="2nd">2nd Unit</option></select></div></div>
        <div class="rfield" style="grid-column:1/-1"><label>Location</label><div class="inwrap"><input id="dmLoc" type="text" placeholder="e.g. OMAX Studio — sets the travel band automatically"></div></div>
        <div class="rfield"><label>Day type</label><div class="inwrap"><select id="dmType" style="width:100%;border:none;background:var(--panel2);color:var(--ink);padding:9px 10px;font-family:var(--mono);font-size:13px;font-weight:600"><option value="">Standard</option><option value="CWD">CWD</option><option value="SCWD">SCWD</option><option value="CWN">CWN</option></select></div></div>
        <div class="rfield"><label>Hours (optional)</label><div class="inwrap"><input id="dmHours" type="text" placeholder="0800–1700"></div></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;align-items:center">
        <button class="tb-btn" id="dmAdd" style="border-color:var(--hv-line);color:var(--hv)">Add day &amp; open crowd calculator</button>
      </div>
    </div>
  </div>
</div>

<div class="modal" id="impModal">
  <div class="box" style="max-width:560px">
    <div class="mhead"><h3>Import schedule</h3><span class="sub" id="impSub"></span><button class="x" id="impClose">Cancel</button></div>
    <div style="padding:16px">
      <div class="rates-grid" style="padding:0;grid-template-columns:repeat(2,1fr)">
        <div class="rfield" style="grid-column:1/-1"><label>Add to production</label><div class="inwrap"><select id="impProd" style="width:100%;border:none;background:var(--panel2);color:var(--ink);padding:9px 10px;font-family:var(--mono);font-size:13px;font-weight:600"></select></div></div>
        <div class="rfield" style="grid-column:1/-1" id="impNewNameRow"><label>New production name</label><div class="inwrap"><input id="impNewName" type="text" placeholder="e.g. Victura"></div></div>
        <div class="rfield"><label>Unit</label><div class="inwrap"><select id="impUnit" style="width:100%;border:none;background:var(--panel2);color:var(--ink);padding:9px 10px;font-family:var(--mono);font-size:13px;font-weight:600"><option value="Main">Main Unit</option><option value="2nd">2nd Unit</option></select></div></div>
        <div class="rfield"><label>Version / label</label><div class="inwrap"><input id="impVer" type="text" placeholder="Blue, B&amp;W, V2…"></div></div>
        <div class="rfield"><label>Schedule colour (themes the app)</label><div class="inwrap"><select id="impColour" style="width:100%;border:none;background:var(--panel2);color:var(--ink);padding:9px 10px;font-family:var(--mono);font-size:13px;font-weight:600"><option value="white">None</option><option>blue</option><option>pink</option><option>yellow</option><option>green</option><option>salmon</option><option>goldenrod</option><option>buff</option><option>cherry</option><option>tan</option><option>lavender</option></select></div></div>
        <div class="rfield"><label>Schedule date</label><div class="inwrap"><input id="impDate" type="text" placeholder="11 May 2026"></div></div>
        <div class="rfield"><label>Format</label><div class="inwrap"><select id="impFormat" style="width:100%;border:none;background:var(--panel2);color:var(--ink);padding:9px 10px;font-family:var(--mono);font-size:13px;font-weight:600"><option value="auto">Auto-detect</option><option value="expanded">Full Fat / Expanded</option><option value="oneliner">One-Liner</option></select></div></div>
        <div class="rfield" id="impRateRow"><label>Rate card (production)</label><div class="inwrap"><select id="impRate" style="width:100%;border:none;background:var(--panel2);color:var(--ink);padding:9px 10px;font-family:var(--mono);font-size:13px;font-weight:600"></select></div></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;align-items:center">
        <button class="tb-btn" id="impGo" style="border-color:var(--hv-line);color:var(--hv)">Import schedule</button>
        <span id="impInfo" style="color:var(--faint);font-size:11px"></span>
      </div>
    </div>
  </div>
</div>

<div class="modal" id="prodModal">
  <div class="box" style="max-width:460px">
    <div class="mhead"><h3 id="pmTitle">New production</h3><button class="x" id="pmClose">Cancel</button></div>
    <div style="padding:16px">
      <div class="rates-grid" style="padding:0;grid-template-columns:1fr">
        <div class="rfield"><label>Production name</label><div class="inwrap"><input id="pmName" type="text" placeholder="e.g. Victura"></div></div>
        <div class="rfield"><label>Rate card</label><div class="inwrap"><select id="pmRate" style="width:100%;border:none;background:var(--panel2);color:var(--ink);padding:9px 10px;font-family:var(--mono);font-size:13px;font-weight:600"></select></div></div>
        <div class="rfield"><label>Default schedule colour</label><div class="inwrap"><select id="pmColour" style="width:100%;border:none;background:var(--panel2);color:var(--ink);padding:9px 10px;font-family:var(--mono);font-size:13px;font-weight:600"><option value="white">None</option><option>blue</option><option>pink</option><option>yellow</option><option>green</option><option>salmon</option><option>goldenrod</option><option>buff</option><option>cherry</option><option>tan</option><option>lavender</option></select></div></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;align-items:center">
        <button class="tb-btn" id="pmSave" style="border-color:var(--hv-line);color:var(--hv)">Create production</button>
        <button class="tb-btn" id="pmDelete" style="display:none">Delete production</button>
        <span id="pmInfo" style="color:var(--faint);font-size:11px"></span>
      </div>
      <div style="color:var(--faint);font-size:11px;margin-top:12px">Set a production once — then import as many schedules (units, versions, colours) into it as you like.</div>
    </div>
  </div>
</div>

<div class="modal" id="stuntDayModal">
  <div class="box" style="max-width:460px">
    <div class="mhead"><h3 id="sdmTitle">Add stunts to day</h3><span class="sub" id="sdmSub"></span><button class="x" id="sdmClose">Close</button></div>
    <div style="padding:16px">
      <div class="rates-grid" style="padding:0;grid-template-columns:repeat(3,1fr)">
        <div class="rfield"><label>Performers</label><div class="inwrap"><input id="sdmPerf" type="number" min="0" value="0"></div></div>
        <div class="rfield"><label>Coordinators</label><div class="inwrap"><input id="sdmCoord" type="number" min="0" value="0"></div></div>
        <div class="rfield"><label>Doubles</label><div class="inwrap"><input id="sdmDbl" type="number" min="0" value="0"></div></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;align-items:center">
        <button class="tb-btn" id="sdmSave" style="border-color:var(--hv-line);color:var(--hv)">Save</button>
        <span id="sdmInfo" style="color:var(--faint);font-size:11px"></span>
      </div>
      <div style="color:var(--faint);font-size:11px;margin-top:12px">For one-liners with no stunt breakdown yet — add the performers this day needs. They’re costed at the StuntOS rates (performer/coordinator + holiday, usage, insurance). Per-event fees (fire, high falls) go on the day’s ⚡ adjustments.</div>
    </div>
  </div>
</div>

<div class="raOverlay" id="raOverlay">
  <div class="raTop noprint">
    <button id="raClose">← Back to board</button>
    <div style="flex:1"></div>
    <span style="color:#666;font-size:11.5px">Review and amend before sending — this is a starting draft, not a signed-off assessment.</span>
    <button class="primary" id="raPrint">Export as PDF</button>
  </div>
  <div id="raBody"></div>
</div>`;

export function initBoard(root) {
  if (root.dataset.boardInit) return;
  root.dataset.boardInit = "1";
  root.innerHTML = SHELL;
const $ = s => document.querySelector(s);
let SOURCES=[], ACTIVE=0, MODEL=null, COST=null;
let NS=''; // per-production namespace for saved day edits (blank productions get their own)
// A production is a top-level container (name-keyed) holding a rate card and
// a default colour. Schedules (SOURCES) belong to one via s.prod (its name);
// importing another schedule into an existing production inherits its rate
// card — you set the production once, not per schedule.
let PRODS={};
try{PRODS=JSON.parse(store.get('crowdos-prods')||'{}')}catch(e){PRODS={}}
function saveProds(){store.set('crowdos-prods',JSON.stringify(PRODS))}
function prodNames(){return Object.keys(PRODS)}
function prodOf(s){return s&&s.prod?PRODS[s.prod]:null}
function ensureProd(name,init){
  if(!name)return null;
  if(!PRODS[name])PRODS[name]={rateCard:(init&&init.rateCard)||null,colour:(init&&init.colour)||'white'};
  else if(init){
    if(init.rateCard!==undefined)PRODS[name].rateCard=init.rateCard;
    if(init.colour&&!PRODS[name].colour)PRODS[name].colour=init.colour;
  }
  saveProds();
  if(CLOUD&&CLOUD.session&&cloud.upsertProd)cloud.upsertProd(name,PRODS[name]).catch(()=>{});
  return PRODS[name];
}
let APPMODE='stunt';

function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
const gbp = n => '£' + n.toLocaleString('en-GB',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2});

// ---------- safe storage (falls back to memory) ----------
const MEM={};
const store={
  get(k){try{return window.localStorage.getItem(k)}catch(e){return MEM[k]??null}},
  set(k,v){try{window.localStorage.setItem(k,v)}catch(e){MEM[k]=v}}
};
// floating tooltip — never clipped by card overflow, clamps to viewport
const tipbox=document.createElement('div');tipbox.id='tipbox';document.body.appendChild(tipbox);
let TIP_EL=null;
function positionTip(el){
  const t=el.getAttribute('data-tip');
  if(!t){tipbox.style.display='none';return}
  tipbox.textContent=t;tipbox.style.display='block';
  const r=el.getBoundingClientRect();
  const tw=tipbox.offsetWidth, th=tipbox.offsetHeight;
  let left=r.left+r.width/2-tw/2;
  left=Math.max(8,Math.min(left,window.innerWidth-tw-8));
  let top=r.bottom+8;
  if(top+th>window.innerHeight-8)top=r.top-th-8;
  tipbox.style.left=left+'px';tipbox.style.top=Math.max(8,top)+'px';
}
document.addEventListener('mouseover',e=>{
  const el=e.target.closest&&e.target.closest('[data-tip]');
  if(el){TIP_EL=el;positionTip(el)}
  else if(TIP_EL){TIP_EL=null;tipbox.style.display='none'}
});
document.addEventListener('focusin',e=>{const el=e.target.closest&&e.target.closest('[data-tip]');if(el){TIP_EL=el;positionTip(el)}});
document.addEventListener('focusout',()=>{TIP_EL=null;tipbox.style.display='none'});
window.addEventListener('scroll',()=>{TIP_EL=null;tipbox.style.display='none'},true);
document.addEventListener('click',()=>{if(TIP_EL){positionTip(TIP_EL)}});

let NOTES={};
try{NOTES=JSON.parse(store.get('stuntos-notes')||'{}')}catch(e){NOTES={}}
function saveNote(key,val){
  if(val&&val.trim())NOTES[key]=val;else delete NOTES[key];
  store.set('stuntos-notes',JSON.stringify(NOTES));
}
let RASET={};
try{RASET=JSON.parse(store.get('stuntos-ra')||'{}')}catch(e){RASET={}}
function raDefaults(){return Object.assign({assessor:'Paul Kennington',mobile:'+44 7710319929',email:'info@pkstunts.com',company:'Jackson River Films',title:'Piccadilly — Clown Town'},RASET)}
function saveRAset(k,v){RASET[k]=v;store.set('stuntos-ra',JSON.stringify(RASET))}
let ADJ={};
try{ADJ=JSON.parse(store.get('stuntos-adj')||'{}')}catch(e){ADJ={}}
function adjKey(d){return (NS?NS+'|':'')+(d.unit||'Main')+'|'+d.num}
function saveAdj(){store.set('stuntos-adj',JSON.stringify(ADJ));cloudSyncMap('adj')}
let RAEDITS={};
try{RAEDITS=JSON.parse(store.get('stuntos-raedits')||'{}')}catch(e){RAEDITS={}}
function saveRAedit(k,v){RAEDITS[k]=v;store.set('stuntos-raedits',JSON.stringify(RAEDITS))}

// ---------- theming ----------
const THEMES={
  blue:['#4d9dff','#7cbcff'], pink:['#ff6ba8','#ff96c2'], yellow:['#ffd23d','#ffe27a'],
  green:['#3ecf72','#71e29b'], salmon:['#ff8f73','#ffb09b'], goldenrod:['#e8b830','#f2cf6a'],
  buff:['#d9b98a','#e8d2ae'], cherry:['#ff4d5e','#ff7f8c'], tan:['#cfa878','#e0c39d'],
  lavender:['#b78aff','#cfacff'], white:['#ff6b2c','#ff8a3d']
};
function detectColour(title,text){
  const hay=(title+' '+text.slice(0,800)).toUpperCase();
  for(const c of Object.keys(THEMES)){ if(new RegExp('\\b'+c.toUpperCase()+'\\b').test(hay)) return c; }
  return 'white';
}
function hexRgba(hex,a){const n=parseInt(hex.slice(1),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`}
function applyTheme(colour){
  const [hv,hv2]=THEMES[colour]||THEMES.white;
  const r=document.documentElement.style;
  r.setProperty('--hv',hv);r.setProperty('--hv2',hv2);
  r.setProperty('--hv-dim',hexRgba(hv,.24));r.setProperty('--hv-line',hexRgba(hv,.58));
  $('#colourPill').textContent=colour==='white'?'':colour+' schedule';
  $('#colourPill').style.display=colour==='white'?'none':'';
}
function setMode(m){document.body.classList.toggle('light',m==='light');store.set('stuntos-mode',m)}
setMode(store.get('stuntos-mode')||'dark');
$('#btnMode').addEventListener('click',()=>setMode(document.body.classList.contains('light')?'dark':'light'));

function todClass(s){
  const t=(s.tod||'').toLowerCase(), ie=s.ie;
  if(t==='dawn'||t==='dusk')return'tod-dusk';
  const night=t.startsWith('night');
  if(ie==='INT')return night?'tod-nightint':'tod-dayint';
  return night?'tod-nightext':'tod-dayext';
}
const isPerf=c=>c.type==='stuntPerf'||c.type==='stuntDbl';
const isStuntTok=c=>c.type==='stuntCoord'||isPerf(c);
const sceneHasStunts=s=>s.cast.some(isStuntTok)||(s.extras&&s.extras.length>0);
function personName(code){const n=MODEL.castMap[code]||MODEL.castMap[String(code).toUpperCase()]||MODEL.castMap[String(code).toLowerCase()]||code;return String(n).replace(/STUNT ARRANGER/ig,'STUNT COORDINATOR')}
function codeClass(c){return c.type==='stuntCoord'?'co':isPerf(c)?'st':c.type==='double'?'dbl':c.type==='offCam'?'oc':''}
function dayPeakFeat(d){return Math.max(0,...d.scenes.map(s=>(s.featured||[]).reduce((a,f)=>a+f.count,0)),0)}
function dayPeakSpact(d){return Math.max(0,...d.scenes.map(s=>(s.spacts||[]).reduce((a,f)=>a+f.count,0)),0)}

// ---------- dates ----------
function fmtWeek(k){const d=new Date(k);return 'w/c '+d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
const WD=['SUN','MON','TUE','WED','THU','FRI','SAT'],MO=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function fmtDayDate(d){
  if(!d._date)return{big:esc(d.date),tip:`Shoot day ${d.num}${d.unit==='2nd'?' · 2nd Unit':''}`};
  const dt=d._date;
  return{big:`<span class="wd">${WD[dt.getDay()]}</span>${dt.getDate()} ${MO[dt.getMonth()]}`,
    tip:`Shoot day ${d.num}${d.unit==='2nd'?' · 2nd Unit':''} · ${dt.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}`};
}
function chipDate(d){
  if(!d._date)return d.date;
  const mo=MO[d._date.getMonth()];
  return d._date.getDate()+' '+mo.charAt(0)+mo.slice(1).toLowerCase();
}

// ---------- rate engine ----------
function rates(){
  return {perf:+$('#rPerf').value||0,hol:+$('#rHol').value||0,ins:+$('#rIns').value||0,
    insDays:Math.max(0,Math.floor(+$('#rInsDays').value||0)),usePct:(+$('#rUse').value||0)/100,coord:+$('#rCoord').value||0};
}
// Stunt engine adapter — identical results via lib/engine; the DOM-read
// rate inputs and hint strings behave exactly as the prototype's computeCosts.
function computeCosts(){
  if(MODEL&&typeof applySced==='function')applySced(MODEL);
  const R=rates();
  const sdOn=$('#rSDOn').checked;
  const sdRate=+$('#rSDRate').value||0, sdDaysPerWk=Math.max(0,+$('#rSDDays').value||0);
  COST=engineComputeStuntCosts(augmentedStuntModel(),ADJ,{...R,sdOn,sdRate,sdDays:sdDaysPerWk});
  const perfUsage=R.perf*R.usePct, coordUsage=R.coord*R.usePct;
  const perfBase=COST.perfBase, coordBase=COST.coordBase;
  const sdWeekly=sdRate*sdDaysPerWk;
  $('#ratesHint').textContent=`Performer ${gbp(perfBase)}/day + ins · Coordinator ${gbp(coordBase)}/day + ins`;
  $('#ratesCalc').innerHTML=`Performer day = ${gbp(R.perf)} rate + ${gbp(R.hol)} holiday + ${gbp(perfUsage)} usage (${(R.usePct*100).toFixed(1)}% of rate) = <b>${gbp(perfBase)}</b>. Coordinator day = ${gbp(R.coord)} + ${gbp(R.hol)} holiday + ${gbp(coordUsage)} usage = <b>${gbp(coordBase)}</b>. Both carry ${gbp(R.ins)} insurance on the first ${R.insDays} working days each week (capped ${gbp(R.ins*R.insDays)}/person/wk). Additional stunt performers are costed at the performer rate per head. Driving / car / photo doubles are listed but not costed. Stunt department coordinator is a flat ${gbp(sdWeekly)}/week (${gbp(sdRate)} × ${sdDaysPerWk} days) charged in every week that has stunt work${sdOn?'':' — currently switched off'}.`;
}

// ---------- crowd day settings (persistent, per day) ----------
let CDAY={};
try{CDAY=JSON.parse(store.get('stuntos-cday')||'{}')}catch(e){CDAY={}}
function cdayKey(d){return (NS?NS+'|':'')+(d.unit||'Main')+'|'+d.num}
function saveCDAY(){store.set('stuntos-cday',JSON.stringify(CDAY));cloudSyncMap('cday')}
function seedCday(d){
  const chars=[];
  const peak=dayPeakSA(d);
  const saScenes=d.scenes.filter(s=>s.sa>0).map(s=>s.num).join(', ');
  if(peak)chars.push({name:"SA's",count:peak,tier:'SA',scene:saScenes});
  const feats={},spacts={},fsc={},ssc={};
  for(const s of d.scenes){
    for(const f of (s.featured||[])){feats[f.name]=Math.max(feats[f.name]||0,f.count);(fsc[f.name]=fsc[f.name]||[]).push(s.num)}
    for(const f of (s.spacts||[])){spacts[f.name]=Math.max(spacts[f.name]||0,f.count);(ssc[f.name]=ssc[f.name]||[]).push(s.num)}
  }
  for(const [n,c] of Object.entries(feats))chars.push({name:n,count:c,tier:'Featured',scene:[...new Set(fsc[n])].join(', ')});
  for(const [n,c] of Object.entries(spacts))chars.push({name:n,count:c,tier:'SPACT',scene:[...new Set(ssc[n])].join(', ')});
  return {shift:'Day',fw:(d.type||'').toUpperCase().includes('CWD')?'cwd':'std',ph:false,
    call:'07:00',wrap:'18:00',travel:locationBand(d.loc).band,chars};
}
function cdHours(c){return cdTimes(c).hours}
function cdEarly(c){return cdTimes(c).call<7}
/* PACT/FAA rules (client-confirmed):
   · OT £10.43 / 30 min, always rounded up; blocks falling past 22:00 (or pre-07:00) pay night OT £15.65
   · Early call: every 30 min before 07:00 pays £15.65 (rounded up)
   · Early call travel: called at or before 06:00 → additional £19.73
   · Working day framework counts from 07:00 (pre-07:00 time is covered by early-call payments) */
const numIn=(id,dflt)=>{const el=document.getElementById(id);const v=el?+el.value:NaN;return isFinite(v)&&v>=0?v:dflt};
const gOTd=()=>numIn('cOTday',OTINC.day);
const gOTn=()=>numIn('cOTnight',OTINC.night);
const gETsa=()=>numIn('cET',PACT.early);
const gTA=()=>numIn('cTravelA',PACT.travelA);
const gTB=()=>numIn('cTravelB',PACT.travelB);
const gSpHol=()=>numIn('cSpactHol',SP3.hol);
const gSpNight=()=>numIn('cSpactNight',SP3.night);
const gSpET=()=>numIn('cSpactET',SP3.earlyTravel);
// Crowd per-head adapters — the prototype read rate inputs from the DOM
// inside cdPerHead; here the same inputs are packed into engine settings.
function crowdSettingsFromDOM(){
  const R=crowdRates();
  return {
    pact:{sa:R.sa,hol:R.hol,otDay:gOTd(),otNight:gOTn(),earlyTravel:gETsa(),travelA:gTA(),travelB:gTB()},
    spact:{basic:R.spact,night:gSpNight(),hol:gSpHol(),otDay:gOTd(),otNight:gOTn(),earlyTravel:gSpET(),travelA:gTA(),travelB:gTB()},
  };
}
function cdPerHead(c,tier){return engineCdPerHead(c,tier,crowdSettingsFromDOM())}
function cdDayCost(c){return engineCdDayCost(c,crowdSettingsFromDOM())}

// ---------- crowd engine ----------
let CROWD=null;
function crowdRates(){const sa=+$('#cSA').value||0;return {sa,feat:sa /* Featured = SA BDR + supplementary fees */,spact:+$('#cSpact').value||0,hol:(+$('#cHol').value||0)/100}}
function computeCrowdCosts(){
  if(MODEL&&typeof applySced==='function')applySced(MODEL);
  const R=crowdRates(), hp=1+R.hol;
  // strip the active production's namespace off saved day edits — the engine
  // keys configs by plain `unit|num`
  const cd=NS
    ?Object.fromEntries(Object.entries(CDAY).filter(([k])=>k.startsWith(NS+'|')).map(([k,v])=>[k.slice(NS.length+1),v]))
    :Object.fromEntries(Object.entries(CDAY).filter(([k])=>!k.startsWith('m:')));
  CROWD={R,hp,...engineComputeCrowdCosts(MODEL,cd,crowdSettingsFromDOM())};
  $('#cratesHint').textContent=`SA ${gbp(R.sa*hp)}/day incl. holiday · Featured = SA rate + supplementary fees`;
  $('#spactHint').textContent=`SPACT ${gbp(R.spact+gSpHol())}/day incl. holiday (in lieu) — Take 3 2026 card`;
  $('#cratesCalc').innerHTML=`PACT/FAA 2026: SA day rate + ${(R.hol*100).toFixed(2)}% holiday; OT and early-call payments charged at holiday-inclusive rates (${gbp(OTINC.day)} day OT / ${gbp(OTINC.night)} night OT &amp; early call per 30 min). There is no separate Featured rate — a Featured SA is the SA basic daily rate plus supplementary fees.`;
  $('#spactCalc').innerHTML=`Take 3 SPACT 2026 (4 Mar – 31 Dec): ${gbp(R.spact)} basic + ${gbp(SP3.hol)} payment in lieu of holiday. SWD 10 hrs (incl. lunch) / CWD 8 hrs; night ${gbp(SP3.night)}; PH ${gbp(SP3.phDay)}/${gbp(SP3.phNight)}; OT ${gbp(OTINC.day)} day, ${gbp(OTINC.night)} after 22:00; early-call travel ${gbp(SP3.earlyTravel)}. Daily counts use each day’s peak requirement. Travel allowance is auto-applied per head from each day’s location (Cat A ${gbp(PACT.travelA)} / Cat B ${gbp(PACT.travelB)}); calls before 07:00 add the ${gbp(PACT.early)} early-call payment via the day calculator. Chits and supplementary fees are the full CrowdOS engine’s territory.`;
}
const isWorkDay=d=>APPMODE==='crowd'?!!CROWD.perDay[d.id]:!!COST.perDay[d.id];

// ---------- summary ----------
function renderSummary(){
  if(APPMODE==='crowd'){
    const days=MODEL.days;
    const crowdDays=days.filter(d=>CROWD.perDay[d.id]).length;
    const saDays=days.reduce((a,d)=>a+(CROWD.perDay[d.id]?.sa||0),0);
    const featDays=days.reduce((a,d)=>a+(CROWD.perDay[d.id]?.featPD||0),0);
    const spactDays=days.reduce((a,d)=>a+(CROWD.perDay[d.id]?.spactPD||0),0);
    $('#summary').innerHTML=`
      <div class="stat hero costable"><div class="n">${gbp(Math.round(CROWD.grand))}</div><div class="l">Total crowd cost</div></div>
      <div class="stat"><div class="n">${crowdDays}<span style="font-size:18px;color:var(--faint)">/${days.length}</span></div><div class="l">Crowd days</div></div>
      <div class="stat"><div class="n">${saDays.toLocaleString()}</div><div class="l">SA artiste-days</div></div>
      <div class="stat"><div class="n">${featDays}</div><div class="l">Featured days</div></div>
      <div class="stat money costable"><div class="n">${spactDays}</div><div class="l">Spact days</div></div>`;
    return;
  }
  const days=MODEL.days;
  const stuntDays=days.filter(d=>COST.perDay[d.id]).length;
  const ps=Object.values(COST.perPerson);
  const perfDays=ps.filter(p=>p.type!=='stuntCoord').reduce((a,p)=>a+p.heads,0);
  const coordDays=ps.filter(p=>p.type==='stuntCoord').reduce((a,p)=>a+p.heads,0);
  $('#summary').innerHTML=`
    <div class="stat hero costable"><div class="n">${gbp(COST.grand)}</div><div class="l">Total stunt cost</div></div>
    <div class="stat"><div class="n">${stuntDays}<span style="font-size:18px;color:var(--faint)">/${days.length}</span></div><div class="l">Stunt days</div></div>
    <div class="stat"><div class="n">${perfDays}</div><div class="l">Performer-days</div></div>
    <div class="stat"><div class="n">${coordDays}</div><div class="l">Coordinator days</div></div>
    <div class="stat money costable"><div class="n">${stuntDays?gbp(Math.round(COST.grand/stuntDays)):'—'}</div><div class="l">Avg cost / stunt day</div></div>`;
}

// ---------- day board ----------
function codeChip(c){return `<span class="code ${codeClass(c)}" data-tip="${esc(personName(c.code))}" tabindex="0">${esc(c.code)}</span>`}
function extraChip(x){return `<span class="code xt" data-tip="Additional stunt performer${x.count>1?'s ×'+x.count:''}" tabindex="0">${esc(x.name)}${x.count>1?' ×'+x.count:''}</span>`}
function noteKey(d,s,idx){return [d.unit||'Main',d.num,s?s.num:'',s?s.part:'',s!=null?idx:'DAY'].join('|')}
function stripHTML(d,s,idx){
  const cast=s.cast.filter(c=>c.type==='cast'||c.type==='offCam');
  const stunts=s.cast.filter(c=>isStuntTok(c)||c.type==='double');
  const featN=(s.featured||[]).reduce((a,f)=>a+f.count,0);
  const spactN=(s.spacts||[]).reduce((a,f)=>a+f.count,0);
  const featTip=(s.featured||[]).map(f=>f.name+(f.count>1?' ×'+f.count:'')).join(', ');
  const spactTip=(s.spacts||[]).map(f=>f.name+(f.count>1?' ×'+f.count:'')).join(', ');
  const nk=noteKey(d,s,idx), noteVal=NOTES[nk]||'';
  const cAttr=APPMODE==='crowd'?` data-costday="${esc(d.id)}" role="button" tabindex="0" data-tip="${esc(crowdCharTip(d))}"`:'';
  // named crowd chips: each character group gets its own chip so the day
  // board shows WHO the crowd are, not just a total (capped at 3 + "+n")
  const namedChips=(list,cls,tip)=>{
    const shown=list.slice(0,3).map(f=>`<span class="code ${cls}${APPMODE==='crowd'?' click':''}" ${APPMODE==='crowd'?cAttr:`data-tip="${esc(tip)}" tabindex="0"`}>${esc(f.name.length>24?f.name.slice(0,22)+'…':f.name)}${f.count>1?' ×'+f.count:''}</span>`).join('');
    const more=list.length>3?`<span class="code ${cls}" data-tip="${esc(tip)}" tabindex="0">+${list.length-3}</span>`:'';
    return shown+more;
  };
  const saCharTip=(s.saChars||[]).map(f=>f.name+(f.count>1?' ×'+f.count:'')).join(', ');
  const crowdChips=[
    s.sa?`<span class="code cr${APPMODE==='crowd'?' click':''}"${cAttr}>SA ${s.sa}</span>`:'',
    (s.saChars||[]).length?namedChips(s.saChars||[],'cr',saCharTip):'',
    featN?namedChips(s.featured||[],'feat',featTip):'',
    spactN?namedChips(s.spacts||[],'spact',spactTip):'',
    s.veh?`<span class="code veh">${s.pod?'Pod ':''}Veh ${s.veh}</span>`:''
  ].filter(Boolean).join('');
  return `<div class="strip ${todClass(s)} ${sceneHasStunts(s)?'stunt-row':''}" data-stunt="${sceneHasStunts(s)?1:0}">
    <div class="rail"></div>
    <div class="scn">${esc(s.num)}${s.part?` <small>Pt ${esc(s.part)}</small>`:''}<small>${esc(s.tod)} ${esc(s.scriptDay)}</small></div>
    <div class="ie">${esc(s.ie)}<small>${esc(s.pages||'—')}p</small></div>
    <div class="body">
      <div class="slug">${esc(s.slug)}</div>
      <div class="desc">${esc(s.desc)}</div>
      ${s.tags.length?`<div class="tags">${s.tags.map(t=>`<span class="tag ${/^Chase|^Sequence/i.test(t)?'strand':''}">${esc(t)}</span>`).join('')}</div>`:''}
    </div>
    <div class="ccol"><div class="codes">${cast.length?cast.map(codeChip).join(''):'<span class="dash">—</span>'}</div></div>
    <div class="ccol reqcell${APPMODE==='stunt'?' editable':''}"${APPMODE==='stunt'?` data-reqedit="${esc(nk)}" data-reqmode="stunt" role="button" tabindex="0" data-tip="Click to add stunt performers to this scene"`:''}><div class="codes">${(stunts.length||(s.extras||[]).length)?stunts.map(codeChip).join('')+(s.extras||[]).map(extraChip).join(''):`<span class="dash">${APPMODE==='stunt'?'＋':'—'}</span>`}</div></div>
    <div class="ccol reqcell${APPMODE==='crowd'?' editable':''}"${APPMODE==='crowd'?` data-reqedit="${esc(nk)}" data-reqmode="crowd" role="button" tabindex="0" data-tip="Click to add crowd to this scene"`:''}><div class="codes">${crowdChips||`<span class="dash">${APPMODE==='crowd'?'＋':'—'}</span>`}</div></div>
    <div><button class="notebtn ${noteVal?'has':''}" data-note="1" data-tip="${noteVal?'View / edit note':'Add note'}" aria-label="Scene note">✎</button></div>
    <div class="notearea hidden"><textarea data-notekey="${esc(nk)}" placeholder="Scene note — pads, harnesses, rigging…">${esc(noteVal)}</textarea></div>
    <div class="reqarea hidden" data-reqkey="${esc(nk)}"></div>
  </div>`;
}
function teamCounts(pd){
  let co=0,sd=0,perf=0;
  for(const p of pd.people){
    if(p.type==='stuntCoord')co+=p.count;
    else if(p.type==='stuntDbl')sd+=p.count;
    else perf+=p.count;
  }
  const bits=[];
  if(co)bits.push(`<b>${co}</b> coord`);
  if(sd)bits.push(`<b>${sd}</b> double${sd>1?'s':''}`);
  if(perf)bits.push(`<b>${perf}</b> performer${perf>1?'s':''}`);
  return `<span class="teamcount">${bits.join(' · ')}</span>`;
}
function dayHeadStunts(d){
  const pd=COST.perDay[d.id];
  if(!pd)return'';
  const seen={},chips=[];
  for(const p of pd.people){
    if(seen[p.code])continue;seen[p.code]=1;
    if(p.type==='stuntExtra'){
      chips.push(`<span class="person xt" data-tip="Additional stunt performer${p.count>1?'s':''}">${esc(p.code)}${p.count>1?' <b>×'+p.count+'</b>':''}</span>`);
    }else{
      const cls=p.type==='stuntCoord'?'co':'sd';
      chips.push(`<span class="person ${cls}" data-tip="${esc(personName(p.code))}"><b>${esc(p.code)}</b> ${esc(personName(p.code).replace(/ - Stunt Dbl\.?$/i,'').replace(/ - Stunt Double$/i,''))}</span>`);
    }
  }
  const dbls=[...new Set(d.scenes.flatMap(s=>s.cast.filter(c=>c.type==='double').map(c=>c.code)))];
  for(const c of dbls)chips.push(`<span class="person dbl" data-tip="${esc(personName(c))} · not costed"><b>${esc(c)}</b> ${esc(personName(c))}</span>`);
  return `<div class="dh-stunts"><span class="sl">Stunt team</span>${teamCounts(pd)}${chips.join('')}</div>`;
}
function crowdCharTip(d){
  const key=cdayKey(d);
  let list;
  if(CDAY[key])list=CDAY[key].chars.filter(x=>(+x.count||0)>0).map(x=>`${x.name} ×${x.count}`);
  else{
    const cd=CROWD.perDay[d.id];
    if(!cd)return 'Rename / split into characters';
    list=[...(cd.sa?[`SA's ×${cd.sa}`]:[]),
      ...Object.entries(cd.feats).map(([n,x])=>`${n} ×${x}`),
      ...Object.entries(cd.spacts).map(([n,x])=>`${n} ×${x}`)];
  }
  const s=list.join(', ');
  return (s.length>110?s.slice(0,110)+'…':s)+' — click to rename / split';
}
function dayHeadCrowd(d){
  const cd=CROWD.perDay[d.id];
  if(!cd)return'';
  const bits=[];
  if(cd.sa)bits.push(`<b>${cd.sa}</b> SA`);
  if(cd.featPD)bits.push(`<b>${cd.featPD}</b> featured`);
  if(cd.spactPD)bits.push(`<b>${cd.spactPD}</b> spact${cd.spactPD>1?'s':''}`);
  const chips=[
    ...Object.entries(cd.feats).map(([n,c])=>`<span class="person xt" data-tip="Featured background">${esc(n)}${c>1?' <b>×'+c+'</b>':''}</span>`),
    ...Object.entries(cd.spacts).map(([n,c])=>`<span class="person sd" data-tip="Spact">${esc(n)}${c>1?' <b>×'+c+'</b>':''}</span>`)
  ];
  return `<div class="dh-stunts"><span class="sl">Crowd</span><span class="teamcount">${bits.join(' · ')}</span>${chips.join('')}</div>`;
}
function renderDays(){
  const notesByDay={};
  for(const n of (MODEL.notes||[])){if(n.afterDay!=null)(notesByDay[n.afterDay]=notesByDay[n.afterDay]||[]).push(n)}
  const showUnit=MODEL.multiUnit;
  $('#viewDays').innerHTML=MODEL.days.map(d=>{
    const pd=COST.perDay[d.id], cd=CROWD.perDay[d.id], work=APPMODE==='crowd'?cd:pd;
    const peak=dayPeakSA(d), f=fmtDayDate(d);
    const dnk=noteKey(d,null), dnote=NOTES[dnk]||'';
    return `<div class="daycard ${work?'has-stunts':''}" id="day-${d.id}" data-stunt="${work?1:0}">
      <div class="dayhead">
        <div class="dh-top">
          <span class="ddate" data-tip="${esc(f.tip)}" tabindex="0">${f.big}</span>
          <span class="dnum">D${d.num}</span>
          ${showUnit?`<span class="unitpill ${d.unit==='2nd'?'u2':'main'}">${d.unit==='2nd'?'2nd Unit':'Main Unit'}</span>`:''}
          <a class="dloc loclink" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.loc)}" target="_blank" rel="noopener" data-tip="Open in Google Maps">${esc(d.loc)}</a>
          <span class="dmeta">${esc(d.hours)}${d.cams?` · ${d.cams}cam`:''} · ${esc(d.pages||'?')}p</span>
          <div class="grow"></div>
          ${APPMODE==='stunt'&&pd?`<span class="dpill stunt">Stunts</span>`:''}
          ${APPMODE==='crowd'&&cd?`<span class="dpill stunt">Crowd</span>`:''}
          ${d.type?`<span class="dpill type">${esc(d.type)}</span>`:''}
          ${peak&&APPMODE==='stunt'?`<span class="dpill sa">SA ${peak}</span>`:''}
          ${peak&&APPMODE==='crowd'?`<button class="dpill sa click" data-costday="${esc(d.id)}" data-tip="${esc(crowdCharTip(d))}">SA ${peak}</button>`:''}
          ${APPMODE==='stunt'&&pd?`<button class="dh-cost costable" data-costday="${esc(d.id)}" data-tip="Click for the full cost breakdown">${gbp(pd.cost)}<small>Stunt cost</small></button>`:''}
          ${APPMODE==='crowd'&&cd?`<button class="dh-cost costable" data-costday="${esc(d.id)}" data-tip="Open the day calculator">${gbp(Math.round(cd.cost))}<small>${cd.edited?'✎ ':''}Crowd cost</small></button>`:''}
          ${APPMODE==='stunt'&&pd?`<button class="tb-btn" data-raday="${esc(d.id)}" style="font-size:11px;padding:6px 12px">📄 Risk assessment</button>`:''}
        </div>
        ${APPMODE==='crowd'?dayHeadCrowd(d):dayHeadStunts(d)}
      </div>
      <div class="colhead"><div></div><div>Scene</div><div></div><div>Set / action</div><div>Cast</div><div class="c-stunt">Stunts</div><div class="c-crowd">Crowd</div><div></div></div>
      ${d.scenes.map((s,i)=>stripHTML(d,s,i)).join('')}
      <div class="daynote-row">
        <button class="adddaynote ${dnote?'has':''}" data-daynote="1">${dnote?'✎ Day note':'＋ Add day note'}</button>
        <textarea class="hidden" data-notekey="${esc(dnk)}" placeholder="Day note…">${esc(dnote)}</textarea>
      </div>
    </div>`+(notesByDay[d.num]&&d.unit!=='2nd'?notesByDay[d.num].map(n=>`<div class="breakline">${esc(n.text)}</div>`).join(''):'');
  }).join('');
  applyFilters();
}

// ---------- cost popup ----------
let CD_CTX=null, CD_MOUNT=null;
function openCrowdDay(dayId){
  const d=COST.dayById[dayId];
  if(!d)return;
  CD_CTX=dayId;CD_MOUNT=$('#cdBody');
  const key=cdayKey(d);
  if(!CDAY[key])CDAY[key]=seedCday(d);
  $('#cdTitle').textContent=`Day ${d.num} crowd calculator`;
  $('#cdSub').textContent=`${d.date}${MODEL.multiUnit?` · ${d.unit==='2nd'?'2nd Unit':'Main Unit'}`:''} · ${d.loc}`;
  renderCdModal();
  $('#cdayModal').classList.add('open');
}
function openCrowdInline(dayId,row){
  const existing=document.querySelector('tr.cdexp');
  const wasThis=existing&&existing.dataset.for===dayId;
  if(existing){existing.remove();document.querySelectorAll('tr.cdopen.openrow').forEach(r=>r.classList.remove('openrow'));if(wasThis){cdRecalcApp();return}}
  const d=COST.dayById[dayId];
  if(!d)return;
  CD_CTX=dayId;
  const key=cdayKey(d);
  if(!CDAY[key])CDAY[key]=seedCday(d);
  const cols=row.children.length;
  const tr=document.createElement('tr');
  tr.className='cdexp';tr.dataset.for=dayId;
  tr.innerHTML=`<td colspan="${cols}"><div class="cdwrap"></div></td>`;
  row.after(tr);
  row.classList.add('openrow');
  CD_MOUNT=tr.querySelector('.cdwrap');
  renderCdModal();
}
function backfillScenes(d,c){
  if(!c.chars.some(ch=>ch.scene===undefined))return;
  const saScenes=d.scenes.filter(s=>s.sa>0).map(s=>s.num).join(', ');
  const fsc={},ssc={};
  for(const s of d.scenes){
    for(const f of (s.featured||[]))(fsc[f.name]=fsc[f.name]||[]).push(s.num);
    for(const f of (s.spacts||[]))(ssc[f.name]=ssc[f.name]||[]).push(s.num);
  }
  for(const ch of c.chars){
    if(ch.scene!==undefined)continue;
    if(ch.tier==='SA')ch.scene=saScenes;
    else if(ch.tier==='Featured')ch.scene=[...new Set(fsc[ch.name]||[])].join(', ')||saScenes;
    else ch.scene=[...new Set(ssc[ch.name]||[])].join(', ');
  }
  saveCDAY();
}
function renderCdModal(){
  const d=COST.dayById[CD_CTX], key=cdayKey(d), c=CDAY[key];
  backfillScenes(d,c);
  const hrs=cdHours(c), fwH=c.fw==='cwd'?PACT.cwdHrs:PACT.stdHrs;
  const otBlocks=Math.max(0,Math.ceil((hrs-fwH)*2));
  const early=cdEarly(c);
  const peak=dayPeakSA(d);
  const saAlloc=c.chars.filter(x=>x.tier==='SA').reduce((a,x)=>a+(+x.count||0),0);
  const rec=saAlloc===peak?['ok',`SA heads match the schedule peak (${peak})`]:saAlloc>peak?['warn',`SA heads ${saAlloc} — schedule peak is ${peak} (+${saAlloc-peak})`]:['warn',`SA heads ${saAlloc} — schedule peak is ${peak} (−${peak-saAlloc} unallocated)`];
  const dc=cdDayCost(c);
  const rowHTML=(ch,i)=>{
    const ph=cdPerHead(c,ch.tier);
    return `<tr>
      <td><input data-cdchar="name" data-i="${i}" value="${esc(ch.name)}" placeholder="Character — e.g. Hotel guests"></td>
      <td><input data-cdchar="scene" data-i="${i}" value="${esc(ch.scene||'')}" placeholder="Sc" style="font-family:var(--mono);font-size:11px" data-tip="Scene(s) this character belongs to"></td>
      <td><input class="cnt2" data-cdchar="count" data-i="${i}" type="number" min="0" value="${ch.count}"></td>
      <td><select data-cdchar="tier" data-i="${i}"><option${ch.tier==='SA'?' selected':''}>SA</option><option${ch.tier==='Featured'?' selected':''}>Featured</option><option${ch.tier==='SPACT'?' selected':''}>SPACT</option></select></td>
      <td><select data-cdsup="${i}" data-tip="Supplementary fee per head — Featured SA = SA rate + fees" style="max-width:150px">
        <option value="0"${!(+ch.sup)?' selected':''}>None</option>
        ${SUPS.map(s=>`<option value="${s.amt}"${(+ch.sup===s.amt)?' selected':''}>${s.label.length>26?s.label.slice(0,26)+'…':s.label} — ${gbp(s.amt)}</option>`).join('')}
        ${(+ch.sup)&&!SUPS.some(s=>s.amt===+ch.sup)?`<option value="${ch.sup}" selected>Custom — ${gbp(+ch.sup)}</option>`:''}
      </select></td>
      <td class="num mono">${gbp(ph.per+(+ch.sup||0))}</td>
      <td class="num money cdsub" data-i="${i}">${gbp((ph.per+(+ch.sup||0))*(+ch.count||0))}</td>
      <td><button class="del" data-cddel="${i}" aria-label="Remove">✕</button></td>
    </tr>`;
  };
  const saPer=cdPerHead(c,'SA');
  CD_MOUNT.innerHTML=`
  <div class="cdsec"><div class="sl2">1 · Shift conditions</div>
    <div class="cdrow">
      <span class="seg" data-cdseg="shift"><button data-v="Day" class="${c.shift==='Day'?'on':''}">Day</button><button data-v="Night" class="${c.shift==='Night'?'on':''}">Night</button></span>
      <span class="seg" data-cdseg="fw"><button data-v="std" class="${c.fw==='std'?'on':''}">Standard Day (9h · SPACT 10h)</button><button data-v="cwd" class="${c.fw==='cwd'?'on':''}">CWD (7h · SPACT 8h)</button></span>
      <label class="chk2"><input type="checkbox" data-cdph ${c.ph?'checked':''}> Public holiday</label>
    </div>
  </div>
  <div class="cdsec"><div class="sl2">2 · Hours &amp; travel</div>
    <div class="cdrow" style="margin-bottom:6px">${sliderHTML(c.call,c.wrap,'cd')}</div>
    <div class="cdrow">
      <span class="cdfield"><label>Call</label><input type="time" data-cdtime="call" value="${esc(c.call)}"></span>
      <span class="cdfield"><label>Wrap</label><input type="time" data-cdtime="wrap" value="${esc(c.wrap)}"></span>
      <span class="cdinfo" id="cdHrsInfo">${cdHrsText(c)}</span>
      <span class="cdflag ${saPer.earlyBlocks||saPer.earlyTravel?'on':''}" id="cdEarlyFlag">${cdEarlyText(c)}</span>
    </div>
    <div class="cdrow" style="margin-top:10px">
      <span class="seg" data-cdseg="travel"><button data-v="A" class="${c.travel==='A'?'on':''}">Cat A — Zones 1–3 · ${gbp(gTA())}</button><button data-v="B" class="${c.travel==='B'?'on':''}">Cat B — Studios/Beyond Z3 · ${gbp(gTB())}</button><button data-v="none" class="${c.travel==='none'?'on':''}">No travel</button></span>
      <span class="cdinfo">${(()=>{const lb=locationBand(d.loc);return lb.known?`auto: “${esc(d.loc)}” → Cat ${lb.band}`:`“${esc(d.loc)}” not recognised — defaulted Cat A, override if needed`})()}</span>
    </div>
  </div>
  <div class="cdsec"><div class="sl2">3 · Characters</div>
    <div id="cdChars"><div class="tscroll"><table><thead><tr><th>Character</th><th style="width:110px">Scene</th><th class="num">Count</th><th>Tier</th><th class="num">Supp £</th><th class="num">Per head</th><th class="num">Subtotal</th><th></th></tr></thead><tbody>
    ${c.chars.map(rowHTML).join('')}
    </tbody></table></div></div>
    <div class="cdrow" style="margin-top:8px">
      <button class="adddaynote" data-cdadd>＋ Add character</button>
      <span class="reconcile ${rec[0]}" id="cdRec">${rec[1]}</span>
    </div>
  </div>
  <div class="cdtotal">
    <span class="cdinfo" id="cdPerHeadInfo">SA per head today: <b>${gbp(saPer.per)}</b> (${gbp(saPer.base)} + hol${saPer.otBlocks?` + OT ${gbp(saPer.ot)}`:''}${saPer.earlyBlocks?` + early ${gbp(saPer.earlyPay)}`:''}${saPer.travel?` + travel ${gbp(saPer.travel)}`:''}${saPer.earlyTravel?` + early travel ${gbp(saPer.earlyTravel)}`:''})</span>
    <span class="n costable" id="cdDayTotal">${gbp(dc.cost)}</span>
  </div>
  <div class="cdrow" style="margin-top:12px">
    <button class="dz-btn" style="background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:9px 14px;font-weight:700;font-size:12px" data-cdapplyall>⛓ Apply these timings to all crowd days</button>
    <span class="cdinfo">copies shift, framework, call/wrap, travel &amp; PH to every crowd day — characters stay per-day</span>
  </div>`;
}
const SLD_MIN=240,SLD_MAX=1680; // 04:00 → 04:00 next day
function m2t(m){m=((m%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
function t2m(t){const[a,b]=(t||'0:0').split(':').map(Number);return a*60+(b||0)}
function sliderPos(callT,wrapT){
  let cm=Math.max(SLD_MIN,t2m(callT));
  let wm=t2m(wrapT);if(wm<=cm)wm+=1440;wm=Math.min(SLD_MAX,wm);
  return {cm,wm};
}
function sliderHTML(callT,wrapT,tag){
  const {cm,wm}=sliderPos(callT,wrapT);
  const pct=v=>((v-SLD_MIN)/(SLD_MAX-SLD_MIN)*100);
  const ticks=[[240,'04:00'],[600,'10:00'],[960,'16:00'],[1320,'22:00'],[1680,'04:00']]
    .map(([m,l])=>`<span style="left:${pct(m)}%">${l}</span>`).join('');
  return `<div class="dslider" data-slider="${tag}">
    <div class="track"></div>
    <div class="fill" style="left:${pct(cm)}%;right:${100-pct(wm)}%"></div>
    <input type="range" class="rA" min="${SLD_MIN}" max="${SLD_MAX}" step="5" value="${cm}" aria-label="Call time">
    <input type="range" class="rB" min="${SLD_MIN}" max="${SLD_MAX}" step="5" value="${wm}" aria-label="Wrap time">
    <div class="ticks">${ticks}</div>
  </div>`;
}
function syncSlider(root,callT,wrapT){
  const sl=root.querySelector('.dslider');if(!sl)return;
  const {cm,wm}=sliderPos(callT,wrapT);
  sl.querySelector('.rA').value=cm;sl.querySelector('.rB').value=wm;
  const pct=v=>((v-SLD_MIN)/(SLD_MAX-SLD_MIN)*100);
  const f=sl.querySelector('.fill');f.style.left=pct(cm)+'%';f.style.right=(100-pct(wm))+'%';
}
function cdHrsText(c){
  const p=cdPerHead(c,'SA');
  const fwH=c.fw==='cwd'?PACT.cwdHrs:PACT.stdHrs;
  const {call,wrap}=cdTimes(c);
  const paid=Math.max(0,wrap-Math.max(call,7));
  const otTxt=p.otBlocks?`OT <b>${p.otDayB?p.otDayB+'×30m day':''}${p.otDayB&&p.otNightB?' + ':''}${p.otNightB?p.otNightB+'×30m night':''}</b>`:'no OT';
  const pre=call<7?` · on the clock ${cdHours(c).toFixed(2)}h (pre-07:00 covered by early payments)`:'';
  return `<b>Day ${paid.toFixed(2)}h from ${call<7?'07:00':c.call}</b> · framework ${fwH}h · ${otTxt}${pre}`;
}
function cdEarlyText(c){
  const p=cdPerHead(c,'SA');
  if(!p.earlyBlocks&&!p.earlyTravel)return 'No early call payment (call 07:00+)';
  const bits=[];
  if(p.earlyBlocks)bits.push(`${p.earlyBlocks}×30m before 07:00 = ${gbp(p.earlyPay)}`);
  if(p.earlyTravel)bits.push(`early travel +${gbp(p.earlyTravel)}`);
  return 'Early call: '+bits.join(' · ')+' /head';
}
function cdRefreshTotals(){
  const d=COST.dayById[CD_CTX], c=CDAY[cdayKey(d)];
  c.chars.forEach((ch,i)=>{
    const cell=CD_MOUNT.querySelector(`.cdsub[data-i="${i}"]`);
    if(cell)cell.textContent=gbp((cdPerHead(c,ch.tier).per+(+ch.sup||0))*(+ch.count||0));
  });
  const el=CD_MOUNT.querySelector('#cdDayTotal');if(el)el.textContent=gbp(cdDayCost(c).cost);
  const phEl=CD_MOUNT.querySelector('#cdPerHeadInfo');
  if(phEl){const sp=cdPerHead(c,'SA');phEl.innerHTML=`SA per head today: <b>${gbp(sp.per)}</b> (${gbp(sp.base)} + hol${sp.otBlocks?` + OT ${gbp(sp.ot)}`:''}${sp.earlyBlocks?` + early ${gbp(sp.earlyPay)}`:''}${sp.travel?` + travel ${gbp(sp.travel)}`:''}${sp.earlyTravel?` + early travel ${gbp(sp.earlyTravel)}`:''})`}
  const peak=dayPeakSA(d);
  const saAlloc=c.chars.filter(x=>x.tier==='SA').reduce((a,x)=>a+(+x.count||0),0);
  const rec=CD_MOUNT.querySelector('#cdRec');
  if(rec){
    rec.className='reconcile '+(saAlloc===peak?'ok':'warn');
    rec.textContent=saAlloc===peak?`SA heads match the schedule peak (${peak})`:saAlloc>peak?`SA heads ${saAlloc} — schedule peak is ${peak} (+${saAlloc-peak})`:`SA heads ${saAlloc} — schedule peak is ${peak} (−${peak-saAlloc} unallocated)`;
  }
}
function cdRecalcApp(){
  computeCrowdCosts();renderSummary();renderDays();renderStunts();renderCalendar();
}
$('#cdClose').addEventListener('click',()=>{$('#cdayModal').classList.remove('open');cdRecalcApp()});
$('#cdayModal').addEventListener('click',e=>{if(e.target.id==='cdayModal'){$('#cdayModal').classList.remove('open');cdRecalcApp()}});
$('#cdReset').addEventListener('click',()=>{
  const d=COST.dayById[CD_CTX];
  delete CDAY[cdayKey(d)];saveCDAY();
  CDAY[cdayKey(d)]=seedCday(d);saveCDAY();
  renderCdModal();cdRecalcApp();
});
function openCrowdModal(dayId){
  const d=COST.dayById[dayId], cd=CROWD.perDay[dayId];
  if(!d||!cd)return;
  const R=CROWD.R,hp=CROWD.hp;
  $('#cmTitle').textContent=`Day ${d.num} crowd cost`;
  $('#cmSub').textContent=`${d.date}${MODEL.multiUnit?` · ${d.unit==='2nd'?'2nd Unit':'Main Unit'}`:''} · ${d.loc}`;
  const row=(label,heads,rate)=>`<tr><td class="rowlabel">${label}</td><td class="num">${heads}</td><td class="num">${gbp(rate*heads)}</td><td class="num">${gbp(rate*heads*R.hol)}</td><td class="num money">${gbp(rate*heads*hp)}</td></tr>`;
  let rows='';
  if(cd.sa)rows+=row('Supporting artists',cd.sa,R.sa);
  for(const [n,c] of Object.entries(cd.feats))rows+=row('Featured — '+esc(n),c,R.feat);
  for(const [n,c] of Object.entries(cd.spacts))rows+=row('SPACT — '+esc(n),c,R.spact);
  const heads=cd.sa+cd.featPD+cd.spactPD;
  $('#cmBody').innerHTML=`<table><thead><tr><th>Who</th><th class="num">Heads</th><th class="num">Day rates</th><th class="num">Holiday</th><th class="num">Total</th></tr></thead><tbody>
  ${rows}
  <tr class="total"><td>Day total</td><td class="num">${heads}</td><td class="num">${gbp(cd.cost/hp)}</td><td class="num">${gbp(cd.cost-cd.cost/hp)}</td><td class="num money">${gbp(cd.cost)}</td></tr>
  </tbody></table>
  <div class="note" style="border-top:1px solid var(--line)">Peak requirement per day × (rate + ${(R.hol*100).toFixed(2)}% holiday). Chits, overtime, travel and supplements live in the full CrowdOS engine.</div>`;
  $('#costModal').classList.add('open');
}
function openCostModal(dayId){
  if(APPMODE==='crowd'){openCrowdDay(dayId);return}
  const d=COST.dayById[dayId], pd=COST.perDay[dayId];
  if(!d||!pd)return;
  $('#cmTitle').textContent=`Day ${d.num} stunt cost`;
  $('#cmSub').textContent=`${d.date}${MODEL.multiUnit?` · ${d.unit==='2nd'?'2nd Unit':'Main Unit'}`:''} · ${d.loc}`;
  const rows=[...pd.people].sort((a,b)=>b.cost-a.cost);
  const subRows=p=>{
    const n=p.count, r=p.rate/n, u=p.usage/n, h=p.hol/n, i=p.ins/n, t=p.cost/n;
    const fm=`${gbp(r)} rate + ${gbp(u)} usage (${(COST.R.usePct*100).toFixed(1)}%) + ${gbp(h)} holiday${i?` + ${gbp(i)} insurance`:''}`;
    if(n===1)return `<tr class="sub hidden"><td colspan="6"><span class="fm">${fm}</span></td><td class="num">${gbp(t)}</td></tr>`;
    return Array.from({length:n},(_,k)=>`<tr class="sub hidden">
      <td>${esc(p.code.replace(/s$/,''))} ${k+1} <span class="fm">— ${fm}</span></td>
      <td class="num">1</td><td class="num">${gbp(r)}</td><td class="num">${gbp(u)}</td>
      <td class="num">${gbp(h)}</td><td class="num">${i?gbp(i):'—'}</td><td class="num">${gbp(t)}</td></tr>`).join('');
  };
  $('#cmBody').innerHTML=`<table><thead><tr><th>Who</th><th class="num">Heads</th><th class="num">Day rate</th><th class="num">Usage</th><th class="num">Holiday</th><th class="num">Insurance</th><th class="num">Total</th></tr></thead><tbody>
  ${rows.map(p=>`<tr class="exp">
    <td class="rowlabel">${p.type==='stuntExtra'?esc(p.code):`<span style="font-family:var(--mono);font-size:11px">${esc(p.code)}</span> ${esc(personName(p.code).replace(/ - Stunt Dbl\.?$/i,''))}`}</td>
    <td class="num">${p.count}</td>
    <td class="num">${gbp(p.rate)}</td><td class="num">${gbp(p.usage)}</td>
    <td class="num">${p.hol?gbp(p.hol):'—'}</td><td class="num">${p.ins?gbp(p.ins):'—'}</td>
    <td class="num money">${gbp(p.cost)}</td></tr>${subRows(p)}`).join('')}
  ${(pd.adjItems||[]).map((x,i)=>`<tr class="adjrow"><td class="rowlabel">⚡ ${esc(x.label)}</td><td class="num">—</td><td class="num" colspan="3">Stunt adjustment</td><td class="num"><button class="dchip" data-deladj="${i}" data-adjday="${esc(d.id)}">✕ remove</button></td><td class="num money">${gbp(+x.amt||0)}</td></tr>`).join('')}
  <tr class="total"><td>Day total</td><td class="num">${rows.reduce((a,p)=>a+p.count,0)}</td>
    <td class="num">${gbp(rows.reduce((a,p)=>a+p.rate,0))}</td><td class="num">${gbp(rows.reduce((a,p)=>a+p.usage,0))}</td>
    <td class="num">${gbp(rows.reduce((a,p)=>a+p.hol,0))}</td><td class="num">${gbp(rows.reduce((a,p)=>a+p.ins,0))}</td>
    <td class="num money">${gbp(pd.cost)}</td></tr>
  </tbody></table>
  <div class="adjform">
    <input id="adjLabel" placeholder="Adjustment — e.g. Fire burn · 11sd · Sc 9/39" maxlength="80">
    <input id="adjAmt" type="number" step="0.5" min="0" placeholder="£">
    <button class="dz-btn" id="adjAdd" data-adjday="${esc(d.id)}">＋ Add adjustment</button>
  </div>
  <div class="note" style="border-top:1px solid var(--line)">Stunt adjustments cover extra fees for high-risk action — fire burns, high falls, ratchet pulls. They’re added to this day’s total and carried through the whole breakdown.</div>`;
  $('#costModal').classList.add('open');
}
$('#cmBody').addEventListener('click',e=>{
  const tr=e.target.closest('tr.exp');
  if(!tr)return;
  tr.classList.toggle('openrow');
  let n=tr.nextElementSibling;
  while(n&&n.classList.contains('sub')){n.classList.toggle('hidden');n=n.nextElementSibling}
});
$('#cmClose').addEventListener('click',()=>$('#costModal').classList.remove('open'));
$('#costModal').addEventListener('click',e=>{if(e.target.id==='costModal')$('#costModal').classList.remove('open')});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#costModal').classList.remove('open');$('#raOverlay').classList.remove('open');$('#calModal').classList.remove('open');if($('#cdayModal').classList.contains('open')){$('#cdayModal').classList.remove('open');cdRecalcApp()}}});

// ---------- stunt cost breakdown ----------
function dateChips(p){
  const days=[...p.dayCounts.keys()].map(id=>COST.dayById[id]).sort((a,b)=>(a._date||0)-(b._date||0));
  const chip=d=>`<button class="dchip ${d.unit==='2nd'?'u2':''}" data-goto="${esc(d.id)}" data-tip="Shoot day ${d.num}${d.unit==='2nd'?' · 2nd Unit':''}">${esc(chipDate(d))}${p.dayCounts.get(d.id)>1?' ×'+p.dayCounts.get(d.id):''}</button>`;
  const chips=days.map(chip);
  const LIMIT=8;
  let desktop;
  if(chips.length<=LIMIT)desktop=chips.join('');
  else desktop=chips.slice(0,LIMIT).join('')
    +`<span class="morechips hidden">${chips.slice(LIMIT).join('')}</span>`
    +`<button class="dchip more" data-morechips>+${chips.length-LIMIT} more</button>`;
  // mobile: range + month-grouped drawer (Option C)
  const months={};
  for(const d of days){
    const k=d._date?d._date.getFullYear()+'-'+d._date.getMonth():'?';
    (months[k]=months[k]||{label:d._date?MONFULL[d._date.getMonth()]:'Undated',items:[]}).items.push(d);
  }
  const drawer=Object.values(months).map(m=>`<h4>${m.label}</h4>${m.items.map(d=>`<button class="dchip ${d.unit==='2nd'?'u2':''}" data-goto="${esc(d.id)}" data-tip="Shoot day ${d.num}${d.unit==='2nd'?' · 2nd Unit':''}">${d._date?d._date.getDate():esc(d.date)}${p.dayCounts.get(d.id)>1?'×'+p.dayCounts.get(d.id):''}</button>`).join('')}`).join('');
  const first=days[0],last=days[days.length-1];
  const mobile=`<div class="drange" data-rangetoggle role="button" tabindex="0">
      <span class="rtxt"><b>${esc(chipDate(first))}${days.length>1?' → '+esc(chipDate(last)):''}</b></span>
      <span class="rcnt">${days.length} date${days.length>1?'s':''} ▾</span>
    </div>
    <div class="dsheet hidden">${drawer}</div>`;
  return `<span class="dl-desktop">${desktop}</span><span class="dl-mobile">${mobile}</span>`;
}
function renderCrowdBreakdown(){
  const R=CROWD.R,hp=CROWD.hp;
  const saRows=MODEL.days.filter(d=>CROWD.perDay[d.id]&&(CROWD.perDay[d.id].sa||CROWD.perDay[d.id].featPD));
  let html=`<div class="tablecard"><h3>Supporting artists &amp; featured background<span class="cnt">${saRows.length} days</span><span class="sum costable">${gbp(Math.round(saRows.reduce((a,d)=>a+CROWD.perDay[d.id].saCost+CROWD.perDay[d.id].featCost,0)))}</span></h3>
  <div class="tscroll"><table><thead><tr><th>Day</th>${MODEL.multiUnit?'<th>Unit</th>':''}<th>Date</th><th>Location</th><th class="num">SA</th><th class="num">Featured</th><th class="num">Day rates</th><th class="num">Holiday</th><th class="num">Overtime</th><th class="num">Early call</th><th class="num">Total</th></tr></thead><tbody>
  ${saRows.map(d=>{const c=CROWD.perDay[d.id];const k=c.saComp;
    const whoTip=c.edited&&c.chars?`Applied per head to: ${esc(c.chars.slice(0,90))}${c.chars.length>90?'…':''}`:'';
    const otTip=k.ot?`${k.otDayB?k.otDayB+'×30m day (£'+gOTd()+')':''}${k.otDayB&&k.otNightB?' + ':''}${k.otNightB?k.otNightB+'×30m night (£'+gOTn()+')':''} incl. holiday${whoTip?' — '+whoTip:''}`:'';
    const eaTip=k.early?`${k.earlyBlocks?k.earlyBlocks+'×30m before 07:00 (£'+gOTn()+' incl. holiday)':''}${k.earlyTravel?(k.earlyBlocks?' + ':'')+'early travel':''}${whoTip?' — '+whoTip:''}`:'';
    const featTip=c.featPD?('Featured: '+esc(Object.entries(c.feats).map(([n,x])=>n+(x>1?' ×'+x:'')).join(', ').slice(0,90))):'';
    const R2=crowdRates();
    const featBase=c.featPD*R2.feat;
    const rates=k.rates+featBase, hol=k.hol+featBase*R2.hol;
    const ot=(k.otPer||0)*(c.sa+c.featPD);
    const early=(k.earlyPer||0)*(c.sa+c.featPD);
    return `<tr class="cdopen" data-cdopen="${esc(d.id)}"><td class="mono">${c.edited?'<span style="color:var(--note)" data-tip="Edited in the day calculator">✎</span> ':''}<button class="dchip ${d.unit==='2nd'?'u2':''}" data-goto="${esc(d.id)}">D${d.num}</button></td>${MODEL.multiUnit?`<td>${d.unit==='2nd'?'2nd':'Main'}</td>`:''}<td>${esc(chipDate(d))}</td><td><a class="loclink" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.loc)}" target="_blank" rel="noopener" data-tip="Open in Google Maps">${esc(d.loc)}</a> <span class="bandchip ${c.travel&&c.travel.band==='B'?'b':''}" data-tip="Travel ${c.travel?('Cat '+c.travel.band+' · '+gbp(c.travel.amt)+'/head'+(c.travel.known===false?' · location not recognised — check':' · auto from location')):'—'}">${c.travel?c.travel.band:'—'}</span></td><td class="num"><b>${c.sa||'—'}</b></td><td class="num ${c.featPD?'':'dim'}" ${featTip?`data-tip="${featTip}" tabindex="0"`:''}>${c.featPD||'—'}</td><td class="num">${gbp(Math.round(rates))}</td><td class="num">${gbp(Math.round(hol))}</td><td class="num ${ot?'':'dim'}" ${otTip?`data-tip="${otTip}" tabindex="0"`:''}>${ot?gbp(Math.round(ot)):'—'}</td><td class="num ${early?'':'dim'}" ${eaTip?`data-tip="${eaTip}" tabindex="0"`:''}>${early?gbp(Math.round(early)):'—'}</td><td class="num money">${gbp(Math.round(c.saCost+c.featCost))}</td></tr>`}).join('')}
  </tbody></table></div></div>`;
  const tierCard=(label,people,rate)=>{
    const rows=Object.values(people).sort((a,b)=>b.heads-a.heads||a.code.localeCompare(b.code));
    if(!rows.length)return'';
    const sub=rows.reduce((a,p)=>a+p.heads*rate*hp,0);
    return `<div class="tablecard"><h3>${label}<span class="cnt">${rows.length}</span><span class="sum costable">${gbp(Math.round(sub))}</span></h3>
    <div class="tscroll"><table><thead><tr><th>Role</th><th class="num">Max heads</th><th class="num">Person-days</th><th class="num">Day rates</th><th class="num">Holiday</th><th class="num">Total</th><th class="datescol">Dates</th></tr></thead><tbody>
    ${rows.map(p=>`<tr><td class="rowlabel">${esc(p.code)}</td><td class="num">${p.max}</td><td class="num"><b>${p.heads}</b></td><td class="num">${gbp(p.heads*rate)}</td><td class="num">${gbp(p.heads*rate*R.hol)}</td><td class="num money">${gbp(p.heads*rate*hp)}</td><td class="datescol"><div class="daylist">${dateChips(p)}</div></td></tr>`).join('')}
    </tbody></table></div></div>`;
  };
  {const rows=Object.values(CROWD.spactPeople).sort((a,b)=>b.heads-a.heads||a.code.localeCompare(b.code));
  if(rows.length){
    const sub=rows.reduce((a,p)=>a+p.heads*(R.spact+gSpHol()),0);
    html+=`<div class="tablecard"><h3>Spacts — Take 3 2026 rate card<span class="cnt">${rows.length}</span><span class="sum costable">${gbp(Math.round(sub))}</span></h3>
    <div class="tscroll"><table><thead><tr><th>Role</th><th class="num">Max heads</th><th class="num">Person-days</th><th class="num">Day rates</th><th class="num">Holiday (in lieu)</th><th class="num">Total</th><th class="datescol">Dates</th></tr></thead><tbody>
    ${rows.map(p=>`<tr><td class="rowlabel">${esc(p.code)}</td><td class="num">${p.max}</td><td class="num"><b>${p.heads}</b></td><td class="num">${gbp(p.heads*R.spact)}</td><td class="num">${gbp(p.heads*gSpHol())}</td><td class="num money">${gbp(p.heads*(R.spact+gSpHol()))}</td><td class="datescol"><div class="daylist">${dateChips(p)}</div></td></tr>`).join('')}
    </tbody></table></div>
    <div class="note">SPACT sits on its own card: ${gbp(R.spact)} basic + ${gbp(SP3.hol)} payment in lieu of holiday. SWD is 10 hrs (incl. lunch), CWD 8 hrs; OT ${gbp(OTINC.day)}/30min day, ${gbp(OTINC.night)} after 22:00; early-call travel ${gbp(SP3.earlyTravel)}.</div></div>`;
  }}
  const tRows=MODEL.days.filter(d=>CROWD.perDay[d.id]?.travel?.total>0);
  const tSum=tRows.reduce((a,d)=>a+CROWD.perDay[d.id].travel.total,0);
  if(tRows.length){
    html+=`<div class="tablecard"><h3>Travel allowance<span class="cnt">${tRows.length} days</span><span class="sum costable">${gbp(Math.round(tSum))}</span></h3>
    <div class="tscroll"><table><thead><tr><th>Day</th><th>Location</th><th>Band</th><th class="num">Heads</th><th class="num">Per head</th><th class="num">Day total</th></tr></thead><tbody>
    ${tRows.map(d=>{const t=CROWD.perDay[d.id].travel;const heads=Math.round(t.total/t.amt);return `<tr class="cdopen" data-cdopen="${esc(d.id)}"><td class="mono">D${d.num}</td><td>${esc(d.loc)}</td><td><span class="bandchip ${t.band==='B'?'b':''}">${t.band}</span> ${t.known===false?'<span style="color:var(--note);font-size:10px">check</span>':''}</td><td class="num">${heads}</td><td class="num">${gbp(t.amt)}</td><td class="num money">${gbp(Math.round(t.total))}</td></tr>`}).join('')}
    <tr class="total"><td>Total</td><td colspan="4"></td><td class="num money">${gbp(Math.round(tSum))}</td></tr>
    </tbody></table></div>
    <div class="note">Travel band is read automatically from each day’s location — Cat A (TfL Zones 1–3) ${gbp(gTA())}/head, Cat B (major studios / beyond Zone 3) ${gbp(gTB())}/head. Unrecognised locations default to Cat A and are flagged — open the day calculator to override.</div></div>`;
  }
  html+=`<div class="tablecard"><h3>Cost by production week<span class="cnt">${CROWD.weeks.length} weeks</span><span class="sum costable">${gbp(Math.round(CROWD.grand))}</span></h3>
  <div class="tscroll"><table><thead><tr><th>Week</th><th class="num">Crowd days</th><th class="num">SA-days</th><th class="num">Featured-days</th><th class="num">Spact-days</th><th class="num">Week total</th></tr></thead><tbody>
  ${CROWD.weeks.map(w=>`<tr><td class="mono">${esc(fmtWeek(w.key))}</td><td class="num">${w.days}</td><td class="num">${w.saDays.toLocaleString()}</td><td class="num">${w.featDays}</td><td class="num">${w.spactDays}</td><td class="num money">${gbp(Math.round(w.cost))}</td></tr>`).join('')}
  <tr class="total"><td>Total</td><td class="num">${CROWD.weeks.reduce((a,w)=>a+w.days,0)}</td><td class="num">${CROWD.weeks.reduce((a,w)=>a+w.saDays,0).toLocaleString()}</td><td class="num">${CROWD.weeks.reduce((a,w)=>a+w.featDays,0)}</td><td class="num">${CROWD.weeks.reduce((a,w)=>a+w.spactDays,0)}</td><td class="num money">${gbp(Math.round(CROWD.grand))}</td></tr>
  </tbody></table></div>
  <div class="note">Daily peak counts × (rate + ${(R.hol*100).toFixed(2)}% holiday). SA rate is the PACT/FAA 2026 BDR; Featured/SPACT rates are editable in the crowd rate card. Full chit-level costing (unique people, continuity, overtime, travel, supplements) is CrowdOS-proper territory.</div></div>`;
  $('#viewStunts').innerHTML=html;
}
function renderStunts(){
  if(APPMODE==='crowd'){renderCrowdBreakdown();return}
  const entries=Object.values(COST.perPerson);
  const order={stuntCoord:0,stuntDbl:1,stuntPerf:2,stuntExtra:3};
  entries.sort((a,b)=>order[a.type]-order[b.type]||b.total-a.total||String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
  const groups=[['stuntCoord','Stunt coordination'],['stuntDbl','Stunt doubles'],['stuntPerf','Stunt performers'],['stuntExtra','Additional stunt performers']];
  let html=groups.map(([t,label])=>{
    const rows=entries.filter(p=>p.type===t);
    if(!rows.length)return'';
    const sub=rows.reduce((a,p)=>a+p.total,0);
    const isX=t==='stuntExtra';
    const cg=`<colgroup><col style="width:64px"><col style="width:190px"><col style="width:56px"><col style="width:84px"><col style="width:92px"><col style="width:92px"><col style="width:84px"><col style="width:92px"><col style="width:100px"><col></colgroup>`;
    return `<div class="tablecard"><h3>${label}<span class="cnt">${rows.length}</span><span class="sum costable">${gbp(sub)}</span></h3>
    <div class="tscroll"><table class="ptable">${cg}<thead><tr>${isX?'<th colspan="2">Role</th>':'<th>Code</th><th>Performer / role</th>'}<th class="num">Days</th><th class="num">Person-days</th><th class="num">Day rates</th><th class="num">Usage</th><th class="num">Holiday</th><th class="num">Insurance</th><th class="num">Total</th><th class="datescol">Dates</th></tr></thead><tbody>
    ${rows.map(p=>`<tr>${isX?`<td class="rowlabel" colspan="2">${esc(p.code)}</td>`:`<td class="mono">${esc(p.code)}</td><td class="rowlabel">${esc(personName(p.code))}</td>`}
      <td class="num">${p.days}</td><td class="num"><b>${p.heads}</b></td>
      <td class="num">${gbp(p.rate)}</td><td class="num">${gbp(p.usage)}</td><td class="num">${p.hol?gbp(p.hol):'—'}</td><td class="num">${p.ins?gbp(p.ins):'—'}</td>
      <td class="num money">${gbp(p.total)}</td>
      <td class="datescol"><div class="daylist">${dateChips(p)}</div></td></tr>`).join('')}
    </tbody></table></div></div>`;
  }).join('');
  if(COST.adjRows.length){
    html+=`<div class="tablecard"><h3>Stunt adjustments<span class="cnt">${COST.adjRows.length}</span><span class="sum costable">${gbp(COST.adjGrand)}</span></h3>
    <div class="tscroll"><table><thead><tr><th>Adjustment</th><th>Day</th><th class="num">Fee</th></tr></thead><tbody>
    ${COST.adjRows.map(x=>{const d=COST.dayById[x.dayId];return `<tr><td class="rowlabel">⚡ ${esc(x.label)}</td><td><button class="dchip ${d.unit==='2nd'?'u2':''}" data-goto="${esc(d.id)}">${esc(chipDate(d))} · D${d.num}</button></td><td class="num money">${gbp(x.amt)}</td></tr>`}).join('')}
    <tr class="total"><td>Total</td><td></td><td class="num money">${gbp(COST.adjGrand)}</td></tr>
    </tbody></table></div>
    <div class="note">Extra fees for high-risk action, added per day from the day cost popup. Included in day, week and grand totals.</div></div>`;
  }
  if(COST.sd.on&&COST.sd.total>0){
    html+=`<div class="tablecard"><h3>Stunt department coordinator<span class="cnt">${COST.sd.weekCount} weeks</span><span class="sum costable">${gbp(COST.sd.total)}</span></h3>
    <div class="tscroll"><table><thead><tr><th>Week</th><th class="num">Days charged</th><th class="num">Day rate</th><th class="num">Week cost</th></tr></thead><tbody>
    ${COST.weeks.map(w=>`<tr><td class="mono">${esc(fmtWeek(w.key))}</td><td class="num">${COST.sd.daysPerWk}</td><td class="num">${gbp(COST.sd.rate)}</td><td class="num money">${gbp(w.sdCoord)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td class="num">${COST.sd.daysPerWk*COST.sd.weekCount}</td><td class="num">${gbp(COST.sd.rate)}</td><td class="num money">${gbp(COST.sd.total)}</td></tr>
    </tbody></table></div>
    <div class="note">A flat ${gbp(COST.sd.weekly)}/week (${gbp(COST.sd.rate)} × ${COST.sd.daysPerWk} days) — support for the stunt coordinator, charged in every week with stunt work. Toggle off in the rate card above if not required.</div></div>`;
  }
  const weekSub=w=>w.dayIds.map(id=>COST.dayById[id]).sort((a,b)=>(a._date||0)-(b._date||0)||a.num-b.num).map(d=>{
    const dc=COST.perDay[d.id];
    return `<tr class="wk-sub hidden"><td colspan="2">D${d.num}${MODEL.multiUnit?` · ${d.unit==='2nd'?'2nd Unit':'Main Unit'}`:''} · ${esc(chipDate(d))} · ${esc(d.loc)}</td>
      <td class="num">${dc.people.filter(p=>p.type!=='stuntCoord').reduce((a,p)=>a+p.count,0)}</td>
      <td class="num">${dc.people.filter(p=>p.type==='stuntCoord').reduce((a,p)=>a+p.count,0)}</td>
      <td class="num">${gbp(dc.people.reduce((a,p)=>a+p.ins,0))}</td>
      <td class="num">—</td>
      <td class="num money"><button class="dchip" data-goto="${esc(d.id)}">${gbp(dc.cost)} ↗</button></td></tr>`;
  }).join('');
  html+=`<div class="tablecard"><h3>Cost by production week<span class="cnt">${COST.weeks.length} weeks</span><span class="sum costable">${gbp(COST.grand)}</span></h3>
  <div class="tscroll"><table><thead><tr><th>Week</th><th class="num">Stunt days</th><th class="num">Performer-days</th><th class="num">Coord days</th><th class="num">Insurance charged</th><th class="num">Dept coord</th><th class="num">Week total</th></tr></thead><tbody>
  ${COST.weeks.map(w=>`<tr class="wk-exp"><td class="mono">${esc(fmtWeek(w.key))}</td><td class="num">${w.days}</td><td class="num">${w.perfDays}</td><td class="num">${w.coordDays}</td><td class="num">${gbp(w.ins)}</td><td class="num">${w.sdCoord?gbp(w.sdCoord):'—'}</td><td class="num money">${gbp(w.cost)}</td></tr>${weekSub(w)}`).join('')}
  <tr class="total"><td>Total</td><td class="num">${COST.weeks.reduce((a,w)=>a+w.days,0)}</td><td class="num">${COST.weeks.reduce((a,w)=>a+w.perfDays,0)}</td><td class="num">${COST.weeks.reduce((a,w)=>a+w.coordDays,0)}</td><td class="num">${gbp(COST.weeks.reduce((a,w)=>a+w.ins,0))}</td><td class="num">${gbp(COST.sd.total)}</td><td class="num money">${gbp(COST.grand)}</td></tr>
  </tbody></table></div>
  <div class="note">Every figure splits into day rate + usage + holiday + insurance where applicable. Insurance: first ${COST.R.insDays} working days per person per week (Mon–Sun), capped ${gbp(COST.R.ins*COST.R.insDays)}/person/week. Usage is ${(COST.R.usePct*100).toFixed(1)}% of the day rate only.${COST.sd.on?` Stunt department coordinator (${gbp(COST.sd.weekly)}/week) is folded into each week total.`:''} Click a week row to see its stunt days.</div></div>`;
  $('#viewStunts').innerHTML=html;
}

// ---------- free calculator (PACT/FAA artiste day) ----------
const SUPS=[
  {k:'hair',label:'Hair cut / shaving',amt:23},
  {k:'clothing',label:'Providing own clothing',amt:23},
  {k:'sports',label:'Sports equipment & wet weather',amt:23},
  {k:'scans',label:'Scans & minimal dialogue (<10 words)',amt:30.51},
  {k:'uniform',label:'Uniforms, specialised driving or provision of car',amt:37.22},
  {k:'lookalike',label:'Lookalike doubling, stand-in or dialogue (10+ words)',amt:61.62}
];
const MEAL={short:{label:'Short lunch (meal break under 1 hour on SWD)',day:23.38,night:35.08},
            late:{label:'Late lunch (no break within 6 hours of call)',day:23.38,night:35.08}};
let FC={shift:'Day',fw:'std',ph:false,call:'07:00',wrap:'18:00',travel:'A',tier:'SA',heads:1,sups:[],meals:{short:false,late:false}};
try{Object.assign(FC,JSON.parse(store.get('stuntos-freecalc')||'{}'))}catch(e){}
function saveFC(){store.set('stuntos-freecalc',JSON.stringify(FC))}
function fcRange(fromH,toH){return m2t(Math.round(fromH*60))+'–'+m2t(Math.round(toH*60))}
function renderFreeCalc(){
  if(APPMODE==='stunt'){renderStuntCalc();return}
  const R=crowdRates();
  const pv=cdPerHead(FC,FC.tier);
  const base=pv.base;
  const fwH=tierFwHours(FC,FC.tier);
  const spact=FC.tier==='SPACT';
  $('#viewCalc').innerHTML=`<div class="fcgrid">
  <div class="fccol">
    <div class="tablecard fcpad"><div class="sl2">Rate card</div>
      <span class="seg"><button class="on">${spact?'Take 3 SPACT (Mar – Dec 2026)':'PACT / FAA (Jan – Dec 2026)'}</button><button disabled style="opacity:.45;cursor:default">+ More cards soon</button></span>
    </div>
    <div class="tablecard fcpad"><div class="sl2">Step 1 — Day or night</div>
      <span class="seg" data-fcseg="shift"><button data-v="Day" class="${FC.shift==='Day'?'on':''}">Day</button><button data-v="Night" class="${FC.shift==='Night'?'on':''}">Night</button></span>
      <label class="chk2" style="margin-left:12px"><input type="checkbox" data-fcph ${FC.ph?'checked':''}> Public holiday</label>
    </div>
    <div class="tablecard fcpad"><div class="sl2">Step 2 — Working pattern</div>
      <span class="seg" data-fcseg="fw"><button data-v="std" class="${FC.fw==='std'?'on':''}">${spact?'SWD (10 hrs incl. lunch)':'Standard Day (9 hrs)'}</button><button data-v="cwd" class="${FC.fw==='cwd'?'on':''}">${spact?'CWD (8 hrs)':'CWD (7 hrs)'}</button></span>
      <div class="cdinfo" id="fcFwCap" style="margin-top:8px">${gbp(base)} + ${gbp(pv.hol)} hol = <b>${gbp(base+pv.hol)}</b> · basic hours capped at ${fwH}h</div>
    </div>
    <div class="tablecard fcpad"><div class="sl2">Day timeline</div>
      <div class="cdrow" style="margin-bottom:4px">${sliderHTML(FC.call,FC.wrap,'fc')}</div>
      <div class="cdrow">
        <span class="cdfield"><label>Call</label><input type="time" data-fctime="call" value="${esc(FC.call)}"></span>
        <span class="cdfield"><label>Wrap</label><input type="time" data-fctime="wrap" value="${esc(FC.wrap)}"></span>
        <span class="seg" data-fcseg="travel" style="margin-left:auto"><button data-v="A" class="${FC.travel==='A'?'on':''}">Cat A ${gbp(gTA())}</button><button data-v="B" class="${FC.travel==='B'?'on':''}">Cat B ${gbp(gTB())}</button><button data-v="none" class="${FC.travel==='none'?'on':''}">None</button></span>
      </div>
    </div>
    <div class="tablecard fcpad"><div class="sl2">Supplementary fees</div>
      <div class="supgrid">${SUPS.map(s=>`<label class="chk2"><input type="checkbox" data-fcsup="${s.k}" ${FC.sups.includes(s.k)?'checked':''}> ${s.label} <b class="mono" style="margin-left:auto">${gbp(s.amt)}</b></label>`).join('')}</div>
    </div>
    <div class="tablecard fcpad"><div class="sl2">Meal break penalties</div>
      <div class="supgrid">${Object.entries(MEAL).map(([k,m])=>`<label class="chk2"><input type="checkbox" data-fcmeal="${k}" ${FC.meals[k]?'checked':''}> ${m.label} <b class="mono" style="margin-left:auto">${gbp(FC.shift==='Night'?m.night:m.day)}</b></label>`).join('')}</div>
    </div>
    <div class="fctiles" id="fcTiles"></div>
  </div>
  <div class="fccol">
    <div class="tablecard fcpad" id="fcOut"></div>
  </div>
  </div>`;
  renderFcOut();
}
let SC={tier:'perf',ins:true,adj:0,heads:1};
try{Object.assign(SC,JSON.parse(store.get('stuntos-stuntcalc')||'{}'))}catch(e){}
function saveSC(){store.set('stuntos-stuntcalc',JSON.stringify(SC))}
function scParts(){
  const rate=SC.tier==='coord'?(+$('#rCoord').value||0):(+$('#rPerf').value||0);
  const hol=+$('#rHol').value||0;
  const usePct=(+$('#rUse').value||0)/100;
  const usage=rate*usePct;
  const ins=SC.ins?(+$('#rIns').value||0):0;
  const adj=+SC.adj||0;
  return {rate,hol,usage,usePct,ins,adj,per:rate+hol+usage+ins+adj};
}
function renderStuntCalc(){
  const p=scParts();
  const row=(label,note,amt,strong)=>`<div class="fcrow${strong?' strong':''}"><div><b>${label}</b>${note?`<div class="fnote">${note}</div>`:''}</div><div class="famt ${amt>0?'costable':''}">${gbp(amt)}</div></div>`;
  $('#viewCalc').innerHTML=`<div class="fcgrid">
  <div class="fccol">
    <div class="tablecard fcpad"><div class="sl2">Rate card</div>
      <span class="seg"><button class="on">Stunt — UK TV (editable in the rate card above)</button></span>
    </div>
    <div class="tablecard fcpad"><div class="sl2">Who</div>
      <span class="seg" data-scseg="tier"><button data-v="perf" class="${SC.tier==='perf'?'on':''}">Stunt performer</button><button data-v="coord" class="${SC.tier==='coord'?'on':''}">Stunt coordinator</button></span>
    </div>
    <div class="tablecard fcpad"><div class="sl2">Options</div>
      <label class="chk2"><input type="checkbox" data-scins ${SC.ins?'checked':''}> Insurance day (${gbp(+document.querySelector('#rIns').value||17.5)} — first ${+document.querySelector('#rInsDays').value||2} working days per week)</label>
      <div class="cdrow" style="margin-top:10px">
        <span class="cdfield"><label>Stunt adjustment (fire burn, high fall…)</label><div class="inwrap" style="display:inline-flex;background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:0 10px;align-items:center;gap:4px"><span>£</span><input data-scadj type="number" min="0" step="0.5" value="${SC.adj||''}" placeholder="0" style="background:none;border:none;color:var(--ink);padding:8px 0;width:100px;font-family:var(--mono)"></div></span>
      </div>
    </div>
  </div>
  <div class="fccol">
    <div class="tablecard fcpad" id="fcOut">
      <div class="sl2">Breakdown — per ${SC.tier==='coord'?'coordinator':'performer'}</div>
      ${row('Day rate',SC.tier==='coord'?'Stunt coordinator':'Stunt performer',p.rate)}
      ${row('Holiday','flat per day',p.hol)}
      ${row('Usage',(p.usePct*100).toFixed(1)+'% of the day rate',p.usage)}
      ${row('Insurance',SC.ins?'charged on the first '+(+document.querySelector('#rInsDays').value||2)+' working days each week':'not an insurance day',p.ins)}
      ${row('Stunt adjustment',p.adj?'high-risk action fee':'none',p.adj)}
      ${row('Gross per day','',p.per,true)}
      <div class="fcgross">
        <div class="sl2" style="color:var(--hv)">Estimated gross</div>
        <div class="grossline"><input type="number" min="1" data-scheads value="${SC.heads}"> <span>×</span> <span class="mono">${gbp(p.per)}</span> <span>=</span> <b class="costable">${gbp(p.per*(SC.heads||1))}</b></div>
      </div>
    </div>
  </div>
  </div>`;
}
function fcPerTotal(){
  const p=cdPerHead(FC,FC.tier);
  return p.per+FC.sups.reduce((a,k)=>a+SUPS.find(s=>s.k===k).amt,0)
    +Object.keys(FC.meals).filter(k=>FC.meals[k]).reduce((a,k)=>a+(FC.shift==='Night'?MEAL[k].night:MEAL[k].day),0);
}
function renderFcOut(){
  const R=crowdRates();
  const p=cdPerHead(FC,FC.tier);
  const {call,wrap}=cdTimes(FC);
  const spact=FC.tier==='SPACT';
  const fwH=tierFwHours(FC,FC.tier);
  const effCall=Math.max(call,7);
  const basicH=Math.min(Math.max(0,wrap-effCall),fwH);
  const otStart=effCall+fwH;
  const otDayRate=FC.ph?OTINC.phDay:gOTd(), otNightRate=FC.ph?OTINC.phNight:gOTn();
  $('#fcTiles').innerHTML=`
    <div class="stat"><div class="n">${(p.earlyBlocks*0.5).toFixed(1)}<span style="font-size:14px;color:var(--faint)"> hrs</span></div><div class="l">Early call hours</div></div>
    <div class="stat"><div class="n">${basicH.toFixed(2)}<span style="font-size:14px;color:var(--faint)"> hrs</span></div><div class="l">Basic hours worked</div></div>
    <div class="stat"><div class="n">${(p.otBlocks*0.5).toFixed(1)}<span style="font-size:14px;color:var(--faint)"> hrs</span></div><div class="l">Overtime hours</div></div>`;
  const row=(label,note,amt,strong)=>`<div class="fcrow${strong?' strong':''}"><div><b>${label}</b>${note?`<div class="fnote">${note}</div>`:''}</div><div class="famt ${amt>0?'costable':''}">${gbp(amt)}</div></div>`;
  $('#fcOut').innerHTML=`<div class="sl2">Breakdown — per artiste</div>
    <div class="cdrow" style="margin-bottom:10px">
      <span class="seg" data-fcseg="tier"><button data-v="SA" class="${FC.tier==='SA'?'on':''}">SA</button><button data-v="SPACT" class="${FC.tier==='SPACT'?'on':''}">SPACT</button></span>
      <span class="cdinfo">Featured SA = SA rate + supplementary fees</span>
      <span class="cdinfo" style="margin-left:auto">${m2t(Math.round(call*60))} → ${m2t(Math.round((wrap%24)*60))}</span>
    </div>
    ${row('Basic pay',(spact?'SPACT day rate':FC.tier==='SA'?'BDR':'Featured day rate')+' for '+(FC.fw==='cwd'?(spact?'CWD (8 hrs)':'CWD (7 hrs)'):(spact?'SWD (10 hrs incl. lunch)':'Standard Day (9 hrs)'))+(FC.ph?' · public holiday':'')+(FC.shift==='Night'?' · night':''),p.base)}
    ${row('Holiday pay',spact?'£15.50 payment in lieu of holiday per day':'12.07% on the day rate',p.hol)}
    ${row('Early call payment',p.earlyBlocks?`${p.earlyBlocks} × ${gbp(otNightRate)} per 30 min incl. holiday (${fcRange(call,7)})`:'no pre-07:00 hours',p.earlyPay)}
    ${row('Overtime',p.otBlocks?`${p.otDayB?p.otDayB+' × '+gbp(otDayRate)+' day':''}${p.otDayB&&p.otNightB?' + ':''}${p.otNightB?p.otNightB+' × '+gbp(otNightRate)+' night':''} incl. holiday · billed in 30-min blocks (${fcRange(otStart,wrap)})`:'within basic hours',p.ot)}
    ${row('Travel allowance',FC.travel==='none'?'none':'Cat '+FC.travel+(FC.travel==='A'?' — TfL Zones 1–3':' — studios / beyond Zone 3'),p.travel)}
    ${row('Early call travel',p.earlyTravel?'called at or before 06:00'+(spact?' (SPACT card £20.91)':''):'call after 06:00',p.earlyTravel)}
    ${row('Supplementary fees',FC.sups.length?FC.sups.map(k=>SUPS.find(s=>s.k===k).label).join(' · '):'none selected',FC.sups.reduce((a,k)=>a+SUPS.find(s=>s.k===k).amt,0))}
    ${row('Meal break penalties',Object.keys(FC.meals).filter(k=>FC.meals[k]).length?Object.keys(FC.meals).filter(k=>FC.meals[k]).map(k=>MEAL[k].label.split(' (')[0]).join(' · ')+(FC.shift==='Night'?' · night rate':''):'none',Object.keys(FC.meals).filter(k=>FC.meals[k]).reduce((a,k)=>a+(FC.shift==='Night'?MEAL[k].night:MEAL[k].day),0))}
    ${row('Gross per artiste','',p.per+FC.sups.reduce((a,k)=>a+SUPS.find(s=>s.k===k).amt,0)+Object.keys(FC.meals).filter(k=>FC.meals[k]).reduce((a,k)=>a+(FC.shift==='Night'?MEAL[k].night:MEAL[k].day),0),true)}
    <div class="fcgross">
      <div class="sl2" style="color:var(--hv)">Estimated gross</div>
      <div class="grossline"><input type="number" min="1" data-fcheads value="${FC.heads}"> <span>×</span> <span class="mono">${gbp(fcPerTotal())}</span> <span>=</span> <b class="costable">${gbp(fcPerTotal()*(FC.heads||1))}</b></div>
    </div>`;
}
// ---------- cast list ----------
function renderCast(){
  const reg={};
  for(const d of MODEL.days)for(const s of d.scenes)for(const c of s.cast){
    const k=c.code;
    if(!reg[k])reg[k]={code:k,type:c.type,scenes:0,days:new Set()};
    reg[k].scenes++;reg[k].days.add(d.id);
  }
  const extras={};
  for(const d of MODEL.days)for(const s of d.scenes)for(const x of (s.extras||[])){
    if(!extras[x.name])extras[x.name]={name:x.name,scenes:0,days:new Set(),max:0};
    extras[x.name].scenes++;extras[x.name].days.add(d.id);extras[x.name].max=Math.max(extras[x.name].max,x.count);
  }
  const numOf=c=>{const m=String(c).match(/\d+/);return m?+m[0]:9999};
  const groups=[
    ['cast','Cast members',p=>p.type==='cast'],
    ['stuntCoord','Stunt coordinator',p=>p.type==='stuntCoord'],
    ['stuntDbl','Stunt doubles',p=>p.type==='stuntDbl'],
    ['stuntPerf','Stunt performers',p=>p.type==='stuntPerf'],
    ['double','Driving / car / photo doubles',p=>p.type==='double'],
    ['offCam','Off camera',p=>p.type==='offCam']
  ];
  let html=groups.map(([t,label,fn])=>{
    const rows=Object.values(reg).filter(fn).sort((a,b)=>numOf(a.code)-numOf(b.code)||String(a.code).localeCompare(String(b.code)));
    if(!rows.length)return'';
    return `<div class="tablecard"><h3>${label}<span class="cnt">${rows.length}</span></h3>
    <div class="tscroll"><table><thead><tr><th style="width:80px">Code</th><th>Character / role</th><th class="num">Scenes</th><th class="num">Days</th></tr></thead><tbody>
    ${rows.map(p=>`<tr><td><span class="code ${codeClass(p)}">${esc(p.code)}</span></td><td class="rowlabel">${esc(personName(p.code))}</td><td class="num">${p.scenes}</td><td class="num">${p.days.size}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  }).join('');
  const xrows=Object.values(extras).sort((a,b)=>a.name.localeCompare(b.name));
  if(xrows.length){
    html+=`<div class="tablecard"><h3>Additional stunt performers<span class="cnt">${xrows.length}</span></h3>
    <div class="tscroll"><table><thead><tr><th>Role</th><th class="num">Max heads</th><th class="num">Scenes</th><th class="num">Days</th></tr></thead><tbody>
    ${xrows.map(p=>`<tr><td class="rowlabel">${esc(p.name)}</td><td class="num">${p.max}</td><td class="num">${p.scenes}</td><td class="num">${p.days.size}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  }
  // stunt + crowd totals
  const ps=Object.values(COST.perPerson);
  const coordD=ps.filter(p=>p.type==='stuntCoord').reduce((a,p)=>a+p.heads,0);
  const sdD=ps.filter(p=>p.type==='stuntDbl').reduce((a,p)=>a+p.heads,0);
  const spD=ps.filter(p=>p.type==='stuntPerf').reduce((a,p)=>a+p.heads,0);
  const xD=ps.filter(p=>p.type==='stuntExtra').reduce((a,p)=>a+p.heads,0);
  const saDays=MODEL.days.reduce((a,d)=>a+dayPeakSA(d),0);
  const featDays=MODEL.days.reduce((a,d)=>a+dayPeakFeat(d),0);
  const spactDays=MODEL.days.reduce((a,d)=>a+dayPeakSpact(d),0);
  let busiest=null;for(const d of MODEL.days){const p=dayPeakSA(d);if(!busiest||p>busiest.p)busiest={d,p}}
  html+=`<div class="tablecard"><h3>Full stunt totals<span class="sum costable">${gbp(COST.grand)}</span></h3>
  <div class="tscroll"><table><tbody>
  <tr><td class="rowlabel">Coordinator days</td><td class="num">${coordD}</td></tr>
  <tr><td class="rowlabel">Stunt double person-days</td><td class="num">${sdD}</td></tr>
  <tr><td class="rowlabel">Stunt performer person-days</td><td class="num">${spD}</td></tr>
  <tr><td class="rowlabel">Additional performer person-days</td><td class="num">${xD}</td></tr>
  <tr><td class="rowlabel">Stunt adjustments</td><td class="num costable">${COST.adjGrand?gbp(COST.adjGrand):'—'}</td></tr>
  <tr><td class="rowlabel">Stunt dept coordinator</td><td class="num costable">${COST.sd.on?gbp(COST.sd.total):'off'}</td></tr>
  <tr class="total"><td>Total stunt personnel-days</td><td class="num">${coordD+sdD+spD+xD}</td></tr>
  </tbody></table></div></div>
  <div class="tablecard"><h3>Full crowd totals</h3>
  <div class="tscroll"><table><tbody>
  <tr><td class="rowlabel">SA artiste-days (peak per day)</td><td class="num">${saDays.toLocaleString()}</td></tr>
  <tr><td class="rowlabel">Featured background (peak per day)</td><td class="num">${featDays.toLocaleString()}</td></tr>
  <tr><td class="rowlabel">Spacts (peak per day)</td><td class="num">${spactDays.toLocaleString()}</td></tr>
  <tr><td class="rowlabel">Busiest crowd day</td><td class="num">${busiest&&busiest.p?`<button class="dchip ${busiest.d.unit==='2nd'?'u2':''}" data-goto="${esc(busiest.d.id)}">D${busiest.d.num} · ${busiest.p} SA</button>`:'—'}</td></tr>
  </tbody></table></div>
  <div class="note">Crowd figures are daily peaks summed across the schedule — costing them properly (tiers, chits, supplements) is CrowdOS territory.</div></div>`;
  $('#viewCast').innerHTML=html;
}

// ---------- calendar ----------
const MONFULL=['January','February','March','April','May','June','July','August','September','October','November','December'];
let CALVIEW=store.get('stuntos-calview')||'cond';
function renderCalendar(){
  const lkey=dt=>dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
  const byDate={};
  for(const d of MODEL.days){ if(d._date)byDate[lkey(d._date)]=(byDate[lkey(d._date)]||[]).concat(d); }
  const dates=MODEL.days.map(d=>d._date).filter(Boolean).sort((a,b)=>a-b);
  if(!dates.length){$('#viewCal').innerHTML='<div class="note">No dated shoot days in this schedule.</div>';return}
  const months=[];
  let cur=new Date(dates[0].getFullYear(),dates[0].getMonth(),1);
  const end=new Date(dates[dates.length-1].getFullYear(),dates[dates.length-1].getMonth(),1);
  while(cur<=end){months.push(new Date(cur));cur=new Date(cur.getFullYear(),cur.getMonth()+1,1)}
  const ctl=`<div class="calctl"><span class="seg"><button data-calview="cond" class="${CALVIEW==='cond'?'on':''}">Condensed</button><button data-calview="exp" class="${CALVIEW==='exp'?'on':''}">Expanded</button></span><span class="cdinfo" style="margin-left:10px">${CALVIEW==='exp'?'Characters split out per day':'Totals only'}</span></div>`;
  $('#viewCal').innerHTML=ctl+months.map(m=>{
    const y=m.getFullYear(),mo=m.getMonth();
    const first=new Date(y,mo,1), days=new Date(y,mo+1,0).getDate();
    const lead=(first.getDay()+6)%7; // Monday first
    let cells='';
    for(let i=0;i<lead;i++)cells+='<div class="cal-cell off"></div>';
    let monthCost=0,monthStunt=0;
    for(let dd=1;dd<=days;dd++){
      const key=y+'-'+String(mo+1).padStart(2,'0')+'-'+String(dd).padStart(2,'0');
      const list=byDate[key]||[];
      if(!list.length){cells+=`<div class="cal-cell noshoot"><span class="dnumtxt">${dd}</span></div>`;continue}
      const inner=list.map(d=>{
        const pd=COST.perDay[d.id], cd=CROWD.perDay[d.id];
        let workBits='';
        if(APPMODE==='crowd'){
          if(cd){monthCost+=cd.cost;monthStunt++;
            if(CALVIEW==='exp'){
              const key=cdayKey(d);
              const chars=CDAY[key]?CDAY[key].chars.map(x=>({name:x.name,count:+x.count||0,tier:x.tier}))
                :[...(cd.sa?[{name:"SA's",count:cd.sa,tier:'SA'}]:[]),
                  ...Object.entries(cd.feats).map(([n,x])=>({name:n,count:x,tier:'Featured'})),
                  ...Object.entries(cd.spacts).map(([n,x])=>({name:n,count:x,tier:'SPACT'}))];
              const saTot=chars.filter(x=>x.tier!=='SPACT').reduce((a,x)=>a+x.count,0);
              const spTot=chars.filter(x=>x.tier==='SPACT').reduce((a,x)=>a+x.count,0);
              const MAXC=6;
              const lines=chars.slice(0,MAXC).map(x=>`<div class="crow${x.tier!=='SA'?' xt':''}"><b>${x.count}</b> ${esc(x.name)}</div>`).join('')
                +(chars.length>MAXC?`<div class="crow" style="color:var(--faint)">+${chars.length-MAXC} more…</div>`:'');
              workBits=`<div class="ccost costable">${gbp(Math.round(cd.cost))}</div><div class="cchars">${lines}<div class="crow ctot"><b>Total ${saTot}</b> SA's${spTot?` · <b>${spTot}</b> SPACT`:''}</div></div>`;
            }else{
              const tc=[cd.sa?cd.sa+' SA':'',cd.featPD?cd.featPD+' feat':'',cd.spactPD?cd.spactPD+' spact':''].filter(Boolean).join(' · ');
              workBits=`<div class="ccost costable">${gbp(Math.round(cd.cost))}</div><div class="cteam">${tc}</div>`;
            }}
        }else{
          if(pd){monthCost+=pd.cost;monthStunt++;
            const tc=(()=>{let co=0,perf=0;for(const p of pd.people){if(p.type==='stuntCoord')co+=p.count;else perf+=p.count}return (co?co+' coord':'')+(co&&perf?' · ':'')+(perf?perf+' perf':'')})();
            const scChips=CALVIEW==='exp'?`<div class="cchars">${d.scenes.filter(sceneHasStunts).slice(0,5).map(s=>`<div class="crow"><b>${esc(s.num)}</b> ${esc(s.slug.slice(0,20))}</div>`).join('')}</div>`:'';
            workBits=`<div class="ccost costable">${gbp(pd.cost)}</div><div class="cteam">${tc}</div>${scChips}${pd.adjItems&&pd.adjItems.length?'<span class="adj" title="Stunt adjustment on this day">⚡</span>':''}`;}
        }
        return `<span class="cd">D${d.num}</span>${d.unit==='2nd'&&MODEL.multiUnit?'<span class="u2tag">2U</span>':''}${d.type?`<span class="ctype">${esc(d.type)}</span>`:''}
          ${d.loc?`<div class="cloc" title="${esc(d.loc)}">${esc(d.loc)}</div>`:''}
          <div class="chrs">${esc(d.hours||'')}${d.cams?` · ${d.cams}cam`:''}${d.pages?` · ${esc(d.pages)}p`:''}</div>
          ${workBits}`;
      }).join('<div style="height:5px;border-top:1px dashed var(--line);margin-top:5px"></div>');
      const anyStunt=list.some(d=>APPMODE==='crowd'?CROWD.perDay[d.id]:COST.perDay[d.id]);
      const ids=list.map(d=>d.id).join(',');
      cells+=`<div class="cal-cell shoot ${anyStunt?'stunt':''}" data-calpop="${esc(ids)}" data-ids="${esc(ids)}"><span class="dnumtxt">${dd}</span>${inner}</div>`;
    }
    const trail=(lead+days)%7;
    if(trail)for(let i=trail;i<7;i++)cells+='<div class="cal-cell off"></div>';
    const wl=APPMODE==='crowd'?'crowd':'stunt';
    return `<div class="cal-month"><h3>${MONFULL[mo]} ${y}${monthStunt?`<span class="cnt" style="font-size:10.5px;background:var(--panel2);border:1px solid var(--line2);color:var(--sub);border-radius:20px;padding:2px 10px;font-family:var(--body);letter-spacing:0">${monthStunt} ${wl} day${monthStunt>1?'s':''}</span>`:''}${monthCost?`<span class="sum costable">${gbp(Math.round(monthCost))}</span>`:''}</h3>
      <div class="cal-head"><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div></div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-legend"><span><i style="background:var(--hv-dim);border-left:3px solid var(--hv)"></i>${APPMODE==='crowd'?'Crowd day':'Stunt day'}</span><span><i style="background:var(--panel2);border:1px solid var(--line2)"></i>Shoot day</span><span><i style="background:var(--bg);border:1px solid var(--line)"></i>Non-shoot</span>${MODEL.multiUnit?'<span><i style="border:1px dashed var(--hv-line)"></i>2nd Unit</span>':''}<span>⚡ adjustment</span><span style="margin-left:auto">Click a day for details</span></div>
    </div>`;
  }).join('');
  updateCalFilter();
}
function openCalDay(ids){
  const list=ids.split(',').map(id=>COST.dayById[id]).filter(Boolean);
  if(!list.length)return;
  const d0=list[0];
  const f=fmtDayDate(d0);
  $('#calTitle').innerHTML=d0._date?`${WD[d0._date.getDay()]} ${d0._date.getDate()} ${MO[d0._date.getMonth()]}`:esc(d0.date);
  $('#calSub').textContent=list.length>1?'Two units shooting':'';
  $('#calBody').innerHTML=list.map(d=>{
    const pd=COST.perDay[d.id];
    const peak=dayPeakSA(d),featP=dayPeakFeat(d),spactP=dayPeakSpact(d);
    let team='';
    if(pd){
      let co=0,sd=0,perf=0;
      for(const p of pd.people){if(p.type==='stuntCoord')co+=p.count;else if(p.type==='stuntDbl')sd+=p.count;else perf+=p.count}
      team=[co?co+' coordinator':'',sd?sd+' doubles':'',perf?perf+' performers':''].filter(Boolean).join(' · ');
    }
    const dnk=noteKey(d,null), dnote=NOTES[dnk]||'';
    return `<div class="cald">
      <div class="meta"><b>Day ${d.num}</b>${MODEL.multiUnit?` · ${d.unit==='2nd'?'2nd Unit':'Main Unit'}`:''} · <a class="loclink" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.loc)}" target="_blank" rel="noopener">${esc(d.loc)}</a>${d.hours?` · ${esc(d.hours)}`:''}${d.cams?` · ${d.cams}cam`:''} · ${esc(d.pages||'?')}p${d.type?` · ${esc(d.type)}`:''}</div>
      ${d.scenes.map(s=>{
        const cast=s.cast.filter(c=>c.type==='cast'||c.type==='offCam');
        const stunts=s.cast.filter(c=>isStuntTok(c)||c.type==='double');
        const featN=(s.featured||[]).reduce((a,f)=>a+f.count,0);
        const spactN=(s.spacts||[]).reduce((a,f)=>a+f.count,0);
        const featTip=(s.featured||[]).map(f=>f.name+(f.count>1?' ×'+f.count:'')).join(', ');
        const spactTip=(s.spacts||[]).map(f=>f.name+(f.count>1?' ×'+f.count:'')).join(', ');
        return `<div class="scline ${sceneHasStunts(s)?'st':''} ${todClass(s)}">
          <span class="rail2"></span>
          <div class="scmain">
            <div><span class="scnum">${esc(s.num)}${s.part?' Pt'+esc(s.part):''}</span><span class="sl">${esc(s.slug)}</span><span style="color:var(--faint);font-size:10px"> ${esc(s.ie)} ${esc(s.tod)}</span></div>
            <div class="codes" style="margin-top:4px">
              ${cast.map(codeChip).join('')}
              ${stunts.map(codeChip).join('')}${(s.extras||[]).map(extraChip).join('')}
              ${s.sa?`<span class="code cr">SA ${s.sa}</span>`:''}
              ${featN?`<span class="code feat" data-tip="${esc(featTip)}" tabindex="0">Feat ${featN}</span>`:''}
              ${spactN?`<span class="code spact" data-tip="${esc(spactTip)}" tabindex="0">SPACT ${spactN}</span>`:''}
              ${s.veh?`<span class="code veh">${s.pod?'Pod ':''}Veh ${s.veh}</span>`:''}
            </div>
          </div>
        </div>`}).join('')}
      <div class="chiprow">
        ${pd?`<span class="code st">Stunt team: ${team}</span>`:''}
        ${peak?`<span class="code cr">SA ${peak}</span>`:''}
        ${featP?`<span class="code feat">Feat ${featP}</span>`:''}
        ${spactP?`<span class="code spact">SPACT ${spactP}</span>`:''}
        ${pd&&pd.adjItems?pd.adjItems.map(x=>`<span class="code feat">⚡ ${esc(x.label)} — ${gbp(+x.amt||0)}</span>`).join(''):''}
      </div>
      ${dnote?`<div class="dnote">✎ ${esc(dnote)}</div>`:''}
      <div class="actions">
        <button class="primary" data-calgo="${esc(d.id)}">Open on day board</button>
        ${APPMODE==='stunt'&&pd?`<button data-costday="${esc(d.id)}" class="costable">Cost breakdown — ${gbp(pd.cost)}</button>`:''}
        ${APPMODE==='crowd'&&CROWD.perDay[d.id]?`<button data-costday="${esc(d.id)}" class="costable">Cost breakdown — ${gbp(Math.round(CROWD.perDay[d.id].cost))}</button>`:''}
        ${APPMODE==='stunt'&&pd?`<button data-raday="${esc(d.id)}">📄 Risk assessment</button>`:''}
      </div>
    </div>`;
  }).join('');
  $('#calModal').classList.add('open');
}
$('#calClose').addEventListener('click',()=>$('#calModal').classList.remove('open'));
$('#calModal').addEventListener('click',e=>{if(e.target.id==='calModal')$('#calModal').classList.remove('open')});
function updateCalFilter(){
  const st=$('#fltStunt').checked;
  const q=($('#search').value||'').trim().toLowerCase();
  document.querySelectorAll('.cal-cell.shoot').forEach(cell=>{
    const ids=cell.dataset.ids.split(',');
    let ok=!st||cell.classList.contains('stunt');/* 'stunt' class = mode work day */
    if(ok&&q){
      ok=ids.some(id=>{const d=COST.dayById[id];return dayMatches(d,q)||d.scenes.some(s=>sceneMatches(s,q))});
    }
    cell.classList.toggle('dimmed',!ok);
  });
}

// ---------- crowd ----------
function renderStuntsByDay(){
  const rows=MODEL.days.filter(d=>COST.perDay[d.id]);
  $('#viewCrowd').innerHTML=`<div class="tablecard"><h3>Stunts by shoot day<span class="cnt">${rows.length} days</span><span class="sum costable">${gbp(rows.reduce((a,d)=>a+COST.perDay[d.id].cost,0))}</span></h3>
  <div class="tscroll"><table><thead><tr><th>Day</th>${MODEL.multiUnit?'<th>Unit</th>':''}<th>Date</th><th>Location</th><th class="num">Coord</th><th class="num">Doubles</th><th class="num">Performers</th><th class="num">Cost</th><th style="width:34%">Stunt scenes</th></tr></thead><tbody>
  ${rows.map(d=>{const pd=COST.perDay[d.id];let co=0,sd=0,perf=0;for(const p of pd.people){if(p.type==='stuntCoord')co+=p.count;else if(p.type==='stuntDbl')sd+=p.count;else perf+=p.count}
    return `<tr><td class="mono"><button class="dchip ${d.unit==='2nd'?'u2':''}" data-goto="${esc(d.id)}">D${d.num}</button></td>${MODEL.multiUnit?`<td>${d.unit==='2nd'?'2nd':'Main'}</td>`:''}<td>${esc(chipDate(d))}</td><td>${esc(d.loc)}</td>
    <td class="num">${co||'—'}</td><td class="num">${sd||'—'}</td><td class="num">${perf||'—'}</td>
    <td class="num money"><button class="dchip" data-costday="${esc(d.id)}">${gbp(pd.cost)}${pd.adjItems&&pd.adjItems.length?' ⚡':''}</button></td>
    <td><div class="daylist">${d.scenes.filter(sceneHasStunts).map(s=>`<span class="dchip">${esc(s.num)}${s.part?' Pt'+esc(s.part):''}</span>`).join('')}</div></td></tr>`}).join('')}
  </tbody></table></div>
  <div class="note">Every day carrying stunt work — team sizes are heads on the day. Click a cost for the full day breakdown.</div></div>`;
}
function renderCrowd(){
  if(APPMODE==='stunt'){renderStuntsByDay();return}
  const rows=MODEL.days.filter(d=>d.scenes.some(s=>s.sa>0||(s.featured||[]).length||(s.spacts||[]).length));
  const hasTier=rows.some(d=>dayPeakFeat(d)||dayPeakSpact(d));
  $('#viewCrowd').innerHTML=`<div class="tablecard"><h3>Crowd by shoot day<span class="cnt">${rows.length} days</span></h3>
  <div class="tscroll"><table><thead><tr><th>Day</th>${MODEL.multiUnit?'<th>Unit</th>':''}<th>Date</th><th>Location</th><th class="num">Peak SA</th>${hasTier?'<th class="num">Featured</th><th class="num">Spacts</th>':''}<th style="width:40%">Scene requirements</th></tr></thead><tbody>
  ${rows.map(d=>`<tr><td class="mono"><button class="dchip ${d.unit==='2nd'?'u2':''}" data-goto="${esc(d.id)}">D${d.num}</button></td>
    ${MODEL.multiUnit?`<td>${d.unit==='2nd'?'2nd':'Main'}</td>`:''}
    <td>${esc(d.date)}</td><td>${esc(d.loc)}</td>
    <td class="num"><b>${dayPeakSA(d)||'—'}</b></td>
    ${hasTier?`<td class="num">${dayPeakFeat(d)||'—'}</td><td class="num">${dayPeakSpact(d)||'—'}</td>`:''}
    <td><div class="daylist">${d.scenes.filter(s=>s.sa>0).map(s=>`<span class="dchip">${esc(s.num)} · ${s.sa}</span>`).join('')}</div></td></tr>`).join('')}
  </tbody></table></div>
  <div class="note">Featured background and Spacts come from the Expanded schedule blocks. Crowd costing is CrowdOS territory (PACT/FAA engine).</div></div>`;
}

// ---------- risk assessment ----------
function ddmmyy(dt){if(!dt)return'';const p=n=>String(n).padStart(2,'0');return p(dt.getDate())+p(dt.getMonth()+1)+String(dt.getFullYear()).slice(-2)}
function raHaystack(s){
  const extra=(s.extras||[]).map(x=>x.name).join(' ')+' '+(s.vehNames||[]).join(' ');
  return (s.slug+' '+s.desc+' '+(s.tags||[]).join(' ')+' '+extra).toLowerCase();
}
function buildHazards(scene){
  const hz=[
    'Actors/Stunt Double accidentally slipping, tripping and falling.',
    'Actors/Stunt Double accidentally being hit/punched.',
    'Actors/Stunt Double landing badly.',
    'Abrasion, cuts and bruises to the skin.',
    'Actors/Stunt Double not following coordinator specific instructions.',
    'Last minute changes without coordinator\u2019s prior knowledge.'
  ];
  const ct=[
    'Scenes to be discussed with the relevant parties before rehearsals and filming.',
    'Choreographed sequences slowly with a controlled build up to required action/speed.',
    'Choreograph action sequence with safe space between actors with minimum physical contact.',
    'Props/soft rubber (if appropriate).',
    'PPE/body pads/crash mats made available.',
    'Actors/Stunt Double to warm up and stretch before any action sequence.',
    'Cast and crew to be clear of action (if appropriate).',
    'No changes to the action sequence without approval from the stunt coordinator/1st AD.'
  ];
  const h=raHaystack(scene);
  if(/chase|suv|car|vehicle|drive|drift|crash|skid|truck/.test(h)){
    hz.push('Vehicle collision or loss of control.','Pedestrians/crew struck by a moving vehicle.','Vehicle rollover or skid on a public or dressed road.');
    ct.push('Stunt/precision drivers only to operate action vehicles.','Route swept and closed to public traffic; marshals positioned at all cross-streets and pedestrian access points.','Speeds and manoeuvres agreed and rehearsed at reduced speed before the full-speed take.','Roll cages/harnesses fitted to action vehicles where required.');
  }
  if(/fire|pyro|explo|flame|smoke/.test(h)){
    hz.push('Burns or smoke inhalation.');
    ct.push('SFX supervisor present for all fire/pyro elements.','Fire safety officer and extinguishers on standby.','Exclusion zone maintained around the effect; PPE for anyone within it.');
  }
  if(/harness|rig|high fall|rooftop|crane|fall from/.test(h)){
    hz.push('Fall from height.','Harness or rigging failure.');
    ct.push('Rigging inspected and certified by a qualified rigger before use.','Crash mats/air bags positioned and checked before each take.','Safety harness checked before every take by the stunt coordinator.');
  }
  if(/water|wet down|river|pool|lake|rain|tunnel/.test(h)){
    hz.push('Slipping on a wet surface.','Cold water immersion (if applicable).');
    ct.push('Water safety/safety diver on standby where appropriate.','Dry robes, towels and warm-up facilities available immediately off-set.');
  }
  if(/gun|weapon|knife|blade|firearm/.test(h)){
    hz.push('Accidental injury from a prop weapon.');
    ct.push('Armourer to check all weapons before each take.','No live blades on set; choreographed distance maintained at all times.');
  }
  if(/dog|animal|horse/.test(h)){
    hz.push('Animal unpredictability, bites or scratches.');
    ct.push('Animal handler present on set at all times.','Animals to be released/engaged only on the handler\u2019s cue.');
  }
  return {hz,ct};
}
let RA_CTX=null;
function openRA(dayId){
  const d=COST.dayById[dayId];
  if(!d)return;
  RA_CTX=dayId;
  const rs=raDefaults();
  const stuntScenes=d.scenes.map((s,i)=>({s,i})).filter(x=>sceneHasStunts(x.s));
  const raNum='RA'+(ddmmyy(d._date)||d.num);
  const dayLabel=d._date?d._date.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):d.date;
  const unitLabel=d.unit==='2nd'?'2nd Unit':'Main Unit';
  const blocks=stuntScenes.map(({s,i})=>{
    const hzKey=`hz-${dayId}-${i}`, ctKey=`ct-${dayId}-${i}`;
    let {hz,ct}=buildHazards(s);
    const nk=noteKey(d,s,i), noteVal=NOTES[nk]||'';
    if(noteVal)ct=[...ct,'Stunt coordinator note: '+noteVal];
    const hzText=RAEDITS[hzKey]!=null?RAEDITS[hzKey]:hz.map(x=>'• '+x).join('\n');
    const ctText=RAEDITS[ctKey]!=null?RAEDITS[ctKey]:ct.map(x=>'• '+x).join('\n');
    const isNight=(s.tod||'').toLowerCase().startsWith('night');
    return `<div class="raSceneHead">Scene ${esc(s.num)}${s.part?' Pt '+esc(s.part):''} — ${esc(s.slug)}</div>
    <div class="raRow cols4">
      <div><b>Daylight:</b> ${!isNight?'☒':'☐'}</div>
      <div><b>Night:</b> ${isNight?'☒':'☐'}</div>
      <div><b>Interior:</b> ${s.ie==='INT'?'☒':'☐'}</div>
      <div><b>Exterior:</b> ${s.ie==='EXT'||s.ie==='I/E'?'☒':'☐'}</div>
    </div>
    <div class="raBlock"><div class="raBlockHead">Details of stunt / sequence to be performed</div>
      <div class="raBlockBody">${esc(s.desc||s.slug)}</div></div>
    <div class="raHazTable">
      <div><span class="htitle">Hazards</span><span class="hsub">How could someone become hurt or ill?</span>
        <textarea data-rakey="${hzKey}">${esc(hzText)}</textarea></div>
      <div><span class="htitle">Control measures</span><span class="hsub">How are you going to prevent this?</span>
        <textarea data-rakey="${ctKey}">${esc(ctText)}</textarea></div>
    </div>`;
  }).join('')||'<div class="raBlockBody" style="border:1px solid #111;border-top:none">No stunt scenes on this day.</div>';
  $('#raBody').innerHTML=`<div class="raDoc">
    <h1>STUNT COORDINATOR'S RISK ASSESSMENT</h1><span class="ranum">${esc(raNum)}</span>
    <div class="raRow cols3 raLbl"><div>Assessor name</div><div>Mobile number</div><div>Email address</div></div>
    <div class="raRow cols3">
      <div><input class="raInput" data-raset="assessor" value="${esc(rs.assessor)}" placeholder="Name"></div>
      <div><input class="raInput" data-raset="mobile" value="${esc(rs.mobile)}" placeholder="+44…"></div>
      <div><input class="raInput" data-raset="email" value="${esc(rs.email)}" placeholder="name@company.com"></div>
    </div>
    <div class="raRow cols4 raLbl"><div>Production company</div><div>Production title</div><div>Filming date</div><div>Unit</div></div>
    <div class="raRow cols4">
      <div><input class="raInput" data-raset="company" value="${esc(rs.company)}"></div>
      <div><input class="raInput" data-raset="title" value="${esc(rs.title)}"></div>
      <div>${esc(dayLabel)}</div>
      <div>${esc(unitLabel)} · D${d.num}</div>
    </div>
    <div class="raRow cols3"><div><b>Location:</b> ${esc(d.loc)}</div><div><b>Hours:</b> ${esc(d.hours||'—')}</div><div><b>Weather a contributory factor?</b> <input class="raInput" placeholder="Y/N — note if so"></div></div>
    ${blocks}
  </div>
  <div class="raFoot">IMPORTANT — This assessment will be invalid if the control measures identified above cannot be fully and properly implemented.<br>If this is the case, the activity must be reassessed. Review and amend before signing and issuing to production.</div>`;
  $('#raOverlay').classList.add('open');
}
$('#raClose').addEventListener('click',()=>$('#raOverlay').classList.remove('open'));
function raPDF(){
  if(!RA_CTX){window.print();return}
  const d=COST.dayById[RA_CTX];
  // jsPDF imported at module top
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const L=14,W=182;let y=16;
  const gv=sel=>{const el=document.querySelector(sel);return el?el.value:''};
  const line=(h=5)=>{y+=h};
  const pageGuard=h=>{if(y+h>282){doc.addPage();y=16}};
  const cellRow=(cells,h,opts={})=>{
    pageGuard(h);
    let x=L;
    for(const c of cells){
      if(opts.fill){doc.setFillColor(234,234,234);doc.rect(x,y,c.w,h,'FD')}else doc.rect(x,y,c.w,h);
      doc.text(String(c.t||''),x+2,y+h/2+1.4,{maxWidth:c.w-4});
      x+=c.w;
    }
    y+=h;
  };
  // title
  doc.setFont('helvetica','bold');doc.setFontSize(15);
  const title="STUNT COORDINATOR'S RISK ASSESSMENT";
  const tw=doc.getTextWidth(title)+8;
  doc.rect(L,y-6,tw,10);doc.text(title,L+4,y+1);
  doc.setFontSize(11);doc.text(document.querySelector('.ranum').textContent,L+W,y+1,{align:'right'});
  y+=10;
  doc.setFontSize(8.5);
  // assessor
  doc.setFont('helvetica','bold');
  cellRow([{w:60,t:'ASSESSOR NAME'},{w:52,t:'MOBILE NUMBER'},{w:70,t:'EMAIL ADDRESS'}],6,{fill:1});
  doc.setFont('helvetica','normal');
  cellRow([{w:60,t:gv('[data-raset="assessor"]')},{w:52,t:gv('[data-raset="mobile"]')},{w:70,t:gv('[data-raset="email"]')}],7);
  line(3);
  const dayLbl=d._date?d._date.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):d.date;
  doc.setFont('helvetica','bold');
  cellRow([{w:50,t:'PRODUCTION COMPANY'},{w:52,t:'PRODUCTION TITLE'},{w:46,t:'FILMING DATE'},{w:34,t:'UNIT'}],6,{fill:1});
  doc.setFont('helvetica','normal');
  cellRow([{w:50,t:gv('[data-raset="company"]')},{w:52,t:gv('[data-raset="title"]')},{w:46,t:dayLbl},{w:34,t:(d.unit==='2nd'?'2nd Unit':'Main Unit')+' · D'+d.num}],7);
  line(3);
  cellRow([{w:96,t:'Location: '+d.loc},{w:44,t:'Hours: '+(d.hours||'—')},{w:42,t:'Weather factor: see notes'}],7);
  line(4);
  // scene blocks from live DOM (keeps user edits)
  const heads=[...document.querySelectorAll('.raSceneHead')];
  const hzs=[...document.querySelectorAll('[data-rakey^="hz-"]')];
  const cts=[...document.querySelectorAll('[data-rakey^="ct-"]')];
  const dets=[...document.querySelectorAll('.raBlockBody')];
  const envRows=[...document.querySelectorAll('.raRow.cols4')].slice(1); // skip production row
  heads.forEach((h,i)=>{
    pageGuard(30);
    doc.setFillColor(216,216,216);
    doc.setFont('helvetica','bold');doc.setFontSize(9);
    const shH=7;doc.rect(L,y,W,shH,'FD');doc.text(h.textContent,L+2,y+4.8,{maxWidth:W-4});y+=shH;
    // env row
    doc.setFont('helvetica','normal');doc.setFontSize(8);
    const env=envRows[i]?[...envRows[i].children].map(c=>c.textContent.trim()):[];
    cellRow(env.map(t=>({w:W/4,t})),6);
    // details
    doc.setFont('helvetica','bold');doc.setFillColor(17,17,17);
    doc.rect(L,y,W,5.5,'FD');doc.setTextColor(255);doc.text('DETAILS OF STUNT / SEQUENCE TO BE PERFORMED',L+2,y+3.8);doc.setTextColor(0);y+=5.5;
    doc.setFont('helvetica','normal');
    const det=doc.splitTextToSize(dets[i]?dets[i].textContent:'',W-4);
    const detH=det.length*3.6+3;pageGuard(detH);
    doc.rect(L,y,W,detH);doc.text(det,L+2,y+4);y+=detH;
    // hazards / controls
    const hzLines=doc.splitTextToSize(hzs[i]?hzs[i].value:'',W/2-6);
    const ctLines=doc.splitTextToSize(cts[i]?cts[i].value:'',W/2-6);
    const maxL=Math.max(hzLines.length,ctLines.length);
    doc.setFont('helvetica','bold');doc.setFontSize(8.5);
    cellRow([{w:W/2,t:'HAZARDS'},{w:W/2,t:'CONTROL MEASURES'}],6,{fill:1});
    doc.setFont('helvetica','normal');doc.setFontSize(8);
    let remainHz=hzLines,remainCt=ctLines;
    while(remainHz.length||remainCt.length){
      const room=Math.floor((282-y-4)/3.5);
      if(room<3){doc.addPage();y=16;continue}
      const take=Math.min(Math.max(remainHz.length,remainCt.length),room);
      const blockH=take*3.5+3;
      doc.rect(L,y,W/2,blockH);doc.rect(L+W/2,y,W/2,blockH);
      doc.text(remainHz.slice(0,take),L+2,y+4);
      doc.text(remainCt.slice(0,take),L+W/2+2,y+4);
      remainHz=remainHz.slice(take);remainCt=remainCt.slice(take);
      y+=blockH;
    }
    y+=5;
  });
  pageGuard(16);
  doc.setTextColor(163,0,0);doc.setFont('helvetica','bold');doc.setFontSize(8);
  doc.text('IMPORTANT — This assessment will be invalid if the control measures identified above cannot be fully and properly',L+W/2,y+4,{align:'center'});
  doc.text('implemented. If this is the case, the activity must be reassessed.',L+W/2,y+8,{align:'center'});
  doc.setTextColor(0);
  const fname=document.querySelector('.ranum').textContent+'_'+(gv('[data-raset="title"]').split(/[\s—-]/)[0]||'Production')+'.pdf';
  doc.save(fname);
}
$('#raPrint').addEventListener('click',raPDF);

// ---------- notes wiring (delegated) ----------
document.addEventListener('input',e=>{
  const cdc=e.target.closest('[data-cdchar]');
  if(cdc){
    const d=COST.dayById[CD_CTX], c=CDAY[cdayKey(d)];
    const i=+cdc.dataset.i, fld=cdc.dataset.cdchar;
    c.chars[i][fld]=(fld==='count'||fld==='sup')?(+cdc.value||0):cdc.value;
    saveCDAY();cdRefreshTotals();
    return;
  }
  const sld=e.target.closest('.dslider input');
  if(sld){
    const box=sld.closest('.dslider');
    const A=box.querySelector('.rA'),B=box.querySelector('.rB');
    let a=+A.value,b=+B.value;
    if(sld===A&&a>b-30){a=b-30;A.value=a}
    if(sld===B&&b<a+30){b=a+30;B.value=b}
    const pct=v=>((v-SLD_MIN)/(SLD_MAX-SLD_MIN)*100);
    const f=box.querySelector('.fill');f.style.left=pct(a)+'%';f.style.right=(100-pct(b))+'%';
    const callT=m2t(a),wrapT=m2t(b);
    if(box.dataset.slider==='cd'){
      const d=COST.dayById[CD_CTX], c=CDAY[cdayKey(d)];
      c.call=callT;c.wrap=wrapT;saveCDAY();
      const ci=CD_MOUNT.querySelector('[data-cdtime="call"]'),wi=CD_MOUNT.querySelector('[data-cdtime="wrap"]');
      if(ci)ci.value=callT;if(wi)wi.value=wrapT;
      const p2=cdPerHead(c,'SA');
      CD_MOUNT.querySelector('#cdHrsInfo').innerHTML=cdHrsText(c);
      const fl=CD_MOUNT.querySelector('#cdEarlyFlag');
      fl.className='cdflag '+((p2.earlyBlocks||p2.earlyTravel)?'on':'');
      fl.textContent=cdEarlyText(c);
      cdRefreshTotals();
    }else if(box.dataset.slider==='fc'){
      FC.call=callT;FC.wrap=wrapT;saveFC();
      const ci=$('#viewCalc [data-fctime="call"]'),wi=$('#viewCalc [data-fctime="wrap"]');
      if(ci)ci.value=callT;if(wi)wi.value=wrapT;
      renderFcOut();
    }
    return;
  }
  const fct=e.target.closest('[data-fctime]');
  if(fct){
    FC[fct.dataset.fctime]=fct.value||FC[fct.dataset.fctime];
    saveFC();syncSlider($('#viewCalc'),FC.call,FC.wrap);renderFcOut();
    return;
  }
  const scadj=e.target.closest('[data-scadj]');
  if(scadj){SC.adj=+scadj.value||0;saveSC();
    const p=scParts();
    const rows=$('#fcOut');
    const amts=rows.querySelectorAll('.fcrow .famt');
    if(amts.length>=6){amts[4].textContent=gbp(p.adj);amts[5].textContent=gbp(p.per)}
    const b=rows.querySelector('.grossline b');if(b)b.textContent=gbp(p.per*SC.heads);
    const m=rows.querySelector('.grossline .mono');if(m)m.textContent=gbp(p.per);
    return;
  }
  const sch=e.target.closest('[data-scheads]');
  if(sch){SC.heads=Math.max(1,+sch.value||1);saveSC();
    const p=scParts();
    const b=$('#fcOut .grossline b');if(b)b.textContent=gbp(p.per*SC.heads);
    return;
  }
  const fch=e.target.closest('[data-fcheads]');
  if(fch){FC.heads=Math.max(1,+fch.value||1);saveFC();
    const b=$('#fcOut .grossline b');if(b)b.textContent=gbp(fcPerTotal()*FC.heads);
    return;
  }
  const cdt=e.target.closest('[data-cdtime]');
  if(cdt){
    const d=COST.dayById[CD_CTX], c=CDAY[cdayKey(d)];
    c[cdt.dataset.cdtime]=cdt.value||c[cdt.dataset.cdtime];
    saveCDAY();
    syncSlider(CD_MOUNT,c.call,c.wrap);
    const p2=cdPerHead(c,'SA');
    CD_MOUNT.querySelector('#cdHrsInfo').innerHTML=cdHrsText(c);
    const fl=CD_MOUNT.querySelector('#cdEarlyFlag');
    fl.className='cdflag '+((p2.earlyBlocks||p2.earlyTravel)?'on':'');
    fl.textContent=cdEarlyText(c);
    cdRefreshTotals();
    return;
  }
  const rk=e.target.closest('[data-rakey]');
  if(rk){saveRAedit(rk.dataset.rakey,rk.value);return}
  const rset=e.target.closest('[data-raset]');
  if(rset){saveRAset(rset.dataset.raset,rset.value);return}
  const ta=e.target.closest('[data-notekey]');
  if(ta){
    saveNote(ta.dataset.notekey,ta.value);
    const strip=ta.closest('.strip');
    if(strip){
      const btn=strip.querySelector('.notebtn');
      if(btn)btn.classList.toggle('has',!!ta.value.trim());
    }
    const drow=ta.closest('.daynote-row');
    if(drow){
      const btn=drow.querySelector('.adddaynote');
      btn.classList.toggle('has',!!ta.value.trim());
      btn.textContent=ta.value.trim()?'✎ Day note':'＋ Add day note';
    }
  }
});

// ---------- filters / tabs / nav / clicks ----------
function sceneMatches(s,q){
  if(s.num.toLowerCase().includes(q))return true;
  if((s.slug+' '+s.desc).toLowerCase().includes(q))return true;
  for(const c of s.cast){
    if(String(c.code).toLowerCase()===q||String(c.code).toLowerCase().includes(q))return true;
    if(personName(c.code).toLowerCase().includes(q))return true;
  }
  for(const x of (s.extras||[]))if(x.name.toLowerCase().includes(q))return true;
  return false;
}
function dayMatches(d,q){
  const dn='d'+d.num;
  if(dn===q||String(d.num)===q)return true;
  if(d.date.toLowerCase().includes(q))return true;
  if((d.loc||'').toLowerCase().includes(q))return true;
  if(chipDate(d).toLowerCase().includes(q))return true;
  return false;
}
function applyFilters(){
  const st=$('#fltStunt').checked;
  const q=($('#search').value||'').trim().toLowerCase();
  $('.searchwrap').classList.toggle('hasq',!!q);
  for(const d of MODEL.days){
    const card=document.getElementById('day-'+d.id);
    if(!card)continue;
    let show=(!st||card.dataset.stunt==='1');
    let anyHit=false;
    // Search FILTERS rather than highlights (changed from the prototype at
    // Tyler's request): non-matching days are hidden, and inside a matching
    // day only the matching scenes stay visible — unless the day itself
    // matched (by number, date or location), in which case all its scenes show.
    const dayHit=q?dayMatches(d,q):false;
    const strips=card.querySelectorAll(':scope > .strip');
    d.scenes.forEach((s,i)=>{
      const hit=q?sceneMatches(s,q):false;
      if(strips[i])strips[i].style.display=(!q||hit||dayHit)?'':'none';
      if(hit)anyHit=true;
    });
    if(q&&show)show=anyHit||dayHit;
    card.style.display=show?'':'none';
  }
  document.querySelectorAll('#viewDays .breakline').forEach(b=>b.style.display=(st||q)?'none':'');
  if(typeof updateCalFilter==='function'&&document.querySelector('.cal-cell'))updateCalFilter();
}
// open / toggle the inline per-scene crowd/stunt editor
document.addEventListener('click',e=>{
  const cell=e.target.closest('[data-reqedit]');
  if(cell){
    const nk=cell.dataset.reqedit;
    const area=cell.closest('.strip').querySelector('.reqarea');
    if(!area)return;
    const opening=area.classList.contains('hidden');
    document.querySelectorAll('.reqarea').forEach(a=>{if(a!==area){a.classList.add('hidden');a.innerHTML='';}});
    if(opening){area.innerHTML=reqEditorHTML(nk);area.classList.remove('hidden');OPEN_REQ=nk;const f=area.querySelector('input');if(f)f.focus();}
    else{area.classList.add('hidden');area.innerHTML='';OPEN_REQ=null;}
    return;
  }
  const addc=e.target.closest('[data-rqaddchar]');
  if(addc){
    const holder=addc.closest('.reqsec').querySelector('.reqchars');
    const row=document.createElement('div');row.className='reqrow';
    row.innerHTML=`<input data-rq="cname" value="" placeholder="Character / group name"><input data-rq="ccount" type="number" min="0" value="1"><select data-rq="ctier"><option selected>SA</option><option>SPACT</option></select><label class="reqfeat"><input type="checkbox" data-rq="cfeat"> Featured</label><button data-rqdel="1">✕</button>`;
    holder.appendChild(row);row.querySelector('input').focus();
    return;
  }
  const rdel=e.target.closest('[data-rqdel]');
  if(rdel){const area=rdel.closest('.reqarea');rdel.closest('.reqrow').remove();commitReqEditor(area,true);return}
  const rclose=e.target.closest('[data-rqclose]');
  if(rclose){const area=rclose.closest('.reqarea');commitReqEditor(area,false);return}
  const nb=e.target.closest('[data-note]');
  if(nb){
    const area=nb.closest('.strip').querySelector('.notearea');
    area.classList.toggle('hidden');
    if(!area.classList.contains('hidden'))area.querySelector('textarea').focus();
    return;
  }
  const dn=e.target.closest('[data-daynote]');
  if(dn){
    const ta=dn.closest('.daynote-row').querySelector('textarea');
    ta.classList.toggle('hidden');
    if(!ta.classList.contains('hidden'))ta.focus();
    return;
  }
  const tch=e.target.closest('.tablecard>h3');
  if(tch&&!e.target.closest('button')&&!e.target.closest('a')){tch.parentElement.classList.toggle('closed');return}
  const sseg=e.target.closest('[data-scseg] button');
  if(sseg){SC[sseg.parentElement.dataset.scseg]=sseg.dataset.v;saveSC();renderStuntCalc();return}
  const fseg=e.target.closest('[data-fcseg] button');
  if(fseg&&!fseg.disabled){
    FC[fseg.parentElement.dataset.fcseg]=fseg.dataset.v;
    saveFC();renderFreeCalc();
    return;
  }
  const seg=e.target.closest('[data-cdseg] button');
  if(seg){
    const d=COST.dayById[CD_CTX], c=CDAY[cdayKey(d)];
    c[seg.parentElement.dataset.cdseg]=seg.dataset.v;
    saveCDAY();renderCdModal();
    return;
  }
  const cda=e.target.closest('[data-cdadd]');
  if(cda){
    const d=COST.dayById[CD_CTX], c=CDAY[cdayKey(d)];
    c.chars.push({name:'',count:1,tier:'SA',scene:''});
    saveCDAY();renderCdModal();
    const inputs=document.querySelectorAll('#cdChars input[data-cdchar="name"]');
    inputs[inputs.length-1].focus();
    return;
  }
  const cdd=e.target.closest('[data-cddel]');
  if(cdd){
    const d=COST.dayById[CD_CTX], c=CDAY[cdayKey(d)];
    c.chars.splice(+cdd.dataset.cddel,1);
    saveCDAY();renderCdModal();
    return;
  }
  const cdApply=e.target.closest('[data-cdapplyall]');
  if(cdApply){
    const d0=COST.dayById[CD_CTX], c0=CDAY[cdayKey(d0)];
    let n=0;
    for(const d of MODEL.days){
      if(!CROWD.perDay[d.id]&&!dayPeakSA(d)&&!d.scenes.some(s=>(s.featured||[]).length||(s.spacts||[]).length))continue;
      const key=cdayKey(d);
      if(!CDAY[key])CDAY[key]=seedCday(d);
      Object.assign(CDAY[key],{shift:c0.shift,fw:c0.fw,ph:c0.ph,call:c0.call,wrap:c0.wrap,travel:c0.travel});
      n++;
    }
    saveCDAY();cdRecalcApp();renderCdModal();
    setStatus(`Timings applied to ${n} crowd days`);
    setTimeout(()=>setStatus(''),3000);
    return;
  }
  const aa=e.target.closest('#adjAdd');
  if(aa){
    const label=$('#adjLabel').value.trim(), amt=+$('#adjAmt').value;
    if(!label||!(amt>0))return;
    const d=COST.dayById[aa.dataset.adjday];
    (ADJ[adjKey(d)]=ADJ[adjKey(d)]||[]).push({label,amt});
    saveAdj();computeCosts();renderSummary();renderDays();renderStunts();renderCalendar();
    openCostModal(d.id);
    return;
  }
  const da=e.target.closest('[data-deladj]');
  if(da){
    const d=COST.dayById[da.dataset.adjday];
    ADJ[adjKey(d)].splice(+da.dataset.deladj,1);
    if(!ADJ[adjKey(d)].length)delete ADJ[adjKey(d)];
    saveAdj();computeCosts();renderSummary();renderDays();renderStunts();renderCalendar();
    openCostModal(d.id);
    return;
  }
  const cb=e.target.closest('[data-costday]');
  if(cb){$('#calModal').classList.remove('open');openCostModal(cb.dataset.costday);return}
  const rb=e.target.closest('[data-raday]');
  if(rb){$('#calModal').classList.remove('open');openRA(rb.dataset.raday);return}
  const wk=e.target.closest('tr.wk-exp');
  if(wk){
    wk.classList.toggle('openrow');
    let n=wk.nextElementSibling;
    while(n&&n.classList.contains('wk-sub')){n.classList.toggle('hidden');n=n.nextElementSibling}
    return;
  }
  const t=e.target.closest('[data-view]');
  if(t){
    document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b===t));
    ['days','cal','stunts','crowd','calc','cast'].forEach(v=>$('#view'+v[0].toUpperCase()+v.slice(1)).classList.toggle('hidden',v!==t.dataset.view));
    return;
  }
  const cvb=e.target.closest('[data-calview]');
  if(cvb){CALVIEW=cvb.dataset.calview;store.set('stuntos-calview',CALVIEW);renderCalendar();return}
  const cp=e.target.closest('[data-calpop]');
  if(cp){openCalDay(cp.dataset.calpop);return}
  const cg=e.target.closest('[data-calgo]');
  if(cg){
    $('#calModal').classList.remove('open');
    document.querySelector('.tabs button[data-view="days"]').click();
    $('#fltStunt').checked=false;$('#search').value='';applyFilters();
    const el=document.getElementById('day-'+cg.dataset.calgo);
    if(el&&el.scrollIntoView)el.scrollIntoView({block:'start'});
    return;
  }
  const rt=e.target.closest('[data-rangetoggle]');
  if(rt){
    const sheet=rt.parentElement.querySelector('.dsheet');
    const nowHidden=sheet.classList.toggle('hidden');
    rt.querySelector('.rcnt').textContent=rt.querySelector('.rcnt').textContent.replace(nowHidden?'▴':'▾',nowHidden?'▾':'▴');
    return;
  }
  const mc=e.target.closest('[data-morechips]');
  if(mc){
    const span=mc.parentElement.querySelector('.morechips');
    const open=span.classList.toggle('hidden');
    mc.textContent=open?('+'+span.querySelectorAll('.dchip').length+' more'):'show less';
    return;
  }
  const co=e.target.closest('[data-cdopen]');
  if(co&&!e.target.closest('[data-goto]')&&!e.target.closest('a')&&!e.target.closest('.cdexp')){openCrowdInline(co.dataset.cdopen,co);return}
  const g=e.target.closest('[data-goto]');
  if(g){
    document.querySelector('.tabs button[data-view="days"]').click();
    $('#fltStunt').checked=false;applyFilters();
    const el=document.getElementById('day-'+g.dataset.goto);
    if(el)el.scrollIntoView({block:'start'});
    return;
  }
  const am=e.target.closest('[data-appmode]');
  if(am){setAppMode(am.dataset.appmode);return}
  const s=e.target.closest('[data-src]');
  if(s)setActive(+s.dataset.src);
});
document.addEventListener('change',e=>{
  if(e.target.matches('[data-cdsup]')){
    const d=COST.dayById[CD_CTX], c=CDAY[cdayKey(d)];
    c.chars[+e.target.dataset.cdsup].sup=+e.target.value||0;
    saveCDAY();renderCdModal();
    return;
  }
  if(e.target.matches('[data-fcph]')){FC.ph=e.target.checked;saveFC();renderFreeCalc();return}
  if(e.target.matches('[data-scins]')){SC.ins=e.target.checked;saveSC();renderStuntCalc();return}
  if(e.target.matches('[data-fcsup]')){
    const k=e.target.dataset.fcsup;
    FC.sups=e.target.checked?[...new Set([...FC.sups,k])]:FC.sups.filter(x=>x!==k);
    saveFC();renderFcOut();return;
  }
  if(e.target.matches('[data-fcmeal]')){
    FC.meals[e.target.dataset.fcmeal]=e.target.checked;
    saveFC();renderFcOut();return;
  }
  if(e.target.matches('[data-cdph]')){
    const d=COST.dayById[CD_CTX], c=CDAY[cdayKey(d)];
    c.ph=e.target.checked;saveCDAY();renderCdModal();
  }
});
$('#fltStunt').addEventListener('change',applyFilters);
$('#search').addEventListener('input',applyFilters);
$('#searchClear').addEventListener('click',()=>{$('#search').value='';applyFilters()});
$('#tglCosts').addEventListener('change',e=>document.body.classList.toggle('hide-costs',!e.target.checked));
['rPerf','rHol','rIns','rInsDays','rUse','rCoord','rSDRate','rSDDays','rSDOn','cSA','cSpact','cHol','cOTday','cOTnight','cET','cTravelA','cTravelB','cSpactNight','cSpactHol','cSpactET'].forEach(id=>{
  const fn=()=>{if(!MODEL)return;computeCosts();computeCrowdCosts();renderSummary();renderDays();renderStunts();renderCrowd();renderCalendar();renderCast();renderFreeCalc()};
  // (renderFreeCalc branches to the stunt calculator in StuntOS mode)
  $('#'+id).addEventListener('input',fn);
  $('#'+id).addEventListener('change',fn);
});

// ---------- app mode (StuntOS / CrowdOS) ----------
function setAppMode(m){
  APPMODE=m;
  store.set('stuntos-appmode',m);
  document.querySelectorAll('#modeBar button').forEach(b=>b.classList.toggle('on',b.dataset.appmode===m));
  $('#brandMark').textContent=m==='crowd'?'C':'S';
  $('#brandName').innerHTML=m==='crowd'?'Crowd<em>OS</em>':'Stunt<em>OS</em>';
  document.title=(m==='crowd'?'CrowdOS':'StuntOS')+' — Schedule Breakdown';
  $('#ratesBar').classList.toggle('hidden',m==='crowd');
  $('#crowdRatesBar').classList.toggle('hidden',m!=='crowd');
  $('#spactRatesBar').classList.toggle('hidden',m!=='crowd');
  $('#tabBreakdown').textContent=m==='crowd'?'Crowd cost breakdown':'Stunt cost breakdown';
  $('#fltLabel').textContent=m==='crowd'?'Crowd days only':'Stunt days only';
  $('#tabCrowd').textContent=m==='crowd'?'Crowd':'Stunts by day';
  /* Calculator tab lives in both modes — content branches on APPMODE */
  if(MODEL){computeCosts();computeCrowdCosts();renderSummary();renderDays();renderStunts();renderCrowd();renderCalendar();renderCast();renderFreeCalc();}
  // the dashboard is mode-specific (crowd vs stunt figures, "no requirement")
  if(DASH)renderDash();
}

// ---------- sources ----------
function renderSrcBar(){
  $('#srcBar').innerHTML=SOURCES.map((s,i)=>`<button data-src="${i}" class="${i===ACTIVE?'on':''}" data-tip="${esc(s.title)}"><span class="k">${s.model.days.length}d</span>${esc(s.short)}</button>`).join('');
}
function setActive(i){
  ACTIVE=i;MODEL=SOURCES[i].model;NS=SOURCES[i].ns||'';
  applyTheme(SOURCES[i].colour);
  renderSrcBar();
  computeCosts();computeCrowdCosts();renderSummary();renderDays();renderStunts();renderCrowd();renderCalendar();renderCast();renderFreeCalc();
  window.scrollTo(0,0);
}
function addSource(model,title,short,activate=true,opts={}){
  if(!model.days.length&&!opts.allowEmpty){setStatus('No shoot days found in that schedule.');return false}
  const colour=opts.colour||detectColour(title,model._raw||'');
  SOURCES.push({model,title,short:short||title,colour,kind:opts.kind,text:opts.text,unit:opts.unit,ns:opts.ns,cloudId:opts.cloudId,createdAt:opts.createdAt,prod:opts.prod,version:opts.version,schedDate:opts.schedDate,format:opts.format,rateCard:opts.rateCard||null,current:!!opts.current});
  if(activate)setActive(SOURCES.length-1);else renderSrcBar();
  return true;
}
function setStatus(msg){$('#status').textContent=msg}

// ---------- add production: two doors in, one data shape ----------
// Manual days and parsed days are identical ShootDay objects — same cost
// engine, same views. User-added productions persist in localStorage until
// per-production Supabase storage lands.
function refreshAll(){
  computeCosts();computeCrowdCosts();renderSummary();renderDays();renderStunts();renderCrowd();renderCalendar();renderCast();renderFreeCalc();
}
function saveUserSources(){
  store.set('crowdos-sources',JSON.stringify(SOURCES.filter(s=>s.kind).map(s=>({kind:s.kind,title:s.title,short:s.short,unit:s.unit||'Main',text:s.text||null,prod:s.prod||null,version:s.version||null,schedDate:s.schedDate||null,colour:s.colour||null,format:s.format||null,rateCard:s.rateCard||null,current:!!s.current,createdAt:s.createdAt||null}))));
}
function saveManualDays(){
  const map={};
  for(const s of SOURCES){
    const md=s.model.days.filter(d=>d.manual);
    if(md.length)map[s.title]=md.map(d=>({num:d.num,date:d.date,loc:d.loc,hours:d.hours,type:d.type,unit:d.unit}));
  }
  store.set('crowdos-manualdays',JSON.stringify(map));
}
function sortDays(model){model.days.sort((x,y)=>((x._date&&x._date.getTime())||0)-((y._date&&y._date.getTime())||0)||x.num-y.num)}
function reviveDay(rec){
  const d={sr:'',ss:'',cams:'',scenes:[],pages:'',loc:'',hours:'',type:'',...rec,manual:true};
  d.id=(d.unit==='2nd'?'U':'M')+d.num;
  d._date=parseDayDate(d);
  return d;
}
function restoreManualDays(s){
  let map={};try{map=JSON.parse(store.get('crowdos-manualdays')||'{}')}catch(e){map={}}
  for(const rec of (map[s.title]||[])){
    if(s.model.days.some(d=>d.unit===rec.unit&&d.num===rec.num))continue;
    s.model.days.push(reviveDay(rec));
  }
  sortDays(s.model);
}

// ---------- door 2: schedule import (same extraction as the prototype) ----------
async function pdfToText(buf){
  // the LEGACY build — the modern one uses JS features Safari lacks
  // ("undefined is not a function" on upload in Safari)
  const pdfjsLib=await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
  const doc=await pdfjsLib.getDocument({data:buf}).promise;
  const out=[];
  for(let p=1;p<=doc.numPages;p++){
    setStatus(`Reading page ${p} of ${doc.numPages}…`);
    const page=await doc.getPage(p);
    const tc=await page.getTextContent();
    const items=tc.items.filter(it=>{
      const tr=it.transform,scale=Math.hypot(tr[0],tr[1]);
      const rotated=Math.abs(tr[1])>0.5||Math.abs(tr[2])>0.5;
      return !rotated&&scale<20&&it.str.trim();
    });
    // column-aware layout: keeps side-by-side categories (Background Actors
    // | Vehicles) from merging into single polluted lines
    out.push(...layoutToLines(items.map(it=>({str:it.str,x:it.transform[4],y:it.transform[5],w:it.width||0}))));
  }
  return out.join('\n');
}
// Best-effort metadata guesses shown in the import-confirm dialog — the
// user always gets to correct them before anything is saved.
function guessImportMeta(text,title){
  const head=text.split('\n').slice(0,40).map(l=>l.trim());
  let prod='';
  for(const l of head){
    if(/^[A-Z][A-Z0-9 &']{2,26}$/.test(l)&&!/SCHEDULE|SHOOTING|FULL FAT|BLOCK|INTERIM|CONFIDENTIAL|SHOOT|^DAY\b|PAGE|UNIT|CAST|MEMBERS|WEEK|STUNT/i.test(l)){prod=l;break}
    const mm=l.match(/^([A-Z][A-Z0-9 &']+?)\s*\/\//);
    if(mm){prod=mm[1];break}
  }
  if(!prod)prod=title.split(/\s+/)[0]||title;
  prod=prod.replace(/\s*\/\/.*$/,'').trim();
  prod=prod.charAt(0)+prod.slice(1).toLowerCase();
  const version=(title.match(/\b(blue|pink|yellow|green|salmon|white|b&w|b\/w|black ?& ?white|goldenrod|lavender|cherry|buff|tan)\b/i)||[])[1]||'';
  let date='';
  for(const l of head){
    const dm=l.match(/\b(\d{1,2})[ -]([A-Z][a-z]+)[ -](\d{4})\b/);
    if(dm){date=dm[1]+' '+dm[2]+' '+dm[3];break}
  }
  return {prod,version:version?version.charAt(0).toUpperCase()+version.slice(1):'',date};
}
let PENDING_IMPORT=null;
// parse honouring the user's format flag (Auto / Full Fat / One-Liner)
function parseWith(format,text){
  if(format==='expanded')return parseExpanded(text);
  if(format==='oneliner'){
    // the classic one-line grammar; but many "one-liners" (IE-leading or
    // End-of-DAY delimited) actually need the fuller parser — fall back
    const m=parseSchedule(text);
    return m.days.length?m:parseAny(text);
  }
  return parseAny(text);
}
function fillImpRateSelect(sel){
  $('#impRate').innerHTML='<option value="">PACT/FAA 2026 (defaults)</option>'+Object.keys(RATECARDS).map(n=>`<option>${esc(n)}</option>`).join('');
  $('#impRate').value=sel||'';
}
// production picker: existing productions + "＋ New production…"
function fillImpProdSelect(selected){
  const names=prodNames();
  $('#impProd').innerHTML=names.map(n=>`<option${n===selected?' selected':''}>${esc(n)}</option>`).join('')+`<option value="__new"${!names.includes(selected)?' selected':''}>＋ New production…</option>`;
  syncImpProdRows();
}
function syncImpProdRows(){
  const isNew=$('#impProd').value==='__new';
  $('#impNewNameRow').style.display=isNew?'':'none';
  // rate card is a production setting — only asked when creating a new one;
  // importing into an existing production inherits its card
  $('#impRateRow').style.display=(isNew&&IMP_EDIT==null)?'':'none';
}
async function handlePDF(file){
  try{
    setStatus('Opening '+file.name+'…');
    const buf=await file.arrayBuffer();
    const text=await pdfToText(buf);
    try{window.__crowdosLastExtract=text}catch(e){} // debugging: raw extracted text of the last upload
    setStatus('Breaking the schedule down…');
    const title=file.name.replace(/\.pdf$/i,'').replace(/[_]+/g,' ');
    const m=parseAny(text);
    if(!m.days.length){setStatus('No shoot days found in that schedule — send it to us and we’ll teach the parser its format.');return}
    const guess=guessImportMeta(text,title);
    PENDING_IMPORT={text,title};
    IMP_EDIT=null;$('#impGo').textContent='Import schedule';$('#impTitle')&&($('#impTitle').textContent='Import schedule');
    $('#impSub').textContent=file.name;
    // default target: the production we were told to import into, else one
    // matching the guessed name, else a new production
    const match=(CURPROD&&PRODS[CURPROD]&&CURPROD)||prodNames().find(n=>n.toLowerCase()===(guess.prod||'').toLowerCase());
    fillImpProdSelect(match||'__new');
    $('#impNewName').value=match?'':guess.prod;
    // uploading a new revision into a specific unit → preselect that unit
    $('#impUnit').value=CURUNIT||(/2nd|second/i.test(title)?'2nd':'Main');
    CURUNIT=null;
    $('#impVer').value=guess.version;
    $('#impDate').value=guess.date;
    $('#impFormat').value='auto';
    const vLow=(guess.version||'').toLowerCase();
    $('#impColour').value=THEMES[vLow]?vLow:detectColour(title,text.slice(0,1000));
    fillImpRateSelect('');
    const scenes=m.days.reduce((a,d)=>a+d.scenes.length,0);
    $('#impInfo').textContent=m.days.length+' shoot days · '+scenes+' scenes found';
    $('#impModal').classList.add('open');
    setStatus('');
  }catch(err){console.error(err);setStatus('Couldn’t read that PDF ('+err.message+').')}
}
// the same dialog also edits an existing production's details
let IMP_EDIT=null;
function openEditMeta(i){
  const s=SOURCES[i];if(!s)return;
  IMP_EDIT=i;PENDING_IMPORT=null;
  $('#impSub').textContent='Edit schedule details';
  fillImpProdSelect(s.prod||s.title);
  $('#impNewName').value='';
  $('#impUnit').value=s.unit==='2nd'?'2nd':'Main';
  $('#impVer').value=s.version||'';
  $('#impDate').value=s.schedDate||'';
  $('#impFormat').value=s.format||'auto';
  $('#impColour').value=s.colour||'white';
  $('#impInfo').textContent=s.model.days.length+' shoot days';
  $('#impGo').textContent='Save details';
  $('#impModal').classList.add('open');
}
document.addEventListener('click',e=>{
  const ed=e.target.closest('[data-editsrc]');
  if(ed){e.stopPropagation();e.preventDefault();openEditMeta(+ed.dataset.editsrc);}
},true);
$('#impGo').addEventListener('click',()=>{
  if(IMP_EDIT!=null){
    const s=SOURCES[IMP_EDIT];
    const idx=IMP_EDIT;
    IMP_EDIT=null;$('#impGo').textContent='Import schedule';
    if(s){
      const pn=resolveImpProd()||s.title;
      ensureProd(pn,{colour:$('#impColour').value});
      s.prod=pn;
      s.version=($('#impVer').value||'').trim();
      s.schedDate=($('#impDate').value||'').trim();
      s.colour=$('#impColour').value||'white';
      const newUnit=$('#impUnit').value;
      const newFormat=$('#impFormat').value;
      if(s.kind==='pdf'&&s.text&&(newUnit!==s.unit||newFormat!==(s.format||'auto'))){
        s.unit=newUnit;s.format=newFormat;
        s.model=prepModel(parseWith(newFormat,s.text),newUnit);
        s.model._raw=s.text.slice(0,1000)+' '+s.title;
      }
      saveUserSources();
      if(CLOUD.session&&s.cloudId)cloud.updateProduction(s.cloudId,s).then(r=>{
        if(r.error)setStatus('Cloud save failed: '+r.error.message);
      });
      if(!DASH&&ACTIVE===idx)setActive(idx);
      else{renderSidebar();if(DASH)renderDash();}
    }
    $('#impModal').classList.remove('open');
    return;
  }
  const P=PENDING_IMPORT;
  if(!P){setStatus('Nothing pending to import — choose a PDF again.');closeImp();return}
  const unit=$('#impUnit').value;
  const isNew=$('#impProd').value==='__new';
  const prod=resolveImpProd()||P.title;
  const version=($('#impVer').value||'').trim();
  const schedDate=($('#impDate').value||'').trim();
  const format=$('#impFormat').value;
  const colour=$('#impColour').value||'white';
  // rate card is the PRODUCTION's — set it only when creating a new production
  const rcName=isNew?$('#impRate').value:'';
  const newCard=rcName&&RATECARDS[rcName]?{name:rcName,vals:RATECARDS[rcName]}:null;
  ensureProd(prod,isNew?{rateCard:newCard,colour}:{colour});
  const rateCard=(PRODS[prod]&&PRODS[prod].rateCard)||null;
  const m=prepModel(parseWith(format,P.text),unit);
  m._raw=P.text.slice(0,1000)+' '+P.title;
  if(!m.days.length){setStatus('No shoot days found with that format — try a different Format setting.');return}
  if(addSource(m,P.title,P.title.slice(0,18),true,{kind:'pdf',text:P.text,unit,ns:'p:'+P.title,prod,version,schedDate,colour,format,rateCard})){
    const src=SOURCES[SOURCES.length-1];
    src.createdAt=new Date().toISOString();
    src.sessionNew=true;
    // a new upload becomes the current revision for its unit: clear any
    // manual "make current" override on its siblings so newest-by-date wins
    for(const s of SOURCES)if(s!==src&&s.kind&&(s.prod||s.title)===(src.prod||src.title)&&(s.unit||'Main')===(src.unit||'Main')){s.current=false;if(CLOUD.session&&s.cloudId)cloud.updateProduction(s.cloudId,s).catch(()=>{});}
    restoreManualDays(src);
    saveUserSources();
    if(CLOUD.session)cloud.insertProduction(src).then(({id,error})=>{
      if(error){src.cloudFailed=true;setStatus('Cloud save failed: '+error.message)}else src.cloudId=id;
    });
  }
  PENDING_IMPORT=null;
  $('#impModal').classList.remove('open');
});
function resolveImpProd(){
  let n=$('#impProd').value;
  if(n==='__new')n=($('#impNewName').value||'').trim();
  return n;
}
$('#impProd').addEventListener('change',syncImpProdRows);
function closeImp(){PENDING_IMPORT=null;IMP_EDIT=null;$('#impGo').textContent='Import schedule';$('#impModal').classList.remove('open')}
$('#impClose').addEventListener('click',closeImp);
$('#impModal').addEventListener('click',e=>{if(e.target.id==='impModal')closeImp()});
$('#fileInput').addEventListener('change',e=>{if(e.target.files[0])handlePDF(e.target.files[0]);e.target.value='';});

// ---------- production settings modal (create / edit) ----------
// "+ Add schedule" imports a PDF into any production; "+ New production" sets
// one up first (name, rate card, default colour), then you import into it.
$('#btnAdd').addEventListener('click',()=>$('#fileInput').click());
let PM_EDIT=null; // name of the production being edited (null = creating new)
function openProdModal(name){
  PM_EDIT=name||null;
  $('#pmTitle').textContent=name?'Production settings':'New production';
  $('#pmName').value=name||'';
  $('#pmRate').innerHTML='<option value="">PACT/FAA 2026 (defaults)</option>'+Object.keys(RATECARDS).map(n=>`<option>${esc(n)}</option>`).join('');
  const p=name?PRODS[name]:null;
  $('#pmRate').value=p&&p.rateCard&&p.rateCard.name||'';
  $('#pmColour').value=p&&p.colour||'white';
  $('#pmDelete').style.display=name?'':'none';
  $('#pmSave').textContent=name?'Save settings':'Create production';
  $('#pmInfo').textContent='';
  $('#prodModal').classList.add('open');
}
function closeProdModal(){$('#prodModal').classList.remove('open')}
$('#pmClose').addEventListener('click',closeProdModal);
$('#prodModal').addEventListener('click',e=>{if(e.target.id==='prodModal')closeProdModal()});
$('#pmSave').addEventListener('click',()=>{
  const name=($('#pmName').value||'').trim();
  if(!name){$('#pmInfo').textContent='Give the production a name.';return}
  if(!PM_EDIT&&PRODS[name]){$('#pmInfo').textContent='A production with that name already exists.';return}
  const rcName=$('#pmRate').value;
  const rateCard=rcName&&RATECARDS[rcName]?{name:rcName,vals:RATECARDS[rcName]}:null;
  const colour=$('#pmColour').value||'white';
  if(PM_EDIT&&PM_EDIT!==name){
    // rename: move settings and repoint every schedule
    PRODS[name]=PRODS[PM_EDIT];delete PRODS[PM_EDIT];
    for(const s of SOURCES)if(s.prod===PM_EDIT)s.prod=name;
  }
  ensureProd(name,{rateCard,colour});
  saveUserSources();
  if(CLOUD.session){
    for(const s of SOURCES)if(s.prod===name&&s.cloudId)cloud.updateProduction(s.cloudId,s).catch(()=>{});
  }
  closeProdModal();
  if(!PM_EDIT){
    // brand-new empty production: land in it with the add-day / import prompts
    CURPROD=name;showEmptyProd(name);
  }else{
    if(!DASH&&SOURCES[ACTIVE])setActive(ACTIVE);else{renderSidebar();if(DASH)renderDash();}
  }
});
$('#pmDelete').addEventListener('click',()=>{
  const name=PM_EDIT;if(!name)return;
  if(!window.confirm('Delete “'+name+'” and all its schedules? This cannot be undone.'))return;
  deleteProduction(name);
  closeProdModal();
});
function deleteProduction(name){
  for(let i=SOURCES.length-1;i>=0;i--){
    const s=SOURCES[i];
    if(s.prod!==name)continue;
    if(CLOUD.session&&s.cloudId)cloud.deleteProduction(s.cloudId).catch(()=>{});
    for(const k of Object.keys(CDAY))if(keyParts(k).ns===s.ns)delete CDAY[k];
    for(const k of Object.keys(ADJ))if(keyParts(k).ns===s.ns)delete ADJ[k];
    SOURCES.splice(i,1);
  }
  delete PRODS[name];saveProds();
  if(CLOUD.session&&cloud.deleteProd)cloud.deleteProd(name).catch(()=>{});
  saveCDAY();saveAdj();saveUserSources();saveManualDays();
  ACTIVE=Math.min(ACTIVE,2);CURPROD=null;
  showDash();
}
// A production with no schedules yet: offer the two ways to add work.
let CURPROD=null;
function showEmptyProd(name){
  DASH=false;CURPROD=name;
  $('#dashView').classList.add('hidden');
  $('#boardView').classList.remove('hidden');
  $('#colourPill').style.display='none';
  const first=$('#viewDays');
  // hide the normal board views, show a placeholder in the days area
  ['viewCal','viewStunts','viewCrowd','viewCalc','viewCast'].forEach(id=>$('#'+id)&&$('#'+id).classList.add('hidden'));
  first.classList.remove('hidden');
  first.innerHTML=`<div class="tablecard" style="text-align:center;padding:40px 20px">
    <div class="dash-head" style="font-size:22px">${esc(name)}</div>
    <div style="color:var(--sub);font-size:12.5px;margin:6px 0 20px">No schedules yet — import a shoot schedule, or add shoot days by hand.</div>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      <button class="tb-btn" id="epImport" style="border-color:var(--hv-line);color:var(--hv);padding:11px 16px">Import a schedule PDF</button>
      <button class="tb-btn" id="epManual" style="padding:11px 16px">Add shoot days by hand</button>
    </div></div>`;
  renderSidebar();
  window.scrollTo(0,0);
}
document.addEventListener('click',e=>{
  if(e.target.closest('#epImport')){$('#fileInput').click();return}
  if(e.target.closest('#epManual')){
    // create a manual schedule inside the current production and open it
    const name=CURPROD;if(!name)return;
    addSource({days:[],castMap:{},notes:[]},name,name.slice(0,16),true,{kind:'manual',ns:'m:'+name,allowEmpty:true,colour:(PRODS[name]&&PRODS[name].colour)||'white',prod:name});
    const src=SOURCES[SOURCES.length-1];
    src.createdAt=new Date().toISOString();src.sessionNew=true;
    saveUserSources();
    if(CLOUD.session)cloud.insertProduction(src).then(({id,error})=>{if(error){src.cloudFailed=true}else src.cloudId=id});
  }
});

function openDayModal(){
  const last=MODEL.days.length?MODEL.days[MODEL.days.length-1]:null;
  if(last&&last._date){
    const n=new Date(last._date);n.setDate(n.getDate()+1);
    $('#dmDate').value=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');
  }else $('#dmDate').value='';
  $('#dmLoc').value='';$('#dmHours').value='';
  $('#dayModal').classList.add('open');
}
function addManualDay(){
  const dv=$('#dmDate').value;
  if(!dv){setStatus('Pick a date for the new shoot day.');return}
  const unit=$('#dmUnit').value;
  const[dy,dm,dd]=dv.split('-').map(Number);
  const dt=new Date(dy,dm-1,dd);
  const date=dt.toLocaleDateString('en-GB',{weekday:'long'})+', '+dd+' '+dt.toLocaleDateString('en-GB',{month:'long'})+' '+dy;
  const num=Math.max(0,...MODEL.days.filter(d=>d.unit===unit).map(d=>d.num))+1;
  const d=reviveDay({num,date,loc:$('#dmLoc').value.trim(),hours:$('#dmHours').value.trim(),type:$('#dmType').value,unit});
  MODEL.days.push(d);sortDays(MODEL);
  saveManualDays();
  const src=SOURCES[ACTIVE];
  if(CLOUD.session&&src.cloudId)cloud.upsertManualDay(src.cloudId,d).then(r=>{
    if(r.error)setStatus('Cloud save failed: '+r.error.message);
  });
  refreshAll();
  $('#dayModal').classList.remove('open');
  setStatus('');
  const el=document.getElementById('day-'+d.id);if(el)el.scrollIntoView({block:'center'});
  if(APPMODE==='crowd')openCrowdDay(d.id);
}
$('#dmAdd').addEventListener('click',addManualDay);
$('#dmClose').addEventListener('click',()=>$('#dayModal').classList.remove('open'));
$('#dayModal').addEventListener('click',e=>{if(e.target.id==='dayModal')$('#dayModal').classList.remove('open')});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#prodModal').classList.remove('open');$('#dayModal').classList.remove('open')}});
document.addEventListener('click',e=>{
  if(e.target.closest('#btnAddDay')){openDayModal();return}
  const del=e.target.closest('[data-delday]');
  if(del){
    const id=del.dataset.delday;
    const d=MODEL.days.find(x=>x.id===id);
    if(d&&window.confirm('Remove '+d.id+' ('+d.date+')? Its day-calculator settings are kept in case you re-add it.')){
      MODEL.days=MODEL.days.filter(x=>x!==d);
      saveManualDays();
      const src=SOURCES[ACTIVE];
      if(CLOUD.session&&src.cloudId)cloud.deleteManualDay(src.cloudId,d.unit,d.num).then(r=>{
        if(r.error)setStatus('Cloud delete failed: '+r.error.message);
      });
      refreshAll();
    }
  }
});

// "+ Add shoot day" is a first-class, always-available action on the day board
{
  const origRenderDays=renderDays;
  renderDays=function(){
    origRenderDays();
    const host=$('#viewDays');
    if(!host)return;
    // keep the inline per-scene editor open across the recompute re-render
    if(OPEN_REQ){
      const area=host.querySelector(`.reqarea[data-reqkey="${CSS.escape(OPEN_REQ)}"]`);
      if(area){area.innerHTML=reqEditorHTML(OPEN_REQ);area.classList.remove('hidden');}
    }
    const btn=document.createElement('button');
    btn.id='btnAddDay';btn.className='tb-btn';
    btn.style.cssText='width:100%;border-style:dashed;padding:13px;color:var(--sub);font-size:12.5px';
    btn.textContent=MODEL&&MODEL.days.length?'+ Add shoot day':'+ Add your first shoot day — date, unit, location';
    host.appendChild(btn);
    // every day gets an always-available "add crowd" (CrowdOS) or "add
    // stunts" (StuntOS) control — essential for one-liners that arrive with
    // scenes but no crowd/stunt breakdown to build from
    for(const d of (MODEL?MODEL.days:[])){
      const card=document.getElementById('day-'+d.id);
      const top=card&&card.querySelector('.dh-top');
      if(!top)continue;
      const add=document.createElement('button');
      add.className='dnum addreq';
      add.style.cssText='cursor:pointer;background:none;color:var(--hv);border-color:var(--hv-line)';
      if(APPMODE==='crowd'){add.setAttribute('data-costday',d.id);add.setAttribute('data-tip','Add / edit crowd for this day');add.textContent='＋ Crowd';}
      else{add.setAttribute('data-stuntday',d.id);add.setAttribute('data-tip','Add / edit stunt performers for this day');add.textContent='＋ Stunts';}
      top.appendChild(add);
    }
    for(const d of (MODEL?MODEL.days:[])){
      if(!d.manual)continue;
      const card=document.getElementById('day-'+d.id);
      const top=card&&card.querySelector('.dh-top');
      if(!top)continue;
      const x=document.createElement('button');
      x.className='dnum';x.setAttribute('data-delday',d.id);
      x.style.cssText='cursor:pointer;background:none';
      x.setAttribute('data-tip','Manually added day — click to remove');
      x.textContent='manual ✕';
      top.appendChild(x);
    }
  };
}
// open the per-day stunt editor
function openStuntDay(dayId){
  const d=(MODEL.days||[]).find(x=>x.id===dayId);if(!d)return;
  STUNT_CTX=dayId;
  const e=STUNTDAY[stuntDayKey(d)]||{};
  $('#sdmSub').textContent='Day '+d.num+(d.loc?' · '+d.loc:'');
  $('#sdmPerf').value=+e.perf||0;
  $('#sdmCoord').value=+e.coord||0;
  $('#sdmDbl').value=+e.dbl||0;
  $('#stuntDayModal').classList.add('open');
}
let STUNT_CTX=null;
$('#sdmClose').addEventListener('click',()=>$('#stuntDayModal').classList.remove('open'));
$('#stuntDayModal').addEventListener('click',e=>{if(e.target.id==='stuntDayModal')$('#stuntDayModal').classList.remove('open')});
$('#sdmSave').addEventListener('click',()=>{
  const d=(MODEL.days||[]).find(x=>x.id===STUNT_CTX);if(!d)return;
  const key=stuntDayKey(d);
  const perf=Math.max(0,+$('#sdmPerf').value||0),coord=Math.max(0,+$('#sdmCoord').value||0),dbl=Math.max(0,+$('#sdmDbl').value||0);
  if(perf+coord+dbl===0)delete STUNTDAY[key];else STUNTDAY[key]={perf,coord,dbl};
  saveStuntDay();
  $('#stuntDayModal').classList.remove('open');
  refreshAll();
});
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-stuntday]');
  if(b){e.stopPropagation();openStuntDay(b.dataset.stuntday);}
});

// FIX: keep the controls bar stuck below the topbar even when the topbar
// wraps to two rows — otherwise the search box slides underneath it and
// becomes unclickable after scrolling (design assumed a 55px topbar)
{
  const tb=$('.topbar');
  const set=()=>document.documentElement.style.setProperty('--topbarH',tb.offsetHeight+'px');
  if(window.ResizeObserver)new ResizeObserver(set).observe(tb);
  window.addEventListener('resize',set);
  set();
}

// ---------- cloud sync (Supabase, per-production) ----------
// Rule: YOUR productions live in the cloud (private to your account, synced
// across devices); the built-in demo schedule and its edits stay in this
// browser only. Signed out, everything behaves exactly as before.
const CLOUD={session:null,hydrated:false};
const SHADOW={cday:'{}',adj:'{}'};
// everyone signs in before seeing anything — the gate covers the app until
// a session exists (skipped only when Supabase isn't configured, e.g. tests)
if(cloud.cloudConfigured())$('#gate').classList.remove('hidden');

function keyParts(k){
  const seg=k.split('|');
  return {ns:seg.slice(0,-2).join('|'),plain:seg.slice(-2).join('|')};
}
function prodIdForNs(ns){
  if(!ns)return undefined; // demo edits stay local
  const s=SOURCES.find(x=>x.ns===ns);
  return (s&&s.cloudId)||undefined;
}
// Diff a whole edits map against its last-synced shadow and push only the
// changed keys. Called from saveCDAY/saveAdj, so every editor path syncs.
function cloudSyncMap(kind){
  if(!CLOUD.session)return;
  const map=kind==='cday'?CDAY:ADJ;
  let prev={};try{prev=JSON.parse(SHADOW[kind])}catch(e){prev={}}
  const cur=JSON.parse(JSON.stringify(map));
  for(const k of new Set([...Object.keys(prev),...Object.keys(cur)])){
    if(JSON.stringify(prev[k])===JSON.stringify(cur[k]))continue;
    const {ns,plain}=keyParts(k);
    const pid=prodIdForNs(ns);
    if(pid===undefined)continue;
    const op=cur[k]===undefined
      ?cloud.deleteDayEdit(pid,plain,kind)
      :cloud.upsertDayEdit(pid,plain,kind,cur[k]);
    op.then(r=>{if(r&&r.error)setStatus('Cloud save failed: '+r.error.message)});
  }
  SHADOW[kind]=JSON.stringify(cur);
}

function updateAccountUI(){
  const s=CLOUD.session;
  $('#btnAccount').textContent=s?((s.user&&s.user.email)||'Account'):'Sign in';
  if(cloud.cloudConfigured())$('#gate').classList.toggle('hidden',!!s);
  if(s)$('#auWho').textContent=(s.user&&s.user.email)||'';
}
$('#btnAccount').addEventListener('click',()=>{
  if(!cloud.cloudConfigured()){setStatus('Cloud sync isn’t configured — Supabase keys are missing.');return}
  if(CLOUD.session)$('#authModal').classList.add('open');
});
$('#auClose').addEventListener('click',()=>$('#authModal').classList.remove('open'));
$('#authModal').addEventListener('click',e=>{if(e.target.id==='authModal')$('#authModal').classList.remove('open')});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#authModal').classList.remove('open')});
$('#auGoogle').addEventListener('click',async()=>{
  $('#auStatus').textContent='Redirecting to Google…';
  const {error}=await cloud.signInWithGoogle();
  if(error)$('#auStatus').textContent=error.message;
});
$('#auSignIn').addEventListener('click',async()=>{
  const email=$('#auEmail').value.trim(),pw=$('#auPass').value;
  if(!email||!pw){$('#auStatus').textContent='Enter your email and password.';return}
  $('#auStatus').textContent='Signing in…';
  const {error}=await cloud.signIn(email,pw);
  $('#auStatus').textContent=error?error.message:'';
});
$('#auSignUp').addEventListener('click',async()=>{
  const email=$('#auEmail').value.trim(),pw=$('#auPass').value;
  if(!email||!pw){$('#auStatus').textContent='Enter an email and choose a password.';return}
  $('#auStatus').textContent='Creating account…';
  const {data,error}=await cloud.signUp(email,pw);
  if(error){$('#auStatus').textContent=error.message;return}
  $('#auStatus').textContent=data.session?'':'Check your inbox to confirm your email, then sign in.';
});
$('#auSignOut').addEventListener('click',async()=>{await cloud.signOut();location.reload()});

function hasLocalUserData(){return SOURCES.some(s=>s.kind)}
async function migrateLocalToCloud(){
  for(const s of SOURCES.filter(x=>x.kind)){
    const {id,error}=await cloud.insertProduction(s);
    if(error){setStatus('Migration failed: '+error.message);return false}
    s.cloudId=id;
    for(const d of s.model.days.filter(x=>x.manual)){
      const r=await cloud.upsertManualDay(id,d);
      if(r.error){setStatus('Migration failed: '+r.error.message);return false}
    }
  }
  for(const [k,v] of Object.entries(CDAY)){
    const {ns,plain}=keyParts(k);const pid=prodIdForNs(ns);
    if(pid)await cloud.upsertDayEdit(pid,plain,'cday',v);
  }
  for(const [k,v] of Object.entries(ADJ)){
    const {ns,plain}=keyParts(k);const pid=prodIdForNs(ns);
    if(pid)await cloud.upsertDayEdit(pid,plain,'adj',v);
  }
  cloudSyncBlob('sced',SCED);
  cloudSyncBlob('stuntday',STUNTDAY);
  return true;
}

async function cloudHydrate(){
  setStatus('Syncing your productions…');
  let res=await cloud.loadAll();
  if(res.error){setStatus('Cloud sync failed: '+res.error.message);return}
  // first sign-in from a browser with local work and an empty cloud → migrate
  if(!res.productions.length&&hasLocalUserData()){
    setStatus('Moving your locally-saved productions to the cloud…');
    if(!(await migrateLocalToCloud()))return;
    res=await cloud.loadAll();
    if(res.error){setStatus('Cloud sync failed: '+res.error.message);return}
  }
  // the cloud is the source of truth when signed in: drop locally-restored
  // user sources and their edits, then rebuild from the cloud — but keep
  // anything created THIS session (it may still be mid-insert)
  for(let i=SOURCES.length-1;i>=0;i--)if(SOURCES[i].kind&&!SOURCES[i].sessionNew)SOURCES.splice(i,1);
  for(const k of Object.keys(CDAY))if(keyParts(k).ns)delete CDAY[k];
  for(const k of Object.keys(ADJ))if(keyParts(k).ns)delete ADJ[k];
  // per-scene edits (SCED) and manual stunt days (STUNTDAY) are namespaced
  // to a production (p:/m: prefix); clear the cloud-owned ones before reload
  for(const k of Object.keys(SCED))if(/^[pm]:/.test(k))delete SCED[k];
  for(const k of Object.keys(STUNTDAY))if(/^[pm]:/.test(k))delete STUNTDAY[k];
  for(const rec of res.productions){
    if(SOURCES.some(s=>s.cloudId&&s.cloudId===rec.id))continue; // already here
    try{
      if(rec.kind==='pdf'&&rec.schedule_text){
        const m=prepModel(parseWith(rec.format||'auto',rec.schedule_text),rec.unit||'Main');
        m._raw=rec.schedule_text.slice(0,1000)+' '+rec.title;
        addSource(m,rec.title,rec.short,false,{kind:'pdf',text:rec.schedule_text,unit:rec.unit||'Main',ns:'p:'+rec.title,cloudId:rec.id,colour:rec.colour||undefined,createdAt:rec.created_at,prod:rec.production,version:rec.version,schedDate:rec.sched_date,format:rec.format,rateCard:rec.rate_card,current:rec.is_current});
      }else{
        addSource({days:[],castMap:{},notes:[]},rec.title,rec.short,false,{kind:'manual',ns:'m:'+rec.title,allowEmpty:true,colour:rec.colour||'white',cloudId:rec.id,createdAt:rec.created_at,prod:rec.production});
      }
    }catch(e){console.error('load production failed',e)}
  }
  for(const md of res.manualDays){
    const src=SOURCES.find(s=>s.cloudId===md.production_id);
    if(!src)continue;
    if(src.model.days.some(d=>d.unit===md.unit&&d.num===md.num))continue;
    src.model.days.push(reviveDay({num:md.num,date:md.date,loc:md.loc,hours:md.hours,type:md.type,unit:md.unit}));
    sortDays(src.model);
  }
  for(const de of res.dayEdits){
    const src=SOURCES.find(s=>s.cloudId===de.production_id);
    if(!src||!src.ns)continue;
    // sced/stuntday are stored as one blob (already ns-keyed); cday/adj are
    // one row per day, keyed by the plain day key
    if(de.kind==='sced'){Object.assign(SCED,de.data||{});continue;}
    if(de.kind==='stuntday'){Object.assign(STUNTDAY,de.data||{});continue;}
    const localKey=src.ns+'|'+de.key;
    if(de.kind==='cday')CDAY[localKey]=de.data;else ADJ[localKey]=de.data;
  }
  // rebuild the production registry from the cloud (schedule rows carry the
  // production name + rate card; the prods table holds empty productions)
  for(const s of SOURCES)if(s.kind&&s.prod)ensureProd(s.prod,{rateCard:s.rateCard||(PRODS[s.prod]&&PRODS[s.prod].rateCard)||null,colour:s.colour});
  for(const p of (res.prods||[]))ensureProd(p.name,{rateCard:p.rate_card||null,colour:p.colour||'white'});
  SHADOW.cday=JSON.stringify(CDAY);
  SHADOW.adj=JSON.stringify(ADJ);
  // "last edited" per production = newest of its rows
  const touch={};
  const bump=(pid,t)=>{if(pid&&t&&(!touch[pid]||t>touch[pid]))touch[pid]=t};
  for(const md of res.manualDays)bump(md.production_id,md.created_at);
  for(const de of res.dayEdits)bump(de.production_id,de.updated_at);
  for(const s of SOURCES)if(s.cloudId)s.lastEdited=touch[s.cloudId]||s.createdAt;
  if(ACTIVE>=SOURCES.length)ACTIVE=2;
  setActive(ACTIVE);
  setStatus('');
  showDash(); // land on the dashboard after sign-in
}

cloud.onAuthChange(session=>{
  CLOUD.session=session;
  updateAccountUI();
  if(session&&!CLOUD.hydrated){
    CLOUD.hydrated=true;
    $('#authModal').classList.remove('open');
    cloudHydrate();
  }
});

// ---------- sidebar + dashboard ----------
// The topbar source pills are superseded by a left sidebar of productions,
// and a post-sign-in dashboard lists them with headline stats.
let DASH=false;
// "Main Unit – B&W – 11 May" style label for a schedule under a production
function unitVersionLabel(s){
  const parts=[s.unit==='2nd'?'2nd Unit':'Main Unit'];
  if(s.version)parts.push(s.version);
  if(s.schedDate)parts.push(s.schedDate.replace(/\s+\d{4}$/,''));
  return parts.join(' – ');
}
// ---- production → unit → schedule-revision hierarchy ----
// A "unit" is every schedule sharing (production, unit). Within it, each
// uploaded PDF is a revision; the CURRENT one drives all live numbers.
const unitName=u=>u==='2nd'?'2nd Unit':'Main Unit';
function revTime(s){return (s.createdAt&&Date.parse(s.createdAt))||(s.schedDate&&Date.parse(s.schedDate))||0}
// revision label: the colour/version if known, else the upload date
function revLabel(s){
  if(s.version)return s.version;
  if(s.schedDate)return s.schedDate.replace(/\s+\d{4}$/,'');
  if(s.createdAt)return new Date(s.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  return 'Draft';
}
// map a production's user schedules into units → revisions (newest first)
function unitsOf(prodName){
  const units=new Map();
  SOURCES.forEach((s,i)=>{
    if(!s.kind||(s.prod||s.title)!==prodName)return;
    const uk=(s.unit||'Main');
    if(!units.has(uk))units.set(uk,[]);
    units.get(uk).push({s,i});
  });
  for(const revs of units.values())revs.sort((a,b)=>revTime(b.s)-revTime(a.s));
  return units;
}
// the current revision of a unit: the manual override, else newest upload
function currentRev(revs){return revs.find(r=>r.s.current)||revs[0]}
const DASH_EXP=new Set(); // expanded production/unit keys (persist across renders)
// mode-aware cost of a source: CrowdOS shows crowd, StuntOS shows stunt
function modeCost(s){return costsFor(s)[APPMODE==='stunt'?'stunt':'crowd']}
function modeWord(){return APPMODE==='stunt'?'stunt':'crowd'}
function renderSidebar(){
  const mk=(s,i,label)=>`<button class="side-item sched ${!DASH&&i===ACTIVE?'on':''}" data-side="${i}" title="${esc(s.title)}"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label||s.short)}</span><span class="k">${s.model.days.length}d</span><span class="del" data-delsrc="${i}" data-tip="Delete this schedule">✕</span></button>`;
  $('#sideDash').classList.toggle('on',DASH);
  // one row per UNIT (its current revision); revision history lives on the
  // dashboard. Empty productions listed too.
  let html='';
  for(const name of new Set([...prodNames(),...SOURCES.filter(s=>s.kind).map(s=>s.prod||s.title)])){
    html+=`<div class="side-prod"><span class="side-prod-name">${esc(name)}</span><span class="side-prod-tools"><span data-prodimport="${esc(name)}" data-tip="Import a schedule into this production">＋</span><span data-prodedit="${esc(name)}" data-tip="Production settings">✎</span></span></div>`;
    const units=unitsOf(name);
    if(!units.size){html+=`<div style="color:var(--faint);font-size:10.5px;padding:1px 10px 4px">No schedules yet</div>`;continue}
    for(const [uk,revs] of units){
      const cur=currentRev(revs);
      const label=cur.s.kind==='manual'?'Manual entry':unitName(cur.s.unit)+(revs.length>1?` · ${revLabel(cur.s)} (+${revs.length-1})`:` · ${revLabel(cur.s)}`);
      html+=mk(cur.s,cur.i,label);
    }
  }
  $('#sideList').innerHTML=html||'<div style="color:var(--faint);font-size:11px;padding:2px 10px 6px">None yet — start one below.</div>';
  $('#sideDemo').innerHTML=SOURCES.map((s,i)=>s.kind?'':mk(s,i)).join('');
}
{
  const origRenderSrcBar=renderSrcBar;
  renderSrcBar=function(){origRenderSrcBar();renderSidebar();};
}
function fmtStamp(iso){
  if(!iso)return 'just now';
  const d=new Date(iso);
  return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})+', '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
}
// headline totals for any (not necessarily active) source, same engine path
function costsFor(s){
  const strip=(map)=>s.ns
    ?Object.fromEntries(Object.entries(map).filter(([k])=>k.startsWith(s.ns+'|')).map(([k,v])=>[k.slice(s.ns.length+1),v]))
    :Object.fromEntries(Object.entries(map).filter(([k])=>!keyParts(k).ns));
  return {
    crowd:engineComputeCrowdCosts(s.model,strip(CDAY),crowdSettingsFromDOM()).grand,
    stunt:engineComputeStuntCosts(s.model,strip(ADJ),{...rates(),sdOn:$('#rSDOn').checked,sdRate:+$('#rSDRate').value||0,sdDays:Math.max(0,+$('#rSDDays').value||0)}).grand,
  };
}
function renderDash(){
  const who=(CLOUD.session&&CLOUD.session.user&&CLOUD.session.user.email)||'';
  const mode=modeWord(), Mode=mode[0].toUpperCase()+mode.slice(1);
  const money=n=>n>0?`<b class="verfig">${gbp(Math.round(n))}</b>`:`<span class="noreq">No ${mode} requirement</span>`;
  const names=[...new Set([...prodNames(),...SOURCES.filter(s=>s.kind).map(s=>s.prod||s.title)])];
  let prodTotal=0,dayTotal=0;
  // build each production card (expandable → units → revisions)
  const prodCards=names.map(name=>{
    const units=unitsOf(name);
    let pFig=0;
    for(const revs of units.values()){const cur=currentRev(revs);pFig+=modeCost(cur.s);dayTotal+=cur.s.model.days.length;}
    prodTotal+=pFig;
    const pOpen=DASH_EXP.has('p:'+name);
    let unitsHtml='';
    for(const [uk,revs] of units){
      const cur=currentRev(revs);
      const uOpen=DASH_EXP.has('u:'+name+'|'+uk);
      // diff each revision vs the chronologically previous (older) one
      const asc=[...revs].sort((a,b)=>revTime(a.s)-revTime(b.s));
      const diffOf=r=>{
        const idx=asc.findIndex(x=>x.i===r.i);
        if(idx<=0)return 'baseline upload';
        const prev=asc[idx-1];
        const dd=r.s.model.days.length-prev.s.model.days.length;
        const dc=modeCost(r.s)-modeCost(prev.s);
        const bits=[];
        if(dd)bits.push((dd>0?'+':'')+dd+' day'+(Math.abs(dd)===1?'':'s'));
        if(Math.round(dc))bits.push((dc>0?'+':'−')+gbp(Math.abs(Math.round(dc))));
        return (bits.join(' · ')||'no change')+' vs '+revLabel(prev.s);
      };
      const verRows=revs.map(r=>{
        const isCur=r.i===cur.i;
        return `<div class="verrow ${isCur?'current':''}" data-openrev="${r.i}">
          <span class="revchip">${esc((revLabel(r.s)||'').toUpperCase().slice(0,10))}</span>
          <span class="verdate">${r.s.createdAt?new Date(r.s.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):'—'}</span>
          ${isCur?'<span class="vertag">CURRENT</span>':`<span class="makecur" data-makecurrent="${r.i}" data-tip="Reinstate this revision as current">Make current</span>`}
          <span class="diff">${esc(r.s.model.days.length+'d · '+diffOf(r))}</span>
          <span class="verfig-wrap">${money(modeCost(r.s))}</span>
          <span class="del" data-delsrc="${r.i}" data-tip="Delete this revision">✕</span>
        </div>`;
      }).join('');
      unitsHtml+=`<div class="unitrow ${uOpen?'expanded':''}">
        <div class="uh ${uOpen?'open':''}" data-toggleunit="${esc(name)}|${uk}">
          <span class="chev">▶</span><span class="uname">${unitName(cur.s.unit)}</span>
          <span class="ucur">on ${esc(revLabel(cur.s))} · ${revs.length} revision${revs.length===1?'':'s'}</span>
          <span class="ufig">${money(modeCost(cur.s))}</span>
        </div>
        <div class="verlist">${verRows}<div class="uploadrow" data-prodimport="${esc(name)}" data-unit="${uk}">+ Upload new revision for ${unitName(cur.s.unit)}</div></div>
      </div>`;
    }
    return `<div class="prodcard">
      <div class="ph" data-toggleprod="${esc(name)}">
        <span class="chev ${pOpen?'open':''}">▶</span><span class="pname">${esc(name)}</span>
        <span class="pmeta">${units.size?units.size+' unit'+(units.size===1?'':'s'):'no schedules yet'}</span>
        <span class="ptools"><span data-prodedit="${esc(name)}" data-tip="Production settings">✎</span></span>
        <span class="pfig">${money(pFig)}</span>
      </div>
      <div class="punits" style="${pOpen?'':'display:none'}">
        ${unitsHtml||`<div class="uploadrow" data-prodimport="${esc(name)}">+ Import the first schedule</div>`}
        <div class="uploadrow addunit" data-prodimport="${esc(name)}">+ Add unit / block / episode</div>
      </div>
    </div>`;
  }).join('');
  const demoFull=SOURCES.findIndex(s=>!s.kind&&s.model.multiUnit);
  const demoCard=demoFull>=0?`<div class="prodcard demo"><div class="ph" data-side="${demoFull}"><span class="pname">${esc(SOURCES[demoFull].title)}</span><span class="pmeta">sample</span><span class="pfig">${money(modeCost(SOURCES[demoFull]))}</span></div></div>`:'';
  $('#dashView').innerHTML=`
    <div class="dash-hero"><div><div class="dash-head">Productions</div><div class="dash-sub">${who?esc(who):''} · ${Mode}OS</div></div></div>
    <div class="summary" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div class="stat"><div class="n">${names.length}</div><div class="l">Productions</div></div>
      <div class="stat"><div class="n">${dayTotal.toLocaleString()}</div><div class="l">Shoot days (current)</div></div>
      <div class="stat money costable"><div class="n">${gbp(Math.round(prodTotal))}</div><div class="l">${Mode} total</div></div>
    </div>
    <div class="prodlist">${prodCards}<button class="dash-card dash-new" id="dashNew" style="margin-top:8px">+ New production</button></div>
    <div class="dash-sub" style="margin:22px 0 8px">Sample schedule</div>
    ${demoCard}`;
}
function showDash(){DASH=true;$('#boardView').classList.add('hidden');$('#dashView').classList.remove('hidden');$('#colourPill').style.display='none';renderDash();renderSidebar();window.scrollTo(0,0);}
function hideDash(){DASH=false;$('#dashView').classList.add('hidden');$('#boardView').classList.remove('hidden');}
$('#sideDash').addEventListener('click',showDash);
$('#sideNew').addEventListener('click',()=>openProdModal(null));
// reinstate an older revision as the current one for its unit
function makeCurrent(i){
  const s=SOURCES[i];if(!s)return;
  for(const o of SOURCES)if(o.kind&&(o.prod||o.title)===(s.prod||s.title)&&(o.unit||'Main')===(s.unit||'Main')){
    o.current=(o===s);
    if(CLOUD.session&&o.cloudId)cloud.updateProduction(o.cloudId,o).catch(()=>{});
  }
  saveUserSources();
  if(DASH)renderDash();
  renderSidebar();
  setStatus('“'+revLabel(s)+'” is now the current revision.');
}
let CURUNIT=null; // unit hint for "upload new revision into this unit"
document.addEventListener('click',e=>{
  if(e.target.closest('#dashNew')||e.target.closest('#sideNewProd')){openProdModal(null);return}
  const mc=e.target.closest('[data-makecurrent]');
  if(mc){e.stopPropagation();e.preventDefault();makeCurrent(+mc.dataset.makecurrent);return}
  const tp=e.target.closest('[data-toggleprod]');
  if(tp&&!e.target.closest('[data-prodedit]')){const k='p:'+tp.dataset.toggleprod;DASH_EXP.has(k)?DASH_EXP.delete(k):DASH_EXP.add(k);renderDash();return}
  const tu=e.target.closest('[data-toggleunit]');
  if(tu){const k='u:'+tu.dataset.toggleunit;DASH_EXP.has(k)?DASH_EXP.delete(k):DASH_EXP.add(k);renderDash();return}
  const orv=e.target.closest('[data-openrev]');
  if(orv&&!e.target.closest('[data-delsrc]')&&!e.target.closest('[data-makecurrent]')){setActive(+orv.dataset.openrev);return}
  const pe=e.target.closest('[data-prodedit]');
  if(pe){e.stopPropagation();e.preventDefault();openProdModal(pe.dataset.prodedit);return}
  const pi=e.target.closest('[data-prodimport]');
  if(pi){e.stopPropagation();e.preventDefault();CURPROD=pi.dataset.prodimport;CURUNIT=pi.dataset.unit||null;$('#fileInput').click();return}
  const it=e.target.closest('[data-side]');
  if(it&&!e.target.closest('[data-delsrc]'))setActive(+it.dataset.side);
});
{
  const origSetActive=setActive;
  setActive=function(i){
    if(DASH)hideDash();
    origSetActive(i);
    renderSidebar();
    // the colour pill names the ACTIVE schedule's version ("Blue schedule",
    // "V2 schedule"); user uploads use their stated version, the demo keeps
    // its detected colour, and it hides when there's nothing to say
    const s=SOURCES[i];
    if(s&&s.kind){
      const pill=$('#colourPill');
      pill.textContent=s.version?(s.version+' schedule'):'';
      pill.style.display=s.version?'':'none';
      // the production owns the rate card (applied to every schedule in it);
      // fall back to any legacy per-schedule card
      const rc=(prodOf(s)&&prodOf(s).rateCard)||s.rateCard;
      applyRateVals(rc&&rc.vals?rc.vals:RC_DEFAULTS);
    }
  };
}
document.addEventListener('click',e=>{
  const x=e.target.closest('[data-delsrc]');
  if(!x)return;
  e.stopPropagation();e.preventDefault();
  const i=+x.dataset.delsrc;const s=SOURCES[i];
  if(!s||!s.kind)return;
  // if signed in but this source hasn't been matched to its cloud row yet
  // (sync still in flight), deleting now would only remove the local copy
  // and the production would resurrect on reload — make the user wait
  if(CLOUD.session&&!s.cloudId&&!s.cloudFailed){setStatus('Still syncing — try deleting again in a moment.');return}
  const label=s.kind==='manual'?'the manual entry':('the '+unitVersionLabel(s)+' schedule');
  if(!window.confirm('Delete '+label+' from “'+(s.prod||s.title)+'”? This cannot be undone.'))return;
  if(CLOUD.session&&s.cloudId)cloud.deleteProduction(s.cloudId).then(r=>{
    if(r.error)setStatus('Cloud delete failed: '+r.error.message);
  });
  SOURCES.splice(i,1);
  for(const k of Object.keys(CDAY))if(keyParts(k).ns===s.ns)delete CDAY[k];
  for(const k of Object.keys(ADJ))if(keyParts(k).ns===s.ns)delete ADJ[k];
  saveCDAY();saveAdj();saveUserSources();saveManualDays();
  if(ACTIVE>=SOURCES.length||i===ACTIVE)ACTIVE=2;
  else if(i<ACTIVE)ACTIVE--;
  if(DASH){renderDash();renderSidebar();}
  else setActive(ACTIVE);
},true);

// ---------- calculator: rough day budget (multi-row roster) ----------
// Sketch a whole crowd day before any schedule exists: 10 SAs, 10 SPACTs,
// a few named characters — priced with the calculator's day settings.
let FCROWS=[];
try{FCROWS=JSON.parse(store.get('crowdos-fcrows')||'[]')}catch(e){FCROWS=[]}
function saveFCROWS(){store.set('crowdos-fcrows',JSON.stringify(FCROWS))}

// ---------- manual per-day stunts (for one-liners with no stunt breakdown) ----------
// Stored per day like CDAY; injected into the stunt computation as synthetic
// cast so they cost through the normal StuntOS engine (rate + holiday + usage
// + weekly insurance) without appearing as fake scenes on the day board.
let STUNTDAY={};
try{STUNTDAY=JSON.parse(store.get('crowdos-stuntday')||'{}')}catch(e){STUNTDAY={}}
function saveStuntDay(){store.set('crowdos-stuntday',JSON.stringify(STUNTDAY));cloudSyncBlob('stuntday',STUNTDAY)}
function stuntDayKey(d){return (NS?NS+'|':'')+(d.unit||'Main')+'|'+d.num}
function augmentedStuntModel(){
  // entries belonging to the active production (namespace-aware)
  const entries={};
  for(const k of Object.keys(STUNTDAY)){
    const {ns,plain}=keyParts(k);
    if(NS?ns===NS:!ns)entries[plain]=STUNTDAY[k];
  }
  if(!Object.keys(entries).length)return MODEL;
  const days=MODEL.days.map(d=>{
    const e=entries[(d.unit||'Main')+'|'+d.num];
    if(!e||!((+e.perf||0)+(+e.coord||0)+(+e.dbl||0)))return d;
    const cast=[];
    for(let i=0;i<(+e.coord||0);i++)cast.push({code:'Coordinator D'+d.num+(i?' #'+(i+1):''),type:'stuntCoord'});
    const extras=[];
    if(+e.perf>0)extras.push({name:'Stunt performers (D'+d.num+')',count:+e.perf});
    if(+e.dbl>0)extras.push({name:'Stunt doubles (D'+d.num+')',count:+e.dbl});
    const syn={num:'+',part:'',ie:'',slug:'Manual stunt entry',tod:'',scriptDay:'',pages:'',unit:d.unit,desc:'',sa:0,veh:0,pod:false,podVeh:0,cast,extras,spacts:[],featured:[],vehNames:[],tags:[]};
    return {...d,scenes:[...d.scenes,syn]};
  });
  return {...MODEL,days};
}

// ---------- per-scene crowd/stunt edits (inline on the day board) ----------
// One-liners often arrive with scenes but no crowd/stunt breakdown. Clicking
// a scene's CROWD (CrowdOS) or STUNTS (StuntOS) cell edits that scene's
// requirement in place; edits flow through the normal engine (scene peaks →
// day cost). Stored per scene and re-applied after every parse/recompute.
let SCED={};
try{SCED=JSON.parse(store.get('crowdos-sced')||'{}')}catch(e){SCED={}}
function saveSced(){store.set('crowdos-sced',JSON.stringify(SCED));cloudSyncBlob('sced',SCED)}
// Sync a namespace-keyed store (SCED / STUNTDAY) to the cloud as one blob row
// per production in day_edits — avoids splitting multi-segment scene keys.
function cloudSyncBlob(kind,map){
  if(!CLOUD||!CLOUD.session)return;
  for(const s of SOURCES){
    if(!s.kind||!s.cloudId||!s.ns)continue;
    const pre=s.ns+'|';
    const subset={};
    for(const k of Object.keys(map))if(k.startsWith(pre))subset[k]=map[k];
    if(Object.keys(subset).length)cloud.upsertDayEdit(s.cloudId,'__'+kind+'__',kind,subset).catch(()=>{});
    else cloud.deleteDayEdit(s.cloudId,'__'+kind+'__',kind).catch(()=>{});
  }
}
function scedKey(nk){return (NS?NS+'|':'')+nk}
function sceneNK(d,s,idx){return [d.unit||'Main',d.num,s.num||'',s.part||'',idx].join('|')}
function sceneFromKey(nk){
  const seg=nk.split('|'); const unit=seg[0], num=seg[1], idx=+seg[4];
  const d=(MODEL.days||[]).find(x=>(x.unit||'Main')===unit&&String(x.num)===num);
  if(!d||!d.scenes[idx])return null;
  return {d,s:d.scenes[idx],idx};
}
// re-apply per-scene edits to a model (idempotent: strips prior _sced first)
function applySced(model){
  for(const d of model.days)d.scenes.forEach((s,idx)=>{
    s.cast=s.cast.filter(c=>!c._sced);
    s.extras=(s.extras||[]).filter(x=>!x._sced);
    const e=SCED[scedKey(sceneNK(d,s,idx))];
    if(!e)return;
    if(e.sa!=null)s.sa=+e.sa||0;
    // split the Characters list into SA (named), Featured, and SPACT groups
    if(e.chars){
      s.saChars=e.chars.filter(c=>c.tier!=='SPACT'&&!c.featured&&c.count>0).map(c=>({name:c.name,count:+c.count}));
      s.featured=e.chars.filter(c=>c.tier!=='SPACT'&&c.featured&&c.count>0).map(c=>({name:c.name,count:+c.count}));
      s.spacts=e.chars.filter(c=>c.tier==='SPACT'&&c.count>0).map(c=>({name:c.name,count:+c.count}));
    }else{ // legacy SCED entries (pre-Characters-list)
      if(e.feat)s.featured=e.feat.map(f=>({name:f.name,count:+f.count||0})).filter(f=>f.name&&f.count>0);
      if(e.spact)s.spacts=e.spact.map(f=>({name:f.name,count:+f.count||0})).filter(f=>f.name&&f.count>0);
    }
    const tag=(s.num||('sc'+idx));
    for(let i=0;i<(+e.coord||0);i++)s.cast.push({code:'Coord '+d.num+'/'+tag+(i?'#'+(i+1):''),type:'stuntCoord',_sced:true});
    if(+e.perf>0)s.extras.push({name:'Performers '+tag,count:+e.perf,_sced:true});
    if(+e.dbl>0)s.extras.push({name:'Doubles '+tag,count:+e.dbl,_sced:true});
  });
}
// build the inline editor for a scene, initialised from its current state
function reqEditorHTML(nk){
  const ref=sceneFromKey(nk); if(!ref)return '';
  const {s}=ref; const e=SCED[scedKey(nk)]||{};
  if(APPMODE==='crowd'){
    // one Characters list — every character is an SA or SPACT; Featured is a
    // tickbox on an SA (adds supplementary fees), not a separate section
    const chars=e.chars||[
      ...(s.saChars||[]).map(f=>({name:f.name,count:f.count,tier:'SA',featured:false})),
      ...(s.featured||[]).map(f=>({name:f.name,count:f.count,tier:'SA',featured:true})),
      ...(s.spacts||[]).map(f=>({name:f.name,count:f.count,tier:'SPACT',featured:false})),
    ];
    const row=(c,i)=>`<div class="reqrow" data-ri="${i}">
      <input data-rq="cname" value="${esc(c.name||'')}" placeholder="Character / group name">
      <input data-rq="ccount" type="number" min="0" value="${+c.count||0}">
      <select data-rq="ctier"><option${c.tier!=='SPACT'?' selected':''}>SA</option><option${c.tier==='SPACT'?' selected':''}>SPACT</option></select>
      <label class="reqfeat ${c.tier==='SPACT'?'off':''}"><input type="checkbox" data-rq="cfeat" ${c.featured?'checked':''}> Featured</label>
      <button data-rqdel="1">✕</button></div>`;
    return `<div class="reqedit" data-rk="${esc(nk)}">
      <div class="reqline"><label>Unnamed SA</label><input data-rq="sa" type="number" min="0" value="${+((e.sa!=null?e.sa:s.sa))||0}"><span class="reqhint">background with no character name ("20 × C")</span></div>
      <div class="reqsec"><div class="reqseclabel">Characters</div><div class="reqchars">${chars.map(row).join('')}</div><button class="reqadd" data-rqaddchar="1">+ Add character</button></div>
      <div class="reqdone"><button data-rqclose="1">Done</button></div>
    </div>`;
  }
  return `<div class="reqedit" data-rk="${esc(nk)}">
    <div class="reqline"><label>Performers</label><input data-rq="perf" type="number" min="0" value="${+e.perf||0}"></div>
    <div class="reqline"><label>Coordinators</label><input data-rq="coord" type="number" min="0" value="${+e.coord||0}"></div>
    <div class="reqline"><label>Doubles</label><input data-rq="dbl" type="number" min="0" value="${+e.dbl||0}"></div>
    <div class="reqdone"><button data-rqclose="1">Done</button></div>
  </div>`;
}
// read the editor's fields back into SCED, apply, and recompute
let OPEN_REQ=null;
function commitReqEditor(area,keepOpen){
  const nk=area.dataset.reqkey||(area.querySelector('[data-rk]')&&area.querySelector('[data-rk]').dataset.rk);
  if(!nk)return;
  const ed=area.querySelector('.reqedit'); if(!ed)return;
  const val=sel=>{const el=ed.querySelector(sel);return el?el.value:''};
  const e={};
  if(APPMODE==='crowd'){
    e.sa=Math.max(0,+val('[data-rq="sa"]')||0);
    e.chars=[];
    ed.querySelectorAll('.reqrow').forEach(row=>{
      const name=(row.querySelector('[data-rq="cname"]')||{}).value||'';
      if(!name.trim())return;
      const count=Math.max(0,+(row.querySelector('[data-rq="ccount"]')||{}).value||0);
      const tier=(row.querySelector('[data-rq="ctier"]')||{}).value||'SA';
      const featured=tier!=='SPACT'&&!!(row.querySelector('[data-rq="cfeat"]')||{}).checked;
      e.chars.push({name:name.trim(),count,tier,featured});
    });
    if(!e.sa&&!e.chars.length)delete SCED[scedKey(nk)];else SCED[scedKey(nk)]=e;
  }else{
    e.perf=Math.max(0,+val('[data-rq="perf"]')||0);
    e.coord=Math.max(0,+val('[data-rq="coord"]')||0);
    e.dbl=Math.max(0,+val('[data-rq="dbl"]')||0);
    if(!(e.perf+e.coord+e.dbl)){const cur=SCED[scedKey(nk)]||{};delete cur.perf;delete cur.coord;delete cur.dbl;if(cur.sa||cur.feat||cur.spact)SCED[scedKey(nk)]=cur;else delete SCED[scedKey(nk)];}
    else{SCED[scedKey(nk)]=Object.assign(SCED[scedKey(nk)]||{},e);}
  }
  saveSced();
  // keep the editor open only while actively editing (field change / add /
  // delete row); Done closes it, so don't let the re-render re-open it
  OPEN_REQ=keepOpen?nk:null;
  refreshAll();
}
{
  const origRenderFreeCalc=renderFreeCalc;
  renderFreeCalc=function(){
    origRenderFreeCalc();
    if(APPMODE==='stunt')return;
    const host=$('#viewCalc');
    if(!host)return;
    const per=t=>cdPerHead(FC,t).per;
    const rows=FCROWS.map((r,i)=>{
      const p=per(r.tier)+(+r.sup||0);
      return `<tr>
        <td><input type="text" data-fcr="name" data-i="${i}" value="${esc(r.name||'')}" placeholder="e.g. Nurses"></td>
        <td><select data-fcr="tier" data-i="${i}"><option${r.tier==='SA'?' selected':''}>SA</option><option${r.tier==='Featured'?' selected':''}>Featured</option><option${r.tier==='SPACT'?' selected':''}>SPACT</option></select></td>
        <td class="num"><input type="number" min="0" data-fcr="count" data-i="${i}" value="${+r.count||0}"></td>
        <td class="num mono">${gbp(p)}</td>
        <td class="num money">${gbp(Math.round(p*(+r.count||0)))}</td>
        <td><button class="x" data-fcr="del" data-i="${i}">✕</button></td>
      </tr>`;
    }).join('');
    const total=FCROWS.reduce((a,r)=>a+(per(r.tier)+(+r.sup||0))*(+r.count||0),0);
    const heads=FCROWS.reduce((a,r)=>a+(+r.count||0),0);
    const card=document.createElement('div');
    card.className='tablecard fc-roster';
    card.innerHTML=`<h3>Rough day budget<span class="cnt">${heads} heads</span><span class="sum costable">${gbp(Math.round(total))}</span></h3>
      <div class="tscroll"><table><thead><tr><th>Character / group</th><th>Tier</th><th class="num">Count</th><th class="num">Per head</th><th class="num">Subtotal</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div style="display:flex;gap:10px;align-items:center;padding:10px 14px;flex-wrap:wrap">
        <button class="tb-btn" id="fcAddRow" style="border-style:dashed">+ Add line</button>
        <span style="color:var(--faint);font-size:11px">Priced with the day settings above (shift, hours, travel, public holiday) — a quick whole-day sketch before any schedule exists.</span>
      </div>`;
    host.appendChild(card);
    // quick-add: push the artiste configured above straight into the roster
    const gross=host.querySelector('.fcgross .grossline');
    if(gross&&!host.querySelector('#fcToRoster')){
      const b=document.createElement('button');
      b.id='fcToRoster';b.className='tb-btn';
      b.style.cssText='margin-left:10px;padding:6px 12px;font-size:11.5px;border-color:var(--hv-line);color:var(--hv)';
      b.textContent='+ Add to rough budget';
      gross.appendChild(b);
    }
  };
}
document.addEventListener('click',e=>{
  if(!e.target.closest('#fcToRoster'))return;
  const heads=+(document.querySelector('[data-fcheads]')||{}).value||1;
  FCROWS.push({name:'',tier:FC.tier,count:heads,sup:0});
  saveFCROWS();renderFreeCalc();
  const roster=document.querySelector('.fc-roster');
  if(roster)roster.scrollIntoView({block:'center',behavior:'smooth'});
});
document.addEventListener('click',e=>{
  if(e.target.closest('#fcAddRow')){FCROWS.push({name:'',tier:'SA',count:10,sup:0});saveFCROWS();renderFreeCalc();return}
  const del=e.target.closest('[data-fcr="del"]');
  if(del){FCROWS.splice(+del.dataset.i,1);saveFCROWS();renderFreeCalc();}
});
// commit the per-scene editor on field change (blur/enter), not per keystroke
document.addEventListener('change',e=>{
  const rq=e.target.closest('[data-rq]');
  if(rq){const area=rq.closest('.reqarea');if(area)commitReqEditor(area,true);}
});
document.addEventListener('change',e=>{
  const el=e.target.closest('[data-fcr]');
  if(!el)return;
  const r=FCROWS[+el.dataset.i];if(!r)return;
  if(el.dataset.fcr==='count'){r.count=+el.value||0;saveFCROWS();renderFreeCalc();}
  else if(el.dataset.fcr==='tier'){r.tier=el.value;saveFCROWS();renderFreeCalc();}
});
document.addEventListener('input',e=>{
  const el=e.target.closest('[data-fcr="name"]');
  if(!el)return;
  const r=FCROWS[+el.dataset.i];
  if(r){r.name=el.value;saveFCROWS();}
});

// ---------- custom rate cards ----------
// Save the editable crowd/SPACT rate inputs as a named card and switch
// between cards — for productions negotiating their own rates.
const RC_INPUTS=['cSA','cHol','cOTday','cOTnight','cET','cTravelA','cTravelB','cSpact','cSpactNight','cSpactHol','cSpactET'];
const RC_DEFAULTS={cSA:'111.21',cHol:'12.07',cOTday:'11.69',cOTnight:'17.54',cET:'19.73',cTravelA:'17.09',cTravelB:'23.89',cSpact:'255',cSpactNight:'372',cSpactHol:'15.50',cSpactET:'20.91'};
let RATECARDS={};
try{RATECARDS=JSON.parse(store.get('crowdos-ratecards')||'{}')}catch(e){RATECARDS={}}
function applyRateVals(vals){
  for(const id of RC_INPUTS){const el=document.getElementById(id);if(el&&vals[id]!=null)el.value=vals[id];}
  refreshAll();
}
function currentRateVals(){
  const vals={};
  for(const id of RC_INPUTS){const el=document.getElementById(id);if(el)vals[id]=el.value}
  return vals;
}
{
  const grid=document.querySelector('#crowdRatesBar .rates-grid');
  const wrap=document.createElement('div');
  wrap.className='rates-note';
  wrap.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap';
  wrap.innerHTML=`<b style="color:var(--sub)">Rate card:</b>
    <select id="rcSelect" style="background:var(--panel2);border:1px solid var(--line2);border-radius:6px;color:var(--ink);padding:6px 8px;font-family:var(--mono);font-size:12px"></select>
    <button class="tb-btn" id="rcSave" style="padding:5px 10px;font-size:11px">Save current as card…</button>
    <button class="tb-btn" id="rcDelete" style="padding:5px 10px;font-size:11px">Delete card</button>
    <span style="color:var(--faint)">Edit any number above, save it as a named card, and switch cards per budget.</span>`;
  grid.appendChild(wrap);
  const refreshSel=()=>{$('#rcSelect').innerHTML='<option value="">PACT/FAA 2026 (defaults)</option>'+Object.keys(RATECARDS).map(n=>`<option>${esc(n)}</option>`).join('')};
  refreshSel();
  $('#rcSelect').addEventListener('change',()=>{
    const n=$('#rcSelect').value;
    applyRateVals(n&&RATECARDS[n]?RATECARDS[n]:RC_DEFAULTS);
  });
  $('#rcSave').addEventListener('click',()=>{
    const n=(window.prompt('Name this rate card (e.g. “Indie feature 2026”)')||'').trim();
    if(!n)return;
    RATECARDS[n]=currentRateVals();
    store.set('crowdos-ratecards',JSON.stringify(RATECARDS));
    refreshSel();$('#rcSelect').value=n;
    setStatus('Rate card “'+n+'” saved.');
  });
  $('#rcDelete').addEventListener('click',()=>{
    const n=$('#rcSelect').value;
    if(!n){setStatus('The PACT/FAA 2026 defaults can’t be deleted.');return}
    if(!window.confirm('Delete rate card “'+n+'”?'))return;
    delete RATECARDS[n];
    store.set('crowdos-ratecards',JSON.stringify(RATECARDS));
    refreshSel();applyRateVals(RC_DEFAULTS);
  });
}

// debug handle for inspecting closure state from the console
window.__crowdos={get SOURCES(){return SOURCES},get CDAY(){return CDAY},get ADJ(){return ADJ},get MODEL(){return MODEL},get CLOUD(){return CLOUD}};

// ---------- boot ----------
{
  const mMain=prepModel(parseAny(DEMO_FULLFAT),'Main');mMain._raw=DEMO_FULLFAT.slice(0,1000);
  const m2U=prepModel(parseAny(DEMO_2NDUNIT),'2nd');m2U._raw='BLUE 2ND UNIT '+DEMO_2NDUNIT.slice(0,1000);
  m2U.castMap=Object.assign({},mMain.castMap,m2U.castMap);
  const mAll=mergeModels(mMain,m2U);mAll._raw=mMain._raw;
  addSource(mMain,'Piccadilly S8 — Blue Main Unit Expanded Schedule (03 Jul 26)','Main Unit',false);
  addSource(m2U,'Piccadilly S8 — Blue 2nd Unit Expanded Schedule (03 Jul 26)','2nd Unit',false);
  addSource(mAll,'Piccadilly S8 — Full production: Main + 2nd Unit (03 Jul 26)','Full Schedule',false);
  // restore user-added productions (uploaded PDF text and blank/manual ones)
  let saved=[];try{saved=JSON.parse(store.get('crowdos-sources')||'[]')}catch(e){saved=[]}
  for(const rec of saved){
    try{
      if(rec.kind==='pdf'&&rec.text){
        const m=prepModel(parseWith(rec.format||'auto',rec.text),rec.unit||'Main');
        m._raw=rec.text.slice(0,1000)+' '+rec.title;
        addSource(m,rec.title,rec.short,false,{kind:'pdf',text:rec.text,unit:rec.unit||'Main',ns:'p:'+rec.title,prod:rec.prod,version:rec.version,schedDate:rec.schedDate,colour:rec.colour||undefined,format:rec.format,rateCard:rec.rateCard,current:rec.current,createdAt:rec.createdAt||undefined});
      }else if(rec.kind==='manual'){
        addSource({days:[],castMap:{},notes:[]},rec.title,rec.short,false,{kind:'manual',ns:'m:'+rec.title,allowEmpty:true,colour:'white',prod:rec.prod});
      }
    }catch(e){console.error('restore source failed',e)}
  }
  for(const s of SOURCES)restoreManualDays(s);
  // ensure every restored schedule's production is registered (back-compat
  // with sources saved before productions were entities), then apply any
  // saved production-level rate card
  for(const s of SOURCES)if(s.kind&&s.prod)ensureProd(s.prod,{rateCard:(PRODS[s.prod]&&PRODS[s.prod].rateCard)||s.rateCard||null,colour:s.colour});
  setActive(2);
  setAppMode(store.get('stuntos-appmode')||'stunt');
}
}
