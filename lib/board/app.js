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
  cdRowConfig as engineCdRowConfig,
  stuntDayExtras as engineStuntDayExtras,
  computeCrowdCosts as engineComputeCrowdCosts,
  computeStuntCosts as engineComputeStuntCosts,
  locationBand, bandFor, parseDayDate, weekKey, dayPeakSA,
  parseAny, parseSchedule, parseExpanded, prepModel, mergeModels, mergeDetail, looksLikeSequenceTitle,
  diffRevisions, carriedDayRecords, carryCastMap, sceneIndexOf as engineSceneIndexOf,
  danceWeek, DANCE_2026, DANCE_BASIC,
} from "../engine";
import { projectCrowdDoc, cbToSheet, cbToStyledSheet, CB_SEG_ORDER, CB_SEG_LABELS } from "../engine/breakdown-doc";
import { layoutToLines } from "../engine/pdf-layout";
import { dayBannerIndex } from "../engine/doc-anchor";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import * as cloud from "./cloud";
import { startTour, maybeStartTour, tourActive } from "./tour";

// Take 3 Agency identity (client-owned brand asset; real logo cut to
// transparent PNGs in /public/brand). The sidebar tile is a black rounded
// square holding the white "TAKE 3" mark (AGENCY row dropped so it reads
// small); larger placements use the full wordmark.
// The full logo is always used as-is (never cropped, never boxed) — small in
// the sidebar, larger on the sign-in gate. Black version; dark mode inverts.
const TAKE3_WORDMARK=(cls)=>`<img class="t3wordmark${cls?' '+cls:''}" src="/brand/take3-black.png" alt="Take 3 Agency" draggable="false">`;

// The prototype's <body> markup, verbatim (prototype_1.html lines 483-599).
// the sidebar-toggle panel glyph (Laural's collapse icon)
const PANEL_ICON=`<svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5" stroke="currentColor" stroke-width="1.6"/><rect x="2.5" y="3.5" width="6" height="13" rx="2.5" fill="currentColor"/></svg>`;

// ---------- inline SVG icons (feather-style) ----------
// Tyler's rule: no emoji pictographs in the UI. Every glyph is an inline SVG —
// stroke:currentColor so it takes the surrounding text colour, 1em so it takes
// the surrounding text size. Pure typographic marks (✕ ✓ ＋ ‹ ▾) stay as text.
const ICONS={
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  pin:'<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  mail:'<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  clock:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  pencil:'<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  zap:'<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  warn:'<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  trash:'<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  drop:'<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  sunrise:'<path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="9" x2="12" y2="2"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/><line x1="23" y1="22" x2="1" y2="22"/><polyline points="8 6 12 2 16 6"/>',
  sun:'<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  cloud:'<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  cloudsun:'<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6z"/>',
  fog:'<path d="M18 8h-1.26A8 8 0 1 0 9 18h9a5 5 0 0 0 0-10z"/><line x1="6" y1="21.5" x2="18" y2="21.5"/>',
  drizzle:'<line x1="8" y1="19" x2="8" y2="21"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="16" y1="19" x2="16" y2="21"/><line x1="16" y1="13" x2="16" y2="15"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="12" y1="15" x2="12" y2="17"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>',
  rain:'<line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>',
  snow:'<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="8" y1="20" x2="8.01" y2="20"/><line x1="12" y1="18" x2="12.01" y2="18"/><line x1="12" y1="22" x2="12.01" y2="22"/><line x1="16" y1="16" x2="16.01" y2="16"/><line x1="16" y1="20" x2="16.01" y2="20"/>',
  storm:'<path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/>',
  refresh:'<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  'arrow-right':'<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  copy:'<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  columns:'<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>',
  car:'<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 15.4V16c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  highlighter:'<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
};
const icon=(n,cls)=>`<svg class="ic${cls?' '+cls:''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]||''}</svg>`;

const SHELL = `<input type="file" id="fileInput" accept="application/pdf,image/*" multiple style="display:none">
<input type="file" id="coverInput" accept="image/*" style="display:none">
<input type="file" id="bannerInput" accept="image/*" style="display:none">
<input type="file" id="avatarInput" accept="image/*" style="display:none">
<input type="file" id="briefPhotoInput" accept="image/*" multiple style="display:none">
<div id="statusBar" class="hidden" role="status"><span id="status"></span><button id="statusUndo" class="hidden">↺ Undo</button><button id="statusX" aria-label="Dismiss">✕</button></div>

<div id="gate" class="hidden">
  <div class="gate-card">
    <div class="gate-logo">${TAKE3_WORDMARK('big')}</div>
    <h1 class="gate-title">Welcome to Laural</h1>
    <div class="gate-sub">Sign in to your account to continue</div>
    <div class="gate-fields hidden" id="auNameRow">
      <div class="gate-field half"><label>First name <b>*</b></label><input id="auFirst" type="text" autocomplete="given-name"></div>
      <div class="gate-field half"><label>Surname <b>*</b></label><input id="auLast" type="text" autocomplete="family-name"></div>
      <div class="gate-field"><label>Your role <b>*</b></label><select id="auRole">
        <option value="" selected disabled>Choose your role…</option>
        <option>Crowd AD</option>
        <option>1st AD</option>
        <option>2nd AD</option>
        <option>Stunt coordinator</option>
        <option>Stunt department coordinator</option>
        <option>Producer</option>
        <option>Line producer</option>
        <option>Other</option>
      </select></div>
    </div>
    <div class="gate-fields">
      <div class="gate-field"><label>Email <b>*</b></label><input id="auEmail" type="email" autocomplete="email"></div>
      <div class="gate-field"><label>Password <b>*</b></label><input id="auPass" type="password" autocomplete="current-password"></div>
    </div>
    <button class="gate-primary" id="auSignIn">Sign in</button>
    <div class="gate-or"><span></span>Or<span></span></div>
    <button class="gate-google" id="auGoogle">
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      Continue with Google
    </button>
    <div class="gate-foot">New here? <button id="auSignUp">Create account</button></div>
    <div id="auStatus" class="gate-status"></div>
  </div>
</div>

<div class="layout">
<div id="sideScrim" aria-hidden="true"></div>
<aside class="sidebar" id="sidebar">
  <div class="side-head">${TAKE3_WORDMARK('side')}<span class="side-head-name">Take 3 Agency<small id="sideWho">Admin</small></span><button class="side-head-close" id="sideClose" aria-label="Close menu">✕</button></div>
  <button class="side-item" id="sideDash">Dashboard</button>
  <button class="side-item" id="sideCalc">Calculator</button>
  <button class="side-item" id="sideBriefsNav">Casting briefs</button>
  <div id="sideList" class="hidden"></div>
  <div class="side-label hidden" id="sideDemoLabel">Sample schedule</div>
  <div id="sideDemo"></div>
  <div class="side-grow"></div>
  <div class="side-foot">
    <button class="side-foot-btn" id="sideSettings" data-tip="Production settings" aria-label="Settings">${icon('gear')}</button>
    <button class="side-foot-btn" id="sideHelp" data-tip="How this works" aria-label="Help">?</button>
  </div>
</aside>
<div class="maincol">
<div class="pagebar">
  <button class="pagebar-toggle" id="btnSidebar" data-tip="Show/hide the menu" aria-label="Toggle menu">${PANEL_ICON}</button>
  <nav class="crumbs" id="topCrumbs" aria-label="Breadcrumb"></nav>
  <div class="grow"></div>
  <div class="srcbar" id="modeBar">
    <button data-appmode="stunt" class="on">Stunt</button>
    <button data-appmode="crowd">Crowd</button>
  </div>
  <button class="tb-btn" id="btnAdd">+ Add schedule</button>
  <span class="colourpill" id="colourPill"></span>
  <button class="tb-btn" id="btnAccount" data-tip="Sync your productions across devices">Sign in</button>
  <button class="tb-btn" id="btnMode" data-tip="Light / dark">◐</button>
</div>
<div id="dashView" class="wrap hidden"></div>
<div id="boardView" class="wrap">
  <div class="summary" id="summary"></div>

  <details class="ratesbar hidden" id="ratesBar">
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
      <div class="rfield"><label>Early call travel (≤ 06:00)</label><div class="inwrap"><span>£</span><input id="cET" type="number" step="0.01" value="20.91"></div></div>
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
    <div class="tabsrow">
    <div class="tabs" role="tablist">
      <button class="on" data-view="days">Day board</button>
      <button data-view="cal">Calendar</button>
      <button data-view="stunts" id="tabBreakdown">Stunt cost breakdown</button>
      <button data-view="crowd" id="tabCrowd">Stunts by day</button>
      <button data-view="cbdoc" id="tabCbDoc" class="hidden">Crowd breakdown</button>
      <button data-view="briefs" id="tabBriefs" class="hidden">Briefs</button>
      <button data-view="doods" id="tabDoods" class="hidden">Doods</button>
      <button data-view="calc" id="tabCalc">Calculator</button>
      <button data-view="cast">Cast list</button>
      <button id="tabSettings" class="hidden">Settings</button>
    </div>
    </div>
    <div class="toolrow">
    <div class="searchwrap"><input id="search" type="search" placeholder="Search day, scene, character…" autocomplete="off"><button id="searchClear" aria-label="Clear search">✕</button></div>
    <select id="dayJump" class="dayjump" data-tip="Jump straight to a shoot day" aria-label="Jump to day"><option value="">Jump to day…</option></select>
    <label class="chk"><input type="checkbox" id="fltStunt"> <span id="fltLabel">Stunt days only</span></label>
    <label class="chk"><input type="checkbox" id="tglCosts" checked> Show costs</label>
    <button class="tb-btn" id="btnBoardPdf" data-tip="Open the original schedule PDF alongside the board to cross-check">${icon('file')} Schedule PDF</button>
    <button class="tb-btn" id="btnRecheck" data-tip="Ask CrowdOS to read this schedule again — e.g. if it missed the cast numbers">${icon('refresh')} Re-check</button>
    <div class="expbar" id="expBar">
      <details class="expmenu">
        <summary class="tb-btn">${icon('file')} Export</summary>
        <div class="expmenu-list">
          <button type="button" data-exp="csv">CSV (.csv)</button>
          <button type="button" data-exp="xlsx">Excel (.xlsx)</button>
        </div>
      </details>
      <button type="button" class="tb-btn" data-exp="pdf">Export as PDF</button>
    </div>
    <div class="legend">
      <span><i style="background:var(--dayext)"></i>Day EXT</span>
      <span><i style="background:var(--dayint)"></i>Day INT</span>
      <span><i style="background:var(--nightext)"></i>Night EXT</span>
      <span><i style="background:var(--nightint)"></i>Night INT</span>
      <span><i style="background:var(--dusk)"></i>Dawn / Dusk</span>
    </div>
    </div>
  </div>
  <div id="viewDays"></div>
  <div id="viewCal" class="hidden"></div>
  <div id="viewStunts" class="hidden"></div>
  <div id="viewCrowd" class="hidden"></div>
  <div id="viewCbdoc" class="hidden"></div>
  <div id="viewBriefs" class="hidden"></div>
  <div id="viewDoods" class="hidden"></div>
  <div id="viewCalc" class="hidden"></div>
  <div id="viewCast" class="hidden"></div>
</div>

</div>
<div class="board-pdf-divider" id="boardPdfDivider" aria-hidden="true"></div>
<aside class="board-pdf" id="boardPdf" aria-hidden="true">
  <div class="rpv-bar bp-bar">
    <span class="bp-title" id="boardPdfTitle">Schedule PDF</span>
    <span class="rpv-tabs"></span>
    <span class="rpv-ctl">
      <button class="rpv-btn rpv-out" title="Zoom out" aria-label="Zoom out">−</button>
      <button class="rpv-btn rpv-fit" title="Fit width">Fit</button>
      <button class="rpv-btn rpv-in" title="Zoom in" aria-label="Zoom in">+</button>
      <button class="rpv-btn bp-close" id="boardPdfClose" title="Close" aria-label="Close schedule PDF">✕</button>
    </span>
  </div>
  <div class="rpv-pages"></div>
</aside>
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
<div class="modal" id="splitModal">
  <div class="box" style="max-width:600px">
    <div class="mhead"><h3 id="splitTitle"></h3><span class="sub" id="splitSub"></span><button class="x" id="splitClose" style="margin-left:auto">Close</button></div>
    <div id="splitBody"></div>
  </div>
</div>

<!-- Reopened crowd-breakdown settings ride in this popup over the generated
     document, so changing them never leaves the page or forces a re-generate. -->
<div class="modal" id="cbSetupModal">
  <div class="box cbsetupbox">
    <div class="mhead"><h3>Breakdown settings</h3><span class="sub">Changes apply straight away</span><button class="x" id="cbSetupClose" style="margin-left:auto">Done</button></div>
    <div id="cbSetupBody"></div>
  </div>
</div>

<div class="modal" id="authModal">
  <div class="box" style="max-width:420px">
    <div class="mhead"><h3>Account</h3><button class="x" id="auClose">Close</button></div>
    <div style="padding:16px">
      <div id="auSignedIn">
        <div class="au-profile">
          <span class="au-avatar" id="auAvatar"></span>
          <div>
            <div style="font-size:12.5px">Signed in as <b id="auWho"></b></div>
            <div style="display:flex;gap:8px;margin-top:6px">
              <button class="tb-btn" id="auAvatarBtn" style="padding:4px 10px;font-size:11px">Upload photo</button>
              <button class="tb-btn hidden" id="auAvatarRm" style="padding:4px 10px;font-size:11px">Remove</button>
            </div>
          </div>
        </div>
        <div style="font-size:11.5px;color:var(--sub);margin-bottom:12px">Productions sync automatically.</div>
        <div style="display:flex;gap:8px">
          <button class="tb-btn" id="auRateCards">Manage rate cards</button>
          <button class="tb-btn" id="auSignOut">Sign out</button>
        </div>
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

<div class="modal" id="sceneModal">
  <div class="box" style="max-width:560px">
    <div class="mhead"><h3 id="smTitle">Edit scene</h3><span class="sub" id="smSub"></span><button class="x" id="smClose">Close</button></div>
    <div style="padding:16px">
      <div class="rates-grid" style="padding:0;grid-template-columns:repeat(2,1fr)">
        <div class="rfield"><label>Scene number</label><div class="inwrap"><input id="smNum" type="text" placeholder="e.g. 12 or 12A"></div></div>
        <div class="rfield"><label>Part (optional)</label><div class="inwrap"><input id="smPart" type="text" placeholder="e.g. 2"></div></div>
        <div class="rfield"><label>INT / EXT</label><div class="inwrap"><input id="smIe" type="text" placeholder="INT / EXT"></div></div>
        <div class="rfield"><label>Time of day</label><div class="inwrap"><input id="smTod" type="text" placeholder="DAY / NIGHT / DAWN / DUSK"></div></div>
        <div class="rfield"><label>Script day</label><div class="inwrap"><input id="smScriptDay" type="text" placeholder="e.g. DAY 3"></div></div>
        <div class="rfield"><label>Pages</label><div class="inwrap"><input id="smPages" type="text" placeholder="e.g. 1 3/8"></div></div>
        <div class="rfield" style="grid-column:1/-1"><label>Set / location</label><div class="inwrap"><input id="smSlug" type="text" placeholder="e.g. INT CLOWN HOUSE — KITCHEN"></div></div>
        <div class="rfield" style="grid-column:1/-1"><label>Description</label><textarea id="smDesc" rows="3" style="width:100%;background:var(--panel2);border:1px solid var(--line2);border-radius:8px;color:var(--ink);padding:9px 10px;font-family:var(--mono);font-size:13px;resize:vertical"></textarea></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;align-items:center">
        <button class="tb-btn" id="smSave" style="border-color:var(--hv-line);color:var(--hv)">Save scene</button>
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
        <div class="rfield" id="impMergeRow" style="grid-column:1/-1;display:none"><label>Scene detail, no shoot dates — how should it import?</label><div class="inwrap"><select id="impMerge" style="width:100%;border:none;background:var(--panel2);color:var(--ink);padding:9px 10px;font-family:var(--mono);font-size:13px;font-weight:600"><option value="merge">Merge into the current schedule (recommended)</option><option value="standalone">Import as standalone — scenes only</option></select></div></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;align-items:center">
        <button class="tb-btn" id="impGo" style="border-color:var(--hv-line);color:var(--hv)">Import schedule</button>
        <button class="tb-btn" id="impAI" style="border-color:var(--line);color:var(--faint)">Re-read with AI</button>
        <span id="impInfo" style="color:var(--faint);font-size:11px"></span>
      </div>
    </div>
  </div>
</div>
<div class="modal revpage" id="prodSettings">
  <div class="rp-sheet">
    <div class="rp-head">
      <div>
        <div class="crumbs" id="psCrumbs"></div>
        <h3>Production settings</h3>
        <div class="rp-file" id="psMeta"></div>
      </div>
      <button class="tb-btn" id="psDelete" style="margin-left:auto;border-color:rgba(229,83,75,.4);color:#e5534b">Delete production</button>
      <button class="x" id="psClose">Close</button>
    </div>
    <div class="rp-body" id="psBody">
      <div class="ps-cols">
        <nav class="ps-rail" id="psRail"></nav>
        <div class="ps-content" id="psContent"></div>
      </div>
    </div>
    <div class="rp-foot">
      <span class="note">Changes save to this production only — every schedule and revision inside it follows.</span>
      <button class="rp-pub" id="psSave">Save settings</button>
    </div>
  </div>
</div>
<div class="modal revpage" id="rateAdminModal">
  <div class="rp-sheet">
    <div class="rp-head">
      <div><div class="crumbs">Account</div><h3>Rate cards</h3><div class="rp-file">Account-wide — pick one as a production's baseline in Production Settings → Rate cards</div></div>
      <button class="x" id="rcaClose">Close</button>
    </div>
    <div class="rp-body" id="rcaBody"></div>
  </div>
</div>
<div class="modal" id="addChooser">
  <div class="box" style="max-width:440px">
    <div class="mhead"><h3>Add schedule</h3><span class="sub" id="acSub"></span><button class="x" id="acClose">Cancel</button></div>
    <div style="padding:16px">
      <button class="chooser-opt" id="acUpload"><b>Upload a schedule</b><span>A PDF (one-liner, Full Fat, or both) — or photos of the pages, read by AI. Reviewed before publish.</span></button>
      <button class="chooser-opt" id="acManual"><b>Build it by hand</b><span>Pick every shoot date on a calendar, then fill in scenes — no PDF needed.</span></button>
    </div>
  </div>
</div>
<div class="modal" id="bulkModal">
  <div class="box" style="max-width:640px">
    <div class="mhead"><h3>Add shoot days</h3><span class="sub" id="bkSub">Click every shoot date, then Generate</span><button class="x" id="bkClose">Cancel</button></div>
    <div style="padding:16px">
      <div id="bkStep1">
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">
          <button class="tb-btn" id="bkPrev" aria-label="Earlier months">‹</button>
          <span id="bkMonthLabel" style="font-family:var(--cond);font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:var(--sub)"></span>
          <button class="tb-btn" id="bkNext" aria-label="Later months">›</button>
          <select id="bkUnit" style="margin-left:auto;border:1px solid var(--line2);border-radius:8px;background:var(--panel2);color:var(--ink);padding:8px 10px;font-family:var(--mono);font-size:12.5px;font-weight:600"><option value="Main">Main Unit</option><option value="2nd">2nd Unit</option></select>
        </div>
        <div class="bk-cals" id="bkCals"></div>
        <div style="display:flex;gap:10px;margin-top:14px;align-items:center">
          <button class="tb-btn" id="bkGen" style="border-color:var(--hv-line);color:var(--hv)">Generate days</button>
          <span id="bkCount" style="font-family:var(--mono);font-size:11.5px;color:var(--sub)">No dates selected</span>
        </div>
      </div>
      <div id="bkStep2" style="display:none">
        <div class="bk-list" id="bkList"></div>
        <div style="display:flex;gap:10px;margin-top:14px;align-items:center;flex-wrap:wrap">
          <button class="tb-btn" id="bkCreate" style="border-color:rgba(76,195,138,.55);color:#4cc38a">Create days</button>
          <button class="tb-btn" id="bkBack">‹ Back to calendar</button>
          <span style="font-family:var(--mono);font-size:11px;color:var(--faint)">Scenes are optional — add or edit everything on the board later</span>
        </div>
      </div>
    </div>
  </div>
</div>
<div class="modal revpage" id="revPage">
  <div class="rp-sheet">
    <div class="rp-head">
      <div>
        <div class="crumbs" id="rpCrumbs"></div>
        <h3>Review schedule</h3>
        <div class="rp-file" id="rpFile"></div>
      </div>
      <span id="rpKinds"></span>
      <button class="tb-btn rp-vtoggle" id="rpViewerToggle" style="display:none">Hide original</button>
      <div class="rp-rev"><label for="rpRev">Revision</label><input id="rpRev" maxlength="18"></div>
      <button class="x" id="rpClose">Cancel</button>
    </div>
    <div class="rp-split" id="rpSplit">
      <div class="rp-body">
        <div class="rp-stats" id="rpStats"></div>
        <div id="rpCross"></div>
        <div id="rpChanges"></div>
        <div id="rpQuestions"></div>
        <div id="rpTable"></div>
      </div>
      <div class="rp-divider" id="rpDivider" style="display:none"></div>
      <aside class="rp-viewer" id="rpViewer" style="display:none">
        <div class="rpv-bar">
          <span class="rpv-tabs"></span>
          <span class="rpv-ctl">
            <button class="rpv-btn rpv-out" title="Zoom out" aria-label="Zoom out">−</button>
            <button class="rpv-btn rpv-fit" title="Fit width">Fit</button>
            <button class="rpv-btn rpv-in" title="Zoom in" aria-label="Zoom in">+</button>
          </span>
        </div>
        <div class="rpv-pages"></div>
      </aside>
    </div>
    <div class="rp-foot">
      <span class="note" id="rpNote"></span>
      <button class="rp-pub" id="rpPublish">Publish</button>
    </div>
  </div>
</div>

<div class="modal origmodal" id="origModal">
  <div class="orig-sheet">
    <div class="orig-head">
      <h3 id="origTitle">Original document</h3>
      <button class="x" id="origClose">Close</button>
    </div>
    <aside class="rp-viewer orig-viewer" id="origViewer">
      <div class="rpv-bar">
        <span class="rpv-tabs"></span>
        <span class="rpv-ctl">
          <button class="rpv-btn rpv-out" title="Zoom out" aria-label="Zoom out">−</button>
          <button class="rpv-btn rpv-fit" title="Fit width">Fit</button>
          <button class="rpv-btn rpv-in" title="Zoom in" aria-label="Zoom in">+</button>
        </span>
      </div>
      <div class="rpv-pages"></div>
    </aside>
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
      <div style="color:var(--faint);font-size:11px;margin-top:12px">For one-liners with no stunt breakdown yet — add the performers this day needs. They’re costed at the stunt rates (performer/coordinator + holiday, usage, insurance). Per-event fees (fire, high falls) go on the day’s ${icon('zap')} adjustments.</div>
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
// read localStorage directly — the store helper is defined further down, so
// using it here silently threw and PRODS always started empty (cloud-only)
try{PRODS=JSON.parse(window.localStorage.getItem('crowdos-prods')||'{}')}catch(e){PRODS={}}
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

// ============================================================================
// Exports — every page can be saved as CSV, Excel (.xlsx) or PDF.
// CSV/Excel are built from the live data (tables are read straight off the
// rendered page so they always match what's on screen; the card-based Day
// board and Calendar are built from the schedule model). PDF reuses the
// browser's own "Save as PDF" so the result looks exactly like the page.
// ============================================================================
let CUR_VIEW='days'; // which page the Export buttons act on
// map each exportable page → its container + a human label + a row builder
// (label may be a function because it changes with stunt/crowd mode)
const EXPORT_VIEWS={
  days:  {sel:'#viewDays',  label:'Day board',  build:()=>exportDayBoard()},
  cal:   {sel:'#viewCal',   label:'Calendar',   build:()=>exportCalendar()},
  stunts:{sel:'#viewStunts',label:()=>APPMODE==='crowd'?'Crowd cost breakdown':'Stunt cost breakdown', build:()=>tablesFromView('#viewStunts')},
  crowd: {sel:'#viewCrowd', label:()=>APPMODE==='crowd'?'Crowd':'Stunts by day', build:()=>tablesFromView('#viewCrowd')},
  // The crowd breakdown exports from its own document projection, never by
  // scraping the DOM — the sheet and the printed page are the same rows.
  cbdoc: {sel:'#viewCbdoc', label:'Crowd breakdown', build:()=>[cbToSheet(cbdDoc())]},
  doods: {sel:'#viewDoods', label:'Doods',      build:()=>tablesFromView('#viewDoods')},
  cast:  {sel:'#viewCast',  label:'Cast list',  build:()=>tablesFromView('#viewCast')},
};
function exportLabel(v){const c=EXPORT_VIEWS[v];if(!c)return'Export';return typeof c.label==='function'?c.label():c.label}
function exportProdTitle(){const s=SOURCES[ACTIVE]||{};return s.prod||s.title||'CrowdOS'}
function exportStamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())}
function exportFileBase(v){return (exportLabel(v)+' — '+exportProdTitle()+' — '+exportStamp()).replace(/[\\/:*?"<>|]+/g,'-')}
// plain, whitespace-collapsed text of a cell
function cellText(el){return (el.textContent||'').replace(/\s+/g,' ').trim()}
// a tablecard's <h3> label, without its little count/total badges
function headTitle(h){const c=h.cloneNode(true);c.querySelectorAll('.cnt,.sum').forEach(n=>n.remove());return cellText(c)}
// keep worksheet names Excel-legal (≤31 chars, no []:*?/\) and unique
function sheetName(raw,taken){
  let n=(raw||'Sheet').replace(/[\\/?*\[\]:]+/g,' ').replace(/\s+/g,' ').trim().slice(0,28)||'Sheet';
  let base=n,i=2;while(taken.some(s=>s.name===n)){n=(base.slice(0,26)+' '+i);i++}
  return n;
}
// read every table on a rendered page into sheets: [{name, rows:[[..],..]}]
function tablesFromView(sel){
  const host=$(sel);if(!host)return [];
  const cards=[...host.querySelectorAll('.tablecard')];
  const src=cards.length?cards:[host];
  const out=[];let idx=0;
  for(const card of src){
    const h=card.querySelector('h3');
    const baseName=h?headTitle(h):'';
    for(const tbl of card.querySelectorAll('table')){
      const rows=[];
      for(const tr of tbl.querySelectorAll('tr')){
        const cells=[...tr.children].filter(c=>c.tagName==='TD'||c.tagName==='TH');
        if(cells.length)rows.push(cells.map(cellText));
      }
      if(rows.length)out.push({name:sheetName(baseName||('Table '+(++idx)),out),rows});
    }
  }
  return out;
}
// Day board — one row per shoot day, in schedule order
function exportDayBoard(){
  const crowd=APPMODE==='crowd';
  const rows=[['Day','Date','Unit','Location','Hours','Pages','Cameras','Type','Scenes','SA peak',(crowd?'Crowd cost (£)':'Stunt cost (£)')]];
  for(const d of (MODEL?MODEL.days:[])){
    const pd=COST&&COST.perDay?COST.perDay[d.id]:null, cd=CROWD&&CROWD.perDay?CROWD.perDay[d.id]:null;
    const cost=crowd?(cd?Math.round(cd.cost):''):(pd?Math.round(pd.cost):'');
    rows.push([
      'D'+d.num,
      d._date?d._date.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'}):(d.date||''),
      d.unit==='2nd'?'2nd Unit':'Main Unit',
      d.loc||'', d.hours||'', d.pages||'', d.cams||'', d.type||'',
      (d.scenes||[]).map(s=>s.num).filter(Boolean).join(', '),
      dayScheduleSA(d)||'',
      cost
    ]);
  }
  return [{name:'Day board',rows}];
}
// Calendar — same days, ordered by date, with a "what's shooting" summary
function exportCalendar(){
  const crowd=APPMODE==='crowd';
  const days=[...(MODEL?MODEL.days:[])].sort((a,b)=>(a._date&&b._date)?(a._date-b._date):(a.num-b.num));
  const rows=[['Date','Day','Unit','Location','Scenes','What’s shooting','SA peak',(crowd?'Crowd cost (£)':'Stunt cost (£)')]];
  for(const d of days){
    const pd=COST&&COST.perDay?COST.perDay[d.id]:null, cd=CROWD&&CROWD.perDay?CROWD.perDay[d.id]:null;
    const cost=crowd?(cd?Math.round(cd.cost):''):(pd?Math.round(pd.cost):'');
    const sc=d.scenes||[];
    const shooting=sc.slice(0,6).map(s=>(s.num?s.num+' ':'')+(s.slug||'').slice(0,28)).join(' · ')+(sc.length>6?' …':'');
    rows.push([
      d._date?d._date.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'}):(d.date||''),
      'D'+d.num,
      d.unit==='2nd'?'2nd Unit':'Main Unit',
      d.loc||'',
      sc.length,
      shooting.trim(),
      dayScheduleSA(d)||'',
      cost
    ]);
  }
  return [{name:'Calendar',rows}];
}
// CSV text from sheets (sections stacked with a title line when >1 table)
function sheetsToCsv(sheets){
  const q=v=>{v=(v==null?'':String(v));return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  return sheets.map(sh=>((sheets.length>1?'### '+sh.name+'\n':'')+sh.rows.map(r=>r.map(q).join(',')).join('\n'))).join('\n\n');
}
function downloadBlob(name,content,mime){
  const blob=content instanceof Blob?content:new Blob([content],{type:mime||'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},0);
}
function exportSheetsXlsx(sheets,fileBase){
  const wb=XLSX.utils.book_new();
  if(!sheets.length)sheets=[{name:'Sheet1',rows:[['No data on this page yet']]}];
  for(const sh of sheets)XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(sh.rows),(sh.name||'Sheet').slice(0,31));
  XLSX.writeFile(wb,fileBase+'.xlsx');
}
// ============================================================================
// Crowd breakdown → Excel, as the DOCUMENT.
// A crowd breakdown gets opened, edited and printed by the people who receive
// it, so a bare grid of values is useless — it has to arrive banded, bordered
// and landscape, looking exactly like the page it came from. ExcelJS is loaded
// on demand so the rest of the app doesn't carry it.
// ============================================================================
const CBX_INK='FF000000',CBX_PAPER='FFFFFFFF';
const CBX_FILL={week:'FFE4E4E4',day:'FF1A1A1A',unit:'FF000000',banner:'FFF2F2F2',
  dayTotal:'FFEEEEEE',weekTotal:'FFD9D9D9',grandTotal:'FFC9C9C9',header:'FFFFFFFF'};
const cbxBorder=()=>{const t={style:'thin',color:{argb:'FF000000'}};return {top:t,left:t,bottom:t,right:t}};
async function exportCbdXlsx(fileBase){
  const {default:ExcelJS}=await import('exceljs');
  const sheet=cbToStyledSheet(cbdDoc());
  // Appearance settings carry into the workbook: the chosen font is the family
  // name Excel asks for (real families only, so it renders on the recipient's
  // machine), and the accent paints the title, subtitle and header band.
  const CBX_FONT=(CBD.font&&CB_FONTS.some(f=>f.id===CBD.font))?CBD.font:'Montserrat';
  const CBX_ACC=/^#([0-9a-f]{6})$/i.test(CBD.accent||'')?('FF'+CBD.accent.slice(1).toUpperCase()):null;
  const CBX_ACC_INK=CBX_ACC?(cbAccentInk(CBD.accent)==='#fff'?'FFFFFFFF':'FF111111'):null;
  const wb=new ExcelJS.Workbook();
  wb.creator='CrowdOS';
  // Keep the cached export readable in previews, but ask spreadsheet apps to
  // calculate every formula on open so edits to scene counts immediately roll
  // through the pooled daily, weekly and breakdown totals.
  wb.calcProperties.fullCalcOnLoad=true;
  wb.calcProperties.forceFullCalc=true;
  const ws=wb.addWorksheet(sheet.name,{
    views:[{state:'frozen',ySplit:sheet.headerRow}],
    pageSetup:{orientation:'landscape',paperSize:8,fitToPage:true,fitToWidth:1,fitToHeight:0,
      margins:{left:.3,right:.3,top:.4,bottom:.4,header:.2,footer:.2},
      printTitlesRow:`${sheet.headerRow}:${sheet.headerRow}`},
  });
  ws.columns=sheet.widths.map(width=>({width}));
  const nCols=sheet.columns.length;
  // Style by ROLE, not by a fixed position: the column order is set by the
  // Columns builder, so a value's formatting has to follow it wherever it
  // lands. col1[role] is the 1-based Excel column for that role, or undefined
  // when the column is hidden.
  const col1={};sheet.layout.forEach((d,c)=>{col1[d.role]=c+1});
  const money=col1.cost!=null;
  // the crowd count and crowd name may be one merged column or two separate ones
  const crowdCountCol=col1.crowdNo||col1.crowdCombo;
  const crowdNameCol=col1.crowdName||col1.crowdCombo;

  sheet.rows.forEach((r,i)=>{
    const row=ws.getRow(i+1);
    r.cells.forEach((v,c)=>{
      // The breakdown follows the supplied production-document convention:
      // all visible text is capitals, while numbers and formulas stay live.
      if(v!==null&&v!==undefined)row.getCell(c+1).value=typeof v==='string'?v.toUpperCase():v;
    });
    const band=CBX_FILL[r.kind];
    const dark=r.kind==='day'||r.kind==='unit';
    row.eachCell({includeEmpty:true},cell=>{
      cell.border=cbxBorder();
      cell.alignment={vertical:'top',wrapText:true};
      cell.font={name:CBX_FONT,size:8,color:{argb:dark?CBX_PAPER:CBX_INK}};
      if(band&&r.kind!=='scene')cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:band}};
    });
    const setAlign=(role,a)=>{if(col1[role])row.getCell(col1[role]).alignment=a};
    if(r.kind==='title'){
      row.getCell(1).font={name:CBX_FONT,size:14,bold:true,color:CBX_ACC_INK?{argb:CBX_ACC_INK}:undefined};
      row.getCell(1).alignment={horizontal:'center',vertical:'middle'};
      if(CBX_ACC)row.eachCell({includeEmpty:true},c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:CBX_ACC}}});
      row.height=22;
    }else if(r.kind==='subtitle'){
      row.getCell(1).font={name:CBX_FONT,size:10,bold:true,color:CBX_ACC_INK?{argb:CBX_ACC_INK}:undefined};
      row.getCell(1).alignment={horizontal:'center',vertical:'middle'};
      if(CBX_ACC)row.eachCell({includeEmpty:true},c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:CBX_ACC}}});
    }else if(r.kind==='header'){
      row.eachCell({includeEmpty:true},cell=>{
        cell.font={name:CBX_FONT,size:8,bold:true};
        cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
      });
    }else if(dark||r.kind==='week'||r.kind==='banner'){
      row.getCell(1).font={name:CBX_FONT,size:8,bold:true,color:{argb:dark?CBX_PAPER:CBX_INK}};
      row.getCell(1).alignment={horizontal:r.kind==='unit'||r.kind==='banner'?'center':'left',vertical:'middle'};
    }else if(r.kind==='dayTotal'||r.kind==='weekTotal'||r.kind==='grandTotal'){
      row.eachCell({includeEmpty:true},cell=>{cell.font={name:CBX_FONT,size:8,bold:true}});
      // the total labels sit just left of their count, so right-align that column
      if(crowdCountCol>1)row.getCell(crowdCountCol-1).alignment={horizontal:'right',vertical:'middle'};
      if(col1.otherNo>1)row.getCell(col1.otherNo-1).alignment={horizontal:'right',vertical:'middle'};
      if(crowdCountCol)row.getCell(crowdCountCol).alignment={horizontal:'center',vertical:'middle'};
      setAlign('otherNo',{horizontal:'center',vertical:'middle'});
    }else if(r.kind==='scene'){
      setAlign('sceneNum',{horizontal:'center',vertical:'top',wrapText:true});
      // The scene cell stacks the scene number over its location. Only the
      // number should be bold; the location underneath stays plain. Split into
      // rich-text runs (like the desc cell) instead of bolding the whole font,
      // so the weights survive the round-trip into Google Sheets.
      if(col1.sceneNum){
        const cell=row.getCell(col1.sceneNum);
        if(typeof cell.value==='string'&&cell.value.length){
          const [head,...rest]=cell.value.split('\n');
          const body=rest.join('\n');
          cell.value={richText:body
            ?[{font:{name:CBX_FONT,size:8,bold:true},text:head+'\n'},
               {font:{name:CBX_FONT,size:8},text:body}]
            :[{font:{name:CBX_FONT,size:8,bold:true},text:head}]};
        }else{
          cell.font={name:CBX_FONT,size:8,bold:true};
        }
      }
      setAlign('day',{horizontal:'center',vertical:'top',wrapText:true});
      // a standalone NO. column centres; the merged column stays left with its name
      setAlign('crowdNo',{horizontal:'center',vertical:'top'});
      setAlign('otherNo',{horizontal:'center',vertical:'top'});
      if(crowdNameCol)row.getCell(crowdNameCol).font={name:CBX_FONT,size:8,bold:!r.pending,
        italic:!!r.fromAbove,color:{argb:r.pending?'FFA35D19':r.fromAbove?'FF5B3FA8':CBX_INK}};
      if(r.fromAbove&&col1.crowdNotes)row.getCell(col1.crowdNotes).font={name:CBX_FONT,size:8,italic:true,color:{argb:'FF5B3FA8'}};
      if(col1.otherName)row.getCell(col1.otherName).font={name:CBX_FONT,size:8,bold:true};
      // The description and DAY cells stack a heading over supporting lines.
      // Match the printed page: bold the scene heading (the rest of the block
      // stays plain), and drop a blank line under the top line so the cell
      // reads with air instead of as one dense wrapped run. Rich-text runs
      // survive the round-trip into Google Sheets, so the weights carry through.
      if(col1.desc){
        const cell=row.getCell(col1.desc);
        if(typeof cell.value==='string'&&cell.value.length){
          const [head,...rest]=cell.value.split('\n');
          const body=rest.join('\n');
          cell.value={richText:body
            ?[{font:{name:CBX_FONT,size:8,bold:true},text:head+'\n\n'},
               {font:{name:CBX_FONT,size:8},text:body}]
            :[{font:{name:CBX_FONT,size:8,bold:true},text:head}]};
        }
      }
      if(col1.day){
        const cell=row.getCell(col1.day);
        if(typeof cell.value==='string'&&cell.value.includes('\n')){
          const [head,...rest]=cell.value.split('\n');
          cell.value=head+'\n\n'+rest.join('\n');
        }
      }
    }
    // money columns arrive as real currency, so the recipient can total and
    // re-cut them in Excel rather than retyping strings
    if(money&&r.kind!=='header'&&r.kind!=='title'&&r.kind!=='subtitle'&&!r.full){
      [col1.fees,col1.cost].forEach(c=>{
        if(!c)return;
        const cell=row.getCell(c);
        cell.numFmt='£#,##0.00';
        cell.alignment={horizontal:'right',vertical:'top'};
      });
    }
    // full-width bands and the title block read as one cell
    if(r.full)ws.mergeCells(i+1,1,i+1,nCols);
  });
  // scene / description / day cells span their whole requirement block
  for(const m of sheet.merges)ws.mergeCells(m.from,m.col+1,m.to,m.col+1);

  const buf=await wb.xlsx.writeBuffer();
  downloadBlob(fileBase+'.xlsx',new Blob([buf],
    {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
}
function doExport(view,fmt){
  if(view==='cbdoc'&&fmt==='xlsx'){
    setStatus('Building the Excel document…');
    exportCbdXlsx(exportFileBase(view)).then(
      ()=>setStatus('Excel downloaded — it opens laid out and landscape, exactly like the page.'),
      err=>setStatus('Couldn’t build the Excel file: '+((err&&err.message)||err)));
    return;
  }
  const cfg=EXPORT_VIEWS[view];if(!cfg){setStatus('This page can’t be exported.');return}
  let sheets=[];try{sheets=cfg.build()||[]}catch(err){sheets=[]}
  const base=exportFileBase(view);
  if(fmt==='xlsx'){exportSheetsXlsx(sheets,base);setStatus('Excel file downloaded — open it, or import it into Google Sheets (File → Import).')}
  else{downloadBlob(base+'.csv','﻿'+sheetsToCsv(sheets),'text/csv;charset=utf-8');setStatus('CSV downloaded — open it in Excel, or import it into Google Sheets (File → Import).')}
}
// ============================================================================
// Crowd breakdown → PDF.
//
// The generic path below hides the rest of the page with visibility and pulls
// the view to 0,0 with position:absolute. That is fine for a short card list,
// but a 90-day breakdown is a multi-hundred-page table: the absolute box is
// taken out of flow, so the pagination no longer tracks the content and the
// first pages come out blank.
//
// A document this long gets its own print document instead — the real node,
// cloned into a clean iframe with the app's own stylesheets, so it paginates
// normally and prints byte-for-byte like the screen.
// ============================================================================
// Remove the trailing "add a crowd line" rows from a cloned document before it
// is printed. The CSV/XLSX exports project straight from the model and so are
// already one row per real requirement line; the printed page has to agree with
// them exactly, or the same breakdown looks different depending on how it left
// the app. Each stripped row also has to be discounted from the scene block's
// rowspan, or the SCENE / DESCRIPTION / DAY cells overhang into the next scene.
function cbdStripAddRows(root){
  root.querySelectorAll('tr[data-cbaddonly]').forEach(tr=>{
    const scene=tr.getAttribute('data-cbscene');
    // The block cells live on the scene's FIRST row — walk back to it and take
    // one off every cell that spans the block.
    let p=tr.previousElementSibling;
    while(p&&p.getAttribute('data-cbscene')===scene){
      p.querySelectorAll('td[rowspan]').forEach(td=>{
        const n=parseInt(td.getAttribute('rowspan'),10);
        if(n>1)td.setAttribute('rowspan',String(n-1));
        else td.removeAttribute('rowspan');
      });
      if(p.classList.contains('cbfirst'))break;
      p=p.previousElementSibling;
    }
    tr.remove();
  });
  // Rows that had to stay (they carry the scene block or a stunts entry) keep
  // no trace of having been editing rows.
  root.querySelectorAll('tr.cbaddrow').forEach(tr=>tr.classList.remove('cbaddrow','cbarmed'));
}
function exportCbdPDF(){
  const src=$('#viewCbdoc .cbdoc');
  if(!src){setStatus('Open the crowd breakdown first.');return}
  const node=src.cloneNode(true);
  // editing affordances are screen-only furniture
  node.querySelectorAll('.cbtier,.cbdel,.cbabove,.cbaddbtn,.noprint').forEach(n=>n.remove());
  node.querySelectorAll('[contenteditable]').forEach(n=>n.removeAttribute('contenteditable'));
  cbdStripAddRows(node);

  const frame=document.createElement('iframe');
  frame.setAttribute('aria-hidden','true');
  frame.style.cssText='position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0';
  document.body.appendChild(frame);

  const doc=frame.contentDocument;
  const sheets=[...document.querySelectorAll('link[rel="stylesheet"]')].map(l=>l.href);
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>${esc(exportFileBase('cbdoc'))}</title>
    ${sheets.map(h=>`<link rel="stylesheet" href="${esc(h)}">`).join('')}
    <style>
      @page{size:A3 landscape;margin:8mm}
      html,body{margin:0;padding:0;background:#fff}
      /* globals.css hides every element at print time so the risk-assessment
         overlay can own the page. This document is the only thing in here, so
         that rule has to be undone or the PDF comes out blank. */
      body,body *{visibility:visible!important}
      /* the document IS its banding — keep every fill the browser would drop */
      *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      .cbdoc{border:none;border-radius:0;padding:0}
      .tscroll{overflow:visible!important;max-height:none!important}
      .cbtable{font-size:8px}
      .cbtable thead{display:table-header-group}
      .cbtable thead th{position:static}
      .cbtable tr{break-inside:avoid;page-break-inside:avoid}
      .cbday,.cbunit,.cbweek{break-after:avoid;page-break-after:avoid}
      .cbtotal,.cbwktotal{break-before:avoid;page-break-before:avoid}
    </style></head><body class="light printing-cbdoc"></body></html>`);
  doc.close();
  doc.body.appendChild(doc.importNode(node,true));

  const go=()=>{
    try{frame.contentWindow.focus();frame.contentWindow.print();}
    catch(err){setStatus('Couldn’t open the print dialog — try again.')}
    // Safari fires print asynchronously, so the frame can only go once the
    // dialog has definitely finished with it
    setTimeout(()=>frame.remove(),60000);
  };
  // wait for the copied stylesheets, or the table prints unstyled
  let left=sheets.length;
  if(!left)return setTimeout(go,60);
  let fired=false;
  const done=()=>{if(--left<=0&&!fired){fired=true;setTimeout(go,120)}};
  doc.querySelectorAll('link[rel="stylesheet"]').forEach(l=>{l.onload=done;l.onerror=done});
  // never let a slow stylesheet strand the export
  setTimeout(()=>{if(!fired){fired=true;go()}},4000);
}
// PDF that looks exactly like the page: isolate the active view, then let the
// browser's own Save-as-PDF render it (print CSS in globals.css hides the rest)
function exportViewPDF(view){
  if(view==='cbdoc'){exportCbdPDF();return}
  const cfg=EXPORT_VIEWS[view];if(!cfg)return;
  const host=$(cfg.sel);if(!host)return;
  document.body.classList.add('printing-board');
  host.classList.add('print-target');
  let page=null;
  const clean=()=>{host.classList.remove('print-target');document.body.classList.remove('printing-board');if(page){page.remove();page=null}window.removeEventListener('afterprint',clean)};
  window.addEventListener('afterprint',clean);
  setTimeout(clean,60000); // safety net for browsers that never fire afterprint
  window.print();
}
// show the Export bar only on pages that can be exported
function syncExpBar(){const bar=$('#expBar');if(bar)bar.classList.toggle('hidden',!EXPORT_VIEWS[CUR_VIEW])}
// Search, the day-type filter and the time-of-day key only do anything on the
// board and the calendar, so they leave the tool row entirely on other pages
// instead of sitting there dead. Fewer live controls, calmer bar.
const FILTER_VIEWS={days:1,cal:1};
function syncToolRow(){
  const on=!!FILTER_VIEWS[CUR_VIEW];
  const inp=document.getElementById('search');
  const sw=inp&&inp.closest('.searchwrap');
  const lg=document.querySelector('.controls .legend');
  const st=document.getElementById('fltStunt');
  const fl=st&&st.closest('.chk');
  if(sw)sw.classList.toggle('hidden',!on);
  if(lg)lg.classList.toggle('hidden',!on);
  if(fl)fl.classList.toggle('hidden',!on);
  // never leave an invisible search narrowing the board behind your back
  if(!on&&inp&&inp.value){inp.value='';if(typeof applyFilters==='function')applyFilters();}
}

function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
// A location rendered as a Google Maps search link (or plain dash when empty).
function mapsLink(loc){
  loc=(loc||'').trim();
  if(!loc)return '<span class="dash">—</span>';
  return `<a class="loclink" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}" target="_blank" rel="noopener" data-tip="Open in Google Maps">${esc(loc)}</a>`;
}
const gbp = n => '£' + n.toLocaleString('en-GB',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2});

// ---------- safe storage (falls back to memory) ----------
const MEM={};
const store={
  get(k){try{return window.localStorage.getItem(k)}catch(e){return MEM[k]??null}},
  set(k,v){try{window.localStorage.setItem(k,v)}catch(e){MEM[k]=v}}
};
// ---- account-level sync ----
// Some things belong to the person, not to a production: the calculators'
// scratch rows, the risk-assessment settings, the dashboard's stand-alone
// casting briefs. They used to be browser-only, so moving machine meant losing
// them. USER_BLOBS tracks what's in flight; writes are debounced because these
// fire on every keystroke. A failure is reported ONCE per session — the old
// silent .catch() is exactly how four production-scoped syncs stayed broken
// without anyone noticing.
const USER_BLOB_T={};
// kinds whose cloud write has actually succeeded this session — sign-out only
// clears what it can prove is safely in the account
const CLOUD_OK=new Set();
let CLOUD_WARNED=false;
function cloudSyncUser(kind,data){
  if(!CLOUD||!CLOUD.session||!cloud.upsertUserBlob)return;
  clearTimeout(USER_BLOB_T[kind]);
  USER_BLOB_T[kind]=setTimeout(()=>{
    cloud.upsertUserBlob(kind,data).then(r=>{if(r&&r.error)noteCloudFail(kind,r.error);else CLOUD_OK.add(kind)},e=>noteCloudFail(kind,e));
  },900);
}
function noteCloudFail(what,err){
  const msg=(err&&err.message)||String(err||'');
  // a missing table means the migration hasn't been run — say which one
  const missing=/does not exist|schema cache|relation/i.test(msg);
  if(CLOUD_WARNED)return;CLOUD_WARNED=true;
  setStatus(missing
    ?`Couldn’t save your ${what} to your account — the database needs supabase/migration-2026-08-05.sql running. Everything is still saved on this device.`
    :`Couldn’t save your ${what} to your account (${msg.slice(0,80)}). It’s still saved on this device.`);
}
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
// touch devices have no hover, so a TAP shows the tooltip instead — but only on
// elements with no action of their own (spans, cells); buttons and links keep
// their tap for the action and stay tooltip-quiet. Pinned tips clear on the
// next tap, any scroll, or a timeout. (__forceCoarse is a test hook.)
const isCoarse=()=>window.matchMedia('(pointer:coarse)').matches||!!window.__forceCoarse;
let TIP_TIMER=null;
document.addEventListener('click',e=>{
  if(!isCoarse()){if(TIP_EL)positionTip(TIP_EL);return}
  clearTimeout(TIP_TIMER);
  const el=e.target.closest&&e.target.closest('[data-tip]');
  if(el&&!el.closest('button,a,input,select,label,[role=button]')){
    TIP_EL=el;positionTip(el);
    TIP_TIMER=setTimeout(()=>{if(TIP_EL===el){TIP_EL=null;tipbox.style.display='none'}},4000);
  }else if(TIP_EL){TIP_EL=null;tipbox.style.display='none'}
});

let NOTES={};
try{NOTES=JSON.parse(store.get('stuntos-notes')||'{}')}catch(e){NOTES={}}
function saveNote(key,val){
  if(val&&val.trim())NOTES[key]=val;else delete NOTES[key];
  if(NS&&key.startsWith(NS+'|'))delete NOTES[key.slice(NS.length+1)]; // retire the legacy un-namespaced twin
  if(typeof cloudSyncBlob==='function')cloudSyncBlob('notes',NOTES);
  store.set('stuntos-notes',JSON.stringify(NOTES));
}
let RASET={};
try{RASET=JSON.parse(store.get('stuntos-ra')||'{}')}catch(e){RASET={}}
function raDefaults(){return Object.assign({assessor:'Paul Kennington',mobile:'+44 7710319929',email:'info@pkstunts.com',company:'Jackson River Films',title:'Piccadilly — Clown Town'},RASET)}
function saveRAset(k,v){RASET[k]=v;store.set('stuntos-ra',JSON.stringify(RASET));cloudSyncUser('ra',RASET)}
let ADJ={};
try{ADJ=JSON.parse(store.get('stuntos-adj')||'{}')}catch(e){ADJ={}}
function adjKey(d){return (NS?NS+'|':'')+(d.unit||'Main')+'|'+d.num}
function saveAdj(){store.set('stuntos-adj',JSON.stringify(ADJ));cloudSyncMap('adj')}
// Actual shooting locations. The schedule states the SCENE location — the
// place in the story ("FOUR SEASONS HOTEL MOROCCO") — but the unit usually
// shoots that somewhere else (a studio). We keep the scene text untouched and
// hold the real place separately, per "location block" (each distinct scene-
// location banner on a day). All of it lives in the one DAYLOC store (blob
// kind 'dayloc'), so no database change is needed. Three key shapes coexist:
//   ns|@set|<scene>        production-wide "set once, applies everywhere"
//   ns|unit|num|<scene>    override for one block on one day
//   ns|unit|num            LEGACY whole-day override (pre-blocks) — still
//                          honoured, and only for a day's primary block.
// Feeds maps links, travel bands and weather via d.loc; the scene text is kept
// in d.locDoc + each block's own `loc` so the editor can show what the
// schedule said.
let DAYLOC={};
try{DAYLOC=JSON.parse(store.get('crowdos-dayloc')||'{}')}catch(e){DAYLOC={}}
function saveDayLoc(){store.set('crowdos-dayloc',JSON.stringify(DAYLOC));cloudSyncBlob('dayloc',DAYLOC)}
function normLoc(s){return String(s||'').trim().toLowerCase().replace(/\s+/g,' ')}
function setLocKey(ns,sceneLoc){return (ns?ns+'|':'')+'@set|'+normLoc(sceneLoc)}
function blockLocKey(ns,d,sceneLoc){return (ns?ns+'|':'')+(d.unit||'Main')+'|'+d.num+'|'+normLoc(sceneLoc)}
function legacyDayLocKey(ns,d){return (ns?ns+'|':'')+(d.unit||'Main')+'|'+d.num}
// The real shooting location for one block, or '' if none set. Resolution:
// per-day-block override → (primary block only) legacy whole-day override →
// production-wide set map.
function resolveRealLoc(ns,d,sceneLoc,isPrimary){
  let v=DAYLOC[blockLocKey(ns,d,sceneLoc)];
  if(v!=null&&String(v).trim())return String(v).trim();
  if(isPrimary){v=DAYLOC[legacyDayLocKey(ns,d)];if(v!=null&&String(v).trim())return String(v).trim();}
  v=DAYLOC[setLocKey(ns,sceneLoc)];
  if(v!=null&&String(v).trim())return String(v).trim();
  return '';
}
// Blocks for a day, in order, each with its scene text, real location (if set)
// and the scenes that fall under it. Scene text comes from locBlocks (which
// prepModel fills and never overwrites), so it survives d.loc being swapped
// for the real place.
function dayBlocks(d){
  const blocks=(d.locBlocks&&d.locBlocks.length)?d.locBlocks:[{loc:(d.locDoc!=null?d.locDoc:d.loc)||'',from:0}];
  return blocks.map((b,i)=>{
    const from=b.from|0, to=i+1<blocks.length?(blocks[i+1].from|0):d.scenes.length;
    return {loc:b.loc,from,scenes:d.scenes.slice(from,Math.max(from,to)),
      real:resolveRealLoc(NS,d,b.loc,i===0),primary:i===0};
  });
}
// The scene text of a day's primary block (what the schedule said), regardless
// of whether d.loc has been swapped for the real place.
function dayPrimaryScene(d){
  if(d.locBlocks&&d.locBlocks[0])return d.locBlocks[0].loc;
  return (d.locDoc!=null?d.locDoc:d.loc)||'';
}
// Write the production-wide real location for a scene-location (master list).
function setRealLocEverywhere(sceneLoc,val){
  const k=setLocKey(NS,sceneLoc);
  if(val&&val.trim())DAYLOC[k]=val.trim();else delete DAYLOC[k];
  saveDayLoc();
}
// Write / clear a per-day override for one block.
function setRealLocForBlock(d,sceneLoc,val){
  const k=blockLocKey(NS,d,sceneLoc);
  if(val&&val.trim())DAYLOC[k]=val.trim();else delete DAYLOC[k];
  // a fresh per-day edit supersedes any legacy whole-day override on the
  // primary block, so drop the stale legacy key to avoid a confusing fallback
  if(dayPrimaryScene(d)===sceneLoc)delete DAYLOC[legacyDayLocKey(NS,d)];
  saveDayLoc();
}
function applyDayLocs(model,ns){
  for(const d of model.days){
    const primary=dayPrimaryScene(d);
    const real=resolveRealLoc(ns,d,primary,true);
    if(real){if(d.locDoc==null)d.locDoc=d.loc||'';d.loc=real;}
    else if(d.locDoc!=null){d.loc=d.locDoc;delete d.locDoc;}
  }
}
let RAEDITS={};
try{RAEDITS=JSON.parse(store.get('stuntos-raedits')||'{}')}catch(e){RAEDITS={}}
function saveRAedit(k,v){RAEDITS[k]=v;store.set('stuntos-raedits',JSON.stringify(RAEDITS));cloudSyncUser('raedits',RAEDITS)}

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
  setHighlight(hv,hv2);
  $('#colourPill').textContent=colour==='white'?'':colour+' schedule';
  $('#colourPill').style.display=colour==='white'?'none':'';
}
// per-production brand colour: a single hex drives the whole highlight set,
// without touching the schedule-colour pill (that's a schedule concept)
function accentTint(hex){
  const n=parseInt(hex.slice(1),16);let r=n>>16&255,g=n>>8&255,b=n&255;
  r=Math.round(r+(255-r)*.38);g=Math.round(g+(255-g)*.38);b=Math.round(b+(255-b)*.38);
  return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
}
function setHighlight(hv,hv2){
  // body.light / body.dark re-declare these vars, so setting them on <html>
  // alone is overridden — write to both so the brand colour actually lands
  for(const r of [document.documentElement.style,document.body&&document.body.style]){
    if(!r)continue;
    r.setProperty('--hv',hv);r.setProperty('--hv2',hv2);
    r.setProperty('--hv-dim',hexRgba(hv,.24));r.setProperty('--hv-line',hexRgba(hv,.58));
  }
}
function applyAccent(hex){setHighlight(hex,accentTint(hex));}
// live preview of the Branding section's brand colour while editing settings
function previewAccent(){
  const onEl=document.getElementById('psAccentOn');
  const hexEl=document.getElementById('psAccent');
  if(onEl&&onEl.classList.contains('on')&&hexEl){applyAccent(hexEl.value);return}
  const colEl=document.getElementById('psColour');
  const colour=(colEl&&colEl.value)||'white';
  const [hv,hv2]=THEMES[colour]||THEMES.white;setHighlight(hv,hv2);
}
// keep the Branding cover preview and the page banner in sync after a cover
// change, without a full re-render (which would lose your place in settings)
function refreshBrandingUI(name){
  const P=PRODS[name]||{};const cov=P.info&&P.info.cover;const ban=P.info&&P.info.banner;
  const prev=document.getElementById('psCoverPrev');
  if(prev){prev.style.backgroundImage=cov?`url('${cov}')`:'';prev.classList.toggle('empty',!cov);prev.innerHTML=cov?'':'<span>No cover yet</span>';}
  const pick=document.getElementById('psCoverPick');if(pick)pick.textContent=cov?'Replace image':'Upload cover image';
  const rm=document.getElementById('psCoverRemove');if(rm)rm.style.display=cov?'':'none';
  const bprev=document.getElementById('psBannerPrev');
  if(bprev){bprev.style.backgroundImage=ban?`url('${ban}')`:'';bprev.classList.toggle('empty',!ban);bprev.innerHTML=ban?'':'<span>No banner yet</span>';}
  const bpick=document.getElementById('psBannerPick');if(bpick)bpick.textContent=ban?'Replace image':'Upload banner image';
  const brm=document.getElementById('psBannerRemove');if(brm)brm.style.display=ban?'':'none';
  const shown=ban||cov;
  const head=document.querySelector('#dashView .dash-head');
  let banner=document.querySelector('#dashView .prod-banner');
  if(shown){
    if(!banner&&head){banner=document.createElement('div');banner.className='prod-banner has';head.parentNode.insertBefore(banner,head);}
    if(banner)banner.style.backgroundImage=`url('${shown}')`;
  }else if(banner)banner.remove();
}
// A production's brand colour wins; otherwise fall back to its schedule colour.
function applyProdBranding(p){
  const accent=p&&p.info&&p.info.accent;
  if(accent){applyAccent(accent);return}
  const colour=(p&&p.colour)||'white';
  const [hv,hv2]=THEMES[colour]||THEMES.white;
  setHighlight(hv,hv2);
}
function setMode(m){document.body.classList.toggle('light',m==='light');store.set('stuntos-mode',m)}
setMode(store.get('stuntos-mode')||'light'); // Laural is a light system — light is the default
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
const sceneHasCrowd=s=>!!(s.sa||(s.saChars&&s.saChars.length)||(s.featured&&s.featured.length)||(s.spacts&&s.spacts.length));
// which highlight applies to a scene row depends on which mode is showing —
// CrowdOS highlights crowd-requirement scenes, StuntOS highlights stunt scenes
const sceneHasReq=s=>APPMODE==='crowd'?sceneHasCrowd(s):sceneHasStunts(s);
function personName(code){const n=MODEL.castMap[code]||MODEL.castMap[String(code).toUpperCase()]||MODEL.castMap[String(code).toLowerCase()]||code;return String(n).replace(/STUNT ARRANGER/ig,'STUNT COORDINATOR')}
function codeClass(c){return c.type==='stuntCoord'?'co':isPerf(c)?'st':c.type==='double'?'dbl':c.type==='offCam'?'oc':''}
function dayPeakFeat(d){return Math.max(0,...d.scenes.map(s=>(s.featured||[]).reduce((a,f)=>a+f.count,0)),0)}
function dayPeakSpact(d){return Math.max(0,...d.scenes.map(s=>(s.spacts||[]).reduce((a,f)=>a+f.count,0)),0)}

// ---------- dates ----------
function fmtWeek(k){const d=new Date(k);return 'w/c '+d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
// Laural uses normal case throughout — day/month names render as written
const WD=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],MO=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDayDate(d){
  if(!d._date)return{big:esc(d.date),tip:`Shoot day ${d.num}${d.unit==='2nd'?' · 2nd Unit':''}`};
  const dt=d._date;
  return{big:`<span class="wd">${WD[dt.getDay()]}</span>${dt.getDate()} ${MO[dt.getMonth()]}`,
    tip:`Shoot day ${d.num}${d.unit==='2nd'?' · 2nd Unit':''} · ${dt.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}`};
}
function chipDate(d){
  // an unparseable date still has to fit in a chip — "MONDAY 14TH APRIL" is a
  // column-wrecker, so trim the weekday and the ordinal off the raw string
  if(!d._date)return (d.date||'').replace(/^\s*[A-Za-z]+day[,\s]+/i,'').replace(/(\d{1,2})(st|nd|rd|th)/i,'$1').trim()||d.date;
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
  if(MODEL)applyDayLocs(MODEL,NS);
  const R=rates();
  const sdOn=$('#rSDOn').checked;
  const sdRate=+$('#rSDRate').value||0, sdDaysPerWk=Math.max(0,+$('#rSDDays').value||0);
  // strip the active production's namespace off saved day adjustments — the
  // engine keys them by plain `unit|num` (the crowd wrapper already did this;
  // without it, per-day stunt adjustments never applied on real productions)
  const adj=NS
    ?Object.fromEntries(Object.entries(ADJ).filter(([k])=>k.startsWith(NS+'|')).map(([k,v])=>[k.slice(NS.length+1),v]))
    :Object.fromEntries(Object.entries(ADJ).filter(([k])=>!keyParts(k).ns));
  const cfgs=NS
    ?Object.fromEntries(Object.entries(STUNTCFG).filter(([k])=>k.startsWith(NS+'|')).map(([k,v])=>[k.slice(NS.length+1),v]))
    :Object.fromEntries(Object.entries(STUNTCFG).filter(([k])=>!keyParts(k).ns));
  COST=engineComputeStuntCosts(augmentedStuntModel(),adj,{...R,sdOn,sdRate,sdDays:sdDaysPerWk,...stuntRulesFrom(ACTIVE_RATES)},cfgs);
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
// Saving a day config is what makes it a real user edit: it clears the `seeded`
// flag so the day starts costing per-head. Called with no argument it promotes
// the day the calculator is currently open on, which covers every single-day
// handler; "apply to all" passes its own keys.
function persistCDAY(){store.set('stuntos-cday',JSON.stringify(CDAY));cloudSyncMap('cday')}
function saveCDAY(...keys){
  const touch=keys.flat().filter(Boolean);
  if(!touch.length&&CD_CTX&&COST&&COST.dayById&&COST.dayById[CD_CTX])touch.push(cdayKey(COST.dayById[CD_CTX]));
  for(const k of touch)if(CDAY[k])delete CDAY[k].seeded;
  persistCDAY();
}
function seedCday(d){
  const chars=[];
  const peak=dayPeakSA(d);
  const saScenes=d.scenes.filter(s=>s.sa>0).map(s=>s.num).join(', ');
  if(peak)chars.push({name:"SA's",count:peak,tier:'SA',scene:saScenes});
  // which scenes each named group appears in — the hint next to its row
  const scenesOf={};
  for(const s of d.scenes)for(const f of [...(s.saChars||[]),...(s.featured||[]),...(s.spacts||[])])
    if(f&&f.name)(scenesOf[f.name]=scenesOf[f.name]||[]).push(s.num);
  const sc=n=>[...new Set(scenesOf[n]||[])].join(', ');
  // Counts come from the ENGINE's own per-day buckets, which already applied
  // the weather-cover, non-costable and TBC-tier rules. Scanning the scenes
  // again here is how NAMED SA GROUPS used to go missing: the seeded list
  // becomes the day's requirement the moment anything is edited, so a day of
  // "Pedestrians ×20" priced as an empty day.
  const pd=(typeof CROWD!=='undefined'&&CROWD.perDay)?CROWD.perDay[d.id]:null;
  // supplementary fees set on the Crowd Breakdown must come with the group,
  // or opening the day calculator would silently drop them from the day
  const supOf=n=>{
    if(pd&&pd.supBy&&pd.supBy[n]!=null)return +pd.supBy[n]||0;
    let m=0;
    for(const s of d.scenes)for(const f of [...(s.saChars||[]),...(s.featured||[]),...(s.spacts||[])])
      if(f&&f.name===n)m=Math.max(m,+f.sup||0);
    return m;
  };
  if(pd&&(pd.saChars||pd.feats||pd.spacts)){
    for(const [n,c] of Object.entries(pd.saChars||{}))chars.push({name:n,count:c,tier:'SA',scene:sc(n),sup:supOf(n)});
    for(const [n,c] of Object.entries(pd.feats||{}))chars.push({name:n,count:c,tier:'Featured',scene:sc(n),sup:supOf(n)});
    for(const [n,c] of Object.entries(pd.spacts||{}))chars.push({name:n,count:c,tier:'SPACT',scene:sc(n),sup:supOf(n)});
  }else{
    // no costed entry for this day (or a day the engine skipped) — scan direct
    const grp=list=>{const m={};for(const s of d.scenes)for(const f of (s[list]||[]))if(f&&f.name)m[f.name]=Math.max(m[f.name]||0,f.count);return m};
    for(const [n,c] of Object.entries(grp('saChars')))chars.push({name:n,count:c,tier:'SA',scene:sc(n),sup:supOf(n)});
    for(const [n,c] of Object.entries(grp('featured')))chars.push({name:n,count:c,tier:'Featured',scene:sc(n),sup:supOf(n)});
    for(const [n,c] of Object.entries(grp('spacts')))chars.push({name:n,count:c,tier:'SPACT',scene:sc(n),sup:supOf(n)});
  }
  // Call/wrap come from the DAY'S OWN scheduled hours — never a hardcoded
  // 07:00–18:00. Getting this wrong showed a 1100–2000 day as an 07:00 start
  // and priced 8 OT blocks that do not exist. Same parse as seedStuntCfg().
  const m=/(\d{1,2})[:.]?(\d{2})\s*[-–]\s*(\d{1,2})[:.]?(\d{2})/.exec(d.hours||'');
  const call=m?String(+m[1]).padStart(2,'0')+':'+m[2]:'07:00';
  const wrap=m?String(+m[3]).padStart(2,'0')+':'+m[4]:'18:00';
  // a night shoot is either flagged as one or runs past midnight (1930–0430)
  const crossesMidnight=m&&(+m[3]*60+ +m[4])<(+m[1]*60+ +m[2]);
  const night=/CWN|SWN|night/i.test(d.type||'')||!!crossesMidnight;
  return {shift:night?'Night':'Day',fw:(d.type||'').toUpperCase().includes('CWD')?'cwd':'std',ph:false,
    call,wrap,travel:bandFor(d.loc,{bands:activeBands()}).band,chars,
    // untouched until the user actually changes something — see CrowdDayConfig.seeded
    seeded:true};
}
function cdHours(c){return cdTimes(c).hours}
function cdEarly(c){return cdTimes(c).call<7}
/* PACT/FAA rules (client-confirmed):
   · OT £11.69 / 30 min, always rounded up; blocks falling past 22:00 (or pre-07:00) pay night OT £17.54
   · Early call: every 30 min before 07:00 pays £17.54 (rounded up)
   · Early call travel: called at or before 06:00 → additional £20.91 (FAA 2026, from 1 Mar 2026)
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
// Travel-band overrides for the ACTIVE production (Production Settings →
// Locations). Location name → 'A' | 'B'; the engine matches them as
// case-insensitive substrings of each day's location text.
function activeBands(){
  const s=SOURCES[ACTIVE];
  const p=s&&s.kind&&PRODS[s.prod||s.title];
  if(!p||!Array.isArray(p.locations))return undefined;
  const bands={};
  for(const l of p.locations)if(l&&l.name&&(l.override==='A'||l.override==='B'))bands[l.name]=l.override;
  return Object.keys(bands).length?bands:undefined;
}
function prodBaseDay(prodName){
  const p=prodName&&PRODS[prodName];
  const bd=p&&p.info&&p.info.baseDay;
  return bd&&(bd.fw==='std'||bd.fw==='cwd')?{fw:bd.fw,otHours:Math.max(0,+bd.otHours||0)}:undefined;
}
function activeBaseDay(){
  const s=SOURCES[ACTIVE];
  return s&&s.kind?prodBaseDay(s.prod||s.title):undefined;
}
function crowdSettingsFromDOM(){
  const R=crowdRates();
  return {
    pact:{sa:R.sa,hol:R.hol,otDay:gOTd(),otNight:gOTn(),earlyTravel:gETsa(),travelA:gTA(),travelB:gTB()},
    spact:{basic:R.spact,night:gSpNight(),hol:gSpHol(),otDay:gOTd(),otNight:gOTn(),earlyTravel:gSpET(),travelA:gTA(),travelB:gTB()},
    bands:activeBands(),
    baseDay:activeBaseDay(),
  };
}
function cdPerHead(c,tier,ch){return engineCdPerHead(ch?engineCdRowConfig(c,ch):c,tier,crowdSettingsFromDOM())}
function cdDayCost(c){return engineCdDayCost(c,crowdSettingsFromDOM())}

// ---------- crowd engine ----------
let CROWD=null;
function crowdRates(){const sa=+$('#cSA').value||0;return {sa,feat:sa /* Featured = SA BDR + supplementary fees */,spact:+$('#cSpact').value||0,hol:(+$('#cHol').value||0)/100}}
function computeCrowdCosts(){
  if(MODEL&&typeof applySced==='function')applySced(MODEL);
  if(MODEL)applyDayLocs(MODEL,NS);
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
  $('#spactCalc').innerHTML=`Take 3 SPACT 2026 (4 Mar – 31 Dec): ${gbp(R.spact)} basic + ${gbp(SP3.hol)} payment in lieu of holiday. SWD 10 hrs (incl. lunch) / CWD 8 hrs; night ${gbp(SP3.night)}; PH ${gbp(SP3.phDay)}/${gbp(SP3.phNight)}; OT ${gbp(OTINC.day)} day, ${gbp(OTINC.night)} after 22:00; early-call travel ${gbp(SP3.earlyTravel)}. Daily counts use each day’s peak requirement. Travel allowance is auto-applied per head from each day’s location (Cat A ${gbp(PACT.travelA)} / Cat B ${gbp(PACT.travelB)}); calls before 07:00 add the ${gbp(PACT.early)} early-call payment via the day calculator. Chits and supplementary fees are the full Crowd engine’s territory.`;
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
function noteKey(d,s,idx){return (NS?NS+'|':'')+[d.unit||'Main',d.num,s?s.num:'',s?s.part:'',s!=null?idx:'DAY'].join('|')}
// read a note with fallback to the pre-namespacing key format, so notes
// saved before notes were cloud-synced still show (they migrate on next save)
function getNote(nk){
  if(NOTES[nk]!=null)return NOTES[nk];
  return (NS&&NOTES[nk.slice(NS.length+1)])||'';
}
// A crowd group still needs a real character name when its label is blank or
// is just a generic category word — "SA", "Extra", "SPACT", "Stunt",
// "Background artist" etc. These read as work-to-do so the AD can see at a
// glance which groups are still unnamed. Only a WHOLE-string match counts, so
// real names that merely contain a word ("Background Cop") are left alone.
const RE_CROWD_PLACEHOLDER=/^(?:s[.\/]?a[.\/]?|supporting artiste?s?|extras?|ex|bg|background(?:\s+(?:artiste?s?|actors?))?|spacts?|special ability(?:\s+crowd)?|featured(?:\s+background(?:\s+actors?)?)?|feat|stunts?|crowd|stand[-\s]?ins?|tbc|tbd|n\/?a)$/i;
function crowdNeedsName(name){const n=(name||'').trim();return !n||RE_CROWD_PLACEHOLDER.test(n);}
// Same words ignoring case/punctuation — spots a set line and an action
// sentence that are really the one text stored twice (older AI-read schedules
// copied the description into both, so every row printed it twice).
function sameSceneText(a,b){
  const k=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const x=k(a);
  return !!x&&x===k(b);
}
// The real-world place this scene shoots at — the block's set location if the
// user has told us where that set really is, otherwise the day's location.
// Prints under the scene number, call-sheet style.
function sceneShootLoc(d,idx){
  const blocks=dayBlocks(d);
  let b=blocks[0];
  for(const x of blocks)if(idx>=x.from)b=x;
  return String((b&&b.real)||d.loc||'').trim();
}
function stripHTML(d,s,idx){
  const cast=s.cast.filter(c=>c.type==='cast'||c.type==='offCam');
  const stunts=s.cast.filter(c=>isStuntTok(c)||c.type==='double');
  const featN=(s.featured||[]).reduce((a,f)=>a+f.count,0);
  const spactN=(s.spacts||[]).reduce((a,f)=>a+f.count,0);
  const featTip=(s.featured||[]).map(f=>f.name+(f.count>1?' ×'+f.count:'')).join(', ');
  const spactTip=(s.spacts||[]).map(f=>f.name+(f.count>1?' ×'+f.count:'')).join(', ');
  const nk=noteKey(d,s,idx), noteVal=getNote(nk);
  // Crowd chips live INSIDE the scene's crowd cell, so a click on any of
  // them bubbles to the cell's editor — one press and the name fields are
  // right there (the old behaviour hijacked the click to the day calculator,
  // whose names don't flow to briefs/views). Unnamed "SA n" chips look like
  // work-to-do (dashed amber); named characters read as done (solid blue).
  const namedChips=(list,cls,tip)=>{
    const shown=list.slice(0,3).map(f=>`<span class="code ${cls}${crowdNeedsName(f.name)?' needsname':''} named${APPMODE==='crowd'?' click':''}" data-tip="${esc(tip)}" tabindex="0">${esc(f.name.length>24?f.name.slice(0,22)+'…':f.name)}${f.count>1?' ×'+f.count:''}</span>`).join('');
    const more=list.length>3?`<span class="code ${cls} named" data-tip="${esc(tip)}" tabindex="0">+${list.length-3}</span>`:'';
    return shown+more;
  };
  const saCharTip=(s.saChars||[]).map(f=>f.name+(f.count>1?' ×'+f.count:'')).join(', ');
  // In crowd mode each group is its own chip you can move / copy / delete: it
  // carries its identity in data-* and gets a ⋯ menu handle and drag. A plain
  // click still bubbles to the cell editor (unchanged). In view/stunt mode the
  // old compact chips (truncated to 3) are kept exactly as before.
  const crChip=(g,cls,tip)=>{
    // Exact repeats are continuations automatically; a smaller group uses the
    // editor's explicit From above tick. This mirrors the crowd breakdown.
    // EITHER way there must be a matching group in a scene ABOVE: a stale
    // "from above" flag (its source scene was edited/moved/cleared) must never
    // render "(FROM ABOVE)" when nothing above actually carries this crowd.
    const grpAbove=needExact=>(d.scenes||[]).slice(0,idx).some(prev=>
      scGroupsOf(prev).some(pg=>pg.tier===g.tier&&!!pg.featured===!!g.featured&&
        (pg.name||'').trim().toLowerCase()===(g.name||'').trim().toLowerCase()&&
        (needExact?pg.count===g.count:pg.count>=(g.count||0))));
    const fromAbove=(g.count||0)>0&&(g.fromAbove?grpAbove(false):grpAbove(true));
    const isAnon=/\banon\b/.test(cls);
    const needsName=isAnon||crowdNeedsName(g.name);
    const label=isAnon?`SA ${g.count}`
      :`${esc((g.name||(g.tier==='SPACT'?'SPACT':'SA')).length>24?(g.name||'').slice(0,22)+'…':(g.name||(g.tier==='SPACT'?'SPACT':'SA')))}${g.count>1?' ×'+g.count:''}`;
    return `<span class="code ${cls}${needsName?' needsname':''}${fromAbove?' fromabove':''} named click crgrp" draggable="true" data-crgrp="1" data-gtier="${g.tier}" data-gfeat="${g.featured?1:0}" data-gname="${esc(g.name||'')}" data-gcount="${g.count}" data-gabove="${fromAbove?1:0}" data-tip="${esc(tip)}${APPMODE==='crowd'?' · right-click or drag to move, copy or delete':''}" tabindex="0">${label}${fromAbove?' (FROM ABOVE)':''}</span>`;
  };
  let crowdChips;
  if(APPMODE==='crowd'){
    const parts=[];
    if(s.sa>0)parts.push(crChip({tier:'SA',featured:false,name:'',count:s.sa},'cr anon',`Unnamed SA ×${s.sa} — click to edit · ⋯ or right-click for move / copy / delete · drag to another scene to move, or drop outside to remove`));
    for(const g of s.saChars||[])if((g.count||0)>0)parts.push(crChip({tier:'SA',featured:false,name:g.name||'',count:g.count,fromAbove:!!(g.flags||[]).includes('asAbove')},'cr',saCharTip));
    for(const g of s.featured||[])if((g.count||0)>0)parts.push(crChip({tier:'SA',featured:true,name:g.name||'',count:g.count,fromAbove:!!(g.flags||[]).includes('asAbove')},'feat',featTip));
    for(const g of s.spacts||[])if((g.count||0)>0)parts.push(crChip({tier:'SPACT',featured:false,name:g.name||'',count:g.count,fromAbove:!!(g.flags||[]).includes('asAbove')},'spact',spactTip));
    if(s.veh)parts.push(`<span class="code veh">${s.pod?'Pod ':''}Veh ${s.veh}</span>`);
    crowdChips=parts.join('');
  }else{
    crowdChips=[
      s.sa?`<span class="code cr anon" data-tip="SA ×${s.sa}" tabindex="0">SA ${s.sa}</span>`:'',
      (s.saChars||[]).length?namedChips((s.saChars||[]).map(f=>({name:f.name||'SA',count:f.count})),'cr',saCharTip):'',
      featN?namedChips(s.featured||[],'feat',featTip):'',
      spactN?namedChips((s.spacts||[]).map(f=>({name:f.name||'SPACT',count:f.count})),'spact',spactTip):'',
      s.veh?`<span class="code veh">${s.pod?'Pod ':''}Veh ${s.veh}</span>`:''
    ].filter(Boolean).join('');
  }
  // TWO key shapes live here, and they must not blur: the NOTES key (nk) is
  // namespace-prefixed; the SCENE key (snk) is plain unit|num|scene|part|idx
  // — sceneFromKey/scedKey expect the plain one and add the namespace
  // themselves. Passing nk to the editor made it open EMPTY on every real
  // (namespaced) production and stored edits under a double-prefixed key the
  // cost engine never read.
  const snk=sceneNK(d,s,idx);
  // The action sentence only earns its own line when it actually differs from
  // the set line above it.
  const showDesc=!!(s.desc||'').trim()&&!sameSceneText(s.slug,s.desc);
  // Don't repeat the set line as the shooting location when a day's location
  // was only ever back-filled from that same slug.
  const rawShootLoc=sceneShootLoc(d,idx);
  const shootLoc=sameSceneText(rawShootLoc,s.slug)||sameSceneText(rawShootLoc,s.desc)?'':rawShootLoc;
  return `<div class="strip ${todClass(s)} ${sceneHasReq(s)?'stunt-row':''}" data-stunt="${sceneHasReq(s)?1:0}" data-dayid="${esc(d.id)}" data-sceneidx="${idx}">
    <div class="rail"></div>
    <div class="scn">${esc(s.num)}${s.part?` <small>Pt ${esc(s.part)}</small>`:''}${shootLoc?`<small class="scnloc" data-tip="Where this scene shoots">${esc(shootLoc)}</small>`:''}<small>${esc(s.tod)} ${esc(s.scriptDay)}</small></div>
    <div class="ie">${esc(s.ie)}<small>${esc(s.pages||'—')}p</small></div>
    <div class="body">
      <div class="slug">${esc(s.slug)}</div>
      ${showDesc?`<div class="desc">${esc(s.desc)}</div>`:''}
      ${s.tags.length?`<div class="tags">${s.tags.map(t=>`<span class="tag ${/^Chase|^Sequence/i.test(t)?'strand':''}">${esc(t)}</span>`).join('')}</div>`:''}
    </div>
    <div class="ccol"><div class="codes">${cast.length?cast.map(codeChip).join(''):'<span class="dash">—</span>'}</div></div>
    <div class="ccol reqcell${APPMODE==='stunt'?' editable':''}"${APPMODE==='stunt'?` data-reqedit="${esc(snk)}" data-reqmode="stunt" role="button" tabindex="0" data-tip="Click to add stunt performers to this scene"`:''}><div class="codes">${(stunts.length||(s.extras||[]).length)?stunts.map(codeChip).join('')+(s.extras||[]).map(extraChip).join(''):`<span class="dash">${APPMODE==='stunt'?'＋':'—'}</span>`}</div></div>
    <div class="ccol reqcell${APPMODE==='crowd'?' editable':''}"${APPMODE==='crowd'?` data-reqedit="${esc(snk)}" data-reqmode="crowd" role="button" tabindex="0" data-tip="Click to add crowd to this scene"`:''}><div class="codes">${crowdChips||`<span class="dash">${APPMODE==='crowd'?'＋':'—'}</span>`}</div></div>
    <div><button class="notebtn ${noteVal?'has':''}" data-note="1" data-tip="${noteVal?'View / edit note':'Add note'}" aria-label="Scene note">${icon('pencil')}</button></div>
    <div class="notearea hidden"><textarea data-notekey="${esc(nk)}" placeholder="Scene note — pads, harnesses, rigging…">${esc(noteVal)}</textarea></div>
    <div class="reqarea hidden" data-reqkey="${esc(snk)}"></div>
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
// display order everywhere stunts list: coordinator (the boss — in charge,
// and in practice the person using this platform) first, then doubles, then
// performers and everyone else
// Rank by TYPE first; parsed schedules often file named stunt team members
// as generic "extras" with a descriptive code (no stuntCoord/stuntDbl type
// distinction), so fall back to matching "coord"/"double" in the name itself
function stuntRank(t,code){
  if(t==='stuntCoord'||/co-?ord/i.test(code||''))return 0;
  if(t==='stuntDbl'||t==='double'||/doubl/i.test(code||''))return 1;
  return 2;
}
// within the coordinator tier, the person actually NAMED coordinator leads
function stuntOrder(a,b){return stuntRank(a.type,a.code)-stuntRank(b.type,b.code)||b.cost-a.cost}
function dayHeadStunts(d){
  const pd=COST.perDay[d.id];
  if(!pd)return'';
  const seen={},chips=[];
  for(const p of [...pd.people].sort(stuntOrder)){
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
// What the SCHEDULE asks of a day in SA heads: the anonymous peak plus every
// named SA group's peak — the same sum the costing engine makes. dayPeakSA()
// alone only sees anonymous "N x C" rows, so once an AD names a group every
// figure built on it silently reads low (or, in the day calculator's reconcile
// line, claimed the schedule wanted 0 SA).
function dayScheduleSA(d){
  if(!d||!d.scenes)return 0;
  const named={};
  for(const sc of d.scenes)for(const f of sc.saChars||[])if(f&&f.name)named[f.name]=Math.max(named[f.name]||0,f.count);
  return dayPeakSA(d)+Object.values(named).reduce((a,n)=>a+n,0);
}
// ---------- half-named crowd: the double-count trap ----------
// A day's SA requirement is the anonymous peak PLUS every named group's peak.
// That's right for two different groups ("5 nurses" in one scene, "3 doctors"
// in another = 8 people booked). It is WRONG when the SAME group is named in
// one scene and left as plain "300 SA" in the day's other scenes: those 300
// then get counted twice and the day's cost doubles. Naming groups is exactly
// what the briefs workflow asks for, so this has to be caught and fixable.
// Signature: a named SA group whose peak equals an anonymous SA count still
// sitting on another scene of the same day.
function halfNamedSA(d){
  if(!d||!d.scenes)return null;
  const named=new Map();const anonCounts=[];
  for(const s of d.scenes){
    if(s.sa>0)anonCounts.push(s.sa);
    for(const f of s.saChars||[])if(f&&f.name)named.set(f.name,Math.max(named.get(f.name)||0,f.count));
  }
  if(!named.size||!anonCounts.length)return null;
  const hits=[...named.entries()].filter(([,c])=>anonCounts.includes(c));
  if(!hits.length)return null;
  const [name,count]=hits[0];
  const scenes=d.scenes.filter(s=>s.sa===count).length;
  const total=anonCounts.length?Math.max(...anonCounts):0;
  return {name,count,scenes,counted:total+[...named.values()].reduce((a,n)=>a+n,0)};
}
// give every still-anonymous SA group of the same size the same name, so the
// day counts one group of 300 instead of two
function nameAllAnonSA(d,name,count){
  if(!d||!name||!count)return 0;
  const _snap=JSON.stringify(SCED);
  let n=0;
  d.scenes.forEach((s,idx)=>{
    if(s.sa!==count)return;
    const chars=[];
    for(const f of s.saChars||[])chars.push({name:f.name,count:f.count,tier:'SA',featured:false});
    for(const f of s.featured||[])chars.push({name:f.name,count:f.count,tier:'SA',featured:true});
    for(const f of s.spacts||[])chars.push({name:f.name||'',count:f.count,tier:'SPACT',featured:false});
    // the anonymous row becomes the named group (merged if the name is already there)
    const same=chars.find(c=>c.tier==='SA'&&!c.featured&&c.name===name);
    if(same)same.count=Math.max(same.count,count);
    else chars.push({name,count,tier:'SA',featured:false});
    SCED[scedKey(sceneNK(d,s,idx))]={chars};
    n++;
  });
  if(n){registerCrowdUndo(_snap,'named SA across the day');saveSced();refreshAll();}
  return n;
}
function crowdCharTip(d){
  const key=cdayKey(d);
  let list;
  if(CDAY[key])list=CDAY[key].chars.filter(x=>(+x.count||0)>0).map(x=>`${x.name} ×${x.count}`);
  else{
    const cd=CROWD.perDay[d.id];
    if(!cd)return 'Rename / split into characters';
    const named=Object.entries(cd.saChars||{});
    const anon=cd.sa-named.reduce((a,[,n])=>a+n,0);
    list=[...(anon>0?[`SA's ×${anon}`]:[]),
      ...named.map(([n,x])=>`${n} ×${x}`),
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
// ---- today awareness: the calendar day this app is being used ON ----
const todayCal=()=>{const n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate()).getTime()};
const dayCal=d=>d._date?new Date(d._date.getFullYear(),d._date.getMonth(),d._date.getDate()).getTime():null;
const dayIsToday=d=>dayCal(d)===todayCal();
const dayIsPast=d=>{const c=dayCal(d);return c!=null&&c<todayCal()};
// The day header's location region: one chip per location block. Each chip
// shows the SCENE location (schedule text) with a maps link, and — when a real
// shooting location has been set and it differs — an "actually at …" badge, so
// studio-for-location days read at a glance. The pin opens the block editor.
function dayLocHTML(d){
  const blocks=dayBlocks(d);
  return `<span class="dlocs">`+blocks.map(b=>{
    // A schedule imported before the sequence-title guard may still carry a
    // narrative label ("Hotel opening") as its location. Never show that as a
    // place — fall back to the block's scene location so it reads correctly and
    // the real place stays "TBC" until confirmed.
    const rawScene=b.loc||'';
    const scene=looksLikeSequenceTitle(rawScene)
      ? (((b.scenes||[]).find(s=>(s.slug||'').trim())||{}).slug||'')
      : rawScene;
    const real=b.real||'';
    const hasReal=!!real, differs=hasReal&&normLoc(real)!==normLoc(scene);
    const mapsHref=q=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    const editBtn=`<button class="dloc-edit${hasReal?' on':''}" data-locedit="${esc(d.id)}" data-locblk="${esc(scene)}" data-tip="${hasReal?('Real filming location set: “'+esc(real)+'”. Click to change.'):'Set where this day is actually filmed — the schedule only names the scene’s location, so the real place is TBC'}">${icon('pin')}</button>`;
    // Confirmed real place that IS the scene text: show it once, mappable.
    if(hasReal&&!differs){
      return `<span class="dlocblk">`
        +`<a class="dloc loclink" href="${mapsHref(real)}" target="_blank" rel="noopener" data-tip="Filming location confirmed — open in Google Maps">${esc(scene||real)}</a>`
        +editBtn+`</span>`;
    }
    // Otherwise the scene location is only the story's place — shown for context
    // but NOT a map pin. The actual filming location links to Google Maps when
    // set, and reads "TBC" until someone confirms where it is really shot.
    const sceneEl=`<span class="dloc dloc-scene" data-tip="Scene location — the place named in the script, not a real filming address">${esc(scene||'—')}</span>`;
    const actualEl=hasReal
      ? `<a class="dloc-real loclink on" href="${mapsHref(real)}" target="_blank" rel="noopener" data-tip="Filming location — actually shot here. Open in Google Maps.">→ ${esc(real)}</a>`
      : `<span class="dloc-tbc" data-tip="Filming location not confirmed yet — click the pin to set where this day is actually shot">→ TBC</span>`;
    return `<span class="dlocblk">${sceneEl}${actualEl}${editBtn}</span>`;
  }).join('')+`</span>`;
}
function renderDays(){
  const notesByDay={};
  for(const n of (MODEL.notes||[])){if(n.afterDay!=null)(notesByDay[n.afterDay]=notesByDay[n.afterDay]||[]).push(n)}
  const showUnit=MODEL.multiUnit;
  const BDAY=APPMODE==='crowd'?briefsByDay():null; // brief badges are a crowd concern
  const cardHTML=d=>{
    const pd=COST.perDay[d.id], cd=CROWD.perDay[d.id], work=APPMODE==='crowd'?cd:pd;
    const db=BDAY?BDAY.get(d.id):null;
    const peak=dayScheduleSA(d), f=fmtDayDate(d);
    const dnk=noteKey(d,null), dnote=getNote(dnk);
    return `<div class="daycard ${work?'has-stunts':''}${dayIsToday(d)?' today':''}" id="day-${d.id}" data-stunt="${work?1:0}">
      <div class="dayhead">
        <div class="dh-top">
          <span class="ddate" data-tip="${esc(f.tip)}" tabindex="0">${f.big}</span>
          <span class="dnum">D${d.num}</span>
          ${dayIsToday(d)?`<span class="unitpill todaypill">Today</span>`:''}
          ${d.carried?`<span class="unitpill carried" data-tip="Already shot — kept from the ${esc(d.fromRev||'previous')} schedule so the production keeps its full timeline">Shot · ${esc(d.fromRev||'prev')}</span>`:''}
          ${showUnit?`<span class="unitpill ${d.unit==='2nd'?'u2':'main'}">${d.unit==='2nd'?'2nd Unit':'Main Unit'}</span>`:''}
          ${dayLocHTML(d)}
          <span class="dmeta">${esc(d.hours)}${d.cams?` · ${d.cams}cam`:''} · ${esc(d.pages||'?')}p</span>
          <div class="grow"></div>
          ${APPMODE==='stunt'&&pd?`<span class="dpill stunt">Stunts</span>`:''}
          ${APPMODE==='crowd'&&cd?`<span class="dpill stunt">Crowd</span>`:''}
          ${d.type?`<span class="dpill type">${esc(d.type)}</span>`:''}
          ${peak&&APPMODE==='stunt'?`<span class="dpill sa">SA ${peak}</span>`:''}
          ${APPMODE==='crowd'&&(cd&&cd.sa||peak)?`<button class="dpill sa click" data-splitcrowd="${esc(d.id)}" data-tip="${esc(crowdCharTip(d))}">SA ${cd&&cd.sa?cd.sa:peak}</button>`:''}
          ${APPMODE==='crowd'&&halfNamedSA(d)?(hn=>`<button class="dpill dblwarn" data-fixhalfnamed="${esc(d.id)}" data-tip="This day is costing ${hn.counted} SA. “${esc(hn.name)}” (${hn.count}) is named on one scene while ${hn.count} SA sits unnamed on ${hn.scenes} more, so the same people are counted twice. Click to name them “${esc(hn.name)}” everywhere on this day.">${icon('warn')} counted twice</button>`)(halfNamedSA(d)):''}
          ${db?`<button class="dpill briefpill ${db.sent>=db.total?'ok':db.sent?'part':'none'}" data-daybriefs="${esc(d.id)}" data-tip="${db.sent} of ${db.total} character brief${db.total===1?'':'s'} emailed to the agency — click for this day's list">${icon('mail')} ${db.sent}/${db.total} sent</button>`:''}
          ${APPMODE==='stunt'&&pd?`<button class="dh-cost costable" data-costday="${esc(d.id)}" data-tip="Click for the full cost breakdown">${gbp(pd.cost)}<small>Stunt cost</small></button>`:''}
          ${APPMODE==='crowd'&&cd?`<button class="dh-cost costable" data-costday="${esc(d.id)}" data-tip="Open the day calculator">${gbp(Math.round(cd.cost))}<small>${cd.edited?icon('pencil')+' ':''}Crowd cost</small></button>`:''}
          ${APPMODE==='stunt'&&pd?`<button class="tb-btn" data-raday="${esc(d.id)}" style="font-size:11px;padding:6px 12px">${icon('file')} Risk assessment</button>`:''}
        </div>
        ${APPMODE==='crowd'?dayHeadCrowd(d):dayHeadStunts(d)}
      </div>
      <div class="colhead"><div></div><div>Scene<span class="colgrip gr-right" data-col="scene" data-tip="Drag to resize · double-click to reset"></span></div><div></div><div>Set / action</div><div>Cast<span class="colgrip gr-left" data-col="cast" data-tip="Drag to resize · double-click to reset"></span></div><div class="c-stunt">Stunts<span class="colgrip gr-left" data-col="stunt" data-tip="Drag to resize · double-click to reset"></span></div><div class="c-crowd">Crowd<span class="colgrip gr-left" data-col="crowd" data-tip="Drag to resize · double-click to reset"></span></div><div class="colmenu-cell"><button class="colmenu-btn" data-colmenu aria-label="Show or hide columns" data-tip="Show or hide columns">${icon('columns')}</button></div></div>
      ${d.scenes.map((s,i)=>s._ch?'':stripHTML(d,s,i)).join('')}
      <div class="daynote-row">
        <button class="adddaynote ${dnote?'has':''}" data-daynote="1">${dnote?icon('pencil')+' Day note':'＋ Add day note'}</button>
        <button class="daynote-rm hidden" data-daynote-rm="${esc(dnk)}" data-tip="Remove this day note">✕ Remove</button>
        <textarea class="hidden" data-notekey="${esc(dnk)}" placeholder="Day note…">${esc(dnote)}</textarea>
      </div>
    </div>`+(notesByDay[d.num]&&d.unit!=='2nd'?notesByDay[d.num].map(n=>`<div class="breakline">${esc(n.text)}</div>`).join(''):'');
  };
  // today first-class: a call-sheet-style bar (date · live clock · weather ·
  // today's shoot day), then past days fold away into an archive drawer —
  // the board's focus is today and forward
  const tDay=MODEL.days.find(dayIsToday);
  const next=MODEL.days.find(d=>{const c=dayCal(d);return c!=null&&c>todayCal()});
  const now=new Date();
  const banner=`<div class="todaybar${tDay?' shooting':''}">
    <span class="tb-date"><b>${now.toLocaleDateString('en-GB',{weekday:'long'})}</b> ${now.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</span>
    <span class="tb-clock" id="nowClock">${now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span>
    <span class="tb-wx" id="wxSlot"></span>
    <span class="grow"></span>
    ${tDay?`<button class="tb-today" data-goto="${esc(tDay.id)}">Shooting today — D${tDay.num} · ${esc((tDay.loc||'').slice(0,34))}${tDay.hours?' · '+esc(tDay.hours):''}</button>`
      :next?`<span class="tb-next">No shoot day today · next <button class="dchip" data-goto="${esc(next.id)}">D${next.num} · ${esc(chipDate(next))}</button></span>`
      :''}
  </div>`;
  const past=MODEL.days.filter(dayIsPast), ahead=MODEL.days.filter(d=>!dayIsPast(d));
  // the archive drawer is for LIVE productions (past folds away, focus is
  // today+forward). A fully wrapped production is all history — show it plain.
  const wrapped=past.length&&!ahead.some(d=>dayCal(d)!=null);
  const pastHTML=past.length&&!wrapped?`<details class="pastdrawer"${PAST_OPEN?' open':''}><summary>${past.length} past day${past.length===1?'':'s'} — archived, everything still opens</summary>${past.map(cardHTML).join('')}</details>`:'';
  $('#viewDays').innerHTML=banner+(wrapped?past.map(cardHTML).join(''):pastHTML)+ahead.map(cardHTML).join('');
  // "Jump to day…" quick-nav — one option per shoot day, kept in sync with the
  // schedule on every render. Acts as a command, so it snaps back to the
  // placeholder after each jump (see the change listener by the search wiring).
  $('#dayJump').innerHTML='<option value="">Jump to day…</option>'+MODEL.days.map(d=>{
    const when=d._date?`${WD[d._date.getDay()]} ${chipDate(d)}`:d.date;
    const loc=(d.loc||'').length>24?d.loc.slice(0,24)+'…':(d.loc||'');
    return `<option value="${esc(d.id)}">D${d.num}${d.unit==='2nd'?' (2nd)':''} — ${esc(when)}${loc?' — '+esc(loc):''}${dayIsToday(d)?' — Today':''}</option>`;
  }).join('');
  loadTodayWeather((tDay||next||{}).loc,$('#wxSlot'));
  applyFilters();
}
let PAST_OPEN=false;
document.addEventListener('toggle',e=>{if(e.target.classList&&e.target.classList.contains('pastdrawer'))PAST_OPEN=e.target.open},true);
// live clock — a minute tick keeps the bar honest without re-rendering
setInterval(()=>{
  const el=document.getElementById('nowClock');
  if(el)el.textContent=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
},30000);
// today's weather for the shoot location, call-sheet style. Open-Meteo (free,
// keyless); location strings are messy so geocoding falls back to London.
// Failures stay silent — weather is a nicety, never an error.
const WX_CODES={0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Fog',51:'Drizzle',53:'Drizzle',55:'Drizzle',56:'Freezing drizzle',57:'Freezing drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',80:'Showers',81:'Showers',82:'Heavy showers',85:'Snow showers',86:'Snow showers',95:'Thunderstorm',96:'Thunderstorm',99:'Hail storm'};
// weather code → icon name (see ICONS)
const WX_ICO={0:'sun',1:'cloudsun',2:'cloudsun',3:'cloud',45:'fog',48:'fog',51:'drizzle',53:'drizzle',55:'drizzle',56:'drizzle',57:'drizzle',61:'drizzle',63:'rain',65:'rain',66:'rain',67:'rain',71:'snow',73:'snow',75:'snow',77:'snow',80:'drizzle',81:'rain',82:'rain',85:'snow',86:'snow',95:'storm',96:'storm',99:'storm'};
async function loadTodayWeather(loc,slot){
  if(!slot)return;
  const day=new Date().toISOString().slice(0,10);
  const key='crowdos-wx-'+day+'-'+((loc||'london').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().slice(0,40));
  try{
    let wx=null;
    try{wx=JSON.parse(sessionStorage.getItem(key)||'null')}catch(e){}
    if(!wx){
      // strip schedule noise ("GV's", "Loc TBC", studio suffixes) and try the
      // first place-ish token; unknown places fall back to London
      const q=(loc||'').replace(/GV'?s|studios?|loc\.?|tbc|ext\.?|int\.?/ig,'').split(/[,\/·–—-]/)[0].trim()||'London';
      let g=await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name='+encodeURIComponent(q)).then(r=>r.json()).catch(()=>null);
      let hit=g&&g.results&&g.results[0];
      if(!hit){
        g=await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&name=London').then(r=>r.json()).catch(()=>null);
        hit=g&&g.results&&g.results[0];
      }
      if(!hit)return;
      const f=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=1`).then(r=>r.json());
      const d=f&&f.daily;
      if(!d||!d.time)return;
      wx={place:hit.name,code:d.weather_code[0],max:Math.round(d.temperature_2m_max[0]),min:Math.round(d.temperature_2m_min[0]),
        rain:d.precipitation_probability_max?d.precipitation_probability_max[0]:null,
        sunrise:(d.sunrise[0]||'').slice(11,16),sunset:(d.sunset[0]||'').slice(11,16)};
      try{sessionStorage.setItem(key,JSON.stringify(wx))}catch(e){}
    }
    slot.innerHTML=`<span class="wx-main">${WX_ICO[wx.code]?icon(WX_ICO[wx.code]):''} ${WX_CODES[wx.code]||''}</span><span class="wx-bit">${wx.max}° / ${wx.min}°</span>${wx.rain!=null?`<span class="wx-bit">${icon('drop')} ${wx.rain}%</span>`:''}${wx.sunrise?`<span class="wx-bit" data-tip="Sunrise – sunset">${icon('sunrise')} ${esc(wx.sunrise)} – ${esc(wx.sunset)}</span>`:''}<span class="wx-place">${esc(wx.place)}</span>`;
  }catch(e){/* silent — see note above */}
}

// ---------- cost popup ----------
let CD_CTX=null, CD_MOUNT=null;
let CD_CHAR_OPEN=new Set(); // row indices with the ⏱ call/wrap expander open (no override set yet)
function openCrowdDay(dayId){
  const d=COST.dayById[dayId];
  if(!d)return;
  CD_CTX=dayId;CD_MOUNT=$('#cdBody');
  CD_CHAR_OPEN=new Set();
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
  CD_CHAR_OPEN=new Set();
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
  const peak=dayScheduleSA(d);
  const saAlloc=c.chars.filter(x=>x.tier==='SA').reduce((a,x)=>a+(+x.count||0),0);
  const rec=saAlloc===peak?['ok',`SA heads match the schedule peak (${peak})`]:saAlloc>peak?['warn',`SA heads ${saAlloc} — schedule peak is ${peak} (+${saAlloc-peak})`]:['warn',`SA heads ${saAlloc} — schedule peak is ${peak} (−${peak-saAlloc} unallocated)`];
  const dc=cdDayCost(c);
  const rowHTML=(ch,i)=>{
    const ph=cdPerHead(c,ch.tier,ch);
    const hasOverride=!!(ch.call||ch.wrap);
    const rowCfg=engineCdRowConfig(c,ch), effCall=rowCfg.call, effWrap=rowCfg.wrap;
    return `<div class="charbox" data-ri="${i}">
      <input data-cdchar="name" data-i="${i}" value="${esc(ch.name)}" placeholder="Character — e.g. Hotel guests">
      <input data-cdchar="scene" data-i="${i}" value="${esc(ch.scene||'')}" placeholder="Sc" style="font-family:var(--mono);font-size:11px" data-tip="Scene(s) this character belongs to">
      <input class="cnt2" data-cdchar="count" data-i="${i}" type="number" min="0" value="${ch.count}">
      <select data-cdchar="tier" data-i="${i}"><option${ch.tier==='SA'?' selected':''}>SA</option><option${ch.tier==='Featured'?' selected':''}>Featured</option><option${ch.tier==='SPACT'?' selected':''}>SPACT</option></select>
      <select data-cdsup="${i}" data-tip="Supplementary fee per head — Featured SA = SA rate + fees">
        <option value="0"${!(+ch.sup)?' selected':''}>None</option>
        ${SUPS.map(s=>`<option value="${s.amt}"${(+ch.sup===s.amt)?' selected':''}>${s.label.length>26?s.label.slice(0,26)+'…':s.label} — ${gbp(s.amt)}</option>`).join('')}
        ${(+ch.sup)&&!SUPS.some(s=>s.amt===+ch.sup)?`<option value="${ch.sup}" selected>Custom — ${gbp(+ch.sup)}</option>`:''}
      </select>
      <span class="num mono">${gbp(ph.per+(+ch.sup||0))}</span>
      <span class="num money cdsub" data-i="${i}">${gbp((ph.per+(+ch.sup||0))*(+ch.count||0))}</span>
      <button class="del" data-cddel="${i}" aria-label="Remove">✕</button>
      <button class="charbox-time ${hasOverride?'on':''}" data-cdchartoggle="${i}" data-tip="Override this character's call/wrap time" aria-expanded="${hasOverride?'true':'false'}">${icon('clock')}${hasOverride?` ${esc(effCall)}–${esc(effWrap)}`:''}</button>
      ${(hasOverride||CD_CHAR_OPEN.has(i))?`<div class="charbox-timerow" data-cdchartimerow="${i}">
        <label>Call <input type="time" data-cdchartime="call" data-i="${i}" value="${esc(ch.call||'')}" placeholder="${esc(c.call)}"></label>
        <label>Wrap <input type="time" data-cdchartime="wrap" data-i="${i}" value="${esc(ch.wrap||'')}" placeholder="${esc(c.wrap)}"></label>
        <span class="cdinfo">blank = inherits the day's ${esc(c.call)}–${esc(c.wrap)}</span>
        ${hasOverride?`<button class="del" data-cdchartimeclear="${i}" aria-label="Clear override">Clear</button>`:''}
      </div>`:''}
    </div>`;
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
  <div class="cdsec"><div class="sl2">2 · Hours &amp; shift</div>
    <div class="cdrow" style="margin-bottom:2px">${sliderHTML(c.call,c.wrap,'cd')}</div>
    <div class="cdrow">
      <span class="cdinfo" id="cdHrsInfo">${cdHrsText(c)}</span>
      <span class="cdflag ${saPer.earlyBlocks||saPer.earlyTravel?'on':''}" id="cdEarlyFlag">${cdEarlyText(c)}</span>
    </div>
  </div>
  <div class="cdsec"><div class="sl2">3 · Travel</div>
    <div class="cdrow">
      <span class="seg" data-cdseg="travel"><button data-v="A" class="${c.travel==='A'?'on':''}">Cat A — Zones 1–3 · ${gbp(gTA())}</button><button data-v="B" class="${c.travel==='B'?'on':''}">Cat B — Studios/Beyond Z3 · ${gbp(gTB())}</button><button data-v="none" class="${c.travel==='none'?'on':''}">No travel</button></span>
      <span class="cdinfo">${(()=>{const lb=bandFor(d.loc,{bands:activeBands()});return lb.known?`auto: “${esc(d.loc)}” → Cat ${lb.band}`:`“${esc(d.loc)}” not recognised — defaulted Cat A, override if needed`})()}</span>
    </div>
  </div>
  <div class="cdsec"><div class="sl2">4 · Characters</div>
    <div id="cdChars"><div class="charboxwrap">
    <div class="charbox charboxhead"><span>Character</span><span>Scene</span><span class="num">Count</span><span>Tier</span><span class="num">Supp £</span><span class="num">Per head</span><span class="num">Subtotal</span><span></span><span></span></div>
    ${c.chars.map(rowHTML).join('')}
    </div></div>
    <div class="cdrow" style="margin-top:8px">
      <button class="adddaynote" data-cdadd>＋ Add character</button>
      <span class="reconcile ${rec[0]}" id="cdRec">${rec[1]}</span>
    </div>
  </div>
  ${(()=>{
    // Opening a day shows what its REAL hours cost. Until something is edited
    // the board still costs it by the production's budget assumption (a flat
    // day rate when none is set), so the two numbers differ with nothing
    // touched. Say so plainly instead of leaving the AD to wonder.
    if(!c.seeded)return '';
    const boardCost=(CROWD.perDay[d.id]||{}).cost;
    const here=dc.cost;
    if(!boardCost||Math.abs(boardCost-here)<1)return '';
    const bd=activeBaseDay();
    return `<div class="note cdgapnote">The board costs this day at <b>${gbp(Math.round(boardCost))}</b> — ${bd?`your budget assumption (${bd.fw==='cwd'?'CWD':'Standard Day'}${bd.otHours?` + ${bd.otHours}h OT`:''})`:'the flat day rate, because this production has no budget assumption set'}. Priced on its own scheduled hours (${esc(c.call)}–${esc(c.wrap)}) it comes to <b>${gbp(Math.round(here))}</b>. Change anything here and ${gbp(Math.round(here))} becomes this day's cost; set a production-wide assumption in Production settings → Rate cards to apply the same thinking to every day.</div>`;
  })()}
  <div class="cdtotal">
    <span class="cdinfo" id="cdPerHeadInfo">SA per head today: <b>${gbp(saPer.per)}</b> (${gbp(saPer.base)} + hol${saPer.otBlocks?` + OT ${gbp(saPer.ot)}`:''}${saPer.earlyBlocks?` + early ${gbp(saPer.earlyPay)}`:''}${saPer.travel?` + travel ${gbp(saPer.travel)}`:''}${saPer.earlyTravel?` + early travel ${gbp(saPer.earlyTravel)}`:''})</span>
    <span class="n costable" id="cdDayTotal">${gbp(dc.cost)}</span>
  </div>
  <div class="cdrow" style="margin-top:12px">
    <button class="dz-btn" style="background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:9px 14px;font-weight:700;font-size:12px" data-cdapplyall>${icon('link')} Apply these timings to all crowd days</button>
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
  // Call/wrap live on the slider itself as handle labels — dragging updates them
  // (existing [data-${tag}time] sync logic below) and they're plain <input
  // type=time> underneath, so tapping one edits it directly without touching
  // the handle.
  return `<div class="dslider" data-slider="${tag}">
    <input type="time" class="handle-lbl la" data-${tag}time="call" value="${esc(callT)}" style="left:${pct(cm)}%" aria-label="Call time">
    <input type="time" class="handle-lbl lb" data-${tag}time="wrap" value="${esc(wrapT)}" style="left:${pct(wm)}%" aria-label="Wrap time">
    <div class="slinner">
      <div class="track"></div>
      <div class="fill" style="left:${pct(cm)}%;right:${100-pct(wm)}%"></div>
      <input type="range" class="rA" min="${SLD_MIN}" max="${SLD_MAX}" step="5" value="${cm}" aria-label="Drag call time">
      <input type="range" class="rB" min="${SLD_MIN}" max="${SLD_MAX}" step="5" value="${wm}" aria-label="Drag wrap time">
      <div class="ticks">${ticks}</div>
    </div>
  </div>`;
}
function syncSlider(root,callT,wrapT){
  const sl=root.querySelector('.dslider');if(!sl)return;
  const {cm,wm}=sliderPos(callT,wrapT);
  sl.querySelector('.rA').value=cm;sl.querySelector('.rB').value=wm;
  const pct=v=>((v-SLD_MIN)/(SLD_MAX-SLD_MIN)*100);
  const f=sl.querySelector('.fill');f.style.left=pct(cm)+'%';f.style.right=(100-pct(wm))+'%';
  const la=sl.querySelector('.la'),lb=sl.querySelector('.lb');
  if(la){la.value=callT;la.style.left=pct(cm)+'%'}
  if(lb){lb.value=wrapT;lb.style.left=pct(wm)+'%'}
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
    const ph=cdPerHead(c,ch.tier,ch);
    const cell=CD_MOUNT.querySelector(`.cdsub[data-i="${i}"]`);
    if(cell)cell.textContent=gbp((ph.per+(+ch.sup||0))*(+ch.count||0));
    const box=CD_MOUNT.querySelector(`.charbox[data-ri="${i}"]`);
    const perCell=box&&box.querySelector('.num.mono');
    if(perCell)perCell.textContent=gbp(ph.per+(+ch.sup||0));
    const tbtn=CD_MOUNT.querySelector(`[data-cdchartoggle="${i}"]`);
    if(tbtn){
      const hasOverride=!!(ch.call||ch.wrap);
      const rowCfg=engineCdRowConfig(c,ch);
      tbtn.className='charbox-time '+(hasOverride?'on':'');
      tbtn.innerHTML=hasOverride?`${icon('clock')} ${esc(rowCfg.call)}–${esc(rowCfg.wrap)}`:icon('clock');
    }
  });
  const el=CD_MOUNT.querySelector('#cdDayTotal');if(el)el.textContent=gbp(cdDayCost(c).cost);
  const phEl=CD_MOUNT.querySelector('#cdPerHeadInfo');
  if(phEl){const sp=cdPerHead(c,'SA');phEl.innerHTML=`SA per head today: <b>${gbp(sp.per)}</b> (${gbp(sp.base)} + hol${sp.otBlocks?` + OT ${gbp(sp.ot)}`:''}${sp.earlyBlocks?` + early ${gbp(sp.earlyPay)}`:''}${sp.travel?` + travel ${gbp(sp.travel)}`:''}${sp.earlyTravel?` + early travel ${gbp(sp.earlyTravel)}`:''})`}
  const peak=dayScheduleSA(d);
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
$('#statusX').addEventListener('click',()=>setStatus(''));
$('#statusUndo').addEventListener('click',()=>{const fn=STATUS_UNDO_FN;if(fn)fn();});
// Cmd/Ctrl+Z anywhere (except while typing in a field) undoes the last crowd edit
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&(e.key==='z'||e.key==='Z')){
    const t=e.target;
    if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
    if(!CROWD_UNDO.length)return;
    e.preventDefault();crowdUndo();
  }
},true);
$('#cdClose').addEventListener('click',()=>{$('#cdayModal').classList.remove('open');cdRecalcApp()});
$('#cdayModal').addEventListener('click',e=>{if(e.target.id==='cdayModal'){$('#cdayModal').classList.remove('open');cdRecalcApp()}});
// ---------- Split crowd into characters (day board SA chip) ----------
// A focused day-level panel: take the day's SA pool and carve it into named
// characters. Unlike the cost calculator's Characters section (which only feeds
// costing via CDAY), this writes through the per-scene SCED layer, so the split
// flows into scene chips, the Crowd tab, Doods, briefs AND costing. The same
// breakdown is applied to every scene that carries the day's full SA crowd, so
// named groups line up across the day and the "counted twice" trap can't bite.
let SPLIT_CTX=null, SPLIT_ROWS=[];
// names that aren't real characters — just the crowd restating itself. These are
// left in the pool (unassigned) rather than seeded as a placeholder character row.
const SPLIT_GENERIC=new Set(['','sa','sas','sa’s','sa\'s','spact','spacts','bg','crowd','extra','extras','background','supporting artist','supporting artists']);
const splitIsGeneric=n=>SPLIT_GENERIC.has(String(n||'').trim().toLowerCase());
// aggregate the day's already-named crowd into edit rows (peak count per group).
// Genuine characters only — generic "SA"/"crowd" style groups stay in the pool.
function daySplitSeed(d){
  const bySA=new Map(), bySP=new Map();
  const bump=(map,key,row)=>{const e=map.get(key);if(e)e.count=Math.max(e.count,row.count);else map.set(key,row);};
  for(const s of realScenes(d)){
    for(const g of s.saChars||[])if(g&&g.name&&!splitIsGeneric(g.name))bump(bySA,'n|'+g.name.toLowerCase(),{name:g.name,count:+g.count||0,tier:'SA',featured:false});
    for(const g of s.featured||[])if(g&&!splitIsGeneric(g.name))bump(bySA,'f|'+(g.name||'').toLowerCase(),{name:g.name||'',count:+g.count||0,tier:'SA',featured:true});
    for(const g of s.spacts||[])if(g&&!splitIsGeneric(g.name))bump(bySP,(g.name||'').toLowerCase(),{name:g.name||'',count:+g.count||0,tier:'SPACT',featured:false});
  }
  return [...bySA.values(),...bySP.values()];
}
// the running-total message: SA-tier rows (featured included) consume the pool;
// SPACTs are a separate tier and don't.
function splitReconcile(pool,assignedSA){
  const remain=pool-assignedSA;
  if(remain>0)return['ok',`${assignedSA} of ${pool} SA given characters · ${remain} stay as unnamed background`];
  if(remain===0)return['ok',`All ${pool} SA assigned to characters`];
  return['warn',`${assignedSA} SA assigned — ${-remain} more than the ${pool} on this day. Applying raises the day to ${assignedSA} SA.`];
}
// the live pool header: the big number is how many SA are still unassigned in the
// pool, counting down as characters are built.
function splitPoolState(pool,assignedSA){
  const remain=pool-assignedSA;
  if(remain>0)return{n:remain,cls:'',label:`in the pool — of ${pool} on this day`,sub:'Build characters below — each one draws from the pool. Anyone left in the pool stays as unnamed background.'};
  if(remain===0)return{n:0,cls:'done',label:`pool empty — all ${pool} in characters`,sub:'Every supporting artist on this day now belongs to a character.'};
  return{n:0,cls:'over',label:`pool empty — ${-remain} over`,sub:`Characters use ${assignedSA} SA, ${-remain} more than the ${pool} on this day. Applying raises the day to ${assignedSA}.`};
}
function openSplitCrowd(dayId){
  const d=COST.dayById[dayId]||(MODEL.days||[]).find(x=>x.id===dayId); if(!d)return;
  SPLIT_CTX=dayId; SPLIT_ROWS=daySplitSeed(d);
  $('#splitTitle').textContent=`Day ${d.num} · Split crowd`;
  $('#splitSub').textContent=`${d.date||''}${MODEL.multiUnit?` · ${d.unit==='2nd'?'2nd Unit':'Main Unit'}`:''}${d.loc?` · ${d.loc}`:''}`;
  renderSplitModal();
  $('#splitModal').classList.add('open');
}
function renderSplitModal(){
  const d=COST.dayById[SPLIT_CTX]; if(!d)return;
  const pool=dayScheduleSA(d);
  const assignedSA=SPLIT_ROWS.filter(r=>r.tier==='SA').reduce((a,r)=>a+(+r.count||0),0);
  const spactTot=SPLIT_ROWS.filter(r=>r.tier==='SPACT').reduce((a,r)=>a+(+r.count||0),0);
  const rec=splitReconcile(pool,assignedSA);
  const rowHTML=(r,i)=>`<div class="reqrow splitrow" data-ri="${i}">
    <input data-sq="count" type="number" min="0" value="${+r.count||0}">
    <select data-sq="tier"><option${r.tier!=='SPACT'?' selected':''}>SA</option><option${r.tier==='SPACT'?' selected':''}>SPACT</option></select>
    <input data-sq="name" value="${esc(r.name||'')}" placeholder="Character / group — e.g. Hotel guests">
    <label class="reqfeat ${r.tier==='SPACT'?'off':''}"><input type="checkbox" data-sq="feat" ${r.featured&&r.tier!=='SPACT'?'checked':''}> Featured</label>
    <button data-sqdel="1" aria-label="Remove">✕</button></div>`;
  const ps=splitPoolState(pool,assignedSA);
  $('#splitBody').innerHTML=`
    <div class="splitpool ${ps.cls}">
      <span class="splitpool-n">${ps.n}</span>
      <span class="splitpool-l"><b>${ps.n===1?'supporting artist':'supporting artists'}</b> ${ps.label}<small>${ps.sub}</small></span>
    </div>
    <div class="reqchars splitchars">${SPLIT_ROWS.length?SPLIT_ROWS.map(rowHTML).join(''):'<div class="splitempty">No characters yet — the whole pool is unassigned. Add one below to start carving it up.</div>'}</div>
    <button class="reqadd" data-sqadd="1">+ Add character</button>
    <div class="reconcile ${rec[0]}" style="margin-top:10px">${rec[1]}</div>
    ${spactTot?`<div class="splitspact">Plus ${spactTot} SPACT — priced separately from the ${pool} SA.</div>`:''}
    <div class="splitapply"><button class="splitapply-btn" data-splitapply="1">Apply to this day</button></div>`;
}
// read the editor DOM back into SPLIT_ROWS (authoritative state)
function syncSplitRows(){
  const rows=[];
  document.querySelectorAll('#splitBody .splitrow').forEach(el=>{
    const count=Math.max(0,+(el.querySelector('[data-sq="count"]')||{}).value||0);
    const tier=((el.querySelector('[data-sq="tier"]')||{}).value)||'SA';
    const name=(el.querySelector('[data-sq="name"]')||{}).value||'';
    const featured=tier!=='SPACT'&&!!(el.querySelector('[data-sq="feat"]')||{}).checked;
    rows.push({name,count,tier:tier==='SPACT'?'SPACT':'SA',featured});
  });
  SPLIT_ROWS=rows;
}
// live-patch the reconcile line while typing (no re-render → keeps input focus)
function updateSplitReconcile(){
  const d=COST.dayById[SPLIT_CTX]; if(!d)return;
  const pool=dayScheduleSA(d);
  const assignedSA=SPLIT_ROWS.filter(r=>r.tier==='SA').reduce((a,r)=>a+(+r.count||0),0);
  const rec=splitReconcile(pool,assignedSA);
  const el=$('#splitBody .reconcile'); if(el){el.className='reconcile '+rec[0];el.style.marginTop='10px';el.textContent=rec[1];}
  const ps=splitPoolState(pool,assignedSA);
  const pn=$('#splitBody .splitpool-n'); if(pn)pn.textContent=ps.n;
  const pl=$('#splitBody .splitpool-l'); if(pl)pl.innerHTML=`<b>${ps.n===1?'supporting artist':'supporting artists'}</b> ${ps.label}<small>${ps.sub}</small>`;
  const pp=$('#splitBody .splitpool'); if(pp)pp.className='splitpool '+ps.cls;
  const spactTot=SPLIT_ROWS.filter(r=>r.tier==='SPACT').reduce((a,r)=>a+(+r.count||0),0);
  const sp=$('#splitBody .splitspact'); if(sp)sp.textContent=spactTot?`Plus ${spactTot} SPACT — priced separately from the ${pool} SA.`:'';
}
// write the split onto every scene that carries the day's full SA crowd
function applySplitCrowd(){
  const d=COST.dayById[SPLIT_CTX]; if(!d)return;
  syncSplitRows();
  const pool=dayScheduleSA(d);
  const rows=SPLIT_ROWS.filter(r=>(+r.count||0)>0)
    .map(r=>({name:(r.name||'').trim(),count:+r.count,tier:r.tier==='SPACT'?'SPACT':'SA',featured:r.tier!=='SPACT'&&!!r.featured}));
  const assignedSA=rows.filter(r=>r.tier==='SA').reduce((a,r)=>a+r.count,0);
  const remain=pool-assignedSA;
  const finalRows=rows.slice();
  if(remain>0)finalRows.push({name:'',count:remain,tier:'SA',featured:false});
  const heads=s=>(+s.sa||0)+(s.saChars||[]).reduce((a,g)=>a+(+g.count||0),0)+(s.featured||[]).reduce((a,g)=>a+(+g.count||0),0);
  let targets=[];
  d.scenes.forEach((s,i)=>{if(!s._ch&&heads(s)===pool)targets.push(i)});
  if(!targets.length)d.scenes.forEach((s,i)=>{if(!s._ch&&heads(s)>0)targets.push(i)});
  if(!targets.length){const h=ensureCrowdScene(d);if(h)targets.push(d.scenes.indexOf(h))}
  const _snap=JSON.stringify(SCED);
  for(const i of targets)writeSceneCrowd(d,i,finalRows.map(r=>Object.assign({},r)));
  registerCrowdUndo(_snap,`crowd split on D${d.num}`);
  saveSced();
  $('#splitModal').classList.remove('open');
  refreshAll();
  const named=rows.filter(r=>r.name).length;
  setStatus(`D${d.num}: split ${pool} SA into ${named} character${named===1?'':'s'} across ${targets.length} scene${targets.length===1?'':'s'}. Change any scene on its own crowd editor if they’re really different people.`,{undo:crowdUndo});
}
$('#splitClose').addEventListener('click',()=>$('#splitModal').classList.remove('open'));
$('#splitModal').addEventListener('click',e=>{if(e.target.id==='splitModal')$('#splitModal').classList.remove('open')});
$('#splitBody').addEventListener('input',e=>{if(e.target.closest('[data-sq]')){syncSplitRows();updateSplitReconcile();}});
$('#splitBody').addEventListener('change',e=>{if(e.target.closest('[data-sq]')){syncSplitRows();renderSplitModal();}});
$('#splitBody').addEventListener('click',e=>{
  if(e.target.closest('[data-sqadd]')){syncSplitRows();SPLIT_ROWS.push({name:'',count:0,tier:'SA',featured:false});renderSplitModal();return}
  const del=e.target.closest('[data-sqdel]');
  if(del){syncSplitRows();SPLIT_ROWS.splice(+del.closest('.splitrow').dataset.ri,1);renderSplitModal();return}
  if(e.target.closest('[data-splitapply]')){applySplitCrowd();return}
});
$('#cdReset').addEventListener('click',()=>{
  const d=COST.dayById[CD_CTX];
  // "Reset to schedule" discards the user's edits and returns the day to its
  // scheduled state — so the fresh config stays SEEDED (persist, don't touch),
  // otherwise resetting would itself count as an edit and keep the day costing
  // per-head.
  delete CDAY[cdayKey(d)];
  CDAY[cdayKey(d)]=seedCday(d);persistCDAY();
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
  <div class="note" style="border-top:1px solid var(--line)">Peak requirement per day × (rate + ${(R.hol*100).toFixed(2)}% holiday). Chits, overtime, travel and supplements live in the full Crowd engine.</div>`;
  $('#costModal').classList.add('open');
}
function openCostModal(dayId){
  if(APPMODE==='crowd'){openCrowdDay(dayId);return}
  const d=COST.dayById[dayId], pd=COST.perDay[dayId];
  if(!d||!pd)return;
  $('#cmTitle').textContent=`Day ${d.num} stunt cost`;
  $('#cmSub').textContent=`${d.date}${MODEL.multiUnit?` · ${d.unit==='2nd'?'2nd Unit':'Main Unit'}`:''} · ${d.loc}`;
  const rows=[...pd.people].sort(stuntOrder);
  const subRows=p=>{
    const n=p.count, r=p.rate/n, u=p.usage/n, h=p.hol/n, i=p.ins/n, t=p.cost/n, nt=(p.night||0)/n;
    const ot=(p.ot||0)/n, ey=(p.early||0)/n;
    const fm=`${gbp(r)} rate + ${gbp(u)} usage (${(COST.R.usePct*100).toFixed(1)}%) + ${gbp(h)} holiday${i?` + ${gbp(i)} insurance`:''}${nt?` + ${gbp(nt)} night uplift`:''}${ot?` + ${gbp(ot)} OT`:''}${ey?` + ${gbp(ey)} early call`:''}`;
    if(n===1)return `<tr class="sub hidden"><td colspan="6"><span class="fm">${fm}</span></td><td class="num">${gbp(t)}</td></tr>`;
    return Array.from({length:n},(_,k)=>`<tr class="sub hidden">
      <td>${esc(p.code.replace(/s$/,''))} ${k+1} <span class="fm">— ${fm}</span></td>
      <td class="num">1</td><td class="num">${gbp(r)}</td><td class="num">${gbp(u)}</td>
      <td class="num">${gbp(h)}</td><td class="num">${i?gbp(i):'—'}</td><td class="num">${gbp(t)}</td></tr>`).join('');
  };
  $('#cmBody').innerHTML=`${stuntHoursCardHTML(d)}<table><thead><tr><th>Who</th><th class="num">Heads</th><th class="num">Day rate</th><th class="num">Usage</th><th class="num">Holiday</th><th class="num">Insurance</th><th class="num">Total</th></tr></thead><tbody>
  ${rows.map(p=>`<tr class="exp">
    <td class="rowlabel">${p.type==='stuntExtra'?esc(p.code):`<span style="font-family:var(--mono);font-size:11px">${esc(p.code)}</span> ${esc(personName(p.code).replace(/ - Stunt Dbl\.?$/i,''))}`}</td>
    <td class="num">${p.count}</td>
    <td class="num">${gbp(p.rate)}</td><td class="num">${gbp(p.usage)}</td>
    <td class="num">${p.hol?gbp(p.hol):'—'}</td><td class="num">${p.ins?gbp(p.ins):'—'}</td>
    <td class="num money">${gbp(p.cost)}</td></tr>${subRows(p)}`).join('')}
  ${(pd.adjItems||[]).map((x,i)=>`<tr class="adjrow"><td class="rowlabel">${icon('zap')} ${esc(x.label)}</td><td class="num">—</td><td class="num" colspan="3">Stunt adjustment</td><td class="num"><button class="dchip" data-deladj="${i}" data-adjday="${esc(d.id)}">✕ remove</button></td><td class="num money">${gbp(+x.amt||0)}</td></tr>`).join('')}
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
  ${stuntTravelFormHTML(d)}
  <div class="note" style="border-top:1px solid var(--line)">Stunt adjustments cover extra fees for high-risk action — fire burns, high falls, ratchet pulls. They’re added to this day’s total and carried through the whole breakdown.</div>`;
  $('#costModal').classList.add('open');
}
// Stunt travel: the production's stunt rate card sets the MODE (nothing /
// mileage @ £-per-mile / train fare) — Cat A/B never applies to stunts. The
// per-head miles or fare is typed here per day, and lands in the day's total
// as a normal stunt adjustment (marked `travel` so re-editing replaces it).
function stuntTravelFormHTML(d){
  const s=SOURCES[ACTIVE];
  const rv=resolveRateVals(s&&(s.prod||s.title));
  const mode=rv.rTravelMode||'none';
  if(mode==='none')return '';
  const mileRate=+rv.rMileRate||0.55;
  const pd=COST.perDay[d.id];
  const heads=pd?pd.people.reduce((a,p)=>a+p.count,0):0;
  const cur=(ADJ[adjKey(d)]||[]).find(x=>x.travel);
  const val=cur&&cur.travel?cur.travel.val:'';
  return `<div class="adjform" style="border-top:1px dashed var(--line)">
    <span style="font-size:11.5px;color:var(--sub);white-space:nowrap;display:inline-flex;align-items:center;gap:5px">${icon('car')}Travel — ${mode==='mileage'?'mileage @ '+gbp(mileRate)+'/mi':'train fare'} · ${heads} head${heads===1?'':'s'}</span>
    <input id="travVal" type="number" step="0.5" min="0" placeholder="${mode==='mileage'?'miles per head (round trip)':'fare per head £'}" value="${esc(val)}">
    <button class="dz-btn" id="travSet" data-adjday="${esc(d.id)}" data-travmode="${mode}" data-travrate="${mileRate}" data-travheads="${heads}">${cur?'Update travel':'＋ Set travel'}</button>
  </div>`;
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
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#costModal').classList.remove('open');$('#raOverlay').classList.remove('open');$('#calModal').classList.remove('open');$('#splitModal').classList.remove('open');if($('#cbSetupModal').classList.contains('open')){cbSetupOpen=false;$('#cbSetupModal').classList.remove('open')}if($('#cdayModal').classList.contains('open')){$('#cdayModal').classList.remove('open');cdRecalcApp()}}});

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
  <div class="tscroll"><table><thead><tr><th>Day</th>${MODEL.multiUnit?'<th>Unit</th>':''}<th>Date</th><th>Location</th><th class="num">SA</th><th class="num">Featured</th><th class="num">Day rates</th><th class="num">Holiday</th><th class="num">Overtime</th><th class="num">Early call</th><th class="num">Fees</th><th class="num">Total</th></tr></thead><tbody>
  ${saRows.map(d=>{const c=CROWD.perDay[d.id];const k=c.saComp;
    const whoTip=c.edited&&c.chars?`Applied per head to: ${esc(c.chars.slice(0,90))}${c.chars.length>90?'…':''}`:'';
    const otTip=k.ot?`${k.otDayB?k.otDayB+'×30m day (£'+gOTd()+')':''}${k.otDayB&&k.otNightB?' + ':''}${k.otNightB?k.otNightB+'×30m night (£'+gOTn()+')':''} incl. holiday${whoTip?' — '+whoTip:''}`:'';
    const eaTip=k.early?`${k.earlyBlocks?k.earlyBlocks+'×30m before 07:00 (£'+gOTn()+' incl. holiday)':''}${k.earlyTravel?(k.earlyBlocks?' + ':'')+'early travel':''}${whoTip?' — '+whoTip:''}`:'';
    const featTip=c.featPD?('Featured: '+esc(Object.entries(c.feats).map(([n,x])=>n+(x>1?' ×'+x:'')).join(', ').slice(0,90))):'';
    // supplementary fees set on the Crowd Breakdown or in the day calculator —
    // already inside this day's total, shown so the row adds up on the page
    const fees=(+c.supSA||0)+(+c.supFeat||0);
    const feeTip=fees&&c.supBy?('Supplementary fees: '+esc(Object.entries(c.supBy).map(([n,a])=>n+' '+gbp(a)).join(', ').slice(0,110))):'';
    const R2=crowdRates();
    const featBase=c.featPD*R2.feat;
    const rates=k.rates+featBase, hol=k.hol+featBase*R2.hol;
    // k.ot/k.early are exact sums across the day's SA rows (each may carry its
    // own call/wrap override); Featured heads share the SA rows' average
    // per-head OT/early as an approximation, same as before this existed.
    const ot=(k.ot||0)+(k.otPer||0)*c.featPD;
    const early=(k.early||0)+(k.earlyPer||0)*c.featPD;
    return `<tr class="cdopen" data-cdopen="${esc(d.id)}"><td class="mono">${c.edited?`<span style="color:var(--note)" data-tip="Edited in the day calculator">${icon('pencil')}</span> `:''}<button class="dchip ${d.unit==='2nd'?'u2':''}" data-goto="${esc(d.id)}">D${d.num}</button></td>${MODEL.multiUnit?`<td>${d.unit==='2nd'?'2nd':'Main'}</td>`:''}<td>${esc(chipDate(d))}</td><td><a class="loclink" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.loc)}" target="_blank" rel="noopener" data-tip="Open in Google Maps">${esc(d.loc)}</a> <span class="bandchip ${c.travel&&c.travel.band==='B'?'b':''}" data-tip="Travel ${c.travel?('Cat '+c.travel.band+' · '+gbp(c.travel.amt)+'/head'+(c.travel.known===false?' · location not recognised — check':' · auto from location')):'—'}">${c.travel?c.travel.band:'—'}</span></td><td class="num"><b>${c.sa||'—'}</b></td><td class="num ${c.featPD?'':'dim'}" ${featTip?`data-tip="${featTip}" tabindex="0"`:''}>${c.featPD||'—'}</td><td class="num">${gbp(Math.round(rates))}</td><td class="num">${gbp(Math.round(hol))}</td><td class="num ${ot?'':'dim'}" ${otTip?`data-tip="${otTip}" tabindex="0"`:''}>${ot?gbp(Math.round(ot)):'—'}</td><td class="num ${early?'':'dim'}" ${eaTip?`data-tip="${eaTip}" tabindex="0"`:''}>${early?gbp(Math.round(early)):'—'}</td><td class="num ${fees?'':'dim'}" ${feeTip?`data-tip="${feeTip}" tabindex="0"`:''}>${fees?gbp(Math.round(fees)):'—'}</td><td class="num money">${gbp(Math.round(c.saCost+c.featCost))}</td></tr>`}).join('')}
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
    ${tRows.map(d=>{const t=CROWD.perDay[d.id].travel;const heads=Math.round(t.total/t.amt);return `<tr class="cdopen" data-cdopen="${esc(d.id)}"><td class="mono">D${d.num}</td><td>${mapsLink(d.loc)}</td><td><span class="bandchip ${t.band==='B'?'b':''}">${t.band}</span> ${t.known===false?'<span style="color:var(--note);font-size:10px">check</span>':''}</td><td class="num">${heads}</td><td class="num">${gbp(t.amt)}</td><td class="num money">${gbp(Math.round(t.total))}</td></tr>`}).join('')}
    <tr class="total"><td>Total</td><td colspan="4"></td><td class="num money">${gbp(Math.round(tSum))}</td></tr>
    </tbody></table></div>
    <div class="note">Travel band is read automatically from each day’s location — Cat A (TfL Zones 1–3) ${gbp(gTA())}/head, Cat B (major studios / beyond Zone 3) ${gbp(gTB())}/head. Unrecognised locations default to Cat A and are flagged — open the day calculator to override.</div></div>`;
  }
  html+=`<div class="tablecard"><h3>Cost by production week<span class="cnt">${CROWD.weeks.length} weeks</span><span class="sum costable">${gbp(Math.round(CROWD.grand))}</span></h3>
  <div class="tscroll"><table><thead><tr><th>Week</th><th class="num">Crowd days</th><th class="num">SA-days</th><th class="num">Featured-days</th><th class="num">Spact-days</th><th class="num">Week total</th></tr></thead><tbody>
  ${CROWD.weeks.map(w=>`<tr><td class="mono">${esc(fmtWeek(w.key))}</td><td class="num">${w.days}</td><td class="num">${w.saDays.toLocaleString()}</td><td class="num">${w.featDays}</td><td class="num">${w.spactDays}</td><td class="num money">${gbp(Math.round(w.cost))}</td></tr>`).join('')}
  <tr class="total"><td>Total</td><td class="num">${CROWD.weeks.reduce((a,w)=>a+w.days,0)}</td><td class="num">${CROWD.weeks.reduce((a,w)=>a+w.saDays,0).toLocaleString()}</td><td class="num">${CROWD.weeks.reduce((a,w)=>a+w.featDays,0)}</td><td class="num">${CROWD.weeks.reduce((a,w)=>a+w.spactDays,0)}</td><td class="num money">${gbp(Math.round(CROWD.grand))}</td></tr>
  </tbody></table></div>
  <div class="note">Daily peak counts × (rate + ${(R.hol*100).toFixed(2)}% holiday), plus any supplementary fees set on the Crowd Breakdown. SA rate is the PACT/FAA 2026 BDR; Featured/SPACT rates are editable in the crowd rate card. Full chit-level costing (unique people, continuity) is full Crowd-engine territory.</div></div>`;
  $('#viewStunts').innerHTML=html;
}
// ============================================================================
// Crowd Breakdown DOCUMENT — the deliverable, not the cost page.
// The classic landscape grid an AD circulates: banded by week / shoot day /
// unit, one block per scene with its requirement lines beneath, MAIN UNIT
// TOTAL and STUNTS/OTHER TOTAL footers. Built entirely from projectCrowdDoc()
// so the printed page, the .xlsx and the .csv are the same document.
// ============================================================================
// `costs` is OFF by default and stays off until the user asks for it — the
// people this document is normally sent to (ADs, costume, make-up, locations)
// must never receive rate information.
// `order` is the reorderable column-segment order set in the Columns builder;
// `notes` toggles the NOTES/CONTINUITY column. Both are validated by
// cbColumnLayout, so an old or partial saved value can never break the grid.
// `font` and `accent` are the Appearance settings from the setup step: the
// document face (must be a loaded/installed family so the screen, the PDF and
// the Excel export all agree) and the header-band colour. `generated` records
// whether this production has ever pressed "Generate breakdown" — until it has,
// the crowd page opens on the setup step rather than the table.
const CB_FONTS=[
  {id:'Montserrat',label:'Montserrat',stack:"'Montserrat',Arial,sans-serif"},
  {id:'Poppins',label:'Poppins',stack:"'Poppins',Arial,sans-serif"},
  {id:'Arial',label:'Arial',stack:"Arial,Helvetica,sans-serif"},
  {id:'Georgia',label:'Georgia (serif)',stack:"Georgia,'Times New Roman',serif"},
];
const CB_ACCENTS=['#e8622a','#1c4fa1','#0f9d58','#7a1fa2','#b58900','#c0392b','#0d0d0d'];
function cbFontStack(id){return (CB_FONTS.find(f=>f.id===id)||CB_FONTS[0]).stack}
// White text reads on a dark accent, black on a light one — pick per luminance
// so the header band is always legible whatever colour is chosen.
function cbAccentInk(hex){
  const h=String(hex||'').replace('#','');
  if(h.length!==6)return '#fff';
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  return (0.299*r+0.587*g+0.114*b)>150?'#111':'#fff';
}
const CBD={date:'',sched:'',hideEmpty:false,other:true,weeks:true,costs:false,notes:true,mergeCrowd:false,order:CB_SEG_ORDER.slice(),font:'Montserrat',accent:'#e8622a',generated:false};
try{Object.assign(CBD,JSON.parse(store.get('crowdos-cbdoc')||'{}'))}catch(e){}
if(!Array.isArray(CBD.order)||!CBD.order.length)CBD.order=CB_SEG_ORDER.slice();
if(!CBD.font||!CB_FONTS.some(f=>f.id===CBD.font))CBD.font='Montserrat';
if(typeof CBD.accent!=='string')CBD.accent='#e8622a';
// Spreadsheet-style manual highlights: cellKey -> colour hex. Kept with the
// document so annotations survive edits, re-renders and reloads.
if(!CBD.hl||typeof CBD.hl!=='object'||Array.isArray(CBD.hl))CBD.hl={};
function saveCbd(){store.set('crowdos-cbdoc',JSON.stringify(CBD))}
// The highlighter palette (soft fills that read clearly over the banding). The
// first is the lavender an AD reaches for first; the eraser lifts a highlight.
const CB_HL_COLORS=[
  {id:'#e4dbf6',label:'Lavender'},
  {id:'#fdf0a6',label:'Yellow'},
  {id:'#c9e7c4',label:'Green'},
  {id:'#cfe2fb',label:'Blue'},
  {id:'#f9d1e0',label:'Pink'},
  {id:'#ffd8b0',label:'Orange'}
];
// Highlighter UI state (screen-only): whether the pen is on, its colour, and the
// in-progress rectangle drag (start cell + what this drag has changed, so the
// selection can grow AND shrink cleanly as the pointer moves).
let CB_HLMODE=false, CB_HLPEN=CB_HL_COLORS[0].id, CB_HLDRAG=false, CB_HLSTART=null;
const CB_HLDRAGMAP=new Map();
// "20/6/26" — the short date form these documents are titled with
function cbdShort(d){if(!d)return'';const p=n=>String(n).padStart(2,'0');return d.getDate()+'/'+(d.getMonth()+1)+'/'+p(d.getFullYear()%100)}
function cbdDefaults(){
  const s=SOURCES[ACTIVE]||{};
  if(!CBD.date)CBD.date=cbdShort(new Date());
  if(!CBD.sched&&s.schedDate)CBD.sched=s.schedDate;
}
// Money on this document is READ from the crowd cost engine, never worked out
// here: the per-head figure is the one that day was actually priced with, and
// the day total is the engine's own day cost (pooled heads, holiday, overtime,
// early calls and travel). So the breakdown and the cost page can never
// disagree about what a day costs.
function cbdPerHead(dayId,tier){
  const e=CROWD&&CROWD.perDay?CROWD.perDay[dayId]:null;
  if(!e||!e.perHeadBy)return 0;
  return e.perHeadBy[tier==='SPACT'?'SPACT':tier==='Featured'?'Featured':'SA']||0;
}
function cbdDayCost(dayId){
  const e=CROWD&&CROWD.perDay?CROWD.perDay[dayId]:null;
  return e?e.cost:0;
}
function cbdDoc(){
  cbdDefaults();
  return projectCrowdDoc(MODEL,{
    production:exportProdTitle(),
    breakdownDate:CBD.date,
    scheduleDate:CBD.sched,
    hideEmpty:CBD.hideEmpty,
    includeOther:CBD.other,
    weeks:CBD.weeks,
    costs:!!CBD.costs,
    notes:CBD.notes!==false,
    mergeCrowd:!!CBD.mergeCrowd,
    order:CBD.order,
    perHead:cbdPerHead,
    dayCost:cbdDayCost,
  });
}
// ---- editing ----
// The crowd column is edited in place and written straight back through SCED —
// the same store the day board's inline editor uses. So a change made here
// moves the day board, the cost breakdown, the DOODs, the briefs and the
// exports at once; there is no second copy of the truth.
const CBD_TIERS=[['SA','SA'],['Featured','FEAT'],['SPACT','SPACT']];
function cbdAddr(sc,i){return `${sc.dayId}|${sc.sceneIdx}|${i}`}
// current crowd rows for a scene, in the shape SCED stores
function cbdRowsFor(d,idx){return sceneCrowdRows(d.scenes[idx]||{})}
function cbdDayById(id){return (MODEL.days||[]).find(d=>d.id===id)}
// commit an edited row list and let the whole app follow
function cbdWrite(dayId,sceneIdx,rows,refocus){
  const d=cbdDayById(dayId);if(!d)return;
  const sc=d.scenes[sceneIdx];if(!sc)return;
  // snapshot the names before the edit: one name out + one in is a rename, and
  // any casting brief on the old name should follow it (same rule the day
  // board's editor applies, so the two areas stay in step both ways)
  const oldNames=new Set();
  for(const f of [...(sc.saChars||[]),...(sc.featured||[]),...(sc.spacts||[])])if(f.name)oldNames.add(f.name.toLowerCase());

  writeSceneCrowd(d,sceneIdx,rows);
  // Removing the last line must STICK. writeSceneCrowd drops an emptied entry,
  // and applySced only ever adds — so without an explicit empty record the
  // scene silently falls back to its parsed baseline and the deleted line
  // reappears on the next recompute.
  const key=scedKey(sceneNK(d,sc,sceneIdx));
  if(!rows.some(r=>(+r.count||0)>0))SCED[key]=Object.assign({},SCED[key]||{},{chars:[]});
  saveSced();
  applySced(MODEL);
  // refreshAll re-renders this view too (it is by definition visible while you
  // are typing in it), so every other page moves in the same tick
  refreshAll();
  cbdFollowRename(oldNames,rows);
  if(refocus)cbdRefocus(refocus.addr,refocus.field);
  setStatus('Crowd breakdown updated — day board, costs and DOODs follow.');
}
// a clean rename carries any brief on the old name across, but only once the
// old name survives nowhere else in the schedule
function cbdFollowRename(oldNames,rows){
  const newNames=new Set(rows.filter(r=>r.name&&(+r.count||0)>0).map(r=>r.name.toLowerCase()));
  const removed=[...oldNames].filter(x=>!newNames.has(x));
  const added=[...newNames].filter(x=>!oldNames.has(x));
  if(removed.length!==1||added.length!==1)return;
  const gone=removed[0];
  const {chars}=crowdCharacters();
  if(chars.some(c=>c.name.toLowerCase()===gone))return;
  const to=rows.find(r=>(r.name||'').toLowerCase()===added[0]).name;
  let moved=0;
  for(const x of briefsForNs())if(x.b.character.toLowerCase()===gone){x.b.character=to;x.b.updatedAt=new Date().toISOString();moved++}
  if(moved){saveBriefs();if(!$('#viewBriefs').classList.contains('hidden'))renderBriefs();}
}
// keep the caret where the AD left it across the re-render
function cbdRefocus(addr,field){
  const el=document.querySelector(`[data-cbaddr="${(window.CSS&&CSS.escape)?CSS.escape(addr):addr}"][data-cbf="${field}"]`);
  if(!el)return;
  el.focus();
  const r=document.createRange();r.selectNodeContents(el);r.collapse(false);
  const sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);
}
// Arm the trailing "add" row for typing: swap the button out for the live count
// field and put the caret in it. Kept separate from the click handler because
// both the button and a bare click on the row use it.
function cbdArmAdd(addr){
  const sel=(window.CSS&&CSS.escape)?CSS.escape(addr):addr;
  const no=document.querySelector(`#viewCbdoc [data-cbaddr="${sel}"][data-cbf="no"]`);
  if(!no)return;
  const row=no.closest('tr');
  if(row)row.classList.add('cbarmed');
  no.focus();
  const r=document.createRange();r.selectNodeContents(no);r.collapse(true);
  const s=getSelection();s.removeAllRanges();s.addRange(r);
}
// Leaving an armed row without typing anything puts the button back, so the row
// never sits in a half-open state the AD has to guess about.
document.addEventListener('focusout',e=>{
  const row=e.target.closest&&e.target.closest('tr.cbarmed');
  if(!row)return;
  setTimeout(()=>{
    if(row.contains(document.activeElement))return;
    const typed=[...row.querySelectorAll('.cbedit')].some(n=>(n.textContent||'').trim());
    if(!typed)row.classList.remove('cbarmed');
  },0);
});
// A carried line PRINTS as "SA's (FROM ABOVE)" — the group's own name plus a
// label the document wrote onto it. The two are separated here so the name can
// be typed (it is the group's) while the label stays the document's (it is
// recomputed from the day's bookings on every render). Must stay in step with
// the label markDayBookings writes in lib/engine/breakdown-doc.ts.
const CB_CARRIED_RE=/\s*\((?:\d+\s+)?from\s+(?:above|below|sc[^)]*)\)\s*$/i;
function cbCarriedTag(c){const m=CB_CARRIED_RE.exec(String((c&&c.name)||''));return m?m[0].trim():''}
function cbNameBase(c){return String((c&&c.name)||'').replace(CB_CARRIED_RE,'')}
function cbdEditCell(l,sc,i,field,cls,isAdd){
  // A whole-scene pointer ("AS SCENE 12") is not a group of its own — there is
  // no source row behind it to type into, so it stays read-only.
  if(l&&l.pointer){
    const value=field==='note'?(l.notes||''):field==='no'?(l.no??''):l.name;
    return `<td class="${field==='no'?'cbno':'cbnote'} ${cls}">${esc(value)}</td>`;
  }
  const v=field==='no'?(l&&l.no!=null?l.no:''):field==='name'?(l?l.name:''):(l?l.notes||'':'');
  const base=field==='no'?'cbno':field==='name'?'cbname':'cbnote';
  // On the trailing add row the "+ Add crowd" button already says what this is,
  // and a tooltip there just covers the row underneath while you are typing.
  // A carried line still holds its OWN figure — what this scene needs is not
  // the same question as who the day is booking — so it is typed here like any
  // other, it just doesn't move the day total.
  const noTip=isAdd
    ? ''
    : (l&&l.fromAbove
      ? 'How many of these people this scene needs. They are already booked earlier in the day, so this does not change the day total.'
      : 'Number of people — set to 0 to remove the line');
  const tip=field==='no'?noTip:field==='name'?'Character or group name':'Notes / continuity';
  return `<td class="${base} ${cls} cbedit" contenteditable="true" spellcheck="false"
    data-cbaddr="${esc(cbdAddr(sc,i))}" data-cbf="${field}"${tip?` data-tip="${tip}"`:''}>${esc(v)}</td>`;
}
// One editable NO. cell for a crowd line.
function cbCrowdNoCell(c,sc,i,cls,isAdd){return cbdEditCell(c,sc,i,'no',cls,isAdd)}
// The "add another crowd line" control that sits on the trailing blank row.
// It is a REAL labelled button, not a bare "+" glyph: a bare + in a number
// column reads as data (and used to print as data), whereas a labelled button
// reads as furniture — which is exactly what it is. It carries `noprint` so it
// can never reach the printed page or the PDF.
function cbAddBtnHTML(addr){
  return `<button type="button" class="cbaddbtn noprint" data-cbadd="${addr}" data-tip="Add a crowd line to this scene">`
    +`<span class="cbaddplus" aria-hidden="true">+</span><span class="cbaddlabel">Add crowd</span></button>`;
}
// The "same people as another scene" toggle.
//
// It has one job and it must say so plainly: a ticked line is people who are
// ALREADY counted in this day's total, so it books nobody and is charged for
// nobody. It therefore has to show the line's REAL state — including when the
// breakdown worked it out itself, because the same group is called in more than
// one scene of the day. An unticked box on a line the document is visibly
// treating as carried is the worst of both worlds: it looks like a control that
// does nothing.
//
// A line the document worked out for itself is shown ticked and locked, with a
// note saying where those people are booked and how to say otherwise — giving
// a group its own name is how you tell the breakdown these are different
// people, exactly as it works everywhere else in the app.
function cbAboveToggle(c,addr){
  if(!c||c.slot<0)return '';
  const auto=!!c.fromAbove&&!c.explicitFromAbove;
  const tip=auto
    ? 'These are the same people already counted earlier today, so they are only booked once. Different people? Give this group its own name.'
    : 'Tick when this line is the same people as another scene — they stay on the document but are only booked and charged once.';
  return `<label class="cbabove${auto?' auto':''}" data-tip="${esc(tip)}">`
    +`<input type="checkbox" data-cbabove="${addr}" ${c.fromAbove?'checked':''}${auto?' disabled':''}> FROM ABOVE</label>`;
}
// The CROWD CHARACTER cell — tier chip, editable name (with placeholder when
// blank) and the delete affordance.
function cbCrowdNameCell(c,sc,i,cls,ph,isAdd){
  const addr=esc(cbdAddr(sc,i));
  const tier=c?String(c.tier||'SA'):'SA';
  const label=(CBD_TIERS.find(t=>t[0]===tier)||CBD_TIERS[0])[1];
  const live=!c||!c.pointer;   // a whole-scene pointer has no source row to edit
  const chip=c&&live
    ? `<button class="cbtier t-${tier.toLowerCase()}" data-cbtier="${addr}" data-tip="Click to change tier — SA, Featured or Spact">${esc(label)}</button>`
    : '';
  const above=cbAboveToggle(c,addr);
  // A carried line's PRINTED name is written by the document ("SA (FROM
  // ABOVE)"), but the name you type is the group's own — the carried label is
  // reapplied on every render. That is exactly how you tell the breakdown
  // "these are different people": give the group its own name, and it stops
  // being carried. Typing against the printed label instead would fork the
  // group away from the one it points at, so the cell shows the base name.
  const carried=!!(c&&c.fromAbove);
  const nameHtml=c&&c.pointer
    ? `<span class="cbnametext">${esc(c.name)}</span>`
    : `<span class="cbedit cbnametext${ph?' cbph':''}" contenteditable="true" spellcheck="false" data-cbaddr="${addr}" data-cbf="name"${ph?` data-ph="${esc(ph)}"`:''} data-tip="${carried?'Group name. Give this line its own name and it becomes a separate booking rather than the same people as above.':'Character or group name — leave blank for plain background'}">${esc(c?cbNameBase(c):'')}</span>`
    +(carried&&cbCarriedTag(c)?`<span class="cbcarried">${esc(cbCarriedTag(c))}</span>`:'');
  return `<td class="cbname ${cls} cbnamecell">${chip}${isAdd?cbAddBtnHTML(addr):''}${nameHtml}${above}${c&&live?`<button class="cbdel" data-cbdel="${addr}" data-tip="Remove this line" aria-label="Remove line">✕</button>`:''}</td>`;
}
// The NOTES/CONTINUITY cell for a crowd line.
function cbCrowdNoteCell(c,sc,i,cls){return cbdEditCell(c,sc,i,'note',cls)}
// The merged CROWD CHARACTER cell: count then name in one column. The count and
// name stay separately editable (same data-cbaddr/data-cbf the split cells use,
// so the edit handler treats them identically), just laid out inline.
function cbCrowdComboCell(c,sc,i,cls,ph,isAdd){
  const addr=esc(cbdAddr(sc,i));
  // A whole-scene pointer has no source row to type into.
  if(c&&c.pointer)return `<td class="cbname ${cls} cbcombo">${esc((c.no!=null?c.no+' ':'')+c.name)}</td>`;
  // A carried line keeps the figure this scene needs and is labelled as the
  // same people ("48 SA (FROM ABOVE)") — that label is what stops the day
  // counting them twice. Both the figure and the group's own name stay
  // typeable; only the label itself belongs to the document.
  if(c&&c.fromAbove)return `<td class="cbname ${cls} cbcombo"><span class="cbedit cbcombono" contenteditable="true" spellcheck="false" data-cbaddr="${addr}" data-cbf="no" data-tip="How many of these people this scene needs. They are already booked earlier in the day, so this does not change the day total.">${esc(c.no!=null?c.no:'')}</span><span class="cbedit cbnametext" contenteditable="true" spellcheck="false" data-cbaddr="${addr}" data-cbf="name" data-tip="Group name. Give this line its own name and it becomes a separate booking rather than the same people as above.">${esc(cbNameBase(c))}</span>${cbCarriedTag(c)?`<span class="cbcarried">${esc(cbCarriedTag(c))}</span>`:''}${cbAboveToggle(c,addr)}<button class="cbdel" data-cbdel="${addr}" data-tip="Remove this line" aria-label="Remove line">✕</button></td>`;
  const tier=c?String(c.tier||'SA'):'SA';
  const label=(CBD_TIERS.find(t=>t[0]===tier)||CBD_TIERS[0])[1];
  const chip=c&&!c.fromAbove
    ? `<button class="cbtier t-${tier.toLowerCase()}" data-cbtier="${addr}" data-tip="Click to change tier — SA, Featured or Spact">${esc(label)}</button>`
    : '';
  const no=c&&c.no!=null?c.no:'';
  const noTip=isAdd?'':'Number of people — set to 0 to remove the line';
  return `<td class="cbname ${cls} cbnamecell cbcombo">${chip}${isAdd?cbAddBtnHTML(addr):''}<span class="cbedit cbcombono" contenteditable="true" spellcheck="false" data-cbaddr="${addr}" data-cbf="no"${noTip?` data-tip="${noTip}"`:''}>${esc(no)}</span><span class="cbedit cbnametext${ph?' cbph':''}" contenteditable="true" spellcheck="false" data-cbaddr="${addr}" data-cbf="name"${ph?` data-ph="${esc(ph)}"`:''} data-tip="Character or group name — leave blank for plain background">${esc(c?c.name:'')}</span>${c&&!c.fromAbove?`<button class="cbdel" data-cbdel="${addr}" data-tip="Remove this line" aria-label="Remove line">✕</button>`:''}</td>`;
}
// The two STUNTS/OTHER cells. These start from the schedule but are typed in
// place like everything else on this document — an AD who is working down the
// grid should not have to leave it to correct a stunt count. Edits are written
// back through SCED, the same store the crowd column uses, so the day board and
// the stunt page move with them.
//
// The write-back address is `dayId|sceneIdx|src|slot`: the STUNTS/OTHER column
// prints three separate source lists (stunt performers, children, action
// vehicles) as one merged run, so the row's position in the printed run is not
// its position in its own list.
function cbOtherAddr(sc,o){return `${sc.dayId}|${sc.sceneIdx}|${o.src||'extras'}|${o.slot}`}
// The blank line under the printed run: typing there appends a stunt line.
function cbOtherAddAddr(sc,slot){return `${sc.dayId}|${sc.sceneIdx}|extras|${slot}`}
function cbOtherNoCell(o,sc,addSlot){
  if(!o)return addSlot==null?`<td class="cbno"></td>`
    :`<td class="cbno cbedit" contenteditable="true" spellcheck="false" data-cbother="${esc(cbOtherAddAddr(sc,addSlot))}" data-cbf="no"></td>`;
  const c=['cbrow-'+String(o.tier||'SA').toLowerCase(),o.fromAbove?'fromabove':'',o.tbc?'tbc':''].filter(Boolean).join(' ');
  if(o.slot==null||o.slot<0)return `<td class="cbno ${c}">${esc(o.no||'')}</td>`;
  return `<td class="cbno ${c} cbedit" contenteditable="true" spellcheck="false" data-cbother="${esc(cbOtherAddr(sc,o))}" data-cbf="no" data-tip="Number — set to 0 to remove the line">${esc(o.no||'')}</td>`;
}
function cbOtherNameCell(o,sc,addSlot){
  if(!o)return addSlot==null?`<td class="cbname"></td>`
    :`<td class="cbname cbedit" contenteditable="true" spellcheck="false" data-cbother="${esc(cbOtherAddAddr(sc,addSlot))}" data-cbf="name" data-ph="Add stunt / other"></td>`;
  const c=['cbrow-'+String(o.tier||'SA').toLowerCase(),o.fromAbove?'fromabove':'',o.tbc?'tbc':''].filter(Boolean).join(' ');
  if(o.slot==null||o.slot<0)return `<td class="cbname ${c}">${esc(o.name)}</td>`;
  // as in the crowd column, the "(FROM ABOVE)" label belongs to the document —
  // the typed text is the line's own name
  return `<td class="cbname ${c}"><span class="cbedit" contenteditable="true" spellcheck="false" data-cbother="${esc(cbOtherAddr(sc,o))}" data-cbf="name" data-tip="What this line is — stunts, children, action vehicles">${esc(cbNameBase(o))}</span>${cbCarriedTag(o)?`<span class="cbcarried">${esc(cbCarriedTag(o))}</span>`:''}</td>`;
}
// The two money cells on a crowd line: the supplementary fee (a picker off the
// PACT/FAA list) and what the line costs at this day's rate. A carried line is
// the same people as an earlier scene, so it is never charged and never gets a
// fee of its own.
function cbFeeCell(l,sc,i){
  if(!l||l.fromAbove)return `<td class="cbfee"></td>`;
  // Plain unnamed background has no group to hang a fee on — it is stored as a
  // bare number. Name the line and the picker appears.
  if(l.slot<0)return `<td class="cbfee"><span class="cbfeena" data-tip="Give this line a character or group name to add a fee">—</span></td>`;
  const heads=l.no||0;
  const sup=+l.sup||0;
  const opts=[`<option value="0"${!sup?' selected':''}>—</option>`]
    .concat(SUPS.map(s=>`<option value="${s.amt}"${sup===s.amt?' selected':''}>${esc(s.label.length>30?s.label.slice(0,30)+'…':s.label)} · ${gbp(s.amt)}</option>`))
    .concat(sup&&!SUPS.some(s=>s.amt===sup)?[`<option value="${sup}" selected>Custom · ${gbp(sup)}</option>`]:[]);
  return `<td class="cbfee">
      <select class="cbfeesel" data-cbfee="${esc(cbdAddr(sc,i))}" data-tip="Supplementary fee per head — a Featured SA is the SA rate plus fees">${opts.join('')}</select>
      ${sup?`<span class="cbfeetot" data-tip="${heads} × ${gbp(sup)}">${gbp(Math.round(heads*sup))}</span>`:''}
    </td>`;
}
function cbCostCell(l){
  if(!l||l.fromAbove)return `<td class="cbcost"></td>`;
  return `<td class="cbcost">${l.cost?gbp(Math.round(l.cost)):'—'}</td>`;
}
// A scene block, emitted column-by-column in the layout's order. Block cells
// (scene / description / day) print once and span the whole requirement block;
// everything else is per line.
function cbdSceneHTML(sc,layout){
  // always leave one blank line under the listed crowd so there is somewhere
  // to type — the way an AD fills the grid in
  const n=Math.max(1,sc.crowd.length+1,sc.other.length);
  const descHtml=`<div class="cbslug"><b>${esc(sc.ie)}</b>${sc.ie?'&nbsp;&nbsp;&nbsp;':''}<b>${esc(sc.slug)}</b></div>`
    +(sc.desc?`<div class="cbdesc">${esc(sc.desc)}</div>`:'')
    +(sc.cast?`<div class="cbcast">${esc(sc.cast)}</div>`:'');
  // "DAY 5" / "NIGHT 7" — the story day reads as time-of-day + number, exactly
  // as it prints, and the eighths sit under it
  const dayLine=[sc.tod,sc.scriptDay].filter(Boolean).join(' ');
  const dayHtml=`<div>${esc(dayLine)}</div>${sc.pages?`<div class="cbsub">${esc(sc.pages)}</div>`:''}`;
  const sceneHtml=`<div class="cbnum">${esc(sc.num)}</div>${sc.loc?`<div class="cbloc">${esc(sc.loc)}</div>`:''}`;
  let out='';
  for(let i=0;i<n;i++){
    const first=i===0;
    const c=sc.crowd[i],o=sc.other[i];
    // The trailing blank line (no real crowd sits on it yet) is the "add
    // another line" affordance — it carries an "+ Add crowd" button.
    const isAdd=!c&&i===sc.crowd.length;
    // The equivalent blank line for STUNTS/OTHER: the first free row under the
    // printed run, so a stunt line can be added without leaving the grid. Its
    // slot is the next free index in the scene's OWN stunt list, which is not
    // the printed run's length (that run merges three lists).
    const otherAdd=(!o&&i===sc.other.length)
      ? sc.other.filter(x=>(x.src||'extras')==='extras').length
      : null;
    // A scene nobody has assessed yet is left BLANK, on screen and in every
    // export: there is nothing to say about it, and a placed label ("not yet
    // assessed") only reads as a real requirement to whoever receives the
    // document. A scene confirmed as needing nobody still says so.
    const emptyName=first&&!sc.crowd.length&&sc.na?'N/A — no crowd':'';
    const ccls=[c?'cbrow-'+String(c.tier||'SA').toLowerCase():'',c&&c.fromAbove?'fromabove':'',c&&c.tbc?'tbc':'',isAdd?'cbadd':''].filter(Boolean).join(' ');
    // The spreadsheet exports project from the model and so never see this row,
    // and the printed page must match the spreadsheet exactly — this document
    // exists to be exported, so screen-only furniture must never survive into
    // one. `cbaddonly` marks a row that is PURE furniture and can be stripped
    // outright: it is not the scene's first row (which carries the scene /
    // description / day block cells and the "Not yet assessed" label) and it
    // carries no stunts/other entry of its own. Anything else keeps its row and
    // just loses the button.
    const addOnly=isAdd&&!first&&!o;
    const rcls=['cbscene',first?'cbfirst':'',isAdd?'cbaddrow':'',addOnly?'cbaddonly':''].filter(Boolean).join(' ');
    out+=`<tr class="${rcls}"${addOnly?' data-cbaddonly="1"':''} data-cbscene="${esc(sc.dayId)}|${esc(sc.sceneNum)}">`;
    // data-col carries the column's position; data-hlk is a stable per-cell key
    // so a manual highlight sticks to the same cell across edits, re-renders and
    // reloads (positional keys would drift when a crowd line is added above).
    let col=0;
    const base=`${esc(sc.dayId)}|${esc(sc.sceneNum)}`;
    const wc=(h,key)=>h.replace('<td',`<td data-col="${col}" data-hlk="${base}|${key}"`);
    // Highlight mode only: a grip down the left edge of every line. Clicking a
    // column heading already paints a whole column; this is the same move for a
    // row, so a single line can be picked out without sweeping across it. It is
    // absolutely positioned, so it never moves the grid, and it exists only
    // while the pen is on — it can never reach a print or an export.
    // `contenteditable="false"` because it rides inside a typeable cell — without
    // it the grip would be part of that cell's text and could be typed over.
    let grip=CB_HLMODE?`<button type="button" contenteditable="false" class="cbhlgrip noprint" data-hlrow="1" data-tip="Highlight this whole row" aria-label="Highlight this row"></button>`:'';
    // The grip rides in the row's first NON-spanning cell — a scene / description
    // / day cell spans the whole block, so a grip inside one would offer to
    // highlight "this row" from a cell that belongs to all of them.
    const emit=h=>{if(grip){h=h.replace('>',`>${grip}`);grip='';}out+=h};
    for(const def of layout){
      switch(def.role){
        // Block cells print once, on the first line, and span the block.
        case 'sceneNum': if(first)out+=`<td data-col="${col}" data-hlk="${base}|b|scene" class="cbscnum" rowspan="${n}">${sceneHtml}</td>`; break;
        case 'desc': if(first)out+=`<td data-col="${col}" data-hlk="${base}|b|desc" class="cbdescell" rowspan="${n}">${descHtml}</td>`; break;
        case 'day': if(first)out+=`<td data-col="${col}" data-hlk="${base}|b|day" class="cbdaycell" rowspan="${n}">${dayHtml}</td>`; break;
        // Every crowd line is typeable, including the trailing blank one. A scene
        // nobody has assessed still SAYS so — as placeholder text inside the cell.
        case 'crowdNo': emit(wc(cbCrowdNoCell(c,sc,i,ccls,isAdd),`${i}|no`)); break;
        case 'crowdName': emit(wc(cbCrowdNameCell(c,sc,i,ccls,emptyName,isAdd),`${i}|name`)); break;
        case 'crowdCombo': emit(wc(cbCrowdComboCell(c,sc,i,ccls,emptyName,isAdd),`${i}|combo`)); break;
        case 'crowdNotes': emit(wc(cbCrowdNoteCell(c,sc,i,ccls),`${i}|note`)); break;
        case 'otherNo': emit(wc(cbOtherNoCell(o,sc,otherAdd),`${i}|ono`)); break;
        case 'otherName': emit(wc(cbOtherNameCell(o,sc,otherAdd),`${i}|oname`)); break;
        case 'fees': emit(wc(cbFeeCell(c,sc,i),`${i}|fee`)); break;
        case 'cost': emit(wc(cbCostCell(c),`${i}|cost`)); break;
      }
      col++;
    }
    out+='</tr>';
  }
  return out;
}
// Column widths follow the layout, so they travel with a reordered column. A
// <colgroup> (with table-layout:fixed) is the reorder-safe way to size columns
// — positional nth-child rules would size whatever now sits in that slot.
function cbColgroup(layout){
  const total=layout.reduce((a,d)=>a+(d.width||1),0)||1;
  return `<colgroup>${layout.map(d=>`<col style="width:${((d.width||1)/total*100).toFixed(3)}%">`).join('')}</colgroup>`;
}
// The Columns list: reorder the six column blocks by dragging, and show/hide
// the two optional ones, all in one place so an AD never has to drag a merged
// cell by hand. Order changes flow straight through to the screen, the PDF and
// the exports. `data-seg` on each row is the drag payload; the drag handlers
// (near the bottom of this file) reorder CBD.order and re-render.
function cbColListHTML(){
  const order=(Array.isArray(CBD.order)&&CBD.order.length?CBD.order:CB_SEG_ORDER)
    .filter(s=>CB_SEG_ORDER.includes(s));
  for(const s of CB_SEG_ORDER)if(!order.includes(s))order.push(s);
  const vis={scene:true,desc:true,day:true,crowd:true,other:!!CBD.other,cost:!!CBD.costs};
  return order.map(seg=>{
    const hidden=!vis[seg];
    const optional=seg==='other'||seg==='cost';
    return `<li class="cbcolrow${hidden?' off':''}" data-seg="${seg}" draggable="true" data-tip="Drag to reorder">
      <span class="cbcolgrip" aria-hidden="true">⠿</span>
      <span class="cbcolname">${esc(CB_SEG_LABELS[seg]||seg)}${hidden?' <em class="cbcolhint">hidden</em>':''}</span>
      ${optional?`<label class="cbcolvis" data-tip="Show or hide this column"><input type="checkbox" data-cbvis="${seg}" ${hidden?'':'checked'}> <span>Show</span></label>`:''}
    </li>`;
  }).join('');
}
// The "Set up breakdown" step — everything about how the document is built and
// how it looks, in one panel, BEFORE the table is generated. Reopened later
// from the Settings button on the breakdown itself.
let cbSetupOpen=false;
// The setup controls, shared by two surfaces: the full-page setup STEP shown
// before a production has ever generated (with the Generate button), and the
// POPUP reopened over a finished breakdown (opts.modal — no Generate button,
// changes apply live).
function cbSetupHTML(opts){
  const modal=!!(opts&&opts.modal);
  cbdDefaults();
  const fontOpts=CB_FONTS.map(f=>`<option value="${f.id}"${CBD.font===f.id?' selected':''}>${esc(f.label)}</option>`).join('');
  const swatches=CB_ACCENTS.map(c=>`<button type="button" class="cbsw${(CBD.accent||'').toLowerCase()===c?' on':''}" data-cbaccent="${c}" style="background:${c}" aria-label="Accent ${c}" data-tip="${c}"></button>`).join('');
  return `<div class="cbsetup${modal?' cbsetup-modal':''}">
    ${modal?'':`<div class="cbsetuphd">
      <div>
        <h2>Set up breakdown</h2>
        <p class="cbsetupsub">Choose what goes in the document and how it looks, then generate it. You can reopen these settings any time.</p>
      </div>
      <button class="tb-btn cbgenerate" id="cbdGenerate" data-tip="Build the crowd breakdown with these settings">Generate breakdown</button>
    </div>`}
    <div class="cbsetupgrid">
      <section class="cbcard">
        <h3>Basics</h3>
        <label class="cbfield">Breakdown date <input id="cbdDate" type="text" value="${esc(CBD.date)}" placeholder="20/6/26"></label>
        <label class="cbfield">Based on schedule <input id="cbdSched" type="text" value="${esc(CBD.sched)}" placeholder="18/6/26"></label>
      </section>

      <section class="cbcard">
        <h3>Columns</h3>
        <p class="cbcardhint">Drag to reorder. Number and name always stay together; fees &amp; cost move as a pair.</p>
        <ul class="cbcollist" id="cbColList">${cbColListHTML()}</ul>
        <label class="chk"><input type="checkbox" id="cbdNotes" ${CBD.notes!==false?'checked':''}> Notes / continuity column</label>
        <label class="chk" data-tip="Show the count in front of the name in one column, e.g. &quot;38 SA&quot; — totals still show the number"><input type="checkbox" id="cbdMerge" ${CBD.mergeCrowd?'checked':''}> Combine No. + name</label>
        <button class="tb-btn cbstd" id="cbdColsReset" data-tip="Put the columns back to the standard reference layout">Standard layout</button>
      </section>

      <section class="cbcard">
        <h3>Display options</h3>
        <label class="chk"><input type="checkbox" id="cbdWeeks" ${CBD.weeks?'checked':''}> Week bands</label>
        <label class="chk"><input type="checkbox" id="cbdHide" ${CBD.hideEmpty?'checked':''}> Hide scenes with no crowd</label>
        <label class="chk"><input type="checkbox" id="cbdOther" ${CBD.other?'checked':''}> Stunts / other columns</label>
        <label class="chk" data-tip="Off by default — the copy you send to ADs, costume and make-up carries no money"><input type="checkbox" id="cbdCosts" ${CBD.costs?'checked':''}> Fees &amp; costs</label>
      </section>

      <section class="cbcard">
        <h3>Appearance</h3>
        <label class="cbfield">Font <select id="cbdFont">${fontOpts}</select></label>
        <div class="cbfield">
          <span>Header colour</span>
          <div class="cbswatches">${swatches}
            <label class="cbswcustom" data-tip="Pick any colour"><input type="color" id="cbdAccent" value="${esc(/^#([0-9a-f]{6})$/i.test(CBD.accent||'')?CBD.accent:'#e8622a')}"></label>
          </div>
        </div>
        <div class="cbappearprev" style="font-family:${cbFontStack(CBD.font)}">
          <div class="cbappearband" style="background:${esc(CBD.accent||'transparent')};color:${cbAccentInk(CBD.accent)}">PREVIEW</div>
          <div class="cbappearsub">The band colour and font apply to the screen, the PDF and the Excel export.</div>
        </div>
      </section>
    </div>
    ${modal?'':`<div class="cbsetupfoot">
      <button class="tb-btn cbgenerate" id="cbdGenerate2" data-tip="Build the crowd breakdown with these settings">Generate breakdown</button>
    </div>`}
  </div>`;
}
// Show or hide the reopened-settings popup and (re)fill it from the current
// settings. Called at the end of every renderCbDoc, so any control inside the
// popup that re-renders keeps both the breakdown and the popup in step.
function cbSyncSetupModal(){
  const modal=$('#cbSetupModal');if(!modal)return;
  if(cbSetupOpen&&CBD.generated){
    const body=$('#cbSetupBody');if(body)body.innerHTML=cbSetupHTML({modal:true});
    modal.classList.add('open');
  }else{
    modal.classList.remove('open');
  }
}
function renderCbDoc(){
  const host=$('#viewCbdoc');if(!host)return;
  if(!MODEL||!MODEL.days.length){host.innerHTML='<div class="tablecard"><div class="note">Load a schedule and this breakdown builds itself.</div></div>';cbSyncSetupModal();return}
  // Until this production has generated a breakdown at least once, the crowd
  // page IS the full-page setup step (with the Generate button). Once it has,
  // the document always stays on screen and reopened settings ride in a popup
  // over it (see cbSyncSetupModal) — so changing them never leaves the page.
  if(!CBD.generated){cbSyncSetupModal();host.innerHTML=cbSetupHTML();return}
  const doc=cbdDoc(),cols=doc.columns.length;
  const t=doc.totals;
  const bar=`<div class="cbdbar noprint">
    <button class="tb-btn" id="cbdSetupBtn" data-tip="Reopen the setup step to change columns, options and appearance">${icon('gear')} Settings</button>
    ${cbHlBarHTML()}
    <span class="grow"></span>
    ${doc.costs?`<span class="cbdstat money" data-tip="Whole-breakdown cost, from the crowd cost engine">${gbp(Math.round(t.cost))} total</span>`:''}
    <span class="cbdstat" data-tip="Scenes with crowd · confirmed none · not yet assessed">${t.crowded} crowded · ${t.confirmedNone} N/A · ${t.unassessed} open (${t.pctAssessed}% assessed)</span>
  </div>`;
  const layout=doc.layout;
  const hasOther=layout.some(d=>d.role==='otherNo');
  // The total-row label sits just left of the crowd count; everything before
  // the first count/money column is merged under it.
  let leadCount=layout.findIndex(d=>d.count||d.money);
  if(leadCount<0)leadCount=layout.length;
  const otherIdx=layout.findIndex(d=>d.role==='otherNo');
  const otherLabelIdx=otherIdx-1;
  let body='';
  for(const r of doc.rows){
    if(r.kind==='scene'){body+=cbdSceneHTML(r,layout);continue}
    if(r.kind==='week'){body+=`<tr class="cbweek"><td colspan="${cols}">${esc(r.label)}</td></tr>`;continue}
    // one cell, not two: a long date ("Wednesday September 30") overflows the
    // narrow SCENE column and collides with the day number
    if(r.kind==='day'){body+=`<tr class="cbday"><td colspan="${cols}"><span class="cbdate">${esc(r.label)}</span><span class="cbdnum">${esc(r.sub||'')}</span></td></tr>`;continue}
    if(r.kind==='unit'){body+=`<tr class="cbunit"><td colspan="${cols}">${esc(r.label)}</td></tr>`;continue}
    if(r.kind==='banner'){body+=`<tr class="cbbanner"><td colspan="${cols}">${esc(r.label)}</td></tr>`;continue}
    const cls=r.kind==='grandTotal'?'cbgrand':r.kind==='weekTotal'?'cbwktotal':'cbtotal';
    const rk=`t|${r.kind}|${esc(r.label)}`;
    let row=`<tr class="${cls}">`;
    if(leadCount>0)row+=`<td colspan="${leadCount}" data-hlk="${rk}|label" class="cbtlabel">${esc(r.label)}</td>`;
    for(let idx=leadCount;idx<layout.length;idx++){
      const def=layout[idx];
      const dc=` data-col="${idx}" data-hlk="${rk}|${idx}"`;
      if(def.role==='crowdNo'||def.role==='crowdCombo')row+=`<td${dc} class="cbno"><b>${r.no}</b></td>`;
      else if(def.role==='otherNo')row+=`<td${dc} class="cbno"><b>${r.otherNo}</b></td>`;
      else if(def.role==='fees')row+=`<td${dc} class="cbfee">${r.fees?gbp(Math.round(r.fees)):''}</td>`;
      else if(def.role==='cost')row+=`<td${dc} class="cbcost"><b>${r.cost?gbp(Math.round(r.cost)):'—'}</b></td>`;
      else if(idx===otherLabelIdx&&otherIdx>=0&&r.otherLabel&&!def.count&&!def.money)row+=`<td${dc} class="cbtlabel">${esc(r.otherLabel)}</td>`;
      else row+=`<td${dc}></td>`;
    }
    body+=row+'</tr>';
  }
  // Appearance settings ride in as CSS custom properties on the document root,
  // so the chosen font cascades into the table and the accent paints the header
  // band. They are inline on .cbdoc, so the PDF (which clones this node) keeps
  // them without any extra plumbing.
  const accent=CBD.accent||'transparent';
  const cbStyle=`--cb-font:${cbFontStack(CBD.font)};--cb-accent:${esc(accent)};--cb-accent-ink:${cbAccentInk(CBD.accent)}`;
  host.innerHTML=bar+`<div class="cbdoc" style="${cbStyle}">
    <div class="cbhead${CBD.accent?' cbhead-band':''}"><div class="cbtitle">${esc(doc.title)}</div><div class="cbsubtitle">${esc(doc.subtitle)}</div></div>
    <div class="tscroll"><table class="cbtable${doc.costs?' cbmoney':''}${hasOther?' cbother':''}${CB_HLMODE?' cbhlmode':''}">${cbColgroup(layout)}<thead><tr>${doc.columns.map((c,i)=>`<th data-col="${i}" class="cbhth" data-tip="In highlight mode, click to highlight this whole column">${esc(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
  </div>`;
  // the document is now on screen — reflect the reopened-settings popup on top
  cbSyncSetupModal();
  // paint any saved highlights back onto their cells
  applyCbHl();
}
// The highlighter toolbar that rides in the top bar: a mode toggle, the colour
// palette, an eraser and a clear-all. Only the swatch matching the current pen
// is ringed; the whole strip only shows once highlight mode is on.
function cbHlBarHTML(){
  const sw=CB_HL_COLORS.map(c=>`<button class="cbhlsw${CB_HLPEN===c.id?' on':''}" data-cbhlpen="${c.id}" style="background:${c.id}" data-tip="${esc(c.label)}" aria-label="${esc(c.label)}"></button>`).join('');
  return `<button class="tb-btn${CB_HLMODE?' on':''}" id="cbdHlToggle" data-tip="Highlight like a spreadsheet — drag diagonally to fill a whole block, or click a column heading for the whole column">${icon('highlighter')} Highlight</button>
    <span class="cbhlpalette${CB_HLMODE?'':' hidden'}">
      ${sw}
      <button class="cbhlsw cbhlerase${CB_HLPEN==='erase'?' on':''}" data-cbhlpen="erase" data-tip="Eraser — drag over highlights to remove them" aria-label="Eraser">⌫</button>
      <button class="tb-btn cbhlclear" id="cbdHlClear" data-tip="Remove every highlight on this breakdown">Clear all</button>
    </span>`;
}
// Paint saved highlights (cellKey -> colour) back onto the live cells. Runs on
// every render so an edit never drops the annotations.
function applyCbHl(){
  const tbl=document.querySelector('#viewCbdoc .cbtable');
  if(!tbl)return;
  tbl.querySelectorAll('[data-hlk]').forEach(el=>{
    const col=CBD.hl[el.getAttribute('data-hlk')];
    if(col){el.classList.add('cbhl');el.style.setProperty('--cbhl',col);}
    else{el.classList.remove('cbhl');el.style.removeProperty('--cbhl');}
  });
}
// Paint (or erase) one cell and remember it. Painting sets the pen colour;
// removing a highlight is the eraser pen (or Clear all) — so a drag never
// flickers a cell off just because the pointer re-enters it.
function cbHlPaint(el){
  const k=el&&el.getAttribute&&el.getAttribute('data-hlk');
  if(!k)return;
  if(CB_HLPEN==='erase'){
    delete CBD.hl[k];el.classList.remove('cbhl');el.style.removeProperty('--cbhl');
  }else{
    CBD.hl[k]=CB_HLPEN;el.classList.add('cbhl');el.style.setProperty('--cbhl',CB_HLPEN);
  }
}
// One cell's grid position: the row's place in the table, and the column index.
function cbHlCoord(el){
  const tr=el.closest&&el.closest('tr');
  const c=el.getAttribute('data-col');
  return {r:tr?tr.rowIndex:0,c:c==null?0:+c};
}
// Set a cell to a colour (null clears it), without saving — used mid-drag.
function cbHlWrite(el,color){
  const k=el.getAttribute('data-hlk');if(!k)return;
  if(color==null){delete CBD.hl[k];el.classList.remove('cbhl');el.style.removeProperty('--cbhl');}
  else{CBD.hl[k]=color;el.classList.add('cbhl');el.style.setProperty('--cbhl',color);}
}
// Fill the rectangle between the drag's start cell and the cell now under the
// pointer, so one diagonal sweep highlights a whole block. Each move first
// reverts the previous rectangle, so shrinking the drag un-fills cleanly.
function cbHlDragTo(cur){
  if(!CB_HLSTART)return;
  CB_HLDRAGMAP.forEach((prev,el)=>cbHlWrite(el,prev==null?null:prev));
  CB_HLDRAGMAP.clear();
  const a=cbHlCoord(CB_HLSTART),b=cbHlCoord(cur);
  const r0=Math.min(a.r,b.r),r1=Math.max(a.r,b.r),c0=Math.min(a.c,b.c),c1=Math.max(a.c,b.c);
  const paint=CB_HLPEN==='erase'?null:CB_HLPEN;
  document.querySelectorAll('#viewCbdoc .cbtable [data-hlk]').forEach(el=>{
    const co=cbHlCoord(el);
    if(co.r>=r0&&co.r<=r1&&co.c>=c0&&co.c<=c1){
      CB_HLDRAGMAP.set(el,CBD.hl[el.getAttribute('data-hlk')]);
      cbHlWrite(el,paint);
    }
  });
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
    ${COST.adjRows.map(x=>{const d=COST.dayById[x.dayId];return `<tr><td class="rowlabel">${icon('zap')} ${esc(x.label)}</td><td><button class="dchip ${d.unit==='2nd'?'u2':''}" data-goto="${esc(d.id)}">${esc(chipDate(d))} · D${d.num}</button></td><td class="num money">${gbp(x.amt)}</td></tr>`}).join('')}
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
let FC={shift:'Day',fw:'std',ph:false,call:'07:00',wrap:'18:00',travel:'A',tier:'SA',heads:1,sups:[],meals:{short:false,late:false},card:''};
try{Object.assign(FC,JSON.parse(store.get('stuntos-freecalc')||'{}'))}catch(e){}
if(FC.card===undefined)FC.card='';
function saveFC(){store.set('stuntos-freecalc',JSON.stringify(FC));cloudSyncUser('freecalc',FC)}
// The calculator prices with ITS OWN chosen rate card ('' = PACT/FAA 2026
// defaults, 'sa:Name' = a named SA card, 'spact' = Take 3 SPACT, 'spact:Name'
// = a custom SPACT card) — overlaid locally so the board's own production
// rates are never touched by playing in here.
function fcSettings(){
  const s=crowdSettingsFromDOM();
  const c=FC.card||'';
  if(!c)return {...s,baseDay:undefined};
  const name=c.includes(':')?c.slice(c.indexOf(':')+1):'';
  const v=(name&&(c.startsWith('sa:')?cardsFor('sa')[name]:cardsFor('spact')[name]))||{};
  const n=(key,cur)=>v[key]!=null&&v[key]!==''?+v[key]:cur;
  return {...s,baseDay:undefined,
    pact:{...s.pact,sa:n('cSA',s.pact.sa),hol:v.cHol!=null&&v.cHol!==''?(+v.cHol)/100:s.pact.hol,otDay:n('cOTday',s.pact.otDay),otNight:n('cOTnight',s.pact.otNight),earlyTravel:n('cET',s.pact.earlyTravel),travelA:n('cTravelA',s.pact.travelA),travelB:n('cTravelB',s.pact.travelB)},
    spact:{...s.spact,basic:n('cSpact',s.spact.basic),night:n('cSpactNight',s.spact.night),hol:n('cSpactHol',s.spact.hol),earlyTravel:n('cSpactET',s.spact.earlyTravel)},
  };
}
function fcPerHead(cfg,tier){return engineCdPerHead(cfg,tier,fcSettings())}
// every rate card the calculator can price with, as [key,label] pairs
function fcCardChoices(){
  return [
    ['','PACT / FAA 2026'],
    ...Object.keys(cardsFor('sa')).map(n=>['sa:'+n,n]),
    ['spact','Take 3 SPACT 2026'],
    ...Object.keys(cardsFor('spact')).map(n=>['spact:'+n,n]),
  ];
}
function fcRange(fromH,toH){return m2t(Math.round(fromH*60))+'–'+m2t(Math.round(toH*60))}
let CALC_KIND=null; // null = follow the app mode; 'crowd'|'stunt'|'dance'
function calcKind(){return CALC_KIND||(APPMODE==='stunt'?'stunt':'crowd')}
function calcKindSeg(){
  const k=calcKind();
  return `<div class="tablecard fcpad"><div class="sl2">Discipline</div>
    <span class="seg">${[['crowd','Crowd'],['stunt','Stunts'],['dance','Dance']].map(([v,l])=>`<button data-calckind="${v}" class="${k===v?'on':''}">${l}</button>`).join('')}</span>
  </div>`;
}
function renderFreeCalc(){
  const kind=calcKind();
  if(kind==='dance'){renderDanceCalc();return}
  if(kind==='stunt'){renderStuntCalc();return}
  FC.tier=(FC.card||'').startsWith('spact')?'SPACT':'SA';
  const pv=fcPerHead(FC,FC.tier);
  const base=pv.base;
  const fwH=tierFwHours(FC,FC.tier);
  const spact=FC.tier==='SPACT';
  $('#viewCalc').innerHTML=`<div class="fcgrid">
  <div class="fccol">
    ${calcKindSeg()}
    <div class="tablecard fcpad"><div class="sl2">Rate card</div>
      <span class="seg cards">${fcCardChoices().map(([k,label])=>`<button data-fccard="${esc(k)}" class="${(FC.card||'')===k?'on':''}">${esc(label)}</button>`).join('')}</span>
      <div class="cdinfo" style="margin-top:7px">Cards are managed in Account → Manage rate cards — new ones appear here automatically.</div>
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
      <div class="cdrow">${sliderHTML(FC.call,FC.wrap,'fc')}</div>
    </div>
    <div class="tablecard fcpad"><div class="sl2">Travel</div>
      <div class="cdrow"><span class="seg" data-fcseg="travel"><button data-v="A" class="${FC.travel==='A'?'on':''}">Cat A — Zones 1–3 · ${gbp(gTA())}</button><button data-v="B" class="${FC.travel==='B'?'on':''}">Cat B — Studios/Beyond Z3 · ${gbp(gTB())}</button><button data-v="none" class="${FC.travel==='none'?'on':''}">No travel</button></span></div>
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
let SC={tier:'perf',ins:true,adj:0,heads:1,card:'',fw:'swd',night:false,call:'07:00',wrap:'18:00'};
try{Object.assign(SC,JSON.parse(store.get('stuntos-stuntcalc')||'{}'))}catch(e){}
function saveSC(){store.set('stuntos-stuntcalc',JSON.stringify(SC));cloudSyncUser('stuntcalc',SC)}
// stunt roster (rough budget) — name + role rows priced by the calculator
let SROWS=[];try{SROWS=JSON.parse(store.get('crowdos-srows')||'[]')}catch(e){SROWS=[]}
function saveSROWS(){store.set('crowdos-srows',JSON.stringify(SROWS));cloudSyncUser('srows',SROWS)}
// the calculator's OWN card overlay (baseline = app defaults, never the
// production's hidden rate inputs) — same independence as the crowd calc
function scR(){
  const v=SC.card?(cardsFor('stunts')[SC.card]||{}):{};
  const g=id=>v[id]!=null&&v[id]!==''?+v[id]:+(RC_DEFAULTS[id]||0);
  return {perf:g('rPerf'),coord:g('rCoord'),hol:g('rHol'),ins:g('rIns'),insDays:g('rInsDays'),usePct:g('rUse'),otFrac:g('rOTFrac'),nightPct:g('rNightPct')};
}
function scParts(tier){
  const R=scR();
  const t=tier||SC.tier;
  const daily=t==='coord'?R.coord:R.perf;
  const ex=engineStuntDayExtras({call:SC.call,wrap:SC.wrap,fw:SC.fw,night:!!SC.night},daily,{otFrac:R.otFrac});
  const night=SC.night?daily*(R.nightPct/100):0;
  const usage=daily*(R.usePct/100);
  const ins=SC.ins?R.ins:0;
  const adj=+SC.adj||0;
  return {daily,hol:R.hol,usage,usePct:R.usePct,ins,adj,ot:ex.ot,early:ex.early,otH:ex.otH,earlyH:ex.earlyH,dawn:ex.dawn,night,nightPct:R.nightPct,otFrac:R.otFrac,
    per:daily+R.hol+usage+ins+adj+ex.ot+ex.early+night};
}
function renderStuntCalc(){
  const p=scParts();
  const R=scR();
  const {call,wrap}=cdTimes({call:SC.call,wrap:SC.wrap});
  const hrs=(wrap-call);
  const row=(label,note,amt,strong)=>`<div class="fcrow${strong?' strong':''}"><div><b>${label}</b>${note?`<div class="fnote">${note}</div>`:''}</div><div class="famt ${amt>0?'costable':''}">${gbp(amt)}</div></div>`;
  const cards=[['','Standard 2026'],...Object.keys(cardsFor('stunts')).sort().map(n=>[n,n])];
  const roster=SROWS.map((r,i)=>{
    const per=scParts(r.tier).per;
    return `<tr>
      <td><input type="text" data-scr="name" data-i="${i}" value="${esc(r.name||'')}" placeholder="e.g. Rooftop double"></td>
      <td><select data-scr="tier" data-i="${i}"><option value="perf"${r.tier!=='coord'?' selected':''}>Performer</option><option value="coord"${r.tier==='coord'?' selected':''}>Coordinator</option></select></td>
      <td class="num"><input type="number" min="0" data-scr="count" data-i="${i}" value="${+r.count||0}"></td>
      <td class="num mono">${gbp(per)}</td>
      <td class="num money">${gbp(Math.round(per*(+r.count||0)))}</td>
      <td><button class="x" data-scr="del" data-i="${i}">✕</button></td>
    </tr>`;
  }).join('');
  const rosterTotal=SROWS.reduce((a,r)=>a+scParts(r.tier).per*(+r.count||0),0);
  const rosterHeads=SROWS.reduce((a,r)=>a+(+r.count||0),0);
  $('#viewCalc').innerHTML=`<div class="fcgrid">
  <div class="fccol">
    ${calcKindSeg()}
    <div class="tablecard fcpad"><div class="sl2">Rate card</div>
      <span class="seg cards">${cards.map(([k,l])=>`<button data-sccard="${esc(k)}" class="${(SC.card||'')===k?'on':''}">${esc(l)}</button>`).join('')}</span>
      ${!p.otFrac?`<div class="cdinfo" style="margin-top:7px">This card carries no overtime rule — pick an Equity card (CFA / TV / SVOD) for hourly OT, or create a custom card with an OT fraction.</div>`:''}
    </div>
    <div class="tablecard fcpad"><div class="sl2">Who</div>
      <span class="seg" data-scseg="tier"><button data-v="perf" class="${SC.tier==='perf'?'on':''}">Stunt performer · ${gbp(R.perf)}</button><button data-v="coord" class="${SC.tier==='coord'?'on':''}">Stunt coordinator · ${gbp(R.coord)}</button></span>
    </div>
    <div class="tablecard fcpad"><div class="sl2">Hours &amp; shift</div>
      <div class="cdrow" style="margin-bottom:6px">
        <span class="seg" data-scseg="fw"><button data-v="swd" class="${SC.fw==='swd'?'on':''}">SWD (10 hrs incl. lunch)</button><button data-v="cwd" class="${SC.fw==='cwd'?'on':''}">CWD (8 hrs)</button></span>
        <label class="chk2"><input type="checkbox" data-scnight ${SC.night?'checked':''}> Night shoot${p.nightPct?` (+${p.nightPct}% of the day rate)`:''}</label>
      </div>
      <div class="cdrow">${sliderHTML(SC.call,SC.wrap,'sk')}</div>
      <div class="cdrow"><span class="cdinfo" id="skInfo">${hrs.toFixed(2)}h on the clock${p.otFrac?` · OT ${p.otH.toFixed(1)}h @ ${gbp(p.daily/p.otFrac)}/hr${p.earlyH?` · early ${p.earlyH.toFixed(1)}h`:''}${p.dawn?' · dawn call — 5-hour day':''}`:''}</span></div>
    </div>
    <div class="tablecard fcpad"><div class="sl2">Options</div>
      <label class="chk2"><input type="checkbox" data-scins ${SC.ins?'checked':''}> Insurance day (${gbp(R.ins)} — first ${R.insDays} working days per week)</label>
      <div class="cdrow" style="margin-top:10px">
        <span class="cdfield"><label>Stunt adjustment (fire burn, high fall…)</label><div class="inwrap" style="display:inline-flex;background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:0 10px;align-items:center;gap:4px"><span>£</span><input data-scadj type="number" min="0" step="0.5" value="${SC.adj||''}" placeholder="0" style="background:none;border:none;color:var(--ink);padding:8px 0;width:100px;font-family:var(--mono)"></div></span>
      </div>
    </div>
  </div>
  <div class="fccol">
    <div class="tablecard fcpad" id="fcOut">
      <div class="sl2">Breakdown — per ${SC.tier==='coord'?'coordinator':'performer'}, per day</div>
      ${row('Day rate',(SC.card||'Standard 2026')+(SC.tier==='coord'?' · coordinator':' · performer'),p.daily)}
      ${row('Holiday','flat per day',p.hol)}
      ${row('Usage',p.usePct?p.usePct.toFixed(1)+'% of the day rate':'included in the fee',p.usage)}
      ${row('Overtime',p.otFrac?(p.otH?p.otH.toFixed(1)+'h beyond the '+(SC.fw==='cwd'?'8h CWD':'10h SWD')+' framework @ 1/'+p.otFrac+' of the day rate per hour':'within basic hours'):'no OT rule on this card',p.ot)}
      ${row('Early call',p.earlyH?p.earlyH.toFixed(1)+'h before 07:00'+(p.dawn?' · dawn call':''):'call 07:00+',p.early)}
      ${row('Night uplift',SC.night?(p.nightPct?p.nightPct+'% of the day rate':'no night rule on this card'):'day shoot',p.night)}
      ${row('Insurance',SC.ins?'first '+R.insDays+' working days each week':'not an insurance day',p.ins)}
      ${row('Stunt adjustment',p.adj?'high-risk action fee':'none',p.adj)}
      ${row('Gross per day','',p.per,true)}
      <div class="fcgross">
        <div class="sl2" style="color:var(--hv)">Estimated gross</div>
        <div class="grossline"><input type="number" min="1" data-scheads value="${SC.heads}"> <span>×</span> <input type="text" data-scname placeholder="Character / stunt — e.g. Rooftop double" style="flex:0 1 210px"> <span>@</span> <span class="mono">${gbp(p.per)}</span> <span>=</span> <b class="costable">${gbp(p.per*(SC.heads||1))}</b> <button id="scToRoster" class="tb-btn" style="margin-left:10px;padding:6px 12px;font-size:11.5px;border-color:var(--hv-line);color:var(--hv)">+ Add to rough budget</button></div>
      </div>
    </div>
    <div class="tablecard fc-roster"><h3>Rough day budget<span class="cnt">${rosterHeads} heads</span><span class="sum costable">${gbp(Math.round(rosterTotal))}</span></h3>
      <div class="tscroll"><table><thead><tr><th>Character / stunt</th><th>Role</th><th class="num">Count</th><th class="num">Per day</th><th class="num">Subtotal</th><th></th></tr></thead><tbody>${roster}</tbody></table></div>
      <div style="display:flex;gap:10px;align-items:center;padding:10px 14px"><button class="tb-btn" id="scAddRow" style="border-style:dashed">+ Add line</button>
      <span style="color:var(--faint);font-size:11px">Priced with the card, hours and options above.</span></div>
    </div>
  </div>
  </div>`;
}
// ---------- dance calculator — Equity TV (PACT TV) 2026 weekly model ----------
let DC={eng:'svod',pat:'cwd',shoot:1,reh:0,fit:0,usage:65,call:'08:00',wrap:'20:00',travelH:0,miles:0,pens:{defer:false,curtail:false,rest:false},heads:1};
try{Object.assign(DC,JSON.parse(store.get('crowdos-dancecalc')||'{}'))}catch(e){}
function saveDC(){store.set('crowdos-dancecalc',JSON.stringify(DC));cloudSyncUser('dancecalc',DC)}
let DROWS=[];try{DROWS=JSON.parse(store.get('crowdos-drows')||'[]')}catch(e){DROWS=[]}
function saveDROWS(){store.set('crowdos-drows',JSON.stringify(DROWS));cloudSyncUser('drows',DROWS)}
function dcWeek(){
  const t=cdTimes({call:DC.call,wrap:DC.wrap});
  return danceWeek({eng:DC.eng,pat:DC.pat,shoot:DC.shoot,reh:DC.reh,fit:DC.fit,usage:+DC.usage||0,
    days:[{start:Math.round(t.call*60),end:Math.round(t.wrap*60)}],
    travelH:+DC.travelH||0,miles:+DC.miles||0,pens:DC.pens});
}
function renderDanceCalc(){
  const R=DANCE_2026;
  const c=dcWeek();
  const row=(label,note,amt,strong)=>`<div class="fcrow${strong?' strong':''}"><div><b>${label}</b>${note?`<div class="fnote">${note}</div>`:''}</div><div class="famt ${amt>0?'costable':''}">${gbp(amt)}</div></div>`;
  const stepper=(k,label,note,val,min,max)=>`<div class="cdrow" style="margin-bottom:8px"><span class="cdfield" style="flex:1"><label>${label}</label><span class="cdinfo">${note}</span></span>
    <span class="seg"><button data-dstep="${k}" data-d="-1" ${val<=min?'disabled':''}>−</button><button disabled style="min-width:44px;font-family:var(--mono)">${val}</button><button data-dstep="${k}" data-d="1" ${val>=max?'disabled':''}>+</button></span></div>`;
  const d0=c.perDay[0];
  const roster=DROWS.map((r,i)=>`<tr>
      <td><input type="text" data-dcr="name" data-i="${i}" value="${esc(r.name||'')}" placeholder="e.g. Featured dancers"></td>
      <td class="num"><input type="number" min="0" data-dcr="count" data-i="${i}" value="${+r.count||0}"></td>
      <td class="num mono">${gbp(c.gross)}</td>
      <td class="num money">${gbp(Math.round(c.gross*(+r.count||0)))}</td>
      <td><button class="x" data-dcr="del" data-i="${i}">✕</button></td>
    </tr>`).join('');
  const rosterTotal=DROWS.reduce((a,r)=>a+c.gross*(+r.count||0),0);
  const rosterHeads=DROWS.reduce((a,r)=>a+(+r.count||0),0);
  $('#viewCalc').innerHTML=`<div class="fcgrid">
  <div class="fccol">
    ${calcKindSeg()}
    <div class="tablecard fcpad"><div class="sl2">Rate card</div>
      <span class="seg"><button class="on">Equity TV (PACT TV) 2026 — weekly engagement</button></span>
    </div>
    <div class="tablecard fcpad"><div class="sl2">Step 1 — Engagement</div>
      <span class="seg" data-dcseg="eng"><button data-v="broadcast" class="${DC.eng==='broadcast'?'on':''}">Broadcast · ${gbp(R.oneBroadcast)} one day</button><button data-v="svod" class="${DC.eng==='svod'?'on':''}">SVOD / Streamer · ${gbp(R.oneSVOD)} one day</button></span>
      <div class="cdinfo" style="margin-top:7px">One shoot day = the One Day Engagement fee. From two days, the first carries the weekly engagement (${DC.eng==='svod'?gbp(R.engSVOD):gbp(R.engBroadcast)}) and every further shoot day is a ${gbp(R.prodDay)} production day.</div>
    </div>
    <div class="tablecard fcpad"><div class="sl2">Step 2 — The week</div>
      ${stepper('shoot','Shoot days','usage applies · all 7 adds the '+gbp(R.seventh)+' 7th-day payment',DC.shoot,1,7)}
      ${stepper('reh','Rehearsal days',gbp(R.rehearsal)+'/day · no usage',DC.reh,0,14)}
      ${stepper('fit','Fittings',gbp(R.fitting)+' each · no usage',DC.fit,0,14)}
      <div class="cdrow"><span class="cdfield"><label>Usage / buy-out %</label><div class="inwrap" style="display:inline-flex;background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:0 10px;align-items:center;gap:4px"><input data-dcusage type="number" min="0" max="500" value="${DC.usage}" style="background:none;border:none;color:var(--ink);padding:8px 0;width:70px;font-family:var(--mono)"><span>%</span></div></span>
      <span class="cdinfo">on shoot fees only — never fittings or rehearsals</span></div>
    </div>
    <div class="tablecard fcpad"><div class="sl2">Shoot day pattern</div>
      <span class="seg" data-dcseg="pat"><button data-v="nwd" class="${DC.pat==='nwd'?'on':''}">Standard Working Day (10 hrs incl. lunch)</button><button data-v="cwd" class="${DC.pat==='cwd'?'on':''}">CWD (8 hrs · running buffet)</button></span>
      <div class="cdrow" style="margin-top:8px">${sliderHTML(DC.call,DC.wrap,'dc')}</div>
      <div class="cdrow"><span class="cdinfo" id="dcInfo">${d0.totalHrs.toFixed(1)}h on the clock · ${d0.otHrs.toFixed(1)}h OT${d0.night?' · night work':''}${d0.dawn?' · dawn call — 5h day':''} — applies to each shoot day in the week</span></div>
    </div>
    <div class="tablecard fcpad"><div class="sl2">Travel — per shoot day</div>
      <div class="cdrow">
        <span class="cdfield"><label>Travel time (hrs, max 2 · ${gbp(R.travelHr)}/hr)</label><input data-dctravel type="number" min="0" max="2" step="0.5" value="${DC.travelH}" style="background:var(--panel2);border:1px solid var(--line2);border-radius:8px;color:var(--ink);padding:8px 10px;width:90px;font-family:var(--mono)"></span>
        <span class="cdfield"><label>Mileage (round-trip miles · ${gbp(R.mileage)}/mi)</label><input data-dcmiles type="number" min="0" value="${DC.miles}" style="background:var(--panel2);border:1px solid var(--line2);border-radius:8px;color:var(--ink);padding:8px 10px;width:90px;font-family:var(--mono)"></span>
      </div>
    </div>
    <div class="tablecard fcpad"><div class="sl2">Meal break &amp; rest penalties — per shoot day</div>
      <div class="supgrid">
        <label class="chk2"><input type="checkbox" data-dcpen="defer" ${DC.pens.defer?'checked':''}> Meal break deferment <b class="mono" style="margin-left:auto">${gbp(R.penDefer)}</b></label>
        <label class="chk2"><input type="checkbox" data-dcpen="curtail" ${DC.pens.curtail?'checked':''}> Meal break curtailment / cancellation <b class="mono" style="margin-left:auto">${gbp(R.penCurtail)}</b></label>
        <label class="chk2"><input type="checkbox" data-dcpen="rest" ${DC.pens.rest?'checked':''}> Break between calls infringement <b class="mono" style="margin-left:auto">${gbp(R.penRest)}</b></label>
      </div>
    </div>
  </div>
  <div class="fccol">
    <div class="tablecard fcpad" id="fcOut">
      <div class="sl2">Breakdown — per dancer, per week</div>
      <div class="cdrow" style="margin-bottom:10px"><span class="cdinfo">${DC.eng==='svod'?'SVOD':'Broadcast'} · ${DC.shoot} shoot · ${DC.reh} rehearsal · ${DC.fit} fitting</span><span class="cdinfo" style="margin-left:auto">${esc(DC.call)} → ${esc(DC.wrap)}</span></div>
      ${row(c.oneDay?'One Day Engagement':'Engagement fee',c.oneDay?'single shoot day':'weekly — covers the first shoot day',c.engFee)}
      ${row('Further shoot days',c.prodDays?c.prodDays+' × '+gbp(R.prodDay)+' production day':'no further shoot days',c.prodFees)}
      ${row('Usage / buy-out',(+DC.usage||0)+'% on shoot fees of '+gbp(c.usageBase),c.usage)}
      ${row('Rehearsal days',c.rehFees?DC.reh+' × '+gbp(R.rehearsal):'none',c.rehFees)}
      ${row('Fittings',c.fitFees?DC.fit+' × '+gbp(R.fitting):'none',c.fitFees)}
      ${row('Holiday pay',gbp(R.holidayPay)+' × '+c.days+' day'+(c.days===1?'':'s')+' of attendance',c.holiday)}
      ${row('Overtime',d0.blocks?('('+d0.otStdBlocks+' × '+gbp(R.otStd)+(d0.otEnhBlocks?' + '+d0.otEnhBlocks+' × '+gbp(R.otEnh):'')+') × '+DC.shoot+' shoot day'+(DC.shoot===1?'':'s')):'within basic hours',c.ot)}
      ${row('Night work',c.nightPay?gbp(R.nightStd)+' × '+c.nightDays+' night'+(c.nightDays===1?'':'s'):'day work only',c.nightPay)}
      ${row('Travel & mileage',c.travel?gbp(c.travelPerDay+c.milesPerDay)+' × '+DC.shoot+' shoot day'+(DC.shoot===1?'':'s'):'none',c.travel)}
      ${row('Penalties',c.pens?gbp(c.penPerDay)+' × '+DC.shoot+' shoot day'+(DC.shoot===1?'':'s'):'none',c.pens)}
      ${c.seventhPay?row('7th day payment','all seven days booked',c.seventhPay):''}
      ${row('Gross per dancer',c.days+' day week · before expenses',c.gross,true)}
      <div class="fcgross">
        <div class="sl2" style="color:var(--hv)">Estimated gross</div>
        <div class="grossline"><input type="number" min="1" data-dcheads value="${DC.heads}"> <span>×</span> <input type="text" data-dcname placeholder="Character / group — e.g. Featured dancers" style="flex:0 1 210px"> <span>@</span> <span class="mono">${gbp(c.gross)}</span> <span>=</span> <b class="costable">${gbp(c.gross*(DC.heads||1))}</b> <button id="dcToRoster" class="tb-btn" style="margin-left:10px;padding:6px 12px;font-size:11.5px;border-color:var(--hv-line);color:var(--hv)">+ Add to rough budget</button></div>
      </div>
    </div>
    <div class="tablecard fc-roster"><h3>Rough week budget<span class="cnt">${rosterHeads} heads</span><span class="sum costable">${gbp(Math.round(rosterTotal))}</span></h3>
      <div class="tscroll"><table><thead><tr><th>Character / group</th><th class="num">Count</th><th class="num">Per week</th><th class="num">Subtotal</th><th></th></tr></thead><tbody>${roster}</tbody></table></div>
      <div style="display:flex;gap:10px;align-items:center;padding:10px 14px"><button class="tb-btn" id="dcAddRow" style="border-style:dashed">+ Add line</button>
      <span style="color:var(--faint);font-size:11px">Priced live with the week settings above — minimum rates, negotiate upwards.</span></div>
    </div>
  </div>
  </div>`;
}
function fcPerTotal(){
  const p=fcPerHead(FC,FC.tier);
  return p.per+FC.sups.reduce((a,k)=>a+SUPS.find(s=>s.k===k).amt,0)
    +Object.keys(FC.meals).filter(k=>FC.meals[k]).reduce((a,k)=>a+(FC.shift==='Night'?MEAL[k].night:MEAL[k].day),0);
}
function renderFcOut(){
  const p=fcPerHead(FC,FC.tier);
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
      <span class="cdinfo">${spact?'Take 3 SPACT rates':'Featured SA = SA rate + supplementary fees'}</span>
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
      <div class="grossline"><input type="number" min="1" data-fcheads value="${FC.heads}"> <span>×</span> <input type="text" data-fcname placeholder="Character / group — e.g. Nurses" style="flex:0 1 210px"> <span>@</span> <span class="mono">${gbp(fcPerTotal())}</span> <span>=</span> <b class="costable">${gbp(fcPerTotal()*(FC.heads||1))}</b></div>
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
  // crowd groups — each distinct named crowd group gets a stable code (301+).
  // Groups that share a name share a code, so the same code across scenes means
  // the same people reused; a differently-named group takes the next number.
  const CROWD_BASE=301;
  const cg={}; let cgNext=CROWD_BASE;
  const cgTiers=[['saChars','SA','cr'],['featured','Featured','feat'],['spacts','SPACT','spact']];
  for(const d of MODEL.days)for(const s of d.scenes)for(const [field,tierLabel,cls] of cgTiers){
    for(const g of (s[field]||[])){
      const nm=(g.name||'').trim(); if(!nm||!(+g.count>0))continue;
      const key=nm.toLowerCase().replace(/\s+/g,' ');
      if(!cg[key])cg[key]={code:String(cgNext++),name:nm,tier:tierLabel,cls,scenes:0,days:new Set(),max:0};
      cg[key].scenes++;cg[key].days.add(d.id);cg[key].max=Math.max(cg[key].max,+g.count||0);
    }
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
  const saDays=MODEL.days.reduce((a,d)=>a+dayScheduleSA(d),0);
  const featDays=MODEL.days.reduce((a,d)=>a+dayPeakFeat(d),0);
  const spactDays=MODEL.days.reduce((a,d)=>a+dayPeakSpact(d),0);
  let busiest=null;for(const d of MODEL.days){const p=dayScheduleSA(d);if(!busiest||p>busiest.p)busiest={d,p}}
  html+=`<div class="tablecard"><h3>Full stunt totals<span class="sum costable">${gbp(COST.grand)}</span></h3>
  <div class="tscroll"><table><tbody>
  <tr><td class="rowlabel">Coordinator days</td><td class="num">${coordD}</td></tr>
  <tr><td class="rowlabel">Stunt double person-days</td><td class="num">${sdD}</td></tr>
  <tr><td class="rowlabel">Stunt performer person-days</td><td class="num">${spD}</td></tr>
  <tr><td class="rowlabel">Additional performer person-days</td><td class="num">${xD}</td></tr>
  <tr><td class="rowlabel">Stunt adjustments</td><td class="num costable">${COST.adjGrand?gbp(COST.adjGrand):'—'}</td></tr>
  <tr><td class="rowlabel">Stunt dept coordinator</td><td class="num costable">${COST.sd.on?gbp(COST.sd.total):'off'}</td></tr>
  <tr class="total"><td>Total stunt personnel-days</td><td class="num">${coordD+sdD+spD+xD}</td></tr>
  </tbody></table></div></div>`;
  // Crowd — each named group as a coded row
  const cgRows=Object.values(cg).sort((a,b)=>(+a.code)-(+b.code));
  if(cgRows.length){
    html+=`<div class="tablecard"><h3>Crowd<span class="cnt">${cgRows.length}</span></h3>
    <div class="note" style="margin:-2px 0 10px">Each crowd group has a code. Groups sharing a name share a code — the same code across scenes means the same people reused; give a group a new name to start a fresh set under a new number.</div>
    <div class="tscroll"><table><thead><tr><th style="width:80px">Code</th><th>Group</th><th>Tier</th><th class="num">Max heads</th><th class="num">Scenes</th><th class="num">Days</th></tr></thead><tbody>
    ${cgRows.map(g=>`<tr><td><span class="code ${g.cls}">${esc(g.code)}</span></td><td class="rowlabel">${esc(g.name)}</td><td>${esc(g.tier)}</td><td class="num">${g.max}</td><td class="num">${g.scenes}</td><td class="num">${g.days.size}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  }
  html+=`<div class="tablecard"><h3>Full crowd totals</h3>
  <div class="tscroll"><table><tbody>
  <tr><td class="rowlabel">SA artiste-days (peak per day)</td><td class="num">${saDays.toLocaleString()}</td></tr>
  <tr><td class="rowlabel">Featured background (peak per day)</td><td class="num">${featDays.toLocaleString()}</td></tr>
  <tr><td class="rowlabel">Spacts (peak per day)</td><td class="num">${spactDays.toLocaleString()}</td></tr>
  <tr><td class="rowlabel">Busiest crowd day</td><td class="num">${busiest&&busiest.p?`<button class="dchip ${busiest.d.unit==='2nd'?'u2':''}" data-goto="${esc(busiest.d.id)}">D${busiest.d.num} · ${busiest.p} SA</button>`:'—'}</td></tr>
  </tbody></table></div>
  <div class="note">Crowd figures are daily peaks summed across the schedule — costing them properly (tiers, chits, supplements) is Crowd-engine territory.</div></div>`;
  $('#viewCast').innerHTML=html;
}

// ---------- calendar ----------
const MONFULL=['January','February','March','April','May','June','July','August','September','October','November','December'];
let CALVIEW=store.get('stuntos-calview')||'cond';
function renderCalendar(){
  const BDAY=APPMODE==='crowd'?briefsByDay():null; // brief badges per day
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
      const isToday=new Date(y,mo,dd).getTime()===todayCal();
      if(!list.length){cells+=`<div class="cal-cell noshoot${isToday?' todaycell':''}"><span class="dnumtxt">${dd}</span>${isToday?'<span class="todaytag">Today</span>':''}</div>`;continue}
      const inner=list.map(d=>{
        const pd=COST.perDay[d.id], cd=CROWD.perDay[d.id];
        let workBits='';
        const db=BDAY?BDAY.get(d.id):null;
        const briefBit=db?`<div class="cbriefs ${db.sent>=db.total?'ok':db.sent?'part':'none'}">${icon('mail')} ${db.sent}/${db.total} sent</div>`:'';
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
              workBits=`<div class="ccost costable">${gbp(Math.round(cd.cost))}</div><div class="cchars">${lines}<div class="crow ctot"><b>Total ${saTot}</b> SA's${spTot?` · <b>${spTot}</b> SPACT`:''}</div></div>${briefBit}`;
            }else{
              const tc=[cd.sa?cd.sa+' SA':'',cd.featPD?cd.featPD+' feat':'',cd.spactPD?cd.spactPD+' spact':''].filter(Boolean).join(' · ');
              workBits=`<div class="ccost costable">${gbp(Math.round(cd.cost))}</div><div class="cteam">${tc}</div>${briefBit}`;
            }}
        }else{
          if(pd){monthCost+=pd.cost;monthStunt++;
            const tc=(()=>{let co=0,perf=0;for(const p of pd.people){if(p.type==='stuntCoord')co+=p.count;else perf+=p.count}return (co?co+' coord':'')+(co&&perf?' · ':'')+(perf?perf+' perf':'')})();
            const scChips=CALVIEW==='exp'?`<div class="cchars">${d.scenes.filter(sceneHasStunts).slice(0,5).map(s=>`<div class="crow"><b>${esc(s.num)}</b> ${esc(s.slug.slice(0,20))}</div>`).join('')}</div>`:'';
            workBits=`<div class="ccost costable">${gbp(pd.cost)}</div><div class="cteam">${tc}</div>${scChips}${pd.adjItems&&pd.adjItems.length?`<span class="adj" title="Stunt adjustment on this day">${icon('zap')}</span>`:''}`;}
        }
        return `<span class="cd${d.unit==='2nd'?' u2':''}">D${d.num}</span>${d.unit==='2nd'&&MODEL.multiUnit?'<span class="u2tag">2ND UNIT</span>':''}${d.type?`<span class="ctype">${esc(d.type)}</span>`:''}
          ${d.loc?`<div class="cloc" title="${esc(d.loc)}">${esc(d.loc)}</div>`:''}
          <div class="chrs">${esc(d.hours||'')}${d.cams?` · ${d.cams}cam`:''}${d.pages?` · ${esc(d.pages)}p`:''}</div>
          ${workBits}`;
      }).join('<div style="height:5px;border-top:1px dashed var(--line);margin-top:5px"></div>');
      const anyStunt=list.some(d=>APPMODE==='crowd'?CROWD.perDay[d.id]:COST.perDay[d.id]);
      const ids=list.map(d=>d.id).join(',');
      cells+=`<div class="cal-cell shoot ${anyStunt?'stunt':''}${isToday?' todaycell':''}" data-calpop="${esc(ids)}" data-ids="${esc(ids)}"><span class="dnumtxt">${dd}</span>${isToday?'<span class="todaytag">Today</span>':''}${inner}</div>`;
    }
    const trail=(lead+days)%7;
    if(trail)for(let i=trail;i<7;i++)cells+='<div class="cal-cell off"></div>';
    const wl=APPMODE==='crowd'?'crowd':'stunt';
    return `<div class="cal-month"><h3>${MONFULL[mo]} ${y}${monthStunt?`<span class="cnt" style="font-size:10.5px;background:var(--panel2);border:1px solid var(--line2);color:var(--sub);border-radius:20px;padding:2px 10px;font-family:var(--body);letter-spacing:0">${monthStunt} ${wl} day${monthStunt>1?'s':''}</span>`:''}${monthCost?`<span class="sum costable">${gbp(Math.round(monthCost))}</span>`:''}</h3>
      <div class="cal-head"><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div></div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-legend"><span><i style="background:var(--hv-dim);border-left:3px solid var(--hv)"></i>${APPMODE==='crowd'?'Crowd day':'Stunt day'}</span><span><i style="background:var(--panel2);border:1px solid var(--line2)"></i>Shoot day</span><span><i style="background:var(--bg);border:1px solid var(--line)"></i>Non-shoot</span>${MODEL.multiUnit?'<span><i style="border:1px solid var(--dusk)"></i>2nd Unit</span>':''}<span>${icon('zap')} adjustment</span><span style="margin-left:auto">Click a day for details</span></div>
    </div>`;
  }).join('');
  updateCalFilter();
}
function openCalDay(ids){
  const list=ids.split(',').map(id=>COST.dayById[id]).filter(Boolean);
  if(!list.length)return;
  const BD=APPMODE==='crowd'?briefsByDay():null; // brief statuses shown per day
  const d0=list[0];
  const f=fmtDayDate(d0);
  $('#calTitle').innerHTML=d0._date?`${WD[d0._date.getDay()]} ${d0._date.getDate()} ${MO[d0._date.getMonth()]}`:esc(d0.date);
  $('#calSub').textContent=list.length>1?'Two units shooting':'';
  $('#calBody').innerHTML=list.map(d=>{
    const pd=COST.perDay[d.id];
    const peak=dayScheduleSA(d),featP=dayPeakFeat(d),spactP=dayPeakSpact(d);
    let team='';
    if(pd){
      let co=0,sd=0,perf=0;
      for(const p of pd.people){if(p.type==='stuntCoord')co+=p.count;else if(p.type==='stuntDbl')sd+=p.count;else perf+=p.count}
      team=[co?co+' coordinator':'',sd?sd+' doubles':'',perf?perf+' performers':''].filter(Boolean).join(' · ');
    }
    const dnk=noteKey(d,null), dnote=getNote(dnk);
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
        ${pd&&pd.adjItems?pd.adjItems.map(x=>`<span class="code feat">${icon('zap')} ${esc(x.label)} — ${gbp(+x.amt||0)}</span>`).join(''):''}
      </div>
      ${dnote?`<div class="dnote">${icon('pencil')} ${esc(dnote)}</div>`:''}
      ${BD?dayBriefsHTML(d,BD.get(d.id)):''}
      <div class="actions">
        <button class="primary" data-calgo="${esc(d.id)}">Open on day board</button>
        ${APPMODE==='stunt'&&pd?`<button data-costday="${esc(d.id)}" class="costable">Cost breakdown — ${gbp(pd.cost)}</button>`:''}
        ${APPMODE==='crowd'&&CROWD.perDay[d.id]?`<button data-costday="${esc(d.id)}" class="costable">Cost breakdown — ${gbp(Math.round(CROWD.perDay[d.id].cost))}</button>`:''}
        ${APPMODE==='stunt'&&pd?`<button data-raday="${esc(d.id)}">${icon('file')} Risk assessment</button>`:''}
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
    return `<tr><td class="mono"><button class="dchip ${d.unit==='2nd'?'u2':''}" data-goto="${esc(d.id)}">D${d.num}</button></td>${MODEL.multiUnit?`<td>${d.unit==='2nd'?'2nd':'Main'}</td>`:''}<td>${esc(chipDate(d))}</td><td>${mapsLink(d.loc)}</td>
    <td class="num">${co||'—'}</td><td class="num">${sd||'—'}</td><td class="num">${perf||'—'}</td>
    <td class="num money"><button class="dchip" data-costday="${esc(d.id)}">${gbp(pd.cost)}${pd.adjItems&&pd.adjItems.length?' '+icon('zap'):''}</button></td>
    <td><div class="daylist">${d.scenes.filter(sceneHasStunts).map(s=>`<span class="dchip">${esc(s.num)}${s.part?' Pt'+esc(s.part):''}</span>`).join('')}</div></td></tr>`}).join('')}
  </tbody></table></div>
  <div class="note">Every day carrying stunt work — team sizes are heads on the day. Click a cost for the full day breakdown.</div></div>`;
}
let CROWD_VIEW='day'; // 'day' | 'char' — the Crowd tab's two lenses
let CROWD_ORDER='sched'; // 'sched' | 'story' — day-lens row order
// story-order sort for scene numbers. Numbers come in many shapes — "12",
// "7.73A", "24 pt2", and episode/scene composites like "7/18" — so the key is
// the full token stream (every number + every letter run) compared segment by
// segment: 7/18 < 7/20 < 7/27 < 7/48 < 7.73A < 12.
function sceneSortKey(num){
  return (String(num||'').match(/\d+(?:\.\d+)?|[A-Za-z]+/g)||[]).map(t=>/^\d/.test(t)?parseFloat(t):t.toUpperCase());
}
function sceneKeyCmp(a,b){
  for(let i=0;i<Math.max(a.length,b.length);i++){
    const x=a[i],y=b[i];
    if(x===undefined)return -1; if(y===undefined)return 1;
    const xn=typeof x==='number',yn=typeof y==='number';
    if(xn&&yn){if(x!==y)return x-y}
    else if(xn!==yn)return xn?-1:1; // "7" before "7A"'s letter — numbers first
    else{const c=x.localeCompare(y);if(c)return c}
  }
  return 0;
}
// the day-lens table flipped to STORY order: one row per scene carrying crowd,
// sorted by scene number — "what does the script need, and when do we shoot it"
function crowdByStoryHTML(){
  const rows=[];
  for(const d of MODEL.days)for(const s of d.scenes)if(sceneHasCrowd(s))rows.push({d,s});
  rows.sort((a,b)=>sceneKeyCmp(sceneSortKey(a.s.num),sceneSortKey(b.s.num))
    ||String(a.s.part||'').localeCompare(String(b.s.part||''))||a.d.num-b.d.num);
  const hasTier=rows.some(r=>(r.s.featured||[]).length||(r.s.spacts||[]).length);
  const named=s=>[...(s.saChars||[]).map(f=>`<span class="dchip">${esc(f.name||'SA')} · ${f.count}</span>`),
    ...(s.featured||[]).map(f=>`<span class="dchip feat">${esc(f.name||'Featured')} · ${f.count}</span>`),
    ...(s.spacts||[]).map(f=>`<span class="dchip">${esc(f.name||'SPACT')} · ${f.count}</span>`)].join('');
  return `<div class="tablecard"><h3>Crowd in story order<span class="cnt">${rows.length} scenes</span></h3>
  <div class="tscroll"><table><thead><tr><th>Scene</th><th style="width:26%">Set / slug</th><th>Shot on</th><th>Date</th><th>Location</th><th class="num">SA</th>${hasTier?'<th class="num">Featured</th><th class="num">Spacts</th>':''}<th>Characters</th></tr></thead><tbody>
  ${rows.map(({d,s})=>{
    const sa=(s.sa||0)+(s.saChars||[]).reduce((a,f)=>a+f.count,0);
    const feat=(s.featured||[]).reduce((a,f)=>a+f.count,0),sp=(s.spacts||[]).reduce((a,f)=>a+f.count,0);
    return `<tr><td class="mono"><b>${esc(s.num)}${s.part?' Pt'+esc(s.part):''}</b></td>
    <td>${esc((s.slug||'').slice(0,48))}</td>
    <td class="mono"><button class="dchip ${d.unit==='2nd'?'u2':''}" data-goto="${esc(d.id)}">D${d.num}</button></td>
    <td>${esc(chipDate(d))}</td><td>${mapsLink(d.loc)}</td>
    <td class="num"><b>${sa||'—'}</b></td>
    ${hasTier?`<td class="num">${feat||'—'}</td><td class="num">${sp||'—'}</td>`:''}
    <td><div class="daylist">${named(s)}</div></td></tr>`}).join('')}
  </tbody></table></div>
  <div class="note">Every crowd scene in script order — the Shot on chip jumps to its day. Switch back to Schedule order for the shoot-day view.</div></div>`;
}
function renderCrowd(){
  if(APPMODE==='stunt'){renderStuntsByDay();return}
  const toggle=`<div class="crowdview-toggle"><span class="seg" data-crowdview>
    <button data-v="day" class="${CROWD_VIEW==='day'?'on':''}">By shoot day</button>
    <button data-v="char" class="${CROWD_VIEW==='char'?'on':''}">By character</button></span>${CROWD_VIEW==='day'?`<span class="seg" data-crowdorder>
    <button data-o="sched" class="${CROWD_ORDER==='sched'?'on':''}">Schedule order</button>
    <button data-o="story" class="${CROWD_ORDER==='story'?'on':''}">Story order</button></span>`:''}</div>`;
  if(CROWD_VIEW==='char'){$('#viewCrowd').innerHTML=toggle+crowdByCharHTML();return}
  if(CROWD_ORDER==='story'){$('#viewCrowd').innerHTML=toggle+crowdByStoryHTML();return}
  const rows=MODEL.days.filter(d=>d.scenes.some(sceneHasCrowd));
  const hasTier=rows.some(d=>dayPeakFeat(d)||dayPeakSpact(d));
  $('#viewCrowd').innerHTML=toggle+`<div class="tablecard"><h3>Crowd by shoot day<span class="cnt">${rows.length} days</span></h3>
  <div class="tscroll"><table><thead><tr><th>Day</th>${MODEL.multiUnit?'<th>Unit</th>':''}<th>Date</th><th>Location</th><th class="num">Peak SA</th>${hasTier?'<th class="num">Featured</th><th class="num">Spacts</th>':''}<th style="width:40%">Scene requirements</th></tr></thead><tbody>
  ${rows.map(d=>`<tr><td class="mono"><button class="dchip ${d.unit==='2nd'?'u2':''}" data-goto="${esc(d.id)}">D${d.num}</button></td>
    ${MODEL.multiUnit?`<td>${d.unit==='2nd'?'2nd':'Main'}</td>`:''}
    <td>${esc(d.date)}</td><td>${mapsLink(d.loc)}</td>
    <td class="num"><b>${dayScheduleSA(d)||'—'}</b></td>
    ${hasTier?`<td class="num">${dayPeakFeat(d)||'—'}</td><td class="num">${dayPeakSpact(d)||'—'}</td>`:''}
    <td><div class="daylist">${d.scenes.filter(sceneHasCrowd).map(s=>{const n=(s.sa||0)+(s.saChars||[]).reduce((a,f)=>a+f.count,0);return `<span class="dchip">${esc(s.num)} · ${n}</span>`}).join('')}</div></td></tr>`).join('')}
  </tbody></table></div>
  <div class="note">Featured background and Spacts come from the Expanded schedule blocks. Crowd costing uses the PACT/FAA engine in Crowd mode.</div></div>`;
}
// Same crowd data, grouped by character/group instead of by day. Person-days =
// sum of each character's daily peak across the shoot; costed at the flat day
// rate + holiday, matching the breakdown's people tables. The authoritative,
// OT/early-call-aware figure stays the by-shoot-day view.
// character/group × day requirement matrix (daily peaks) — shared by the
// by-character cards and the DOOD grid
function crowdCharData(){
  const tiers={SA:{},Featured:{},SPACT:{}};
  for(const d of MODEL.days){
    const peak={SA:{},Featured:{},SPACT:{}};
    let anon=0;
    for(const s of d.scenes){
      if(s.sa)anon=Math.max(anon,s.sa);
      for(const f of s.saChars||[])peak.SA[f.name||'']=Math.max(peak.SA[f.name||'']||0,f.count);
      for(const f of s.featured||[])peak.Featured[f.name||'']=Math.max(peak.Featured[f.name||'']||0,f.count);
      for(const f of s.spacts||[])peak.SPACT[f.name||'']=Math.max(peak.SPACT[f.name||'']||0,f.count);
    }
    if(anon)peak.SA['']=Math.max(peak.SA['']||0,anon); // anonymous SA joins the unnamed bucket
    for(const tier of ['SA','Featured','SPACT'])for(const [name,cnt] of Object.entries(peak[tier])){
      if(!cnt)continue;
      const key=name||(tier==='SA'?'SA (unnamed)':tier+' (unnamed)');
      const b=tiers[tier][key]||(tiers[tier][key]={code:key,dayCounts:new Map(),heads:0,max:0});
      b.dayCounts.set(d.id,cnt);b.heads+=cnt;b.max=Math.max(b.max,cnt);
    }
  }
  return tiers;
}
function crowdByCharHTML(){
  const R=crowdRates(),hp=1+R.hol;
  const tiers=crowdCharData();
  const card=(tier,label,rate,holLabel)=>{
    const rows=Object.values(tiers[tier]).sort((a,b)=>b.heads-a.heads||a.code.localeCompare(b.code));
    if(!rows.length)return'';
    const sub=rows.reduce((a,p)=>a+p.heads*(rate+ (tier==='SPACT'?gSpHol():rate*R.hol)),0);
    return `<div class="tablecard"><h3>${label}<span class="cnt">${rows.length} character${rows.length===1?'':'s'}</span><span class="sum costable">${gbp(Math.round(sub))}</span></h3>
    <div class="tscroll"><table><thead><tr><th>Character / group</th><th class="num">Days</th><th class="num">Max heads</th><th class="num">Person-days</th><th class="num">Day rates</th><th class="num">${holLabel}</th><th class="num">Total</th><th class="datescol">Dates</th></tr></thead><tbody>
    ${rows.map(p=>{const dr=p.heads*rate;const hol=tier==='SPACT'?p.heads*gSpHol():dr*R.hol;return `<tr><td class="rowlabel">${esc(p.code)}</td><td class="num">${p.dayCounts.size}</td><td class="num">${p.max}</td><td class="num"><b>${p.heads}</b></td><td class="num">${gbp(Math.round(dr))}</td><td class="num">${gbp(Math.round(hol))}</td><td class="num money">${gbp(Math.round(dr+hol))}</td><td class="datescol"><div class="daylist">${dateChips(p)}</div></td></tr>`}).join('')}
    </tbody></table></div></div>`;
  };
  const html=card('SA','Supporting artists',R.sa,'Holiday')+card('Featured','Featured background',R.feat,'Holiday')+card('SPACT','Spacts — Take 3 2026',R.spact,'Holiday (in lieu)');
  return html||`<div class="tablecard"><div class="note">No crowd characters yet — add crowd to scenes on the day board, then switch here to see them grouped by character.</div></div>`;
}

// ---------- DOOD — day out of days ----------
// The classic AD grid: characters/groups down the side, shoot days across,
// how many of each the day needs in the cells. Built live from the schedule.
// Expanding a group shows its individual slots (Nurse 1, Nurse 2…) — that's
// where talent names and booking statuses land when the Laural link arrives.
let DOOD_EXP=new Set();
let DOOD_KIND=store.get('crowdos-dood-kind')||'crowd'; // 'crowd' | 'cast' | 'stunts'
const DOOD_SLOT_CAP=30; // unnamed-SA buckets can be 150 deep — don't render that
// Cast members × shoot day. Each cast member is one body, so a scheduled day is
// a single work mark (W) and person-days for one body = the days worked.
function castCharData(){
  const reg={};
  for(const d of MODEL.days)for(const s of d.scenes)for(const c of s.cast){
    if(c.type!=='cast'&&c.type!=='offCam'&&c.type!=='double')continue;
    const tier=c.type==='cast'?'Cast':c.type==='offCam'?'Off camera':'Double';
    const b=reg[c.code]||(reg[c.code]={code:c.code,label:personName(c.code),tier,badge:c.type==='cast'?'':tier,single:true,dayCounts:new Map(),heads:0,max:1});
    b.dayCounts.set(d.id,1);
  }
  for(const b of Object.values(reg))b.heads=b.dayCounts.size;
  return Object.values(reg);
}
// Stunts × shoot day. Named tokens (coordinator, doubles, performers) are one
// body each → a work mark. The "Stunt Performers" extras block carries head
// counts, so those rows behave like crowd groups (peak per day, expandable).
function stuntCharData(){
  const reg={};
  for(const d of MODEL.days)for(const s of d.scenes)for(const c of s.cast){
    if(!isStuntTok(c))continue;
    const tier=c.type==='stuntCoord'?'Coordinator':c.type==='stuntDbl'?'Double':'Performer';
    const b=reg['t|'+c.code]||(reg['t|'+c.code]={code:c.code,label:personName(c.code),tier,badge:tier,single:true,dayCounts:new Map(),heads:0,max:1});
    b.dayCounts.set(d.id,1);
  }
  for(const d of MODEL.days)for(const s of d.scenes)for(const x of (s.extras||[])){
    const b=reg['x|'+x.name]||(reg['x|'+x.name]={code:x.name,label:x.name,tier:'Additional',badge:'Additional',single:false,dayCounts:new Map(),heads:0,max:0});
    const cnt=Math.max(b.dayCounts.get(d.id)||0,x.count||0);
    b.dayCounts.set(d.id,cnt);b.max=Math.max(b.max,cnt);
  }
  for(const b of Object.values(reg))b.heads=[...b.dayCounts.values()].reduce((a,c)=>a+c,0);
  return Object.values(reg);
}
function renderDoods(){
  const host=$('#viewDoods');if(!host||!MODEL)return;
  const KIND=['crowd','cast','stunts'].includes(DOOD_KIND)?DOOD_KIND:'crowd';
  const seg=`<div class="doodkind"><span class="seg">${[['crowd','Crowd'],['cast','Cast'],['stunts','Stunts']].map(([v,l])=>`<button data-doodkind="${v}" class="${KIND===v?'on':''}">${l}</button>`).join('')}</span></div>`;
  const meta={
    crowd:{dayFn:sceneHasCrowd,nameCol:'Character / group',unit:'group',title:'Day out of days — crowd',
      empty:'No crowd in this schedule yet — add crowd to scenes on the day board and the day-out-of-days grid builds itself.',
      note:'Built live from the schedule — each cell is how many of that character or group the day needs, so a revision can never leave the grid stale. Click a group with more than one head to expand its individual slots; talent names and booking statuses (booked / available / fitting / released) plug into those slots when the Laural booking link lands. Day headers jump to the day board.'},
    cast:{dayFn:s=>s.cast.some(c=>c.type==='cast'||c.type==='offCam'||c.type==='double'),nameCol:'Cast member',unit:'member',title:'Day out of days — cast',
      empty:'No cast in this schedule yet — cast codes on the scenes build this grid automatically.',
      note:'Built live from the schedule — each W marks a day that cast member is scheduled to work, and person-days is the number of shoot days worked. Day headers jump to the day board.'},
    stunts:{dayFn:sceneHasStunts,nameCol:'Stunt role',unit:'role',title:'Day out of days — stunts',
      empty:'No stunts in this schedule yet — stunt performers and doubles on the scenes build this grid automatically.',
      note:'Built live from the schedule — coordinators, doubles and performers are marked W on each day they work; the additional-performers block carries head counts, so a group with more than one head can be expanded into its slots. Day headers jump to the day board.'}
  }[KIND];
  let groups=[];
  if(KIND==='crowd'){
    const tiers=crowdCharData();
    for(const tier of ['SA','Featured','SPACT'])for(const p of Object.values(tiers[tier]))groups.push({...p,tier,label:p.code,badge:tier==='SA'?'':tier,single:false});
  }else if(KIND==='cast'){groups=castCharData();}
  else{groups=stuntCharData();}
  groups.sort((a,b)=>b.heads-a.heads||String(a.code).localeCompare(String(b.code)));
  const days=MODEL.days.filter(d=>d.scenes.some(meta.dayFn));
  if(!groups.length||!days.length){host.innerHTML=seg+`<div class="tablecard"><div class="note">${meta.empty}</div></div>`;return}
  const cell=(g,d)=>{const c=g.dayCounts.get(d.id)||0;return `<td class="dood-cell${c?' w':''}">${c?(g.single?'W':c):''}</td>`};
  const head=`<thead><tr><th class="dood-name">${meta.nameCol}</th><th class="num">Days</th><th class="num">P-days</th>
    ${days.map(d=>`<th class="dood-day${dayIsToday(d)?' today':''}"><button class="dood-dh" data-goto="${esc(d.id)}" data-tip="${esc(chipDate(d))}${d.loc?' · '+esc(d.loc):''} — jump to the day"><b>D${d.num}</b><small>${esc(chipDate(d))}</small></button></th>`).join('')}</tr></thead>`;
  const body=groups.map(g=>{
    const key=KIND+'|'+g.tier+'|'+g.code;
    const open=DOOD_EXP.has(key);
    const expandable=!g.single&&g.max>1&&!String(g.code).includes('(unnamed)');
    let html=`<tr class="dood-row${open?' open':''}" ${expandable?`data-doodtoggle="${esc(key)}"`:''}>
      <td class="dood-name">${expandable?`<span class="dood-chev">${open?'▾':'▸'}</span>`:'<span class="dood-chev"></span>'}${esc(g.label||g.code)}${g.badge?` <span class="ctype">${esc(g.badge)}</span>`:''}</td>
      <td class="num">${g.dayCounts.size}</td><td class="num"><b>${g.heads}</b></td>${days.map(d=>cell(g,d)).join('')}</tr>`;
    if(open&&expandable){
      const n=Math.min(g.max,DOOD_SLOT_CAP);
      for(let i=1;i<=n;i++){
        const slotDays=[...g.dayCounts.values()].filter(c=>c>=i).length;
        html+=`<tr class="dood-slot"><td class="dood-name">${esc(g.code)} ${i}<span class="dood-un">unassigned</span></td><td class="num">${slotDays}</td><td class="num"></td>
          ${days.map(d=>{const c=g.dayCounts.get(d.id)||0;return `<td class="dood-cell${c>=i?' w':''}">${c>=i?'W':''}</td>`}).join('')}</tr>`;
      }
      if(g.max>n)html+=`<tr class="dood-slot"><td class="dood-name dood-more">… ${g.max-n} more slots</td><td class="num"></td><td class="num"></td>${days.map(()=>'<td class="dood-cell"></td>').join('')}</tr>`;
    }
    return html;
  }).join('');
  const colTotals=days.map(d=>groups.reduce((a,g)=>a+(g.dayCounts.get(d.id)||0),0));
  const foot=`<tr class="dood-total"><td class="dood-name">Heads on the day</td><td class="num">${days.length}</td><td class="num">${groups.reduce((a,g)=>a+g.heads,0)}</td>${colTotals.map(c=>`<td class="dood-cell num">${c||''}</td>`).join('')}</tr>`;
  host.innerHTML=seg+`<div class="tablecard dood"><h3>${meta.title}<span class="cnt">${groups.length} ${meta.unit}${groups.length===1?'':'s'} · ${days.length} days</span></h3>
  <div class="doodscroll"><table class="doodtable">${head}<tbody>${body}${foot}</tbody></table></div>
  <div class="note">${meta.note}</div></div>`;
}

// ---------- casting briefs ----------
// The AD's next phase after costing: each named crowd character becomes a
// BRIEF for the agency — "Nurse ×2, female, 5'5"–5'11"" — with the schedule
// facts (dates, hours, locations, scenes, rates) pulled in automatically and
// kept live, so a revision update can never orphan a brief. Continuity is
// first-class: a brief always shows EVERY day its character appears, and
// flags gaps ("6 Jul + 12 Jul — non-consecutive").
let BRIEFS={};
try{BRIEFS=JSON.parse(store.get('crowdos-briefs')||'{}')}catch(e){BRIEFS={}}
// Reference photos ride inside this blob, so a save CAN outgrow the browser's
// storage. store.set swallows that quietly (falling back to memory), which
// would lose the lot on refresh — so verify the write actually landed.
function saveBriefs(){
  const json=JSON.stringify(BRIEFS);
  store.set('crowdos-briefs',json);
  cloudSyncBlob('briefs',BRIEFS);              // production briefs → day_edits
  cloudSyncUser('dbriefs',dashBriefsBlob());   // dashboard briefs → the account
  return (store.get('crowdos-briefs')||'').length===json.length;
}
// the dashboard scratchpad's own briefs, split out of the shared blob — they
// have no production, so they sync to the account instead
function dashBriefsBlob(){
  const out={};
  for(const [k,v] of Object.entries(BRIEFS))if(k.startsWith('d:'))out[k]=v;
  return out;
}
// The briefs area normally belongs to the open production (its namespace, its
// schedule). The dashboard also hosts a STANDALONE copy — a scratchpad for
// trying briefs out or demoing them with no production open at all. Same code,
// same storage file, its own 'd:' namespace and no schedule behind it.
let BRIEF_SCOPE=null; // null = the open production; else {ns,host,standalone}
const BRIEF_SANDBOX={ns:'d:sandbox',host:'#dashBriefs',standalone:true};
function briefNs(){return BRIEF_SCOPE?BRIEF_SCOPE.ns:NS}
function briefStandalone(){return !!(BRIEF_SCOPE&&BRIEF_SCOPE.standalone)}
function briefHostSel(){return briefStandalone()?BRIEF_SCOPE.host:'#viewBriefs'}
// opening/closing an editor: the board jumps to the top, the dashboard's
// scratchpad scrolls its own section into view instead
function briefScrollIntoView(){
  if(!briefStandalone()){window.scrollTo(0,0);return}
  const el=$(briefHostSel());if(el)el.scrollIntoView({block:'start'});
}
// a standalone brief has no schedule to look characters up in
function briefChars(){return briefStandalone()||!MODEL?{chars:[],anonPD:0,anonDays:0}:crowdCharacters()}
// switching between the production briefs and the scratchpad closes whatever
// editor was open — the ids belong to different namespaces
function setBriefScope(scope){
  const to=scope?scope.ns:NS;
  if(to!==briefNs()){BRIEF_OPEN=null;BRIEF_SEL=new Set()}
  BRIEF_SCOPE=scope;
}
function briefKey(id){const ns=briefNs();return (ns?ns+'|':'')+id}
// how many scratchpad briefs exist — for the dashboard section's subtitle
function briefsForDash(){return Object.keys(BRIEFS).filter(k=>k.startsWith(BRIEF_SANDBOX.ns+'|')).length}
let BRIEF_OPEN=null; // brief id being edited, or null = the list
let BRIEF_SEL=new Set(); // brief ids ticked in the list for a batch email
const BRIEF_STATUS={draft:'Draft',progress:'In progress',complete:'Complete'};
// reference photos live inside the brief as small JPEG data-URLs — capped and
// shrunk hard, because everything here also has to fit in localStorage
const BRIEF_PHOTO_MAX=6;
// short, human date for the "Sent" badge (sentAt is an ISO string)
function sentDateShort(iso){try{return new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}catch(e){return ''}}
// every named crowd character in the active schedule, with its full day map —
// the same grouping as Crowd → By character, plus the scene detail a brief needs
function crowdCharacters(){
  const chars=new Map(); // name|tier → {name,tier,days:[{d,count,scenes:[]}],max,heads}
  let anonPD=0;const anonDays=new Set();
  for(const d of MODEL.days){
    const here=new Map(); // name|tier → {count,scenes}
    let anon=0;
    for(const s of d.scenes){
      if(s.sa){anon=Math.max(anon,s.sa)}
      const buckets=[['SA',s.saChars||[]],['Featured',s.featured||[]],['SPACT',s.spacts||[]]];
      for(const [tier,list] of buckets)for(const f of list){
        // a whitespace-only name is still an unnamed crowd group — it must not
        // surface as a blank-titled row waiting for a brief
        const nm=(f.name||'').trim();
        if(!nm)continue;
        const k=nm+'|'+tier;
        const h=here.get(k)||{name:nm,tier,count:0,scenes:[]};
        h.count=Math.max(h.count,f.count);
        h.scenes.push(s);
        here.set(k,h);
      }
    }
    if(anon){anonPD+=anon;anonDays.add(d.id)}
    for(const [k,h] of here){
      const c=chars.get(k)||{name:h.name,tier:h.tier,days:[],max:0,heads:0};
      c.days.push({d,count:h.count,scenes:h.scenes});
      c.max=Math.max(c.max,h.count);c.heads+=h.count;
      chars.set(k,c);
    }
  }
  return {chars:[...chars.values()].sort((a,b)=>b.heads-a.heads||a.name.localeCompare(b.name)),anonPD,anonDays:anonDays.size};
}
// day-list continuity: consecutive shoot dates read as one run; gaps are the
// thing the agency must not miss ("on the 6th AND the 12th")
function briefContinuity(days){
  const dated=days.filter(x=>x.d._date).sort((a,b)=>a.d._date-b.d._date);
  if(dated.length<2)return {runs:[dated.map(x=>x.d)],gaps:0};
  const runs=[[dated[0].d]];
  let gaps=0;
  for(let i=1;i<dated.length;i++){
    const prev=dated[i-1].d._date,cur=dated[i].d._date;
    const diff=Math.round((cur-prev)/86400000);
    if(diff>3){runs.push([dated[i].d]);gaps++}
    else runs[runs.length-1].push(dated[i].d);
  }
  return {runs,gaps};
}
// Dates typed in by hand. A brief can exist BEFORE its character is on the
// schedule ("6 guards on the 11th and 12th" — the scenes aren't broken down
// yet), so every brief can carry its own dates as ISO 'YYYY-MM-DD' strings.
// Schedule dates, when the character IS found, are shown alongside these.
function briefManualDates(b){return [...new Set(b.dates||[])].filter(Boolean).sort()}
function fmtBriefDate(iso){
  const dt=new Date(iso+'T00:00:00');
  if(isNaN(dt.getTime()))return iso;
  return dt.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
}
// how many shoot days a brief covers: the schedule's, or the hand-typed ones
function briefDayCount(b,c){return c?c.days.length:briefManualDates(b).length}
function isoOf(dt){return dt?[dt.getFullYear(),String(dt.getMonth()+1).padStart(2,'0'),String(dt.getDate()).padStart(2,'0')].join('-'):null}
// every date a brief covers — schedule days and hand-typed dates as one set
function briefAllDates(b,c){
  const set=new Set(briefManualDates(b));
  if(c)for(const dd of c.days){const s=isoOf(dd.d._date);if(s)set.add(s)}
  return [...set].sort();
}
// "11–15 Jul · 20 Jul" — consecutive dates read as one run, the way a call
// sheet says it. Cross-month runs spell both months out.
function fmtDateRuns(isoList){
  const ds=[...new Set(isoList)].sort();
  if(!ds.length)return '';
  const runs=[[ds[0]]];
  for(let i=1;i<ds.length;i++){
    const prev=new Date(ds[i-1]+'T00:00:00'),cur=new Date(ds[i]+'T00:00:00');
    if(Math.round((cur-prev)/86400000)===1)runs[runs.length-1].push(ds[i]);
    else runs.push([ds[i]]);
  }
  const mon=iso=>new Date(iso+'T00:00:00').toLocaleDateString('en-GB',{month:'short'});
  const day=iso=>new Date(iso+'T00:00:00').getDate();
  return runs.map(r=>{
    if(r.length===1)return fmtBriefDate(r[0]);
    const a=r[0],z=r[r.length-1];
    return mon(a)===mon(z)?`${day(a)}–${day(z)} ${mon(z)}`:`${fmtBriefDate(a)}–${fmtBriefDate(z)}`;
  }).join(' · ');
}
// one date-chip editor, reused for shoot dates and fitting dates. Adding
// accepts a RANGE (first → last) so a five-day block is two clicks, not five.
function briefDateEditorHTML(id,field,dates,emptyTxt){
  return `<div class="bf-dates">
    ${dates.map(iso=>`<span class="datechip">${esc(fmtBriefDate(iso))}<button data-briefdatedel="${esc(id)}|${esc(field)}|${esc(iso)}" aria-label="Remove ${esc(fmtBriefDate(iso))}" data-tip="Remove this date">✕</button></span>`).join('')}
    ${!dates.length&&emptyTxt?`<span class="cdinfo">${esc(emptyTxt)}</span>`:''}
    <span class="bf-daterange">
      <input type="date" class="bf-dateadd" id="bdFrom-${esc(field)}" aria-label="First date">
      <span class="cdinfo">to</span>
      <input type="date" class="bf-dateadd" id="bdTo-${esc(field)}" aria-label="Last date — leave blank for a single day">
      <button class="tb-btn" data-briefdateadd="${esc(id)}|${esc(field)}">＋ Add</button>
    </span>
    ${dates.length>1?`<button class="tb-btn bf-clear" data-briefdateclear="${esc(id)}|${esc(field)}">Clear all</button>`:''}
  </div>`;
}
// toggle chips — a set of fixed options stored as an array on the brief
function briefChipsHTML(id,field,options,chosen){
  return `<div class="bf-chips">${options.map(o=>`<button class="tagchip${chosen.includes(o)?' on':''}" aria-pressed="${chosen.includes(o)}" data-briefchip="${esc(id)}|${esc(field)}|${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
}
const BRIEF_GENDERS=['Male','Female','Non-binary'];
// the look notes an AD repeats on every period/uniform job — one tap each
const BRIEF_LOOKS=['No modern haircuts','No visible tattoos','No facial piercings','Natural hair colour','Clean shaven','Beards welcome','Own hair (no wigs)','Period-appropriate look'];
function briefsForNs(){
  const ns=briefNs(),pre=ns?ns+'|':'';
  return Object.entries(BRIEFS)
    .filter(([k])=>ns?k.startsWith(pre):!/^[pmd]:/.test(k))
    .map(([k,b])=>({id:ns?k.slice(pre.length):k,key:k,b}));
}
function briefFor(character,tier){
  const want=(character||'').trim().toLowerCase();
  return briefsForNs().find(x=>(x.b.character||'').trim().toLowerCase()===want&&(x.b.tier||'SA')===(tier||'SA'));
}
// rename a crowd character across every scene that carries it — the briefs
// area and the day board are two views of the same names, so a rename in
// either place lands in SCED and flows to the day board, breakdown, crowd
// views and briefs alike
function renameCrowdCharacter(oldName,tier,newName){
  if(!MODEL||!oldName||!newName)return 0;
  const oldL=oldName.trim().toLowerCase();
  newName=newName.trim();
  if(!oldL||!newName||oldL===newName.toLowerCase())return 0;
  let n=0;
  for(const d of MODEL.days)d.scenes.forEach((s,idx)=>{
    const inTier=t=>t==='SPACT'?(s.spacts||[]):t==='Featured'?(s.featured||[]):(s.saChars||[]);
    if(!inTier(tier).some(f=>(f.name||'').toLowerCase()===oldL))return;
    // capture the scene's full crowd state as a SCED entry (the shape the
    // scene editor writes), with the one name swapped
    const chars=[];
    if(s.sa)chars.push({name:'',count:s.sa,tier:'SA',featured:false});
    for(const f of s.saChars||[])chars.push({name:f.name,count:f.count,tier:'SA',featured:false});
    for(const f of s.featured||[])chars.push({name:f.name,count:f.count,tier:'SA',featured:true});
    for(const f of s.spacts||[])chars.push({name:f.name||'',count:f.count,tier:'SPACT',featured:false});
    for(const c of chars){
      const cTier=c.tier==='SPACT'?'SPACT':(c.featured?'Featured':'SA');
      if(cTier===tier&&(c.name||'').trim().toLowerCase()===oldL){c.name=newName;n++}
    }
    SCED[scedKey(sceneNK(d,s,idx))]={chars};
  });
  if(n){saveSced();refreshAll();}
  return n;
}
// the anonymous "N SA" groups, day by day — the queue of naming work.
// Each scene carries its array index so the inline editor can key into SCED.
function unnamedSaDays(){
  const out=[];
  for(const d of MODEL.days){
    let peak=0;const scenes=[];
    d.scenes.forEach((s,idx)=>{if(s.sa){peak=Math.max(peak,s.sa);scenes.push({s,idx})}});
    if(peak)out.push({d,peak,scenes});
  }
  return out;
}
// per-day brief rollup — powers the "✉ 2/3 sent" badges on the day board and
// calendar. Map dayId → {chars:[{name,tier,count,brief|null}],total,briefed,sent}.
// Computed once per render pass (crowdCharacters walks the whole schedule).
function briefsByDay(){
  const map=new Map();
  const {chars}=crowdCharacters();
  for(const c of chars){
    const x=briefFor(c.name,c.tier);
    for(const dd of c.days){
      let e=map.get(dd.d.id);
      if(!e){e={chars:[],total:0,briefed:0,sent:0};map.set(dd.d.id,e)}
      e.chars.push({name:c.name,tier:c.tier,count:dd.count,brief:x||null});
      e.total++;if(x){e.briefed++;if(x.b.sent)e.sent++}
    }
  }
  return map;
}
// one day's character list with brief status — shared by the day-board popover
// and the calendar day modal
function dayBriefsHTML(d,db){
  if(!db)return '';
  const rows=db.chars.map(ch=>{
    const st=ch.brief?(ch.brief.b.status||'draft'):null;
    return `<div class="dbrow">
      <span class="dbname"><b>${ch.count}×</b> ${esc(ch.name)} <small>${esc(ch.tier)}</small></span>
      ${st?`<span class="briefstatus ${esc(st)}">${BRIEF_STATUS[st]||st}</span>`:'<span class="briefstatus draft">No brief yet</span>'}
      ${ch.brief&&ch.brief.b.sent?`<span class="sentbadge" style="pointer-events:none">✓ Sent ${esc(sentDateShort(ch.brief.b.sentAt))}</span>`:''}
      <span style="flex:1"></span>
      <button class="dchip" data-openbriefchar="${esc(ch.name)}|${esc(ch.tier)}|${ch.count}">${ch.brief?'Open brief ›':'＋ Create brief'}</button>
    </div>`;
  }).join('');
  return `<div class="dbriefs"><div class="sl2">Casting briefs — ${db.sent}/${db.total} sent to agency</div>${rows}</div>`;
}
// brief data changed → the day-board and calendar badges are stale; re-render
// them (cheap, and only a crowd-mode concern)
function refreshBriefBadges(){if(APPMODE==='crowd'&&MODEL&&!DASH&&!briefStandalone()){renderDays();renderCalendar();}}
// the day-board badge opens the shared calendar modal with just the briefs list
function openDayBriefs(dayId){
  const d=COST.dayById[dayId];if(!d)return;
  const db=briefsByDay().get(dayId);if(!db)return;
  $('#calTitle').innerHTML=d._date?`${WD[d._date.getDay()]} ${d._date.getDate()} ${MO[d._date.getMonth()]}`:esc(d.date);
  $('#calSub').textContent=`D${d.num}${d.loc?' · '+d.loc:''} — casting briefs`;
  $('#calBody').innerHTML=`<div class="cald">${dayBriefsHTML(d,db)}</div>`;
  $('#calModal').classList.add('open');
}
let BRIEF_ANON_OPEN=new Set(); // day ids with the inline naming expander open
function renderBriefs(){
  // invariant: the scratchpad scope only exists while the dashboard is up.
  // Several paths leave the dashboard without going through hideDash().
  if(BRIEF_SCOPE&&!DASH)setBriefScope(null);
  const solo=briefStandalone();
  const host=$(briefHostSel());if(!host)return;
  if(BRIEF_OPEN){host.innerHTML=briefEditorHTML(BRIEF_OPEN);return}
  const {chars,anonPD,anonDays}=briefChars();
  const list=briefsForNs().sort((a,b)=>(b.b.updatedAt||'').localeCompare(a.b.updatedAt||''));
  const unbriefed=chars.filter(c=>!briefFor(c.name,c.tier));
  const anon=solo?[]:unnamedSaDays();
  const statusPill=x=>`<select class="briefstatus ${esc(x.b.status||'draft')}" data-briefstatus="${esc(x.id)}">${Object.entries(BRIEF_STATUS).map(([v,l])=>`<option value="${v}"${(x.b.status||'draft')===v?' selected':''}>${l}</option>`).join('')}</select>`;
  // six chips then "+n" — a 13-day character mustn't push the row three lines tall
  const dateChips=list=>`<div class="daylist">${list.slice(0,6).map(o=>o.id
    ?`<button class="dchip" data-calpop="${esc(o.id)}">${esc(o.txt)}</button>`
    :`<span class="dchip" data-tip="Typed in by hand">${esc(o.txt)}</span>`).join('')}${list.length>6?`<span class="dchip more" data-tip="${esc(list.slice(6).map(o=>o.txt).join(' · '))}">+${list.length-6}</span>`:''}</div>`;
  const rows=list.map(x=>{
    const c=chars.find(cc=>cc.name.toLowerCase()===(x.b.character||'').trim().toLowerCase()&&cc.tier===(x.b.tier||'SA'));
    const man=briefManualDates(x.b);
    const days=briefDayCount(x.b,c);
    const cont=c?briefContinuity(c.days):{gaps:0};
    return `<tr class="briefrow" data-openbrief="${esc(x.id)}">
      <td class="briefselcell"><input type="checkbox" class="briefsel" data-briefsel="${esc(x.id)}"${BRIEF_SEL.has(x.id)?' checked':''} aria-label="Select ${esc(x.b.character)} for email"></td>
      <td class="rowlabel">${esc(x.b.character)}${c?'':` <span class="briefwarn" data-tip="Not on the schedule — this brief carries its own dates">${icon('warn')}</span>`}</td>
      <td>${esc(x.b.tier||'SA')}</td>
      <td class="num">${x.b.count||(c?c.max:'—')}</td>
      <td class="num">${days||'—'}${cont.gaps?` <span class="briefwarn" data-tip="Non-consecutive days — continuity">${icon('warn')}</span>`:''}</td>
      <td class="datescol">${c?dateChips(c.days.map(x2=>({txt:chipDate(x2.d),id:x2.d.id})))
        :man.length?dateChips(man.map(iso=>({txt:fmtBriefDate(iso)}))):'—'}</td>
      <td class="statuscol">${statusPill(x)}${x.b.sent?`<button class="sentbadge" data-brieftogglesent="${esc(x.id)}" data-tip="Emailed ${esc(sentDateShort(x.b.sentAt))} — click to unmark">✓ Sent</button>`:''}</td>
      <td class="actioncol"><button class="briefdel" data-delbrief="${esc(x.id)}" aria-label="Delete brief" data-tip="Delete this brief">✕</button></td>
    </tr>`;
  }).join('');
  // characters named on the day board show up here BY THEMSELVES — a rename
  // like "SA 40" → "40 Passer-bys" surfaces instantly, no Generate needed.
  // Opening one quietly creates its draft brief.
  const unbriefedRows=unbriefed.map(c=>{
    const cont=briefContinuity(c.days);
    return `<tr class="briefrow unbriefed" data-newbrieffor="${esc(c.name)}|${esc(c.tier)}" data-count="${c.max}">
      <td class="briefselcell"></td>
      <td class="rowlabel">${esc(c.name)}<span class="newtag" data-tip="Named on the day board — click the row to start its brief">new</span></td>
      <td>${esc(c.tier)}</td>
      <td class="num">${c.max}</td>
      <td class="num">${c.days.length}${cont.gaps?` <span class="briefwarn" data-tip="Non-consecutive days — continuity">${icon('warn')}</span>`:''}</td>
      <td class="datescol">${dateChips(c.days.map(x2=>({txt:chipDate(x2.d),id:x2.d.id})))}</td>
      <td class="statuscol"><span class="briefstatus draft">No brief yet</span></td>
      <td class="actioncol"></td>
    </tr>`;
  }).join('');
  const anonRows=anon.map(x=>{
    const open=BRIEF_ANON_OPEN.has(x.d.id);
    // the expander drops the REAL per-scene crowd editor in right here — name
    // SAs without leaving the briefs area; edits commit through the same SCED
    // path the day board uses, so everything stays in step
    const exp=open?`<tr class="anonexp"><td colspan="6"><div class="anonexp-wrap">
      ${x.scenes.map(({s,idx})=>{
        const nk=sceneNK(x.d,s,idx);
        return `<div class="anonexp-scene">
          <div class="anonexp-head"><b>${esc(s.num)}${s.part?' pt'+esc(s.part):''}</b> ${esc(s.slug||'')} <span class="cdinfo">${esc((s.desc||'').slice(0,90))}</span></div>
          <div class="reqarea" data-reqkey="${esc(nk)}">${reqEditorHTML(nk)}</div>
        </div>`;
      }).join('')}
    </div></td></tr>`:'';
    return `<tr class="anonrow" data-anontoggle="${esc(x.d.id)}">
    <td class="mono"><span class="dchip">D${x.d.num}</span></td>
    <td>${esc(chipDate(x.d))}</td>
    <td>${mapsLink(x.d.loc)}</td>
    <td class="num"><b>${x.peak}</b></td>
    <td><div class="daylist">${x.scenes.slice(0,6).map(({s})=>`<span class="dchip" data-tip="${esc((s.slug||'')+' — '+(s.desc||'').slice(0,70))}">${esc(s.num)} · ${s.sa} SA</span>`).join('')}${x.scenes.length>6?`<span class="dchip more">+${x.scenes.length-6}</span>`:''}</div></td>
    <td style="white-space:nowrap"><button class="dchip">${open?'▴ Close':'▾ Name them here'}</button> <button class="dchip" data-goto="${esc(x.d.id)}" data-tip="Jump to this day on the day board">day ›</button></td>
  </tr>`+exp;
  }).join('');
  host.innerHTML=`
  <div class="tablecard"><h3>${solo?'Your briefs':'Casting briefs'}<span class="cnt">${list.length}${unbriefed.length?' of '+(list.length+unbriefed.length)+' characters':''}</span>
    <span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
      ${BRIEF_SEL.size?`<button class="tb-btn briefprimary" data-briefemailsel>${icon('mail')} Email ${BRIEF_SEL.size} brief${BRIEF_SEL.size>1?'s':''} to agency</button>`:''}
      ${unbriefed.length?`<button class="tb-btn" data-briefgen>Generate from schedule (${unbriefed.length})</button>`:''}
      <button class="tb-btn briefprimary" data-briefnew>＋ New brief</button>
    </span></h3>
  ${(list.length||unbriefed.length)?`<div class="tscroll"><table class="briefs-tbl"><thead><tr><th class="briefselcell">${list.length?`<input type="checkbox" id="briefSelAll" aria-label="Select all briefs"${list.length&&list.every(x=>BRIEF_SEL.has(x.id))?' checked':''}>`:''}</th><th>Character</th><th>Talent</th><th class="num">Heads</th><th class="num">Days</th><th class="datescol">Dates</th><th class="statuscol">Status</th><th class="actioncol"></th></tr></thead><tbody>${rows}${unbriefedRows}</tbody></table></div>`
    :solo?`<div class="note" style="text-align:center;padding:34px 16px">Nothing here yet. Press <b>＋ New brief</b> and build one — dates, sizing, fitting, the lot. It stays on this dashboard, tied to no production, and it emails to an agency exactly like a real one.</div>`
    :`<div class="note" style="text-align:center;padding:40px 16px">No briefs yet. Name some crowd characters — on the day board, or right below in the Unnamed SA list — and they'll appear here by themselves.</div>`}
  </div>
  ${anon.length?`<div class="tablecard anoncard"><h3>Unnamed SA — still to be turned into characters<span class="cnt">${anonPD} heads · ${anonDays} days</span></h3>
    <div class="note" style="border-top:none;border-bottom:1px solid var(--line)">The agency can't cast "SA" — go through these one at a time and split them into characters (e.g. "5 SAs" → "3 nurses, 2 doctors"). Naming them on the day board updates the calendar, breakdown, crowd view and this list together, and each new character can then get its own brief above.</div>
    <div class="tscroll"><table><thead><tr><th>Day</th><th>Date</th><th>Location</th><th class="num">Peak SA</th><th>Scenes still saying "SA"</th><th></th></tr></thead><tbody>${anonRows}</tbody></table></div>
  </div>`:''}`;
}
function briefEditorHTML(id){
  const x=briefsForNs().find(y=>y.id===id);
  if(!x){BRIEF_OPEN=null;return '<div class="note">Brief not found.</div>'}
  const b=x.b;
  const solo=briefStandalone();
  const {chars}=briefChars();
  const c=chars.find(cc=>cc.name.toLowerCase()===(b.character||'').trim().toLowerCase()&&cc.tier===(b.tier||'SA'));
  const R=crowdRates();
  const rate=b.tier==='SPACT'?R.spact:R.sa;
  const holTxt=b.tier==='SPACT'?gbp(gSpHol())+' in lieu':(R.hol*100).toFixed(2)+'%';
  const cont=c?briefContinuity(c.days):null;
  const contLine=c&&cont?(cont.gaps
    ?`<span class="briefwarn">${icon('warn')} Non-consecutive:</span> ${cont.runs.map(r=>r.length>1?chipDate(r[0])+'–'+chipDate(r[r.length-1]):chipDate(r[0])).join('  ·  ')} — make the agency aware the same performer${(b.count||c.max)>1?'s are':' is'} needed across the gap (continuity)`
    :`${c.days.length===1?'Single day':'Consecutive run'} — ${cont.runs[0].length>1?chipDate(cont.runs[0][0])+' – '+chipDate(cont.runs[0][cont.runs[0].length-1]):chipDate(cont.runs[0][0])}`):'';
  const schedRows=c?c.days.map(x2=>{
    const d=x2.d;
    // scene + day chips open the day lightbox (scene/day detail in place) —
    // the lightbox itself has "Open on day board" for when that's wanted
    const scenes=x2.scenes.map(s=>`<button class="dchip" data-calpop="${esc(d.id)}" data-tip="${esc((s.slug||'')+(s.desc?' — '+s.desc.slice(0,80):''))}">${esc(s.num)}${s.part?' pt'+esc(s.part):''}</button>`).join(' ');
    return `<tr><td class="mono"><button class="dchip" data-calpop="${esc(d.id)}">D${d.num}</button></td><td>${esc(chipDate(d))}</td><td>${esc(d.hours||'—')}</td><td>${esc(d.type||'—')}</td><td>${mapsLink(d.loc)}</td><td class="num"><b>${x2.count}</b></td><td><div class="daylist">${scenes}</div></td></tr>`;
  }).join(''):'';
  const sceneIntro=c?[...new Set(c.days.flatMap(x2=>x2.scenes.map(s=>s.desc).filter(Boolean)))].slice(0,3):[];
  const manualDates=briefManualDates(b);
  const fitDates=[...new Set(b.fitDates||[])].filter(Boolean).sort();
  const photos=b.photos||[];
  const gender=b.gender||[];
  const looks=b.looks||[];
  // "5 days · 11–15 Jul · 6 people = 30 performer-days" — the line the AD and
  // the agency both check first: how many, on which days, and the total booking
  const allDates=briefAllDates(b,c);
  const nDays=Math.max(briefDayCount(b,c),allDates.length);
  const heads=b.count||(c?c.max:1);
  const dayTally=nDays
    ?`<b>${nDays} day${nDays===1?'':'s'}</b>${allDates.length?' · '+fmtDateRuns(allDates):''} · <b>${heads}</b> × ${esc(b.tier||'SA')} = <b>${heads*nDays}</b> performer-day${heads*nDays===1?'':'s'}`
    :'No dates yet — add them above so the agency knows the booking.';
  const schedLocs=c?[...new Set(c.days.map(x2=>x2.d.loc).filter(Boolean))].join(' · '):'';
  const schedHours=c?[...new Set(c.days.map(x2=>x2.d.hours).filter(Boolean))].join(' · '):'';
  return `
  <div class="briefpage">
    <div class="briefhead">
      <button class="tb-btn" data-briefback>‹ Briefs</button>
      <input class="brieftitle" data-brieffld="character" data-bid="${esc(id)}" data-orig="${esc(b.character)}" value="${esc(b.character)}">
      <select class="briefstatus ${esc(b.status||'draft')}" data-briefstatus="${esc(id)}">${Object.entries(BRIEF_STATUS).map(([v,l])=>`<option value="${v}"${(b.status||'draft')===v?' selected':''}>${l}</option>`).join('')}</select>
      ${b.sent?`<button class="sentbadge" data-brieftogglesent="${esc(id)}" data-tip="Emailed ${esc(sentDateShort(b.sentAt))} — click to unmark">✓ Sent ${esc(sentDateShort(b.sentAt))}</button>`:''}
      <span style="flex:1"></span>
      <button class="tb-btn" data-briefcopy="${esc(id)}">Copy for agency</button>
      <button class="tb-btn briefprimary" data-briefemail="${esc(id)}">${icon('mail')} Email to agency</button>
    </div>
    <div class="briefgrid">
      ${solo?`<div class="tablecard"><h3>Scratchpad brief <span class="cnt">no production</span></h3>
        <div class="note">This one lives on the dashboard, not in a schedule — everything below is typed in by hand. Rates come from the default rate card. It saves in this browser and can be copied or emailed to an agency just like a production's brief.</div>
      </div>`
      :`<div class="tablecard"><h3>From the schedule <span class="cnt">${c?c.days.length+' day'+(c.days.length===1?'':'s'):'not found'}</span></h3>
        ${c?`<div class="tscroll"><table><thead><tr><th>Day</th><th>Date</th><th>Unit hours</th><th>Day type</th><th>Location</th><th class="num">Needed</th><th>Scenes</th></tr></thead><tbody>${schedRows}</tbody></table></div>
        <div class="note"><b>Continuity:</b> ${contLine}</div>`
        :`<div class="note">No scene currently carries the character name “${esc(b.character)}” (${esc(b.tier||'SA')}) — that's fine for a brief the agency needs now. Type the dates in by hand below, or rename the character here to match the schedule / add it to scenes on the day board.</div>`}
      </div>`}
      <div class="tablecard"><h3>Casting requirements</h3>
        <div class="briefform">
          <div class="bf-row">
            <label>How many<input type="number" min="1" data-brieffld="count" data-bid="${esc(id)}" value="${b.count||(c?c.max:1)}" style="width:80px"></label>
            <label>Talent<select data-brieffld="tier" data-bid="${esc(id)}"><option${(b.tier||'SA')==='SA'?' selected':''}>SA</option><option${b.tier==='Featured'?' selected':''}>Featured</option><option${b.tier==='SPACT'?' selected':''}>SPACT</option></select></label>
            <label style="flex:1 1 240px">Character name<input data-brieffld="character" data-bid="${esc(id)}" data-orig="${esc(b.character)}" value="${esc(b.character)}" placeholder="e.g. Guard"></label>
          </div>
          <div class="cdinfo">Rate: ${gbp(rate)}/day + holiday ${holTxt}${b.tier==='Featured'?' + supplementary fees':''} — from ${solo?'the default rate card':"the production's rate card"}</div>
          <div class="bf-block">Dates <span class="cdinfo">${c?'(from the schedule — add any extra dates by hand)':solo?'(pick the dates the agency needs)':'(not on the schedule — pick the dates the agency needs)'}</span>
            ${c?`<div class="bf-dates">${c.days.map(x2=>`<button class="dchip" data-calpop="${esc(x2.d.id)}" data-tip="From the schedule — D${x2.d.num}${x2.d.loc?' · '+esc(x2.d.loc):''}">${esc(chipDate(x2.d))}</button>`).join('')}</div>`:''}
            ${briefDateEditorHTML(id,'dates',manualDates,c?'':'No dates yet.')}
            <div class="bf-tally">${dayTally}</div>
          </div>
          <div class="bf-row">
            <label style="flex:1 1 260px">Location(s)<input data-brieffld="locations" data-bid="${esc(id)}" value="${esc(b.locations!=null?b.locations:'')}" placeholder="${esc(schedLocs||'e.g. Stokenchurch — unit base TBC')}"></label>
            <label style="flex:1 1 200px">Unit hours<input data-brieffld="hours" data-bid="${esc(id)}" value="${esc(b.hours!=null?b.hours:'')}" placeholder="${esc(schedHours||'e.g. 07:00 – 19:00')}"></label>
          </div>
          ${(schedLocs||schedHours)&&!(b.locations||b.hours)?`<div class="cdinfo">Blank uses the schedule’s own${schedLocs?' locations':''}${schedLocs&&schedHours?' and':''}${schedHours?' unit hours':''} — type here only to override them.</div>`:''}
          <label class="bf-block">Description for the agency
            <textarea data-brieffld="desc" data-bid="${esc(id)}" placeholder="e.g. Six male guards, military bearing — running in and lifting an actor…">${esc(b.desc||'')}</textarea></label>
          <label class="bf-block">Scene context <span class="cdinfo">${sceneIntro.length?'(auto-suggested from the scenes — edit freely)':'(optional)'}</span>
            <textarea data-brieffld="context" data-bid="${esc(id)}" placeholder="What's happening in the scene(s)…">${esc(b.context!=null?b.context:sceneIntro.join(' · '))}</textarea></label>
          <label class="bf-block">Any specific skills required <span class="cdinfo">(the agency casts to this — be exact)</span>
            <textarea data-brieffld="skills" data-bid="${esc(id)}" placeholder="e.g. Sword fighting — stage-combat trained, comfortable running in armour…">${esc(b.skills||'')}</textarea></label>
          <label class="bf-block">Measurements &amp; sizing <span class="cdinfo">(goes to the agency with the brief)</span>
            <textarea data-brieffld="measurements" data-bid="${esc(id)}" placeholder="e.g. Height 5'10”–6'0”, chest 38–40, waist 30–34, collar 15–16, shoe 8–11 — costumes already made / to be fitted…">${esc(b.measurements||'')}</textarea></label>
          <div class="bf-block">Gender <span class="cdinfo">(tap any that work — leave all off for “any”)</span>
            ${briefChipsHTML(id,'gender',BRIEF_GENDERS,gender)}
          </div>
          <label class="bf-block">Attributes <span class="cdinfo">(ethnicity, age range, build — what the agency casts to)</span>
            <input data-brieffld="attributes" data-bid="${esc(id)}" value="${esc(b.attributes||'')}" placeholder="e.g. Black, Caucasian or South Asian — 25–45, athletic build" style="width:100%"></label>
          <div class="bf-block">Look restrictions <span class="cdinfo">(tap the ones that apply)</span>
            ${briefChipsHTML(id,'looks',BRIEF_LOOKS,looks)}
            <textarea data-brieffld="lookNotes" data-bid="${esc(id)}" placeholder="Anything else about the look — no dyed hair, no sunglasses tan lines, moustaches welcome…">${esc(b.lookNotes||'')}</textarea>
          </div>
          <div class="bf-block">Photo references <span class="cdinfo">(look / wardrobe references — saved with the brief)</span>
            <div class="bf-photos">
              ${photos.map((p,i)=>`<span class="bf-photo"><img src="${esc(p.url)}" alt="${esc(p.name||'Reference photo')}"><button data-briefphotodel="${esc(id)}|${i}" aria-label="Remove photo" data-tip="Remove this photo">✕</button></span>`).join('')}
              ${photos.length<BRIEF_PHOTO_MAX?`<button class="bf-photoadd" data-briefphotoadd="${esc(id)}">＋ Upload photo</button>`:''}
            </div>
            <span class="cdinfo">${photos.length?`${photos.length} of ${BRIEF_PHOTO_MAX} — the emailed brief lists them by name; attach the picture files to that email yourself.`:'Up to '+BRIEF_PHOTO_MAX+' pictures, shrunk down so they store safely.'}</span>
          </div>
          <label class="bf-block">Reference links & anything else
            <textarea data-brieffld="notes" data-bid="${esc(id)}" placeholder="Photo reference links, wardrobe notes, anything the agency should know…">${esc(b.notes||'')}</textarea></label>
        </div>
      </div>
      <div class="tablecard"><h3>Fitting${fitDates.length?`<span class="cnt">${fitDates.length} date${fitDates.length===1?'':'s'} offered</span>`:''}</h3>
        <div class="briefform">
          <div class="bf-block">Available fitting dates <span class="cdinfo">(the days costume can see them — the agency books into these)</span>
            ${briefDateEditorHTML(id,'fitDates',fitDates,'No fitting dates offered yet.')}
          </div>
          <div class="bf-row">
            <label style="flex:1 1 260px">Fitting location<input data-brieffld="fitLoc" data-bid="${esc(id)}" value="${esc(b.fitLoc||'')}" placeholder="e.g. Costume house, Unit 4 Park Royal, NW10"></label>
            <label style="flex:1 1 200px">Fitting times<input data-brieffld="fitHours" data-bid="${esc(id)}" value="${esc(b.fitHours||'')}" placeholder="e.g. 09:00 – 17:00, 30 min slots"></label>
          </div>
          <label class="bf-block">Fitting notes <span class="cdinfo">(what to bring, who to ask for, paid or unpaid)</span>
            <textarea data-brieffld="fitNotes" data-bid="${esc(id)}" placeholder="e.g. Ask for Costume at reception. Bring own black shoes. Fitting fee paid at the SA half-day rate…">${esc(b.fitNotes||'')}</textarea></label>
        </div>
      </div>
    </div>
  </div>`;
}
// plain-text version the AD can paste into an email / the agency system
function briefText(id){
  const x=briefsForNs().find(y=>y.id===id);if(!x)return '';
  const b=x.b;
  const {chars}=briefChars();
  const c=chars.find(cc=>cc.name.toLowerCase()===(b.character||'').trim().toLowerCase()&&cc.tier===(b.tier||'SA'));
  const R=crowdRates();
  const rate=b.tier==='SPACT'?R.spact:R.sa;
  // a scratchpad brief has no production to name
  const src=briefStandalone()?{}:(SOURCES[ACTIVE]||{});
  const man=briefManualDates(b);
  const fit=[...new Set(b.fitDates||[])].filter(Boolean).sort();
  const allDates=briefAllDates(b,c);
  const nDays=Math.max(briefDayCount(b,c),allDates.length);
  const heads=b.count||(c?c.max:1);
  const schedLocs=c?[...new Set(c.days.map(x2=>x2.d.loc).filter(Boolean))].join(' · '):'';
  const schedHours=c?[...new Set(c.days.map(x2=>x2.d.hours).filter(Boolean))].join(' · '):'';
  const locs=b.locations||schedLocs,hours=b.hours||schedHours;
  const looks=[...(b.looks||[]),...(b.lookNotes?[b.lookNotes]:[])].join('; ');
  const lines=[
    `CASTING BRIEF — ${b.character}`,
    (src.prod||src.title)?`Production: ${src.prod||src.title}`:null,
    `How many: ${heads} (${b.tier||'SA'})`,
    nDays?`Booking: ${nDays} day${nDays===1?'':'s'}${allDates.length?' — '+fmtDateRuns(allDates):''} · ${heads*nDays} performer-day${heads*nDays===1?'':'s'}`:null,
    locs?`Location${locs.includes(' · ')?'s':''}: ${locs}`:null,
    hours?`Unit hours: ${hours}`:null,
    `Rate: ${gbp(rate)}/day + holiday${b.tier==='Featured'?' + supplementary fees':''}`,
    '',
    b.desc?`Requirements: ${b.desc}`:null,
    (b.gender||[]).length?`Gender: ${(b.gender||[]).join(' / ')}`:null,
    b.attributes?`Attributes: ${b.attributes}`:null,
    b.skills?`Specific skills required: ${b.skills}`:null,
    b.measurements?`Measurements / sizing: ${b.measurements}`:null,
    looks?`Look restrictions: ${looks}`:null,
    (b.context!=null?b.context:'')?`Scene: ${b.context}`:null,
    b.notes?`Notes: ${b.notes}`:null,
    (b.photos||[]).length?`Photo references (attached): ${(b.photos||[]).map(p=>p.name||'reference').join(', ')}`:null,
    '',
    'Dates:',
    ...(c?c.days.map(x2=>`  ${chipDate(x2.d)} — D${x2.d.num} · ${x2.d.loc||''} · ${x2.d.hours||''}${x2.d.type?' · '+x2.d.type:''} · ${x2.count} needed · scenes ${x2.scenes.map(s=>s.num).join(', ')}`):[]),
    ...man.map(iso=>`  ${fmtBriefDate(iso)}${c?' — additional':''}`),
    (!c&&!man.length)?'  (dates to be confirmed)':null,
    ...(fit.length||b.fitLoc||b.fitHours||b.fitNotes?[
      '',
      'FITTING',
      fit.length?`  Available dates: ${fmtDateRuns(fit)}`:'  Available dates: to be confirmed',
      b.fitLoc?`  Location: ${b.fitLoc}`:null,
      b.fitHours?`  Times: ${b.fitHours}`:null,
      b.fitNotes?`  Notes: ${b.fitNotes}`:null,
    ]:[]),
  ].filter(l=>l!==null&&l!==undefined)
   // blank strings are deliberate section breaks — collapse runs of them so a
   // sparse brief doesn't email as a page of white space
   .filter((l,i,a)=>l!==''||(i>0&&i<a.length-1&&a[i-1]!==''));
  const cont=c?briefContinuity(c.days):null;
  if(cont&&cont.gaps)lines.push('','CONTINUITY: same performers required across non-consecutive dates — '+cont.runs.map(r=>r.length>1?chipDate(r[0])+'–'+chipDate(r[r.length-1]):chipDate(r[0])).join(' + '));
  return lines.join('\n');
}
// ONE templated email for a set of briefs: builds a mailto: draft (opens in the
// AD's own mail app — the app never sends anything itself) with every brief laid
// out cleanly, marks those briefs Sent, and copies the same text as a backup in
// case the mail client trims a long body. Recipient is left blank so the AD
// addresses it to whichever agency they want.
function briefsEmail(ids){
  ids=[...new Set(ids)].filter(id=>BRIEFS[briefKey(id)]);
  const items=ids.map(id=>briefText(id)).filter(Boolean);
  if(!items.length){setStatus('Tick the briefs you want to email first.');return;}
  const src=SOURCES[ACTIVE]||{};
  const prod=src.prod||src.title||'the production';
  const names=ids.map(id=>(BRIEFS[briefKey(id)]||{}).character).filter(Boolean);
  const subject=`Casting brief${ids.length>1?'s':''} — ${prod}`+(ids.length===1?` — ${names[0]}`:` — ${ids.length} roles`);
  const intro=`Hi,\n\nPlease find ${ids.length>1?ids.length+' casting briefs':'a casting brief'} for ${prod} below. Could you let me know availability and come back with any questions?\n\n`;
  const body=intro+items.join('\n\n————————————————\n\n')+`\n\nMany thanks`;
  // mark the selected briefs sent (the button press is the "sent" signal — the
  // badge can be clicked to unmark if a send is cancelled)
  const now=new Date().toISOString();
  ids.forEach(id=>{const b=BRIEFS[briefKey(id)];if(b){b.sent=true;b.sentAt=now;b.updatedAt=now;}});
  saveBriefs();refreshBriefBadges();
  // clipboard backup FIRST — the mailto hand-off below steals window focus,
  // and Chrome refuses clipboard writes from an unfocused page. That refusal
  // arrives as a promise REJECTION (a try/catch around the call can't see it),
  // so handle it with .then(ok, fail) and keep the status message honest.
  const copied=(navigator.clipboard&&navigator.clipboard.writeText)
    ?navigator.clipboard.writeText(body).then(()=>true,()=>false)
    :Promise.resolve(false);
  // open the mail app via a transient anchor (more reliable than location.href)
  const url='mailto:?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  const a=document.createElement('a');a.href=url;a.style.display='none';document.body.appendChild(a);a.click();a.remove();
  copied.then(ok=>setStatus(`Opening your email app with ${ids.length} brief${ids.length>1?'s':''} — marked as Sent.`
    +(ok?' The full text is also on your clipboard as a backup.':' (Clipboard was blocked — each brief’s Copy button can grab the text if you need it.)')));
  return url;
}
function newBrief(character,tier,count){
  const id='b'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  BRIEFS[briefKey(id)]={character:(character||'').trim()||'New character',tier:tier||'SA',count:count||1,status:'draft',desc:'',notes:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  saveBriefs();
  return id;
}

// brief status pills + the fields that change what the schedule panel shows
// (character rename, tier, count) re-render on commit — free-text areas don't
// ---- crowd breakdown: in-grid editing ----
// Every commit routes through cbdWrite → SCED → refreshAll, so an edit here is
// indistinguishable from one made on the day board.
function cbdParseAddr(a){const p=String(a||'').split('|');return {dayId:p[0],idx:+p[1],line:+p[2]}}
// A head count is people on a call sheet, so it is a whole number and it has a
// sane ceiling. Clamping here (rather than trusting the typed text) keeps a
// slip of the keyboard out of the day totals — and out of every export that
// sums them.
const CBD_MAX_HEADS=100000;
function cbdHeads(val){
  const n=Math.round(+String(val||'').replace(/[^0-9.-]/g,'')||0);
  if(!isFinite(n)||n<=0)return 0;
  return Math.min(n,CBD_MAX_HEADS);
}
function cbdCommit(addr,field,raw){
  const {dayId,idx,line}=cbdParseAddr(addr);
  const d=cbdDayById(dayId);if(!d||!d.scenes[idx])return false;
  const rows=cbdRowsFor(d,idx);
  const val=String(raw||'').replace(/\s+/g,' ').trim();
  if(line>=rows.length){
    // typing on the trailing blank line creates a line — but only once there
    // is something to create. A stray click must not add an empty row.
    if(field==='no'){
      const n=cbdHeads(val);
      if(!n)return false;
      rows.push({name:'',count:n,tier:'SA',featured:false,note:''});
    }else if(field==='name'&&val){
      rows.push({name:val,count:1,tier:'SA',featured:false,note:''});
    }else return false;
  }else{
    const r=rows[line];
    if(field==='no')r.count=cbdHeads(val);
    else if(field==='name')r.name=val;
    else r.note=val;
    // an SA line with no name is the anonymous pool; that's legitimate, but a
    // line emptied of both name and number is a deletion
    if(!r.count)rows.splice(line,1);
  }
  // a new line lands one row further down, so the caret follows it there
  const nextLine=line>=rows.length?rows.length:line;
  cbdWrite(dayId,idx,rows,{addr:`${dayId}|${idx}|${nextLine}`,field});
  return true;
}
// A STUNTS/OTHER edit. Address is `dayId|sceneIdx|src|slot` — see cbOtherAddr.
function cbdCommitOther(addr,field,raw){
  const p=String(addr||'').split('|');
  const dayId=p[0],idx=+p[1],src=p[2],slot=+p[3];
  const d=cbdDayById(dayId);if(!d||!d.scenes[idx])return false;
  const val=String(raw||'').replace(/\s+/g,' ').trim();
  if(!writeSceneOther(d,idx,src,slot,field,val)){
    // nothing was written (a stunt-page line, or an empty stray click) — put the
    // document back exactly as it was rather than leave a typed value on screen
    // that nothing behind it agrees with
    renderCbDoc();
    return false;
  }
  saveSced();
  applySced(MODEL);
  refreshAll();
  // keep the caret where it was left, the same way the crowd column does
  const sel=(window.CSS&&CSS.escape)?CSS.escape(addr):addr;
  const el=document.querySelector(`[data-cbother="${sel}"][data-cbf="${field}"]`);
  if(el){
    el.focus();
    const r=document.createRange();r.selectNodeContents(el);r.collapse(false);
    const s=window.getSelection();s.removeAllRanges();s.addRange(r);
  }
  setStatus('Stunts / other updated — the day board and the stunt page follow.');
  return true;
}
document.addEventListener('focusout',e=>{
  const cell=e.target.closest?e.target.closest('[data-cbaddr],[data-cbother]'):null;
  if(!cell)return;
  const was=cell.dataset.cbwas??'';
  const now=(cell.textContent||'').replace(/\s+/g,' ').trim();
  if(now===was)return;
  if(cell.dataset.cbother)cbdCommitOther(cell.dataset.cbother,cell.dataset.cbf,now);
  else cbdCommit(cell.dataset.cbaddr,cell.dataset.cbf,now);
});
document.addEventListener('focusin',e=>{
  const cell=e.target.closest?e.target.closest('[data-cbaddr],[data-cbother]'):null;
  if(cell)cell.dataset.cbwas=(cell.textContent||'').replace(/\s+/g,' ').trim();
});
document.addEventListener('keydown',e=>{
  const cell=e.target.closest?e.target.closest('[data-cbaddr],[data-cbother]'):null;
  if(!cell)return;
  if(e.key==='Enter'){e.preventDefault();cell.blur();return}
  if(e.key==='Escape'){e.preventDefault();cell.textContent=cell.dataset.cbwas??'';cell.blur();}
});
// Drag across cells to highlight a block, like sweeping a range in a
// spreadsheet. Only active in highlight mode, so ordinary editing (clicking to
// place a caret, selecting text) is untouched the rest of the time.
document.addEventListener('mousedown',e=>{
  if(!CB_HLMODE)return;
  // the row grip is a control, not a surface — it must not start a sweep
  if(e.target.closest&&e.target.closest('.cbhlgrip'))return;
  const cell=e.target.closest&&e.target.closest('#viewCbdoc .cbtable [data-hlk]');
  if(!cell)return;
  e.preventDefault();               // suppress caret / text-selection while painting
  CB_HLDRAG=true;CB_HLSTART=cell;CB_HLDRAGMAP.clear();
  cbHlDragTo(cell);
});
document.addEventListener('mouseover',e=>{
  if(!CB_HLMODE||!CB_HLDRAG)return;
  const cell=e.target.closest&&e.target.closest('#viewCbdoc .cbtable [data-hlk]');
  if(cell)cbHlDragTo(cell);
});
document.addEventListener('mouseup',()=>{if(CB_HLDRAG){CB_HLDRAG=false;CB_HLSTART=null;CB_HLDRAGMAP.clear();saveCbd();}});
document.addEventListener('click',e=>{
  // ---- highlighter controls ----
  // Turn the highlighter pen on/off. Re-rendering shows the palette and puts the
  // table into highlight mode (drag paints instead of editing).
  if(e.target.closest&&e.target.closest('#cbdHlToggle')){CB_HLMODE=!CB_HLMODE;renderCbDoc();return}
  // Pick a pen colour (or the eraser). Just re-ring the swatches — no re-render.
  const pen=e.target.closest&&e.target.closest('[data-cbhlpen]');
  if(pen){
    CB_HLPEN=pen.dataset.cbhlpen;
    document.querySelectorAll('.cbhlsw').forEach(s=>s.classList.toggle('on',s.dataset.cbhlpen===CB_HLPEN));
    return;
  }
  if(e.target.closest&&e.target.closest('#cbdHlClear')){CBD.hl={};saveCbd();applyCbHl();return}
  // In highlight mode, clicking a column header paints (or clears) that whole
  // column — the quickest way to do the original "highlight a column".
  const hth=e.target.closest&&e.target.closest('.cbhth');
  if(hth&&CB_HLMODE&&hth.closest('#viewCbdoc')){
    const i=hth.dataset.col;
    document.querySelectorAll(`#viewCbdoc .cbtable [data-col="${i}"][data-hlk]`).forEach(cbHlPaint);
    saveCbd();
    return;
  }
  // In highlight mode, the grip on the left of a row paints (or clears) that
  // whole row in one click — the row-wise twin of clicking a column heading.
  const grip=e.target.closest&&e.target.closest('.cbhlgrip');
  if(grip&&CB_HLMODE){
    const tr=grip.closest('tr');
    if(tr){tr.querySelectorAll('[data-hlk]').forEach(cbHlPaint);saveCbd();}
    return;
  }
  // And clicking a scene / description / day cell paints the WHOLE scene block —
  // every line of that scene, right across the grid. "Highlight scene 301/5" is
  // one click on 301/5, which is how an AD asks for it.
  const blk=e.target.closest&&e.target.closest('#viewCbdoc .cbscnum,#viewCbdoc .cbdescell,#viewCbdoc .cbdaycell');
  if(blk&&CB_HLMODE){
    const tr=blk.closest('tr'),scene=tr&&tr.getAttribute('data-cbscene');
    if(scene){
      document.querySelectorAll('#viewCbdoc .cbtable tr[data-cbscene]').forEach(row=>{
        if(row.getAttribute('data-cbscene')!==scene)return;
        row.querySelectorAll('[data-hlk]').forEach(cbHlPaint);
      });
      // the block cells themselves live on the first row and are painted with it
      saveCbd();
    }
    return;
  }
  // While the highlighter is on, the table is a painting surface — swallow
  // clicks on in-cell controls (delete, tier, fee) so a sweep never fires them.
  if(CB_HLMODE&&e.target.closest&&e.target.closest('#viewCbdoc .cbtable'))return;
  // "+ Add crowd" — arm the trailing row and drop the caret straight into the
  // count, so the AD just types the number of people. Arming is what makes the
  // button feel like it did something: the button gives way to a live count
  // field with a visible caret and a "people" hint next to it.
  const addbtn=e.target.closest&&e.target.closest('[data-cbadd]');
  if(addbtn){
    cbdArmAdd(addbtn.dataset.cbadd);
    return;
  }
  // Clicking anywhere else on the blank row arms it too — the whole row is the
  // target, not just the button.
  const addcell=e.target.closest&&e.target.closest('.cbadd');
  if(addcell&&!e.target.closest('.cbedit')){
    const addr=addcell.querySelector('[data-cbaddr]')&&addcell.querySelector('[data-cbaddr]').dataset.cbaddr;
    if(addr){cbdArmAdd(addr);return}
  }
  const del=e.target.closest('[data-cbdel]');
  if(del){
    const {dayId,idx,line}=cbdParseAddr(del.dataset.cbdel);
    const d=cbdDayById(dayId);if(!d)return;
    const rows=cbdRowsFor(d,idx);
    if(line<rows.length){rows.splice(line,1);cbdWrite(dayId,idx,rows);}
    return;
  }
  const tier=e.target.closest('[data-cbtier]');
  if(tier){
    const {dayId,idx,line}=cbdParseAddr(tier.dataset.cbtier);
    const d=cbdDayById(dayId);if(!d)return;
    const rows=cbdRowsFor(d,idx);
    const r=rows[line];if(!r)return;
    // SA → Featured → Spact → SA
    if(r.tier==='SPACT'){r.tier='SA';r.featured=false;}
    else if(r.featured){r.tier='SPACT';r.featured=false;}
    else {r.featured=true;
      // Featured background is always a named group — an unnamed one would be
      // indistinguishable from plain background and would silently vanish
      if(!(r.name||'').trim())r.name='Featured';
    }
    cbdWrite(dayId,idx,rows);
    return;
  }
});

// ---- crowd breakdown document controls ----
// Each control re-projects the document, so the page and any export taken
// straight afterwards always agree.
document.addEventListener('change',e=>{
  const above=e.target.closest&&e.target.closest('[data-cbabove]');
  if(above){
    const {dayId,idx,line}=cbdParseAddr(above.dataset.cbabove);
    const d=cbdDayById(dayId);if(!d)return;
    const rows=cbdRowsFor(d,idx);if(!rows[line])return;
    rows[line].fromAbove=above.checked;
    cbdWrite(dayId,idx,rows);
    setStatus(above.checked
      ? 'Marked as the same people as another scene — shown on the document, counted once.'
      : 'Marked as their own people — this line now books its own crowd.');
    return;
  }
  const id=e.target.id;
  if(id==='cbdOther'){CBD.other=e.target.checked;saveCbd();renderCbDoc();return}
  if(id==='cbdWeeks'){CBD.weeks=e.target.checked;saveCbd();renderCbDoc();return}
  if(id==='cbdHide'){CBD.hideEmpty=e.target.checked;saveCbd();renderCbDoc();return}
  if(id==='cbdCosts'){CBD.costs=e.target.checked;saveCbd();renderCbDoc();return}
  if(id==='cbdNotes'){CBD.notes=e.target.checked;saveCbd();renderCbDoc();return}
  if(id==='cbdMerge'){CBD.mergeCrowd=e.target.checked;saveCbd();renderCbDoc();return}
  if(id==='cbdFont'){CBD.font=e.target.value;saveCbd();renderCbDoc();return}
  // the colour picker fires while dragging; save and repaint the small preview
  // live without a full re-render so the swatch feels responsive
  if(id==='cbdAccent'){
    CBD.accent=e.target.value;saveCbd();
    // the preview lives in the setup panel — full page or popup
    const band=document.querySelector('.cbsetup .cbappearband');
    if(band){band.style.background=CBD.accent;band.style.color=cbAccentInk(CBD.accent);}
    document.querySelectorAll('.cbsetup .cbsw').forEach(b=>b.classList.toggle('on',(b.dataset.cbaccent||'').toLowerCase()===(CBD.accent||'').toLowerCase()));
    return;
  }
  // show/hide toggles inside the Columns list mirror the display-option toggles
  if(e.target.matches('[data-cbvis]')){
    const seg=e.target.dataset.cbvis;
    if(seg==='other')CBD.other=e.target.checked;
    if(seg==='cost')CBD.costs=e.target.checked;
    saveCbd();renderCbDoc();return;
  }
  // a supplementary fee belongs to the group, so it is written back through
  // SCED like any other edit — the day board, the cost page, the day
  // calculator and the DOODs all move with it in the same tick
  if(e.target.matches('[data-cbfee]')){
    const [dayId,si,i]=e.target.dataset.cbfee.split('|');
    const d=cbdDayById(dayId);if(!d)return;
    const rows=cbdRowsFor(d,+si);
    const r=rows[+i];if(!r)return;
    r.sup=+e.target.value||0;
    cbdWrite(dayId,+si,rows);
    return;
  }
  if(id==='cbdDate'||id==='cbdSched'){
    if(id==='cbdDate')CBD.date=e.target.value.trim();else CBD.sched=e.target.value.trim();
    saveCbd();
    // retitle in place — a full re-render would steal focus mid-typing
    const host=$('#viewCbdoc'),sub=host&&host.querySelector('.cbsubtitle');
    if(sub)sub.textContent=cbdDoc().subtitle;
    return;
  }
});
document.addEventListener('change',e=>{
  // batch-email selection (checkbox per brief row + the select-all in the head)
  const sel=e.target.closest('[data-briefsel]');
  if(sel){
    if(sel.checked)BRIEF_SEL.add(sel.dataset.briefsel);else BRIEF_SEL.delete(sel.dataset.briefsel);
    renderBriefs();return;
  }
  if(e.target.id==='briefSelAll'){
    BRIEF_SEL=e.target.checked?new Set(briefsForNs().map(x=>x.id)):new Set();
    renderBriefs();return;
  }
  const st=e.target.closest('[data-briefstatus]');
  if(st){
    const b=BRIEFS[briefKey(st.dataset.briefstatus)];
    if(b){b.status=st.value;b.updatedAt=new Date().toISOString();saveBriefs();refreshBriefBadges()}
    st.className='briefstatus '+st.value;
    return;
  }
  const bf=e.target.closest('[data-brieffld]');
  if(bf&&BRIEF_OPEN&&(bf.dataset.brieffld==='character'||bf.dataset.brieffld==='tier'||bf.dataset.brieffld==='count')){
    clearTimeout(window.__briefSaveT);saveBriefs();
    // renaming the brief's character renames it across the SCHEDULE too —
    // day board, calendar, breakdown and crowd views all follow (SCED write)
    if(bf.dataset.brieffld==='character'){
      const b=BRIEFS[briefKey(bf.dataset.bid)];
      const orig=bf.dataset.orig||'';
      if(b&&orig&&b.character&&orig!==b.character){
        const n=renameCrowdCharacter(orig,b.tier||'SA',b.character);
        if(n)setStatus('Renamed “'+orig+'” to “'+b.character+'” across '+n+' scene'+(n===1?'':'s')+' — day board, calendar, breakdown and crowd views updated.');
      }
    }
    renderBriefs();
  }
});

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
    const nk=noteKey(d,s,i), noteVal=getNote(nk);
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
  const cdchart=e.target.closest('[data-cdchartime]');
  if(cdchart){
    const d=COST.dayById[CD_CTX], c=CDAY[cdayKey(d)];
    const i=+cdchart.dataset.i, fld=cdchart.dataset.cdchartime;
    c.chars[i][fld]=cdchart.value||undefined;
    saveCDAY();cdRefreshTotals();
    return;
  }
  const bfld=e.target.closest('[data-brieffld]');
  if(bfld){
    const b=BRIEFS[briefKey(bfld.dataset.bid)];
    if(b){
      const fld=bfld.dataset.brieffld;
      b[fld]=fld==='count'?Math.max(1,+bfld.value||1):bfld.value;
      b.updatedAt=new Date().toISOString();
      clearTimeout(window.__briefSaveT);window.__briefSaveT=setTimeout(saveBriefs,600);
    }
    return;
  }
  // the drag ranges only — the handle-label time pills are also inputs inside
  // .dslider, but they carry data-*time attrs and are handled below; letting
  // this branch catch them overwrote every typed time with the drag position
  const sld=e.target.closest('.dslider .rA, .dslider .rB');
  if(sld){
    const box=sld.closest('.dslider');
    const A=box.querySelector('.rA'),B=box.querySelector('.rB');
    let a=+A.value,b=+B.value;
    if(sld===A&&a>b-30){a=b-30;A.value=a}
    if(sld===B&&b<a+30){b=a+30;B.value=b}
    const pct=v=>((v-SLD_MIN)/(SLD_MAX-SLD_MIN)*100);
    const f=box.querySelector('.fill');f.style.left=pct(a)+'%';f.style.right=(100-pct(b))+'%';
    const callT=m2t(a),wrapT=m2t(b);
    const la=box.querySelector('.la'),lb=box.querySelector('.lb');
    if(la)la.style.left=pct(a)+'%';if(lb)lb.style.left=pct(b)+'%';
    if(box.dataset.slider==='cd'){
      // CD_MOUNT can be stale mid-drag if the board re-rendered underneath —
      // guard every write ("Cannot set properties of null" otherwise)
      const d=COST.dayById[CD_CTX], c=d&&CDAY[cdayKey(d)];
      if(!c||!CD_MOUNT||!CD_MOUNT.isConnected)return;
      c.call=callT;c.wrap=wrapT;saveCDAY();
      const ci=CD_MOUNT.querySelector('[data-cdtime="call"]'),wi=CD_MOUNT.querySelector('[data-cdtime="wrap"]');
      if(ci)ci.value=callT;if(wi)wi.value=wrapT;
      const p2=cdPerHead(c,'SA');
      const hi=CD_MOUNT.querySelector('#cdHrsInfo');if(hi)hi.innerHTML=cdHrsText(c);
      const fl=CD_MOUNT.querySelector('#cdEarlyFlag');
      if(fl){fl.className='cdflag '+((p2.earlyBlocks||p2.earlyTravel)?'on':'');fl.textContent=cdEarlyText(c);}
      cdRefreshTotals();
    }else if(box.dataset.slider==='sd'){
      const host=box.closest('[data-sdday]');
      const d=COST.dayById[host.dataset.sdday];
      const key=adjKey(d);
      const cfg=STUNTCFG[key]||(STUNTCFG[key]=seedStuntCfg(d));
      cfg.call=callT;cfg.wrap=wrapT;saveStuntCfg();
      const ci=host.querySelector('[data-sdtime="call"]'),wi=host.querySelector('[data-sdtime="wrap"]');
      if(ci)ci.value=callT;if(wi)wi.value=wrapT;
      const info=host.querySelector('#sdHrsInfo');if(info)info.textContent=sdHrsText(cfg);
    }else if(box.dataset.slider==='sk'){
      SC.call=callT;SC.wrap=wrapT;saveSC();
      const p=scParts();
      const info=document.querySelector('#skInfo');
      if(info)info.textContent=((cdTimes({call:callT,wrap:wrapT}).hours)).toFixed(2)+'h on the clock'+(p.otFrac?` · OT ${p.otH.toFixed(1)}h @ ${gbp(p.daily/p.otFrac)}/hr${p.earlyH?` · early ${p.earlyH.toFixed(1)}h`:''}${p.dawn?' · dawn call — 5-hour day':''}`:'');
      clearTimeout(window.__skT);window.__skT=setTimeout(renderStuntCalc,350);
    }else if(box.dataset.slider==='dc'){
      DC.call=callT;DC.wrap=wrapT;saveDC();
      const d0=dcWeek().perDay[0];
      const info=document.querySelector('#dcInfo');
      if(info)info.textContent=`${d0.totalHrs.toFixed(1)}h on the clock · ${d0.otHrs.toFixed(1)}h OT${d0.night?' · night work':''}${d0.dawn?' · dawn call — 5h day':''} — applies to each shoot day in the week`;
      clearTimeout(window.__dcSlT);window.__dcSlT=setTimeout(renderDanceCalc,350);
    }else if(box.dataset.slider==='fc'){
      FC.call=callT;FC.wrap=wrapT;saveFC();
      const ci=$('#viewCalc [data-fctime="call"]'),wi=$('#viewCalc [data-fctime="wrap"]');
      if(ci)ci.value=callT;if(wi)wi.value=wrapT;
      renderFcOut();
    }
    return;
  }
  const scr2=e.target.closest('[data-scr]');
  if(scr2&&scr2.dataset.scr!=='del'){
    const r=SROWS[+scr2.dataset.i];
    if(r){r[scr2.dataset.scr]=scr2.dataset.scr==='count'?(+scr2.value||0):scr2.value;
      clearTimeout(window.__scRowT);window.__scRowT=setTimeout(()=>{saveSROWS();if(scr2.dataset.scr!=='name')renderStuntCalc()},scr2.dataset.scr==='name'?500:0);}
    return;
  }
  const dcr2=e.target.closest('[data-dcr]');
  if(dcr2&&dcr2.dataset.dcr!=='del'){
    const r=DROWS[+dcr2.dataset.i];
    if(r){r[dcr2.dataset.dcr]=dcr2.dataset.dcr==='count'?(+dcr2.value||0):dcr2.value;
      clearTimeout(window.__dcRowT);window.__dcRowT=setTimeout(()=>{saveDROWS();if(dcr2.dataset.dcr!=='name')renderDanceCalc()},dcr2.dataset.dcr==='name'?500:0);}
    return;
  }
  if(e.target.matches('[data-dcusage],[data-dctravel],[data-dcmiles]')){
    if(e.target.matches('[data-dcusage]'))DC.usage=+e.target.value||0;
    if(e.target.matches('[data-dctravel]'))DC.travelH=+e.target.value||0;
    if(e.target.matches('[data-dcmiles]'))DC.miles=+e.target.value||0;
    saveDC();
    clearTimeout(window.__dcT);window.__dcT=setTimeout(renderDanceCalc,400);
    return;
  }
  if(e.target.matches('[data-dcheads]')){DC.heads=Math.max(1,+e.target.value||1);saveDC();
    const b=document.querySelector('#fcOut .grossline b');if(b)b.textContent=gbp(dcWeek().gross*DC.heads);return}
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
    const d=COST.dayById[CD_CTX], c=d&&CDAY[cdayKey(d)];
    if(!c||!CD_MOUNT||!CD_MOUNT.isConnected)return;
    c[cdt.dataset.cdtime]=cdt.value||c[cdt.dataset.cdtime];
    saveCDAY();
    syncSlider(CD_MOUNT,c.call,c.wrap);
    const p2=cdPerHead(c,'SA');
    const hi=CD_MOUNT.querySelector('#cdHrsInfo');if(hi)hi.innerHTML=cdHrsText(c);
    const fl=CD_MOUNT.querySelector('#cdEarlyFlag');
    if(fl){fl.className='cdflag '+((p2.earlyBlocks||p2.earlyTravel)?'on':'');fl.textContent=cdEarlyText(c);}
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
      const hasVal=!!ta.value.trim();
      btn.classList.toggle('has',hasVal);
      btn.innerHTML=hasVal?icon('pencil')+' Day note':'＋ Add day note';
      const rm=drow.querySelector('[data-daynote-rm]');
      if(rm)rm.classList.toggle('hidden',!hasVal);
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
    if(opening){
      area.innerHTML=reqEditorHTML(nk);area.classList.remove('hidden');OPEN_REQ=nk;
      // land the cursor where the work is: the first row still missing a
      // character name (that's what a click on "SA 40" is for), else the
      // first field
      const f=[...area.querySelectorAll('[data-rq="cname"]')].find(i=>!i.value.trim())||area.querySelector('input');
      if(f)f.focus();
    }
    else{area.classList.add('hidden');area.innerHTML='';OPEN_REQ=null;}
    return;
  }
  const addc=e.target.closest('[data-rqaddchar]');
  if(addc){
    const holder=addc.closest('.reqedit').querySelector('.reqchars');
    const row=document.createElement('div');row.className='reqrow';
    row.innerHTML=`<input data-rq="ccount" type="number" min="0" value="1"><select data-rq="ctier"><option selected>SA</option><option>SPACT</option></select><input data-rq="cname" value="" placeholder="Character / group (optional)"><label class="reqfeat"><input type="checkbox" data-rq="cfeat"> Featured</label><button data-rqdel="1">✕</button>`;
    holder.appendChild(row);row.querySelector('[data-rq="cname"]').focus();
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
    const row=dn.closest('.daynote-row');
    const ta=row.querySelector('textarea');
    const rm=row.querySelector('[data-daynote-rm]');
    ta.classList.toggle('hidden');
    rm.classList.toggle('hidden',ta.classList.contains('hidden')||!ta.value.trim());
    if(!ta.classList.contains('hidden'))ta.focus();
    return;
  }
  const dnrm=e.target.closest('[data-daynote-rm]');
  if(dnrm){
    saveNote(dnrm.dataset.daynoteRm,'');
    const row=dnrm.closest('.daynote-row');
    const ta=row.querySelector('textarea');
    const btn=row.querySelector('.adddaynote');
    ta.value='';ta.classList.add('hidden');
    dnrm.classList.add('hidden');
    btn.classList.remove('has');btn.textContent='＋ Add day note';
    return;
  }
  const tch=e.target.closest('.tablecard>h3');
  if(tch&&!e.target.closest('button')&&!e.target.closest('a')){tch.parentElement.classList.toggle('closed');return}
  const sseg=e.target.closest('[data-scseg] button');
  if(sseg){SC[sseg.parentElement.dataset.scseg]=sseg.dataset.v;saveSC();renderStuntCalc();return}
  const ck=e.target.closest('[data-calckind]');
  if(ck){CALC_KIND=ck.dataset.calckind;renderFreeCalc();return}
  const fcard=e.target.closest('[data-fccard]');
  if(fcard){
    FC.card=fcard.dataset.fccard;
    FC.tier=FC.card.startsWith('spact')?'SPACT':'SA';
    saveFC();renderFreeCalc();
    return;
  }
  const sccard=e.target.closest('[data-sccard]');
  if(sccard){SC.card=sccard.dataset.sccard;saveSC();renderStuntCalc();return}
  const dstep=e.target.closest('[data-dstep]');
  if(dstep&&!dstep.disabled){
    const k=dstep.dataset.dstep,d=+dstep.dataset.d;
    DC[k]=Math.max(k==='shoot'?1:0,Math.min(k==='shoot'?7:14,(+DC[k]||0)+d));
    saveDC();renderDanceCalc();return;
  }
  const dcseg=e.target.closest('[data-dcseg] button');
  if(dcseg){DC[dcseg.parentElement.dataset.dcseg]=dcseg.dataset.v;saveDC();renderDanceCalc();return}
  if(e.target.closest('#scToRoster')){
    const heads=+(document.querySelector('[data-scheads]')||{}).value||1;
    const nameInp=document.querySelector('[data-scname]');
    SROWS.push({name:(nameInp&&nameInp.value||'').trim(),tier:SC.tier,count:heads});
    saveSROWS();renderStuntCalc();return;
  }
  if(e.target.closest('#scAddRow')){SROWS.push({name:'',tier:'perf',count:1});saveSROWS();renderStuntCalc();return}
  const scr=e.target.closest('[data-scr="del"]');
  if(scr){SROWS.splice(+scr.dataset.i,1);saveSROWS();renderStuntCalc();return}
  if(e.target.closest('#dcToRoster')){
    const heads=+(document.querySelector('[data-dcheads]')||{}).value||1;
    const nameInp=document.querySelector('[data-dcname]');
    DROWS.push({name:(nameInp&&nameInp.value||'').trim(),count:heads});
    saveDROWS();renderDanceCalc();return;
  }
  if(e.target.closest('#dcAddRow')){DROWS.push({name:'',count:1});saveDROWS();renderDanceCalc();return}
  const dcr=e.target.closest('[data-dcr="del"]');
  if(dcr){DROWS.splice(+dcr.dataset.i,1);saveDROWS();renderDanceCalc();return}
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
  const cdct=e.target.closest('[data-cdchartoggle]');
  if(cdct){
    const i=+cdct.dataset.cdchartoggle;
    if(CD_CHAR_OPEN.has(i))CD_CHAR_OPEN.delete(i);else CD_CHAR_OPEN.add(i);
    renderCdModal();
    return;
  }
  const cdctc=e.target.closest('[data-cdchartimeclear]');
  if(cdctc){
    const d=COST.dayById[CD_CTX], c=CDAY[cdayKey(d)];
    const i=+cdctc.dataset.cdchartimeclear;
    delete c.chars[i].call;delete c.chars[i].wrap;
    CD_CHAR_OPEN.add(i);
    saveCDAY();renderCdModal();
    return;
  }
  const cdApply=e.target.closest('[data-cdapplyall]');
  if(cdApply){
    const d0=COST.dayById[CD_CTX], c0=CDAY[cdayKey(d0)];
    let n=0;const applied=[];
    for(const d of MODEL.days){
      if(!CROWD.perDay[d.id]&&!dayScheduleSA(d)&&!d.scenes.some(s=>(s.featured||[]).length||(s.spacts||[]).length))continue;
      const key=cdayKey(d);
      if(!CDAY[key])CDAY[key]=seedCday(d);
      Object.assign(CDAY[key],{shift:c0.shift,fw:c0.fw,ph:c0.ph,call:c0.call,wrap:c0.wrap,travel:c0.travel});
      applied.push(key);
      n++;
    }
    // every day the user explicitly applied timings to is now a real edit
    saveCDAY(applied);cdRecalcApp();renderCdModal();
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
  const sfw=e.target.closest('[data-sdfw] button');
  if(sfw){
    const host=sfw.closest('[data-sdday]');
    const d=COST.dayById[host.dataset.sdday];
    const key=adjKey(d);
    const cfg=STUNTCFG[key]||(STUNTCFG[key]=seedStuntCfg(d));
    cfg.fw=sfw.dataset.v;saveStuntCfg();
    computeCosts();renderSummary();renderDays();renderStunts();renderCalendar();
    openCostModal(d.id);
    return;
  }
  const srst=e.target.closest('[data-sdreset]');
  if(srst){
    const d=COST.dayById[srst.closest('[data-sdday]').dataset.sdday];
    delete STUNTCFG[adjKey(d)];saveStuntCfg();
    computeCosts();renderSummary();renderDays();renderStunts();renderCalendar();
    openCostModal(d.id);
    return;
  }
  const ts=e.target.closest('#travSet');
  if(ts){
    const d=COST.dayById[ts.dataset.adjday];
    const val=+$('#travVal').value||0;
    const mode=ts.dataset.travmode, rate=+ts.dataset.travrate, heads=+ts.dataset.travheads;
    const items=ADJ[adjKey(d)]=(ADJ[adjKey(d)]||[]).filter(x=>!x.travel); // one travel line per day
    if(val>0&&heads>0){
      const amt=mode==='mileage'?val*rate*heads:val*heads;
      const label=mode==='mileage'
        ?`Travel — ${val} mi @ ${gbp(rate)}/mi × ${heads} head${heads===1?'':'s'}`
        :`Travel — train ${gbp(val)} × ${heads} head${heads===1?'':'s'}`;
      items.push({label,amt:Math.round(amt*100)/100,travel:{mode,val}});
    }
    if(!items.length)delete ADJ[adjKey(d)];
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
  // the "counted twice" pill fixes itself: name the day's still-anonymous
  // group of the same size, so 300 + 300 becomes one group of 300
  const fh=e.target.closest('[data-fixhalfnamed]');
  if(fh){
    const d=COST.dayById[fh.dataset.fixhalfnamed];
    const hn=d&&halfNamedSA(d);
    if(hn){
      const n=nameAllAnonSA(d,hn.name,hn.count);
      setStatus(`D${d.num}: named ${hn.count} SA as “${hn.name}” across ${n} scene${n===1?'':'s'} — the day now counts ${hn.count}, not ${hn.counted}. Change any scene back in its own crowd editor if they really are different people.`,{undo:crowdUndo});
    }
    return;
  }
  const sc=e.target.closest('[data-splitcrowd]');
  if(sc){$('#calModal').classList.remove('open');openSplitCrowd(sc.dataset.splitcrowd);return}
  const cb=e.target.closest('[data-costday]');
  if(cb){$('#calModal').classList.remove('open');openCostModal(cb.dataset.costday);return}
  // with the Schedule PDF panel open, clicking a day's header jumps the docked
  // PDF straight to that shoot day (its own buttons/links keep working)
  const dhead=e.target.closest('.daycard[id^="day-"] .dh-top');
  if(dhead&&boardPdfOpen()&&!e.target.closest('button,a,input,select,textarea,label,.dpill,.person,[data-goto],[data-costday],[data-daybriefs],[data-locedit],[data-daynote],[data-fixhalfnamed]')){
    const card=dhead.closest('.daycard[id^="day-"]');
    const d=card&&(MODEL.days||[]).find(x=>x.id===card.id.slice(4));
    if(d){followDayInOriginal(d);return}
  }
  const rb=e.target.closest('[data-raday]');
  if(rb){$('#calModal').classList.remove('open');openRA(rb.dataset.raday);return}
  const wk=e.target.closest('tr.wk-exp');
  if(wk){
    wk.classList.toggle('openrow');
    let n=wk.nextElementSibling;
    while(n&&n.classList.contains('wk-sub')){n.classList.toggle('hidden');n=n.nextElementSibling}
    return;
  }
  const tset=e.target.closest('#tabSettings');
  if(tset){
    const s=SOURCES[ACTIVE];
    if(s&&s.kind)openProdSettings(s.prod||s.title);
    return;
  }
  if(e.target.closest('#sideHelp')){
    // replay the tour that fits where you are — the board one only makes sense
    // with a board on screen. The old one-line summary stays as the fallback
    // for the case where nothing on screen can be pointed at.
    if(!startTour(DASH?'welcome':'board'))
      setStatus('Dashboard lists your productions — open one, then: Day board is the schedule day by day, Crowd/Stunt cost breakdown is the money, Briefs writes to the agency. Calculator and Casting briefs in the sidebar work with nothing open. Any figure with a pencil on it has been edited by hand.');
    return;
  }
  const sset=e.target.closest('#sideSettings');
  if(sset){
    const s=SOURCES[ACTIVE];
    if(!DASH&&s&&s.kind)openProdSettings(s.prod||s.title);
    else if(DASH&&PROD_HOME){PROD_TAB='settings';renderDash();}
    else setStatus('Open one of your productions first — this button then opens that production’s settings (rates, locations, cast). Your account is the button in the top bar.');
    return;
  }
  const t=e.target.closest('[data-view]');
  if(t){
    document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b===t));
    ['days','cal','stunts','crowd','cbdoc','briefs','doods','calc','cast'].forEach(v=>$('#view'+v[0].toUpperCase()+v.slice(1)).classList.toggle('hidden',v!==t.dataset.view));
    if(t.dataset.view==='briefs')renderBriefs();
    if(t.dataset.view==='doods')renderDoods();
    if(t.dataset.view==='cbdoc')renderCbDoc();
    CUR_VIEW=t.dataset.view;syncExpBar();syncToolRow();
    return;
  }
  const exb=e.target.closest('#expBar [data-exp]');
  if(exb){
    const fmt=exb.dataset.exp, dd=exb.closest('details');
    if(dd)dd.open=false;
    if(fmt==='pdf')exportViewPDF(CUR_VIEW);else doExport(CUR_VIEW,fmt);
    return;
  }
  const cvb=e.target.closest('[data-calview]');
  if(cvb){CALVIEW=cvb.dataset.calview;store.set('stuntos-calview',CALVIEW);renderCalendar();return}
  const cvw=e.target.closest('[data-crowdview] button');
  if(cvw){CROWD_VIEW=cvw.dataset.v;renderCrowd();return}
  const cor=e.target.closest('[data-crowdorder] button');
  if(cor){CROWD_ORDER=cor.dataset.o;renderCrowd();return}
  const ddk=e.target.closest('[data-doodkind]');
  if(ddk){DOOD_KIND=ddk.dataset.doodkind;store.set('crowdos-dood-kind',DOOD_KIND);renderDoods();return;}
  const ddt=e.target.closest('[data-doodtoggle]');
  if(ddt&&!e.target.closest('[data-goto]')){
    const k=ddt.dataset.doodtoggle;
    DOOD_EXP.has(k)?DOOD_EXP.delete(k):DOOD_EXP.add(k);
    renderDoods();return;
  }
  // ----- casting briefs -----
  const bnew=e.target.closest('[data-briefnew]');
  if(bnew){BRIEF_OPEN=newBrief();renderBriefs();briefScrollIntoView();const f=$(briefHostSel()+' .brieftitle');if(f){f.focus();f.select()}return}
  const bgen=e.target.closest('[data-briefgen]');
  if(bgen){
    const {chars}=crowdCharacters();
    let n=0;
    for(const c of chars)if(!briefFor(c.name,c.tier)){newBrief(c.name,c.tier,c.max);n++}
    renderBriefs();setStatus(n+' brief'+(n===1?'':'s')+' created from the schedule’s named characters — open each to add casting detail.');
    return;
  }
  // hand-typed dates — the only dates a brief has when its character isn't on
  // the schedule yet, extra dates on top of the schedule when it is, and the
  // fitting dates. A first→last pair adds the whole block in one go.
  const bda=e.target.closest('[data-briefdateadd]');
  if(bda){
    const [bid,field]=bda.dataset.briefdateadd.split('|');
    const from=($('#bdFrom-'+field)||{}).value,to=($('#bdTo-'+field)||{}).value;
    if(!from){setStatus('Pick a date first — add a second one to book a whole block.');return}
    if(to&&to<from){setStatus('The last date is before the first one — swap them round.');return}
    const span=to?Math.round((new Date(to+'T00:00:00')-new Date(from+'T00:00:00'))/86400000)+1:1;
    if(span>120){setStatus(`That's ${span} days — add it in blocks of up to 120 so the brief stays readable.`);return}
    const add=[];
    for(let dt=new Date(from+'T00:00:00'),end=new Date((to||from)+'T00:00:00');dt<=end;dt.setDate(dt.getDate()+1))add.push(isoOf(dt));
    const b=BRIEFS[briefKey(bid)];
    if(b){
      const had=(b[field]||[]).length;
      b[field]=[...new Set([...(b[field]||[]),...add])].sort();
      b.updatedAt=new Date().toISOString();saveBriefs();refreshBriefBadges();
      const n=b[field].length-had;
      setStatus(n?`${n} ${field==='fitDates'?'fitting date':'date'}${n===1?'':'s'} added (${fmtDateRuns(add)}).`:'Those dates were already on the brief.');
    }
    renderBriefs();return;
  }
  const bdd=e.target.closest('[data-briefdatedel]');
  if(bdd){
    const [bid,field,iso]=bdd.dataset.briefdatedel.split('|');
    const b=BRIEFS[briefKey(bid)];
    if(b){b[field]=(b[field]||[]).filter(d=>d!==iso);b.updatedAt=new Date().toISOString();saveBriefs();refreshBriefBadges()}
    renderBriefs();return;
  }
  const bdc=e.target.closest('[data-briefdateclear]');
  if(bdc){
    const [bid,field]=bdc.dataset.briefdateclear.split('|');
    const b=BRIEFS[briefKey(bid)];
    if(b){b[field]=[];b.updatedAt=new Date().toISOString();saveBriefs();refreshBriefBadges()}
    renderBriefs();return;
  }
  // gender / look-restriction toggle chips
  const bch=e.target.closest('[data-briefchip]');
  if(bch){
    const [bid,field,val]=bch.dataset.briefchip.split('|');
    const b=BRIEFS[briefKey(bid)];
    if(b){
      const cur=b[field]||[];
      b[field]=cur.includes(val)?cur.filter(v=>v!==val):[...cur,val];
      b.updatedAt=new Date().toISOString();saveBriefs();
    }
    renderBriefs();return;
  }
  const bpa=e.target.closest('[data-briefphotoadd]');
  if(bpa){BRIEF_PHOTO_TARGET=bpa.dataset.briefphotoadd;$('#briefPhotoInput').click();return}
  const bpd=e.target.closest('[data-briefphotodel]');
  if(bpd){
    const [bid,i]=bpd.dataset.briefphotodel.split('|');
    const b=BRIEFS[briefKey(bid)];
    if(b&&b.photos){b.photos.splice(+i,1);b.updatedAt=new Date().toISOString();saveBriefs()}
    renderBriefs();return;
  }
  const bdel=e.target.closest('[data-delbrief]');
  if(bdel){delete BRIEFS[briefKey(bdel.dataset.delbrief)];BRIEF_SEL.delete(bdel.dataset.delbrief);saveBriefs();refreshBriefBadges();renderBriefs();return}
  // templated agency email — one brief from its editor, or every ticked brief
  const bmail=e.target.closest('[data-briefemail]');
  if(bmail){briefsEmail([bmail.dataset.briefemail]);renderBriefs();return}
  const bmailsel=e.target.closest('[data-briefemailsel]');
  if(bmailsel){briefsEmail([...BRIEF_SEL]);BRIEF_SEL=new Set();renderBriefs();return}
  // the Sent badge is also the undo — a cancelled send shouldn't stay "sent"
  const bts=e.target.closest('[data-brieftogglesent]');
  if(bts){
    const b=BRIEFS[briefKey(bts.dataset.brieftogglesent)];
    if(b){b.sent=!b.sent;if(!b.sent)delete b.sentAt;b.updatedAt=new Date().toISOString();saveBriefs();refreshBriefBadges()}
    renderBriefs();return;
  }
  const bback=e.target.closest('[data-briefback]');
  if(bback){BRIEF_OPEN=null;renderBriefs();briefScrollIntoView();return}
  const bcopy=e.target.closest('[data-briefcopy]');
  if(bcopy){
    const txt=briefText(bcopy.dataset.briefcopy);
    const showFallback=()=>{
      // clipboard blocked (permissions/embedded view) — show the composed
      // text in the editor so it can be selected and copied by hand
      let box=$('#briefCopyBox');
      if(!box){
        box=document.createElement('div');box.id='briefCopyBox';box.className='tablecard';
        box.innerHTML='<h3>Brief text — select all & copy</h3><textarea readonly style="width:100%;border:none;background:var(--panel);color:var(--ink);font-family:inherit;font-size:12.5px;padding:12px 16px;min-height:220px;resize:vertical"></textarea>';
        const page=document.querySelector('.briefpage');if(page)page.appendChild(box);
      }
      const ta=box.querySelector('textarea');ta.value=txt;ta.focus();ta.select();
      setStatus('Couldn’t reach the clipboard — the brief text is below, already selected.');
    };
    const legacy=()=>{
      const ta=document.createElement('textarea');ta.value=txt;ta.style.position='fixed';ta.style.opacity='0';
      document.body.appendChild(ta);ta.select();
      let ok=false;try{ok=document.execCommand('copy')}catch(err){}
      ta.remove();
      if(ok)setStatus('Brief copied — paste it into an email or the agency system.');else showFallback();
    };
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(
      ()=>setStatus('Brief copied — paste it into an email or the agency system.'),legacy);
    else legacy();
    return;
  }
  const brow=e.target.closest('.briefrow[data-openbrief]');
  if(brow&&!e.target.closest('select,button,input,textarea,a,[data-goto]')){
    BRIEF_OPEN=brow.dataset.openbrief;renderBriefs();briefScrollIntoView();return;
  }
  // a character named on the day board but not briefed yet — opening it
  // creates its draft on the spot
  const bnewfor=e.target.closest('.briefrow[data-newbrieffor]');
  if(bnewfor&&!e.target.closest('select,button,input,textarea,a,[data-goto]')){
    const [name,tier]=bnewfor.dataset.newbrieffor.split('|');
    BRIEF_OPEN=newBrief(name,tier,+bnewfor.dataset.count||1);
    renderBriefs();briefScrollIntoView();return;
  }
  // real-location editor: swap one block's scene-location link for an input in
  // place. By default the real location applies to EVERY day at this scene
  // location ("set once, applies everywhere"); tick "only this day" to override
  // a single day. Empty clears it. The pin carries the block's scene text.
  const locEd=e.target.closest('[data-locedit]');
  if(locEd){
    const d=COST.dayById[locEd.dataset.locedit];if(!d)return;
    const blk=locEd.closest('.dlocblk');if(!blk)return;
    const a=blk.querySelector('.dloc');
    if(!a||blk.querySelector('.dloc-input'))return;
    const scene=locEd.dataset.locblk||'';
    const wrap=document.createElement('span');
    wrap.className='dloc-edit-wrap';
    const inp=document.createElement('input');
    inp.className='dloc-input';
    inp.value=resolveRealLoc(NS,d,scene,scene===dayPrimaryScene(d));
    inp.placeholder='Actually shot at… (scene: '+(scene||'—')+')';
    const lbl=document.createElement('label');
    lbl.className='dloc-thisday-lbl';
    lbl.title='By default this location applies to every day of “'+scene+'”. Tick to change only this day.';
    const cb=document.createElement('input');cb.type='checkbox';cb.className='dloc-thisday';
    lbl.appendChild(cb);lbl.appendChild(document.createTextNode(' only this day'));
    wrap.appendChild(inp);wrap.appendChild(lbl);
    a.replaceWith(wrap);
    blk.querySelectorAll('.dloc-real,.dloc-edit').forEach(el=>el.style.display='none');
    inp.focus();inp.select();
    let done=false;
    const commit=(save)=>{
      if(done)return;done=true;
      if(save){
        const v=inp.value.trim();
        if(cb.checked)setRealLocForBlock(d,scene,v);
        else setRealLocEverywhere(scene,v);
      }
      refreshAll();
    };
    inp.addEventListener('keydown',ev=>{if(ev.key==='Enter')commit(true);if(ev.key==='Escape')commit(false)});
    // commit when focus leaves the whole editor (keeps the checkbox clickable)
    wrap.addEventListener('focusout',()=>{setTimeout(()=>{if(!wrap.contains(document.activeElement))commit(true)},0)});
    return;
  }
  // unnamed-SA row → inline naming expander (don't leave the briefs area)
  const anonTgl=e.target.closest('[data-anontoggle]');
  if(anonTgl&&!e.target.closest('a,[data-goto],input,select,textarea')){
    const id=anonTgl.dataset.anontoggle;
    if(BRIEF_ANON_OPEN.has(id))BRIEF_ANON_OPEN.delete(id);else BRIEF_ANON_OPEN.add(id);
    renderBriefs();return;
  }
  const cp=e.target.closest('[data-calpop]');
  if(cp){openCalDay(cp.dataset.calpop);return}
  // day-card brief badge → the day's brief list in the lightbox
  const dbb=e.target.closest('[data-daybriefs]');
  if(dbb){openDayBriefs(dbb.dataset.daybriefs);return}
  // "Open brief ›"/"＋ Create brief" inside the lightbox → the brief editor
  const obc=e.target.closest('[data-openbriefchar]');
  if(obc){
    const [name,tier,count]=obc.dataset.openbriefchar.split('|');
    const x=briefFor(name,tier);
    BRIEF_OPEN=x?x.id:newBrief(name,tier,+count||1);
    $('#calModal').classList.remove('open');
    $('#tabBriefs').click();
    renderBriefs();window.scrollTo(0,0);
    return;
  }
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
  if(g){gotoDay(g.dataset.goto);return}
  const am=e.target.closest('[data-appmode]');
  if(am){setAppMode(am.dataset.appmode);return}
  const s=e.target.closest('[data-src]');
  if(s)setActive(+s.dataset.src);
});
document.addEventListener('change',e=>{
  const sdc=e.target.closest('[data-sdday]');
  if(sdc&&(e.target.closest('.dslider input')||e.target.closest('[data-sdtime]')||e.target.id==='sdNight')){
    const d=COST.dayById[sdc.dataset.sdday];
    const key=adjKey(d);
    const cfg=STUNTCFG[key]||(STUNTCFG[key]=seedStuntCfg(d));
    const tEl=e.target.closest('[data-sdtime]');
    if(tEl)cfg[tEl.dataset.sdtime]=tEl.value||cfg[tEl.dataset.sdtime];
    if(e.target.id==='sdNight')cfg.night=e.target.checked;
    saveStuntCfg();
    computeCosts();renderSummary();renderDays();renderStunts();renderCalendar();
    openCostModal(d.id);
    return;
  }
  if(e.target.matches('[data-cdsup]')){
    const d=COST.dayById[CD_CTX], c=CDAY[cdayKey(d)];
    c.chars[+e.target.dataset.cdsup].sup=+e.target.value||0;
    saveCDAY();renderCdModal();
    return;
  }
  if(e.target.matches('[data-fcph]')){FC.ph=e.target.checked;saveFC();renderFreeCalc();return}
  if(e.target.matches('[data-scins]')){SC.ins=e.target.checked;saveSC();renderStuntCalc();return}
  if(e.target.matches('[data-scnight]')){SC.night=e.target.checked;saveSC();renderStuntCalc();return}
  if(e.target.matches('[data-dcpen]')){DC.pens[e.target.dataset.dcpen]=e.target.checked;saveDC();renderDanceCalc();return}
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
// "Jump to day…" — works from any tab: switches to the day board, opens the
// past-days drawer if the target is archived, scrolls there and flashes it
function gotoDay(id){
  document.querySelector('.tabs button[data-view="days"]').click();
  $('#fltStunt').checked=false;applyFilters();
  const el=document.getElementById('day-'+id);
  if(el){
    const drawer=el.closest('details.pastdrawer');
    if(drawer&&!drawer.open){drawer.open=true;PAST_OPEN=true;}
    // instant, not smooth — a jump can cross the whole schedule (tens of
    // thousands of pixels); a hard cut + the landing flash beats a long glide
    el.scrollIntoView({block:'start',behavior:'instant'});
    el.classList.remove('jumpflash');void el.offsetWidth; // restart the animation on repeat jumps
    el.classList.add('jumpflash');setTimeout(()=>el.classList.remove('jumpflash'),1700);
  }
}
$('#dayJump').addEventListener('change',e=>{if(e.target.value){gotoDay(e.target.value);e.target.value='';}});
$('#tglCosts').addEventListener('change',e=>document.body.classList.toggle('hide-costs',!e.target.checked));
['rPerf','rHol','rIns','rInsDays','rUse','rCoord','rSDRate','rSDDays','rSDOn','cSA','cSpact','cHol','cOTday','cOTnight','cET','cTravelA','cTravelB','cSpactNight','cSpactHol','cSpactET'].forEach(id=>{
  const fn=()=>{if(!MODEL)return;computeCosts();computeCrowdCosts();renderSummary();renderDays();renderStunts();renderCrowd();if(!$('#viewDoods').classList.contains('hidden'))renderDoods();renderCalendar();renderCast();renderFreeCalc()};
  // (renderFreeCalc branches to the stunt calculator in StuntOS mode)
  $('#'+id).addEventListener('input',fn);
  $('#'+id).addEventListener('change',fn);
});

// ---------- app mode (StuntOS / CrowdOS) ----------
function setAppMode(m){
  APPMODE=m;
  store.set('stuntos-appmode',m);
  document.querySelectorAll('#modeBar button').forEach(b=>b.classList.toggle('on',b.dataset.appmode===m));
  document.title='Laural — '+(m==='crowd'?'Crowd':'Stunt');
  // rate bars stay hidden permanently: rates are edited in Production
  // Settings only. The inputs remain in the DOM — the engine reads them and
  // applyRateVals still writes the resolved card values into them.
  $('#tabBreakdown').textContent=m==='crowd'?'Crowd cost breakdown':'Stunt cost breakdown';
  $('#fltLabel').textContent=m==='crowd'?'Crowd days only':'Stunt days only';
  $('#tabCrowd').textContent=m==='crowd'?'Crowd':'Stunts by day';
  // Briefs (casting briefs) and Doods (day-out-of-days) are CrowdOS concerns
  $('#tabBriefs').classList.toggle('hidden',m!=='crowd');
  $('#tabDoods').classList.toggle('hidden',m!=='crowd');
  $('#tabCbDoc').classList.toggle('hidden',m!=='crowd');
  if(m!=='crowd'&&(!$('#viewBriefs').classList.contains('hidden')||!$('#viewDoods').classList.contains('hidden')||!$('#viewCbdoc').classList.contains('hidden')))document.querySelector('.tabs button[data-view="days"]').click();
  /* Calculator tab lives in both modes — content branches on APPMODE */
  if(MODEL){computeCosts();computeCrowdCosts();renderSummary();renderDays();renderStunts();renderCrowd();if(!$('#viewDoods').classList.contains('hidden'))renderDoods();renderCalendar();renderCast();renderFreeCalc();if(!$('#viewCbdoc').classList.contains('hidden'))renderCbDoc();}
  // the dashboard is mode-specific (crowd vs stunt figures, "no requirement")
  if(DASH)renderDash();
}

// ---------- sources ----------
function renderSrcBar(){
  // the old top schedule strip was superseded by the sidebar; kept as a no-op
  // so its callers (setActive, addSource) don't need to change
  const el=$('#srcBar');
  if(el)el.innerHTML=SOURCES.map((s,i)=>`<button data-src="${i}" class="${i===ACTIVE?'on':''}" data-tip="${esc(s.title)}"><span class="k">${s.model.days.length}d</span>${esc(s.short)}</button>`).join('');
}
function setActive(i){
  ACTIVE=i;MODEL=SOURCES[i].model;NS=SOURCES[i].ns||'';
  applyTheme(SOURCES[i].colour);
  // a production brand colour overrides the schedule-colour highlight
  {const pr=SOURCES[i].prod&&PRODS[SOURCES[i].prod];if(pr&&pr.info&&pr.info.accent)applyAccent(pr.info.accent);}
  renderSrcBar();
  BRIEF_OPEN=null; // briefs are per-production — never show another production's editor
  BRIEF_ANON_OPEN=new Set();
  $('#tabSettings').classList.toggle('hidden',!SOURCES[i].kind); // demo schedules have no production settings
  computeCosts();computeCrowdCosts();renderSummary();renderDays();renderStunts();renderCrowd();if(!$('#viewDoods').classList.contains('hidden'))renderDoods();renderCalendar();renderCast();renderFreeCalc();if(!$('#viewCbdoc').classList.contains('hidden'))renderCbDoc();
  if($('#viewBriefs')&&!$('#viewBriefs').classList.contains('hidden'))renderBriefs();
  updateCrumbs();
  syncBoardPdfBtn();
  syncRecheckBtn();
  refreshBoardPdf();
  window.scrollTo(0,0);
}
// grey the toggle out when the active schedule has no stored original
function syncBoardPdfBtn(){
  const btn=$('#btnBoardPdf');if(!btn)return;
  const has=sourceHasFiles(SOURCES[ACTIVE]);
  btn.classList.toggle('muted',!has);
  btn.dataset.tip=has?'Open the original schedule PDF alongside the board to cross-check':'This schedule has no original PDF stored to cross-check against';
}
function addSource(model,title,short,activate=true,opts={}){
  if(!model.days.length&&!opts.allowEmpty){setStatus('No shoot days found in that schedule.');return false}
  const colour=opts.colour||detectColour(title,model._raw||'');
  SOURCES.push({model,title,short:short||title,colour,kind:opts.kind,text:opts.text,unit:opts.unit,ns:opts.ns,cloudId:opts.cloudId,createdAt:opts.createdAt,prod:opts.prod,version:opts.version,schedDate:opts.schedDate,format:opts.format,rateCard:opts.rateCard||null,current:!!opts.current,aiModel:opts.aiModel||null,docKind:opts.docKind||null,pdfFiles:opts.pdfFiles||null});
  if(activate)setActive(SOURCES.length-1);else renderSrcBar();
  return true;
}
// status messages live in the Laural-style floating dark bar, bottom centre.
// They auto-dismiss (fade out) so a "5 people removed" note doesn't sit there
// forever. Pass {undo:fn} to show an Undo button; {sticky:true} to keep it up.
let STATUS_TIMER=null, STATUS_FADE=null, STATUS_UNDO_FN=null;
function setStatus(msg,opts){
  opts=opts||{};
  clearTimeout(STATUS_TIMER);clearTimeout(STATUS_FADE);
  const bar=$('#statusBar');
  $('#status').textContent=msg;
  STATUS_UNDO_FN=(msg&&typeof opts.undo==='function')?opts.undo:null;
  const ub=$('#statusUndo');if(ub)ub.classList.toggle('hidden',!STATUS_UNDO_FN);
  if(!bar)return;
  bar.classList.remove('fadeout');
  bar.classList.toggle('hidden',!msg);
  if(msg&&!opts.sticky){
    const ms=opts.timeout||(STATUS_UNDO_FN?9000:5500);
    STATUS_TIMER=setTimeout(dismissStatus,ms);
  }
}
function dismissStatus(){
  const bar=$('#statusBar');
  if(!bar||bar.classList.contains('hidden'))return;
  bar.classList.add('fadeout');
  STATUS_FADE=setTimeout(()=>{
    bar.classList.add('hidden');bar.classList.remove('fadeout');
    $('#status').textContent='';STATUS_UNDO_FN=null;
    const ub=$('#statusUndo');if(ub)ub.classList.add('hidden');
  },280);
}
// ---------- crowd undo ----------
// Crowd moves / copies / removes / splits all funnel through the SCED override
// store, so an undo is just "restore the SCED snapshot taken before the edit".
// Each mutating helper captures a snapshot BEFORE it changes anything and calls
// registerCrowdUndo once the change lands.
const CROWD_UNDO=[];
function registerCrowdUndo(snapshot,label){
  CROWD_UNDO.push({snapshot,label});
  if(CROWD_UNDO.length>50)CROWD_UNDO.shift();
}
function crowdUndo(){
  const u=CROWD_UNDO.pop();
  if(!u)return false;
  try{SCED=JSON.parse(u.snapshot);}catch(_){return false;}
  saveSced();refreshAll();
  setStatus('Undone — '+u.label+(CROWD_UNDO.length?'. Undo again for the previous change.':'.'),
    CROWD_UNDO.length?{undo:crowdUndo}:{});
  return true;
}
// ---------- breadcrumbs (Laural: Productions › Victura › Main Unit · Pink) ----------
function updateCrumbs(){
  const el=$('#topCrumbs');if(!el)return;

  const seg=[];
  seg.push('<button data-crumb="dash">Productions</button>');
  if(DASH){
    if(DASH_PAGE==='calc')seg.push('<span class="sep">›</span><span class="cur">Calculator</span>');
    else if(DASH_PAGE==='briefs')seg.push('<span class="sep">›</span><span class="cur">Casting briefs</span>');
    else if(PROD_HOME)seg.push('<span class="sep">›</span><span class="cur">'+esc(PROD_HOME)+'</span>');
  }else{
    const s=SOURCES[ACTIVE];
    if(s&&s.kind){
      const prod=s.prod||s.title;
      seg.push('<span class="sep">›</span><button data-crumb="prod" data-prod="'+esc(prod)+'">'+esc(prod)+'</button>');
      seg.push('<span class="sep">›</span><span class="cur">'+esc((s.unit||'Main')+(s.unit==='Full'?' Schedule':' Unit'))+(revLabel(s)?' · '+esc(revLabel(s)):'')+'</span>');
    }else if(s){
      seg.push('<span class="sep">›</span><span class="cur">'+esc(s.short||s.title)+'</span>');
    }
  }
  el.innerHTML=seg.join('');
}
document.addEventListener('click',e=>{
  const c=e.target.closest('#topCrumbs [data-crumb]');
  if(!c)return;
  if(c.dataset.crumb==='dash'){PROD_HOME=null;showDash('home');}
  else if(c.dataset.crumb==='prod'){PROD_HOME=c.dataset.prod;PROD_TAB='schedules';showDash();}
});

// ---------- add production: two doors in, one data shape ----------
// Manual days and parsed days are identical ShootDay objects — same cost
// engine, same views. User-added productions persist in localStorage until
// per-production Supabase storage lands.
function refreshAll(){
  computeCosts();computeCrowdCosts();renderSummary();renderDays();renderStunts();renderCrowd();if(!$('#viewDoods').classList.contains('hidden'))renderDoods();renderCalendar();renderCast();renderFreeCalc();if(!$('#viewCbdoc').classList.contains('hidden'))renderCbDoc();
  if($('#viewBriefs')&&!$('#viewBriefs').classList.contains('hidden'))renderBriefs();
}
function saveUserSources(){
  store.set('crowdos-sources',JSON.stringify(SOURCES.filter(s=>s.kind).map(s=>({kind:s.kind,title:s.title,short:s.short,unit:s.unit||'Main',text:s.text||null,prod:s.prod||null,version:s.version||null,schedDate:s.schedDate||null,colour:s.colour||null,format:s.format||null,rateCard:s.rateCard||null,current:!!s.current,createdAt:s.createdAt||null,aiModel:s.aiModel||null,docKind:s.docKind||null,ns:s.ns||null,cloudId:s.cloudId||null,pdfFiles:s.pdfFiles||null}))));
}
function saveManualDays(){
  const map={};
  for(const s of SOURCES){
    const md=s.model.days.filter(d=>d.manual);
    if(md.length)map[s.title]=md.map(d=>({num:d.num,date:d.date,loc:d.loc,hours:d.hours,type:d.type,unit:d.unit,scenes:(d.scenes||[]).map(sc=>({num:sc.num,part:sc.part,ie:sc.ie,tod:sc.tod,scriptDay:sc.scriptDay,pages:sc.pages,slug:sc.slug,desc:sc.desc}))}));
  }
  store.set('crowdos-manualdays',JSON.stringify(map));
}
function sortDays(model){model.days.sort((x,y)=>((x._date&&x._date.getTime())||0)-((y._date&&y._date.getTime())||0)||x.num-y.num)}
// a full Scene object from just a scene number — crowd/stunts get added via
// the same inline per-scene editors as parsed scenes
function sceneStub(num,unit){
  return {num:String(num||'').trim(),part:'',ie:'',slug:'',tod:'',scriptDay:'',pages:'',unit:unit||'Main',
    desc:'',sa:0,veh:0,pod:false,podVeh:0,cast:[],extras:[],spacts:[],saChars:[],featured:[],vehNames:[],tags:[]};
}
function reviveDay(rec){
  const d={sr:'',ss:'',cams:'',scenes:[],pages:'',loc:'',hours:'',type:'',...rec,manual:true};
  d.id=(d.unit==='2nd'?'U':'M')+d.num;
  // a stored scene may be a bare {num} stub or carry descriptive fields from
  // the scene editor (part/ie/tod/scriptDay/pages/slug/desc) — either way,
  // overlay it onto a fresh stub so cast/crowd fields always start zeroed
  // (those are SCED-derived and never stored)
  d.scenes=(d.scenes||[]).map(sc=>Object.assign(sceneStub((sc&&sc.num)||sc,d.unit),sc||{}));
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
  // a hand-built schedule spanning both units is a combined "Full Schedule"
  if(s.model.days.some(d=>(d.unit||'Main')==='Main')&&s.model.days.some(d=>d.unit==='2nd')){
    s.model.multiUnit=true;if(s.unit&&s.unit!=='Full')s.unit='Full';
  }
}

// ---------- door 2: schedule import (same extraction as the prototype) ----------
async function pdfToText(buf){
  // the LEGACY build — the modern one uses JS features Safari lacks
  // ("undefined is not a function" on upload in Safari)
  const pdfjsLib=await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
  const doc=await pdfjsLib.getDocument({data:buf,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/'}).promise;
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
// ---------- schedule glossary (what notation means; production null = global) ----------
// Answers from the review screen's clarifying questions. Injected into every AI
// read so the same question is never asked twice. A production-scoped answer
// overrides the global one for that production only.
let GLOSSARY=[];
try{GLOSSARY=JSON.parse(store.get('crowdos-glossary')||'[]')}catch(e){GLOSSARY=[]}
function saveGlossaryLocal(){store.set('crowdos-glossary',JSON.stringify(GLOSSARY))}
function glossaryFor(prod){
  const map=new Map();
  for(const g of GLOSSARY)if(!g.production)map.set((g.term||'').toLowerCase(),g);
  if(prod)for(const g of GLOSSARY)if(g.production===prod)map.set((g.term||'').toLowerCase(),g);
  return [...map.values()].map(g=>({term:g.term,answer:g.answer}));
}
function upsertGlossary(term,answer,production){
  const key=term.toLowerCase(),p=production||null;
  const i=GLOSSARY.findIndex(g=>(g.term||'').toLowerCase()===key&&(g.production||null)===p);
  if(i>=0)GLOSSARY[i]={term,answer,production:p};else GLOSSARY.push({term,answer,production:p});
  saveGlossaryLocal();
  if(CLOUD.session)cloud.upsertGlossaryTerm(term,answer,p).catch(()=>{});
}
// AI-assisted read (prototype): hand the extracted text to the server route,
// which asks Claude Opus 4.8 for the same days/scenes shape. The user's
// glossary rides along so known notation is applied silently; anything the
// model can't interpret comes back as clarifying questions for the review
// screen. Returns {model,questions} or throws with a readable message.
// A production can switch AI reading off entirely (Production Settings →
// General) — its schedule text then never leaves the app.
const aiBlocked=n=>!!(n&&PRODS[n]&&PRODS[n].noAI);
const AI_OFF_MSG='AI reading is switched off for this production (Production Settings → General), so nothing was sent out.';
async function aiParse(text,prod,images,feedback){
  if(aiBlocked(prod))throw new Error(AI_OFF_MSG);
  const tok=CLOUD.session&&CLOUD.session.access_token;
  const res=await fetch('/api/parse-schedule',{method:'POST',headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:JSON.stringify({text,glossary:glossaryFor(prod),...(images&&images.length?{images}:{}),...(feedback?{feedback}:{})})});
  let data={};try{data=await res.json()}catch(e){}
  if(!res.ok||!data.model)throw new Error(data.error||('AI read failed ('+res.status+')'));
  return {model:data.model,questions:data.questions||[]};
}
// Photographed schedule pages → downscaled JPEG base64 for the AI reader.
// Phones produce 4000px+ HEIC/JPEG; the model reads a 1568px page perfectly
// well, and Vercel caps the request body, so shrink client-side.
async function imageToB64(file){
  let bmp;
  try{bmp=await createImageBitmap(file)}
  catch(e){throw new Error(file.name+' isn’t a format this browser can read — take a screenshot of it, or export as JPG/PNG, and upload that.')}
  const scale=Math.min(1,1568/Math.max(bmp.width,bmp.height));
  const w=Math.round(bmp.width*scale),h=Math.round(bmp.height*scale);
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  cv.getContext('2d').drawImage(bmp,0,0,w,h);
  bmp.close&&bmp.close();
  const url=cv.toDataURL('image/jpeg',0.82);
  return {media_type:'image/jpeg',data:url.slice(url.indexOf(',')+1)};
}
async function handleImages(files){
  try{
    if(aiBlocked(CURPROD)){setStatus('Photographed schedules need the AI reader, and '+AI_OFF_MSG);return}
    if(files.length>12){setStatus('Upload at most 12 photographed pages at once.');return}
    setStatus('Preparing '+files.length+' image'+(files.length===1?'':'s')+'…');
    const images=[];
    for(const f of files)images.push(await imageToB64(f));
    aiBusy(true,'Reading photographed schedule with AI…');
    let r;
    try{r=await aiParse('',CURPROD,images)}
    catch(err){aiBusy(false);setStatus('Couldn’t read those photos ('+err.message+').');return}
    aiBusy(false);
    const title=files[0].name.replace(/\.[a-z0-9]+$/i,'').replace(/[_]+/g,' ');
    const m=prepModel(JSON.parse(JSON.stringify(r.model)),'Main');
    openImportConfirm({m,text:'',title,aiModel:r.model,mergeStats:null,isDetail:!m.days.some(d=>d.date),docKind:'photo',questions:r.questions,filesLabel:[...files].map(f=>f.name).join(' + '),images});
  }catch(err){aiBusy(false);console.error(err);setStatus('Couldn’t read those images ('+err.message+').')}
}
// One entry point for every upload: PDFs go through the text pipeline,
// images go to the AI reader. Mixing the two in one go is ambiguous — say so.
function handleUploads(files){
  const list=[...files];
  const pdfs=list.filter(f=>/pdf$/i.test(f.type)||/\.pdf$/i.test(f.name));
  const imgs=list.filter(f=>/^image\//i.test(f.type)||/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name));
  if(pdfs.length&&imgs.length){setStatus('Upload PDFs or photos, not both at once.');return}
  if(imgs.length)return handleImages(imgs);
  if(pdfs.length)return handlePDFs(pdfs);
  setStatus('That file type isn’t supported — upload a PDF or photos (JPG/PNG) of the schedule.');
}
// Build a costable model from a source/import record: prefer a stored AI reading
// (aiModel), else run the deterministic regex parser honouring the format flag.
function modelFrom(rec,unit){
  const base=rec.aiModel?JSON.parse(JSON.stringify(rec.aiModel)):parseWith(rec.format||'auto',rec.text||'');
  const m=prepModel(base,unit);
  m._raw=(rec.text||'').slice(0,1000)+' '+(rec.title||'');
  return m;
}
// Full-screen "AI is reading" overlay with an elapsed-time counter, so a slow
// read (a minute+ on a fresh API account) clearly reads as working, not stuck.
let AI_TIMER=null;
function aiBusy(on,msg){
  let ov=document.getElementById('aiOverlay');
  if(on){
    if(!ov){
      ov=document.createElement('div');ov.id='aiOverlay';ov.className='ai-overlay';
      ov.innerHTML='<div class="ai-box"><div class="ai-spin"></div><div class="ai-msg"></div><div class="ai-sub">Reading every shoot day and scene. Large schedules can take a minute or two — this is normal.</div><div class="ai-elapsed"></div></div>';
      document.body.appendChild(ov);
    }
    ov.querySelector('.ai-msg').textContent=msg||'Reading with AI…';
    ov.querySelector('.ai-elapsed').textContent='0s elapsed';
    ov.classList.add('open');
    const t0=Date.now();clearInterval(AI_TIMER);
    AI_TIMER=setInterval(()=>{const e=ov.querySelector('.ai-elapsed');if(e)e.textContent=Math.round((Date.now()-t0)/1000)+'s elapsed'},1000);
  }else{
    clearInterval(AI_TIMER);AI_TIMER=null;
    if(ov)ov.classList.remove('open');
  }
}
function fillImpRateSelect(sel){
  $('#impRate').innerHTML='<option value="">PACT/FAA 2026 (defaults)</option>'+Object.keys(cardsFor('sa')).map(n=>`<option>${esc(n)}</option>`).join('');
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
  if(typeof updateMergeRow==='function')updateMergeRow();
}
// A "spine" document carries dated shoot-day banners (a one-liner, or a Full
// Fat that includes dates). A "detail" document is scene-only — e.g. a Full Fat
// with no shoot days. The spine gives the day board its dates; the detail
// enriches each scene's crowd/stunt breakdown.
function classifySchedule(text){
  if(/End\s+Day\s*#?\s*\d+\s*\|/i.test(text))return 'spine';
  if(/DAY\s*#?\s*\d+\s*[-–—:]?\s*(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)/i.test(text))return 'spine';
  const m=parseAny(text);
  if(m.days.length&&m.days.some(d=>d.date))return 'spine';
  return 'detail';
}
async function handlePDFs(files){
  try{
    if(files.length>2){setStatus('Upload at most two PDFs at once — a one-liner plus its Full Fat.');return}
    const docs=[];
    for(const f of [...files]){
      setStatus('Opening '+f.name+'…');
      const buf=await f.arrayBuffer();
      const text=await pdfToText(buf);
      docs.push({file:f,text,kind:classifySchedule(text)});
    }
    try{window.__crowdosLastExtract=docs[docs.length-1].text}catch(e){} // debugging
    let spineDoc=docs.find(d=>d.kind==='spine')||null;
    let detailDoc=docs.find(d=>d.kind==='detail')||null;
    if(docs.length===2&&(!spineDoc||!detailDoc)){
      setStatus('Those two files look like the same kind of schedule. Upload a one-liner together with its Full Fat, or import them one at a time.');
      return;
    }
    const primary=spineDoc||detailDoc;
    const text=primary.text;
    const title=primary.file.name.replace(/\.pdf$/i,'').replace(/[_]+/g,' ');
    setStatus('Breaking the schedule down…');

    // one-liner vs Full Fat is about LAYOUT (a Full Fat can carry dates and
    // still be a Full Fat); spine vs detail is about whether it has shoot days.
    // A Full Fat repeats "Cast Members"/"Background Actors" per SCENE BLOCK —
    // a one-liner mentions them at most once (its cast-list page).
    const layoutOf=d=>((d.text.match(/Cast Members|Background Actors/gi)||[]).length>5)?'fullfat':'oneliner';
    // clarifying questions gathered from every AI read this import
    const questions=[],qSeen=new Set();
    const addQs=list=>{for(const q of list||[]){const k=(q.term||'').toLowerCase();if(!k||qSeen.has(k))continue;qSeen.add(k);questions.push(q);}};

    // spine: quick parser first, AI fallback (same hybrid as before)
    let m=null,aiModel=null;
    if(spineDoc){
      m=parseAny(spineDoc.text);
      if(!m.days.length){
        if(aiBlocked(CURPROD)){setStatus('The built-in parser found no shoot days, and '+AI_OFF_MSG+' Try the format flag on the import dialog, or build the days manually.');return}
        setStatus('The quick parser found no shoot days — asking AI to read it…');
        aiBusy(true,'Reading schedule with AI…');
        try{const r=await aiParse(spineDoc.text,CURPROD);aiModel=r.model;addQs(r.questions);}
        catch(err){aiBusy(false);setStatus('Couldn’t read that schedule ('+err.message+').');return}
        aiBusy(false);
      }
    }
    // detail: always an AI read (scene-only docs are what the quick parser can't do)
    let detailModel=null;
    if(detailDoc){
      if(aiBlocked(CURPROD)){setStatus('Full Fat scene detail needs the AI reader, and '+AI_OFF_MSG);return}
      aiBusy(true,spineDoc?'Reading Full Fat detail with AI…':'Reading schedule with AI…');
      try{const r=await aiParse(detailDoc.text,CURPROD);detailModel=r.model;addQs(r.questions);}
      catch(err){aiBusy(false);setStatus('Couldn’t read the detail schedule ('+err.message+').');return}
      aiBusy(false);
    }
    // pair upload → merge the detail onto the spine before the dialog
    let mergeStats=null;
    if(spineDoc&&detailModel){
      const r=mergeDetail(aiModel||m,detailModel);
      aiModel=r.model;mergeStats=r.stats;
    }
    if(!spineDoc)aiModel=detailModel; // detail-only upload
    const docKind=spineDoc&&detailDoc?'merged':layoutOf(primary);
    openImportConfirm({m:prepModel(JSON.parse(JSON.stringify(aiModel||m)),'Main'),text,title,aiModel,mergeStats,isDetail:!spineDoc,docKind,questions,filesLabel:docs.map(d=>d.file.name).join(' + '),pdfFiles:docs.map(d=>d.file)});
  }catch(err){console.error(err);setStatus('Couldn’t read that PDF ('+err.message+').')}
}
// The import-confirm dialog, shared by every upload kind (PDF text, PDF
// pairs, photographed pages). Fills the metadata guesses and opens the modal;
// nothing is saved until the review page's Publish.
function openImportConfirm({m,text,title,aiModel,mergeStats,isDetail,docKind,questions,filesLabel,images,pdfFiles}){
  if(!m.days.length&&!isDetail){setStatus('No shoot days found in that schedule — send it to us and we’ll teach the parser its format.');return}
  const guess=guessImportMeta(text||'',title);
  PENDING_IMPORT={text:text||'',title,aiModel,mergeStats,isDetail,docKind,questions,files:filesLabel,images:images||null,pdfFiles:pdfFiles||null};
  IMP_EDIT=null;$('#impGo').textContent='Import schedule';$('#impTitle')&&($('#impTitle').textContent='Import schedule');
  $('#impSub').textContent=filesLabel;
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
  $('#impColour').value=THEMES[vLow]?vLow:detectColour(title,(text||'').slice(0,1000));
  fillImpRateSelect('');
  const scenes=m.days.reduce((a,d)=>a+d.scenes.length,0);
  let info=m.days.length+' shoot days · '+scenes+' scenes found'+(aiModel?' · read by AI':'');
  if(mergeStats)info=m.days.length+' shoot days · Full Fat detail merged onto '+mergeStats.matched+'/'+mergeStats.spineScenes+' scenes';
  if(isDetail)info=scenes+' scenes found — no shoot dates in this file';
  $('#impInfo').textContent=info;
  updateMergeRow();
  $('#impModal').classList.add('open');
  setStatus('');
}
// A detail-only upload (Full Fat with no dates) can merge into the current
// schedule of the chosen production/unit instead of importing standalone.
function mergeTarget(){
  const prod=resolveImpProd();if(!prod)return null;
  const revs=unitsOf(prod).get($('#impUnit').value||'Main');
  if(!revs||!revs.length)return null;
  const cur=currentRev(revs);
  return cur&&cur.s.kind==='pdf'?cur:null;
}
function updateMergeRow(){
  const row=$('#impMergeRow');if(!row)return;
  const on=!!(PENDING_IMPORT&&PENDING_IMPORT.isDetail&&IMP_EDIT==null&&mergeTarget());
  row.style.display=on?'':'none';
  if(on)$('#impMerge').value='merge';
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
      if(s.kind==='pdf'&&(s.text||s.aiModel)&&(newUnit!==s.unit||newFormat!==(s.format||'auto'))){
        s.unit=newUnit;s.format=newFormat;
        s.model=modelFrom(s,newUnit); // respects s.aiModel if the schedule was read by AI
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
  // Detail-only upload merging into the current schedule of prod/unit —
  // review the enriched model against what's on the board, then update in place.
  const tgt=P.isDetail&&$('#impMergeRow').style.display!=='none'&&$('#impMerge').value==='merge'?mergeTarget():null;
  if(tgt){
    const s=tgt.s;
    const spineRaw=s.aiModel?JSON.parse(JSON.stringify(s.aiModel)):parseWith(s.format||'auto',s.text||'');
    const r=mergeDetail(spineRaw,P.aiModel);
    const next=prepModel(JSON.parse(JSON.stringify(r.model)),s.unit||'Main');
    openReview({
      prev:s,nextModel:next,mergeStats:r.stats,
      ctx:{mode:'merge',prod:s.prod||s.title,unit:s.unit||'Main',version:revLabel(s),docKind:'merged',files:P.files||P.title,questions:P.questions||[],text:P.text,rawModel:r.model,viewer:{pdfs:P.pdfFiles,images:P.images}},
      onAccept(){
        s.aiModel=r.model;
        s.docKind='merged';
        s.model=modelFrom(s,s.unit||'Main');
        restoreManualDays(s);
        saveUserSources();
        // keep the Full Fat detail document alongside the schedule's original
        const mergedFiles=filesFromPending(P);
        if(mergedFiles.length)addSourceFiles(s,mergedFiles);
        if(CLOUD.session&&s.cloudId)cloud.updateProduction(s.cloudId,s).then(x=>{if(x.error)setStatus('Cloud save failed: '+x.error.message)});
        const idx=SOURCES.indexOf(s);
        if(!DASH&&ACTIVE===idx)setActive(idx);else{renderSidebar();if(DASH)renderDash();}
        logProdEvent(s.prod||s.title,'schedule','Full Fat detail merged into '+revLabel(s)+' ('+(s.unit||'Main')+') — '+r.stats.matched+'/'+r.stats.spineScenes+' scenes enriched');
        setStatus('Full Fat detail merged — '+r.stats.matched+' of '+r.stats.spineScenes+' scenes enriched.');
      },
    });
    PENDING_IMPORT=null;
    $('#impModal').classList.remove('open');
    return;
  }
  // rate card is the PRODUCTION's — set it only when creating a new production.
  // NB the production record itself is created inside commit(), NOT here —
  // cancelling the review must leave nothing behind (an empty "production"
  // used to appear on the dashboard after a cancelled import).
  const rcName=isNew?$('#impRate').value:'';
  const newCard=rcName&&cardsFor('sa')[rcName]?{name:rcName,vals:cardsFor('sa')[rcName]}:null;
  // aiModel (if the schedule was read by AI) takes precedence over the format flag
  let m=modelFrom({aiModel:P.aiModel,format,text:P.text,title:P.title},unit);
  if(!m.days.length){setStatus('No shoot days found with that format — try a different Format setting.');return}
  // the review page can edit the revision label, day dates/locations, and
  // delete days before publishing. Edits mutate `raw` — the model that gets
  // stored — so they survive reloads. For a regex-parsed schedule (no aiModel)
  // an edited copy is promoted to aiModel, else reload would re-parse the text
  // and silently undo the edits.
  const raw=P.aiModel||JSON.parse(JSON.stringify({days:m.days,castMap:m.castMap||{},notes:m.notes||[]}));
  const ctx={mode:'new',prod,unit,version,docKind:P.docKind||null,files:P.files||P.title,questions:P.questions||[],text:P.text,rawModel:raw,
    // the original upload, kept for the review page's side-by-side viewer
    viewer:{pdfs:P.pdfFiles,images:P.images},
    // regex-parsed uploads get a background AI cross-read on the review page;
    // the pending snapshot lets "Use the AI reading" re-drive this whole flow
    crossCheck:!P.aiModel&&!!(P.text&&P.text.trim()),pending:P};
  // A new revision of an existing unit: diff against the current revision
  // (scenes anchor the match), stitch already-shot days into the stored model
  // so the production keeps its full timeline, and plan the work carry-over.
  // Everything is display-only until Publish.
  const revs=!isNew&&unitsOf(prod).get(unit);
  const prevCur=revs&&revs.length?currentRev(revs):null;
  const prevSrc=prevCur&&prevCur.s.kind==='pdf'?prevCur.s:null;
  let carry=null;
  if(prevSrc){
    // Cast numbers are a permanent production label — a new schedule that omits
    // the cast list still means the same people. Carry forward every code→name
    // we already know (all prior revisions + any names set in Production
    // Settings), letting the new document's own names win where it gives them,
    // so an issue that drops the list doesn't blank the board's names.
    const prevCast={};
    for(const [code,rec] of Object.entries(collectCast(prod)))if(rec&&rec.character)prevCast[code]=rec.character;
    const ownCastCount=Object.keys(raw.castMap||{}).length;
    const carriedCast=carryCastMap(prevCast,raw.castMap||{});
    // any names added beyond the new doc's own → we must persist `raw` on reload
    ctx.castCarried=Object.keys(carriedCast).length>ownCastCount;
    // the headline case: the new document printed no cast list at all, so every
    // name is inherited — worth calling out in the change summary
    ctx.castListMissing=ownCastCount===0&&Object.keys(carriedCast).length>0;
    raw.castMap=carriedCast;
    m.castMap=carriedCast;
    // manual (hand-added) days aren't part of either document — they carry
    // separately via the manual-days map, so keep them out of the diff
    const prevDoc={...prevSrc.model,days:prevSrc.model.days.filter(d=>!d.manual)};
    const diff=diffRevisions(prevDoc,m);
    const recs=carriedDayRecords(diff,revLabel(prevSrc)||'previous revision');
    if(recs.length){
      raw.days=[...recs,...raw.days];
      const m2=prepModel(JSON.parse(JSON.stringify(raw)),unit);
      m2._raw=m._raw;
      m=m2;
    }
    const manualPlains=prevSrc.model.days.filter(d=>d.manual).map(d=>(d.unit||'Main')+'|'+d.num);
    carry={diff,plan:planRevisionCarry(prevSrc,m,diff,manualPlains),stitched:recs.length,castListMissing:ctx.castListMissing,castCount:Object.keys(carriedCast).length};
    ctx.carry=carry;ctx.stitched=recs.length>0;
  }
  const commit=()=>{
    ensureProd(prod,isNew?{rateCard:newCard,colour}:{colour});
    const rateCard=(PRODS[prod]&&PRODS[prod].rateCard)||null;
    // carried cast names live only on `raw`; if the upload was regex-parsed we
    // must store `raw` (not re-parse the text on reload) or the names blank again
    const storeAi=(P.aiModel||ctx.edited||ctx.stitched||ctx.castCarried)?raw:null;
    if(addSource(m,P.title,P.title.slice(0,18),true,{kind:'pdf',text:P.text,unit,ns:'p:'+P.title,prod,version:ctx.version,schedDate,colour,format,rateCard,aiModel:storeAi,docKind:P.docKind||null})){
      const src=SOURCES[SOURCES.length-1];
      src.createdAt=new Date().toISOString();
      src.sessionNew=true;
      // a new upload becomes the current revision for its unit: clear any
      // manual "make current" override on its siblings so newest-by-date wins
      for(const s of SOURCES)if(s!==src&&s.kind&&(s.prod||s.title)===(src.prod||src.title)&&(s.unit||'Main')===(src.unit||'Main')){s.current=false;if(CLOUD.session&&s.cloudId)cloud.updateProduction(s.cloudId,s).catch(()=>{});}
      // hand-added days follow the production, not the document — copy them
      // to the new revision's title so restoreManualDays picks them up
      if(prevSrc&&prevSrc.title!==src.title){
        try{
          const mdMap=JSON.parse(store.get('crowdos-manualdays')||'{}');
          if((mdMap[prevSrc.title]||[]).length&&!(mdMap[src.title]||[]).length){
            mdMap[src.title]=JSON.parse(JSON.stringify(mdMap[prevSrc.title]));
            store.set('crowdos-manualdays',JSON.stringify(mdMap));
          }
        }catch(e){}
      }
      restoreManualDays(src);
      let carriedN=0;
      if(carry&&carry.plan)carriedN=applyRevisionCarry(carry.plan,src.ns);
      // the board rendered when the source was activated, BEFORE the carry —
      // re-render so carried scene edits/notes show immediately, not on the
      // next incidental refresh
      if(carriedN)refreshAll();
      saveUserSources();
      // keep the original document: cache it locally now (offline-safe) and,
      // when signed in, upload it to account storage once the row id exists
      const originalFiles=filesFromPending(P);
      if(originalFiles.length)cacheSourceFilesLocal(src,originalFiles);
      if(CLOUD.session)cloud.insertProduction(src).then(({id,error})=>{
        if(error){src.cloudFailed=true;setStatus('Cloud save failed: '+error.message)}
        // always resync once the id exists — ANY edit made while the insert
        // was in flight (carry or by hand) was skipped by the per-source sync
        else{src.cloudId=id;resyncNsMaps(src.ns);pushAllBlobs();if(originalFiles.length)uploadSourceFilesToCloud(src,originalFiles);}
      });
      logProdEvent(prod,'schedule','Published '+((ctx.version||'').toUpperCase()||'revision')+' as current for '+unit+' Unit — '+m.days.length+' days'+(carry&&carry.stitched?' · '+carry.stitched+' shot day'+(carry.stitched===1?'':'s')+' kept from '+revLabel(prevSrc):'')+(carriedN?' · '+carriedN+' edits carried over':'')+(ctx.castListMissing?' · cast names carried from '+(revLabel(prevSrc)||'previous revision')+' (no cast list in this document)':'')+(P.mergeStats?' · Full Fat merged onto '+P.mergeStats.matched+'/'+P.mergeStats.spineScenes+' scenes':''));
      if(carriedN||carry&&carry.stitched)setStatus('Published — '+(carriedN?carriedN+' of your edits carried to the new revision':'')+(carriedN&&carry.stitched?', ':'')+(carry&&carry.stitched?carry.stitched+' already-shot days kept':'')+'.');
    }
  };
  // every import reviews before publishing; updates (e.g. Blue after White)
  // lead with the changes vs the unit's current revision
  PENDING_IMPORT=null;
  $('#impModal').classList.remove('open');
  openReview({
    prev:prevSrc,
    nextModel:m,mergeStats:P.mergeStats,ctx,onAccept:commit,
  });
});
function resolveImpProd(){
  let n=$('#impProd').value;
  if(n==='__new')n=($('#impNewName').value||'').trim();
  return n;
}
$('#impProd').addEventListener('change',syncImpProdRows);
$('#impUnit').addEventListener('change',()=>updateMergeRow());

// ---------- schedule review page: between parse and publish ----------
// Shown for EVERY import (and detail merge): what changed vs the current
// revision, clarifying questions (answers feed the glossary), the full day
// table with blanks marked, and a Publish that is never gated on unresolved
// items — flags are a nudge, not a gate.
let REV_CB=null,REV_CTX=null,REV_OPEN=0;
// ---------- original-document viewer (review page + board) ----------
// Renders an uploaded PDF (or photographed pages) into a pane. Used both on
// the review page (side-by-side while checking a read) and from the schedule
// list (viewing a stored original at any time). One viewer is live at a time.
let RPV=null; // {root,els,gen,sources,active,zoom,io,urls,alive}
let PDFJS_LIB=null;
async function loadPdfjs(){
  if(PDFJS_LIB)return PDFJS_LIB;
  const lib=await import('pdfjs-dist/legacy/build/pdf.mjs');
  lib.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
  PDFJS_LIB=lib;return lib;
}
// Production schedules routinely reference fonts (Arial, Courier, Times…)
// WITHOUT embedding them, and encoded/CJK text via CMaps. pdf.js can read the
// text either way, but to DRAW the glyphs it needs its bundled font + CMap
// data — without these the pages rasterise blank-white. Served from /public.
const PDF_ASSET_OPTS={cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/'};
function teardownViewer(){
  if(!RPV)return;
  if(RPV.io)try{RPV.io.disconnect()}catch(e){}
  for(const s of RPV.sources||[])if(s.pdf)try{s.pdf.destroy()}catch(e){}
  for(const u of RPV.urls||[])try{URL.revokeObjectURL(u)}catch(e){}
  RPV=null;
}
// mount the viewer into `rootEl` (must contain .rpv-tabs and .rpv-pages) from
// a flat file list [{name,type,blob}]. aliveFn() is polled so a stale async
// load (review reopened, modal closed) bails instead of painting.
async function mountViewer(rootEl,files,aliveFn){
  teardownViewer();
  const pagesEl=rootEl.querySelector('.rpv-pages'),tabsEl=rootEl.querySelector('.rpv-tabs');
  const self={root:rootEl,els:{pages:pagesEl,tabs:tabsEl},gen:0,sources:[],active:0,zoom:1,io:null,urls:[],alive:aliveFn||(()=>true)};
  RPV=self;
  const alive=()=>RPV===self&&self.alive();
  pagesEl.innerHTML='<div class="rpv-loading">Loading original…</div>';
  const list=(files||[]).filter(f=>f&&f.blob);
  const isPdf=f=>/pdf/i.test(f.type||'')||/\.pdf$/i.test(f.name||'');
  const isImg=f=>/^image\//i.test(f.type||'')||/\.(png|jpe?g|webp|gif|bmp|avif|tiff?)$/i.test(f.name||'');
  const pdfs=list.filter(isPdf),imgs=list.filter(isImg);
  try{
    if(pdfs.length){
      const lib=await loadPdfjs();
      if(!alive())return;
      for(const f of pdfs){
        const buf=await f.blob.arrayBuffer();
        if(!alive())return;
        const pdf=await lib.getDocument({data:buf,...PDF_ASSET_OPTS}).promise;
        if(!alive()){try{pdf.destroy()}catch(e){}return}
        self.sources.push({type:'pdf',label:(f.name||'PDF').replace(/\.pdf$/i,''),pdf,numPages:pdf.numPages});
      }
    }
    if(imgs.length){
      const images=imgs.map(f=>{const url=URL.createObjectURL(f.blob);self.urls.push(url);return {url}});
      self.sources.push({type:'images',label:pdfs.length?('Photos ('+imgs.length+')'):('Pages ('+imgs.length+')'),images});
    }
    if(!alive())return;
    if(!self.sources.length){pagesEl.innerHTML='<div class="rpv-loading">Nothing to display.</div>';return}
    buildViewerTabs();
    renderViewerSource(0);
  }catch(err){
    if(!alive())return;
    console.error(err);
    pagesEl.innerHTML='<div class="rpv-loading">Couldn’t display the original ('+esc(err&&err.message||'unknown error')+').</div>';
  }
}
function buildViewerTabs(){
  if(!RPV||!RPV.els.tabs)return;
  const tabsEl=RPV.els.tabs;
  if(RPV.sources.length<2){tabsEl.innerHTML='';return}
  tabsEl.innerHTML=RPV.sources.map((s,i)=>`<button class="rpv-tab${i===RPV.active?' on':''}" data-rpvsrc="${i}">${esc(s.label)}</button>`).join('');
}
function viewerPageScale(page){
  const pagesEl=RPV&&RPV.els.pages;
  const base=page.getViewport({scale:1});
  const avail=Math.max(120,((pagesEl&&pagesEl.clientWidth)||600)-28);
  return (avail/base.width)*(RPV?RPV.zoom:1);
}
async function renderPdfPage(src,holder,gen){
  if(!RPV||RPV.gen!==gen||holder.dataset.rendered)return;
  holder.dataset.rendered='1';
  try{
    const page=await src.pdf.getPage(+holder.dataset.page);
    if(!RPV||RPV.gen!==gen)return;
    const scale=viewerPageScale(page);
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const vp=page.getViewport({scale:scale*dpr});
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
    canvas.style.width=(vp.width/dpr)+'px';canvas.style.height=(vp.height/dpr)+'px';
    await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
    if(!RPV||RPV.gen!==gen)return;
    holder.innerHTML='';holder.appendChild(canvas);
    holder.dataset.cssw=vp.width/dpr;holder.dataset.cssh=vp.height/dpr;
    paintHighlight(holder); // a pending highlight on this page survives re-render
  }catch(e){holder.dataset.rendered='';}
}
// ---------- find-in-original: link a review row to its line in the PDF ----------
// A position index of every text line (page + bounding box, in PDF units) is
// built once per document, on demand. Clicking a day row or a question's
// quoted text scrolls the original to that line and highlights it.
async function ensureTextIndex(src){
  if(src.index)return src.index;
  if(src.indexing)return src.indexing;
  src.indexing=(async()=>{
    const pages=[];
    for(let p=1;p<=src.numPages;p++){
      const page=await src.pdf.getPage(p);
      const base=page.getViewport({scale:1});
      const tc=await page.getTextContent();
      // group items into visual rows the way a reader sees them
      const rows=new Map();
      for(const it of tc.items){
        const str=it.str;if(!str||!str.trim())continue;
        const x=it.transform[4],y=it.transform[5];
        const h=it.height||Math.hypot(it.transform[1],it.transform[3])||10;
        const key=Math.round(y/3)*3;
        const arr=rows.get(key)||[];
        arr.push({str,x,y,w:it.width||0,h});
        rows.set(key,arr);
      }
      const lines=[];
      for(const arr of rows.values()){
        arr.sort((a,b)=>a.x-b.x);
        const text=arr.map(i=>i.str).join(' ').replace(/\s{2,}/g,' ').trim();
        if(!text)continue;
        const x=Math.min(...arr.map(i=>i.x));
        const right=Math.max(...arr.map(i=>i.x+i.w));
        const yb=Math.min(...arr.map(i=>i.y));
        const h=Math.max(...arr.map(i=>i.h));
        lines.push({text,low:text.toLowerCase(),page:p,x,y:yb,w:Math.max(right-x,4),h});
      }
      pages.push({num:p,width:base.width,height:base.height,lines});
    }
    src.index=pages;src.indexing=null;
    return pages;
  })();
  return src.indexing;
}
const HL_NORM=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
// score a line against a list of candidate needles (first = strongest signal)
function findLineFor(index,needles){
  let best=null;
  for(let n=0;n<needles.length;n++){
    const need=needles[n];if(!need)continue;
    const rx=need instanceof RegExp?need:null;
    const txt=rx?null:HL_NORM(need);
    if(!rx&&(!txt||txt.length<2))continue;
    for(const pg of index){
      for(const ln of pg.lines){
        const hit=rx?rx.test(ln.text):HL_NORM(ln.text).includes(txt);
        if(!hit)continue;
        // earlier needle wins; within a needle, the shortest line is the
        // tightest match (a day banner, not a paragraph mentioning it)
        const score=n*1000+ln.text.length/100;
        if(!best||score<best.score)best={score,line:ln};
      }
    }
    if(best)break; // a stronger needle already matched — don't dilute it
  }
  return best&&best.line;
}
function clearHighlight(){
  if(!RPV)return;
  RPV.hl=null;
  const pages=RPV.els&&RPV.els.pages;
  if(pages)pages.querySelectorAll('.rpv-hl').forEach(el=>el.remove());
}
// draw (or redraw) the pending highlight inside one page holder
function paintHighlight(holder){
  if(!RPV||!RPV.hl)return;
  const hl=RPV.hl;
  if(hl.srcIdx!==RPV.active||+holder.dataset.page!==hl.line.page)return;
  holder.querySelectorAll('.rpv-hl').forEach(el=>el.remove());
  const cssw=+holder.dataset.cssw,cssh=+holder.dataset.cssh;
  if(!cssw||!cssh)return;
  const pg=(RPV.sources[hl.srcIdx].index||[]).find(p=>p.num===hl.line.page);
  if(!pg)return;
  const sx=cssw/pg.width,sy=cssh/pg.height;
  const pad=2;
  const box=document.createElement('div');
  box.className='rpv-hl';
  box.style.left=(hl.line.x*sx-pad)+'px';
  box.style.top=((pg.height-(hl.line.y+hl.line.h))*sy-pad)+'px';
  box.style.width=(hl.line.w*sx+pad*2)+'px';
  box.style.height=(hl.line.h*sy+pad*2)+'px';
  holder.appendChild(box);
  return box;
}
// scroll the viewer to a line and flag it
async function revealLine(srcIdx,line){
  if(!RPV)return;
  if(RPV.active!==srcIdx){RPV.hl=null;renderViewerSource(srcIdx);}
  RPV.hl={srcIdx,line};
  const pagesEl=RPV.els.pages;
  const holder=pagesEl.querySelector('.rpv-page[data-page="'+line.page+'"]');
  if(!holder)return;
  if(!holder.dataset.rendered)await renderPdfPage(RPV.sources[srcIdx],holder,RPV.gen);
  if(!RPV||!RPV.hl||RPV.hl.line!==line)return; // superseded while rendering
  paintHighlight(holder);
  const pg=(RPV.sources[srcIdx].index||[]).find(p=>p.num===line.page);
  const cssh=+holder.dataset.cssh||holder.clientHeight;
  const top=holder.offsetTop+(pg?((pg.height-(line.y+line.h))/pg.height)*cssh:0);
  pagesEl.scrollTo({top:Math.max(0,top-pagesEl.clientHeight/2),behavior:'smooth'});
}
// public entry: find `needles` in whichever loaded document has them
async function findInOriginal(needles,label){
  if(!RPV||!RPV.sources.length){setStatus('Open the original document first to follow along.');return}
  const pdfSrcs=RPV.sources.map((s,i)=>({s,i})).filter(x=>x.s.type==='pdf');
  if(!pdfSrcs.length){setStatus('Following along only works with PDF originals, not photographed pages.');return}
  setStatus('Finding '+(label||'that line')+' in the original…');
  for(const {s,i} of pdfSrcs){
    let index=null;
    try{index=await ensureTextIndex(s)}catch(e){continue}
    if(!RPV)return;
    const line=findLineFor(index,needles);
    if(line){await revealLine(i,line);setStatus('');return}
  }
  setStatus('Couldn’t find '+(label||'that line')+' in the original — the wording may differ from what was read.');
}
// ---- shoot-day banners ----
// dayBannerIndex lives in the engine (lib/engine/doc-anchor.ts) so the rules
// that tell a real day banner apart from a scene row's "Day 4 2/8" page-count
// token are unit-tested against real schedule text — see tests/doc-anchor.
function ensureDayBanners(src){
  if(src.banners)return src.banners;
  const lines=[];
  for(const pg of (src.index||[]))for(const ln of pg.lines)lines.push(ln);
  src.banners=dayBannerIndex(lines);
  return src.banners;
}
// a shoot day: its banner is the definitive anchor; if the document has none,
// fall back to the day's date, then its location, then its first scene
async function followDayInOriginal(d){
  if(!d)return;
  if(!RPV||!RPV.sources.length){setStatus('Open the original document first to follow along.');return}
  const pdfSrcs=RPV.sources.map((s,i)=>({s,i})).filter(x=>x.s.type==='pdf');
  if(!pdfSrcs.length){setStatus('Following along only works with PDF originals, not photographed pages.');return}
  setStatus('Finding D'+d.num+' in the original…');
  for(const {s,i} of pdfSrcs){
    try{await ensureTextIndex(s)}catch(e){continue}
    if(!RPV)return;
    const line=ensureDayBanners(s).get(d.num);
    if(line){await revealLine(i,line);setStatus('');return}
  }
  // no banner for this day — try the softer signals
  const needles=[];
  if(d.date)needles.push(d.date);
  if(d.loc)needles.push(d.loc);
  const sc=(d.scenes||[])[0];
  if(sc&&sc.slug)needles.push(sc.slug);
  if(!needles.length){setStatus('Couldn’t find D'+d.num+' in the original.');return}
  findInOriginal(needles,'D'+d.num);
}
function renderViewerSource(idx){
  if(!RPV||!RPV.els.pages)return;
  const pagesEl=RPV.els.pages;
  RPV.active=idx;
  const gen=++RPV.gen;
  if(RPV.io){try{RPV.io.disconnect()}catch(e){}RPV.io=null;}
  buildViewerTabs();
  const src=RPV.sources[idx];if(!src){pagesEl.innerHTML='';return}
  pagesEl.innerHTML='';
  if(src.type==='images'){
    for(const im of src.images){
      const img=document.createElement('img');
      img.className='rpv-img';
      img.style.width=Math.round(RPV.zoom*100)+'%';
      img.src=im.url;
      pagesEl.appendChild(img);
    }
    return;
  }
  // PDF: placeholder per page, rendered lazily as it scrolls into view so a
  // 100-page Full Fat doesn't rasterise everything up front
  const io=new IntersectionObserver(entries=>{
    for(const en of entries)if(en.isIntersecting)renderPdfPage(src,en.target,gen);
  },{root:pagesEl,rootMargin:'800px 0px'});
  RPV.io=io;
  for(let p=1;p<=src.numPages;p++){
    const holder=document.createElement('div');
    holder.className='rpv-page';holder.dataset.page=p;
    pagesEl.appendChild(holder);
    io.observe(holder);
  }
}
function viewerZoom(mult){
  if(!RPV)return;
  RPV.zoom=mult==null?1:Math.max(0.4,Math.min(4,RPV.zoom*mult));
  renderViewerSource(RPV.active);
}
// review-page wrapper: build the file list from the pending import and manage
// the split-pane layout (widen sheet, toggle, divider)
function setViewerVisible(show){
  const sheet=$('#revPage');if(!sheet)return;
  sheet.classList.toggle('viewer-hidden',!show);
  const t=$('#rpViewerToggle');if(t)t.textContent=show?'Hide original':'Show original';
}
function openReviewViewer(ctx,token){
  const sheet=$('#revPage'),pane=$('#rpViewer'),toggle=$('#rpViewerToggle'),divider=$('#rpDivider');
  if(!sheet||!pane)return;
  const v=(ctx&&ctx.viewer)||{};
  const files=[];
  for(const f of (v.pdfs||[]))if(f)files.push({name:f.name||'schedule.pdf',type:f.type||'application/pdf',blob:f});
  (v.images||[]).forEach((im,i)=>{if(im&&im.data)files.push({name:'page-'+(i+1)+'.jpg',type:im.media_type||'image/jpeg',blob:b64ToBlob(im.data,im.media_type||'image/jpeg')})});
  const has=files.length>0;
  sheet.classList.toggle('has-viewer',has);
  toggle.style.display=has?'':'none';
  divider.style.display=has?'':'none';
  pane.style.display=has?'':'none';
  pane.style.width='';
  if(!has){teardownViewer();return}
  setViewerVisible(true);
  mountViewer(pane,files,()=>token===REV_OPEN);
}
// board wrapper: fetch a stored source's originals and show them in the modal
async function openOriginalViewer(s){
  const modal=$('#origModal'),root=$('#origViewer');
  if(!modal||!root)return;
  $('#origTitle').textContent=(s.prod||s.title||'Schedule')+' — original'+(s.kind==='pdf'&&s.version?(' · '+revLabel(s)):'');
  modal.classList.add('open');
  root.querySelector('.rpv-pages').innerHTML='<div class="rpv-loading">Loading original…</div>';
  root.querySelector('.rpv-tabs').innerHTML='';
  let files=null;
  try{files=await getSourceFiles(s)}catch(e){console.error(e)}
  if(!modal.classList.contains('open'))return; // closed while loading
  if(!files||!files.length){
    root.querySelector('.rpv-pages').innerHTML='<div class="rpv-loading">The original file for this schedule isn’t available on this device yet. If it was uploaded on another device, make sure you’re signed in and try again.</div>';
    teardownViewer();return;
  }
  mountViewer(root,files,()=>$('#origModal').classList.contains('open'));
}
function closeOriginalViewer(){const m=$('#origModal');if(m)m.classList.remove('open');teardownViewer();}
// board dock: a docked right-hand panel that shows the ACTIVE schedule's
// original PDF alongside the day board so figures can be cross-checked live.
function boardPdfOpen(){return document.body.classList.contains('pdf-docked');}
async function openBoardPdf(){
  const dock=$('#boardPdf'),root=dock;if(!dock)return;
  const s=SOURCES[ACTIVE];
  document.body.classList.add('pdf-docked');
  dock.setAttribute('aria-hidden','false');
  const btn=$('#btnBoardPdf');if(btn)btn.classList.add('on');
  const title=$('#boardPdfTitle');
  if(title)title.textContent=(s&&(s.prod||s.title))?((s.prod||s.title)+(s.kind==='pdf'&&s.version?(' · '+revLabel(s)):'')):'Schedule PDF';
  root.querySelector('.rpv-tabs').innerHTML='';
  if(!sourceHasFiles(s)){
    root.querySelector('.rpv-pages').innerHTML='<div class="rpv-loading">There’s no original document stored for this schedule. Open a schedule that was imported from a PDF to cross-check it here.</div>';
    teardownViewer();return;
  }
  root.querySelector('.rpv-pages').innerHTML='<div class="rpv-loading">Loading original…</div>';
  let files=null;
  try{files=await getSourceFiles(s)}catch(e){console.error(e)}
  if(!boardPdfOpen())return; // closed while loading
  if(!files||!files.length){
    root.querySelector('.rpv-pages').innerHTML='<div class="rpv-loading">The original file for this schedule isn’t available on this device yet. If it was uploaded on another device, make sure you’re signed in and try again.</div>';
    teardownViewer();return;
  }
  mountViewer(root,files,()=>boardPdfOpen()&&RPV&&RPV.root===root);
}
function closeBoardPdf(){
  document.body.classList.remove('pdf-docked');
  const dock=$('#boardPdf');if(dock)dock.setAttribute('aria-hidden','true');
  const btn=$('#btnBoardPdf');if(btn)btn.classList.remove('on');
  if(RPV&&RPV.root===dock)teardownViewer();
}
function toggleBoardPdf(){boardPdfOpen()?closeBoardPdf():openBoardPdf();}
// keep the docked PDF pointed at whichever schedule is active
function refreshBoardPdf(){if(boardPdfOpen())openBoardPdf();}
$('#btnBoardPdf')&&$('#btnBoardPdf').addEventListener('click',toggleBoardPdf);
$('#boardPdfClose')&&$('#boardPdfClose').addEventListener('click',closeBoardPdf);

// ---------- "Re-check" — read this schedule again with a user note ----------
// The AI already read this schedule once. When something's wrong (crowd pulled
// in but cast numbers missed, wrong head counts, etc.) the user types a plain
// note; we re-read the SAME stored original (PDF text or photographed pages)
// with that note, then show the usual review/diff so nothing changes until
// they publish.
function recheckAvailable(){
  const s=SOURCES[ACTIVE];
  return !!(s&&s.kind&&s.kind!=='manual'&&sourceHasFiles(s)&&!aiBlocked(s.prod));
}
function syncRecheckBtn(){
  const btn=$('#btnRecheck');if(!btn)return;
  const s=SOURCES[ACTIVE];
  const ok=recheckAvailable();
  btn.style.display=(s&&s.kind&&s.kind!=='manual')?'':'none';
  btn.classList.toggle('muted',!ok);
  btn.dataset.tip=ok?'Ask CrowdOS to read this schedule again — e.g. if it missed the cast numbers'
    :(s&&aiBlocked(s.prod)?'AI reading is switched off for this production (Production Settings → General)'
      :'There’s no original document stored to re-read for this schedule');
}
function closeRecheckPop(){
  const p=document.getElementById('recheckPop');if(p)p.remove();
  document.removeEventListener('click',recheckOutside,true);
}
function recheckOutside(e){
  if(e.target.closest('#recheckPop')||e.target.closest('#btnRecheck'))return;
  closeRecheckPop();
}
const RECHECK_SUGGESTIONS=[
  "You've missed the cast numbers on some scenes — please add them.",
  "The number of people (crowd/SA) looks wrong — please check every scene again.",
];
function openRecheckPop(){
  closeRecheckPop();
  const btn=$('#btnRecheck');if(!btn)return;
  if(!recheckAvailable()){setStatus(btn.dataset.tip||'Re-check isn’t available for this schedule.');return}
  const p=document.createElement('div');
  p.id='recheckPop';p.className='recheck-pop';
  p.innerHTML=`
    <div class="rc-h">Ask CrowdOS to re-check this schedule</div>
    <div class="rc-sub">Say what it got wrong. It re-reads the original document you imported and shows you the result to confirm before anything changes.</div>
    <div class="rc-chips">${RECHECK_SUGGESTIONS.map((s,i)=>`<button class="rc-chip" data-rcsug="${i}">${esc(s)}</button>`).join('')}</div>
    <textarea id="rcText" class="rc-text" rows="3" placeholder="e.g. You've missed all the cast numbers — please read it again and add them."></textarea>
    <div class="rc-actions"><button class="tb-btn" id="rcCancel">Cancel</button><button class="tb-btn rc-go" id="rcGo">${icon('refresh')} Re-check schedule</button></div>`;
  document.body.appendChild(p);
  const r=btn.getBoundingClientRect();
  const w=Math.min(360,window.innerWidth-16);
  p.style.width=w+'px';
  p.style.top=(r.bottom+6+window.scrollY)+'px';
  p.style.left=Math.max(8,Math.min(r.left+window.scrollX,window.scrollX+window.innerWidth-w-8))+'px';
  const ta=p.querySelector('#rcText');ta.focus();
  p.querySelectorAll('[data-rcsug]').forEach(b=>b.addEventListener('click',()=>{
    const s=RECHECK_SUGGESTIONS[+b.dataset.rcsug];
    ta.value=ta.value.trim()?ta.value.trim()+' '+s:s;ta.focus();
  }));
  p.querySelector('#rcCancel').addEventListener('click',closeRecheckPop);
  p.querySelector('#rcGo').addEventListener('click',()=>{
    const note=ta.value.trim();
    if(!note){ta.focus();ta.classList.add('rc-err');setTimeout(()=>ta.classList.remove('rc-err'),1200);return}
    closeRecheckPop();
    runRecheck(note);
  });
  setTimeout(()=>document.addEventListener('click',recheckOutside,true),0);
}
async function runRecheck(note){
  const s=SOURCES[ACTIVE];
  if(!s||!recheckAvailable())return;
  const unit=s.unit==='2nd'?'2nd':'Main';
  const prod=s.prod||s.title;
  try{
    // gather the original: stored PDF text if we have it, else re-read the
    // photographed pages back into base64 for the vision model
    let text=s.text||'';
    let images=null;
    if(!text){
      setStatus('Fetching the original pages to re-read…');
      let orig=null;try{orig=await getSourceFiles(s)}catch(e){}
      const imgs=(orig||[]).filter(f=>/^image\//i.test(f.type||'')||/\.(jpe?g|png|webp|gif)$/i.test(f.name||''));
      if(!imgs.length){setStatus('Couldn’t find the original document to re-read for this schedule.');return}
      images=[];
      for(const f of imgs){try{images.push(await imageToB64(f.blob))}catch(e){}}
      if(!images.length){setStatus('Couldn’t re-read the original pages for this schedule.');return}
    }
    aiBusy(true,'Re-reading the schedule with AI…');
    let r;
    try{r=await aiParse(text,prod,images,note)}
    catch(err){aiBusy(false);setStatus('Couldn’t re-check that schedule ('+err.message+').');return}
    aiBusy(false);
    const nextModel=prepModel(JSON.parse(JSON.stringify(r.model)),unit);
    if(!nextModel.days.length){setStatus('The re-read found no shoot days — try rewording your note, or re-import the file.');return}
    // build the review-page side viewer from the stored original
    let viewer=null;
    if(images&&images.length){viewer={images};}
    else{
      let orig=null;try{orig=await getSourceFiles(s)}catch(e){}
      const pdfs=(orig||[]).filter(f=>/pdf/i.test(f.type||'')||/\.pdf$/i.test(f.name||''))
        .map(f=>{try{return new File([f.blob],f.name||'schedule.pdf',{type:f.type||'application/pdf'})}catch(e){return null}}).filter(Boolean);
      if(pdfs.length)viewer={pdfs};
    }
    openReview({
      prev:s,nextModel,mergeStats:null,
      ctx:{mode:'recheck',prod,unit,version:revLabel(s),docKind:s.docKind||null,
        files:(s.prod||s.title)+' — re-check',questions:r.questions||[],text,rawModel:r.model,viewer},
      onAccept(){
        s.aiModel=r.model;
        s.model=modelFrom(s,unit);
        restoreManualDays(s);
        saveUserSources();
        if(CLOUD.session&&s.cloudId)cloud.updateProduction(s.cloudId,s).then(x=>{if(x.error)setStatus('Cloud save failed: '+x.error.message)});
        const idx=SOURCES.indexOf(s);
        if(!DASH&&ACTIVE===idx)setActive(idx);else{renderSidebar();if(DASH)renderDash();}
        logProdEvent(s.prod||s.title,'schedule','Schedule re-checked with AI — '+nextModel.days.length+' days · note: '+note.slice(0,120));
        setStatus('Schedule re-checked and updated.');
      },
    });
  }catch(err){aiBusy(false);console.error(err);setStatus('Couldn’t re-check that schedule ('+err.message+').')}
}
$('#btnRecheck')&&$('#btnRecheck').addEventListener('click',e=>{e.stopPropagation();document.getElementById('recheckPop')?closeRecheckPop():openRecheckPop();});
// drag the divider to resize the docked PDF panel
(function(){
  const divider=$('#boardPdfDivider'),dock=$('#boardPdf');
  if(!divider||!dock)return;
  let dragging=false;
  divider.addEventListener('mousedown',e=>{if(!boardPdfOpen())return;dragging=true;e.preventDefault();document.body.style.userSelect='none';});
  window.addEventListener('mousemove',e=>{
    if(!dragging)return;
    const w=Math.max(300,Math.min(window.innerWidth-360,window.innerWidth-e.clientX));
    dock.style.width=w+'px';
  });
  window.addEventListener('mouseup',()=>{
    if(!dragging)return;
    dragging=false;document.body.style.userSelect='';
    if(RPV&&RPV.root===dock)renderViewerSource(RPV.active); // re-rasterise at new width
  });
})();
// ---------- day board: resize + show/hide columns ----------
// Grips live on each header column's right edge; dragging drives the shared
// CSS custom properties (--w-scene/cast/stunt/crowd) and persists per production.
(function(){
  const DEF={scene:84,cast:138,stunt:158,crowd:92};
  const MIN={scene:56,cast:70,stunt:70,crowd:70};
  const MAX={scene:240,cast:360,stunt:360,crowd:360};
  // Scene sits left of the flexible "Set / action" column (grip on its right,
  // drag right = wider). Cast/Stunts/Crowd sit right of it (grip on their left,
  // drag left = wider) so the handle always tracks the cursor.
  const SIGN={scene:1,cast:-1,stunt:-1,crowd:-1};
  function activeProd(){
    const s=SOURCES[ACTIVE];
    const name=s&&s.kind&&(s.prod||s.title);
    return {name,p:name?PRODS[name]:null};
  }
  function persist(p,name){
    if(!p||!name)return;
    saveProds();
    if(CLOUD.session&&cloud.upsertProd)cloud.upsertProd(name,p).catch(()=>{});
  }
  let drag=null;
  document.addEventListener('mousedown',e=>{
    const g=e.target.closest('.colgrip');if(!g)return;
    const host=$('#viewDays');if(!host)return;
    const col=g.dataset.col;
    let start=parseFloat(getComputedStyle(host).getPropertyValue('--w-'+col));
    if(!start||isNaN(start))start=g.parentElement.getBoundingClientRect().width||DEF[col];
    drag={col,host,startX:e.clientX,startW:start,w:start};
    g.classList.add('drag');
    document.body.style.userSelect='none';document.body.style.cursor='col-resize';
    e.preventDefault();
  });
  window.addEventListener('mousemove',e=>{
    if(!drag)return;
    let w=Math.round(drag.startW+(SIGN[drag.col]||1)*(e.clientX-drag.startX));
    w=Math.max(MIN[drag.col],Math.min(MAX[drag.col],w));
    drag.w=w;drag.host.style.setProperty('--w-'+drag.col,w+'px');
  });
  window.addEventListener('mouseup',()=>{
    if(!drag)return;
    document.querySelectorAll('.colgrip.drag').forEach(x=>x.classList.remove('drag'));
    document.body.style.userSelect='';document.body.style.cursor='';
    const {name,p}=activeProd();
    if(p){p.columnWidths=p.columnWidths||{};p.columnWidths[drag.col]=drag.w;persist(p,name);}
    drag=null;
  });
  // double-click a grip → reset just that column to its default width
  document.addEventListener('dblclick',e=>{
    const g=e.target.closest('.colgrip');if(!g)return;
    const col=g.dataset.col,host=$('#viewDays');
    if(host)host.style.removeProperty('--w-'+col);
    const {name,p}=activeProd();
    if(p&&p.columnWidths&&col in p.columnWidths){delete p.columnWidths[col];persist(p,name);}
  });
  // the ⋮ button opens a quick show/hide menu for Cast / Stunts / Crowd
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-colmenu]');if(!b)return;
    e.preventDefault();e.stopPropagation();
    const {name,p}=activeProd();
    if(!p){setStatus('Column options apply once a schedule is loaded.');return;}
    const cols={cast:true,stunts:true,crowd:true,...(p.columns||{})};
    const toggle=k=>{cols[k]=!cols[k];p.columns={...cols};persist(p,name);renderDays();};
    const r=b.getBoundingClientRect();
    openCtxMenu(r.left,r.bottom+6,[
      {label:(cols.cast?'✓ ':'    ')+'Cast',onClick:()=>toggle('cast')},
      {label:(cols.stunts?'✓ ':'    ')+'Stunts',onClick:()=>toggle('stunts')},
      {label:(cols.crowd?'✓ ':'    ')+'Crowd',onClick:()=>toggle('crowd')},
      {sep:true},
      {label:'Reset column widths',icon:'refresh',onClick:()=>{
        if(p.columnWidths){delete p.columnWidths;persist(p,name);}
        const host=$('#viewDays');
        if(host)['scene','cast','stunt','crowd'].forEach(k=>host.style.removeProperty('--w-'+k));
        renderDays();
      }},
    ]);
  });
})();
// re-rasterise the docked PDF when the window resizes (its width is responsive)
(function(){
  let t=null;
  window.addEventListener('resize',()=>{
    const dock=$('#boardPdf');
    if(!boardPdfOpen()||!RPV||RPV.root!==dock)return;
    clearTimeout(t);t=setTimeout(()=>{if(RPV&&RPV.root===dock)renderViewerSource(RPV.active)},180);
  });
})();
// viewer controls, delegated (only one viewer is ever live)
document.addEventListener('click',e=>{
  if(!RPV)return;
  if(e.target.closest('.rpv-in')){viewerZoom(1.2);return}
  if(e.target.closest('.rpv-out')){viewerZoom(1/1.2);return}
  if(e.target.closest('.rpv-fit')){viewerZoom(null);return}
  const b=e.target.closest('[data-rpvsrc]');
  if(b){RPV.zoom=1;clearHighlight();renderViewerSource(+b.dataset.rpvsrc);return}
});
$('#rpViewerToggle')&&$('#rpViewerToggle').addEventListener('click',()=>{
  setViewerVisible($('#revPage').classList.contains('viewer-hidden'));
});
$('#origClose')&&$('#origClose').addEventListener('click',closeOriginalViewer);
$('#origModal')&&$('#origModal').addEventListener('click',e=>{if(e.target.id==='origModal')closeOriginalViewer();});
// drag the review divider to resize the viewer pane
(function(){
  const divider=$('#rpDivider'),pane=$('#rpViewer'),split=$('#rpSplit');
  if(!divider||!pane||!split)return;
  let dragging=false;
  divider.addEventListener('mousedown',e=>{dragging=true;e.preventDefault();document.body.style.userSelect='none';});
  window.addEventListener('mousemove',e=>{
    if(!dragging)return;
    const r=split.getBoundingClientRect();
    const w=Math.max(240,Math.min(r.width-320,r.right-e.clientX));
    pane.style.width=w+'px';
  });
  window.addEventListener('mouseup',()=>{
    if(!dragging)return;
    dragging=false;document.body.style.userSelect='';
    if(RPV&&RPV.root===pane)renderViewerSource(RPV.active); // re-rasterise at new width
  });
})();
// ---------- durable original-file storage (IndexedDB cache + Supabase) ----------
// Uploaded originals are cached in IndexedDB (survives reloads, large-file
// safe) and — when signed in — uploaded to account storage so they follow the
// user to any device. The productions row keeps a small {name,path} manifest.
const IDB_NAME='crowdos-files',IDB_STORE='files';
function idbOpen(){return new Promise((res,rej)=>{let r;try{r=indexedDB.open(IDB_NAME,1)}catch(e){return rej(e)}r.onupgradeneeded=()=>{try{r.result.createObjectStore(IDB_STORE)}catch(e){}};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);})}
function idbPut(key,val){return idbOpen().then(db=>new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).put(val,key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);}))}
function idbGet(key){return idbOpen().then(db=>new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readonly');const rq=tx.objectStore(IDB_STORE).get(key);rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error);}))}
function idbDel(key){return idbOpen().then(db=>new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).delete(key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);}))}
// which sources have a locally-cached original — lets the sidebar decide
// whether to show the "View original" action without an async lookup
let FILEIDX=new Set();
try{FILEIDX=new Set(JSON.parse(store.get('crowdos-files-idx')||'[]'))}catch(e){FILEIDX=new Set()}
function saveFileIdx(){store.set('crowdos-files-idx',JSON.stringify([...FILEIDX]))}
function fileKeyOf(s){return s&&(s.ns||('t:'+(s.title||'')))}
function sourceHasFiles(s){return !!(s&&((s.pdfFiles&&s.pdfFiles.length)||FILEIDX.has(fileKeyOf(s))))}
function b64ToBlob(b64,type){
  const bin=atob(b64),len=bin.length,arr=new Uint8Array(len);
  for(let i=0;i<len;i++)arr[i]=bin.charCodeAt(i);
  return new Blob([arr],{type:type||'application/octet-stream'});
}
function safeName(n){return String(n||'file').replace(/[^\w.\-]+/g,'_').slice(0,80)}
// flatten a pending import (PDFs + photographed pages) into a file list
function filesFromPending(P){
  const out=[];
  for(const f of ((P&&P.pdfFiles)||[]))if(f)out.push({name:f.name||'schedule.pdf',type:f.type||'application/pdf',blob:f});
  ((P&&P.images)||[]).forEach((im,i)=>{if(im&&im.data)out.push({name:'page-'+(i+1)+'.jpg',type:im.media_type||'image/jpeg',blob:b64ToBlob(im.data,im.media_type||'image/jpeg')})});
  return out;
}
// cache a source's originals locally (immediate, offline-safe)
async function cacheSourceFilesLocal(src,files){
  if(!src||!files||!files.length)return;
  const key=fileKeyOf(src);
  try{
    await idbPut(key,files.map(f=>({name:f.name,type:f.type,blob:f.blob})));
    FILEIDX.add(key);saveFileIdx();
    if(!src.pdfFiles||!src.pdfFiles.length)src.pdfFiles=files.map(f=>({name:f.name,type:f.type}));
    renderSidebar();syncBoardPdfBtn();
  }catch(e){console.error('local original cache failed',e)}
}
// append originals to a source that may already have some (detail merge) —
// caches locally and uploads the new files to account storage
async function addSourceFiles(src,files){
  if(!src||!files||!files.length)return;
  const key=fileKeyOf(src);
  let existing=[];try{existing=(await idbGet(key))||[]}catch(e){}
  const startIdx=existing.length;
  const merged=existing.concat(files.map(f=>({name:f.name,type:f.type,blob:f.blob})));
  try{await idbPut(key,merged);FILEIDX.add(key);saveFileIdx();}catch(e){console.error('local original cache failed',e)}
  if(!src.pdfFiles||!src.pdfFiles.length)src.pdfFiles=merged.map(f=>({name:f.name,type:f.type}));
  renderSidebar();syncBoardPdfBtn();
  if(CLOUD.session&&src.cloudId&&cloud.uploadScheduleFile){
    const uid=(CLOUD.session.user&&CLOUD.session.user.id)||'u';
    const man=(src.pdfFiles&&src.pdfFiles[0]&&src.pdfFiles[0].path)?src.pdfFiles.slice():[];
    for(let i=0;i<files.length;i++){
      const f=files[i],path=uid+'/'+src.cloudId+'/'+(startIdx+i)+'_'+safeName(f.name);
      try{
        const {error}=await cloud.uploadScheduleFile(path,f.blob,f.type);
        if(error){console.error('cloud original upload failed',error);continue}
        man.push({name:f.name,type:f.type,path});
      }catch(e){console.error('cloud original upload threw',e)}
    }
    if(man.length){src.pdfFiles=man;try{await cloud.updateProduction(src.cloudId,src)}catch(e){}}
  }
}
// upload a source's originals to account storage and save the manifest
async function uploadSourceFilesToCloud(src,files){
  if(!CLOUD.session||!src||!src.cloudId||!files||!files.length||!cloud.uploadScheduleFile)return;
  const uid=(CLOUD.session.user&&CLOUD.session.user.id)||'u';
  const manifest=[];
  for(let i=0;i<files.length;i++){
    const f=files[i],path=uid+'/'+src.cloudId+'/'+i+'_'+safeName(f.name);
    try{
      const {error}=await cloud.uploadScheduleFile(path,f.blob,f.type);
      if(error){console.error('cloud original upload failed',error);continue}
      manifest.push({name:f.name,type:f.type,path});
    }catch(e){console.error('cloud original upload threw',e)}
  }
  if(manifest.length){
    src.pdfFiles=manifest;
    try{await cloud.updateProduction(src.cloudId,src)}catch(e){console.error('manifest save failed',e)}
  }
}
// fetch a source's originals for viewing: local cache first, else account
// storage (then cache locally so it's instant next time)
async function getSourceFiles(s){
  if(!s)return null;
  const key=fileKeyOf(s);
  let rec=null;
  try{rec=await idbGet(key)}catch(e){}
  if(rec&&rec.length)return rec.map(r=>({name:r.name,type:r.type,blob:r.blob}));
  const man=s.pdfFiles;
  if(man&&man.length&&man[0]&&man[0].path&&CLOUD.session&&cloud.downloadScheduleFile){
    const files=[];
    for(const m of man){
      try{
        const {data,error}=await cloud.downloadScheduleFile(m.path);
        if(error||!data)continue;
        files.push({name:m.name,type:m.type||data.type,blob:data});
      }catch(e){console.error('cloud original download failed',e)}
    }
    if(files.length){try{await idbPut(key,files.map(f=>({name:f.name,type:f.type,blob:f.blob})));FILEIDX.add(key);saveFileIdx();syncBoardPdfBtn();}catch(e){}}
    return files.length?files:null;
  }
  return null;
}
// remove a source's originals (local + account) when its schedule is deleted
async function deleteSourceFiles(s){
  if(!s)return;
  const key=fileKeyOf(s);
  try{await idbDel(key)}catch(e){}
  if(FILEIDX.has(key)){FILEIDX.delete(key);saveFileIdx();}
  const man=s.pdfFiles;
  if(man&&man.length&&man[0]&&man[0].path&&CLOUD.session&&cloud.removeScheduleFiles){
    try{await cloud.removeScheduleFiles(man.map(m=>m.path))}catch(e){}
  }
}
function modelSaDays(m){
  let t=0;
  for(const d of m.days){
    let anon=0;const names={};
    for(const sc of d.scenes){
      anon=Math.max(anon,sc.sa||0);
      for(const g of sc.saChars||[])names[g.name]=Math.max(names[g.name]||0,g.count);
    }
    t+=anon+Object.values(names).reduce((a,n)=>a+n,0);
  }
  return t;
}
function daySaTotal(d){
  let anon=0;const names={};
  for(const sc of d.scenes){anon=Math.max(anon,sc.sa||0);for(const g of sc.saChars||[])names[g.name]=Math.max(names[g.name]||0,g.count);}
  return anon+Object.values(names).reduce((a,n)=>a+n,0);
}
// anonymous background SA for a day (peak across scenes)
function dayAnonSA(d){let a=0;for(const sc of d.scenes)a=Math.max(a,sc.sa||0);return a;}
// named SA character groups on a day, peak count per name across scenes
function dayNamedSA(d){
  const names={};
  for(const sc of d.scenes)for(const g of sc.saChars||[])names[g.name]=Math.max(names[g.name]||0,g.count||0);
  return Object.keys(names).map(name=>({name,count:names[name]}));
}
// Crowd is derived from scenes (the day peak drives the budget), so to make a
// day's number editable we write it back onto scenes with least damage: cap
// every scene at the target, then lift the peak scene to hit it exactly. This
// keeps per-scene variation below the peak and flows straight into the engine
// and the published board (both read scene sa / saChars).
function setDayAnonSA(d,n){
  n=Math.max(0,Math.round(+n||0));
  if(!d.scenes.length)return;
  let carrier=null,mx=-1;
  for(const sc of d.scenes){const v=sc.sa||0;if(v>mx){mx=v;carrier=sc;}sc.sa=Math.min(v,n);}
  if(carrier)carrier.sa=n;
}
function setDayNamedSA(d,name,n){
  n=Math.max(0,Math.round(+n||0));
  let carrier=null,mx=-1;
  for(const sc of d.scenes)for(const g of sc.saChars||[]){if(g.name!==name)continue;const v=g.count||0;if(v>mx){mx=v;carrier=g;}g.count=Math.min(v,n);}
  if(carrier)carrier.count=n;
}
function renameDayNamed(d,oldName,newName){
  for(const sc of d.scenes)for(const g of sc.saChars||[])if(g.name===oldName)g.name=newName;
}
function removeDayNamed(d,name){
  for(const sc of d.scenes)if(sc.saChars)sc.saChars=sc.saChars.filter(g=>g.name!==name);
}
// a new named group lives on the day's first scene; the day peak picks it up
function addDayNamed(d,name,count){
  const sc=d.scenes[0];if(!sc)return;
  if(!sc.saChars)sc.saChars=[];
  sc.saChars.push({name,count:Math.max(0,Math.round(+count||0))});
}
// a name that doesn't clash with the day's existing named groups
function freshNamedName(d){
  const have=new Set(dayNamedSA(d).map(g=>g.name.toLowerCase()));
  let i=1,name='New group';
  while(have.has(name.toLowerCase())){i++;name='New group '+i;}
  return name;
}

// ---------- move / copy / delete a crowd group between scenes in a day ----------
// A day's crowd figure is DERIVED from its scenes: the anonymous SA peak plus
// each named group's peak across scenes (see daySaTotal). So "the same 48 people
// appearing in several scenes" already counts once — as long as the groups share
// an identity (an anonymous SA row, or the same name). That is exactly the pool
// logic these tools lean on:
//   • Moving a group, or copying it as the SAME people, keeps its identity, so
//     the day total does NOT rise (peak-across-scenes absorbs it).
//   • Copying as NEW people gives it a fresh name, so it adds to the day total.
// A group is identified by tier + featured + name; anonymous background SA has
// an empty name. All edits persist through SCED (the per-scene override store)
// and recompute via refreshAll, the same path the inline editor uses.
function scGroupsOf(s){
  const out=[];
  const carried=g=>!!(g&&g.flags&&g.flags.includes('asAbove'));
  if((s.sa||0)>0)out.push({tier:'SA',featured:false,name:'',count:s.sa,note:'',sup:0,fromAbove:false});
  for(const g of s.saChars||[])if((g.count||0)>0)out.push({tier:'SA',featured:false,name:g.name||'',count:g.count,note:g.note||'',sup:+g.sup||0,fromAbove:carried(g)});
  for(const g of s.featured||[])if((g.count||0)>0)out.push({tier:'SA',featured:true,name:g.name||'',count:g.count,note:g.note||'',sup:+g.sup||0,fromAbove:carried(g)});
  for(const g of s.spacts||[])if((g.count||0)>0)out.push({tier:'SPACT',featured:false,name:g.name||'',count:g.count,note:g.note||'',sup:+g.sup||0,fromAbove:carried(g)});
  return out;
}
// the editable char-rows for a scene, in the shape SCED / the inline editor use
function sceneCrowdRows(s){
  return scGroupsOf(s).map(g=>({name:g.name,count:g.count,tier:g.tier,featured:g.featured,note:g.note||'',sup:+g.sup||0,fromAbove:!!g.fromAbove}));
}
// write a scene's crowd rows back through SCED, preserving any stunt fields on
// the same entry (perf/coord/dbl). Does NOT save/recompute — caller batches that
// so a two-scene move only recomputes once.
function writeSceneCrowd(d,idx,rows){
  const s=d.scenes[idx]; if(!s)return;
  const key=scedKey(sceneNK(d,s,idx));
  const e=Object.assign({},SCED[key]||{});
  e.chars=rows.filter(r=>(+r.count||0)>0)
    .map(r=>{
      const o={name:(r.name||'').trim(),count:+r.count,tier:r.tier==='SPACT'?'SPACT':'SA',featured:!!r.featured};
      // notes/continuity typed on the crowd breakdown live with the row, so
      // they survive a recompute and travel with the group when it is moved
      if((r.note||'').trim())o.note=(r.note||'').trim();
      // a supplementary fee belongs to the group, so it survives a recompute
      // and travels with the group when it is moved to another scene
      if(+r.sup>0)o.sup=+r.sup;
      if(r.fromAbove)o.fromAbove=true;
      return o;
    });
   // Always persist — even an empty crowd list. Removing a scene's last crowd
  // group (drag-out to remove, moving the last group away, or the ⋯ Delete)
  // is an explicit "this scene now has no crowd" edit and must stick. Deleting
   // the SCED key instead let applySced fall back to the schedule's parsed
   // baseline, so the group silently reappeared. (Same reasoning the inline
   // editor uses when it persists a zero-row edit.)
   SCED[key]=e;
}
// The STUNTS/OTHER column's three source lists, in the order the breakdown
// prints them. Stunt performers added by the stunt editor (`_sced`) are the
// stunt page's own working and are never typed over here, so they are left out
// of the editable set — they are appended after the override is applied, which
// is why plain indexes still line up.
function sceneOtherRows(s){
  return {
    extras:(s.extras||[]).filter(x=>!x._sced).map(x=>({name:x.name||'',count:+x.count||0})),
    children:(s.children||[]).map(x=>({name:x.name||'',count:+x.count||0})),
    avs:(s.avs||[]).map(x=>({name:x.name||'',count:+x.count||0})),
  };
}
// Write one STUNTS/OTHER line back through SCED — the same store, and the same
// recompute, every other edit in the app goes through.
function writeSceneOther(d,idx,src,slot,field,val){
  const s=d.scenes[idx];if(!s)return false;
  if(!['extras','children','avs'].includes(src))return false;
  // a stunt-editor line is owned by the stunt page, not by this document
  if(src==='extras'&&(s.extras||[])[slot]&&(s.extras||[])[slot]._sced)return false;
  const rows=sceneOtherRows(s);
  const list=rows[src];
  if(slot>=list.length){
    // typing on the blank line under the list creates a line, but only once
    // there is something to create
    if(field==='no'){const n=cbdHeads(val);if(!n)return false;list.push({name:'',count:n});}
    else if(field==='name'&&val)list.push({name:val,count:1});
    else return false;
  }else{
    const r=list[slot];
    if(field==='no')r.count=cbdHeads(val);
    else r.name=val;
    // emptied of both a number and a name is a deletion
    if(!r.count&&!(r.name||'').trim())list.splice(slot,1);
  }
  const key=scedKey(sceneNK(d,s,idx));
  SCED[key]=Object.assign({},SCED[key]||{},{others:rows});
  return true;
}
function sameGroup(r,g){return r.tier===g.tier&&(!!r.featured)===(!!g.featured)&&(r.name||'')===(g.name||'');}
function findRowIdx(rows,g){return rows.findIndex(r=>sameGroup(r,g));}
// land a group in a scene under its own identity: same people, so merge by MAX
// (never sum) — a scene can't hold more of a group than the day's pool of them
function mergeSameInto(rows,g){
  const j=findRowIdx(rows,g);
  if(j>=0)rows[j].count=Math.max(rows[j].count,g.count);
  else rows.push({name:g.name,count:g.count,tier:g.tier,featured:g.featured,fromAbove:!!g.fromAbove});
}
// every group name already used anywhere on the day (lower-cased)
function dayGroupNames(d){
  const set=new Set();
  for(const s of d.scenes)for(const g of scGroupsOf(s))if(g.name)set.add(g.name.toLowerCase());
  return set;
}
// a name for genuinely-new people that won't collapse into an existing group
function freshGroupName(d,g){
  const have=dayGroupNames(d);
  const base=(g.name&&g.name.trim())||'Crowd';
  let name=base,i=1;
  while(have.has(name.toLowerCase())){i++;name=base+' ('+i+')';}
  return name;
}
// resolve a day + group descriptor off a crowd chip's data attributes
function crowdGroupFromEl(el){
  const chip=el.closest('[data-crgrp]'), strip=el.closest('.strip[data-dayid]');
  if(!chip||!strip)return null;
  const d=(COST&&COST.dayById&&COST.dayById[strip.dataset.dayid])||(MODEL.days||[]).find(x=>x.id===strip.dataset.dayid);
  const idx=+strip.dataset.sceneidx;
  if(!d||!d.scenes[idx])return null;
  return {d,idx,g:{tier:chip.dataset.gtier==='SPACT'?'SPACT':'SA',featured:chip.dataset.gfeat==='1',
    name:chip.dataset.gname||'',count:+chip.dataset.gcount||0,fromAbove:chip.dataset.gabove==='1'}};
}
// MOVE: relocate the group from one scene to another (same people, no total rise)
function moveCrowdGroup(d,fromIdx,g,toIdx){
  if(fromIdx===toIdx)return false;
  const src=sceneCrowdRows(d.scenes[fromIdx]);
  const i=findRowIdx(src,g); if(i<0)return false;
  const moved=Object.assign({},src[i]); src.splice(i,1);
  const tgt=sceneCrowdRows(d.scenes[toIdx]); mergeSameInto(tgt,moved);
  registerCrowdUndo(JSON.stringify(SCED),crowdGroupLabel(g)+' moved');
  writeSceneCrowd(d,fromIdx,src); writeSceneCrowd(d,toIdx,tgt);
  saveSced(); refreshAll(); return true;
}
// COPY: add the group to another scene, keeping the source. mode 'same' links it
// to the day's pool (no total rise); mode 'new' adds them as fresh faces.
function copyCrowdGroup(d,fromIdx,g,toIdx,mode){
  const tgt=sceneCrowdRows(d.scenes[toIdx]);
  if(mode==='new')tgt.push({name:freshGroupName(d,g),count:g.count,tier:g.tier,featured:g.featured});
  else mergeSameInto(tgt,g);
  registerCrowdUndo(JSON.stringify(SCED),crowdGroupLabel(g)+' copied');
  writeSceneCrowd(d,toIdx,tgt);
  saveSced(); refreshAll(); return true;
}
// DELETE: remove the group from this scene only (its people fall back to the pool)
function deleteCrowdGroup(d,fromIdx,g){
  const src=sceneCrowdRows(d.scenes[fromIdx]);
  const i=findRowIdx(src,g); if(i<0)return false;
  src.splice(i,1);
  registerCrowdUndo(JSON.stringify(SCED),crowdGroupLabel(g)+' removed');
  writeSceneCrowd(d,fromIdx,src);
  saveSced(); refreshAll(); return true;
}
// a short human label for a group, for menus and the same/new prompt
function crowdGroupLabel(g){
  const nm=g.name?g.name:(g.tier==='SPACT'?'SPACT':'SA'+(g.featured?' (featured)':''));
  return nm+' ×'+g.count;
}
// "same people or new people?" — a small centred prompt. Resolves 'same' | 'new'
// | null (cancelled). Used every time a group is copied into another scene.
function askSamePeople(group,sceneLabel){
  return new Promise(resolve=>{
    const wrap=document.createElement('div');wrap.className='samenew-wrap';
    wrap.innerHTML=`<div class="samenew" role="dialog" aria-modal="true">
      <div class="samenew-h">Add <b>${esc(crowdGroupLabel(group))}</b> to scene ${esc(sceneLabel)}</div>
      <div class="samenew-q">Are these the same people already on this day, or new people coming in?</div>
      <div class="samenew-btns">
        <button class="samenew-same" data-v="same">Same people<small>drawn from the day — the day total stays the same</small></button>
        <button class="samenew-new" data-v="new">New people<small>extra faces — adds to the day total</small></button>
      </div>
      <button class="samenew-cancel" data-v="cancel">Cancel</button>
    </div>`;
    document.body.appendChild(wrap);
    const done=v=>{wrap.remove();document.removeEventListener('keydown',onKey,true);resolve(v==='cancel'?null:v);};
    const onKey=e=>{if(e.key==='Escape'){e.preventDefault();done('cancel');}};
    wrap.addEventListener('click',e=>{
      const b=e.target.closest('[data-v]');
      if(b){done(b.dataset.v);return;}
      if(e.target===wrap)done('cancel');
    });
    document.addEventListener('keydown',onKey,true);
    const f=wrap.querySelector('.samenew-same');if(f)f.focus();
  });
}
// list the OTHER scenes of a day as menu targets (for Move to / Copy to)
function otherSceneTargets(d,fromIdx){
  return d.scenes.map((s,i)=>({i,label:(s.num?('Scene '+s.num):('Scene '+(i+1)))+(s.part?' pt '+s.part:'')}))
    .filter(t=>t.i!==fromIdx);
}
// open the per-group action menu (Move / Copy / Delete) at x,y
function openCrowdGroupMenu(x,y,ctx){
  const {d,idx,g}=ctx;
  const targets=otherSceneTargets(d,idx);
  const items=[];
  if(targets.length){
    items.push({label:'Move to scene…',icon:'arrow-right',onClick:()=>{
      openCtxMenu(x,y,targets.map(t=>({label:t.label,onClick:()=>{
        moveCrowdGroup(d,idx,g,t.i);setStatus(crowdGroupLabel(g)+' moved to '+t.label.toLowerCase()+'.',{undo:crowdUndo});
      }})));
    }});
    items.push({label:'Copy to scene…',icon:'copy',onClick:()=>{
      openCtxMenu(x,y,targets.map(t=>({label:t.label,onClick:async()=>{
        const mode=await askSamePeople(g,d.scenes[t.i].num||(t.i+1));
        if(!mode)return;
        copyCrowdGroup(d,idx,g,t.i,mode);
        setStatus(crowdGroupLabel(g)+(mode==='new'?' added as new people to ':' copied (same people) to ')+t.label.toLowerCase()+'.',{undo:crowdUndo});
      }})));
    }});
    items.push({sep:true});
  }
  items.push({label:'Delete from this scene',icon:'trash',danger:true,onClick:()=>{
    deleteCrowdGroup(d,idx,g);setStatus(crowdGroupLabel(g)+' removed from this scene.',{undo:crowdUndo});
  }});
  openCtxMenu(x,y,items);
}
// A day imported by the quick parser can have no scenes at all, yet the user
// still needs to record its crowd. Crowd only lives on scenes, so we hang it on
// a single flagged "holder" scene: the cost engine and every crowd view count
// it, but it is not a real scene — excluded from scene counts and from the day
// card's scene strip, and pruned again if its crowd is cleared.
function realScenes(d){return d.scenes.filter(sc=>!sc._ch);}
function ensureCrowdScene(d){
  if(!d)return null;
  const h=d.scenes.find(sc=>sc._ch);
  if(h)return h;
  if(realScenes(d).length)return null; // real scenes already carry the crowd
  const s=sceneStub('',d.unit);s._ch=true;d.scenes.push(s);return s;
}
function pruneCrowdScene(d){
  if(!d)return;
  for(let i=d.scenes.length-1;i>=0;i--){
    const sc=d.scenes[i];
    if(sc._ch&&!(sc.sa>0)&&!(sc.saChars&&sc.saChars.length)&&!(sc.featured&&sc.featured.length)&&!(sc.spacts&&sc.spacts.length))d.scenes.splice(i,1);
  }
}
const KIND_LABEL={oneliner:'One-liner',fullfat:'Full Fat',merged:'One-liner + Full Fat',photo:'Photographed pages'};
function rpChangesHtml(prev,nextModel,mergeStats,carry){
  let html='';
  const cap=(arr,f)=>arr.slice(0,8).map(f).join('')+(arr.length>8?`<div class="revline more">+${arr.length-8} more</div>`:'');
  const dayLine=d=>`<div class="revline"><b>D${d.num}</b> ${esc(d.date||'undated')}${d.loc?' · '+esc(d.loc.slice(0,38)):''} · ${d.scenes.length} sc</div>`;
  if(carry){
    // content-matched revision diff (diffRevisions) — scenes are the anchor,
    // days matched by scene overlap, vanished past days = shot history
    const D=carry.diff,plan=carry.plan;
    const fresh=D.shotDays.filter(d=>!d.carried),older=D.shotDays.filter(d=>d.carried);
    const reshaped=D.matches.filter(m=>m.renumbered||m.dateMoved);
    const shapeLine=m=>`<div class="revline"><b>D${m.oldDay.num}</b> ${esc((m.oldDay.date||'').slice(0,22))} → <b>D${m.newDay.num}</b> ${esc((m.newDay.date||'').slice(0,22))} · ${Math.round(m.overlap*100)}% same scenes</div>`;
    const sceneLine=s=>`<div class="revline"><b>${esc(s.key)}</b> ${esc((s.oldDay?'D'+s.oldDay.num+' → D'+s.newDay.num:'D'+s.day.num))}</div>`;
    html+=`<div class="rp-sec-title">Changes vs ${esc(revLabel(prev))} (current revision)</div>`;
    if(D.shotDays.length||D.collisions.length){
      html+=`<div class="rev-sec info"><h4>Already shot — kept<span>${D.shotDays.length}</span></h4>
        <div class="revline">${fresh.length?`<b>${fresh.length}</b> day${fresh.length===1?'':'s'} shot since ${esc(revLabel(prev))}`:''}${fresh.length&&older.length?' · ':''}${older.length?`<b>${older.length}</b> carried from earlier revisions`:''} — these stay on the board with all your work, so totals remain the whole production.</div>
        ${cap(fresh,dayLine)}
        ${D.collisions.length?`<div class="revline none">${icon('warn')} ${D.collisions.length} past day${D.collisions.length===1?'':'s'} could not be kept — the new schedule reuses their day number${D.collisions.length===1?'':'s'} (${esc(D.collisions.map(d=>'D'+d.num).join(', '))}). Their work stays on ${esc(revLabel(prev))}.</div>`:''}
      </div>`;
    }
    html+=`<div class="rev-sec ok"><h4>New shoot days<span>${D.addedDays.length}</span></h4>${D.addedDays.length?cap(D.addedDays,dayLine):'<div class="revline none">No new shoot days.</div>'}</div>`;
    html+=`<div class="rev-sec bad"><h4>Days cut<span>${D.cutDays.length}</span></h4>${D.cutDays.length?cap(D.cutDays,dayLine):'<div class="revline none">No upcoming days dropped.</div>'}</div>`;
    html+=`<div class="rev-sec warn"><h4>Days renumbered / moved<span>${reshaped.length+D.supersededDays.length}</span></h4>${reshaped.length?cap(reshaped,shapeLine):'<div class="revline none">No days moved.</div>'}
      ${D.supersededDays.length?`<div class="revline">Replanned — the day didn't happen as scheduled; its scenes now shoot later: ${esc(D.supersededDays.map(d=>'D'+d.num).join(', '))}. Scene edits follow the scenes; day-level work stays on ${esc(revLabel(prev))}.</div>`:''}
      <div class="revline none">Matched by scene content, not day number — your day work follows the match.</div></div>`;
    html+=`<div class="rev-sec warn"><h4>Scene changes<span>${D.scenes.moved.length+D.scenes.added.length+D.scenes.cut.length}</span></h4>
      <div class="revline">${D.scenes.same} scenes unchanged · <b>${D.scenes.moved.length}</b> moved day · <b>${D.scenes.added.length}</b> added · <b>${D.scenes.cut.length}</b> cut${D.scenes.shot.length?` · ${D.scenes.shot.length} already shot`:''}</div>
      ${cap(D.scenes.moved,sceneLine)}
      ${D.scenes.added.length?`<div class="revline none">Added: ${esc(D.scenes.added.slice(0,10).map(s=>s.key).join(', '))}${D.scenes.added.length>10?' +'+(D.scenes.added.length-10)+' more':''}</div>`:''}
      ${D.scenes.cut.length?`<div class="revline none">Cut: ${esc(D.scenes.cut.slice(0,10).map(s=>s.key).join(', '))}${D.scenes.cut.length>10?' +'+(D.scenes.cut.length-10)+' more':''}</div>`:''}
    </div>`;
    const carried=plan.dayMoves.length+plan.sceneMoves.length;
    const strandLine=x=>`<div class="revline"><b>${esc(x.scene||x.from)}</b> ${esc(x.label)} — ${x.scene?'scene not in the new schedule':'day dissolved'}; stays on ${esc(revLabel(prev))}</div>`;
    html+=`<div class="rev-sec ${plan.dayStranded.length+plan.sceneStranded.length?'warn':'ok'}"><h4>Your work<span>${carried}</span></h4>
      ${carried?`<div class="revline"><b>${carried}</b> edit${carried===1?'':'s'} will carry over — crowd/stunt scene edits follow their scenes, day calculators & notes follow their days. Nothing moves until you publish.</div>`:'<div class="revline none">No saved work on the current revision yet.</div>'}
      ${cap([...plan.sceneStranded,...plan.dayStranded],strandLine)}
    </div>`;
    // Cast list: a new document that omits it inherits the numbers→names from
    // the current revision, so "9" still reads as its character, not a bare code.
    if(carry.castListMissing)html+=`<div class="rev-sec ok"><h4>Cast list<span>kept</span></h4>
      <div class="revline">This document has no cast list, so all <b>${carry.castCount}</b> cast names carry forward from ${esc(revLabel(prev))} — the numbers still show their characters.</div></div>`;
  }else if(prev){
    const prevM=prev.model;
    const key=d=>d.id||((d.unit||'Main')+'|'+d.num);
    const P=new Map(prevM.days.map(d=>[key(d),d]));
    const N=new Map(nextModel.days.map(d=>[key(d),d]));
    const adds=[...N.values()].filter(d=>!P.has(key(d)));
    const dels=[...P.values()].filter(d=>!N.has(key(d)));
    // compare dates as calendar days, not strings — "Wednesday, 23 April 2025",
    // "Wednesday 23rd April 2025" and "2025-04-23" are the same day, not a
    // shift. Three tiers: engine-parsed _date, punctuation-insensitive string,
    // then a Date.parse of each side.
    const asDay=d=>{
      if(d._date)return d._date.toDateString();
      const t=Date.parse((d.date||'').replace(/(\d+)(st|nd|rd|th)\b/gi,'$1'));
      return isNaN(t)?null:new Date(t).toDateString();
    };
    const sameDate=(a,b)=>{
      const na=(a.date||'').toLowerCase().replace(/[^a-z0-9]/g,''),nb=(b.date||'').toLowerCase().replace(/[^a-z0-9]/g,'');
      if(na===nb)return true;
      const da=asDay(a),db=asDay(b);
      return !!da&&da===db;
    };
    const shifts=[...N.values()].map(d=>({p:P.get(key(d)),n:d})).filter(x=>x.p&&x.p.date&&x.n.date&&!sameDate(x.p,x.n));
    const shiftLine=x=>`<div class="revline"><b>D${x.n.num}</b> <s>${esc(x.p.date||'—')}</s> → ${esc(x.n.date||'—')}</div>`;
    html+=`<div class="rp-sec-title">Changes vs ${esc(revLabel(prev))} (current revision)</div>`;
    html+=`<div class="rev-sec ok"><h4>Additions<span>${adds.length}</span></h4>${adds.length?cap(adds,dayLine):'<div class="revline none">No new shoot days.</div>'}</div>`;
    html+=`<div class="rev-sec bad"><h4>Deletions<span>${dels.length}</span></h4>${dels.length?cap(dels,dayLine):'<div class="revline none">No dropped shoot days.</div>'}</div>`;
    html+=`<div class="rev-sec warn"><h4>Date shifts<span>${shifts.length}</span></h4>${shifts.length?cap(shifts,shiftLine):'<div class="revline none">No days moved.</div>'}</div>`;
  }else{
    html+=`<div class="rp-sec-title">Changes</div><div class="rev-sec"><div class="revline none">Baseline upload — first schedule for this unit, nothing to compare against yet.</div></div>`;
  }
  if(mergeStats){
    const ms=mergeStats;
    html+=`<div class="rev-sec info"><h4>Full Fat detail</h4>
      <div class="revline">${ms.matched} of ${ms.spineScenes} scenes matched · SA ${ms.saHeads} · SPACT ${ms.spactHeads} · Stunts ${ms.stuntHeads} · Featured ${ms.featuredHeads}</div>
      ${ms.unmatchedSpine.length?`<div class="revline none">No detail found for scenes ${esc(ms.unmatchedSpine.slice(0,10).join(', '))}${ms.unmatchedSpine.length>10?' +'+(ms.unmatchedSpine.length-10)+' more':''} — kept the one-liner's counts</div>`:''}
      ${ms.unmatchedDetail.length?`<div class="revline none">Detail scenes not on any shoot day: ${esc(ms.unmatchedDetail.slice(0,10).join(', '))}${ms.unmatchedDetail.length>10?' +'+(ms.unmatchedDetail.length-10)+' more':''}</div>`:''}
    </div>`;
  }
  const mode=modeWord();
  const before=prev?costsFor(prev)[mode]:0;
  const after=costsFor({model:nextModel,ns:prev?prev.ns:null})[mode];
  const varc=after-before;
  html+=`<div class="rev-sec"><h4>${mode==='crowd'?'Crowd':'Stunt'} budget</h4>
    ${prev?`<div class="revrow"><span>Current total</span><b>${gbp(Math.round(before))}</b></div>`:''}
    <div class="revrow"><span>${prev?'New proposed':'Projected total'}</span><b>${gbp(Math.round(after))}</b></div>
    ${prev?`<div class="revrow total"><span>Projected variance</span><b style="color:${varc>0?'#e5534b':varc<0?'#4cc38a':'var(--sub)'}">${varc>=0?'+':'−'}${gbp(Math.abs(Math.round(varc)))}</b></div>`:''}
    <div class="revline none">Showing ${mode} figures (${mode==='crowd'?'Crowd':'Stunt'} mode) — switch modes to review the other.</div>
  </div>`;
  return html;
}
function rpBlanksOf(m){
  let n=0;
  for(const d of m.days){if(!(d.date||'').trim())n++;if(!(d.loc||'').trim())n++;}
  return n;
}
function rpRefreshCounts(){
  const open=$('#rpQuestions')?$('#rpQuestions').querySelectorAll('.qcard').length:0;
  const el=document.getElementById('rpAttnN');if(el)el.textContent=open;
  const note=$('#rpNote');
  if(note)note.innerHTML=open>0
    ?`<b>${open}</b> question${open===1?'':'s'} unanswered — publish anyway and fill in later, or answer above.`
    :'All questions handled. Publishing keeps everything editable in the app.';
}
function openReview({prev,nextModel,mergeStats,onAccept,ctx}){
  REV_CB=onAccept;REV_CTX=ctx;const token=++REV_OPEN;
  ctx=ctx||{};
  // header
  $('#rpCrumbs').innerHTML=`<b>${esc(ctx.prod||'')}</b> · ${esc(ctx.unit||'Main')} Unit · ${ctx.mode==='merge'?'detail merge into current revision':ctx.mode==='recheck'?'re-checked reading — replaces the current revision':'new revision'}`;
  $('#rpFile').textContent=ctx.files||'';
  $('#rpKinds').innerHTML=ctx.docKind?`<span class="kindchip">${esc(KIND_LABEL[ctx.docKind]||ctx.docKind)}</span>`:'';
  const rev=$('#rpRev');
  rev.value=(ctx.version||'').toUpperCase()||'V1';
  rev.readOnly=ctx.mode==='merge'||ctx.mode==='recheck';
  const rawModel=ctx.rawModel||null; // the stored model — edits go here too, so they survive reload
  const rawDayOf=num=>rawModel?rawModel.days.find(x=>x.num===num):null;
  const questions=(ctx.questions||[]).filter(q=>{
    const known=glossaryFor(ctx.prod).some(g=>g.term.toLowerCase()===(q.term||'').toLowerCase());
    return !known&&(q.term||'').trim();
  });
  function renderStats(){
    const scenes=nextModel.days.reduce((a,d)=>a+realScenes(d).length,0);
    const qEl=$('#rpQuestions');
    const open=qEl&&qEl.innerHTML?qEl.querySelectorAll('.qcard').length:questions.length;
    const blanks=rpBlanksOf(nextModel);
    $('#rpStats').innerHTML=`
      <div class="rp-stat"><div class="n">${nextModel.days.length}</div><div class="l">Days parsed</div></div>
      <div class="rp-stat"><div class="n">${scenes}</div><div class="l">Scenes found</div></div>
      <div class="rp-stat"><div class="n">${modelSaDays(nextModel).toLocaleString()}</div><div class="l">SA artiste-days</div></div>
      <div class="rp-stat ${open?'attn':''}"><div class="n" id="rpAttnN">${open}</div><div class="l">Need attention</div></div>
      <div class="rp-stat ${blanks?'attn':''}"><div class="n">${blanks}</div><div class="l">Fields blank</div></div>`;
  }
  function renderChanges(){
    // deterministic day-count check: the document's own "End Day N" markers say
    // how many shoot days to expect — if the read disagrees, say so loudly
    // (AI reads vary; this is the honest tripwire)
    const endDayNums=new Set(((ctx.text||'').match(/End\s+Day\s*#?\s*\d+/gi)||[]).map(s=>s.match(/\d+/)[0]));
    let checkHtml='';
    if(endDayNums.size>=5&&Math.abs(endDayNums.size-nextModel.days.length)>2){
      checkHtml=`<div class="rev-sec warn"><h4>Day-count check</h4><div class="revline">The document's own “End Day” markers suggest <b>${endDayNums.size}</b> shoot days, but this read found <b>${nextModel.days.length}</b>. AI reads can vary — consider Cancel and re-importing before you publish.</div></div>`;
    }
    $('#rpChanges').innerHTML=checkHtml+rpChangesHtml(prev,nextModel,mergeStats,ctx.carry);
  }
  renderStats();
  renderChanges();
  // ---- AI cross-read: a second opinion on every regex-parsed upload ----
  // The quick parser is deterministic but layouts vary (Practical Magic read
  // its locations from sluglines); the AI reads the same text in the
  // background and the two are compared day-by-day. One click adopts the AI
  // version — it re-drives the import so diffs/carry are recomputed properly.
  const crossSlot=$('#rpCross');
  if(crossSlot)crossSlot.innerHTML='';
  if(ctx.crossCheck&&crossSlot&&!aiBlocked(ctx.prod)){
    // The AI cross-read costs an API call, so it's opt-in: we show a button and
    // only read with AI when the user asks — never automatically on open.
    const runCross=()=>{
    crossSlot.innerHTML=`<div class="rev-sec info"><h4>AI cross-check</h4><div class="revline none"><span class="crossspin"></span> Reading the same document with AI to double-check the quick parser…</div></div>`;
    aiParse(ctx.text,ctx.prod).then(r=>{
      if(token!==REV_OPEN)return; // review was closed/reopened meanwhile
      const ai=prepModel(JSON.parse(JSON.stringify(r.model)),ctx.unit==='2nd'?'2nd':'Main');
      const keyOf=d=>d._date?d._date.toDateString():('n'+d.num);
      const A=new Map(nextModel.days.filter(d=>!d.carried).map(d=>[keyOf(d),d]));
      const B=new Map(ai.days.map(d=>[keyOf(d),d]));
      const diffs=[];
      for(const [k,da] of A){
        const db=B.get(k);
        if(!db){diffs.push(`<div class="revline"><b>D${da.num}</b> ${esc(chipDate(da))} — only in the quick parse</div>`);continue}
        const sa1=daySaTotal(da),sa2=daySaTotal(db);
        if(da.scenes.length!==db.scenes.length||sa1!==sa2)
          diffs.push(`<div class="revline"><b>D${da.num}</b> ${esc(chipDate(da))} — scenes ${da.scenes.length} vs ${db.scenes.length} · SA ${sa1} vs ${sa2}</div>`);
      }
      for(const [k,db] of B)if(!A.has(k))diffs.push(`<div class="revline"><b>D${db.num}</b> ${esc(chipDate(db))} — only in the AI read</div>`);
      window.__crossSwap={token,ctx,aiModel:r.model};
      crossSlot.innerHTML=diffs.length
        ?`<div class="rev-sec warn"><h4>AI cross-check<span>${diffs.length}</span></h4>
            <div class="revline">The two readings disagree on ${diffs.length} day${diffs.length===1?'':'s'} (quick parser vs AI). If the board looks wrong after publishing, the AI reading is probably the better one for this layout.</div>
            ${diffs.slice(0,8).join('')}${diffs.length>8?`<div class="revline more">+${diffs.length-8} more</div>`:''}
            <div style="margin-top:9px"><button class="tb-btn" data-usecrossai>Use the AI reading instead</button></div>
          </div>`
        :`<div class="rev-sec ok"><h4>AI cross-check</h4><div class="revline">The AI read the document independently and agrees with the quick parser — ${nextModel.days.filter(d=>!d.carried).length} days, same scene and SA counts throughout.</div></div>`;
    }).catch(err=>{
      if(token!==REV_OPEN)return;
      crossSlot.innerHTML=`<div class="rev-sec"><h4>AI cross-check</h4><div class="revline none">Couldn’t run the AI cross-read (${esc(err.message)}) — the quick parser’s reading stands.</div></div>`;
    });
    };
    // resting state: no AI has run yet — offer it as a button
    crossSlot.innerHTML=`<div class="rev-sec info"><h4>AI cross-check</h4><div class="revline">The quick parser has read this schedule. For a second opinion, read it with AI — the two readings are then compared day-by-day.<div style="margin-top:9px"><button class="tb-btn" data-runcross>Read with AI</button></div></div></div>`;
    const crossBtn=crossSlot.querySelector('[data-runcross]');
    if(crossBtn)crossBtn.addEventListener('click',runCross);
  }
  // clarifying questions + glossary-applied strip
  const applied=glossaryFor(ctx.prod).filter(g=>g.term.length>1&&(ctx.text||'').toLowerCase().includes(g.term.toLowerCase())).slice(0,6);
  let qHtml='';
  if(questions.length||applied.length)qHtml+=`<div class="rp-sec-title">Needs your attention<span class="cnt">${questions.length} question${questions.length===1?'':'s'}</span></div>`;
  qHtml+=questions.map((q,i)=>`
    <div class="qcard" data-qi="${i}" data-term="${esc(q.term)}" style="margin-bottom:8px">
      ${q.days&&q.days.length?`<span class="days">Day${q.days.length===1?'':'s'} ${q.days.slice(0,6).join(', ')}${q.days.length>6?'…':''}</span>`:''}
      <div class="kind">Unknown notation</div>
      <div class="qsrc${ctx.viewer&&ctx.viewer.pdfs&&ctx.viewer.pdfs.length?' findable':''}" data-qfind="${esc(q.source||q.term)}" title="Find this line in the original">${esc(q.source||q.term)}</div>
      <div class="qask">${esc(q.question||('What does “'+q.term+'” mean?'))}</div>
      <div class="qrow">
        <input type="text" placeholder="What it means…" aria-label="Answer for ${esc(q.term)}">
        <div class="qscope"><button class="on" data-scope="global" type="button">Apply globally</button><button data-scope="prod" type="button">This production only</button></div>
        <button class="qbtn save" type="button">Save answer</button>
        <button class="qbtn skip" type="button">Skip — leave blank</button>
      </div>
    </div>`).join('');
  if(applied.length)qHtml+=`<div class="rp-gloss" style="margin-top:6px">Applied from your glossary: ${applied.map(g=>`<b>${esc(g.term)}</b> → ${esc(g.answer)}`).join(' · ')}</div>`;
  $('#rpQuestions').innerHTML=qHtml;
  // full day table — dates, locations and crowd numbers are editable in place;
  // ✕ deletes a day before it ever reaches the board (e.g. already-shot
  // material). Days that carry named crowd groups get an expandable makeup row
  // so each group can be corrected here rather than deep in the full schedule.
  function crowdCell(d){
    const named=dayNamedSA(d);
    if(!named.length){
      // quick inline total edit, plus a ＋ to open the drawer and add named groups
      return `<td class="num"><span class="rp-crowdcell"><input class="rp-edit rp-num" data-f="crowd" data-dnum="${d.num}" inputmode="numeric" value="${dayAnonSA(d)}" aria-label="Crowd for D${d.num}"><button type="button" class="rp-crowdtog mini" data-dnum="${d.num}" aria-expanded="false" title="Add named characters to D${d.num}">＋</button></span></td>`;
    }
    // named groups present: total is the sum of the parts, edited via the drawer
    return `<td class="num"><button type="button" class="rp-crowdtog" data-dnum="${d.num}" aria-expanded="false" title="Edit crowd makeup for D${d.num}"><span class="tv" data-crowdtot="${d.num}">${daySaTotal(d)||'—'}</span><span class="cv">▸</span></button></td>`;
  }
  // The drawer treats the day as ONE crowd total broken down into named
  // character groups. The total is editable; each group is carved out of it;
  // whatever is left over stays as unnamed background SA ("still to break down").
  // Background extras and SA are the same thing, so there's no separate SA line —
  // the leftover IS the unnamed SA.
  function crowdFoot(d){
    const total=daySaTotal(d),un=dayAnonSA(d);
    const msg=un>0
      ?`<b data-crowdunalloc="${d.num}">${un}</b> of <b data-crowdtot="${d.num}">${total}</b> still to break down into characters`
      :`All <b data-crowdtot="${d.num}">${total}</b> assigned to characters<span data-crowdunalloc="${d.num}" hidden>0</span>`;
    return `<div class="rp-crowdfoot ${un>0?'':'done'}">${msg}</div>`;
  }
  function crowdDrawer(d){
    const named=dayNamedSA(d);
    const namedLine=g=>`<div class="rp-crowdit named"><input class="rp-edit rp-cname" data-f="crowdName" data-dnum="${d.num}" data-name="${esc(g.name)}" value="${esc(g.name)}" placeholder="Character / group" aria-label="Name of crowd group on D${d.num}"><input class="rp-edit rp-num" data-f="crowdNamed" data-dnum="${d.num}" data-name="${esc(g.name)}" inputmode="numeric" value="${g.count}" aria-label="${esc(g.name)} count for D${d.num}"><button type="button" class="rp-crowddel" data-dnum="${d.num}" data-name="${esc(g.name)}" title="Remove ${esc(g.name)}">✕</button></div>`;
    return `<tr class="rp-crowdrow" data-crowdfor="${d.num}" hidden><td></td><td colspan="6">
      <div class="rp-crowdbox">
        <div class="rp-crowdhd"><span>Crowd makeup · D${d.num}</span><label class="rp-crowdtot-ed">Total crowd <input class="rp-edit rp-num" data-f="crowdTotal" data-dnum="${d.num}" inputmode="numeric" value="${daySaTotal(d)}" aria-label="Total crowd for D${d.num}"></label></div>
        <div class="rp-crowdgrid">
          ${named.length?named.map(namedLine).join(''):'<div class="rp-crowdnone">No character groups yet — add one to start breaking this crowd down.</div>'}
        </div>
        <button type="button" class="rp-crowdadd" data-dnum="${d.num}">+ Add character group</button>
        ${crowdFoot(d)}
      </div></td></tr>`;
  }
  function renderTable(){
    const rows=nextModel.days.map(d=>{
      const cast=new Set();for(const sc of d.scenes)for(const c of sc.cast||[])cast.add(c.code);
      return `<tr data-dnum="${d.num}"><td class="dchip">D${d.num}</td>
        <td><input class="rp-edit" data-f="date" value="${esc(d.date||'')}" placeholder="date ?" aria-label="Date for D${d.num}"></td>
        <td><input class="rp-edit" data-f="loc" value="${esc(d.loc||'')}" placeholder="location ?" aria-label="Location for D${d.num}"></td>
        ${crowdCell(d)}
        <td class="num">${cast.size||'—'}</td>
        <td class="num">${realScenes(d).length}</td>
        <td><button class="rp-delday" data-deldaynum="${d.num}" title="Delete this day — it won't be published">✕</button></td></tr>${crowdDrawer(d)}`;
    }).join('');
    const follow=ctx.viewer&&ctx.viewer.pdfs&&ctx.viewer.pdfs.length;
    $('#rpTable').innerHTML=`<div class="rp-sec-title">Day by day<span class="cnt">${nextModel.days.length} days · ${follow?'click a row to find it in the original · ':''}click a date, location or crowd number to edit · ✕ removes a day</span></div>
      <div class="rp-tblwrap"><table class="rp-tbl${follow?' followable':''}"><thead><tr><th>Day</th><th>Date</th><th>Location</th><th class="num">Crowd</th><th class="num">Cast</th><th class="num">Scenes</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  // recompute the shown totals + remainder in place so an edit never re-renders
  // the table and steals focus/scroll
  function refreshCrowd(num,exceptEl){
    const d=nextModel.days.find(x=>x.num===num);if(!d)return;
    const total=daySaTotal(d);
    const scope=$('#rpTable');
    scope.querySelectorAll(`.tv[data-crowdtot="${num}"]`).forEach(el=>{el.textContent=total||'—';});
    scope.querySelectorAll(`[data-f="crowd"][data-dnum="${num}"],[data-f="crowdTotal"][data-dnum="${num}"]`).forEach(el=>{if(el!==exceptEl)el.value=total;});
    const row=scope.querySelector(`.rp-crowdrow[data-crowdfor="${num}"]`);
    if(row){const foot=row.querySelector('.rp-crowdfoot');if(foot)foot.outerHTML=crowdFoot(d);}
  }
  function openDrawer(num){
    const row=$('#rpTable').querySelector(`.rp-crowdrow[data-crowdfor="${num}"]`);
    const tog=$('#rpTable').querySelector(`.rp-crowdtog[data-dnum="${num}"]`);
    if(row)row.hidden=false;
    if(tog){tog.setAttribute('aria-expanded','true');tog.classList.add('open');}
    return row;
  }
  // add/remove change a day's structure (and can flip its Crowd cell between the
  // inline number and the makeup chip), so re-render then reopen the drawer
  function afterStructural(num,focusSel){
    ctx.edited=true;
    renderStats();renderChanges();renderTable();
    const row=openDrawer(num);
    if(row&&focusSel){const el=row.querySelector(focusSel);if(el){el.focus();if(el.select)el.select();}}
  }
  const dayAndRaw=num=>{
    const d=nextModel.days.find(x=>x.num===num);
    const rd=rawDayOf(num);
    // rdSep is the raw day only when it holds a DIFFERENT scenes array, so
    // structural writes (adding a holder or a group) don't double-apply to a
    // shared array
    const rdd=(rd&&d&&rd.scenes!==d.scenes)?rd:null;
    return {d,rd,rdSep:rdd};
  };
  renderTable();
  $('#rpTable').onchange=e=>{
    if(token!==REV_OPEN)return;
    const inp=e.target.closest('.rp-edit');if(!inp)return;
    const f=inp.dataset.f;
    // set the day's TOTAL crowd (inline cell, or the drawer's "Total crowd") —
    // leftover after the named groups stays as unnamed background SA
    if(f==='crowd'||f==='crowdTotal'){
      const num=+inp.dataset.dnum;
      const {d,rd,rdSep}=dayAndRaw(num);if(!d)return;
      const T=Math.max(0,Math.round(+inp.value||0));
      if(T>0){ensureCrowdScene(d);if(rdSep)ensureCrowdScene(rdSep);} // scene-less day needs a holder
      const named=dayNamedSA(d).reduce((a,g)=>a+g.count,0);
      const newAnon=Math.max(0,T-named); // total can't drop below what's named
      setDayAnonSA(d,newAnon);if(rd)setDayAnonSA(rd,newAnon);
      pruneCrowdScene(d);if(rdSep)pruneCrowdScene(rdSep);
      inp.value=daySaTotal(d);
      refreshCrowd(num,inp);
      ctx.edited=true;
      renderStats();renderChanges();
      return;
    }
    // a named group's count — carve it out of (or return it to) the background so
    // the day total stays put while you break it down
    if(f==='crowdNamed'){
      const num=+inp.dataset.dnum;
      const {d,rd,rdSep}=dayAndRaw(num);if(!d)return;
      const name=inp.dataset.name;
      const oldCount=(dayNamedSA(d).find(g=>g.name===name)||{count:0}).count;
      const n=Math.max(0,Math.round(+inp.value||0));
      const newAnon=Math.max(0,dayAnonSA(d)-(n-oldCount));
      setDayNamedSA(d,name,n);if(rd)setDayNamedSA(rd,name,n);
      setDayAnonSA(d,newAnon);if(rd)setDayAnonSA(rd,newAnon);
      pruneCrowdScene(d);if(rdSep)pruneCrowdScene(rdSep);
      inp.value=n;
      refreshCrowd(num);
      ctx.edited=true;
      renderStats();renderChanges();
      return;
    }
    // rename a named crowd group — empty name removes it
    if(f==='crowdName'){
      const num=+inp.dataset.dnum;
      const {d,rd,rdSep}=dayAndRaw(num);if(!d)return;
      const oldName=inp.dataset.name,newName=inp.value.trim();
      if(newName===oldName)return;
      if(!newName){ // clearing the name removes the group; its people return to background
        const removed=(dayNamedSA(d).find(g=>g.name===oldName)||{count:0}).count;
        const newAnon=dayAnonSA(d)+removed;
        removeDayNamed(d,oldName);if(rd)removeDayNamed(rd,oldName);
        setDayAnonSA(d,newAnon);if(rd)setDayAnonSA(rd,newAnon);
        pruneCrowdScene(d);if(rdSep)pruneCrowdScene(rdSep);
        afterStructural(num);return;
      }
      renameDayNamed(d,oldName,newName);if(rd)renameDayNamed(rd,oldName,newName);
      // keep this row's sibling inputs pointed at the new name
      inp.dataset.name=newName;
      const it=inp.closest('.rp-crowdit');
      if(it)it.querySelectorAll('[data-name]').forEach(el=>{el.dataset.name=newName;});
      refreshCrowd(num);
      ctx.edited=true;
      renderStats();renderChanges();
      return;
    }
    const num=+inp.closest('tr').dataset.dnum;
    const d=nextModel.days.find(x=>x.num===num);if(!d)return;
    const v=inp.value.trim();
    if(f==='date'){d.date=v;d._date=parseDayDate(d);}
    else d.loc=v;
    const rd=rawDayOf(num);
    if(rd){if(f==='date')rd.date=v;else rd.loc=v;}
    ctx.edited=true;
    renderStats();renderChanges(); // the input already shows the new value — table stays put
  };
  $('#rpTable').onclick=e=>{
    if(token!==REV_OPEN)return;
    // add a new named crowd group to a day
    const add=e.target.closest('.rp-crowdadd');
    if(add){
      const num=+add.dataset.dnum;
      const {d,rdSep}=dayAndRaw(num);if(!d)return;
      ensureCrowdScene(d);if(rdSep)ensureCrowdScene(rdSep); // scene-less day needs a holder to hang the group on
      const name=freshNamedName(d);
      addDayNamed(d,name,0);if(rdSep)addDayNamed(rdSep,name,0);
      afterStructural(num,`.rp-crowdit.named [data-f="crowdName"][data-name="${name.replace(/"/g,'\\"')}"]`);
      return;
    }
    // remove a named crowd group — its people return to the background so the
    // day total is unchanged
    const rem=e.target.closest('.rp-crowddel');
    if(rem){
      const num=+rem.dataset.dnum,name=rem.dataset.name;
      const {d,rd,rdSep}=dayAndRaw(num);if(!d)return;
      const removed=(dayNamedSA(d).find(g=>g.name===name)||{count:0}).count;
      const newAnon=dayAnonSA(d)+removed;
      removeDayNamed(d,name);if(rd)removeDayNamed(rd,name);
      setDayAnonSA(d,newAnon);if(rd)setDayAnonSA(rd,newAnon);
      pruneCrowdScene(d);if(rdSep)pruneCrowdScene(rdSep);
      afterStructural(num);
      return;
    }
    // expand/collapse a day's crowd makeup drawer
    const tog=e.target.closest('.rp-crowdtog');
    if(tog){
      const num=+tog.dataset.dnum;
      const row=$('#rpTable').querySelector(`.rp-crowdrow[data-crowdfor="${num}"]`);
      if(row){row.hidden=!row.hidden;tog.setAttribute('aria-expanded',String(!row.hidden));tog.classList.toggle('open',!row.hidden);}
      return;
    }
    const del=e.target.closest('[data-deldaynum]');
    if(del){
      const num=+del.dataset.deldaynum;
      nextModel.days=nextModel.days.filter(x=>x.num!==num);
      if(rawModel)rawModel.days=rawModel.days.filter(x=>x.num!==num);
      ctx.edited=true;
      renderStats();renderChanges();renderTable();
      setStatus('D'+num+' removed — it won’t be published. Cancel discards every edit.');
      return;
    }
    // follow along: clicking a row scrolls the original to that shoot day
    if(e.target.closest('.rp-edit'))return; // editing a field, not navigating
    const tr=e.target.closest('tr[data-dnum]');if(!tr)return;
    const d=nextModel.days.find(x=>x.num===+tr.dataset.dnum);if(!d)return;
    $('#rpTable').querySelectorAll('tr.hl').forEach(r=>r.classList.remove('hl'));
    tr.classList.add('hl');
    setViewerVisible(true);
    followDayInOriginal(d);
  };
  // publish label follows the revision input
  const pub=$('#rpPublish');
  const syncPub=()=>{pub.textContent=ctx.mode==='merge'?('Apply detail to '+(rev.value.trim().toUpperCase()||revLabel(prev)||'current')):('Publish as '+(rev.value.trim().toUpperCase()||'UNTITLED')+' revision')};
  rev.oninput=syncPub;syncPub();
  rpRefreshCounts();
  $('#revPage').classList.add('open');
  // side-by-side original: render the uploaded PDF/photos on the right so the
  // read can be checked against the source before publishing
  openReviewViewer(ctx,token);
  // card interactions (scoped to this open; token guards stale handlers)
  $('#rpQuestions').onclick=e=>{
    if(token!==REV_OPEN)return;
    const card=e.target.closest('.qcard');if(!card)return;
    const scopeBtn=e.target.closest('.qscope button');
    if(scopeBtn){card.querySelectorAll('.qscope button').forEach(b=>b.classList.remove('on'));scopeBtn.classList.add('on');return;}
    // the quoted line: click it to find that exact text in the original
    const qf=e.target.closest('[data-qfind]');
    if(qf&&qf.classList.contains('findable')){
      setViewerVisible(true);
      findInOriginal([qf.dataset.qfind,card.dataset.term],'that line');
      return;
    }
    const term=card.dataset.term;
    if(e.target.closest('.qbtn.save')){
      const inp=card.querySelector('input[type=text]');
      const v=(inp&&inp.value.trim())||'';
      if(!v){inp&&inp.focus();setStatus('Type what it means — or Skip to leave it blank.');return;}
      const scope=card.querySelector('.qscope button.on');
      const prodScoped=scope&&scope.dataset.scope==='prod';
      upsertGlossary(term,v,prodScoped?ctx.prod:null);
      if(ctx.prod)logProdEvent(ctx.prod,'settings','Glossary: “'+term+'” = '+v+(prodScoped?' (this production only)':' (global)'));
      const done=document.createElement('div');
      done.className='qdone';done.style.marginBottom='8px';
      done.innerHTML=`<span style="color:#4cc38a;font-weight:700">✓</span><span class="term">“${esc(term)}”</span><span>= ${esc(v)}</span><span class="scopechip${prodScoped?' prod':''}">${prodScoped?esc(ctx.prod)+' only':'Global'}</span>`;
      card.replaceWith(done);
      setStatus('Saved to glossary — won’t be asked again.');
      rpRefreshCounts();
    }else if(e.target.closest('.qbtn.skip')){
      const done=document.createElement('div');
      done.className='qdone skipped';done.style.marginBottom='8px';
      done.innerHTML=`<span>—</span><span class="term">“${esc(term)}”</span><span>skipped — left blank for now</span>`;
      card.replaceWith(done);
      rpRefreshCounts();
    }
  };
}
$('#rpPublish').addEventListener('click',()=>{
  const cb=REV_CB;REV_CB=null;
  if(REV_CTX&&REV_CTX.mode!=='merge')REV_CTX.version=($('#rpRev').value||'').trim();
  $('#revPage').classList.remove('open');
  teardownViewer();
  if(cb)cb();
});
function discardReview(){REV_CB=null;REV_CTX=null;$('#revPage').classList.remove('open');teardownViewer();setStatus('Import discarded — nothing was changed.');}
// adopt the AI cross-read: re-drive the import with the AI model so the
// revision diff and work carry-over are recomputed against the better reading
document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-usecrossai]');
  if(!btn)return;
  const sw=window.__crossSwap;
  if(!sw||sw.token!==REV_OPEN){setStatus('That cross-read is stale — re-open the import.');return}
  window.__crossSwap=null;
  REV_CB=null;REV_CTX=null;$('#revPage').classList.remove('open');
  $('#impVer').value=($('#rpRev').value||'').trim(); // keep a label edited on the review page
  PENDING_IMPORT={...sw.ctx.pending,aiModel:sw.aiModel};
  setStatus('Switching to the AI reading…');
  $('#impGo').click();
});
$('#rpClose').addEventListener('click',discardReview);
$('#revPage').addEventListener('click',e=>{if(e.target.id==='revPage')discardReview()});

// Re-read the current schedule with the AI reader (prototype). Works both while
// importing a fresh PDF and while editing an already-imported one, so you can
// compare the AI's reading against the quick parser's on any schedule.
$('#impAI').addEventListener('click',async()=>{
  const btn=$('#impAI');
  const text=IMP_EDIT!=null?(SOURCES[IMP_EDIT]&&SOURCES[IMP_EDIT].text):(PENDING_IMPORT&&PENDING_IMPORT.text);
  const images=IMP_EDIT==null&&PENDING_IMPORT&&PENDING_IMPORT.images||null; // photographed imports re-read from their pages
  if(!text&&!(images&&images.length)){setStatus('Nothing to re-read — this schedule has no stored text.');return}
  const old=btn.textContent;btn.disabled=true;btn.textContent='AI reading…';setStatus('Asking AI to read the schedule…');
  aiBusy(true,'Re-reading schedule with AI…');
  try{
    const prodHint=IMP_EDIT!=null?(SOURCES[IMP_EDIT]&&SOURCES[IMP_EDIT].prod):resolveImpProd();
    const aiModel=(await aiParse(text||'',prodHint||null,images)).model;
    const preview=prepModel(JSON.parse(JSON.stringify(aiModel)),'Main');
    const scenes=preview.days.reduce((a,d)=>a+d.scenes.length,0);
    if(IMP_EDIT!=null){
      const s=SOURCES[IMP_EDIT];
      s.aiModel=aiModel;
      s.model=modelFrom(s,s.unit||'Main');
      saveUserSources();
      if(CLOUD.session&&s.cloudId)cloud.updateProduction(s.cloudId,s).catch(()=>{});
      if(!DASH&&ACTIVE===IMP_EDIT)setActive(IMP_EDIT);else{renderSidebar();if(DASH)renderDash();}
    }else if(PENDING_IMPORT){
      PENDING_IMPORT.aiModel=aiModel;
    }
    $('#impInfo').textContent=preview.days.length+' shoot days · '+scenes+' scenes found · read by AI';
    setStatus('AI read '+preview.days.length+' shoot days.');
  }catch(err){setStatus('AI read failed ('+err.message+').')}
  finally{aiBusy(false);btn.disabled=false;btn.textContent=old;}
});
function closeImp(){PENDING_IMPORT=null;IMP_EDIT=null;$('#impGo').textContent='Import schedule';$('#impModal').classList.remove('open')}
$('#impClose').addEventListener('click',closeImp);
$('#impModal').addEventListener('click',e=>{if(e.target.id==='impModal')closeImp()});
$('#fileInput').addEventListener('change',e=>{if(e.target.files.length)handleUploads(e.target.files);e.target.value='';});

// ---------- production settings modal (create / edit) ----------
// "+ Add schedule" imports a PDF into any production; "+ New production" sets
// one up first (name, rate card, default colour), then you import into it.
$('#btnAdd').addEventListener('click',()=>{
  const s=SOURCES[ACTIVE];
  openAddChooser(!DASH&&s&&s.kind?(s.prod||s.title):null,null);
});
let PM_EDIT=null; // name of the production being edited (null = creating new)
function openProdModal(name){
  PM_EDIT=name||null;
  $('#pmTitle').textContent=name?'Production settings':'New production';
  $('#pmName').value=name||'';
  $('#pmRate').innerHTML='<option value="">PACT/FAA 2026 (defaults)</option>'+Object.keys(cardsFor('sa')).map(n=>`<option>${esc(n)}</option>`).join('');
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
  const rateCard=rcName&&cardsFor('sa')[rcName]?{name:rcName,vals:cardsFor('sa')[rcName]}:null;
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
    // brand-new production: land on the add-day/import placeholder, then open
    // full settings straight away so locations/cast/info can be filled in
    // before any schedule goes in — closing settings reveals that placeholder
    CURPROD=name;showEmptyProd(name);openProdSettings(name);
  }else{
    if(SHOWING_EMPTY_PROD)showEmptyProd(SHOWING_EMPTY_PROD);else if(!DASH&&SOURCES[ACTIVE])setActive(ACTIVE);else{renderSidebar();if(DASH)renderDash();}
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
    deleteSourceFiles(s); // drop the stored original (local cache + account storage)
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
// tracks whether the board is currently showing THIS production's empty-state
// placeholder, so closing Production Settings for a brand-new production
// returns to it instead of jumping to whatever schedule was active before
let SHOWING_EMPTY_PROD=null;
function showEmptyProd(name){
  DASH=false;CURPROD=name;SHOWING_EMPTY_PROD=name;setBriefScope(null);
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
      <button class="tb-btn" id="epImport" style="border-color:var(--hv-line);color:var(--hv);padding:11px 16px">Import a schedule (PDF or photos)</button>
      <button class="tb-btn" id="epManual" style="padding:11px 16px">Add shoot days by hand</button>
    </div></div>`;
  renderSidebar();
  window.scrollTo(0,0);
}
document.addEventListener('click',e=>{
  if(e.target.closest('#epImport')){$('#fileInput').click();return}
  if(e.target.closest('#epManual')){
    // hand-built schedule inside the current production → bulk calendar
    if(CURPROD)createManualRevision(CURPROD,'Main');
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

// ---------- scene editor (Edit Scene / Add Scene — right-click menu) ----------
let SCENE_CTX=null; // {dayId, idx} — idx===-1 means "new scene, appended to the day"
function openSceneModal(dayId,idx){
  const d=(MODEL.days||[]).find(x=>x.id===dayId);if(!d)return;
  const isNew=idx==null;
  const s=isNew?sceneStub('',d.unit):d.scenes[idx];
  SCENE_CTX={dayId,idx:isNew?-1:idx};
  $('#smTitle').textContent=isNew?'Add scene':'Edit scene';
  $('#smSub').textContent='Day '+d.num+(d.loc?' · '+d.loc:'');
  $('#smNum').value=s.num||'';$('#smPart').value=s.part||'';$('#smIe').value=s.ie||'';
  $('#smTod').value=s.tod||'';$('#smScriptDay').value=s.scriptDay||'';$('#smPages').value=s.pages||'';
  $('#smSlug').value=s.slug||'';$('#smDesc').value=s.desc||'';
  $('#sceneModal').classList.add('open');
  setTimeout(()=>$('#smNum').focus(),0);
}
$('#smClose').addEventListener('click',()=>{$('#sceneModal').classList.remove('open');SCENE_CTX=null;});
$('#sceneModal').addEventListener('click',e=>{if(e.target.id==='sceneModal'){$('#sceneModal').classList.remove('open');SCENE_CTX=null;}});
// SCED (per-scene crowd/stunt requirements) and NOTES (scene notes) are keyed
// partly by the scene's array position within its day — shift or rename those
// keys so they stay attached to the right scene when a scene is deleted or renumbered.
function scenePosPrefix(d){return (NS?NS+'|':'')+(d.unit||'Main')+'|'+d.num+'|'}
function reindexScenePosRefs(d,fromIdx,delta){
  const shiftMap=(map,prefix)=>{
    const affected=[];
    for(const k of Object.keys(map)){
      if(!k.startsWith(prefix))continue;
      const rest=k.slice(prefix.length).split('|');
      const idx=+rest[rest.length-1];
      if(!Number.isFinite(idx)||idx<fromIdx)continue;
      affected.push({key:k,rest,idx,val:map[k]});
    }
    for(const a of affected)delete map[a.key];
    for(const a of affected)map[prefix+a.rest.slice(0,-1).concat(String(a.idx+delta)).join('|')]=a.val;
  };
  shiftMap(SCED,scenePosPrefix(d));
  shiftMap(NOTES,(NS?NS+'|':'')+(d.unit||'Main')+'|'+d.num+'|');
}
function renameSceneKeyRefs(d,idx,oldNum,oldPart,newNum,newPart){
  if((oldNum||'')===(newNum||'')&&(oldPart||'')===(newPart||''))return;
  const sp=scenePosPrefix(d),oldSK=sp+(oldNum||'')+'|'+(oldPart||'')+'|'+idx,newSK=sp+(newNum||'')+'|'+(newPart||'')+'|'+idx;
  if(SCED[oldSK]!==undefined){SCED[newSK]=SCED[oldSK];delete SCED[oldSK];}
  const np=(NS?NS+'|':'')+(d.unit||'Main')+'|'+d.num+'|',oldNK=np+(oldNum||'')+'|'+(oldPart||'')+'|'+idx,newNK=np+(newNum||'')+'|'+(newPart||'')+'|'+idx;
  if(NOTES[oldNK]!==undefined){NOTES[newNK]=NOTES[oldNK];delete NOTES[oldNK];}
}
// Manual days: full scene fields persist via manual_days.scenes. Imported
// (parsed/AI) days: the edit is promoted into a fresh aiModel snapshot — the
// same trick already used elsewhere to make hand-edits to a schedule survive a reload.
function persistDayScenes(d){
  const src=SOURCES[ACTIVE];
  if(d.manual){
    saveManualDays();
    if(CLOUD.session&&src&&src.cloudId)cloud.upsertManualDay(src.cloudId,d).then(r=>{if(r&&r.error)setStatus('Cloud save failed: '+r.error.message)});
  }else if(src){
    src.aiModel=JSON.parse(JSON.stringify(src.model));
    saveUserSources();
    if(CLOUD.session&&src.cloudId)cloud.updateProduction(src.cloudId,src).catch(()=>{});
  }
}
$('#smSave').addEventListener('click',()=>{
  if(!SCENE_CTX)return;
  const num=($('#smNum').value||'').trim();
  if(!num){setStatus('Give the scene a number.');return}
  const patch={num,part:($('#smPart').value||'').trim(),ie:($('#smIe').value||'').trim(),tod:($('#smTod').value||'').trim(),scriptDay:($('#smScriptDay').value||'').trim(),pages:($('#smPages').value||'').trim(),slug:($('#smSlug').value||'').trim(),desc:($('#smDesc').value||'').trim()};
  const d=(MODEL.days||[]).find(x=>x.id===SCENE_CTX.dayId);
  if(!d){$('#sceneModal').classList.remove('open');SCENE_CTX=null;return}
  if(SCENE_CTX.idx===-1){
    d.scenes.push(Object.assign(sceneStub(num,d.unit),patch));
  }else{
    const s=d.scenes[SCENE_CTX.idx];
    renameSceneKeyRefs(d,SCENE_CTX.idx,s.num,s.part,patch.num,patch.part);
    Object.assign(s,patch);
  }
  saveSced();store.set('stuntos-notes',JSON.stringify(NOTES));
  persistDayScenes(d);
  $('#sceneModal').classList.remove('open');
  const wasNew=SCENE_CTX.idx===-1;SCENE_CTX=null;
  refreshAll();
  setStatus(wasNew?'Scene '+num+' added.':'Scene '+num+' updated.');
});
function deleteSceneAt(dayId,idx){
  const d=(MODEL.days||[]).find(x=>x.id===dayId);if(!d||!d.scenes[idx])return;
  reindexScenePosRefs(d,idx+1,-1);
  d.scenes.splice(idx,1);
  saveSced();store.set('stuntos-notes',JSON.stringify(NOTES));
  persistDayScenes(d);
  refreshAll();
  setStatus('Scene deleted.');
}
function deleteManualDayById(id){
  const d=MODEL.days.find(x=>x.id===id);if(!d)return;
  if(!window.confirm('Remove '+d.id+' ('+d.date+')? Its day-calculator settings are kept in case you re-add it.'))return;
  MODEL.days=MODEL.days.filter(x=>x!==d);
  saveManualDays();
  const src=SOURCES[ACTIVE];
  if(CLOUD.session&&src&&src.cloudId)cloud.deleteManualDay(src.cloudId,d.unit,d.num).then(r=>{if(r&&r.error)setStatus('Cloud delete failed: '+r.error.message)});
  refreshAll();
}

// ---------- bulk add: pick every shoot date on a calendar, then quick-fill ----------
// A 60-day shoot is 60 clicks + one Generate, not 60 forms. Step 2 lists the
// generated days so scene numbers (comma-separated) and locations go in fast;
// everything stays editable on the board afterwards.
const BK={sel:new Set(),month:null};
const bkKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function bkTakenSet(unit){
  const set=new Set();
  for(const d of MODEL.days)if((d.unit||'Main')===unit&&d._date)set.add(bkKey(d._date));
  return set;
}
function bkMonthGrid(y,m,taken){
  const first=new Date(y,m,1);
  const label=first.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  const dows=['Mo','Tu','We','Th','Fr','Sa','Su'];
  let html=`<div class="bk-cal"><h5>${label}</h5><div class="bk-grid">`;
  html+=dows.map(d=>`<div class="dow">${d}</div>`).join('');
  const lead=(first.getDay()+6)%7; // Monday-start
  for(let i=0;i<lead;i++)html+='<div></div>';
  const days=new Date(y,m+1,0).getDate();
  for(let dd=1;dd<=days;dd++){
    const k=bkKey(new Date(y,m,dd));
    const cls='bk-day'+(BK.sel.has(k)?' sel':'')+(taken.has(k)?' taken':'');
    html+=`<button type="button" class="${cls}" data-bkday="${k}" ${taken.has(k)?'disabled title="This unit already has a day on this date"':''}>${dd}</button>`;
  }
  return html+'</div></div>';
}
function renderBkCals(){
  const unit=$('#bkUnit').value;
  const taken=bkTakenSet(unit);
  const y=BK.month.getFullYear(),m=BK.month.getMonth();
  $('#bkCals').innerHTML=bkMonthGrid(y,m,taken)+bkMonthGrid(y,m+1,taken);
  const a=new Date(y,m,1),b=new Date(y,m+1,1);
  $('#bkMonthLabel').textContent=a.toLocaleDateString('en-GB',{month:'short',year:'numeric'})+' – '+b.toLocaleDateString('en-GB',{month:'short',year:'numeric'});
  $('#bkCount').textContent=BK.sel.size?BK.sel.size+' date'+(BK.sel.size===1?'':'s')+' selected':'No dates selected';
}
function openBulkDays(unit){
  BK.sel.clear();
  if(unit)$('#bkUnit').value=unit;
  // start the calendar where the schedule ends (or this month)
  const last=MODEL.days.length?MODEL.days[MODEL.days.length-1]:null;
  BK.month=last&&last._date?new Date(last._date.getFullYear(),last._date.getMonth(),1):(()=>{const n=new Date();return new Date(n.getFullYear(),n.getMonth(),1)})();
  $('#bkStep1').style.display='';$('#bkStep2').style.display='none';
  $('#bkSub').textContent='Click every shoot date, then Generate';
  renderBkCals();
  $('#bulkModal').classList.add('open');
}
// Create a hand-built schedule revision inside a production and open the bulk
// calendar. Titles carry a timestamp so two manual revisions of one production
// never collide in the manual-days store (which is keyed by title).
function createManualRevision(name,unit){
  unit=unit||'Main';
  const stamp=new Date();
  const title=name+' — manual '+stamp.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})+' '+stamp.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  addSource({days:[],castMap:{},notes:[]},title,name.slice(0,16),true,{kind:'manual',ns:'m:'+title,allowEmpty:true,colour:(PRODS[name]&&PRODS[name].colour)||'white',prod:name,unit});
  const src=SOURCES[SOURCES.length-1];
  src.createdAt=stamp.toISOString();src.sessionNew=true;
  saveUserSources();
  if(CLOUD.session)cloud.insertProduction(src).then(({id,error})=>{if(error){src.cloudFailed=true}else src.cloudId=id});
  logProdEvent(name,'schedule','Manual schedule started for '+unit+' Unit');
  openBulkDays(unit);
}
// ---------- "add schedule" chooser: upload a PDF, or build it by hand ----------
let AC_CTX=null;
function openAddChooser(prod,unit){
  AC_CTX={prod:prod||null,unit:unit||null};
  $('#acSub').textContent=prod?('New revision → '+prod+(unit?' · '+unit+' Unit':'')):'New schedule';
  $('#addChooser').classList.add('open');
}
$('#acClose').addEventListener('click',()=>$('#addChooser').classList.remove('open'));
$('#addChooser').addEventListener('click',e=>{if(e.target.id==='addChooser')$('#addChooser').classList.remove('open')});
$('#acUpload').addEventListener('click',()=>{
  $('#addChooser').classList.remove('open');
  CURPROD=AC_CTX&&AC_CTX.prod;CURUNIT=AC_CTX&&AC_CTX.unit;
  $('#fileInput').click();
});
$('#acManual').addEventListener('click',()=>{
  $('#addChooser').classList.remove('open');
  const name=AC_CTX&&AC_CTX.prod;
  // no production yet — create one first; its empty panel offers both routes
  if(!name){openProdModal();return}
  createManualRevision(name,(AC_CTX&&AC_CTX.unit)||'Main');
});
$('#bkPrev').addEventListener('click',()=>{BK.month=new Date(BK.month.getFullYear(),BK.month.getMonth()-1,1);renderBkCals()});
$('#bkNext').addEventListener('click',()=>{BK.month=new Date(BK.month.getFullYear(),BK.month.getMonth()+1,1);renderBkCals()});
$('#bkUnit').addEventListener('change',renderBkCals);
$('#bkCals').addEventListener('click',e=>{
  const b=e.target.closest('[data-bkday]');if(!b||b.disabled)return;
  const k=b.dataset.bkday;
  BK.sel.has(k)?BK.sel.delete(k):BK.sel.add(k);
  b.classList.toggle('sel');
  $('#bkCount').textContent=BK.sel.size?BK.sel.size+' date'+(BK.sel.size===1?'':'s')+' selected':'No dates selected';
});
$('#bkGen').addEventListener('click',()=>{
  if(!BK.sel.size){setStatus('Click the shoot dates on the calendar first.');return}
  const defUnit=$('#bkUnit').value;
  const dates=[...BK.sel].sort();
  $('#bkList').innerHTML=dates.map((k,i)=>{
    const[y,m,dd]=k.split('-').map(Number);
    const dt=new Date(y,m-1,dd);
    const lbl=dt.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
    return `<div class="bk-row" data-bkdate="${k}">
      <span class="bkdate">${lbl}</span>
      <select class="bkunit" aria-label="Unit for ${lbl}"><option value="Main"${defUnit==='Main'?' selected':''}>Main Unit</option><option value="2nd"${defUnit==='2nd'?' selected':''}>2nd Unit</option></select>
      <input type="text" class="bkloc" placeholder="Location (optional)" aria-label="Location for ${lbl}">
      <input type="text" class="bksc" placeholder="Scenes — e.g. 12, 12A, 47" aria-label="Scene numbers for ${lbl}">
    </div>`;
  }).join('');
  $('#bkSub').textContent=dates.length+' days — set unit, scenes &amp; locations per day, then Create';
  $('#bkStep1').style.display='none';$('#bkStep2').style.display='';
  // Enter hops to the next row's scenes box — fill 60 days without the mouse
  $('#bkList').querySelectorAll('.bksc').forEach((inp,i,all)=>{
    inp.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&all[i+1]){ev.preventDefault();all[i+1].focus()}});
  });
  const f=$('#bkList').querySelector('.bksc');if(f)f.focus();
});
$('#bkBack').addEventListener('click',()=>{$('#bkStep2').style.display='none';$('#bkStep1').style.display='';$('#bkSub').textContent='Click every shoot date, then Generate';renderBkCals()});
$('#bkCreate').addEventListener('click',()=>{
  const src=SOURCES[ACTIVE];
  // day numbers run PER UNIT (M1,M2… and U1,U2…), continuing from existing days
  const nextNum={Main:Math.max(0,...MODEL.days.filter(d=>(d.unit||'Main')==='Main').map(d=>d.num)),
                 '2nd':Math.max(0,...MODEL.days.filter(d=>d.unit==='2nd').map(d=>d.num))};
  const rows=[...$('#bkList').querySelectorAll('.bk-row')];
  let added=0;
  for(const row of rows){
    const[y,m,dd]=row.dataset.bkdate.split('-').map(Number);
    const dt=new Date(y,m-1,dd);
    const date=dt.toLocaleDateString('en-GB',{weekday:'long'})+', '+dd+' '+dt.toLocaleDateString('en-GB',{month:'long'})+' '+y;
    const unit=(row.querySelector('.bkunit')||{}).value||'Main';
    // split on commas ONLY — scene parts contain spaces ("15 pt2", "10 pt 1")
    const scenes=(row.querySelector('.bksc').value||'').split(',').map(s=>s.trim()).filter(Boolean).map(n=>sceneStub(n,unit));
    const d=reviveDay({num:++nextNum[unit],date,loc:(row.querySelector('.bkloc').value||'').trim(),hours:'',type:'',unit,scenes});
    MODEL.days.push(d);added++;
    if(CLOUD.session&&src&&src.cloudId)cloud.upsertManualDay(src.cloudId,d).then(r=>{if(r.error)setStatus('Cloud save failed: '+r.error.message)});
  }
  sortDays(MODEL);
  // a schedule spanning both units becomes a combined "Full Schedule" — this
  // lights up the Unit column, the 2nd-unit calendar colour, and the merged view
  const hasMain=MODEL.days.some(d=>(d.unit||'Main')==='Main'), has2nd=MODEL.days.some(d=>d.unit==='2nd');
  if(hasMain&&has2nd){MODEL.multiUnit=true;if(src){src.unit='Full';src.multiUnit=true;}}
  saveManualDays();saveUserSources();
  if(src&&src.cloudId&&CLOUD.session)cloud.updateProduction(src.cloudId,src).catch(()=>{});
  refreshAll();renderSidebar();
  $('#bulkModal').classList.remove('open');
  const unitsAdded=[...new Set(rows.map(r=>(r.querySelector('.bkunit')||{}).value||'Main'))];
  if(src&&(src.prod||src.title))logProdEvent(src.prod||src.title,'schedule',added+' shoot day'+(added===1?'':'s')+' added by hand ('+unitsAdded.map(u=>u==='2nd'?'2nd':'Main').join(' + ')+' Unit'+(unitsAdded.length>1?'s':'')+')');
  setStatus('Added '+added+' shoot day'+(added===1?'':'s')+(hasMain&&has2nd?' across Main & 2nd Unit':'')+' — click any scene to add crowd or stunts.');
});
$('#bkClose').addEventListener('click',()=>$('#bulkModal').classList.remove('open'));
$('#bulkModal').addEventListener('click',e=>{if(e.target.id==='bulkModal')$('#bulkModal').classList.remove('open')});

$('#dmClose').addEventListener('click',()=>$('#dayModal').classList.remove('open'));
$('#dayModal').addEventListener('click',e=>{if(e.target.id==='dayModal')$('#dayModal').classList.remove('open')});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#prodModal').classList.remove('open');$('#dayModal').classList.remove('open')}});
document.addEventListener('click',e=>{
  if(e.target.closest('#btnAddDay')){openDayModal();return}
  if(e.target.closest('#btnAddDays')){openBulkDays();return}
  const del=e.target.closest('[data-delday]');
  if(del)deleteManualDayById(del.dataset.delday);
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
    // per-production column visibility (Production Settings → Columns)
    {
      const s=SOURCES[ACTIVE];
      const p=s&&s.kind&&PRODS[s.prod||s.title];
      const c=(p&&p.columns)||{};
      host.classList.toggle('cols-nocast',c.cast===false);
      host.classList.toggle('cols-nostunts',c.stunts===false);
      host.classList.toggle('cols-nocrowd',c.crowd===false);
      // per-production custom column widths (drag-to-resize on the header)
      const cw=(p&&p.columnWidths)||{};
      ['scene','cast','stunt','crowd'].forEach(k=>{
        if(cw[k])host.style.setProperty('--w-'+k,cw[k]+'px');
        else host.style.removeProperty('--w-'+k);
      });
    }
    const row=document.createElement('div');
    row.style.cssText='display:flex;gap:8px';
    const btn=document.createElement('button');
    btn.id='btnAddDay';btn.className='tb-btn';
    btn.style.cssText='flex:1;border-style:dashed;padding:13px;color:var(--sub);font-size:12.5px';
    btn.textContent=MODEL&&MODEL.days.length?'+ Add shoot day':'+ Add your first shoot day — date, unit, location';
    const many=document.createElement('button');
    many.id='btnAddDays';many.className='tb-btn';
    many.style.cssText='flex:1;border-style:dashed;padding:13px;color:var(--sub);font-size:12.5px';
    many.textContent='+ Add many days from a calendar';
    row.appendChild(btn);row.appendChild(many);
    host.appendChild(row);
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
  // the tab strip sticks just below the floating panel's page-header bar
  const pb=$('.pagebar');
  if(pb){
    const set=()=>document.documentElement.style.setProperty('--topbarH',pb.offsetHeight+'px');
    if(window.ResizeObserver)new ResizeObserver(set).observe(pb);
    window.addEventListener('resize',set);
    set();
  }
  // The tab strip scrolls sideways rather than wrapping. Fade whichever edge is
  // cut off so it reads as "there's more this way", and keep the active tab in
  // view when the window narrows or the view changes.
  const tr=$('.tabsrow');
  if(tr){
    const edges=()=>{
      const max=tr.scrollWidth-tr.clientWidth;
      tr.classList.toggle('ovf-l',tr.scrollLeft>2);
      tr.classList.toggle('ovf-r',max>2&&tr.scrollLeft<max-2);
    };
    const reveal=()=>{
      const on=tr.querySelector('.tabs button.on');
      if(on&&tr.scrollWidth>tr.clientWidth+2)on.scrollIntoView({block:'nearest',inline:'nearest'});
      edges();
    };
    tr.addEventListener('scroll',edges,{passive:true});
    window.addEventListener('resize',reveal);
    if(window.ResizeObserver)new ResizeObserver(reveal).observe(tr);
    tr.addEventListener('click',()=>setTimeout(reveal,0));
    reveal();
  }
  syncToolRow();
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
// ---------- revision work carry ----------
// When a new revision of the same production/unit is published, the user's
// work moves with it: scene-keyed work (SCED, scene notes) follows its SCENE
// (script numbers never renumber); day-keyed work (CDAY, ADJ, STUNTCFG,
// STUNTDAY, day notes) follows the day's CONTENTS via diffRevisions' scene-
// overlap matching. Work that can't carry (scene cut, day dissolved) stays on
// the old revision untouched and is reported — never force-attached.
const CARRY_DAY_STORES=[
  ()=>[CDAY,saveCDAY],
  ()=>[ADJ,saveAdj],
  ()=>[STUNTCFG,saveStuntCfg],
  ()=>[STUNTDAY,saveStuntDay],
  ()=>[DAYLOC,saveDayLoc],
];
// normalise a scene num+part exactly like engine sceneKey (merge.ts)
function carrySceneKey(num,part){return ((num||'')+(part||'')).toLowerCase().replace(/[\s.]+/g,'')}
// Dry-run plan: what carries where. Applied only on Publish (applyRevisionCarry).
function planRevisionCarry(prevSrc,newModel,diff,manualPlains){
  const prevNs=prevSrc.ns||'';
  const pre=prevNs?prevNs+'|':'';
  // old 'unit|num' → new 'unit|num': matched days move, shot days carry
  // verbatim, hand-added days keep their numbers (restoreManualDays re-adds
  // them to the new revision unchanged)
  const dayTo=new Map();
  for(const m of diff.matches)dayTo.set((m.oldDay.unit||'Main')+'|'+m.oldDay.num,(m.newDay.unit||'Main')+'|'+m.newDay.num);
  for(const d of diff.shotDays)dayTo.set((d.unit||'Main')+'|'+d.num,(d.unit||'Main')+'|'+d.num);
  const manualSet=new Set(manualPlains||[]);
  for(const p of manualSet)if(!dayTo.has(p))dayTo.set(p,p);
  const newScenes=engineSceneIndexOf(newModel);
  const plan={dayMoves:[],dayStranded:[],sceneMoves:[],sceneStranded:[],prevNs};
  const seenDay=new Set(),labels={0:'day calculator',1:'stunt adjustments',2:'stunt hours',3:'stunt team',4:'shooting location'};
  CARRY_DAY_STORES.forEach((get,si)=>{
    const [map]=get();
    for(const k of Object.keys(map)){
      if(!k.startsWith(pre)&&prevNs)continue;
      if(!prevNs&&/^[pm]:/.test(k))continue; // demo namespace guard
      const plain=prevNs?k.slice(pre.length):k;
      if(plain.split('|').length!==2)continue;
      const to=dayTo.get(plain);
      const item={store:si,label:labels[si],from:plain,to:to||null,key:k};
      if(to)plan.dayMoves.push(item);
      else if(!seenDay.has(plain+'|'+si)){plan.dayStranded.push(item)}
      seenDay.add(plain+'|'+si);
    }
  });
  // SCED + NOTES share the scene-key shape 'unit|num|scene|part|idx' (notes
  // add the day-note form 'unit|num|||DAY' which follows the day instead)
  const sceneStores=[[SCED,'crowd/stunt scene edit'],[NOTES,'note']];
  for(const [map,label] of sceneStores){
    for(const k of Object.keys(map)){
      if(!k.startsWith(pre)&&prevNs)continue;
      if(!prevNs&&/^[pm]:/.test(k))continue;
      const plain=prevNs?k.slice(pre.length):k;
      const seg=plain.split('|');
      if(seg.length!==5)continue;
      const [unit,num,scene,part,idx]=seg;
      if(idx==='DAY'){
        const to=dayTo.get(unit+'|'+num);
        const item={label:'day note',from:'D'+num,to:to?'D'+to.split('|')[1]:null,key:k,newPlain:to?to.split('|')[0]+'|'+to.split('|')[1]+'|||DAY':null,map};
        if(to)plan.sceneMoves.push(item);else plan.sceneStranded.push(item);
        continue;
      }
      let hit=newScenes.get(carrySceneKey(scene,part));
      // scene edits on a hand-added day carry verbatim — the day itself is
      // re-added to the new revision with the same number and scene order
      const manualCarry=!hit&&manualSet.has(unit+'|'+num);
      const item={label,scene:scene+(part?' pt'+part:''),from:'D'+num,
        to:hit?'D'+hit.day.num:manualCarry?'D'+num:null,key:k,
        newPlain:hit?[(hit.day.unit||'Main'),hit.day.num,hit.scene.num||'',hit.scene.part||'',hit.idx].join('|'):manualCarry?plain:null,map};
      if(hit||manualCarry)plan.sceneMoves.push(item);else plan.sceneStranded.push(item);
    }
  }
  return plan;
}
// Copy the planned work under the new revision's namespace. The old
// revision's entries are left untouched — flipping "make current" back shows
// everything exactly as it was.
function applyRevisionCarry(plan,newNs){
  const npre=newNs?newNs+'|':'';
  let n=0;
  const touched=new Set();
  for(const item of plan.dayMoves){
    const [map,save]=CARRY_DAY_STORES[item.store]();
    const nk=npre+item.to;
    if(map[nk]===undefined){map[nk]=JSON.parse(JSON.stringify(map[item.key]));n++}
    touched.add(item.store);
  }
  for(const item of plan.sceneMoves){
    const nk=npre+item.newPlain;
    if(item.map[nk]===undefined){item.map[nk]=JSON.parse(JSON.stringify(item.map[item.key]));n++}
    touched.add(item.map===SCED?'sced':'notes');
  }
  for(const si of touched)if(typeof si==='number')CARRY_DAY_STORES[si]()[1]();
  if(touched.has('sced'))saveSced();
  if(touched.has('notes')){store.set('stuntos-notes',JSON.stringify(NOTES));cloudSyncBlob('notes',NOTES)}
  // casting briefs are character-anchored, not day-keyed — they always carry;
  // their schedule panel re-derives live from whatever revision is current
  const prevNs=plan.prevNs||'';
  if(prevNs){
    const bpre=prevNs+'|',npreB=newNs?newNs+'|':'';
    let bn=0;
    for(const k of Object.keys(BRIEFS))if(k.startsWith(bpre)){
      const nk=npreB+k.slice(bpre.length);
      if(BRIEFS[nk]===undefined){BRIEFS[nk]=JSON.parse(JSON.stringify(BRIEFS[k]));bn++}
    }
    if(bn){saveBriefs();n+=bn}
  }
  return n;
}
// cday/adj sync is per-production — entries migrated before the new revision
// got its cloud id were skipped AND shadowed as synced. Clear that ns from
// the shadow and re-run once the id lands.
function resyncNsMaps(ns){
  for(const kind of ['cday','adj']){
    let sh={};try{sh=JSON.parse(SHADOW[kind])}catch(e){sh={}}
    let dirty=false;
    for(const k of Object.keys(sh))if(keyParts(k).ns===ns){delete sh[k];dirty=true}
    if(dirty){SHADOW[kind]=JSON.stringify(sh);cloudSyncMap(kind)}
  }
}
// The blob stores (per-scene edits, notes, stunt team/hours, briefs) sync
// per-source too — cloudSyncBlob SKIPS a source with no cloudId, so anything
// written between addSource and insertProduction resolving (e.g. revision
// work-carry) never reached the cloud, and the next sign-in reset silently
// dropped it from the running app. Re-push everything once the id exists.
function pushAllBlobs(){
  cloudSyncBlob('sced',SCED);
  cloudSyncBlob('stuntday',STUNTDAY);
  cloudSyncBlob('stuntcfg',STUNTCFG);
  cloudSyncBlob('notes',NOTES);
  cloudSyncBlob('briefs',BRIEFS);
  cloudSyncBlob('dayloc',DAYLOC);
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

// Prefers the first-name/surname captured at sign-up; falls back to email for
// accounts created before that field existed (or via Google sign-in).
function displayName(session){
  const u=session&&session.user;if(!u)return'';
  const meta=u.user_metadata||{};
  return meta.full_name||[meta.first_name,meta.last_name].filter(Boolean).join(' ')||u.email||'';
}
function updateAccountUI(){
  const s=CLOUD.session;
  const avatar=s&&s.user&&s.user.user_metadata&&s.user.user_metadata.avatar;
  // the account button: photo (when set) + name, Laural top-right style
  $('#btnAccount').innerHTML=s
    ?(avatar?`<img class="btn-avatar" src="${avatar}" alt="">`:'')+esc(displayName(s)||'Account')
    :'Sign in';
  if(cloud.cloudConfigured())$('#gate').classList.toggle('hidden',!!s);
  // signing in is the moment the app first becomes visible, so it's also the
  // first honest moment to offer the tour
  if(s)maybeWelcomeTour();
  if(s)$('#auWho').textContent=displayName(s);
  const av=$('#auAvatar');
  if(av)av.innerHTML=avatar?`<img src="${avatar}" alt="">`:esc((displayName(s)||'?').slice(0,1).toUpperCase());
  const rm=$('#auAvatarRm');if(rm)rm.classList.toggle('hidden',!avatar);
  const sw=$('#sideWho');if(sw)sw.textContent=s?(displayName(s)||'Production'):'Production';
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
  // Laural shows only email+password for sign-in — the name fields appear
  // the first time Create account is pressed
  if($('#auNameRow').classList.contains('hidden')){
    $('#auNameRow').classList.remove('hidden');
    $('#auStatus').textContent='Add your full name and role, then press Create account again.';
    $('#auFirst').focus();
    return;
  }
  const email=$('#auEmail').value.trim(),pw=$('#auPass').value;
  const first=$('#auFirst').value.trim(),last=$('#auLast').value.trim();
  const role=$('#auRole').value;
  if(!first||!last){$('#auStatus').textContent='Enter your full name — first name and surname.';return}
  if(!role){$('#auStatus').textContent='Choose your role — it helps us shape the app around how you work.';return}
  if(!email||!pw){$('#auStatus').textContent='Enter an email and choose a password.';return}
  $('#auStatus').textContent='Creating account…';
  const {data,error}=await cloud.signUp(email,pw,first,last,role);
  if(error){$('#auStatus').textContent=error.message;return}
  $('#auStatus').textContent=data.session?'':'Check your inbox to confirm your email, then sign in.';
});
// Signing out has to leave this account's work behind on the device. Without
// it, a shared browser leaks: the next person's first sign-in finds an empty
// cloud plus local schedules and MIGRATES them into their account (owner
// defaults to auth.uid()), and until they sign in the previous account's
// schedules, notes and briefs are still on screen. Everything cleared here is
// cloud-backed for the account that just left, so signing back in restores it.
// Deliberately NOT cleared: rate cards, glossary, risk-assessment settings and
// the calculators — none of those migrate into another account, and some of
// them are the only copy (see the sync gaps noted in the audit).
const SIGNOUT_CLEAR=['crowdos-sources','crowdos-prods','crowdos-manualdays','crowdos-sced',
  'crowdos-stuntday','crowdos-stuntcfg','crowdos-briefs','crowdos-dayloc','crowdos-events',
  'stuntos-cday','stuntos-adj','stuntos-notes'];
function clearAccountLocalData(){
  for(const k of SIGNOUT_CLEAR){try{window.localStorage.removeItem(k)}catch(e){}}
}
$('#auSignOut').addEventListener('click',async()=>{
  await cloud.signOut();
  const kept=clearAccountLocalData();
  // a kept key means its cloud write never confirmed — warn rather than wipe
  if(kept.length)try{window.sessionStorage.setItem('crowdos-signout-kept',String(kept.length))}catch(e){}
  location.reload();
});
$('#auRateCards').addEventListener('click',()=>{$('#authModal').classList.remove('open');openRateAdmin();});

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
  cloudSyncBlob('stuntcfg',STUNTCFG);
  cloudSyncBlob('notes',NOTES);
  cloudSyncBlob('briefs',BRIEFS);
  cloudSyncBlob('dayloc',DAYLOC);
  for(const g of GLOSSARY)await cloud.upsertGlossaryTerm(g.term,g.answer,g.production||null).catch(()=>{});
  return true;
}

// one row per (account, kind) — see cloud.upsertUserBlob and the 2026-08-05
// migration. Kinds map to the module-level objects they belong to.
function userBlobTargets(){
  return {
    ra:{get:()=>RASET,set:v=>{RASET=v},save:()=>store.set('stuntos-ra',JSON.stringify(RASET))},
    raedits:{get:()=>RAEDITS,set:v=>{RAEDITS=v},save:()=>store.set('stuntos-raedits',JSON.stringify(RAEDITS))},
    freecalc:{get:()=>FC,set:v=>Object.assign(FC,v),save:()=>store.set('stuntos-freecalc',JSON.stringify(FC))},
    stuntcalc:{get:()=>SC,set:v=>Object.assign(SC,v),save:()=>store.set('stuntos-stuntcalc',JSON.stringify(SC))},
    dancecalc:{get:()=>DC,set:v=>Object.assign(DC,v),save:()=>store.set('crowdos-dancecalc',JSON.stringify(DC))},
    fcrows:{get:()=>FCROWS,set:v=>{FCROWS=Array.isArray(v)?v:[]},save:()=>store.set('crowdos-fcrows',JSON.stringify(FCROWS))},
    srows:{get:()=>SROWS,set:v=>{SROWS=Array.isArray(v)?v:[]},save:()=>store.set('crowdos-srows',JSON.stringify(SROWS))},
    drows:{get:()=>DROWS,set:v=>{DROWS=Array.isArray(v)?v:[]},save:()=>store.set('crowdos-drows',JSON.stringify(DROWS))},
    dbriefs:{get:dashBriefsBlob,set:v=>{
      // dashboard briefs live in the shared BRIEFS map under the 'd:' prefix
      for(const k of Object.keys(BRIEFS))if(k.startsWith('d:'))delete BRIEFS[k];
      Object.assign(BRIEFS,v||{});
    },save:()=>store.set('crowdos-briefs',JSON.stringify(BRIEFS))},
  };
}
function hydrateUserBlobs(rows){
  const T=userBlobTargets();
  const seen=new Set();
  for(const r of rows||[]){
    const t=T[r.kind];if(!t||r.data==null)continue;
    seen.add(r.kind);
    try{t.set(r.data);t.save()}catch(e){}
  }
  // nothing in the cloud for a kind this device HAS → push it up once
  for(const [kind,t] of Object.entries(T)){
    if(seen.has(kind))continue;
    const v=t.get();
    const has=Array.isArray(v)?v.length:v&&Object.keys(v).length;
    if(has)cloudSyncUser(kind,v);
  }
}
async function cloudHydrate(){
  setStatus('Syncing your productions…');
  let res=await cloud.loadAll();
  if(res.error){
    // clock-skew / stale-token rejections are handled with a refresh+retry
    // inside cloud.loadAll; if one still slips through, refresh once more and
    // retry here rather than surfacing the scary "issued at future" error
    if(/jwt|issued at|clock|token is expired|iat|exp\b/i.test(res.error.message||'')){
      await cloud.refreshSession().catch(()=>{});
      res=await cloud.loadAll();
    }
    if(res.error){
      // still failing → keep working locally, say so gently, retry shortly
      setStatus('Working offline — couldn’t reach the cloud just now. Your changes are saved on this device and will sync when the connection’s back.');
      clearTimeout(window.__hydrateRetry);window.__hydrateRetry=setTimeout(()=>{if(CLOUD.session)cloudHydrate()},20000);
      return;
    }
  }
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
  // glossary: the cloud copy wins when it has rows (a pre-migration database
  // returns none — keep the local copy so answers aren't lost). Anything
  // answered while signed OUT is pushed up first, so it stops being
  // browser-only the moment this account touches it.
  if(res.glossary){
    const cloudTerms=new Set(res.glossary.map(r=>(r.term||'').toLowerCase()+'|'+(r.production||'')));
    for(const g of GLOSSARY){
      const k=(g.term||'').toLowerCase()+'|'+(g.production||'');
      if(!cloudTerms.has(k)&&cloud.upsertGlossaryTerm)cloud.upsertGlossaryTerm(g.term,g.answer,g.production).catch(()=>{});
    }
    if(res.glossary.length){
      const byKey=new Map(GLOSSARY.map(g=>[(g.term||'').toLowerCase()+'|'+(g.production||''),g]));
      for(const r of res.glossary)byKey.set((r.term||'').toLowerCase()+'|'+(r.production||''),{term:r.term,answer:r.answer,production:r.production||null});
      GLOSSARY=[...byKey.values()];
      saveGlossaryLocal();
    }
  }
  // account-level blobs (calculators, RA settings, dashboard briefs). The
  // cloud wins where it has a copy; where it doesn't, this device's copy is
  // pushed up so signing in on a second machine carries it across.
  hydrateUserBlobs(res.userBlobs||[]);
  // per-scene edits (SCED) and manual stunt days (STUNTDAY) are namespaced
  // to a production (p:/m: prefix); clear the cloud-owned ones before reload
  for(const k of Object.keys(SCED))if(/^[pm]:/.test(k))delete SCED[k];
  for(const k of Object.keys(STUNTDAY))if(/^[pm]:/.test(k))delete STUNTDAY[k];
  for(const k of Object.keys(STUNTCFG))if(/^[pm]:/.test(k))delete STUNTCFG[k];
  for(const k of Object.keys(NOTES))if(/^[pm]:/.test(k))delete NOTES[k];
  for(const k of Object.keys(BRIEFS))if(/^[pm]:/.test(k))delete BRIEFS[k];
  for(const k of Object.keys(DAYLOC))if(/^[pm]:/.test(k))delete DAYLOC[k];
  for(const rec of res.productions){
    if(SOURCES.some(s=>s.cloudId&&s.cloudId===rec.id))continue; // already here
    try{
      if(rec.kind==='pdf'&&(rec.schedule_text||rec.ai_model)){
        const m=modelFrom({aiModel:rec.ai_model,format:rec.format,text:rec.schedule_text,title:rec.title},rec.unit||'Main');
        addSource(m,rec.title,rec.short,false,{kind:'pdf',text:rec.schedule_text,unit:rec.unit||'Main',ns:'p:'+rec.title,cloudId:rec.id,colour:rec.colour||undefined,createdAt:rec.created_at,prod:rec.production,version:rec.version,schedDate:rec.sched_date,format:rec.format,rateCard:rec.rate_card,current:rec.is_current,aiModel:rec.ai_model||null,docKind:rec.doc_kind||null,pdfFiles:rec.pdf_files||null});
      }else{
        addSource({days:[],castMap:{},notes:[]},rec.title,rec.short,false,{kind:'manual',ns:'m:'+rec.title,allowEmpty:true,colour:rec.colour||'white',cloudId:rec.id,createdAt:rec.created_at,prod:rec.production});
      }
    }catch(e){console.error('load production failed',e)}
  }
  for(const md of res.manualDays){
    const src=SOURCES.find(s=>s.cloudId===md.production_id);
    if(!src)continue;
    if(src.model.days.some(d=>d.unit===md.unit&&d.num===md.num))continue;
    src.model.days.push(reviveDay({num:md.num,date:md.date,loc:md.loc,hours:md.hours,type:md.type,unit:md.unit,scenes:md.scenes||[]}));
    sortDays(src.model);
  }
  // a hand-built schedule spanning both units is a combined "Full Schedule"
  for(const s of SOURCES)if(s.kind==='manual'&&s.model.days.some(d=>(d.unit||'Main')==='Main')&&s.model.days.some(d=>d.unit==='2nd')){s.model.multiUnit=true;s.unit='Full';}
  for(const de of res.dayEdits){
    const src=SOURCES.find(s=>s.cloudId===de.production_id);
    if(!src||!src.ns)continue;
    // sced/stuntday are stored as one blob (already ns-keyed); cday/adj are
    // one row per day, keyed by the plain day key
    if(de.kind==='sced'){Object.assign(SCED,de.data||{});migrateScedKeys();continue;}
    if(de.kind==='stuntday'){Object.assign(STUNTDAY,de.data||{});continue;}
    if(de.kind==='stuntcfg'){Object.assign(STUNTCFG,de.data||{});continue;}
    if(de.kind==='notes'){Object.assign(NOTES,de.data||{});store.set('stuntos-notes',JSON.stringify(NOTES));continue;}
    if(de.kind==='briefs'){Object.assign(BRIEFS,de.data||{});store.set('crowdos-briefs',JSON.stringify(BRIEFS));continue;}
    if(de.kind==='dayloc'){Object.assign(DAYLOC,de.data||{});store.set('crowdos-dayloc',JSON.stringify(DAYLOC));continue;}
    const localKey=src.ns+'|'+de.key;
    if(de.kind==='cday')CDAY[localKey]=de.data;else ADJ[localKey]=de.data;
  }
  // rebuild the production registry from the cloud (schedule rows carry the
  // production name + rate card; the prods table holds empty productions)
  for(const s of SOURCES)if(s.kind&&s.prod)ensureProd(s.prod,{rateCard:s.rateCard||(PRODS[s.prod]&&PRODS[s.prod].rateCard)||null,colour:s.colour});
  for(const p of (res.prods||[])){
    // rate_card jsonb holds either the v2 per-department shape
    // ({sa:{name,vals},stunts:{...}}) or a legacy pre-split single card
    const rc=p.rate_card||null;
    const isV2=!!(rc&&(rc.sa||rc.stunts));
    ensureProd(p.name,{rateCard:isV2?null:rc,colour:p.colour||'white'});
    const P=PRODS[p.name];
    if(isV2)P.rateCards=rc;
    if(p.locations)P.locations=p.locations;
    if(p.info)P.info=p.info;
    if(p.cast_list)P.castList=p.cast_list;
    if(p.columns)P.columns=p.columns;
    if(p.no_ai!==undefined)P.noAI=!!p.no_ai;
    if(p.rate_overrides)P.rateOverrides=p.rate_overrides;
  }
  saveProds();
  // admin rate cards: cloud wins; anything saved only locally (an older
  // browser, or before this synced) gets pushed up once so it isn't lost
  if(res.rateCards){
    const cloudNames=new Set();
    for(const rc of res.rateCards){
      const kind=RATECARDS[rc.kind]?rc.kind:'sa';
      RATECARDS[kind][rc.name]=rc.vals||{};cloudNames.add(kind+'|'+rc.name);
    }
    for(const d of RATE_DEPTS)for(const [n,vals] of Object.entries(RATECARDS[d.kind]))
      if(!cloudNames.has(d.kind+'|'+n))cloud.upsertRateCard(d.kind,n,vals).catch(()=>{});
    saveRateCardsLocal();
  }
  // change history: cloud rows win when present (rows arrive newest-first)
  if(res.events&&res.events.length){
    EVENTS={};
    for(const e of res.events)(EVENTS[e.production]=EVENTS[e.production]||[]).push({kind:e.kind,detail:e.detail,who:e.actor_email||'',at:e.created_at});
    store.set('crowdos-events',JSON.stringify(EVENTS));
  }
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
// which of the sidebar's home pages is showing: 'home' | 'calc' | 'briefs'
let DASH_PAGE='home';
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
const unitName=u=>u==='2nd'?'2nd Unit':u==='Full'?'Full Schedule':'Main Unit';
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
// units default OPEN on a production's home screen (that's the main content
// there now) — this set tracks only the ones the user explicitly collapsed
const DASH_UNIT_CLOSED=new Set();
let PROD_HOME=null; // production name shown in detail, or null = the plain list
let PROD_TAB='schedules'; // which tab of the open production: 'schedules' | 'settings'
let PS_INLINE=false; // true while the settings sheet lives inside the production page (not the modal)
// mode-aware cost of a source: CrowdOS shows crowd, StuntOS shows stunt
function modeCost(s){return costsFor(s)[APPMODE==='stunt'?'stunt':'crowd']}
function modeWord(){return APPMODE==='stunt'?'stunt':'crowd'}
// Each production in the sidebar is its own drawer — collapsed state persists
// per browser. Default open (nothing collapsed) so existing users see no change
// until they close one themselves.
let SIDE_COLLAPSED=new Set();
try{SIDE_COLLAPSED=new Set(JSON.parse(store.get('crowdos-sidecollapsed')||'[]'))}catch(e){SIDE_COLLAPSED=new Set()}
function saveSideCollapsed(){store.set('crowdos-sidecollapsed',JSON.stringify([...SIDE_COLLAPSED]))}
function renderSidebar(){
  const mk=(s,i,label)=>`<button class="side-item sched ${!DASH&&i===ACTIVE?'on':''}" data-side="${i}" title="${esc(s.title)}"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label||s.short)}</span><span class="k">${s.model.days.length}d</span>${sourceHasFiles(s)?`<span class="vieworig" data-vieworig="${i}" data-tip="View the original document">${icon('file')}</span>`:''}<span class="del" data-delsrc="${i}" data-tip="Delete this schedule">✕</span></button>`;
  $('#sideDash').classList.toggle('on',DASH&&DASH_PAGE==='home');
  $('#sideCalc').classList.toggle('on',DASH&&DASH_PAGE==='calc');
  $('#sideBriefsNav').classList.toggle('on',DASH&&DASH_PAGE==='briefs');
  // one row per UNIT (its current revision); revision history lives on the
  // dashboard. Empty productions listed too. Each production is a drawer —
  // click its name to open/close the units beneath it.
  let html='';
  for(const name of new Set([...prodNames(),...SOURCES.filter(s=>s.kind).map(s=>s.prod||s.title)])){
    const closed=SIDE_COLLAPSED.has(name);
    html+=`<div class="side-prod${closed?' closed':''}" data-prodtoggle="${esc(name)}"><span class="side-prod-chev">▾</span><span class="side-prod-name">${esc(name)}</span><span class="side-prod-tools"><span data-prodimport="${esc(name)}" data-tip="Add a schedule — upload a PDF or build by hand">＋</span><span data-prodedit="${esc(name)}" data-tip="Production settings">${icon('pencil')}</span></span></div>`;
    const units=unitsOf(name);
    html+=`<div class="side-units${closed?' hidden':''}" data-produnits="${esc(name)}">`;
    if(!units.size){html+=`<div style="color:var(--faint);font-size:10.5px;padding:1px 10px 4px">No schedules yet</div>`;}
    else for(const [uk,revs] of units){
      const cur=currentRev(revs);
      const label=cur.s.kind==='manual'?(cur.s.model.multiUnit?'Full Schedule · Main + 2nd':'Manual entry'):unitName(cur.s.unit)+(revs.length>1?` · ${revLabel(cur.s)} (+${revs.length-1})`:` · ${revLabel(cur.s)}`);
      html+=mk(cur.s,cur.i,label);
    }
    html+='</div>';
  }
  $('#sideList').innerHTML=html||'<div style="color:var(--faint);font-size:11px;padding:2px 10px 6px">None yet — start one below.</div>';
  const demoHtml=SOURCES.map((s,i)=>s.kind?'':mk(s,i)).join('');
  $('#sideDemo').innerHTML=demoHtml;
  const demoLabel=$('#sideDemoLabel');if(demoLabel)demoLabel.classList.toggle('hidden',!demoHtml);
}
$('#sideList').addEventListener('click',e=>{
  if(e.target.closest('[data-prodimport],[data-prodedit]'))return; // their own handlers
  const pt=e.target.closest('[data-prodtoggle]');
  if(!pt)return;
  const name=pt.dataset.prodtoggle;
  SIDE_COLLAPSED.has(name)?SIDE_COLLAPSED.delete(name):SIDE_COLLAPSED.add(name);
  saveSideCollapsed();
  pt.classList.toggle('closed');
  const units=$(`#sideList [data-produnits="${CSS.escape(name)}"]`);
  if(units)units.classList.toggle('hidden');
});
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
  applyDayLocs(s.model,s.ns||''); // real-location overrides move travel bands
  const strip=(map)=>s.ns
    ?Object.fromEntries(Object.entries(map).filter(([k])=>k.startsWith(s.ns+'|')).map(([k,v])=>[k.slice(s.ns.length+1),v]))
    :Object.fromEntries(Object.entries(map).filter(([k])=>!keyParts(k).ns));
  return {
    crowd:engineComputeCrowdCosts(s.model,strip(CDAY),{...crowdSettingsFromDOM(),baseDay:s.kind?prodBaseDay(s.prod||s.title):undefined}).grand,
    stunt:engineComputeStuntCosts(s.model,strip(ADJ),{...rates(),sdOn:$('#rSDOn').checked,sdRate:+$('#rSDRate').value||0,sdDays:Math.max(0,+$('#rSDDays').value||0),...stuntRulesFrom(resolveRateVals(s.prod||s.title))},strip(STUNTCFG)).grand,
  };
}
function renderDash(){
  updateCrumbs();
  // rescue the shared calculator node out to #boardView BEFORE any innerHTML
  // wipe — it's the only copy, and the calculator page re-parents it into
  // #dashCalcSlot at the end. Without this, a second renderDash() would set
  // #dashView.innerHTML while the calc lived inside it and destroy it.
  {const vc=$('#viewCalc');if(vc&&vc.parentElement&&vc.parentElement.id==='dashCalcSlot'){$('#boardView').appendChild(vc);vc.classList.add('hidden');}}
  // the inline settings sheet is the modal's only copy — rescue it back into
  // the modal before any innerHTML wipe destroys it (same pattern as the calc)
  detachInlineSettings();
  // The sidebar's three home pages. Calculator and Casting briefs are whole
  // pages of their own — neither needs a production open.
  if(DASH_PAGE!=='briefs')setBriefScope(null); // the scratchpad page owns that scope
  if(DASH_PAGE==='calc'){
    $('#dashView').innerHTML=`
    <div class="dash-hero"><div><div class="dash-head">Calculator</div><div class="dash-sub">Rough budgets without opening a production</div></div></div>
    <div id="dashCalcSlot"></div>`;
    const vc=$('#viewCalc');
    if(vc){$('#dashCalcSlot').appendChild(vc);vc.classList.remove('hidden');renderFreeCalc();}
    return;
  }
  if(DASH_PAGE==='briefs'){
    $('#dashView').innerHTML=`
    <div class="dash-hero"><div><div class="dash-head">Casting briefs</div><div class="dash-sub">Write, copy and email a brief without opening a production</div></div></div>
    <div id="dashBriefs"></div>`;
    setBriefScope(BRIEF_SANDBOX);renderBriefs();
    return;
  }
  const who=CLOUD.session?displayName(CLOUD.session):'';
  const mode=modeWord(), Mode=mode[0].toUpperCase()+mode.slice(1);
  const money=n=>n>0?`<b class="verfig">${gbp(Math.round(n))}</b>`:`<span class="noreq">No ${mode} requirement</span>`;
  const names=[...new Set([...prodNames(),...SOURCES.filter(s=>s.kind).map(s=>s.prod||s.title)])];
  const demoFull=SOURCES.findIndex(s=>!s.kind&&s.model.multiUnit);
  const demoCard=demoFull>=0?`<div class="prodcard demo"><div class="ph" data-side="${demoFull}"><span class="pname">${esc(SOURCES[demoFull].title)}</span><span class="pmeta">sample</span><span class="pfig">${money(modeCost(SOURCES[demoFull]))}</span></div></div>`:'';

  // ---- Calculator: the rough-budget scratchpad, no production needed.
  // The existing free-calculator view is re-parented into the dashboard so
  // both places share one calculator (same state, same delegated events).


  if(PROD_HOME&&names.includes(PROD_HOME)){renderProdHome(PROD_HOME,mode,Mode,money);return}

  // back on the plain gallery, no single production owns the highlight colour
  applyProdBranding(null);

  // ---- Productions: a Laural-style gallery — poster cards, search, sort.
  // No cross-production totals; what matters is finding the one production
  // you're here for and opening it.
  const editedAt=name=>{let t=0;for(const revs of unitsOf(name).values())for(const r of revs)t=Math.max(t,revTime(r.s));return t};
  const sorted=[...names];
  if(DASH_SORT==='alpha')sorted.sort((a,b)=>a.localeCompare(b));
  else sorted.sort((a,b)=>editedAt(b)-editedAt(a));
  const tints=['#e8edf6','#f3e8e8','#e8f3ea','#f6f0e2','#efe8f6','#e2f0f6'];
  const cards=sorted.map((name,i)=>{
    const units=unitsOf(name);
    let days=0;for(const revs of units.values())days+=currentRev(revs).s.model.days.length;
    const sub=units.size?units.size+' unit'+(units.size===1?'':'s')+(days?' · '+days+' shoot day'+(days===1?'':'s'):''):'No schedules yet';
    const tint=tints[[...name].reduce((a,c)=>a+c.charCodeAt(0),0)%tints.length];
    const cover=PRODS[name]&&PRODS[name].info&&PRODS[name].info.cover;
    return `<div class="gcard" data-openprod="${esc(name)}" data-gname="${esc(name.toLowerCase())}">
      ${cover?`<div class="gposter haspic" style="background-image:url('${cover}')"></div>`
        :`<div class="gposter" style="background:${tint}"><span>${esc(name.slice(0,1).toUpperCase())}</span></div>`}
      <div class="gtitle">${esc(name)}<span class="gedit" data-prodedit="${esc(name)}" data-tip="Production settings">${icon('pencil')}</span></div>
      <div class="gsub">${sub}</div>
    </div>`;
  }).join('');
  // ---- Nothing here yet. An empty gallery with a search box over it reads as
  // "something failed to load"; a brand-new account should instead be told
  // plainly what to do first and what happens when they do it. The sample
  // schedule is offered as the no-commitment route in — it's already loaded.
  if(!sorted.length){
    $('#dashView').innerHTML=`
      <div id="dashTodaySlot"></div>
      <div class="dash-hero"><div><div class="dash-head">Productions</div><div class="dash-sub">${who?esc(who)+' · ':''}Nothing here yet</div></div></div>
      <div class="empty-first">
        <div class="ef-mark">${icon('file')}</div>
        <h2>Add your first production</h2>
        <p>Drop in a shooting schedule and Laural reads it for you — every shoot day, scene, location and cast number — then works out what the ${mode} costs across the whole shoot.</p>
        <div class="ef-acts">
          <button class="ef-primary" id="efAdd">Add your first production ${icon('arrow-right')}</button>
          ${demoFull>=0?`<button class="ef-ghost" data-side="${demoFull}">Have a look at the sample first</button>`:''}
        </div>
        <div class="ef-steps">
          <div class="ef-step"><span class="ef-n">1</span><b>Add a schedule</b>Upload the PDF, or build the days by hand if you haven’t had one yet.</div>
          <div class="ef-step"><span class="ef-n">2</span><b>Check it read right</b>Every figure is editable — correct anything it misread and it stays corrected.</div>
          <div class="ef-step"><span class="ef-n">3</span><b>Take the numbers</b>Costs, briefs and day-out-of-days, ready to export for the production office.</div>
        </div>
        <div class="ef-foot">Not sure where to start? The <b>?</b> at the bottom of the menu replays the tour.</div>
      </div>`;
    const bar0=$('#dashTodaySlot');
    if(bar0)renderDashTodayBar(bar0);
    return;
  }

  $('#dashView').innerHTML=`
    <div id="dashTodaySlot"></div>
    <div class="dash-hero"><div><div class="dash-head">Productions</div><div class="dash-sub">${who?esc(who):''}${who?' · ':''}${Mode}</div></div></div>
    <div class="gctl">
      <div class="searchwrap gsearch"><input id="dashSearch" type="search" placeholder="Search" value="${esc(DASH_Q)}"></div>
      <div class="grow"></div>
      <select id="dashSort" class="gsort"><option value="edited"${DASH_SORT==='edited'?' selected':''}>Last edited</option><option value="alpha"${DASH_SORT==='alpha'?' selected':''}>Alphabetically</option></select>
      <button class="gnew" id="dashNew">Create new</button>
    </div>
    <div class="ggrid">${cards}</div>`;
  const bar=$('#dashTodaySlot');
  if(bar)renderDashTodayBar(bar);
  if(DASH_Q)dashApplySearch();
}
let DASH_Q='',DASH_SORT='edited';
// filter cards in place — no re-render, so typing never loses focus
function dashApplySearch(){
  const q=DASH_Q.toLowerCase();
  document.querySelectorAll('#dashView .gcard').forEach(c=>{
    c.style.display=!q||c.dataset.gname.includes(q)?'':'none';
  });
}
document.addEventListener('input',e=>{
  if(e.target.id==='dashSearch'){DASH_Q=e.target.value;dashApplySearch();}
});
document.addEventListener('change',e=>{
  if(e.target.id==='dashSort'){DASH_SORT=e.target.value;renderDash();}
});
// A single production's home: its own totals, then every unit's schedule
// history (versions + what changed) — the thing people actually open this for.
function renderProdHome(name,mode,Mode,money){
  const units=unitsOf(name);
  let pFig=0,dayTotal=0;
  for(const revs of units.values()){const cur=currentRev(revs);pFig+=modeCost(cur.s);dayTotal+=cur.s.model.days.length;}
  let unitsHtml='';
  for(const [uk,revs] of units){
    const cur=currentRev(revs);
    const uOpen=!DASH_UNIT_CLOSED.has(name+'|'+uk); // open by default
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
      const kindTag={oneliner:'1-LINER',fullfat:'FULL FAT',merged:'MERGED'}[r.s.docKind]||'';
      return `<div class="verrow ${isCur?'current':''}" data-openrev="${r.i}">
        <span class="revchip">${esc((revLabel(r.s)||'').toUpperCase().slice(0,10))}</span>
        ${kindTag?`<span class="kindchip">${kindTag}</span>`:''}
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
      <div class="verlist" style="${uOpen?'':'display:none'}">${verRows}<div class="uploadrow" data-prodimport="${esc(name)}" data-unit="${uk}">+ Add new revision for ${unitName(cur.s.unit)}</div></div>
    </div>`;
  }
  // per-production branding drives the highlight colour of the whole page
  const pInfo=(PRODS[name]&&PRODS[name].info)||{};
  applyProdBranding(PRODS[name]);
  const cover=pInfo.banner||pInfo.cover;
  const tagline=pInfo.tagline;
  const onSettings=PROD_TAB==='settings';
  const schedulesPane=`
    <div class="summary" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:14px">
      <div class="stat"><div class="n">${dayTotal.toLocaleString()}</div><div class="l">Shoot days</div></div>
      <div class="stat money costable"><div class="n">${gbp(Math.round(pFig))}</div><div class="l">${Mode} total</div></div>
      <div class="stat"><div class="n">${units.size}</div><div class="l">Unit${units.size===1?'':'s'}</div></div>
    </div>
    <div class="prodcard" style="margin-top:18px">
      <div class="punits">
        ${unitsHtml||`<div class="uploadrow" data-prodimport="${esc(name)}">+ Add the first schedule</div>`}
        <div class="uploadrow addunit" data-prodimport="${esc(name)}">+ Add unit / block / episode</div>
      </div>
    </div>`;
  $('#dashView').innerHTML=`
    <div class="dash-hero"><div data-backprod="1" class="dash-back"><i>‹</i> All productions</div></div>
    ${cover?`<div class="prod-banner has" style="background-image:url('${cover}')"></div>`:''}
    <div class="dash-head" style="margin-top:${cover?'12px':'6px'}" data-openprod="${esc(name)}">${esc(name)}</div>
    ${tagline?`<div class="prod-tagline">${esc(tagline)}</div>`:''}
    <div class="prodtabs">
      <button class="prodtab${onSettings?'':' on'}" data-prodtab="schedules">Schedules</button>
      <button class="prodtab${onSettings?' on':''}" data-prodtab="settings">Settings</button>
    </div>
    ${onSettings?`<div id="prodSettingsInlineHost" class="ps-inline-host"></div>`:schedulesPane}`;
  if(onSettings)mountInlineSettings(name);
}
// ---------- settings as an in-page tab ----------
// The production settings live in one place: the #prodSettings modal sheet.
// The Settings tab shows that same sheet inline by relocating its .rp-sheet
// node into the page — so every handler bound to #psRail/#psContent/#psSave
// keeps working, and there's only ever one settings instance in the DOM.
function mountInlineSettings(name){
  const host=document.getElementById('prodSettingsInlineHost');
  if(!host)return;
  openProdSettings(name,true);           // build/populate the sheet, don't open the overlay
  const sheet=$('#prodSettings').querySelector('.rp-sheet');
  if(sheet){host.appendChild(sheet);PS_INLINE=true;}
  const close=$('#psClose');if(close)close.textContent='Done';
}
// move the sheet back into the modal before the page it lives in is wiped
function detachInlineSettings(){
  if(!PS_INLINE)return;
  const modal=$('#prodSettings');
  const sheet=(modal&&modal.querySelector('.rp-sheet'))||document.querySelector('#prodSettingsInlineHost .rp-sheet');
  if(modal&&sheet&&sheet.parentElement!==modal)modal.appendChild(sheet);
  PS_INLINE=false;
  const close=$('#psClose');if(close)close.textContent='Close';
}
function renderDashTodayBar(slot){
  const now=new Date();
  // weather anchors on today's/next shoot day across all productions
  let anchor=null;
  for(const src of SOURCES){
    if(!src.kind)continue;
    for(const d of src.model.days){const c=dayCal(d);if(c!=null&&c>=todayCal()){if(!anchor||c<anchor.cal)anchor={cal:c,d,prod:src.prod||src.title};}}
  }
  slot.innerHTML=`<div class="todaybar" style="margin-bottom:16px">
    <span class="tb-date"><b>${now.toLocaleDateString('en-GB',{weekday:'long'})}</b> ${now.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</span>
    <span class="tb-clock" id="nowClock">${now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span>
    <span class="tb-wx" id="wxSlot"></span>
    <span class="grow"></span>
    ${anchor?`<span class="tb-next">${anchor.cal===todayCal()?'Shooting today':'Next shoot day'} — <b>${esc(anchor.prod)}</b> D${anchor.d.num} · ${esc(chipDate(anchor.d))}${anchor.d.loc?' · '+esc(anchor.d.loc.slice(0,28)):''}</span>`:''}
  </div>`;
  loadTodayWeather(anchor&&anchor.d.loc,slot.querySelector('#wxSlot'));
}
function showDash(page){
  DASH=true;
  DASH_PAGE=page||'home';
  // Dashboard is the home screen: today bar and productions. Calculator and
  // Casting briefs are its sibling pages, both reachable with nothing open.
  if(DASH_PAGE==='home')PROD_HOME=null;
  $('#boardView').classList.add('hidden');$('#dashView').classList.remove('hidden');$('#colourPill').style.display='none';renderDash();renderSidebar();updateCrumbs();window.scrollTo(0,0);
}
function hideDash(){
  DASH=false;DASH_PAGE='home';
  // the briefs area belongs to the open production again
  setBriefScope(null);
  // hand the shared calculator view back to the board if the dashboard had it
  const vc=$('#viewCalc');
  if(vc&&vc.parentElement&&vc.parentElement.id==='dashCalcSlot'){$('#boardView').appendChild(vc);vc.classList.add('hidden');}
  $('#dashView').classList.add('hidden');$('#boardView').classList.remove('hidden');updateCrumbs();
  // opening a production is the first time the tabs mean anything, so that's
  // when the board tour is worth offering — never before
  setTimeout(()=>{if(!tourActive())maybeStartTour('board')},450);
}
// ---------- first-run tour ----------
// Offered once, and only when there's actually an app on screen to point at:
// not behind the sign-in gate, not on top of an open modal. The welcome tour
// runs the sidebar and top bar; finishing it rolls straight into the board.
let TOUR_OFFERED=false;
function maybeWelcomeTour(){
  if(TOUR_OFFERED)return;
  const gate=$('#gate');
  if(gate&&!gate.classList.contains('hidden'))return;      // still signing in
  if(document.querySelector('.modal.open'))return;          // something else is asking
  TOUR_OFFERED=true;
  setTimeout(()=>{
    // never cut off a tour that started in the meantime
    if(tourActive()||document.querySelector('.modal.open'))return;
    maybeStartTour('welcome',done=>{if(done&&!DASH)maybeStartTour('board')});
  },700);
}
// ---------- sidebar drawer ----------
const isMobileNav=()=>window.matchMedia('(max-width:820px)').matches;
function setSidebarCollapsed(on){
  $('#sidebar').classList.toggle('collapsed',on);
  $('#btnSidebar').classList.toggle('on',!on);
  // mobile: the sidebar is a slide-over drawer — track the open state on the
  // body so the scrim shows and the page behind it locks
  document.body.classList.toggle('drawer-open',isMobileNav()&&!on);
  // only remember the choice on desktop; mobile always starts closed
  if(!isMobileNav())store.set('crowdos-sidebar-collapsed',on?'1':'');
}
// mobile starts with the drawer closed regardless of the desktop preference
setSidebarCollapsed(isMobileNav()?true:store.get('crowdos-sidebar-collapsed')==='1');
$('#btnSidebar').addEventListener('click',()=>setSidebarCollapsed(!$('#sidebar').classList.contains('collapsed')));
$('#sideScrim').addEventListener('click',()=>setSidebarCollapsed(true));
$('#sideClose').addEventListener('click',()=>setSidebarCollapsed(true));
// picking anything in the drawer closes it on mobile (it covers the content)
$('#sidebar').addEventListener('click',e=>{if(isMobileNav()&&e.target.closest('.side-item,#sideDemo .side-item,#sideList .side-item'))setSidebarCollapsed(true);});
// keep the layout sane when rotating / resizing across the breakpoint
window.addEventListener('resize',()=>{if(!isMobileNav())document.body.classList.remove('drawer-open');});

// the three home pages, straight off the sidebar
$('#sideDash').addEventListener('click',()=>showDash('home'));
$('#sideCalc').addEventListener('click',()=>showDash('calc'));
$('#sideBriefsNav').addEventListener('click',()=>showDash('briefs'));
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
  logProdEvent(s.prod||s.title,'schedule','“'+revLabel(s)+'” reinstated as current revision for '+(s.unit||'Main')+' Unit');
  setStatus('“'+revLabel(s)+'” is now the current revision.');
}
let CURUNIT=null; // unit hint for "upload new revision into this unit"
document.addEventListener('click',e=>{
  if(e.target.closest('#dashNew')||e.target.closest('#sideNewProd')){openProdModal(null);return}
  // the empty dashboard's one big call to action — same route as "+ Add
  // schedule", which offers upload or build-by-hand and creates the
  // production on the way through
  if(e.target.closest('#efAdd')){openAddChooser(null,null);return}
  const mc=e.target.closest('[data-makecurrent]');
  if(mc){e.stopPropagation();e.preventDefault();makeCurrent(+mc.dataset.makecurrent);return}
  const ptab=e.target.closest('[data-prodtab]');
  if(ptab){PROD_TAB=ptab.dataset.prodtab;renderDash();return}
  const op=e.target.closest('[data-openprod]');
  if(op&&!e.target.closest('[data-prodedit]')){PROD_HOME=op.dataset.openprod;PROD_TAB='schedules';renderDash();return}
  const bp=e.target.closest('[data-backprod]');
  if(bp){PROD_HOME=null;PROD_TAB='schedules';renderDash();return}
  const tu=e.target.closest('[data-toggleunit]');
  if(tu){const k=tu.dataset.toggleunit;DASH_UNIT_CLOSED.has(k)?DASH_UNIT_CLOSED.delete(k):DASH_UNIT_CLOSED.add(k);renderDash();return}
  const orv=e.target.closest('[data-openrev]');
  if(orv&&!e.target.closest('[data-delsrc]')&&!e.target.closest('[data-makecurrent]')){setActive(+orv.dataset.openrev);return}
  const pe=e.target.closest('[data-prodedit]');
  if(pe){e.stopPropagation();e.preventDefault();
    // in the dashboard, the pencil opens the production on its Settings tab;
    // from the board it stays a modal so you don't lose your place
    if(DASH){PROD_HOME=pe.dataset.prodedit;PROD_TAB='settings';renderDash();}
    else openProdSettings(pe.dataset.prodedit);
    return}
  const pi=e.target.closest('[data-prodimport]');
  if(pi){e.stopPropagation();e.preventDefault();openAddChooser(pi.dataset.prodimport,pi.dataset.unit||null);return}
  const it=e.target.closest('[data-side]');
  if(it&&!e.target.closest('[data-delsrc]')&&!e.target.closest('[data-vieworig]'))setActive(+it.dataset.side);
});
{
  const origSetActive=setActive;
  setActive=function(i){
    SHOWING_EMPTY_PROD=null;
    if(DASH)hideDash();
    origSetActive(i);
    renderSidebar();
    // the colour pill names the ACTIVE schedule's version ("Blue schedule",
    // "V2 schedule"); user uploads use their stated version, the demo keeps
    // its detected colour, and it hides when there's nothing to say
    const s=SOURCES[i];
    if(s&&s.kind){
      const pill=$('#colourPill');
      pill.textContent=(s.version||revLabel(s))+' schedule ▾';
      pill.style.display='';
      pill.title='Switch schedule — every revision in '+(s.prod||s.title);
      // the production owns the rate card + any field overrides (applied to
      // every schedule in it) — resolved override → card → PACT/FAA defaults
      applyRateVals(resolveRateVals(s.prod||s.title));
    }
  };
}
document.addEventListener('click',e=>{
  const v=e.target.closest('[data-vieworig]');
  if(!v)return;
  e.stopPropagation();e.preventDefault();
  const s=SOURCES[+v.dataset.vieworig];
  if(s)openOriginalViewer(s);
},true);
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
  deleteSourceFiles(s); // drop the stored original (local cache + account storage)
  logProdEvent(s.prod||s.title,'schedule','Deleted '+(s.kind==='manual'?'manual schedule':'revision '+revLabel(s))+' ('+(s.unit||'Main')+' Unit, '+s.model.days.length+' days)');
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
function saveFCROWS(){store.set('crowdos-fcrows',JSON.stringify(FCROWS));cloudSyncUser('fcrows',FCROWS)}

// ---------- manual per-day stunts (for one-liners with no stunt breakdown) ----------
// Stored per day like CDAY; injected into the stunt computation as synthetic
// cast so they cost through the normal StuntOS engine (rate + holiday + usage
// + weekly insurance) without appearing as fake scenes on the day board.
let STUNTDAY={};
try{STUNTDAY=JSON.parse(store.get('crowdos-stuntday')||'{}')}catch(e){STUNTDAY={}}
function saveStuntDay(){store.set('crowdos-stuntday',JSON.stringify(STUNTDAY));cloudSyncBlob('stuntday',STUNTDAY)}
// Per-day HOURS config for stunt days (the stunt twin of CDAY): call/wrap,
// SWD/CWD framework, night toggle — namespaced keys like STUNTDAY's
let STUNTCFG={};
try{STUNTCFG=JSON.parse(store.get('crowdos-stuntcfg')||'{}')}catch(e){STUNTCFG={}}
function saveStuntCfg(){store.set('crowdos-stuntcfg',JSON.stringify(STUNTCFG));cloudSyncBlob('stuntcfg',STUNTCFG)}
// default hours for a day the calculator hasn't touched: the schedule's own
// printed hours ("0800-1800") when parseable, else the 07:00/18:00 house call
// one-line summary of what the configured hours cost per head (performer rate)
function sdHrsText(cfg){
  const frac=+ACTIVE_RATES.rOTFrac||0;
  const ex=engineStuntDayExtras(cfg,+ACTIVE_RATES.rPerf||0,{otFrac:frac});
  const bits=[];
  if(ex.dawn)bits.push('dawn call — 5h day');
  if(ex.earlyH>0)bits.push(Math.ceil(ex.earlyH)+'h early'+(frac?' @ '+gbp(ex.perHr):''));
  if(ex.otH>0)bits.push(Math.ceil(ex.otH)+'h OT'+(frac?' @ '+gbp(ex.perHr)+'/head':''));
  return bits.join(' · ')||'within the working day';
}
// "Hours & shift" card for the stunt day cost popup — the crowd calculator's
// twin. SWD/CWD framework, night toggle, call/wrap slider. Hours only ADD
// money when the production's stunt card defines an OT fraction (all the
// Equity cards do; the neutral default card doesn't — flagged inline).
function stuntHoursCardHTML(d){
  const key=adjKey(d);
  const cfg=STUNTCFG[key];
  const eff=cfg||seedStuntCfg(d);
  const rv=ACTIVE_RATES;
  const segBtn=(v,label)=>`<button class="tb-btn" data-v="${v}" style="padding:4px 10px;font-size:10.5px${(eff.fw==='cwd')===(v==='cwd')?';border-color:var(--hv-line);color:var(--hv)':''}">${label}</button>`;
  return `<div data-sdday="${esc(d.id)}" style="padding:12px 14px 4px;border-bottom:1px solid var(--line)">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
      <b style="font-family:var(--cond);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--sub)">Hours &amp; shift</b>
      <span data-sdfw style="display:inline-flex;gap:4px">${segBtn('swd','SWD 10h')}${segBtn('cwd','CWD 8h')}</span>
      <label class="chk" style="font-size:11px"><input type="checkbox" id="sdNight" ${eff.night?'checked':''}> Night (+${esc(rv.rNightPct||0)}%)</label>
      ${cfg?'<button class="dchip" data-sdreset="1">Reset to schedule</button>':''}
      <span id="sdHrsInfo" style="font-family:var(--mono);font-size:10.5px;color:var(--sub);margin-left:auto">${esc(sdHrsText(eff))}${cfg?'':' — adjust hours to apply'}</span>
    </div>
    <div class="cdrow" style="margin-bottom:2px">${sliderHTML(eff.call,eff.wrap,'sd')}</div>
    ${(+rv.rOTFrac||0)?'':'<div style="font-size:10.5px;color:var(--faint);margin:2px 0 8px">This production\u2019s stunt card sets no OT fraction, so hours are recorded but add no overtime \u2014 pick an Equity card (or set \u201cOT per hour = daily \u00f7\u201d) in Production Settings \u2192 Rate cards.</div>'}
  </div>`;
}
function seedStuntCfg(d){
  const m=/(\d{1,2})[:.]?(\d{2})\s*[-–]\s*(\d{1,2})[:.]?(\d{2})/.exec(d.hours||'');
  return {
    call:m?String(+m[1]).padStart(2,'0')+':'+m[2]:'07:00',
    wrap:m?String(+m[3]).padStart(2,'0')+':'+m[4]:'18:00',
    fw:/CWD/i.test(d.type||'')?'cwd':'swd',
    night:/CWN|SWN|night/i.test(d.type||''),
  };
}
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
// Repair pass: between 2026-07-16 and 2026-07-19 the per-scene editor
// namespaced an already-namespaced key, so edits on real productions were
// stored as "ns|ns|unit|num|scene|part|idx" — a key the cost engine never
// reads. Collapse them to the single-prefix shape (runs on local load and
// again after the cloud restore, then syncs the corrected blob up).
function migrateScedKeys(){
  let n=0;
  for(const k of Object.keys(SCED)){
    const seg=k.split('|');
    if(seg.length>=7&&/^[pm]:/.test(seg[0])&&seg[0]===seg[1]){
      const fixed=seg.slice(1).join('|');
      if(SCED[fixed]===undefined)SCED[fixed]=SCED[k];
      delete SCED[k];n++;
    }
  }
  if(n)saveSced();
  return n;
}
migrateScedKeys();
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
    // A rejected write used to disappear into .catch(()=>{}) — which is how
    // 'notes', 'briefs', 'dayloc' and 'stuntcfg' spent weeks being refused by
    // a check constraint while the app looked like it was syncing. Record what
    // lands (sign-out only clears confirmed-synced data) and say so once if it
    // doesn't.
    const done=r=>{if(r&&r.error)noteCloudFail(kind,r.error);else CLOUD_OK.add(kind)};
    if(Object.keys(subset).length)cloud.upsertDayEdit(s.cloudId,'__'+kind+'__',kind,subset).then(done,e=>noteCloudFail(kind,e));
    else cloud.deleteDayEdit(s.cloudId,'__'+kind+'__',kind).then(done,()=>{});
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
    // Same reset-then-overlay shape the crowd rows use, for the STUNTS/OTHER
    // column: snapshot the schedule's own stunt / child / action-vehicle lines
    // once, put them back on every pass, then lay any typed override on top.
    // Without the reset, clearing an override would leave the scene stuck on
    // the edited figures instead of returning to the schedule's.
    if(!s._otherBase){
      s._otherBase={
        extras:(s.extras||[]).map(x=>({name:x.name,count:x.count})),
        children:(s.children||[]).map(x=>({name:x.name,count:x.count})),
        avs:(s.avs||[]).map(x=>({name:x.name,count:x.count})),
      };
    }
    const ob=s._otherBase;
    s.extras=ob.extras.map(x=>({name:x.name,count:x.count}));
    s.children=ob.children.map(x=>({name:x.name,count:x.count}));
    s.avs=ob.avs.map(x=>({name:x.name,count:x.count}));
    // Capture the scene's PARSED crowd baseline once (before any override is
    // ever overlaid), then reset to it on every pass before applying SCED.
    // The model is mutated in place — not re-parsed on refresh — so without
    // this reset, zeroing a scene's crowd and then removing its SCED entry
    // (an undo, or clearing the last group) would leave the scene stuck at 0
    // instead of returning to the schedule's numbers. Resetting makes applySced
    // idempotent and "no SCED entry" reliably mean "the schedule's baseline".
    if(!s._crowdBase){
      s._crowdBase={sa:+s.sa||0,
        saChars:(s.saChars||[]).map(x=>({name:x.name,count:x.count})),
        featured:(s.featured||[]).map(x=>({name:x.name,count:x.count})),
        spacts:(s.spacts||[]).map(x=>({name:x.name,count:x.count}))};
    }
    const b=s._crowdBase;
    s.sa=b.sa;
    s.saChars=b.saChars.map(x=>({name:x.name,count:x.count}));
    s.featured=b.featured.map(x=>({name:x.name,count:x.count}));
    s.spacts=b.spacts.map(x=>({name:x.name,count:x.count}));
    const e=SCED[scedKey(sceneNK(d,s,idx))];
    if(!e)return;
    // split the crowd rows into: unnamed SA (scene.sa integer), named SA,
    // Featured (named SA + supplementary fees), and SPACT (named or unnamed).
    // A row with no name is plain "N SA" / "N SPACT".
    if(e.chars){
      const rows=e.chars.filter(c=>c.count>0);
      const mk=c=>{const o={name:c.name||'',count:+c.count};if(c.note)o.note=c.note;if(+c.sup>0)o.sup=+c.sup;if(c.fromAbove)o.flags=['asAbove'];return o};
      s.sa=rows.filter(c=>c.tier!=='SPACT'&&!c.featured&&!c.name).reduce((a,c)=>a+(+c.count),0);
      s.saChars=rows.filter(c=>c.tier!=='SPACT'&&!c.featured&&c.name).map(mk);
      s.featured=rows.filter(c=>c.tier!=='SPACT'&&c.featured&&c.name).map(mk);
      s.spacts=rows.filter(c=>c.tier==='SPACT').map(mk);
    }
    // STUNTS/OTHER typed on the crowd breakdown. Stored as a full replacement
    // of the scene's three reference lists, so a line removed here stays
    // removed instead of reappearing from the schedule on the next recompute.
    if(e.others){
      for(const src of ['extras','children','avs']){
        if(!Array.isArray(e.others[src]))continue;
        s[src]=e.others[src]
          .filter(r=>(+r.count||0)>0||(r.name||'').trim())
          .map(r=>({name:(r.name||'').trim(),count:+r.count||0}));
      }
    }
    if(!e.chars){ // legacy SCED entries (pre-Characters-list)
      if(e.sa!=null)s.sa=+e.sa||0;
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
    // Add crowd = a list of character rows. Each row is an SA or SPACT, with
    // an optional name. No name → counts as plain "N SA" / "N SPACT". Featured
    // is a tickbox on an SA (adds supplementary fees).
    const above=f=>!!(f.flags||[]).includes('asAbove');
    const chars=e.chars||[
      ...(s.sa?[{name:'',count:s.sa,tier:'SA',featured:false}]:[]),
      ...(s.saChars||[]).map(f=>({name:f.name,count:f.count,tier:'SA',featured:false,fromAbove:above(f)})),
      ...(s.featured||[]).map(f=>({name:f.name,count:f.count,tier:'SA',featured:true,fromAbove:above(f)})),
      ...(s.spacts||[]).map(f=>({name:f.name,count:f.count,tier:'SPACT',featured:false,fromAbove:above(f)})),
    ];
    const row=(c,i)=>`<div class="reqrow" data-ri="${i}">
      <input data-rq="ccount" type="number" min="0" value="${+c.count||0}">
      <select data-rq="ctier"><option${c.tier!=='SPACT'?' selected':''}>SA</option><option${c.tier==='SPACT'?' selected':''}>SPACT</option></select>
      <input data-rq="cname" value="${esc(c.name||'')}" placeholder="Character / group (optional)">
      <label class="reqfeat ${c.tier==='SPACT'?'off':''}"><input type="checkbox" data-rq="cfeat" ${c.featured?'checked':''}> Featured</label>
      <label class="reqfeat"><input type="checkbox" data-rq="cabove" ${c.fromAbove?'checked':''}> From above</label>
      <button data-rqdel="1">✕</button></div>`;
    return `<div class="reqedit" data-rk="${esc(nk)}">
      <div class="reqseclabel">Add crowd</div>
      <div class="reqchars">${chars.map(row).join('')}</div>
      <button class="reqadd" data-rqaddchar="1">+ Add character</button>
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
    // snapshot the scene's names BEFORE the edit so a straight rename can
    // carry through to any brief attached to the old name (briefs and the
    // day board are two views of the same characters)
    const ref=sceneFromKey(nk);
    const oldNames=new Set();
    if(ref)for(const f of [...(ref.s.saChars||[]),...(ref.s.featured||[]),...(ref.s.spacts||[])])if(f.name)oldNames.add(f.name.toLowerCase());
    e.chars=[];
    ed.querySelectorAll('.reqrow').forEach(row=>{
      const count=Math.max(0,+(row.querySelector('[data-rq="ccount"]')||{}).value||0);
      if(!count)return; // a zero-count row is nothing
      const name=((row.querySelector('[data-rq="cname"]')||{}).value||'').trim();
      const tier=(row.querySelector('[data-rq="ctier"]')||{}).value||'SA';
      const featured=tier!=='SPACT'&&!!(row.querySelector('[data-rq="cfeat"]')||{}).checked;
      const fromAbove=!!(row.querySelector('[data-rq="cabove"]')||{}).checked;
      e.chars.push({name,count,tier,featured,fromAbove});
    });
    // always persist, even with zero rows — an explicit "removed every
    // character" edit must stick (as scene.sa=0 etc via applySced), not fall
    // back to re-deriving the scene's own parsed baseline count. Deleting the
    // SCED entry here used to make removing the last row a silent no-op: the
    // scene's original count would just reappear next time the editor opened.
    SCED[scedKey(nk)]=e;
    // one name gone + one name new = a rename: point briefs at the new name
    // once no other scene still carries the old one (checked after refresh)
    const newNames=new Set(e.chars.filter(c=>c.name).map(c=>c.name.toLowerCase()));
    const removed=[...oldNames].filter(x=>!newNames.has(x));
    const added=e.chars.filter(c=>c.name&&!oldNames.has(c.name.toLowerCase()));
    window.__briefRenameCheck={removed,added:added.map(c=>c.name)};
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
  // after the recompute: if this edit was a clean rename (one name out, one
  // in) and the old name survives nowhere else, any brief on the old name
  // follows to the new one — the two areas stay in step in both directions
  const chk=window.__briefRenameCheck;window.__briefRenameCheck=null;
  if(chk&&chk.removed.length===1&&chk.added.length===1){
    const gone=chk.removed[0],to=chk.added[0];
    const {chars}=crowdCharacters();
    if(!chars.some(c=>c.name.toLowerCase()===gone)){
      let moved=0;
      for(const x of briefsForNs())if(x.b.character.toLowerCase()===gone){x.b.character=to;x.b.updatedAt=new Date().toISOString();moved++}
      if(moved){saveBriefs();setStatus('Brief “'+to+'” follows the rename you just made on the day board.');if(!$('#viewBriefs').classList.contains('hidden'))renderBriefs();}
    }
  }
}
{
  const origRenderFreeCalc=renderFreeCalc;
  renderFreeCalc=function(){
    origRenderFreeCalc();
    if(APPMODE==='stunt')return;
    const host=$('#viewCalc');
    if(!host)return;
    const per=t=>fcPerHead(FC,t).per;
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
  const nameInp=document.querySelector('[data-fcname]');
  FCROWS.push({name:(nameInp&&nameInp.value||'').trim(),tier:FC.tier,count:heads,sup:0});
  if(nameInp)nameInp.value='';
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

// ---------- admin rate cards ----------
// Rate cards are PER DEPARTMENT — 'sa' (crowd: PACT/FAA, PACT/Equity, customs)
// and 'stunts' (Equity Cinema Feature Film / TV / SVOD, customs). A production
// picks one card per department in Production Settings and can override any
// individual field there — the same pattern Locations uses for travel-band
// overrides. Cards are managed from Account → Manage rate cards, synced via
// the rate_cards table. Dancers/Actors departments arrive with their costing.
// NOTE: Cat A/B travel is a crowd concept only — stunt travel is a mode
// (none / mileage @ £-per-mile / train fare) applied per day.
// Talent types — each is its own rate-card slot with its own field set.
// SA and SPACT are both "Crowd" talent (Tyler: "most of the time you'd have
// SAs and SPACTs, not one or the other") so both show, always, in CrowdOS;
// Stunts (bundling performer + coordinator + stunt dept coordinator, exactly
// as every real agreement bundles them) shows, always, in StuntOS.
// fwStd/fwCwd/otGranularity are STRUCTURAL rules of the talent type — every
// agreement for that type uses the same day-length shape, only the money
// differs (confirmed across every document sent: all 5 stunt agreements use
// 8/10hr + hourly OT; SA is 7/9hr; SPACT is 8/10hr — both half-hourly OT).
const RATE_DEPTS=[
  {kind:'sa',label:'SA',mode:'crowd',defaults:'PACT/FAA 2026 (defaults)',otherStandards:'PACT/Equity',fwCwd:7,fwStd:9,otGranularity:'half'},
  {kind:'spact',label:'SPACT',mode:'crowd',defaults:'Take 3 SPACT 2026 (defaults)',otherStandards:'',fwCwd:8,fwStd:10,otGranularity:'half'},
  {kind:'stunts',label:'Stunts',mode:'stunt',defaults:'Standard 2026 (defaults)',otherStandards:'Equity CFA / TV / SVOD / ITV / BBC / Commercial',fwCwd:8,fwStd:10,otGranularity:'full'},
];
const RATE_FIELDS=[
  {id:'cSA',label:'SA day rate',unit:'£',dept:'sa'},
  {id:'cHol',label:'Holiday %',unit:'%',dept:'sa'},
  {id:'cOTday',label:'Overtime — day',unit:'£',dept:'sa'},
  {id:'cOTnight',label:'Overtime — night',unit:'£',dept:'sa'},
  {id:'cET',label:'Early travel',unit:'£',dept:'sa'},
  {id:'cTravelA',label:'Travel — Cat A',unit:'£',dept:'sa'},
  {id:'cTravelB',label:'Travel — Cat B',unit:'£',dept:'sa'},
  {id:'cSpact',label:'SPACT day rate',unit:'£',dept:'spact'},
  {id:'cSpactNight',label:'SPACT night rate',unit:'£',dept:'spact'},
  {id:'cSpactHol',label:'SPACT holiday in lieu',unit:'£',dept:'spact'},
  {id:'cSpactET',label:'SPACT early travel',unit:'£',dept:'spact'},
  {id:'rPerf',label:'Performer day rate',unit:'£',dept:'stunts'},
  {id:'rCoord',label:'Coordinator day rate',unit:'£',dept:'stunts'},
  {id:'rHol',label:'Holiday pay / day',unit:'£',dept:'stunts'},
  {id:'rIns',label:'Insurance / day',unit:'£',dept:'stunts'},
  {id:'rInsDays',label:'Insured days / week',unit:'×',dept:'stunts'},
  {id:'rUse',label:'Usage % of day rate',unit:'%',dept:'stunts'},
  {id:'rSDRate',label:'Stunt dept coordinator day rate',unit:'£',dept:'stunts'},
  {id:'rSDDays',label:'Stunt dept coordinator days/wk',unit:'×',dept:'stunts'},
  {id:'rTravelMode',label:'Travel allowance',dept:'stunts',options:[['none','None'],['mileage','Mileage'],['train','Train fare']]},
  {id:'rMileRate',label:'Mileage rate / mile',unit:'£',dept:'stunts'},
  // agreement rules — consumed by the engine (weekly fee auto-applies when a
  // performer works 5+ days in one week; night uplift applies on CWN days)
  {id:'rPerfWk',label:'Performer weekly (5 days)',unit:'£',dept:'stunts'},
  {id:'rCoordWk',label:'Coordinator weekly (5 days)',unit:'£',dept:'stunts'},
  {id:'rNightPct',label:'Night shoot uplift %',unit:'%',dept:'stunts'},
  {id:'rDay6Mult',label:'6th day in a week (× daily)',unit:'×',dept:'stunts'},
  {id:'rDay7Mult',label:'7th day in a week (× daily)',unit:'×',dept:'stunts'},
  // stored on the card now, consumed by the stunt calculator & Fittings builds
  {id:'rOTFrac',label:'OT per hour = daily ÷ (0 = none)',unit:'÷',dept:'stunts'},
  {id:'rFitFlat',label:'Fitting fee (flat £)',unit:'£',dept:'stunts'},
  {id:'rFitPct',label:'Fitting fee (% of daily)',unit:'%',dept:'stunts'},
  {id:'rTravelDayPct',label:'Travel day (% of daily)',unit:'%',dept:'stunts'},
];
const RC_INPUTS=RATE_FIELDS.map(f=>f.id);
const RC_DEFAULTS={cSA:'111.21',cHol:'12.07',cOTday:'11.69',cOTnight:'17.54',cET:'20.91',cTravelA:'17.09',cTravelB:'23.89',cSpact:'255',cSpactNight:'372',cSpactHol:'15.50',cSpactET:'20.91',rPerf:'600',rCoord:'1000',rHol:'17.50',rIns:'17.50',rInsDays:'2',rUse:'55.5',rSDRate:'350',rSDDays:'4',rTravelMode:'none',rMileRate:'0.55',rPerfWk:'3000',rCoordWk:'5000',rNightPct:'0',rDay6Mult:'1',rDay7Mult:'1',rOTFrac:'0',rFitFlat:'0',rFitPct:'0',rTravelDayPct:'0'};
// Built-in standard cards, from the official rate documents (PACT/FAA 2026 is
// the defaults themselves, so it isn't duplicated here). Values are mapped
// onto the app's field set:
// PACT/Equity 2025 (1 Apr–31 Dec 2025, Extra People card): basic £123.15
// ALREADY INCLUDES holiday → holiday % is 0 here (totals right; the £-holiday
// line in breakdowns reads £0 by design). OT £9.16/30min incl holiday; night/
// PH OT £13.74; early uplift (call before 6am, 7am Sun/BH) £9.00. Travel is
// DISTANCE-based, not zone-based — mapped: Cat A slot = £11.00 (4–10.99 mi),
// Cat B slot = £16.00 (11–40 mi). Not represented: 0–3.99 mi negotiable cap
// £4, >40 mi cap £20. SPACT fields stay the Take 3 2026 card (SPACT is
// independent of the FAA/Equity choice).
// Stunt standards from the BSR & Equity Combined Rate Card v2.7 (Apr 2026).
// ALL BSR rates are MINIMUMS — negotiate upwards via the override column.
// Mapping notes (fields the app doesn't model are NOT invented):
// - CFA (Cinema Feature Film, from 6 Apr 2026): usage is INCLUDED in the
//   daily fee → usage % = 0. Insurance £24/day capped £47/wk → modelled as
//   first 2 days/week (2×£24=£48, £1 over the true cap).
// - TV/SVOD (from 1 Jan 2026): usage fee ON TOP of the daily fee (rehearsals
//   + shoot days) → keeps the 55.5% usage field. Insurance £17.50 capped
//   £35/wk = exactly 2 days.
// - Commercial (Equity recommended): holiday is 12.07% but the stunt engine
//   holds holiday as flat £/day → stored as £66.39 (12.07% of the £550
//   performer fee; coordinator holiday runs slightly under — override if it
//   matters). BSR-recommended mileage 45p/mi cars on this card.
// - NOT modelled (yet): stunt overtime (1/7, 1/6 or 1/5 of daily per hour),
//   fitting fees (£171 CFA / 30% TV/SVOD / banded ITV+BBC — saved for the
//   Fittings build), travel DAYS at ½ daily fee.
const BUILTIN_CARDS={
  sa:{
    'PACT/Equity 2025':{cSA:'123.15',cHol:'0',cOTday:'9.16',cOTnight:'13.74',cET:'9.00',cTravelA:'11.00',cTravelB:'16.00'},
  },
  spact:{}, // Take 3 SPACT 2026 IS the defaults (RC_DEFAULTS) — no separate card needed
  stunts:{
    'Equity CFA 2026':{rPerf:'708',rCoord:'899',rHol:'20.64',rIns:'24',rInsDays:'2',rUse:'0',rSDRate:'350',rSDDays:'4',rTravelMode:'none',rMileRate:'0.55',rPerfWk:'2832',rCoordWk:'3596',rNightPct:'50',rDay6Mult:'1',rDay7Mult:'1.5',rOTFrac:'7',rFitFlat:'171',rFitPct:'0',rTravelDayPct:'50'},
    'Equity TV / SVOD 2026':{rPerf:'529.50',rCoord:'702.50',rHol:'17.50',rIns:'17.50',rInsDays:'2',rUse:'55.5',rSDRate:'350',rSDDays:'4',rTravelMode:'none',rMileRate:'0.55',rPerfWk:'2116.50',rCoordWk:'2812.50',rNightPct:'50',rDay6Mult:'1',rDay7Mult:'1.5',rOTFrac:'6',rFitFlat:'0',rFitPct:'30',rTravelDayPct:'50'},
    'ITV TV 2026':{rPerf:'425',rCoord:'600',rHol:'17.50',rIns:'0',rInsDays:'0',rUse:'0',rSDRate:'350',rSDDays:'4',rTravelMode:'none',rMileRate:'0.55',rPerfWk:'2125',rCoordWk:'3000',rNightPct:'50',rDay6Mult:'1',rDay7Mult:'1',rOTFrac:'5',rFitFlat:'167.66',rFitPct:'0',rTravelDayPct:'50'},
    'BBC TV 2025':{rPerf:'391',rCoord:'451',rHol:'0',rIns:'0',rInsDays:'0',rUse:'0',rSDRate:'350',rSDDays:'4',rTravelMode:'none',rMileRate:'0.55',rPerfWk:'1562',rCoordWk:'1804',rNightPct:'0',rDay6Mult:'1',rDay7Mult:'1',rOTFrac:'0',rFitFlat:'190.30',rFitPct:'0',rTravelDayPct:'0'},
    'Commercial (Equity rec.)':{rPerf:'550',rCoord:'700',rHol:'66.39',rIns:'0',rInsDays:'0',rUse:'0',rSDRate:'350',rSDDays:'4',rTravelMode:'mileage',rMileRate:'0.45',rPerfWk:'2750',rCoordWk:'3500',rNightPct:'50',rDay6Mult:'1',rDay7Mult:'1',rOTFrac:'5',rFitFlat:'50',rFitPct:'0',rTravelDayPct:'0'},
  },
};
// pickers and lookups see builtins + the user's customs (customs shadow a
// builtin of the same name)
function cardsFor(dept){return {...BUILTIN_CARDS[dept],...RATECARDS[dept]}}
// Stunt cards live in StuntOS only; SA/SPACT cards live in CrowdOS only —
// each mode manages and shows just its own talent types (Tyler's rule).
// Both SA and SPACT show together in CrowdOS ("most of the time you'd have
// both, not one or the other") — no attach/detach needed for these two.
function deptsForMode(){return RATE_DEPTS.filter(d=>d.mode===(APPMODE==='stunt'?'stunt':'crowd'))}
// {sa:{name→vals}, spact:{...}, stunts:{name→vals}} — new storage key; the
// short-lived single-card format ('crowdos-ratecards') is abandoned, nothing
// real used it
let RATECARDS={sa:{},spact:{},stunts:{}};
try{
  const v=JSON.parse(store.get('crowdos-ratecards2')||'{}');
  RATECARDS={sa:v.sa||{},spact:v.spact||{},stunts:v.stunts||{}};
}catch(e){}
function saveRateCardsLocal(){store.set('crowdos-ratecards2',JSON.stringify(RATECARDS))}
// The full resolved rate set for the ACTIVE production — includes agreement
// rules (weekly fees, night uplift, 6th/7th-day multipliers) that have no
// calculator input boxes, so they can't be read back from the DOM
let ACTIVE_RATES={...RC_DEFAULTS};
function applyRateVals(vals){
  ACTIVE_RATES={...RC_DEFAULTS,...vals};
  for(const id of RC_INPUTS){const el=document.getElementById(id);if(el&&vals[id]!=null)el.value=vals[id];}
  refreshAll();
}
// engine-shaped stunt agreement rules from a resolved rate set
function stuntRulesFrom(v){
  return {perfWk:+v.rPerfWk||undefined,coordWk:+v.rCoordWk||undefined,
    nightPct:+v.rNightPct||0,day6Mult:+v.rDay6Mult||1,day7Mult:+v.rDay7Mult||1,otFrac:+v.rOTFrac||0};
}
// The card a production uses for a department. A legacy single card (saved
// before the department split) answers for both departments — any field it
// lacks falls through to the defaults anyway.
function prodCardFor(p,dept){
  if(p&&p.rateCards&&p.rateCards[dept])return p.rateCards[dept];
  if(p&&p.rateCard)return p.rateCard;
  return null;
}
// The rates actually used for a production: a field override wins over the
// department's chosen card, which wins over the built-in defaults — same
// resolution order as bandFor() for travel bands.
function resolveRateVals(prodName){
  const p=prodName&&PRODS[prodName];
  const overrides=(p&&p.rateOverrides)||{};
  const vals={};
  for(const f of RATE_FIELDS){
    const card=prodCardFor(p,f.dept);
    const cv=card&&card.vals?card.vals[f.id]:null;
    vals[f.id]=overrides[f.id]!=null&&overrides[f.id]!==''?overrides[f.id]:(cv!=null?cv:RC_DEFAULTS[f.id]);
  }
  return vals;
}
{
  const note=`<span style="color:var(--faint)">Rates come from the production's chosen rate card (Production Settings → Rate cards). <a href="#" id="rcAdminLink" style="color:var(--hv)">Manage rate cards</a></span>`;
  const stuntGrid=document.querySelector('#ratesBar .rates-grid');
  if(stuntGrid){const w=document.createElement('div');w.className='rates-note';w.innerHTML=note;stuntGrid.appendChild(w);}
  const crowdGrid=document.querySelector('#crowdRatesBar .rates-grid');
  if(crowdGrid){const w=document.createElement('div');w.className='rates-note';w.innerHTML=note;crowdGrid.appendChild(w);}
  document.addEventListener('click',e=>{
    if(e.target.closest('#rcAdminLink')){e.preventDefault();openRateAdmin();}
  });
}
// RCA_EDIT: null = list only; {kind,name:''} = new-card form for that
// department; {kind,name} = editing that card (name locked — no rename in v1)
let RCA_EDIT=null;
function openRateAdmin(){RCA_EDIT=null;renderRateAdmin();$('#rateAdminModal').classList.add('open');}
function closeRateAdmin(){$('#rateAdminModal').classList.remove('open');RCA_EDIT=null;}
$('#rcaClose').addEventListener('click',closeRateAdmin);
$('#rateAdminModal').addEventListener('click',e=>{if(e.target.id==='rateAdminModal')closeRateAdmin();});
// one field input — a dropdown for mode-style fields, a number box otherwise
function rcaFieldHTML(f,v,dis){
  if(f.options)return `<div class="rfield"><label>${esc(f.label)}</label><div class="inwrap"><select data-rcaf="${f.id}" ${dis?'disabled':''} style="width:100%;border:none;background:var(--panel2);color:var(--ink);padding:9px 10px;font-family:var(--mono);font-size:13px">${f.options.map(([val,lab])=>`<option value="${val}"${v===val?' selected':''}>${lab}</option>`).join('')}</select></div></div>`;
  return `<div class="rfield"><label>${esc(f.label)}</label><div class="inwrap"><span>${esc(f.unit)}</span><input data-rcaf="${f.id}" type="number" step="0.01" value="${esc(v)}" ${dis?'disabled':''}></div></div>`;
}
function renderRateAdmin(){
  const deptList=(d,i)=>{
    const defName=d.defaults.replace(' (defaults)','');
    // the app's baseline card first, then built-in standards (both read-only,
    // click to see every number), then the user's custom cards
    const defRow=`<div class="prow" data-rcaview="__default" data-rcakind="${d.kind}">
        <span class="pname">${esc(defName)}</span>
        <span class="pmeta">the baseline — every production starts on these numbers</span>
        <span class="ptools"><span class="ps-src sched" style="cursor:default">STANDARD</span></span>
        <span class="prow-chev">›</span>
      </div>`;
    const builtins=Object.keys(BUILTIN_CARDS[d.kind]).sort().map(n=>`<div class="prow" data-rcaview="${esc(n)}" data-rcakind="${d.kind}">
        <span class="pname">${esc(n)}</span>
        <span class="pmeta">built-in standard — pick it in Production Settings</span>
        <span class="ptools"><span class="ps-src sched" style="cursor:default">STANDARD</span></span>
        <span class="prow-chev">›</span>
      </div>`).join('');
    const names=Object.keys(RATECARDS[d.kind]).sort();
    const rows=defRow+builtins+names.map(n=>`<div class="prow" data-rcaopen="${esc(n)}" data-rcakind="${d.kind}">
        <span class="pname">${esc(n)}</span>
        <span class="pmeta">${RATE_FIELDS.filter(f=>f.dept===d.kind).length} fields</span>
        <span class="ptools"><span data-rcadel="${esc(n)}" data-rcakind="${d.kind}" data-tip="Delete card">✕</span></span>
        <span class="prow-chev">›</span>
      </div>`).join('');
    return `<div class="dash-sub" style="margin:${i===0?'0':'22px'} 0 8px">${esc(d.label)} — standards: ${esc(defName)}${d.otherStandards?' · '+esc(d.otherStandards):''}</div>
      <div class="prodlist">${rows}
      <button class="dash-card dash-new" data-rcanew="${d.kind}" style="margin-top:4px;min-height:52px">+ New ${esc(d.label)} card</button></div>`;
  };
  let form='';
  if(RCA_EDIT&&RCA_EDIT.view){
    // read-only viewer for the baseline / built-in standards — this is where
    // you SEE the rates, even though they can't be edited
    const dept=RATE_DEPTS.find(d=>d.kind===RCA_EDIT.kind);
    const isDefault=RCA_EDIT.name==='__default';
    const title=isDefault?dept.defaults.replace(' (defaults)',''):RCA_EDIT.name;
    const vals=isDefault?{}:(BUILTIN_CARDS[RCA_EDIT.kind][RCA_EDIT.name]||{});
    form=`<div class="dash-sub" style="margin:22px 0 8px">“${esc(title)}” — built-in numbers (read-only)</div>
    <div class="prodcard"><div class="punits" style="padding:16px">
      <div class="rca-fields">${RATE_FIELDS.filter(f=>f.dept===RCA_EDIT.kind).map(f=>rcaFieldHTML(f,vals[f.id]!=null?vals[f.id]:RC_DEFAULTS[f.id],true)).join('')}</div>
      <div style="display:flex;gap:10px;margin-top:16px;align-items:center">
        <button class="tb-btn" id="rcaCancel">Close</button>
        <span class="cdinfo">Need different numbers? Create a custom card below — it starts from these values.</span>
      </div>
    </div></div>`;
  }else if(RCA_EDIT){
    const dept=RATE_DEPTS.find(d=>d.kind===RCA_EDIT.kind);
    const editingVals=RCA_EDIT.name?(RATECARDS[RCA_EDIT.kind][RCA_EDIT.name]||{}):{};
    form=`<div class="dash-sub" style="margin:22px 0 8px">${RCA_EDIT.name?'Editing “'+esc(RCA_EDIT.name)+'”':'New '+esc(dept.label)+' card'}</div>
    <div class="prodcard"><div class="punits" style="padding:16px">
      <div class="rfield" style="max-width:320px;margin-bottom:14px"><label>Card name</label><div class="inwrap"><input id="rcaName" value="${esc(RCA_EDIT.name||'')}" placeholder="e.g. ${RCA_EDIT.kind==='sa'?'PACT/Equity 2026':'Equity TV 2026'}" ${RCA_EDIT.name?'disabled':''}></div></div>
      <div class="rca-fields">${RATE_FIELDS.filter(f=>f.dept===RCA_EDIT.kind).map(f=>rcaFieldHTML(f,editingVals[f.id]!=null?editingVals[f.id]:RC_DEFAULTS[f.id])).join('')}</div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="tb-btn" id="rcaSave" style="border-color:var(--hv-line);color:var(--hv)">Save card</button>
        <button class="tb-btn" id="rcaCancel">Cancel</button>
      </div>
    </div></div>`;
  }
  $('#rcaBody').innerHTML=deptsForMode().map((d,i)=>deptList(d,i)).join('')+form;
  if(RCA_EDIT){const f=$('#rcaBody .prodcard');if(f)f.scrollIntoView({block:'nearest'})}
}
$('#rcaBody').addEventListener('click',e=>{
  const nw=e.target.closest('[data-rcanew]');
  if(nw){RCA_EDIT={kind:nw.dataset.rcanew,name:''};renderRateAdmin();return}
  if(e.target.closest('#rcaCancel')){RCA_EDIT=null;renderRateAdmin();return}
  const vw=e.target.closest('[data-rcaview]');
  if(vw){RCA_EDIT={kind:vw.dataset.rcakind,name:vw.dataset.rcaview,view:true};renderRateAdmin();return}
  const del=e.target.closest('[data-rcadel]');
  if(del){
    e.stopPropagation();
    const n=del.dataset.rcadel,kind=del.dataset.rcakind;
    if(!window.confirm('Delete rate card “'+n+'”? Productions using it keep their last-saved numbers, but stop tracking future changes.'))return;
    delete RATECARDS[kind][n];saveRateCardsLocal();
    if(CLOUD.session)cloud.deleteRateCard(kind,n).catch(()=>{});
    if(RCA_EDIT&&RCA_EDIT.kind===kind&&RCA_EDIT.name===n)RCA_EDIT=null;
    renderRateAdmin();
    return;
  }
  if(e.target.closest('#rcaSave')){
    const kind=RCA_EDIT.kind,isNew=!RCA_EDIT.name;
    const name=isNew?(($('#rcaName').value||'').trim()):RCA_EDIT.name;
    if(!name){setStatus('Give the rate card a name.');return}
    if(isNew&&cardsFor(kind)[name]){setStatus('A rate card called “'+name+'” already exists.');return}
    const vals={};
    $('#rcaBody').querySelectorAll('[data-rcaf]').forEach(el=>{vals[el.dataset.rcaf]=el.value});
    RATECARDS[kind][name]=vals;
    saveRateCardsLocal();
    if(CLOUD.session)cloud.upsertRateCard(kind,name,vals).catch(()=>{});
    // every production pointing at this card in this department picks up the
    // new numbers (a legacy pre-split single card counts as both departments)
    let touchedActive=false;
    for(const [pname,p] of Object.entries(PRODS)){
      const cur=prodCardFor(p,kind);
      if(!cur||cur.name!==name)continue;
      p.rateCards=p.rateCards||{};
      p.rateCards[kind]={name,vals};
      if(CLOUD.session)cloud.upsertProd(pname,p).catch(()=>{});
      const active=SOURCES[ACTIVE];
      if(active&&(active.prod||active.title)===pname)touchedActive=true;
    }
    saveProds();
    RCA_EDIT=null;
    renderRateAdmin();
    if(touchedActive){const active=SOURCES[ACTIVE];applyRateVals(resolveRateVals(active.prod||active.title));}
    setStatus('Rate card “'+name+'” saved.');
    return;
  }
  const op=e.target.closest('[data-rcaopen]');
  if(op){RCA_EDIT={kind:op.dataset.rcakind,name:op.dataset.rcaopen};renderRateAdmin();}
});

// debug handle for inspecting closure state from the console
// ---------- schedule switcher: the top-bar pill lists every schedule in the
// active production (all units, all revisions) for one-click swapping ----------
function closePillMenu(){const m=document.getElementById('pillMenu');if(m)m.remove()}
$('#colourPill').addEventListener('click',e=>{
  e.stopPropagation();
  if(document.getElementById('pillMenu')){closePillMenu();return}
  const cur=SOURCES[ACTIVE];
  if(!cur||!cur.kind)return; // the demo has no production to switch within
  const prod=cur.prod||cur.title;
  const units=unitsOf(prod);
  if(!units.size)return;
  const m=document.createElement('div');m.id='pillMenu';m.className='pillmenu';
  let html=`<div class="pm-head">${esc(prod)}</div>`;
  for(const [uk,revs] of units){
    const curRev=currentRev(revs);
    for(const r of revs){
      html+=`<div class="pm-row ${r.i===ACTIVE?'on':''}" data-pmsrc="${r.i}">
        <span class="pm-unit">${esc(unitName(r.s.unit))}</span>
        <b>${esc(revLabel(r.s))}</b>
        <span class="pm-days">${r.s.model.days.length}d</span>
        ${r.i===curRev.i?'<span class="pm-cur">CURRENT</span>':''}</div>`;
    }
  }
  m.innerHTML=html;
  document.body.appendChild(m);
  const rct=e.currentTarget.getBoundingClientRect();
  m.style.top=(rct.bottom+8)+'px';
  m.style.left=Math.max(8,Math.min(rct.left,window.innerWidth-m.offsetWidth-8))+'px';
});
document.addEventListener('click',e=>{
  const m=document.getElementById('pillMenu');if(!m)return;
  const row=e.target.closest('[data-pmsrc]');
  if(row)setActive(+row.dataset.pmsrc);
  if(row||!e.target.closest('#pillMenu'))closePillMenu();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePillMenu()});

// ---------- universal right-click context menu ----------
// One small floating menu, reused for scene rows, day rows, and sidebar /
// dashboard production headers. items: {label,onClick,danger?} or {sep:true}.
function closeCtxMenu(){
  const m=document.getElementById('ctxMenu');if(m)m.remove();
  document.removeEventListener('click',closeCtxMenu,true);
}
function openCtxMenu(x,y,items){
  closeCtxMenu();
  const m=document.createElement('div');m.id='ctxMenu';m.className='ctxmenu';
  m.innerHTML=items.map((it,i)=>it.sep?'<div class="ctxsep"></div>':`<button class="ctxitem${it.danger?' danger':''}" data-i="${i}">${it.icon?icon(it.icon)+' ':''}${esc(it.label)}</button>`).join('');
  document.body.appendChild(m);
  const w=m.offsetWidth,h=m.offsetHeight;
  m.style.left=Math.max(6,Math.min(x,window.innerWidth-w-6))+'px';
  m.style.top=Math.max(6,Math.min(y,window.innerHeight-h-6))+'px';
  m.addEventListener('click',e=>{
    const b=e.target.closest('.ctxitem');if(!b)return;
    const it=items[+b.dataset.i];closeCtxMenu();
    if(it&&it.onClick)it.onClick();
  });
  setTimeout(()=>document.addEventListener('click',closeCtxMenu,true),0);
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCtxMenu()});

// ---------- crowd group: ⋯ menu + drag between scenes ----------
// The ⋯ handle opens the Move / Copy / Delete menu. It's captured (not bubbled)
// so it fires BEFORE the crowd cell's own click-to-edit handler and can swallow
// the event — a plain click anywhere else on the chip still opens the editor.
document.addEventListener('click',e=>{
  const mb=e.target.closest('[data-crmenu]');
  if(!mb)return;
  e.preventDefault();e.stopPropagation();
  const ctx=crowdGroupFromEl(mb);
  if(!ctx)return;
  const r=mb.getBoundingClientRect();
  openCrowdGroupMenu(r.left,r.bottom+4,ctx);
},true);
// Desktop drag = move a group into another scene's crowd cell (same day).
let DRAG_CROWD=null;
function clearDropHints(){document.querySelectorAll('.reqcell.drop-ok').forEach(x=>x.classList.remove('drop-ok'));}
function dropCellFor(e){
  if(!DRAG_CROWD)return null;
  const cell=e.target.closest('[data-reqmode="crowd"]');
  if(!cell)return null;
  const strip=cell.closest('.strip[data-dayid]');
  if(!strip||strip.dataset.dayid!==DRAG_CROWD.d.id)return null; // same day only
  const idx=+strip.dataset.sceneidx;
  if(idx===DRAG_CROWD.idx)return null;                          // not the source scene
  return {cell,idx};
}
// floating cursor hint shown while dragging a crowd chip: move / remove
let CR_HINT=null;
function showCrDragHint(e){
  if(!CR_HINT){CR_HINT=document.createElement('div');CR_HINT.id='crDragHint';document.body.appendChild(CR_HINT);}
  updateCrDragHint(e,'idle');
}
function updateCrDragHint(e,mode,idx){
  if(!CR_HINT||!DRAG_CROWD)return;
  const g=DRAG_CROWD.g;
  let txt='Drag to another scene to move · drop outside to remove',cls='';
  if(mode==='remove'){txt='Release to remove '+crowdGroupLabel(g);cls='remove';}
  else if(mode==='move'){const s=DRAG_CROWD.d.scenes[idx];txt='Move '+crowdGroupLabel(g)+' → scene '+((s&&s.num)||(idx+1));cls='move';}
  CR_HINT.className=cls;
  CR_HINT.textContent=txt;
  if(e&&e.clientX){CR_HINT.style.left=(e.clientX+14)+'px';CR_HINT.style.top=(e.clientY+16)+'px';}
}
function hideCrDragHint(){if(CR_HINT){CR_HINT.remove();CR_HINT=null;}}
document.addEventListener('dragstart',e=>{
  const chip=e.target.closest('.crgrp');
  if(!chip)return;
  const ctx=crowdGroupFromEl(chip);
  if(!ctx){return;}
  DRAG_CROWD=ctx;
  try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',crowdGroupLabel(ctx.g));}catch(_){}
  chip.classList.add('crdragging');
  showCrDragHint(e);
});
document.addEventListener('dragend',()=>{
  DRAG_CROWD=null;
  document.querySelectorAll('.crgrp.crdragging').forEach(x=>x.classList.remove('crdragging'));
  clearDropHints();hideCrDragHint();
});
// While a crowd chip is in flight we allow a drop ANYWHERE (preventDefault),
// so we can tell "dropped on another scene" (move) from "dropped on its own
// cell" (no-op) from "dropped outside every crowd cell" (remove).
document.addEventListener('dragover',e=>{
  if(!DRAG_CROWD)return;
  e.preventDefault();
  const t=dropCellFor(e);
  const overCell=e.target.closest('[data-reqmode="crowd"]');
  if(t){
    try{e.dataTransfer.dropEffect='move';}catch(_){}
    if(!t.cell.classList.contains('drop-ok')){clearDropHints();t.cell.classList.add('drop-ok');}
    updateCrDragHint(e,'move',t.idx);
  }else if(overCell){                 // its own source cell → nothing happens
    clearDropHints();updateCrDragHint(e,'idle');
  }else{                              // outside every crowd cell → remove
    try{e.dataTransfer.dropEffect='move';}catch(_){}
    clearDropHints();updateCrDragHint(e,'remove');
  }
});
document.addEventListener('dragleave',e=>{
  const cell=e.target.closest('[data-reqmode="crowd"]');
  if(cell&&!cell.contains(e.relatedTarget))cell.classList.remove('drop-ok');
});
document.addEventListener('drop',e=>{
  if(!DRAG_CROWD)return;
  e.preventDefault();
  const t=dropCellFor(e);
  const overCell=e.target.closest('[data-reqmode="crowd"]');
  const ctx=DRAG_CROWD;DRAG_CROWD=null;clearDropHints();hideCrDragHint();
  if(t){
    const label='scene '+(ctx.d.scenes[t.idx].num||(t.idx+1));
    if(moveCrowdGroup(ctx.d,ctx.idx,ctx.g,t.idx))setStatus(crowdGroupLabel(ctx.g)+' moved to '+label+'.',{undo:crowdUndo});
    return;
  }
  if(overCell)return;                 // dropped back on its own cell → keep as is
  if(deleteCrowdGroup(ctx.d,ctx.idx,ctx.g))setStatus(crowdGroupLabel(ctx.g)+' removed.',{undo:crowdUndo});
});
document.addEventListener('contextmenu',e=>{
  // right-click a crowd chip → its own Move / Copy / Delete menu (takes
  // priority over the scene row's Edit/Delete menu below)
  const chipEl=e.target.closest('.crgrp');
  if(chipEl){
    const ctx=crowdGroupFromEl(chipEl);
    if(ctx){e.preventDefault();openCrowdGroupMenu(e.clientX,e.clientY,ctx);return;}
  }
  const stripEl=e.target.closest('.strip[data-dayid]');
  const dayEl=e.target.closest('.daycard[id^="day-"]');
  const prodEl=e.target.closest('[data-prodtoggle],[data-openprod]');
  if(stripEl){
    e.preventDefault();
    const dayId=stripEl.dataset.dayid,idx=+stripEl.dataset.sceneidx;
    const d=(MODEL.days||[]).find(x=>x.id===dayId);if(!d||!d.scenes[idx])return;
    openCtxMenu(e.clientX,e.clientY,[
      {label:'Edit scene',icon:'pencil',onClick:()=>openSceneModal(dayId,idx)},
      {sep:true},
      {label:'Delete scene',icon:'trash',danger:true,onClick:()=>{
        const s=d.scenes[idx];
        if(!window.confirm('Delete scene '+(s.num||'')+'? Its crowd/stunt requirements go with it.'))return;
        deleteSceneAt(dayId,idx);
      }}
    ]);
    return;
  }
  if(dayEl){
    e.preventDefault();
    const dayId=dayEl.id.slice(4);
    const d=(MODEL.days||[]).find(x=>x.id===dayId);if(!d)return;
    const items=[{label:'＋ Add scene',onClick:()=>openSceneModal(dayId,null)}];
    if(d.manual)items.push({sep:true},{label:'Delete day',icon:'trash',danger:true,onClick:()=>deleteManualDayById(dayId)});
    openCtxMenu(e.clientX,e.clientY,items);
    return;
  }
  if(prodEl){
    e.preventDefault();
    const name=prodEl.dataset.prodtoggle||prodEl.dataset.openprod;
    if(!name)return;
    const hasCover=!!(PRODS[name]&&PRODS[name].info&&PRODS[name].info.cover);
    openCtxMenu(e.clientX,e.clientY,[
      {label:'Production settings',icon:'gear',onClick:()=>openProdSettings(name)},
      {label:'Rename',icon:'pencil',onClick:()=>{openProdSettings(name);const i=$('#psName');if(i){i.focus();i.select();}}},
      {label:'Set cover photo',icon:'image',onClick:()=>pickCoverPhoto(name)},
      ...(hasCover?[{label:'✕ Remove cover photo',onClick:()=>setCoverPhoto(name,null)}]:[]),
      {sep:true},
      {label:'Remove production',icon:'trash',danger:true,onClick:()=>{
        if(!window.confirm('Delete “'+name+'” and all its schedules? This cannot be undone.'))return;
        deleteProduction(name);
      }}
    ]);
  }
});
// ---------- cover & profile photos ----------
// A photo file → small JPEG data-URL. Covers ride in P.info (already synced
// via the prods table's info jsonb); avatars in Supabase user_metadata.
async function photoToDataURL(file,maxSide,q){
  let bmp;
  try{bmp=await createImageBitmap(file)}
  catch(e){throw new Error(file.name+' isn’t a format this browser can read — use a JPG or PNG.')}
  const scale=Math.min(1,maxSide/Math.max(bmp.width,bmp.height));
  const w=Math.round(bmp.width*scale),h=Math.round(bmp.height*scale);
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  cv.getContext('2d').drawImage(bmp,0,0,w,h);
  bmp.close&&bmp.close();
  return cv.toDataURL('image/jpeg',q);
}
let COVER_TARGET=null;
function pickCoverPhoto(name){COVER_TARGET=name;$('#coverInput').click();}
function setCoverPhoto(name,dataURL){
  ensureProd(name,{});
  const P=PRODS[name];
  P.info={...(P.info||{})};
  if(dataURL)P.info.cover=dataURL;else delete P.info.cover;
  saveProds();
  if(CLOUD.session&&cloud.upsertProd)cloud.upsertProd(name,P).catch(()=>{});
  renderSidebar();
  // editing inside the inline settings tab: update in place so we don't rebuild
  // the page (which would reset the settings scroll/section)
  if(PS_INLINE&&PROD_HOME===name)refreshBrandingUI(name);
  else if(DASH)renderDash();
  setStatus(dataURL?'Cover photo set for '+name+'.':'Cover photo removed.');
}
$('#coverInput').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';
  if(!f||!COVER_TARGET)return;
  try{setCoverPhoto(COVER_TARGET,await photoToDataURL(f,720,0.82))}
  catch(err){setStatus(err.message)}
  COVER_TARGET=null;
});
// separate banner image, shown wide on the production page. Kept independent
// from the card cover so the two can differ; falls back to the cover when unset.
let BANNER_TARGET=null;
function pickBannerPhoto(name){BANNER_TARGET=name;$('#bannerInput').click();}
function setBannerPhoto(name,dataURL){
  ensureProd(name,{});
  const P=PRODS[name];
  P.info={...(P.info||{})};
  if(dataURL)P.info.banner=dataURL;else delete P.info.banner;
  saveProds();
  if(CLOUD.session&&cloud.upsertProd)cloud.upsertProd(name,P).catch(()=>{});
  renderSidebar();
  if(PS_INLINE&&PROD_HOME===name)refreshBrandingUI(name);
  else if(DASH)renderDash();
  setStatus(dataURL?'Banner image set for '+name+'.':'Banner image removed.');
}
$('#bannerInput').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';
  if(!f||!BANNER_TARGET)return;
  try{setBannerPhoto(BANNER_TARGET,await photoToDataURL(f,1600,0.82))}
  catch(err){setStatus(err.message)}
  BANNER_TARGET=null;
});
// brief reference photos: shrunk small (they sit in localStorage with every
// other brief) and capped, so a batch of camera shots can't blow the quota
let BRIEF_PHOTO_TARGET=null;
$('#briefPhotoInput').addEventListener('change',async e=>{
  const files=[...e.target.files];e.target.value='';
  const b=BRIEF_PHOTO_TARGET&&BRIEFS[briefKey(BRIEF_PHOTO_TARGET)];
  BRIEF_PHOTO_TARGET=null;
  if(!files.length||!b)return;
  b.photos=b.photos||[];
  const room=BRIEF_PHOTO_MAX-b.photos.length;
  if(room<=0){setStatus('That brief already has '+BRIEF_PHOTO_MAX+' photos — remove one first.');return}
  let added=0;
  for(const f of files.slice(0,room)){
    try{b.photos.push({name:f.name,url:await photoToDataURL(f,640,0.7)});added++}
    catch(err){setStatus(err.message)}
  }
  if(!added)return;
  b.updatedAt=new Date().toISOString();
  if(!saveBriefs()){
    // out of browser storage — drop the photos back off rather than pretend
    b.photos.splice(b.photos.length-added,added);saveBriefs();renderBriefs();
    setStatus('There’s no room left in this browser’s storage for more photos — remove some from other briefs and try again.');
    return;
  }
  renderBriefs();
  setStatus(added+' photo'+(added===1?'':'s')+' added to “'+b.character+'”.'
    +(files.length>room?' Only '+room+' would fit — the limit is '+BRIEF_PHOTO_MAX+'.':''));
});
$('#avatarInput').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';
  if(!f)return;
  try{
    const url=await photoToDataURL(f,160,0.85);
    const {error}=await cloud.updateAvatar(url);
    if(error){setStatus('Couldn’t save the photo: '+error.message);return}
    if(CLOUD.session&&CLOUD.session.user)CLOUD.session.user.user_metadata={...CLOUD.session.user.user_metadata,avatar:url};
    updateAccountUI();
    setStatus('Profile photo updated.');
  }catch(err){setStatus(err.message)}
});
document.addEventListener('click',e=>{
  if(e.target.closest('#auAvatarBtn'))$('#avatarInput').click();
  if(e.target.closest('#auAvatarRm')){
    cloud.updateAvatar(null).then(({error})=>{
      if(error){setStatus('Couldn’t remove the photo: '+error.message);return}
      if(CLOUD.session&&CLOUD.session.user)delete CLOUD.session.user.user_metadata.avatar;
      updateAccountUI();
    });
  }
});

// ---------- sortable tables ----------
// Every .tscroll table header is clickable: sorts by that column (numeric-
// aware for £/counts, text otherwise). Expander sub-rows stay attached to
// their parent row; footer/total rows stay pinned to the bottom.
document.addEventListener('click',e=>{
  const th=e.target.closest('.tscroll table thead th');
  if(!th||e.target.closest('a,button,input,select'))return;
  const table=th.closest('table');
  const tb=table.querySelector('tbody');if(!tb)return;
  const idx=[...th.parentNode.children].indexOf(th);
  tb.querySelectorAll('tr.cdexp').forEach(r=>r.remove()); // close inline editors first
  tb.querySelectorAll('tr.openrow').forEach(r=>r.classList.remove('openrow'));
  const groups=[],tail=[];
  for(const r of [...tb.children]){
    if(r.classList.contains('total')||r.classList.contains('grossline')){tail.push(r);continue}
    if((r.classList.contains('sub')||r.classList.contains('wk-exp'))&&groups.length)groups[groups.length-1].push(r);
    else groups.push([r]);
  }
  const dir=th.dataset.sortdir==='asc'?-1:1;
  table.querySelectorAll('th').forEach(h=>{delete h.dataset.sortdir;h.classList.remove('sorted-asc','sorted-desc')});
  th.dataset.sortdir=dir===1?'asc':'desc';
  th.classList.add(dir===1?'sorted-asc':'sorted-desc');
  const val=g=>{
    const c=g[0].children[idx];if(!c)return '';
    const t=c.textContent.trim();
    if(/^[£\s]*-?[\d,.]+\s*[%pd]?$|^D\d+$/i.test(t))return parseFloat(t.replace(/[^0-9.\-]/g,''))||0;
    return t.toLowerCase();
  };
  groups.sort((a,b)=>{
    const A=val(a),B=val(b);
    if(typeof A==='number'&&typeof B==='number')return (A-B)*dir;
    return String(A).localeCompare(String(B))*dir;
  });
  for(const g of groups)for(const r of g)tb.appendChild(r);
  for(const r of tail)tb.appendChild(r);
  // reveal the "Reset order" control once the crowd breakdown has been re-sorted
  if(table.classList.contains('cbtable')){const rb=$('#cbdReset');if(rb)rb.hidden=false}
});
// "Reset order" rebuilds the crowd breakdown in its original schedule order,
// clearing any column sort (sort state lives only on the DOM, so a re-render is
// the clean way back).
document.addEventListener('click',e=>{
  if(e.target.closest('#cbdReset')){renderCbDoc();return}
  // ---- Setup step ----
  // Generate builds the table from the current settings and remembers that this
  // production has done so, so it opens on the breakdown next time.
  if(e.target.closest('#cbdGenerate')||e.target.closest('#cbdGenerate2')){
    CBD.generated=true;cbSetupOpen=false;saveCbd();renderCbDoc();
    const h=$('#viewCbdoc');if(h)h.scrollTop=0;
    return;
  }
  // Settings reopens the setup controls as a popup over the breakdown.
  if(e.target.closest('#cbdSetupBtn')){cbSetupOpen=true;cbSyncSetupModal();return}
  // Done / clicking the backdrop closes the settings popup, leaving the
  // breakdown exactly as it is — no re-generate.
  if(e.target.closest('#cbSetupClose')||e.target.id==='cbSetupModal'){cbSetupOpen=false;cbSyncSetupModal();return}
  // Accent swatch picked from the preset row.
  const sw=e.target.closest('.cbsw');
  if(sw){
    CBD.accent=sw.dataset.cbaccent;saveCbd();renderCbDoc();return;
  }
  if(e.target.closest('#cbdColsReset')){
    CBD.order=CB_SEG_ORDER.slice();CBD.notes=true;CBD.mergeCrowd=false;saveCbd();renderCbDoc();return;
  }
});

// ---- Columns: drag to reorder ----
// The list rows carry data-seg; on drop we splice the dragged segment out and
// reinsert it before/after the row it landed on, then re-render. CBD.order only
// ever holds the six known segments, so the engine's layout stays valid whatever
// the drop order — number+name and fees+cost are single segments, so they can
// never be split by a drag.
let cbDragSeg=null;
function cbNormOrder(){
  const order=(Array.isArray(CBD.order)&&CBD.order.length?CBD.order.slice():CB_SEG_ORDER.slice())
    .filter(s=>CB_SEG_ORDER.includes(s));
  for(const s of CB_SEG_ORDER)if(!order.includes(s))order.push(s);
  return order;
}
document.addEventListener('dragstart',e=>{
  const row=e.target.closest&&e.target.closest('.cbcolrow');
  if(!row){cbDragSeg=null;return}
  cbDragSeg=row.dataset.seg;row.classList.add('cbdragging');
  try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',cbDragSeg);}catch(_){}
});
document.addEventListener('dragend',e=>{
  document.querySelectorAll('.cbcolrow.cbdragging,.cbcolrow.cbdragover').forEach(r=>r.classList.remove('cbdragging','cbdragover'));
  cbDragSeg=null;
});
document.addEventListener('dragover',e=>{
  const list=e.target.closest&&e.target.closest('#cbColList');
  if(!list||!cbDragSeg)return;
  e.preventDefault();try{e.dataTransfer.dropEffect='move'}catch(_){}
  const row=e.target.closest('.cbcolrow');
  list.querySelectorAll('.cbcolrow.cbdragover').forEach(r=>{if(r!==row)r.classList.remove('cbdragover')});
  if(row&&row.dataset.seg!==cbDragSeg)row.classList.add('cbdragover');
});
document.addEventListener('drop',e=>{
  const list=e.target.closest&&e.target.closest('#cbColList');
  if(!list||!cbDragSeg)return;
  e.preventDefault();
  const row=e.target.closest('.cbcolrow');
  const from=cbDragSeg;cbDragSeg=null;
  const order=cbNormOrder();
  const fi=order.indexOf(from);if(fi<0)return;
  order.splice(fi,1);
  let ti=row?order.indexOf(row.dataset.seg):order.length;
  if(ti<0)ti=order.length;
  // dropping on the lower half of a row places the item after it
  if(row){
    const r=row.getBoundingClientRect();
    if(e.clientY> r.top+r.height/2)ti+=1;
  }
  order.splice(ti,0,from);
  CBD.order=order;saveCbd();renderCbDoc();
});

// ---------- production change history ----------
let EVENTS={};
try{EVENTS=JSON.parse(store.get('crowdos-events')||'{}')}catch(e){EVENTS={}}
function logProdEvent(prod,kind,detail){
  if(!prod)return;
  (EVENTS[prod]=EVENTS[prod]||[]).unshift({kind,detail,who:(CLOUD.session&&CLOUD.session.user&&CLOUD.session.user.email)||'you',at:new Date().toISOString()});
  EVENTS[prod]=EVENTS[prod].slice(0,200);
  store.set('crowdos-events',JSON.stringify(EVENTS));
  if(CLOUD.session)cloud.logEvent(prod,kind,detail).catch(()=>{});
}

// ---------- production settings screen ----------
let PS_NAME=null;
function prodSourcesOf(name){return SOURCES.filter(s=>s.kind&&(s.prod||s.title)===name)}
// locations = every distinct day-location across the production's schedules
// (auto rows), plus hand-added rows and saved overrides from PRODS
function collectLocations(name){
  const map=new Map();
  for(const s of prodSourcesOf(name))for(const d of s.model.days){
    const loc=(d.loc||'').trim();if(!loc)continue;
    const k=loc.toLowerCase();
    if(!map.has(k))map.set(k,{name:loc,days:new Set(),manual:false,override:''});
    map.get(k).days.add((d.unit==='2nd'?'U':'M')+d.num);
  }
  const p=PRODS[name]||{};
  for(const l of (p.locations||[])){
    const k=(l.name||'').toLowerCase().trim();if(!k)continue;
    if(!map.has(k))map.set(k,{name:l.name,days:new Set(),manual:true,override:''});
    if(l.override==='A'||l.override==='B')map.get(k).override=l.override;
    if(l.manual)map.get(k).manual=true;
  }
  return [...map.values()];
}
// cast = merged castMap across schedules + saved performer names / custom rows
function collectCast(name){
  const merged={};
  for(const s of prodSourcesOf(name))for(const [code,ch] of Object.entries(s.model.castMap||{}))if(!merged[code])merged[code]={character:ch,performer:'',fromSched:true};
  const p=PRODS[name]||{};
  for(const [code,rec] of Object.entries(p.castList||{})){
    if(!merged[code])merged[code]={character:(rec&&rec.character)||'',performer:'',fromSched:false};
    if(rec&&rec.performer)merged[code].performer=rec.performer;
  }
  return merged;
}
const PS_SECTIONS=[['general','General'],['branding','Branding'],['locations','Locations'],['shootlocs','Shooting locations'],['info','Production info'],['cast','Cast list'],['rates','Rate cards'],['columns','Columns'],['history','History']];
// Every distinct SCENE location the production's schedules name (across all
// units/revisions), with the days it appears on and the real shooting place
// (if set). The real place is the production-wide "@set" mapping; it's read
// from whichever namespace holds it.
function collectSceneLocations(name){
  const map=new Map();
  const srcs=prodSourcesOf(name);
  for(const s of srcs)for(const d of s.model.days){
    const blocks=(d.locBlocks&&d.locBlocks.length)?d.locBlocks:[{loc:dayPrimaryScene(d),from:0}];
    for(const b of blocks){
      const scene=(b.loc||'').trim();if(!scene)continue;
      const k=scene.toLowerCase();
      if(!map.has(k))map.set(k,{name:scene,days:new Set(),real:''});
      map.get(k).days.add((d.unit==='2nd'?'U':'M')+d.num);
    }
  }
  const nss=[...new Set(srcs.map(s=>s.ns||'').filter(Boolean))];
  for(const rec of map.values())for(const ns of nss){
    const v=DAYLOC[(ns?ns+'|':'')+'@set|'+normLoc(rec.name)];
    if(v!=null&&String(v).trim()){rec.real=String(v).trim();break;}
  }
  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
// Write the production-wide real location for a scene location, across every
// namespace the production uses, so the day board and cost tables all follow.
function setSceneRealAllNs(name,sceneLoc,val){
  let nss=[...new Set(prodSourcesOf(name).map(s=>s.ns||'').filter(Boolean))];
  if(!nss.length)nss=[NS||''];
  for(const ns of nss){
    const k=(ns?ns+'|':'')+'@set|'+normLoc(sceneLoc);
    if(val&&val.trim())DAYLOC[k]=val.trim();else delete DAYLOC[k];
  }
  saveDayLoc();
}
function psSceneLocRow(l){
  const differs=l.real&&normLoc(l.real)!==normLoc(l.name);
  const status=differs
    ?'<span class="ps-band b" data-tip="Shot away from the scene’s named place">off-scene</span>'
    :(l.real?'<span class="ps-src sched">on location</span>':'<span style="color:var(--faint)">—</span>');
  return `<tr>
    <td><div style="display:flex;align-items:center;gap:6px"><span class="ps-scene">${esc(l.name)}</span>${l.name?`<a class="loclink" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.real||l.name)}" target="_blank" rel="noopener" data-tip="Open in Google Maps" style="flex:none">↗</a>`:''}</div></td>
    <td><input class="ps-realloc" data-scene="${esc(l.name)}" value="${esc(l.real)}" placeholder="Actually shot at…"></td>
    <td>${status}</td>
    <td style="color:var(--faint);font-size:10.5px">${l.days&&l.days.size?[...l.days].slice(0,6).join(', ')+(l.days.size>6?' +'+(l.days.size-6):''):'—'}</td></tr>`;
}
function psLocRow(l){
  const det=locationBand(l.name);
  return `<tr data-manual="${l.manual?1:0}">
    <td><div style="display:flex;align-items:center;gap:6px"><input class="ps-locname" value="${esc(l.name)}" placeholder="Location name">${l.name?`<a class="loclink" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.name)}" target="_blank" rel="noopener" data-tip="Open in Google Maps" style="flex:none">↗</a>`:''}</div></td>
    <td><span class="ps-src ${l.manual?'':'sched'}">${l.manual?'by hand':'from schedule'}</span></td>
    <td><span class="ps-band ${det.band==='B'?'b':'a'}">CAT ${det.band}</span>${det.known?'':' <span style="color:var(--dayext);font-size:9.5px">check?</span>'}</td>
    <td><select class="ps-locband"><option value=""${l.override?'':' selected'}>auto</option><option${l.override==='A'?' selected':''}>A</option><option${l.override==='B'?' selected':''}>B</option></select></td>
    <td style="color:var(--faint);font-size:10.5px">${l.days&&l.days.size?[...l.days].slice(0,6).join(', ')+(l.days.size>6?' +'+(l.days.size-6):''):'—'}</td>
    <td>${l.manual?'<button class="ps-rm" data-psrm="loc">✕</button>':''}</td></tr>`;
}
// One department's override rows. Card value column reflects whichever card
// is CURRENTLY selected in that department's dropdown (not necessarily saved
// yet) so switching cards previews live.
function psRateRows(p,dept,liveOverrides){
  const sel=document.getElementById('psRate-'+dept);
  const cur=prodCardFor(p,dept);
  const cardName=sel?sel.value:(cur&&cur.name)||'';
  const cardVals=(cardName&&cardsFor(dept)[cardName])||{};
  const overrides=liveOverrides||p.rateOverrides||{};
  let html='';
  for(const f of RATE_FIELDS){
    if(f.dept!==dept)continue;
    const cv=cardVals[f.id]!=null?cardVals[f.id]:RC_DEFAULTS[f.id];
    const ov=overrides[f.id];
    const shown=f.options?((f.options.find(o=>o[0]===cv)||f.options[0])[1]):esc(f.unit)+esc(cv);
    const ovCell=f.options
      ?`<select class="ps-rateov" data-field="${f.id}"><option value="">auto</option>${f.options.map(([val,lab])=>`<option value="${val}"${ov===val?' selected':''}>${lab}</option>`).join('')}</select>`
      :`<div class="inwrap" style="max-width:120px"><span>${esc(f.unit)}</span><input class="ps-rateov" data-field="${f.id}" type="number" step="0.01" placeholder="auto" value="${ov!=null?esc(ov):''}"></div>`;
    html+=`<tr><td>${esc(f.label)}</td><td style="font-family:var(--mono);color:var(--faint)">${shown}</td><td>${ovCell}</td></tr>`;
  }
  return html;
}
function psPersonRow(pr){
  return `<tr>
    <td><input class="ps-role" value="${esc(pr.role||'')}" placeholder="Role — e.g. Crowd PA"></td>
    <td><input class="ps-pname" value="${esc(pr.name||'')}" placeholder="name"></td>
    <td><input class="ps-pemail" value="${esc(pr.email||'')}" placeholder="email"></td>
    <td><span class="ps-src" data-tip="Invites arrive with the roles &amp; permissions build">Invite — soon</span></td>
    <td><button class="ps-rm" data-psrm="person">✕</button></td></tr>`;
}
function psCastRow(code,rec){
  return `<tr data-code="${esc(code)}">
    <td><input class="ps-ccode" value="${esc(code)}" ${rec.fromSched?'readonly':''} style="width:52px"></td>
    <td><input class="ps-cchar" value="${esc(rec.character||'')}" ${rec.fromSched?'readonly':''}></td>
    <td><input class="ps-cperf" value="${esc(rec.performer||'')}" placeholder="performer name"></td>
    <td><span class="ps-src ${rec.fromSched?'sched':''}">${rec.fromSched?'from schedule':'by hand'}</span></td></tr>`;
}
function psHistRow(e){
  const when=e.at?new Date(e.at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
  return `<div class="ps-hrow" data-cat="${esc(e.kind)}"><span class="ps-hcat ${esc(e.kind)}">${esc(e.kind)}</span><span class="ps-htext">${esc(e.detail)}</span><span class="ps-hwho">${esc((e.who||'').split('@')[0])} · ${when}</span></div>`;
}
function openProdSettings(name,inline){
  // opening the modal from anywhere else must first reclaim the sheet if it's
  // currently living inline in a production page
  if(!inline)detachInlineSettings();
  PS_NAME=name;
  const p=ensureProd(name,{});
  const units=unitsOf(name);let revCount=0;for(const r of units.values())revCount+=r.length;
  $('#psCrumbs').innerHTML=`<b>${esc(name)}</b>`;
  $('#psMeta').textContent=units.size+' unit'+(units.size===1?'':'s')+' · '+revCount+' revision'+(revCount===1?'':'s');
  $('#psRail').innerHTML=PS_SECTIONS.map(([id,label],i)=>`<a data-sec="${id}" class="${i?'':'on'}">${label}</a>`).join('');
  const locs=collectLocations(name);
  const scenelocs=collectSceneLocations(name);
  const cast=collectCast(name);
  const people=(p.info&&p.info.people)||[{role:'Line producer'},{role:'Production manager'},{role:'Stunt coordinator'}];
  const cols={cast:true,stunts:true,crowd:true,...(p.columns||{})};
  const owner=(CLOUD.session&&CLOUD.session.user&&CLOUD.session.user.email)||'you';
  const events=EVENTS[name]||[];
  const cover=p.info&&p.info.cover;
  const banner=p.info&&p.info.banner;
  const accent=(p.info&&p.info.accent)||'';
  const tagline=(p.info&&p.info.tagline)||'';
  $('#psContent').innerHTML=`
    <div class="ps-sec" id="ps-sec-general"><h4>General</h4>
      <div class="why">Rename carefully — every schedule in the production follows.</div>
      <div class="ps-grid2">
        <div class="ps-field"><label>Production name</label><input id="psName" value="${esc(name)}"></div>
        <div class="ps-field"><label>Default schedule colour</label><select id="psColour">${Object.keys(THEMES).map(c=>`<option${(p.colour||'white')===c?' selected':''}>${c}</option>`).join('')}</select></div>
      </div>
      <div class="ps-toggle" style="margin-top:12px"><span class="tn">AI schedule reading</span><span class="td">Off = schedules are read only by the built-in parser — no schedule text is ever sent to an external AI service for this production</span><button class="ps-tgl${p.noAI?'':' on'}" id="psAI" aria-label="Toggle AI schedule reading"></button></div></div>
    <div class="ps-sec" id="ps-sec-branding"><h4>Branding</h4>
      <div class="why">Make this production feel like your own — a card cover, a page banner and a brand colour that carry through its card and pages.</div>
      <div class="ps-brand">
        <div class="ps-cover-prev${cover?'':' empty'}" id="psCoverPrev" style="${cover?`background-image:url('${cover}')`:''}">${cover?'':'<span>No cover yet</span>'}</div>
        <div class="ps-brand-side">
          <div class="ps-brand-actions">
            <button class="ps-add" id="psCoverPick" type="button">${cover?'Replace image':'Upload cover image'}</button>
            <button class="ps-add danger" id="psCoverRemove" type="button" style="${cover?'':'display:none'}">Remove</button>
          </div>
          <div class="ps-hint">Card cover — a portrait image works best here. It shows on the production’s card in the gallery.</div>
        </div>
      </div>
      <div class="ps-brand" style="margin-top:16px">
        <div class="ps-cover-prev ps-banner-prev${banner?'':' empty'}" id="psBannerPrev" style="${banner?`background-image:url('${banner}')`:''}">${banner?'':'<span>No banner yet</span>'}</div>
        <div class="ps-brand-side">
          <div class="ps-brand-actions">
            <button class="ps-add" id="psBannerPick" type="button">${banner?'Replace image':'Upload banner image'}</button>
            <button class="ps-add danger" id="psBannerRemove" type="button" style="${banner?'':'display:none'}">Remove</button>
          </div>
          <div class="ps-hint">Page banner — a wide landscape image works best. It shows across the top when you open the production. If left empty, the card cover is used.</div>
        </div>
      </div>
      <div class="ps-grid2" style="margin-top:16px">
        <div class="ps-field"><label>Tagline (optional)</label><input id="psTagline" value="${esc(tagline)}" placeholder="e.g. A Take 3 Production"></div>
        <div class="ps-field"><label>Brand colour</label>
          <div class="ps-accent">
            <button class="ps-tgl${accent?' on':''}" id="psAccentOn" type="button" aria-label="Use a custom brand colour"></button>
            <input type="color" id="psAccent" value="${accent||'#ff6b2c'}">
            <span class="ps-accent-note">On = this colour drives buttons, links and highlights across the production. Off = it follows the default schedule colour.</span>
          </div>
        </div>
      </div></div>
    <div class="ps-sec" id="ps-sec-locations"><h4>Locations</h4>
      <div class="why">Travel band per head per day: Cat A (TfL 1–3) or Cat B (studios &amp; beyond). Auto-detected from schedules — override when the guess is wrong and every day at that location re-costs.</div>
      <table class="ps-tbl"><thead><tr><th>Location</th><th>Source</th><th>Detected</th><th>Override</th><th>Used on</th><th></th></tr></thead>
      <tbody id="psLocBody">${locs.map(psLocRow).join('')}</tbody></table>
      <button class="ps-add" id="psAddLoc">+ Add location</button></div>
    <div class="ps-sec" id="ps-sec-shootlocs"><h4>Shooting locations</h4>
      <div class="why">Every scene location the schedules name, and where each is <b>actually</b> shot. A schedule says the scene is at, say, “Four Seasons Hotel Morocco” — but the unit shoots it in a studio. The scene text stays as written; fill in the real place here and it applies to every day at that location. Leave blank when the scene really is shot on location.</div>
      <table class="ps-tbl"><thead><tr><th>Scene location (from schedule)</th><th>Actually shot at</th><th>Reality</th><th>Used on</th></tr></thead>
      <tbody id="psSceneLocBody">${scenelocs.length?scenelocs.map(psSceneLocRow).join(''):'<tr><td colspan="4" style="color:var(--faint);font-size:12px;font-style:italic">No scene locations found yet — import a schedule first.</td></tr>'}</tbody></table></div>
    <div class="ps-sec" id="ps-sec-info"><h4>Production info</h4>
      <div class="why">Who's who. Invites (platform access per person, role-shaped views) arrive with the roles build — emails saved now are ready for it.</div>
      <div class="ps-grid2" style="margin-bottom:10px"><div class="ps-field"><label>Production company</label><input id="psCompany" value="${esc((p.info&&p.info.company)||'')}"></div></div>
      <table class="ps-tbl"><thead><tr><th>Role</th><th>Name</th><th>Email</th><th>Access</th><th></th></tr></thead>
      <tbody id="psPeopleBody"><tr><td style="color:var(--sub)">Owner</td><td colspan="2" style="color:var(--sub)">${esc(owner)}</td><td><span class="ps-src sched">You · owner</span></td><td></td></tr>${people.map(psPersonRow).join('')}</tbody></table>
      <button class="ps-add" id="psAddPerson">+ Add person</button></div>
    <div class="ps-sec" id="ps-sec-cast"><h4>Cast list</h4>
      <div class="why">Codes and characters come from imported schedules; add performers here. Rows added by hand can define new codes.</div>
      <table class="ps-tbl"><thead><tr><th>Code</th><th>Character</th><th>Performer</th><th>Source</th></tr></thead>
      <tbody id="psCastBody">${Object.entries(cast).sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})).map(([c,r])=>psCastRow(c,r)).join('')}</tbody></table>
      <button class="ps-add" id="psAddCast">+ Add cast member</button></div>
    <div class="ps-sec" id="ps-sec-rates"><h4>Rate cards</h4>
      <div class="why">One card per talent type — pick this production's baseline for each, then override any individual number just for this production (same pattern as the Locations travel bands). Cards are managed from Account → Manage rate cards. Cat A/B travel applies to crowd only; stunt travel is a mode (mileage / train fare / nothing) with the miles or fare entered on each stunt day.</div>
      <div class="ps-grid2" style="margin:0 0 14px">
        <div class="ps-field"><label>Budget assumption — day type</label>
          <select id="psBaseFw"><option value=""${!(p.info&&p.info.baseDay)?' selected':''}>Flat day rate (no assumed hours)</option><option value="std"${p.info&&p.info.baseDay&&p.info.baseDay.fw==='std'?' selected':''}>Standard Day (9h · SPACT 10h)</option><option value="cwd"${p.info&&p.info.baseDay&&p.info.baseDay.fw==='cwd'?' selected':''}>Continuous Working Day (7h · SPACT 8h)</option></select></div>
        <div class="ps-field"><label>Assumed overtime (hours/day)</label>
          <input id="psBaseOt" type="number" min="0" max="8" step="0.5" value="${p.info&&p.info.baseDay?(+p.info.baseDay.otHours||0):0}"></div>
      </div>
      <div class="why" style="margin-top:-4px">Applies to every day you HAVEN'T opened in the day calculator — e.g. “assume everyone's on CWD doing 2 hours over” prices the whole schedule that way. Days you've edited keep their own hours. Travel bands still come from each day's location.</div>
      ${deptsForMode().map((d,i)=>{
        const cur=prodCardFor(p,d.kind);
        return `<div class="ps-grid2" style="margin:${i===0?'0':'18px'} 0 10px">
          <div class="ps-field"><label>${esc(d.label)} rate card</label><select id="psRate-${d.kind}" data-psratekind="${d.kind}"><option value="">${esc(d.defaults)}</option>${Object.keys(cardsFor(d.kind)).map(n=>`<option${(cur&&cur.name===n)?' selected':''}>${esc(n)}</option>`).join('')}</select></div>
        </div>
        <table class="ps-tbl"><thead><tr><th>Field</th><th>Card value</th><th>Override for this production</th></tr></thead>
        <tbody id="psRateBody-${d.kind}" data-psratebody="${d.kind}">${psRateRows(p,d.kind)}</tbody></table>`;
      }).join('')}</div>
    <div class="ps-sec" id="ps-sec-columns"><h4>Columns</h4>
      <div class="why">Which columns this production's day board shows. No stunt work? Hide Stunts here — this production only.</div>
      <div class="ps-toggle"><span class="tn">Cast</span><span class="td">Cast code chips per scene</span><button class="ps-tgl${cols.cast?' on':''}" data-pscol="cast" aria-label="Toggle Cast column"></button></div>
      <div class="ps-toggle"><span class="tn">Stunts</span><span class="td">Stunt performers, coordinators, doubles</span><button class="ps-tgl${cols.stunts?' on':''}" data-pscol="stunts" aria-label="Toggle Stunts column"></button></div>
      <div class="ps-toggle"><span class="tn">Crowd</span><span class="td">SA / SPACT / Featured chips</span><button class="ps-tgl${cols.crowd?' on':''}" data-pscol="crowd" aria-label="Toggle Crowd column"></button></div>
      <div style="font-family:var(--mono);font-size:10.5px;color:var(--faint);margin-top:8px">Custom columns (Vehicles, Animals, Minors…) are on the roadmap.</div></div>
    <div class="ps-sec" id="ps-sec-history"><h4>History</h4>
      <div class="why">What changed, when, by whom — publishes, merges, settings, glossary answers.</div>
      <div style="margin-bottom:8px"><button class="ps-hf on" data-pshf="all">All</button><button class="ps-hf" data-pshf="schedule">Schedules</button><button class="ps-hf" data-pshf="settings">Settings</button><button class="ps-hf" data-pshf="people">People</button></div>
      <div id="psHistList">${events.length?events.map(psHistRow).join(''):'<div style="color:var(--faint);font-size:12px;font-style:italic">Nothing recorded yet — history starts now.</div>'}</div></div>`;
  if(!inline)$('#prodSettings').classList.add('open');
}
// rail scrolls to sections
$('#psRail').addEventListener('click',e=>{
  const a=e.target.closest('[data-sec]');if(!a)return;
  $('#psRail').querySelectorAll('a').forEach(x=>x.classList.remove('on'));a.classList.add('on');
  const sec=document.getElementById('ps-sec-'+a.dataset.sec);if(sec)sec.scrollIntoView({block:'start'});
});
$('#psContent').addEventListener('click',e=>{
  const t=e.target;
  if(t.id==='psAddLoc'){$('#psLocBody').insertAdjacentHTML('beforeend',psLocRow({name:'',manual:true,override:'',days:new Set()}));const i=$('#psLocBody').lastElementChild.querySelector('input');if(i)i.focus();return}
  if(t.id==='psAddPerson'){$('#psPeopleBody').insertAdjacentHTML('beforeend',psPersonRow({}));const i=$('#psPeopleBody').lastElementChild.querySelector('input');if(i)i.focus();return}
  if(t.id==='psAddCast'){$('#psCastBody').insertAdjacentHTML('beforeend',psCastRow('',{character:'',performer:'',fromSched:false}));const i=$('#psCastBody').lastElementChild.querySelector('input');if(i)i.focus();return}
  if(t.dataset&&t.dataset.psrm){t.closest('tr').remove();return}
  if(t.id==='psCoverPick'){pickCoverPhoto(PS_NAME);return}
  if(t.id==='psCoverRemove'){setCoverPhoto(PS_NAME,null);return}
  if(t.id==='psBannerPick'){pickBannerPhoto(PS_NAME);return}
  if(t.id==='psBannerRemove'){setBannerPhoto(PS_NAME,null);return}
  if(t.id==='psAccentOn'){t.classList.toggle('on');previewAccent();return}
  if(t.classList.contains('ps-tgl')){t.classList.toggle('on');return}
  const hf=t.closest('.ps-hf');
  if(hf){
    $('#psContent').querySelectorAll('.ps-hf').forEach(x=>x.classList.remove('on'));hf.classList.add('on');
    const want=hf.dataset.pshf;
    $('#psHistList').querySelectorAll('.ps-hrow').forEach(r=>{r.style.display=(want==='all'||r.dataset.cat===want)?'':'none'});
  }
});
// switching a department's rate card previews its numbers in the "Card
// value" column right away, without wiping any override the user's typed
$('#psContent').addEventListener('change',e=>{
  // brand colour: preview live (the colour picker or the schedule-colour
  // fallback both feed the same highlight)
  if(e.target.id==='psAccent'||e.target.id==='psColour'){previewAccent();if(e.target.id!=='psColour')return;}
  // scene → actual shooting location (applies to every day at that scene loc)
  if(e.target.classList&&e.target.classList.contains('ps-realloc')){
    const scene=e.target.dataset.scene||'';
    setSceneRealAllNs(PS_NAME,scene,e.target.value);
    const body=document.getElementById('psSceneLocBody');
    if(body)body.innerHTML=collectSceneLocations(PS_NAME).map(psSceneLocRow).join('');
    if(typeof refreshAll==='function')refreshAll();
    return;
  }
  const kind=e.target.dataset&&e.target.dataset.psratekind;
  if(!kind)return;
  const body=document.getElementById('psRateBody-'+kind);
  const liveOverrides={};
  body.querySelectorAll('.ps-rateov').forEach(el=>{if(el.value!=='')liveOverrides[el.dataset.field]=el.value;});
  body.innerHTML=psRateRows(PRODS[PS_NAME]||{},kind,liveOverrides);
});
$('#psSave').addEventListener('click',()=>{
  const oldName=PS_NAME;if(!oldName)return;
  const newName=($('#psName').value||'').trim()||oldName;
  if(newName!==oldName&&PRODS[newName]){setStatus('A production called “'+newName+'” already exists.');return}
  const changed=[];
  if(newName!==oldName){
    PRODS[newName]=PRODS[oldName];delete PRODS[oldName];
    for(const s of SOURCES)if(s.prod===oldName)s.prod=newName;
    if(EVENTS[oldName]){EVENTS[newName]=EVENTS[oldName];delete EVENTS[oldName];store.set('crowdos-events',JSON.stringify(EVENTS));}
    if(CLOUD.session){cloud.deleteProd(oldName).catch(()=>{});for(const s of SOURCES)if(s.prod===newName&&s.cloudId)cloud.updateProduction(s.cloudId,s).catch(()=>{});}
    if(PROD_HOME===oldName)PROD_HOME=newName; // keep the open production page pointed at it
    changed.push('renamed “'+oldName+'” → “'+newName+'”');
  }
  const P=PRODS[newName];
  const colour=$('#psColour').value||'white';
  if(colour!==(P.colour||'white')){P.colour=colour;changed.push('colour → '+colour);}
  // locations: keep rows that carry an override or were added by hand
  const locs=[];
  $('#psLocBody').querySelectorAll('tr').forEach(tr=>{
    const nm=(tr.querySelector('.ps-locname').value||'').trim();
    const ov=tr.querySelector('.ps-locband').value;
    const manual=tr.dataset.manual==='1';
    if(nm&&(ov||manual))locs.push({name:nm,override:ov||null,manual});
  });
  const hadOv=(P.locations||[]).filter(l=>l.override).length,hasOv=locs.filter(l=>l.override).length;
  if(JSON.stringify(locs)!==JSON.stringify(P.locations||[])){P.locations=locs;changed.push('locations ('+hasOv+' band override'+(hasOv===1?'':'s')+(hasOv!==hadOv?', was '+hadOv:'')+')');}
  // info
  const people=[];
  $('#psPeopleBody').querySelectorAll('tr').forEach(tr=>{
    const role=tr.querySelector('.ps-role');if(!role)return; // owner row
    const rec={role:(role.value||'').trim(),name:(tr.querySelector('.ps-pname').value||'').trim(),email:(tr.querySelector('.ps-pemail').value||'').trim()};
    if(rec.role||rec.name||rec.email)people.push(rec);
  });
  const accentOn=$('#psAccentOn')&&$('#psAccentOn').classList.contains('on');
  const accent=accentOn&&$('#psAccent')?$('#psAccent').value:'';
  const tagline=($('#psTagline')&&$('#psTagline').value||'').trim();
  const info={company:($('#psCompany').value||'').trim(),people,
    ...(P.info&&P.info.cover?{cover:P.info.cover}:{}),
    ...(P.info&&P.info.banner?{banner:P.info.banner}:{}),
    ...(accent?{accent}:{}),
    ...(tagline?{tagline}:{})};
  // budget assumption for unedited days ("assume CWD + 2h over")
  const bdFw=$('#psBaseFw')&&$('#psBaseFw').value;
  const bdOt=$('#psBaseOt')?Math.max(0,+$('#psBaseOt').value||0):0;
  if(bdFw)info.baseDay={fw:bdFw,otHours:bdOt};
  if(JSON.stringify(info)!==JSON.stringify(P.info||{}))
    {P.info=info;changed.push(info.baseDay&&!(P.info&&P.info.baseDay&&P.info.baseDay.fw===info.baseDay.fw&&P.info.baseDay.otHours===info.baseDay.otHours)?'budget assumption ('+(bdFw==='cwd'?'CWD':'Standard Day')+(bdOt?' + '+bdOt+'h OT':'')+')':'production info');}
  // cast: store performers + hand-added rows
  const castList={};
  $('#psCastBody').querySelectorAll('tr').forEach(tr=>{
    const code=(tr.querySelector('.ps-ccode').value||'').trim();if(!code)return;
    const perf=(tr.querySelector('.ps-cperf').value||'').trim();
    const fromSched=!!tr.querySelector('.ps-ccode[readonly]');
    if(perf||!fromSched)castList[code]={character:(tr.querySelector('.ps-cchar').value||'').trim(),performer:perf};
  });
  if(JSON.stringify(castList)!==JSON.stringify(P.castList||{})){P.castList=castList;changed.push('cast list');}
  // per-department rate cards + per-field overrides. Only the department
  // shown in the CURRENT mode (Stunts in StuntOS, SA/Crowd in CrowdOS) has a
  // picker in the DOM — the hidden department's card and overrides carry
  // through untouched.
  const newCards={};
  for(const d of RATE_DEPTS){const b=prodCardFor(P,d.kind);if(b)newCards[d.kind]=b;}
  let cardChanged=false;
  const visibleDepts=new Set();
  for(const d of RATE_DEPTS){
    const sel=document.getElementById('psRate-'+d.kind);
    if(!sel)continue; // hidden in this mode
    visibleDepts.add(d.kind);
    const rcName=sel.value||'';
    const cards=cardsFor(d.kind);
    const rc=rcName&&cards[rcName]?{name:rcName,vals:cards[rcName]}:null;
    const before=prodCardFor(P,d.kind);
    if((rc&&rc.name)!==(before&&before.name)){changed.push(d.label+' rate card → '+(rcName||d.defaults));cardChanged=true;}
    if(rc)newCards[d.kind]=rc;else delete newCards[d.kind];
  }
  if(cardChanged||P.rateCard){
    P.rateCards=Object.keys(newCards).length?newCards:undefined;
    P.rateCard=undefined; // retire the pre-department-split single card
  }
  // overrides: keep the hidden department's saved values, re-read the visible one's
  const overrides={};
  for(const [k,v] of Object.entries(P.rateOverrides||{})){
    const f=RATE_FIELDS.find(x=>x.id===k);
    if(f&&!visibleDepts.has(f.dept))overrides[k]=v;
  }
  $('#psContent').querySelectorAll('.ps-rateov').forEach(el=>{if(el.value!=='')overrides[el.dataset.field]=el.value;});
  const ovCount=Object.keys(overrides).length;
  if(JSON.stringify(overrides)!==JSON.stringify(P.rateOverrides||{})){
    P.rateOverrides=ovCount?overrides:undefined;
    changed.push(ovCount?ovCount+' rate override'+(ovCount===1?'':'s'):'rate overrides cleared');
  }
  // AI reading (noAI true = never send schedule text to the AI reader)
  const aiTgl=$('#psAI');
  if(aiTgl){
    const noAI=!aiTgl.classList.contains('on');
    if(noAI!==!!P.noAI){P.noAI=noAI;changed.push('AI schedule reading → '+(noAI?'OFF (no content leaves the app)':'on'));}
  }
  // columns (only the toggles that carry a column name — #psAI is not one)
  const cols={};
  $('#psContent').querySelectorAll('.ps-tgl[data-pscol]').forEach(t=>{cols[t.dataset.pscol]=t.classList.contains('on')});
  if(JSON.stringify(cols)!==JSON.stringify(P.columns||{cast:true,stunts:true,crowd:true})){P.columns=cols;changed.push('columns ('+Object.entries(cols).filter(([,v])=>!v).map(([k])=>k+' hidden').join(', ')+')' );}
  saveProds();saveUserSources();
  if(CLOUD.session&&cloud.upsertProd)cloud.upsertProd(newName,P).catch(()=>{});
  if(changed.length)logProdEvent(newName,'settings','Settings updated — '+changed.join(' · '));
  PS_NAME=newName;
  // re-render everything that reads from here (bands, columns, colours)
  if(SHOWING_EMPTY_PROD)showEmptyProd(SHOWING_EMPTY_PROD);else if(!DASH&&SOURCES[ACTIVE])setActive(ACTIVE);else{renderSidebar();if(DASH)renderDash();}
  $('#prodSettings').classList.remove('open');
  setStatus(changed.length?'Production settings saved — '+changed.join(' · '):'No changes to save.');
});
$('#psDelete').addEventListener('click',()=>{
  const name=PS_NAME;if(!name)return;
  if(!window.confirm('Delete “'+name+'” and all its schedules? This cannot be undone.'))return;
  deleteProduction(name);
  $('#prodSettings').classList.remove('open');
});
$('#psClose').addEventListener('click',()=>{
  if(PS_INLINE){PROD_TAB='schedules';renderDash();return}
  $('#prodSettings').classList.remove('open');
});
$('#prodSettings').addEventListener('click',e=>{if(e.target.id==='prodSettings')$('#prodSettings').classList.remove('open')});

window.__crowdos={get SOURCES(){return SOURCES},get CDAY(){return CDAY},get ADJ(){return ADJ},get MODEL(){return MODEL},get CLOUD(){return CLOUD},get PENDING(){return PENDING_IMPORT},get GLOSSARY(){return GLOSSARY},get PRODS(){return PRODS},get EVENTS(){return EVENTS},mergeDetail,prepModel};

// ---------- boot ----------
{
  // restore user-added productions (uploaded PDF text and blank/manual ones)
  let saved=[];try{saved=JSON.parse(store.get('crowdos-sources')||'[]')}catch(e){saved=[]}
  for(const rec of saved){
    try{
      if(rec.kind==='pdf'&&(rec.text||rec.aiModel)){
        const m=modelFrom(rec,rec.unit||'Main');
        addSource(m,rec.title,rec.short,false,{kind:'pdf',text:rec.text,unit:rec.unit||'Main',ns:rec.ns||('p:'+rec.title),cloudId:rec.cloudId||null,pdfFiles:rec.pdfFiles||null,prod:rec.prod,version:rec.version,schedDate:rec.schedDate,colour:rec.colour||undefined,format:rec.format,rateCard:rec.rateCard,current:rec.current,createdAt:rec.createdAt||undefined,aiModel:rec.aiModel||null,docKind:rec.docKind||null});
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
  if(SOURCES.length)setActive(SOURCES.length-1);
  setAppMode(store.get('stuntos-appmode')||'stunt');
  // An empty account landing on the demo board looks like someone else's
  // production and hides the one thing they need to do. Send them to the
  // dashboard, where the empty state asks for their first schedule.
  if(!SOURCES.some(s=>s.kind))showDash();
  maybeWelcomeTour();
  // sign-out kept some data on this device because its cloud copy was never
  // confirmed — say so, or it looks like the leak fix simply didn't work
  try{
    const kept=window.sessionStorage.getItem('crowdos-signout-kept');
    if(kept){
      window.sessionStorage.removeItem('crowdos-signout-kept');
      setStatus(`Signed out. ${kept} thing${+kept===1?'':'s'} stayed on this device because they hadn’t been confirmed saved to the account — sign back in and they’ll sync. On a shared computer, sign in again and check Account.`);
    }
  }catch(e){}
}
}
