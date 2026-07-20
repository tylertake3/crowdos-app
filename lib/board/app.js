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
  parseAny, parseSchedule, parseExpanded, prepModel, mergeModels, mergeDetail,
  diffRevisions, carriedDayRecords, sceneIndexOf as engineSceneIndexOf,
} from "../engine";
import { layoutToLines } from "../engine/pdf-layout";
import { DEMO_FULLFAT } from "../engine/demo/demo-fullfat";
import { DEMO_2NDUNIT } from "../engine/demo/demo-2ndunit";
import { jsPDF } from "jspdf";
import * as cloud from "./cloud";

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

const SHELL = `<input type="file" id="fileInput" accept="application/pdf,image/*" multiple style="display:none">
<input type="file" id="coverInput" accept="image/*" style="display:none">
<input type="file" id="avatarInput" accept="image/*" style="display:none">
<div id="statusBar" class="hidden" role="status"><span id="status"></span><button id="statusX" aria-label="Dismiss">✕</button></div>

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
<aside class="sidebar" id="sidebar">
  <div class="side-head">${TAKE3_WORDMARK('side')}<span class="side-head-name">Take 3 Agency<small id="sideWho">Admin</small></span></div>
  <button class="side-item" id="sideDash">Dashboard</button>
  <button class="side-item" id="sideCalc">Calculator</button>
  <div class="side-label">Productions</div>
  <div id="sideList"></div>
  <button class="side-new tb-btn" id="sideNew">+ New production</button>
  <div class="side-label">Sample schedule</div>
  <div id="sideDemo"></div>
  <div class="side-grow"></div>
  <div class="side-foot">
    <button class="side-foot-btn" id="sideSettings" data-tip="Production settings" aria-label="Settings">⚙</button>
    <button class="side-foot-btn" data-tip="Help — ask Tyler for a walkthrough" aria-label="Help">?</button>
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
    <div class="tabs" role="tablist">
      <button class="on" data-view="days">Day board</button>
      <button data-view="cal">Calendar</button>
      <button data-view="stunts" id="tabBreakdown">Stunt cost breakdown</button>
      <button data-view="crowd" id="tabCrowd">Stunts by day</button>
      <button data-view="briefs" id="tabBriefs" class="hidden">Briefs</button>
      <button data-view="calc" id="tabCalc">Calculator</button>
      <button data-view="cast">Cast list</button>
      <button id="tabSettings" class="hidden">Settings</button>
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
  <div id="viewBriefs" class="hidden"></div>
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
      <div class="rp-rev"><label for="rpRev">Revision</label><input id="rpRev" maxlength="18"></div>
      <button class="x" id="rpClose">Cancel</button>
    </div>
    <div class="rp-body">
      <div class="rp-stats" id="rpStats"></div>
      <div id="rpCross"></div>
      <div id="rpChanges"></div>
      <div id="rpQuestions"></div>
      <div id="rpTable"></div>
    </div>
    <div class="rp-foot">
      <span class="note" id="rpNote"></span>
      <button class="rp-pub" id="rpPublish">Publish</button>
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
      <div style="color:var(--faint);font-size:11px;margin-top:12px">For one-liners with no stunt breakdown yet — add the performers this day needs. They’re costed at the stunt rates (performer/coordinator + holiday, usage, insurance). Per-event fees (fire, high falls) go on the day’s ⚡ adjustments.</div>
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
  if(NS&&key.startsWith(NS+'|'))delete NOTES[key.slice(NS.length+1)]; // retire the legacy un-namespaced twin
  if(typeof cloudSyncBlob==='function')cloudSyncBlob('notes',NOTES);
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
// Real shooting locations, set by hand per day — schedules (and AI reads of
// messy ones) sometimes only carry scene sluglines like "INT APARTMENT";
// the override is the physical place the unit actually travels to. It feeds
// maps links, travel bands and weather. The document's own text is kept in
// d.locDoc so the editor can show what the schedule said.
let DAYLOC={};
try{DAYLOC=JSON.parse(store.get('crowdos-dayloc')||'{}')}catch(e){DAYLOC={}}
function saveDayLoc(){store.set('crowdos-dayloc',JSON.stringify(DAYLOC));cloudSyncBlob('dayloc',DAYLOC)}
function applyDayLocs(model,ns){
  for(const d of model.days){
    const ov=DAYLOC[(ns?ns+'|':'')+(d.unit||'Main')+'|'+d.num];
    if(ov){if(d.locDoc==null)d.locDoc=d.loc||'';d.loc=ov;}
    else if(d.locDoc!=null){d.loc=d.locDoc;delete d.locDoc;}
  }
}
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
    call:'07:00',wrap:'18:00',travel:bandFor(d.loc,{bands:activeBands()}).band,chars};
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
    const shown=list.slice(0,3).map(f=>`<span class="code ${cls} named${APPMODE==='crowd'?' click':''}" data-tip="${esc(tip)}" tabindex="0">${esc(f.name.length>24?f.name.slice(0,22)+'…':f.name)}${f.count>1?' ×'+f.count:''}</span>`).join('');
    const more=list.length>3?`<span class="code ${cls} named" data-tip="${esc(tip)}" tabindex="0">+${list.length-3}</span>`:'';
    return shown+more;
  };
  const saCharTip=(s.saChars||[]).map(f=>f.name+(f.count>1?' ×'+f.count:'')).join(', ');
  const crowdChips=[
    s.sa?`<span class="code cr anon${APPMODE==='crowd'?' click':''}" data-tip="${APPMODE==='crowd'?`Unnamed SA ×${s.sa} — click to turn them into characters`:`SA ×${s.sa}`}" tabindex="0">SA ${s.sa}</span>`:'',
    (s.saChars||[]).length?namedChips((s.saChars||[]).map(f=>({name:f.name||'SA',count:f.count})),'cr',saCharTip):'',
    featN?namedChips(s.featured||[],'feat',featTip):'',
    spactN?namedChips((s.spacts||[]).map(f=>({name:f.name||'SPACT',count:f.count})),'spact',spactTip):'',
    s.veh?`<span class="code veh">${s.pod?'Pod ':''}Veh ${s.veh}</span>`:''
  ].filter(Boolean).join('');
  // TWO key shapes live here, and they must not blur: the NOTES key (nk) is
  // namespace-prefixed; the SCENE key (snk) is plain unit|num|scene|part|idx
  // — sceneFromKey/scedKey expect the plain one and add the namespace
  // themselves. Passing nk to the editor made it open EMPTY on every real
  // (namespaced) production and stored edits under a double-prefixed key the
  // cost engine never read.
  const snk=sceneNK(d,s,idx);
  return `<div class="strip ${todClass(s)} ${sceneHasReq(s)?'stunt-row':''}" data-stunt="${sceneHasReq(s)?1:0}" data-dayid="${esc(d.id)}" data-sceneidx="${idx}">
    <div class="rail"></div>
    <div class="scn">${esc(s.num)}${s.part?` <small>Pt ${esc(s.part)}</small>`:''}<small>${esc(s.tod)} ${esc(s.scriptDay)}</small></div>
    <div class="ie">${esc(s.ie)}<small>${esc(s.pages||'—')}p</small></div>
    <div class="body">
      <div class="slug">${esc(s.slug)}</div>
      <div class="desc">${esc(s.desc)}</div>
      ${s.tags.length?`<div class="tags">${s.tags.map(t=>`<span class="tag ${/^Chase|^Sequence/i.test(t)?'strand':''}">${esc(t)}</span>`).join('')}</div>`:''}
    </div>
    <div class="ccol"><div class="codes">${cast.length?cast.map(codeChip).join(''):'<span class="dash">—</span>'}</div></div>
    <div class="ccol reqcell${APPMODE==='stunt'?' editable':''}"${APPMODE==='stunt'?` data-reqedit="${esc(snk)}" data-reqmode="stunt" role="button" tabindex="0" data-tip="Click to add stunt performers to this scene"`:''}><div class="codes">${(stunts.length||(s.extras||[]).length)?stunts.map(codeChip).join('')+(s.extras||[]).map(extraChip).join(''):`<span class="dash">${APPMODE==='stunt'?'＋':'—'}</span>`}</div></div>
    <div class="ccol reqcell${APPMODE==='crowd'?' editable':''}"${APPMODE==='crowd'?` data-reqedit="${esc(snk)}" data-reqmode="crowd" role="button" tabindex="0" data-tip="Click to add crowd to this scene"`:''}><div class="codes">${crowdChips||`<span class="dash">${APPMODE==='crowd'?'＋':'—'}</span>`}</div></div>
    <div><button class="notebtn ${noteVal?'has':''}" data-note="1" data-tip="${noteVal?'View / edit note':'Add note'}" aria-label="Scene note">✎</button></div>
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
// ---- today awareness: the calendar day this app is being used ON ----
const todayCal=()=>{const n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate()).getTime()};
const dayCal=d=>d._date?new Date(d._date.getFullYear(),d._date.getMonth(),d._date.getDate()).getTime():null;
const dayIsToday=d=>dayCal(d)===todayCal();
const dayIsPast=d=>{const c=dayCal(d);return c!=null&&c<todayCal()};
function renderDays(){
  const notesByDay={};
  for(const n of (MODEL.notes||[])){if(n.afterDay!=null)(notesByDay[n.afterDay]=notesByDay[n.afterDay]||[]).push(n)}
  const showUnit=MODEL.multiUnit;
  const cardHTML=d=>{
    const pd=COST.perDay[d.id], cd=CROWD.perDay[d.id], work=APPMODE==='crowd'?cd:pd;
    const peak=dayPeakSA(d), f=fmtDayDate(d);
    const dnk=noteKey(d,null), dnote=getNote(dnk);
    return `<div class="daycard ${work?'has-stunts':''}${dayIsToday(d)?' today':''}" id="day-${d.id}" data-stunt="${work?1:0}">
      <div class="dayhead">
        <div class="dh-top">
          <span class="ddate" data-tip="${esc(f.tip)}" tabindex="0">${f.big}</span>
          <span class="dnum">D${d.num}</span>
          ${dayIsToday(d)?`<span class="unitpill todaypill">Today</span>`:''}
          ${d.carried?`<span class="unitpill carried" data-tip="Already shot — kept from the ${esc(d.fromRev||'previous')} schedule so the production keeps its full timeline">Shot · ${esc(d.fromRev||'prev')}</span>`:''}
          ${showUnit?`<span class="unitpill ${d.unit==='2nd'?'u2':'main'}">${d.unit==='2nd'?'2nd Unit':'Main Unit'}</span>`:''}
          <a class="dloc loclink" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.loc)}" target="_blank" rel="noopener" data-tip="Open in Google Maps">${esc(d.loc)}</a>
          <button class="dloc-edit${d.locDoc!=null?' on':''}" data-locedit="${esc(d.id)}" data-tip="${d.locDoc!=null?'Real location set by hand — the schedule says “'+esc((d.locDoc||'(nothing)').slice(0,60))+'”. Click to change.':'Set the real shooting location (the schedule’s own text often only names the set, e.g. “INT APARTMENT”)'}">📍</button>
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
const WX_CODES={0:'Clear ☀️',1:'Mostly clear 🌤️',2:'Partly cloudy ⛅',3:'Overcast ☁️',45:'Fog 🌫️',48:'Fog 🌫️',51:'Drizzle 🌦️',53:'Drizzle 🌦️',55:'Drizzle 🌧️',56:'Freezing drizzle 🌧️',57:'Freezing drizzle 🌧️',61:'Light rain 🌦️',63:'Rain 🌧️',65:'Heavy rain 🌧️',66:'Freezing rain 🌧️',67:'Freezing rain 🌧️',71:'Light snow 🌨️',73:'Snow 🌨️',75:'Heavy snow ❄️',77:'Snow grains ❄️',80:'Showers 🌦️',81:'Showers 🌧️',82:'Heavy showers ⛈️',85:'Snow showers 🌨️',86:'Snow showers ❄️',95:'Thunderstorm ⛈️',96:'Thunderstorm ⛈️',99:'Hail storm ⛈️'};
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
    slot.innerHTML=`<span class="wx-main">${WX_CODES[wx.code]||''}</span><span class="wx-bit">${wx.max}° / ${wx.min}°</span>${wx.rain!=null?`<span class="wx-bit">💧 ${wx.rain}%</span>`:''}${wx.sunrise?`<span class="wx-bit" data-tip="Sunrise – sunset">☀︎ ${esc(wx.sunrise)} – ${esc(wx.sunset)}</span>`:''}<span class="wx-place">${esc(wx.place)}</span>`;
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
  const peak=dayPeakSA(d);
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
      <button class="charbox-time ${hasOverride?'on':''}" data-cdchartoggle="${i}" data-tip="Override this character's call/wrap time" aria-expanded="${hasOverride?'true':'false'}">⏱${hasOverride?` ${esc(effCall)}–${esc(effWrap)}`:''}</button>
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
      tbtn.innerHTML=hasOverride?`⏱ ${esc(rowCfg.call)}–${esc(rowCfg.wrap)}`:'⏱';
    }
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
$('#statusX').addEventListener('click',()=>setStatus(''));
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
    <span style="font-size:11.5px;color:var(--sub);white-space:nowrap">🚗 Travel — ${mode==='mileage'?'mileage @ '+gbp(mileRate)+'/mi':'train fare'} · ${heads} head${heads===1?'':'s'}</span>
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
    // k.ot/k.early are exact sums across the day's SA rows (each may carry its
    // own call/wrap override); Featured heads share the SA rows' average
    // per-head OT/early as an approximation, same as before this existed.
    const ot=(k.ot||0)+(k.otPer||0)*c.featPD;
    const early=(k.early||0)+(k.earlyPer||0)*c.featPD;
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
  <div class="note">Daily peak counts × (rate + ${(R.hol*100).toFixed(2)}% holiday). SA rate is the PACT/FAA 2026 BDR; Featured/SPACT rates are editable in the crowd rate card. Full chit-level costing (unique people, continuity, overtime, travel, supplements) is full Crowd-engine territory.</div></div>`;
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
  <div class="note">Crowd figures are daily peaks summed across the schedule — costing them properly (tiers, chits, supplements) is Crowd-engine territory.</div></div>`;
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
      const isToday=new Date(y,mo,dd).getTime()===todayCal();
      if(!list.length){cells+=`<div class="cal-cell noshoot${isToday?' todaycell':''}"><span class="dnumtxt">${dd}</span>${isToday?'<span class="todaytag">Today</span>':''}</div>`;continue}
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
      <div class="cal-legend"><span><i style="background:var(--hv-dim);border-left:3px solid var(--hv)"></i>${APPMODE==='crowd'?'Crowd day':'Stunt day'}</span><span><i style="background:var(--panel2);border:1px solid var(--line2)"></i>Shoot day</span><span><i style="background:var(--bg);border:1px solid var(--line)"></i>Non-shoot</span>${MODEL.multiUnit?'<span><i style="border:1px solid var(--dusk)"></i>2nd Unit</span>':''}<span>⚡ adjustment</span><span style="margin-left:auto">Click a day for details</span></div>
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
    return `<tr><td class="mono"><button class="dchip ${d.unit==='2nd'?'u2':''}" data-goto="${esc(d.id)}">D${d.num}</button></td>${MODEL.multiUnit?`<td>${d.unit==='2nd'?'2nd':'Main'}</td>`:''}<td>${esc(chipDate(d))}</td><td>${mapsLink(d.loc)}</td>
    <td class="num">${co||'—'}</td><td class="num">${sd||'—'}</td><td class="num">${perf||'—'}</td>
    <td class="num money"><button class="dchip" data-costday="${esc(d.id)}">${gbp(pd.cost)}${pd.adjItems&&pd.adjItems.length?' ⚡':''}</button></td>
    <td><div class="daylist">${d.scenes.filter(sceneHasStunts).map(s=>`<span class="dchip">${esc(s.num)}${s.part?' Pt'+esc(s.part):''}</span>`).join('')}</div></td></tr>`}).join('')}
  </tbody></table></div>
  <div class="note">Every day carrying stunt work — team sizes are heads on the day. Click a cost for the full day breakdown.</div></div>`;
}
let CROWD_VIEW='day'; // 'day' | 'char' — the Crowd tab's two lenses
function renderCrowd(){
  if(APPMODE==='stunt'){renderStuntsByDay();return}
  const toggle=`<div class="crowdview-toggle"><span class="seg" data-crowdview>
    <button data-v="day" class="${CROWD_VIEW==='day'?'on':''}">By shoot day</button>
    <button data-v="char" class="${CROWD_VIEW==='char'?'on':''}">By character</button></span></div>`;
  if(CROWD_VIEW==='char'){$('#viewCrowd').innerHTML=toggle+crowdByCharHTML();return}
  const rows=MODEL.days.filter(d=>d.scenes.some(s=>s.sa>0||(s.featured||[]).length||(s.spacts||[]).length));
  const hasTier=rows.some(d=>dayPeakFeat(d)||dayPeakSpact(d));
  $('#viewCrowd').innerHTML=toggle+`<div class="tablecard"><h3>Crowd by shoot day<span class="cnt">${rows.length} days</span></h3>
  <div class="tscroll"><table><thead><tr><th>Day</th>${MODEL.multiUnit?'<th>Unit</th>':''}<th>Date</th><th>Location</th><th class="num">Peak SA</th>${hasTier?'<th class="num">Featured</th><th class="num">Spacts</th>':''}<th style="width:40%">Scene requirements</th></tr></thead><tbody>
  ${rows.map(d=>`<tr><td class="mono"><button class="dchip ${d.unit==='2nd'?'u2':''}" data-goto="${esc(d.id)}">D${d.num}</button></td>
    ${MODEL.multiUnit?`<td>${d.unit==='2nd'?'2nd':'Main'}</td>`:''}
    <td>${esc(d.date)}</td><td>${mapsLink(d.loc)}</td>
    <td class="num"><b>${dayPeakSA(d)||'—'}</b></td>
    ${hasTier?`<td class="num">${dayPeakFeat(d)||'—'}</td><td class="num">${dayPeakSpact(d)||'—'}</td>`:''}
    <td><div class="daylist">${d.scenes.filter(s=>s.sa>0).map(s=>`<span class="dchip">${esc(s.num)} · ${s.sa}</span>`).join('')}</div></td></tr>`).join('')}
  </tbody></table></div>
  <div class="note">Featured background and Spacts come from the Expanded schedule blocks. Crowd costing uses the PACT/FAA engine in Crowd mode.</div></div>`;
}
// Same crowd data, grouped by character/group instead of by day. Person-days =
// sum of each character's daily peak across the shoot; costed at the flat day
// rate + holiday, matching the breakdown's people tables. The authoritative,
// OT/early-call-aware figure stays the by-shoot-day view.
function crowdByCharHTML(){
  const R=crowdRates(),hp=1+R.hol;
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

// ---------- casting briefs ----------
// The AD's next phase after costing: each named crowd character becomes a
// BRIEF for the agency — "Nurse ×2, female, 5'5"–5'11"" — with the schedule
// facts (dates, hours, locations, scenes, rates) pulled in automatically and
// kept live, so a revision update can never orphan a brief. Continuity is
// first-class: a brief always shows EVERY day its character appears, and
// flags gaps ("6 Jul + 12 Jul — non-consecutive").
let BRIEFS={};
try{BRIEFS=JSON.parse(store.get('crowdos-briefs')||'{}')}catch(e){BRIEFS={}}
function saveBriefs(){store.set('crowdos-briefs',JSON.stringify(BRIEFS));cloudSyncBlob('briefs',BRIEFS)}
function briefKey(id){return (NS?NS+'|':'')+id}
let BRIEF_OPEN=null; // brief id being edited, or null = the list
const BRIEF_STATUS={draft:'Draft',progress:'In progress',complete:'Complete'};
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
        if(!f.name)continue;
        const k=f.name+'|'+tier;
        const h=here.get(k)||{name:f.name,tier,count:0,scenes:[]};
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
function briefsForNs(){
  const pre=NS?NS+'|':'';
  return Object.entries(BRIEFS)
    .filter(([k])=>NS?k.startsWith(pre):!/^[pm]:/.test(k))
    .map(([k,b])=>({id:NS?k.slice(pre.length):k,key:k,b}));
}
function briefFor(character,tier){
  return briefsForNs().find(x=>x.b.character.toLowerCase()===character.toLowerCase()&&(x.b.tier||'SA')===(tier||'SA'));
}
// rename a crowd character across every scene that carries it — the briefs
// area and the day board are two views of the same names, so a rename in
// either place lands in SCED and flows to the day board, breakdown, crowd
// views and briefs alike
function renameCrowdCharacter(oldName,tier,newName){
  if(!MODEL||!oldName||!newName)return 0;
  const oldL=oldName.toLowerCase();
  if(oldL===newName.toLowerCase())return 0;
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
      if(cTier===tier&&(c.name||'').toLowerCase()===oldL){c.name=newName;n++}
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
let BRIEF_ANON_OPEN=new Set(); // day ids with the inline naming expander open
function renderBriefs(){
  const host=$('#viewBriefs');if(!host)return;
  if(BRIEF_OPEN){host.innerHTML=briefEditorHTML(BRIEF_OPEN);return}
  const {chars,anonPD,anonDays}=crowdCharacters();
  const list=briefsForNs().sort((a,b)=>(b.b.updatedAt||'').localeCompare(a.b.updatedAt||''));
  const unbriefed=chars.filter(c=>!briefFor(c.name,c.tier));
  const anon=unnamedSaDays();
  const statusPill=x=>`<select class="briefstatus ${esc(x.b.status||'draft')}" data-briefstatus="${esc(x.id)}">${Object.entries(BRIEF_STATUS).map(([v,l])=>`<option value="${v}"${(x.b.status||'draft')===v?' selected':''}>${l}</option>`).join('')}</select>`;
  const rows=list.map(x=>{
    const c=chars.find(cc=>cc.name.toLowerCase()===x.b.character.toLowerCase()&&cc.tier===(x.b.tier||'SA'));
    const days=c?c.days.length:0;
    const cont=c?briefContinuity(c.days):{gaps:0};
    return `<tr class="briefrow" data-openbrief="${esc(x.id)}">
      <td class="rowlabel">${esc(x.b.character)}${c?'':' <span class="briefwarn" data-tip="No scenes carry this character name any more — check the schedule">⚠</span>'}</td>
      <td>${esc(x.b.tier||'SA')}</td>
      <td class="num">${x.b.count||(c?c.max:'—')}</td>
      <td class="num">${days||'—'}${cont.gaps?` <span class="briefwarn" data-tip="Non-consecutive days — continuity">⚠</span>`:''}</td>
      <td class="datescol">${c?`<div class="daylist">${c.days.slice(0,8).map(x2=>`<span class="dchip" data-goto="${esc(x2.d.id)}">${esc(chipDate(x2.d))}</span>`).join('')}${c.days.length>8?`<span class="dchip more">+${c.days.length-8}</span>`:''}</div>`:'—'}</td>
      <td>${statusPill(x)}</td>
      <td class="num"><button class="briefdel" data-delbrief="${esc(x.id)}" aria-label="Delete brief">✕</button></td>
    </tr>`;
  }).join('');
  // characters named on the day board show up here BY THEMSELVES — a rename
  // like "SA 40" → "40 Passer-bys" surfaces instantly, no Generate needed.
  // Opening one quietly creates its draft brief.
  const unbriefedRows=unbriefed.map(c=>{
    const cont=briefContinuity(c.days);
    return `<tr class="briefrow unbriefed" data-newbrieffor="${esc(c.name)}|${esc(c.tier)}" data-count="${c.max}">
      <td class="rowlabel">${esc(c.name)} <span class="cdinfo">new — from the day board</span></td>
      <td>${esc(c.tier)}</td>
      <td class="num">${c.max}</td>
      <td class="num">${c.days.length}${cont.gaps?` <span class="briefwarn" data-tip="Non-consecutive days — continuity">⚠</span>`:''}</td>
      <td class="datescol"><div class="daylist">${c.days.slice(0,8).map(x2=>`<span class="dchip" data-goto="${esc(x2.d.id)}">${esc(chipDate(x2.d))}</span>`).join('')}${c.days.length>8?`<span class="dchip more">+${c.days.length-8}</span>`:''}</div></td>
      <td><span class="briefstatus draft" style="pointer-events:none">No brief yet</span></td>
      <td></td>
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
  <div class="tablecard"><h3>Casting briefs<span class="cnt">${list.length}</span>
    <span style="margin-left:auto;display:flex;gap:8px">
      ${unbriefed.length?`<button class="tb-btn" data-briefgen>Generate from schedule (${unbriefed.length})</button>`:''}
      <button class="tb-btn briefprimary" data-briefnew>＋ New brief</button>
    </span></h3>
  ${(list.length||unbriefed.length)?`<div class="tscroll"><table><thead><tr><th>Character</th><th>Tier</th><th class="num">Heads</th><th class="num">Days</th><th class="datescol">Dates</th><th>Status</th><th></th></tr></thead><tbody>${rows}${unbriefedRows}</tbody></table></div>`
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
  const {chars}=crowdCharacters();
  const c=chars.find(cc=>cc.name.toLowerCase()===b.character.toLowerCase()&&cc.tier===(b.tier||'SA'));
  const R=crowdRates();
  const rate=b.tier==='SPACT'?R.spact:R.sa;
  const holTxt=b.tier==='SPACT'?gbp(gSpHol())+' in lieu':(R.hol*100).toFixed(2)+'%';
  const cont=c?briefContinuity(c.days):null;
  const contLine=c&&cont?(cont.gaps
    ?`<span class="briefwarn">⚠ Non-consecutive:</span> ${cont.runs.map(r=>r.length>1?chipDate(r[0])+'–'+chipDate(r[r.length-1]):chipDate(r[0])).join('  ·  ')} — make the agency aware the same performer${(b.count||c.max)>1?'s are':' is'} needed across the gap (continuity)`
    :`${c.days.length===1?'Single day':'Consecutive run'} — ${cont.runs[0].length>1?chipDate(cont.runs[0][0])+' – '+chipDate(cont.runs[0][cont.runs[0].length-1]):chipDate(cont.runs[0][0])}`):'';
  const schedRows=c?c.days.map(x2=>{
    const d=x2.d;
    const scenes=x2.scenes.map(s=>`<span class="dchip" data-tip="${esc((s.slug||'')+(s.desc?' — '+s.desc.slice(0,80):''))}">${esc(s.num)}${s.part?' pt'+esc(s.part):''}</span>`).join(' ');
    return `<tr><td class="mono"><button class="dchip" data-goto="${esc(d.id)}">D${d.num}</button></td><td>${esc(chipDate(d))}</td><td>${esc(d.hours||'—')}</td><td>${esc(d.type||'—')}</td><td>${mapsLink(d.loc)}</td><td class="num"><b>${x2.count}</b></td><td><div class="daylist">${scenes}</div></td></tr>`;
  }).join(''):'';
  const sceneIntro=c?[...new Set(c.days.flatMap(x2=>x2.scenes.map(s=>s.desc).filter(Boolean)))].slice(0,3):[];
  return `
  <div class="briefpage">
    <div class="briefhead">
      <button class="tb-btn" data-briefback>‹ Briefs</button>
      <input class="brieftitle" data-brieffld="character" data-bid="${esc(id)}" data-orig="${esc(b.character)}" value="${esc(b.character)}">
      <select class="briefstatus ${esc(b.status||'draft')}" data-briefstatus="${esc(id)}">${Object.entries(BRIEF_STATUS).map(([v,l])=>`<option value="${v}"${(b.status||'draft')===v?' selected':''}>${l}</option>`).join('')}</select>
      <span style="flex:1"></span>
      <button class="tb-btn" data-briefcopy="${esc(id)}">Copy for agency</button>
    </div>
    <div class="briefgrid">
      <div class="tablecard"><h3>From the schedule <span class="cnt">${c?c.days.length+' day'+(c.days.length===1?'':'s'):'not found'}</span></h3>
        ${c?`<div class="tscroll"><table><thead><tr><th>Day</th><th>Date</th><th>Unit hours</th><th>Day type</th><th>Location</th><th class="num">Needed</th><th>Scenes</th></tr></thead><tbody>${schedRows}</tbody></table></div>
        <div class="note"><b>Continuity:</b> ${contLine}</div>`
        :`<div class="note">No scene currently carries the character name “${esc(b.character)}” (${esc(b.tier||'SA')}). Rename it here to match the schedule, or add the character to scenes on the day board.</div>`}
      </div>
      <div class="tablecard"><h3>Casting requirements</h3>
        <div class="briefform">
          <div class="bf-row">
            <label>How many<input type="number" min="1" data-brieffld="count" data-bid="${esc(id)}" value="${b.count||(c?c.max:1)}" style="width:80px"></label>
            <label>Tier<select data-brieffld="tier" data-bid="${esc(id)}"><option${(b.tier||'SA')==='SA'?' selected':''}>SA</option><option${b.tier==='Featured'?' selected':''}>Featured</option><option${b.tier==='SPACT'?' selected':''}>SPACT</option></select></label>
            <span class="cdinfo">Rate: ${gbp(rate)}/day + holiday ${holTxt}${b.tier==='Featured'?' + supplementary fees':''} — from the production's rate card</span>
          </div>
          <label class="bf-block">Description for the agency
            <textarea data-brieffld="desc" data-bid="${esc(id)}" placeholder="e.g. Two female nurses, ideally 5'5”–5'11”, NHS scrubs look, comfortable with night shoots…">${esc(b.desc||'')}</textarea></label>
          <label class="bf-block">Scene context ${sceneIntro.length?'<span class="cdinfo">(auto-suggested from the scenes — edit freely)</span>':''}
            <textarea data-brieffld="context" data-bid="${esc(id)}" placeholder="What's happening in the scene(s)…">${esc(b.context!=null?b.context:sceneIntro.join(' · '))}</textarea></label>
          <label class="bf-block">Reference links & anything else
            <textarea data-brieffld="notes" data-bid="${esc(id)}" placeholder="Photo reference links, wardrobe notes, fitting needs…">${esc(b.notes||'')}</textarea></label>
        </div>
      </div>
    </div>
  </div>`;
}
// plain-text version the AD can paste into an email / the agency system
function briefText(id){
  const x=briefsForNs().find(y=>y.id===id);if(!x)return '';
  const b=x.b;
  const {chars}=crowdCharacters();
  const c=chars.find(cc=>cc.name.toLowerCase()===b.character.toLowerCase()&&cc.tier===(b.tier||'SA'));
  const R=crowdRates();
  const rate=b.tier==='SPACT'?R.spact:R.sa;
  const src=SOURCES[ACTIVE]||{};
  const lines=[
    `CASTING BRIEF — ${b.character}`,
    `Production: ${src.prod||src.title||''}`,
    `How many: ${b.count||(c?c.max:'')} (${b.tier||'SA'})`,
    `Rate: ${gbp(rate)}/day + holiday${b.tier==='Featured'?' + supplementary fees':''}`,
    '',
    b.desc?`Requirements: ${b.desc}`:'',
    (b.context!=null?b.context:'')?`Scene: ${b.context}`:'',
    b.notes?`Notes: ${b.notes}`:'',
    '',
    'Dates:',
    ...(c?c.days.map(x2=>`  ${chipDate(x2.d)} — D${x2.d.num} · ${x2.d.loc||''} · ${x2.d.hours||''}${x2.d.type?' · '+x2.d.type:''} · ${x2.count} needed · scenes ${x2.scenes.map(s=>s.num).join(', ')}`):['  (no matching schedule days)']),
  ].filter(l=>l!==null&&l!==undefined&&l!=='');
  const cont=c?briefContinuity(c.days):null;
  if(cont&&cont.gaps)lines.push('','CONTINUITY: same performers required across non-consecutive dates — '+cont.runs.map(r=>r.length>1?chipDate(r[0])+'–'+chipDate(r[r.length-1]):chipDate(r[0])).join(' + '));
  return lines.join('\n');
}
function newBrief(character,tier,count){
  const id='b'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  BRIEFS[briefKey(id)]={character:character||'New character',tier:tier||'SA',count:count||1,status:'draft',desc:'',notes:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  saveBriefs();
  return id;
}

// brief status pills + the fields that change what the schedule panel shows
// (character rename, tier, count) re-render on commit — free-text areas don't
document.addEventListener('change',e=>{
  const st=e.target.closest('[data-briefstatus]');
  if(st){
    const b=BRIEFS[briefKey(st.dataset.briefstatus)];
    if(b){b.status=st.value;b.updatedAt=new Date().toISOString();saveBriefs()}
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
      btn.textContent=hasVal?'✎ Day note':'＋ Add day note';
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
  const tset=e.target.closest('#tabSettings');
  if(tset){
    const s=SOURCES[ACTIVE];
    if(s&&s.kind)openProdSettings(s.prod||s.title);
    return;
  }
  const sset=e.target.closest('#sideSettings');
  if(sset){
    const s=SOURCES[ACTIVE];
    if(!DASH&&s&&s.kind)openProdSettings(s.prod||s.title);
    else if(CLOUD.session)$('#authModal').classList.add('open');
    else setStatus('Open a production, then ⚙ opens its settings.');
    return;
  }
  const t=e.target.closest('[data-view]');
  if(t){
    document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b===t));
    ['days','cal','stunts','crowd','briefs','calc','cast'].forEach(v=>$('#view'+v[0].toUpperCase()+v.slice(1)).classList.toggle('hidden',v!==t.dataset.view));
    if(t.dataset.view==='briefs')renderBriefs();
    return;
  }
  const cvb=e.target.closest('[data-calview]');
  if(cvb){CALVIEW=cvb.dataset.calview;store.set('stuntos-calview',CALVIEW);renderCalendar();return}
  const cvw=e.target.closest('[data-crowdview] button');
  if(cvw){CROWD_VIEW=cvw.dataset.v;renderCrowd();return}
  // ----- casting briefs -----
  const bnew=e.target.closest('[data-briefnew]');
  if(bnew){BRIEF_OPEN=newBrief();renderBriefs();const f=$('#viewBriefs .brieftitle');if(f){f.focus();f.select()}return}
  const bgen=e.target.closest('[data-briefgen]');
  if(bgen){
    const {chars}=crowdCharacters();
    let n=0;
    for(const c of chars)if(!briefFor(c.name,c.tier)){newBrief(c.name,c.tier,c.max);n++}
    renderBriefs();setStatus(n+' brief'+(n===1?'':'s')+' created from the schedule’s named characters — open each to add casting detail.');
    return;
  }
  const bdel=e.target.closest('[data-delbrief]');
  if(bdel){delete BRIEFS[briefKey(bdel.dataset.delbrief)];saveBriefs();renderBriefs();return}
  const bback=e.target.closest('[data-briefback]');
  if(bback){BRIEF_OPEN=null;renderBriefs();return}
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
    BRIEF_OPEN=brow.dataset.openbrief;renderBriefs();window.scrollTo(0,0);return;
  }
  // a character named on the day board but not briefed yet — opening it
  // creates its draft on the spot
  const bnewfor=e.target.closest('.briefrow[data-newbrieffor]');
  if(bnewfor&&!e.target.closest('select,button,input,textarea,a,[data-goto]')){
    const [name,tier]=bnewfor.dataset.newbrieffor.split('|');
    BRIEF_OPEN=newBrief(name,tier,+bnewfor.dataset.count||1);
    renderBriefs();window.scrollTo(0,0);return;
  }
  // real-location editor: swap the day header's location for an input in
  // place; empty commits back to whatever the schedule document said
  const locEd=e.target.closest('[data-locedit]');
  if(locEd){
    const d=COST.dayById[locEd.dataset.locedit];if(!d)return;
    const row=locEd.closest('.dh-top');
    const a=row.querySelector('.dloc');
    if(!a||row.querySelector('.dloc-input'))return;
    const inp=document.createElement('input');
    inp.className='dloc-input';
    inp.value=DAYLOC[(NS?NS+'|':'')+(d.unit||'Main')+'|'+d.num]||d.loc||'';
    inp.placeholder=d.locDoc!=null?('schedule says: '+(d.locDoc||'—')):'Real shooting location…';
    a.replaceWith(inp);locEd.style.display='none';
    inp.focus();inp.select();
    let done=false;
    const commit=(save)=>{
      if(done)return;done=true;
      if(save){
        const key=(NS?NS+'|':'')+(d.unit||'Main')+'|'+d.num;
        const v=inp.value.trim();
        const docText=d.locDoc!=null?d.locDoc:d.loc;
        if(v&&v!==docText)DAYLOC[key]=v;else delete DAYLOC[key];
        saveDayLoc();
      }
      refreshAll();
    };
    inp.addEventListener('keydown',ev=>{if(ev.key==='Enter')commit(true);if(ev.key==='Escape')commit(false)});
    inp.addEventListener('blur',()=>commit(true));
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
    if(el){
      const drawer=el.closest('details.pastdrawer');
      if(drawer&&!drawer.open){drawer.open=true;PAST_OPEN=true;}
      el.scrollIntoView({block:'start'});
    }
    return;
  }
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
  document.title='Laural — '+(m==='crowd'?'Crowd':'Stunt');
  // rate bars stay hidden permanently: rates are edited in Production
  // Settings only. The inputs remain in the DOM — the engine reads them and
  // applyRateVals still writes the resolved card values into them.
  $('#tabBreakdown').textContent=m==='crowd'?'Crowd cost breakdown':'Stunt cost breakdown';
  $('#fltLabel').textContent=m==='crowd'?'Crowd days only':'Stunt days only';
  $('#tabCrowd').textContent=m==='crowd'?'Crowd':'Stunts by day';
  // Briefs (casting briefs for the agency) is a CrowdOS concern
  $('#tabBriefs').classList.toggle('hidden',m!=='crowd');
  if(m!=='crowd'&&!$('#viewBriefs').classList.contains('hidden'))document.querySelector('.tabs button[data-view="days"]').click();
  /* Calculator tab lives in both modes — content branches on APPMODE */
  if(MODEL){computeCosts();computeCrowdCosts();renderSummary();renderDays();renderStunts();renderCrowd();renderCalendar();renderCast();renderFreeCalc();}
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
  renderSrcBar();
  BRIEF_OPEN=null; // briefs are per-production — never show another production's editor
  BRIEF_ANON_OPEN=new Set();
  $('#tabSettings').classList.toggle('hidden',!SOURCES[i].kind); // demo schedules have no production settings
  computeCosts();computeCrowdCosts();renderSummary();renderDays();renderStunts();renderCrowd();renderCalendar();renderCast();renderFreeCalc();
  if($('#viewBriefs')&&!$('#viewBriefs').classList.contains('hidden'))renderBriefs();
  updateCrumbs();
  window.scrollTo(0,0);
}
function addSource(model,title,short,activate=true,opts={}){
  if(!model.days.length&&!opts.allowEmpty){setStatus('No shoot days found in that schedule.');return false}
  const colour=opts.colour||detectColour(title,model._raw||'');
  SOURCES.push({model,title,short:short||title,colour,kind:opts.kind,text:opts.text,unit:opts.unit,ns:opts.ns,cloudId:opts.cloudId,createdAt:opts.createdAt,prod:opts.prod,version:opts.version,schedDate:opts.schedDate,format:opts.format,rateCard:opts.rateCard||null,current:!!opts.current,aiModel:opts.aiModel||null,docKind:opts.docKind||null});
  if(activate)setActive(SOURCES.length-1);else renderSrcBar();
  return true;
}
// status messages live in the Laural-style floating dark bar, bottom centre
function setStatus(msg){
  $('#status').textContent=msg;
  const bar=$('#statusBar');if(bar)bar.classList.toggle('hidden',!msg);
}
// ---------- breadcrumbs (Laural: Productions › Victura › Main Unit · Pink) ----------
function updateCrumbs(){
  const el=$('#topCrumbs');if(!el)return;
  if(DASH&&DASH_CALC){el.innerHTML='<span class="cur">Calculator</span>';return}
  const seg=[];
  seg.push('<button data-crumb="dash">Productions</button>');
  if(DASH){
    if(PROD_HOME)seg.push('<span class="sep">›</span><span class="cur">'+esc(PROD_HOME)+'</span>');
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
  if(c.dataset.crumb==='dash'){DASH_CALC=false;PROD_HOME=null;showDash();}
  else if(c.dataset.crumb==='prod'){DASH_CALC=false;PROD_HOME=c.dataset.prod;showDash();}
});

// ---------- add production: two doors in, one data shape ----------
// Manual days and parsed days are identical ShootDay objects — same cost
// engine, same views. User-added productions persist in localStorage until
// per-production Supabase storage lands.
function refreshAll(){
  computeCosts();computeCrowdCosts();renderSummary();renderDays();renderStunts();renderCrowd();renderCalendar();renderCast();renderFreeCalc();
  if($('#viewBriefs')&&!$('#viewBriefs').classList.contains('hidden'))renderBriefs();
}
function saveUserSources(){
  store.set('crowdos-sources',JSON.stringify(SOURCES.filter(s=>s.kind).map(s=>({kind:s.kind,title:s.title,short:s.short,unit:s.unit||'Main',text:s.text||null,prod:s.prod||null,version:s.version||null,schedDate:s.schedDate||null,colour:s.colour||null,format:s.format||null,rateCard:s.rateCard||null,current:!!s.current,createdAt:s.createdAt||null,aiModel:s.aiModel||null,docKind:s.docKind||null}))));
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
// which asks Claude Haiku 4.5 for the same days/scenes shape. The user's
// glossary rides along so known notation is applied silently; anything the
// model can't interpret comes back as clarifying questions for the review
// screen. Returns {model,questions} or throws with a readable message.
// A production can switch AI reading off entirely (Production Settings →
// General) — its schedule text then never leaves the app.
const aiBlocked=n=>!!(n&&PRODS[n]&&PRODS[n].noAI);
const AI_OFF_MSG='AI reading is switched off for this production (Production Settings → General), so nothing was sent out.';
async function aiParse(text,prod,images){
  if(aiBlocked(prod))throw new Error(AI_OFF_MSG);
  const tok=CLOUD.session&&CLOUD.session.access_token;
  const res=await fetch('/api/parse-schedule',{method:'POST',headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:JSON.stringify({text,glossary:glossaryFor(prod),...(images&&images.length?{images}:{})})});
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
    openImportConfirm({m:prepModel(JSON.parse(JSON.stringify(aiModel||m)),'Main'),text,title,aiModel,mergeStats,isDetail:!spineDoc,docKind,questions,filesLabel:docs.map(d=>d.file.name).join(' + ')});
  }catch(err){console.error(err);setStatus('Couldn’t read that PDF ('+err.message+').')}
}
// The import-confirm dialog, shared by every upload kind (PDF text, PDF
// pairs, photographed pages). Fills the metadata guesses and opens the modal;
// nothing is saved until the review page's Publish.
function openImportConfirm({m,text,title,aiModel,mergeStats,isDetail,docKind,questions,filesLabel,images}){
  if(!m.days.length&&!isDetail){setStatus('No shoot days found in that schedule — send it to us and we’ll teach the parser its format.');return}
  const guess=guessImportMeta(text||'',title);
  PENDING_IMPORT={text:text||'',title,aiModel,mergeStats,isDetail,docKind,questions,files:filesLabel,images:images||null};
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
      ctx:{mode:'merge',prod:s.prod||s.title,unit:s.unit||'Main',version:revLabel(s),docKind:'merged',files:P.files||P.title,questions:P.questions||[],text:P.text,rawModel:r.model},
      onAccept(){
        s.aiModel=r.model;
        s.docKind='merged';
        s.model=modelFrom(s,s.unit||'Main');
        restoreManualDays(s);
        saveUserSources();
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
    carry={diff,plan:planRevisionCarry(prevSrc,m,diff,manualPlains),stitched:recs.length};
    ctx.carry=carry;ctx.stitched=recs.length>0;
  }
  const commit=()=>{
    ensureProd(prod,isNew?{rateCard:newCard,colour}:{colour});
    const rateCard=(PRODS[prod]&&PRODS[prod].rateCard)||null;
    const storeAi=(P.aiModel||ctx.edited||ctx.stitched)?raw:null;
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
      if(CLOUD.session)cloud.insertProduction(src).then(({id,error})=>{
        if(error){src.cloudFailed=true;setStatus('Cloud save failed: '+error.message)}
        // always resync once the id exists — ANY edit made while the insert
        // was in flight (carry or by hand) was skipped by the per-source sync
        else{src.cloudId=id;resyncNsMaps(src.ns);pushAllBlobs();}
      });
      logProdEvent(prod,'schedule','Published '+((ctx.version||'').toUpperCase()||'revision')+' as current for '+unit+' Unit — '+m.days.length+' days'+(carry&&carry.stitched?' · '+carry.stitched+' shot day'+(carry.stitched===1?'':'s')+' kept from '+revLabel(prevSrc):'')+(carriedN?' · '+carriedN+' edits carried over':'')+(P.mergeStats?' · Full Fat merged onto '+P.mergeStats.matched+'/'+P.mergeStats.spineScenes+' scenes':''));
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
        ${D.collisions.length?`<div class="revline none">⚠ ${D.collisions.length} past day${D.collisions.length===1?'':'s'} could not be kept — the new schedule reuses their day number${D.collisions.length===1?'':'s'} (${esc(D.collisions.map(d=>'D'+d.num).join(', '))}). Their work stays on ${esc(revLabel(prev))}.</div>`:''}
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
  $('#rpCrumbs').innerHTML=`<b>${esc(ctx.prod||'')}</b> · ${esc(ctx.unit||'Main')} Unit · ${ctx.mode==='merge'?'detail merge into current revision':'new revision'}`;
  $('#rpFile').textContent=ctx.files||'';
  $('#rpKinds').innerHTML=ctx.docKind?`<span class="kindchip">${esc(KIND_LABEL[ctx.docKind]||ctx.docKind)}</span>`:'';
  const rev=$('#rpRev');
  rev.value=(ctx.version||'').toUpperCase()||'V1';
  rev.readOnly=ctx.mode==='merge';
  const rawModel=ctx.rawModel||null; // the stored model — edits go here too, so they survive reload
  const rawDayOf=num=>rawModel?rawModel.days.find(x=>x.num===num):null;
  const questions=(ctx.questions||[]).filter(q=>{
    const known=glossaryFor(ctx.prod).some(g=>g.term.toLowerCase()===(q.term||'').toLowerCase());
    return !known&&(q.term||'').trim();
  });
  function renderStats(){
    const scenes=nextModel.days.reduce((a,d)=>a+d.scenes.length,0);
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
  }
  // clarifying questions + glossary-applied strip
  const applied=glossaryFor(ctx.prod).filter(g=>g.term.length>1&&(ctx.text||'').toLowerCase().includes(g.term.toLowerCase())).slice(0,6);
  let qHtml='';
  if(questions.length||applied.length)qHtml+=`<div class="rp-sec-title">Needs your attention<span class="cnt">${questions.length} question${questions.length===1?'':'s'}</span></div>`;
  qHtml+=questions.map((q,i)=>`
    <div class="qcard" data-qi="${i}" data-term="${esc(q.term)}" style="margin-bottom:8px">
      ${q.days&&q.days.length?`<span class="days">Day${q.days.length===1?'':'s'} ${q.days.slice(0,6).join(', ')}${q.days.length>6?'…':''}</span>`:''}
      <div class="kind">Unknown notation</div>
      <div class="qsrc">${esc(q.source||q.term)}</div>
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
  // full day table — dates and locations are editable in place; ✕ deletes a
  // day before it ever reaches the board (e.g. already-shot material)
  function renderTable(){
    const rows=nextModel.days.map(d=>{
      const cast=new Set();for(const sc of d.scenes)for(const c of sc.cast||[])cast.add(c.code);
      return `<tr data-dnum="${d.num}"><td class="dchip">D${d.num}</td>
        <td><input class="rp-edit" data-f="date" value="${esc(d.date||'')}" placeholder="date ?" aria-label="Date for D${d.num}"></td>
        <td><input class="rp-edit" data-f="loc" value="${esc(d.loc||'')}" placeholder="location ?" aria-label="Location for D${d.num}"></td>
        <td class="num">${daySaTotal(d)||'—'}</td>
        <td class="num">${cast.size||'—'}</td>
        <td class="num">${d.scenes.length}</td>
        <td><button class="rp-delday" data-deldaynum="${d.num}" title="Delete this day — it won't be published">✕</button></td></tr>`;
    }).join('');
    $('#rpTable').innerHTML=`<div class="rp-sec-title">Day by day<span class="cnt">${nextModel.days.length} days · click a date or location to edit · ✕ removes a day</span></div>
      <div class="rp-tblwrap"><table class="rp-tbl"><thead><tr><th>Day</th><th>Date</th><th>Location</th><th class="num">Crowd</th><th class="num">Cast</th><th class="num">Scenes</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  renderTable();
  $('#rpTable').onchange=e=>{
    if(token!==REV_OPEN)return;
    const inp=e.target.closest('.rp-edit');if(!inp)return;
    const num=+inp.closest('tr').dataset.dnum;
    const d=nextModel.days.find(x=>x.num===num);if(!d)return;
    const v=inp.value.trim();
    if(inp.dataset.f==='date'){d.date=v;d._date=parseDayDate(d);}
    else d.loc=v;
    const rd=rawDayOf(num);
    if(rd){if(inp.dataset.f==='date')rd.date=v;else rd.loc=v;}
    ctx.edited=true;
    renderStats();renderChanges(); // the input already shows the new value — table stays put
  };
  $('#rpTable').onclick=e=>{
    if(token!==REV_OPEN)return;
    const del=e.target.closest('[data-deldaynum]');if(!del)return;
    const num=+del.dataset.deldaynum;
    nextModel.days=nextModel.days.filter(x=>x.num!==num);
    if(rawModel)rawModel.days=rawModel.days.filter(x=>x.num!==num);
    ctx.edited=true;
    renderStats();renderChanges();renderTable();
    setStatus('D'+num+' removed — it won’t be published. Cancel discards every edit.');
  };
  // publish label follows the revision input
  const pub=$('#rpPublish');
  const syncPub=()=>{pub.textContent=ctx.mode==='merge'?('Apply detail to '+(rev.value.trim().toUpperCase()||revLabel(prev)||'current')):('Publish as '+(rev.value.trim().toUpperCase()||'UNTITLED')+' revision')};
  rev.oninput=syncPub;syncPub();
  rpRefreshCounts();
  $('#revPage').classList.add('open');
  // card interactions (scoped to this open; token guards stale handlers)
  $('#rpQuestions').onclick=e=>{
    if(token!==REV_OPEN)return;
    const card=e.target.closest('.qcard');if(!card)return;
    const scopeBtn=e.target.closest('.qscope button');
    if(scopeBtn){card.querySelectorAll('.qscope button').forEach(b=>b.classList.remove('on'));scopeBtn.classList.add('on');return;}
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
  if(cb)cb();
});
function discardReview(){REV_CB=null;REV_CTX=null;$('#revPage').classList.remove('open');setStatus('Import discarded — nothing was changed.');}
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
  DASH=false;CURPROD=name;SHOWING_EMPTY_PROD=name;
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
$('#auSignOut').addEventListener('click',async()=>{await cloud.signOut();location.reload()});
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
  // glossary: the cloud copy wins when it has rows (a pre-migration database
  // returns none — keep the local copy so answers aren't lost)
  if(res.glossary&&res.glossary.length){
    GLOSSARY=res.glossary.map(r=>({term:r.term,answer:r.answer,production:r.production||null}));
    saveGlossaryLocal();
  }
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
        addSource(m,rec.title,rec.short,false,{kind:'pdf',text:rec.schedule_text,unit:rec.unit||'Main',ns:'p:'+rec.title,cloudId:rec.id,colour:rec.colour||undefined,createdAt:rec.created_at,prod:rec.production,version:rec.version,schedDate:rec.sched_date,format:rec.format,rateCard:rec.rate_card,current:rec.is_current,aiModel:rec.ai_model||null,docKind:rec.doc_kind||null});
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
let DASH=false,DASH_CALC=false; // DASH_CALC: dashboard-level rough-budget calculator
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
  const mk=(s,i,label)=>`<button class="side-item sched ${!DASH&&i===ACTIVE?'on':''}" data-side="${i}" title="${esc(s.title)}"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label||s.short)}</span><span class="k">${s.model.days.length}d</span><span class="del" data-delsrc="${i}" data-tip="Delete this schedule">✕</span></button>`;
  $('#sideDash').classList.toggle('on',DASH&&!DASH_CALC);
  $('#sideCalc').classList.toggle('on',DASH&&DASH_CALC);
  // one row per UNIT (its current revision); revision history lives on the
  // dashboard. Empty productions listed too. Each production is a drawer —
  // click its name to open/close the units beneath it.
  let html='';
  for(const name of new Set([...prodNames(),...SOURCES.filter(s=>s.kind).map(s=>s.prod||s.title)])){
    const closed=SIDE_COLLAPSED.has(name);
    html+=`<div class="side-prod${closed?' closed':''}" data-prodtoggle="${esc(name)}"><span class="side-prod-chev">▾</span><span class="side-prod-name">${esc(name)}</span><span class="side-prod-tools"><span data-prodimport="${esc(name)}" data-tip="Add a schedule — upload a PDF or build by hand">＋</span><span data-prodedit="${esc(name)}" data-tip="Production settings">✎</span></span></div>`;
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
  $('#sideDemo').innerHTML=SOURCES.map((s,i)=>s.kind?'':mk(s,i)).join('');
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
  const who=CLOUD.session?displayName(CLOUD.session):'';
  const mode=modeWord(), Mode=mode[0].toUpperCase()+mode.slice(1);
  const money=n=>n>0?`<b class="verfig">${gbp(Math.round(n))}</b>`:`<span class="noreq">No ${mode} requirement</span>`;
  const names=[...new Set([...prodNames(),...SOURCES.filter(s=>s.kind).map(s=>s.prod||s.title)])];
  const demoFull=SOURCES.findIndex(s=>!s.kind&&s.model.multiUnit);
  const demoCard=demoFull>=0?`<div class="prodcard demo"><div class="ph" data-side="${demoFull}"><span class="pname">${esc(SOURCES[demoFull].title)}</span><span class="pmeta">sample</span><span class="pfig">${money(modeCost(SOURCES[demoFull]))}</span></div></div>`:'';

  // ---- Calculator: the rough-budget scratchpad, no production needed.
  // The existing free-calculator view is re-parented into the dashboard so
  // both places share one calculator (same state, same delegated events).
  if(DASH_CALC){
    // grab the calculator node BEFORE wiping dashView — on a re-render (mode
    // switch, etc.) it lives INSIDE dashView and innerHTML would destroy it
    const vc=$('#viewCalc');
    $('#dashView').innerHTML=`
      <div class="dash-hero"><div><div class="dash-head">Calculator</div><div class="dash-sub">Rough budget — play with numbers without opening a production. “10 SAs on a 10-hour day starting 07:00” lives here.</div></div></div>
      <div id="dashCalcSlot"></div>`;
    if(vc){
      $('#dashCalcSlot').appendChild(vc);
      vc.classList.remove('hidden');
      renderFreeCalc();
    }
    return;
  }

  if(PROD_HOME&&names.includes(PROD_HOME)){renderProdHome(PROD_HOME,mode,Mode,money);return}

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
      <div class="gtitle">${esc(name)}<span class="gedit" data-prodedit="${esc(name)}" data-tip="Production settings">✎</span></div>
      <div class="gsub">${sub}</div>
    </div>`;
  }).join('');
  $('#dashView').innerHTML=`
    <div class="dash-hero"><div><div class="dash-head">Productions</div><div class="dash-sub">${who?esc(who):''}${who?' · ':''}${Mode}</div></div></div>
    <div class="gctl">
      <div class="searchwrap gsearch"><input id="dashSearch" type="search" placeholder="Search" value="${esc(DASH_Q)}"></div>
      <div class="grow"></div>
      <select id="dashSort" class="gsort"><option value="edited"${DASH_SORT==='edited'?' selected':''}>Last edited</option><option value="alpha"${DASH_SORT==='alpha'?' selected':''}>Alphabetically</option></select>
      <button class="gnew" id="dashNew">Create new</button>
    </div>
    <div class="ggrid">${cards}</div>
    ${demoCard?`<div class="dash-sub" style="margin:26px 0 8px">Sample schedule</div>${demoCard}`:''}`;
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
  $('#dashView').innerHTML=`
    <div class="dash-hero"><div data-backprod="1" class="dash-back"><i>‹</i> All productions</div></div>
    <div class="dash-head" style="margin-top:6px" data-openprod="${esc(name)}">${esc(name)}</div>
    <div class="summary" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:14px">
      <div class="stat"><div class="n">${dayTotal.toLocaleString()}</div><div class="l">Shoot days</div></div>
      <div class="stat money costable"><div class="n">${gbp(Math.round(pFig))}</div><div class="l">${Mode} total</div></div>
      <div class="stat"><div class="n">${units.size}</div><div class="l">Unit${units.size===1?'':'s'}</div></div>
    </div>
    <div class="dash-sub" style="margin:22px 0 8px">Schedules</div>
    <div class="prodcard">
      <div class="punits">
        ${unitsHtml||`<div class="uploadrow" data-prodimport="${esc(name)}">+ Add the first schedule</div>`}
        <div class="uploadrow addunit" data-prodimport="${esc(name)}">+ Add unit / block / episode</div>
      </div>
    </div>`;
}
function showDash(){
  DASH=true;
  const names=[...new Set([...prodNames(),...SOURCES.filter(s=>s.kind).map(s=>s.prod||s.title)])];
  // most people working in here have exactly one production — skip the list
  // and land straight on it, rather than making that the common extra click
  PROD_HOME=names.length===1?names[0]:null;
  $('#boardView').classList.add('hidden');$('#dashView').classList.remove('hidden');$('#colourPill').style.display='none';renderDash();renderSidebar();updateCrumbs();window.scrollTo(0,0);
}
function hideDash(){
  DASH=false;DASH_CALC=false;
  // hand the shared calculator view back to the board if the dashboard had it
  const vc=$('#viewCalc');
  if(vc&&vc.parentElement&&vc.parentElement.id==='dashCalcSlot'){$('#boardView').appendChild(vc);vc.classList.add('hidden');}
  $('#dashView').classList.add('hidden');$('#boardView').classList.remove('hidden');updateCrumbs();
}
// ---------- sidebar drawer ----------
function setSidebarCollapsed(on){
  $('#sidebar').classList.toggle('collapsed',on);
  $('#btnSidebar').classList.toggle('on',!on);
  store.set('crowdos-sidebar-collapsed',on?'1':'');
}
setSidebarCollapsed(store.get('crowdos-sidebar-collapsed')==='1');
$('#btnSidebar').addEventListener('click',()=>setSidebarCollapsed(!$('#sidebar').classList.contains('collapsed')));

$('#sideDash').addEventListener('click',()=>{DASH_CALC=false;showDash();});
$('#sideCalc').addEventListener('click',()=>{DASH_CALC=true;showDash();});
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
  logProdEvent(s.prod||s.title,'schedule','“'+revLabel(s)+'” reinstated as current revision for '+(s.unit||'Main')+' Unit');
  setStatus('“'+revLabel(s)+'” is now the current revision.');
}
let CURUNIT=null; // unit hint for "upload new revision into this unit"
document.addEventListener('click',e=>{
  if(e.target.closest('#dashNew')||e.target.closest('#sideNewProd')){openProdModal(null);return}
  const mc=e.target.closest('[data-makecurrent]');
  if(mc){e.stopPropagation();e.preventDefault();makeCurrent(+mc.dataset.makecurrent);return}
  const op=e.target.closest('[data-openprod]');
  if(op&&!e.target.closest('[data-prodedit]')){DASH_CALC=false;PROD_HOME=op.dataset.openprod;renderDash();return}
  const bp=e.target.closest('[data-backprod]');
  if(bp){PROD_HOME=null;renderDash();return}
  const tu=e.target.closest('[data-toggleunit]');
  if(tu){const k=tu.dataset.toggleunit;DASH_UNIT_CLOSED.has(k)?DASH_UNIT_CLOSED.delete(k):DASH_UNIT_CLOSED.add(k);renderDash();return}
  const orv=e.target.closest('[data-openrev]');
  if(orv&&!e.target.closest('[data-delsrc]')&&!e.target.closest('[data-makecurrent]')){setActive(+orv.dataset.openrev);return}
  const pe=e.target.closest('[data-prodedit]');
  if(pe){e.stopPropagation();e.preventDefault();openProdSettings(pe.dataset.prodedit);return}
  const pi=e.target.closest('[data-prodimport]');
  if(pi){e.stopPropagation();e.preventDefault();openAddChooser(pi.dataset.prodimport,pi.dataset.unit||null);return}
  const it=e.target.closest('[data-side]');
  if(it&&!e.target.closest('[data-delsrc]'))setActive(+it.dataset.side);
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
function saveFCROWS(){store.set('crowdos-fcrows',JSON.stringify(FCROWS))}

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
    // split the crowd rows into: unnamed SA (scene.sa integer), named SA,
    // Featured (named SA + supplementary fees), and SPACT (named or unnamed).
    // A row with no name is plain "N SA" / "N SPACT".
    if(e.chars){
      const rows=e.chars.filter(c=>c.count>0);
      s.sa=rows.filter(c=>c.tier!=='SPACT'&&!c.featured&&!c.name).reduce((a,c)=>a+(+c.count),0);
      s.saChars=rows.filter(c=>c.tier!=='SPACT'&&!c.featured&&c.name).map(c=>({name:c.name,count:+c.count}));
      s.featured=rows.filter(c=>c.tier!=='SPACT'&&c.featured&&c.name).map(c=>({name:c.name,count:+c.count}));
      s.spacts=rows.filter(c=>c.tier==='SPACT').map(c=>({name:c.name||'',count:+c.count}));
    }else{ // legacy SCED entries (pre-Characters-list)
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
    const chars=e.chars||[
      ...(s.sa?[{name:'',count:s.sa,tier:'SA',featured:false}]:[]),
      ...(s.saChars||[]).map(f=>({name:f.name,count:f.count,tier:'SA',featured:false})),
      ...(s.featured||[]).map(f=>({name:f.name,count:f.count,tier:'SA',featured:true})),
      ...(s.spacts||[]).map(f=>({name:f.name,count:f.count,tier:'SPACT',featured:false})),
    ];
    const row=(c,i)=>`<div class="reqrow" data-ri="${i}">
      <input data-rq="ccount" type="number" min="0" value="${+c.count||0}">
      <select data-rq="ctier"><option${c.tier!=='SPACT'?' selected':''}>SA</option><option${c.tier==='SPACT'?' selected':''}>SPACT</option></select>
      <input data-rq="cname" value="${esc(c.name||'')}" placeholder="Character / group (optional)">
      <label class="reqfeat ${c.tier==='SPACT'?'off':''}"><input type="checkbox" data-rq="cfeat" ${c.featured?'checked':''}> Featured</label>
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
      e.chars.push({name,count,tier,featured});
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
function rcaFieldHTML(f,v){
  if(f.options)return `<div class="rfield"><label>${esc(f.label)}</label><div class="inwrap"><select data-rcaf="${f.id}" style="width:100%;border:none;background:var(--panel2);color:var(--ink);padding:9px 10px;font-family:var(--mono);font-size:13px">${f.options.map(([val,lab])=>`<option value="${val}"${v===val?' selected':''}>${lab}</option>`).join('')}</select></div></div>`;
  return `<div class="rfield"><label>${esc(f.label)}</label><div class="inwrap"><span>${esc(f.unit)}</span><input data-rcaf="${f.id}" type="number" step="0.01" value="${esc(v)}"></div></div>`;
}
function renderRateAdmin(){
  const deptList=(d,i)=>{
    // built-in standards first (from the official rate documents — read-only),
    // then the user's custom cards
    const builtins=Object.keys(BUILTIN_CARDS[d.kind]).sort().map(n=>`<div class="prow" style="cursor:default">
        <span class="pname">${esc(n)}</span>
        <span class="pmeta">built-in standard — pick it in Production Settings</span>
        <span class="ptools"><span class="ps-src sched" style="cursor:default">STANDARD</span></span>
      </div>`).join('');
    const names=Object.keys(RATECARDS[d.kind]).sort();
    const rows=builtins+names.map(n=>`<div class="prow" data-rcaopen="${esc(n)}" data-rcakind="${d.kind}">
        <span class="pname">${esc(n)}</span>
        <span class="pmeta">${RATE_FIELDS.filter(f=>f.dept===d.kind).length} fields</span>
        <span class="ptools"><span data-rcadel="${esc(n)}" data-rcakind="${d.kind}" data-tip="Delete card">✕</span></span>
        <span class="prow-chev">›</span>
      </div>`).join('');
    return `<div class="dash-sub" style="margin:${i===0?'0':'22px'} 0 8px">${esc(d.label)} — standards: ${esc(d.defaults.replace(' (defaults)',''))}${d.otherStandards?' · '+esc(d.otherStandards):''}</div>
      <div class="prodlist">${rows||`<div style="color:var(--faint);font-size:11.5px;margin-bottom:8px">No custom ${esc(d.label)} cards yet — productions use ${esc(d.defaults)} until one is picked.</div>`}
      <button class="dash-card dash-new" data-rcanew="${d.kind}" style="margin-top:4px;min-height:52px">+ New ${esc(d.label)} card</button></div>`;
  };
  let form='';
  if(RCA_EDIT){
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
}
$('#rcaBody').addEventListener('click',e=>{
  const nw=e.target.closest('[data-rcanew]');
  if(nw){RCA_EDIT={kind:nw.dataset.rcanew,name:''};renderRateAdmin();return}
  if(e.target.closest('#rcaCancel')){RCA_EDIT=null;renderRateAdmin();return}
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
  m.innerHTML=items.map((it,i)=>it.sep?'<div class="ctxsep"></div>':`<button class="ctxitem${it.danger?' danger':''}" data-i="${i}">${esc(it.label)}</button>`).join('');
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
document.addEventListener('contextmenu',e=>{
  const stripEl=e.target.closest('.strip[data-dayid]');
  const dayEl=e.target.closest('.daycard[id^="day-"]');
  const prodEl=e.target.closest('[data-prodtoggle],[data-openprod]');
  if(stripEl){
    e.preventDefault();
    const dayId=stripEl.dataset.dayid,idx=+stripEl.dataset.sceneidx;
    const d=(MODEL.days||[]).find(x=>x.id===dayId);if(!d||!d.scenes[idx])return;
    openCtxMenu(e.clientX,e.clientY,[
      {label:'✎ Edit scene',onClick:()=>openSceneModal(dayId,idx)},
      {sep:true},
      {label:'🗑 Delete scene',danger:true,onClick:()=>{
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
    if(d.manual)items.push({sep:true},{label:'🗑 Delete day',danger:true,onClick:()=>deleteManualDayById(dayId)});
    openCtxMenu(e.clientX,e.clientY,items);
    return;
  }
  if(prodEl){
    e.preventDefault();
    const name=prodEl.dataset.prodtoggle||prodEl.dataset.openprod;
    if(!name)return;
    const hasCover=!!(PRODS[name]&&PRODS[name].info&&PRODS[name].info.cover);
    openCtxMenu(e.clientX,e.clientY,[
      {label:'✎ Production settings',onClick:()=>openProdSettings(name)},
      {label:'✏️ Rename',onClick:()=>{openProdSettings(name);const i=$('#psName');if(i){i.focus();i.select();}}},
      {label:'🖼 Set cover photo',onClick:()=>pickCoverPhoto(name)},
      ...(hasCover?[{label:'✕ Remove cover photo',onClick:()=>setCoverPhoto(name,null)}]:[]),
      {sep:true},
      {label:'🗑 Remove production',danger:true,onClick:()=>{
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
  if(DASH)renderDash();renderSidebar();
  setStatus(dataURL?'Cover photo set for '+name+'.':'Cover photo removed.');
}
$('#coverInput').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';
  if(!f||!COVER_TARGET)return;
  try{setCoverPhoto(COVER_TARGET,await photoToDataURL(f,720,0.82))}
  catch(err){setStatus(err.message)}
  COVER_TARGET=null;
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
const PS_SECTIONS=[['general','General'],['locations','Locations'],['info','Production info'],['cast','Cast list'],['rates','Rate cards'],['columns','Columns'],['history','History']];
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
function openProdSettings(name){
  PS_NAME=name;
  const p=ensureProd(name,{});
  const units=unitsOf(name);let revCount=0;for(const r of units.values())revCount+=r.length;
  $('#psCrumbs').innerHTML=`<b>${esc(name)}</b>`;
  $('#psMeta').textContent=units.size+' unit'+(units.size===1?'':'s')+' · '+revCount+' revision'+(revCount===1?'':'s');
  $('#psRail').innerHTML=PS_SECTIONS.map(([id,label],i)=>`<a data-sec="${id}" class="${i?'':'on'}">${label}</a>`).join('');
  const locs=collectLocations(name);
  const cast=collectCast(name);
  const people=(p.info&&p.info.people)||[{role:'Line producer'},{role:'Production manager'},{role:'Stunt coordinator'}];
  const cols={cast:true,stunts:true,crowd:true,...(p.columns||{})};
  const owner=(CLOUD.session&&CLOUD.session.user&&CLOUD.session.user.email)||'you';
  const events=EVENTS[name]||[];
  $('#psContent').innerHTML=`
    <div class="ps-sec" id="ps-sec-general"><h4>General</h4>
      <div class="why">Rename carefully — every schedule in the production follows.</div>
      <div class="ps-grid2">
        <div class="ps-field"><label>Production name</label><input id="psName" value="${esc(name)}"></div>
        <div class="ps-field"><label>Default schedule colour</label><select id="psColour">${Object.keys(THEMES).map(c=>`<option${(p.colour||'white')===c?' selected':''}>${c}</option>`).join('')}</select></div>
      </div>
      <div class="ps-toggle" style="margin-top:12px"><span class="tn">AI schedule reading</span><span class="td">Off = schedules are read only by the built-in parser — no schedule text is ever sent to an external AI service for this production</span><button class="ps-tgl${p.noAI?'':' on'}" id="psAI" aria-label="Toggle AI schedule reading"></button></div></div>
    <div class="ps-sec" id="ps-sec-locations"><h4>Locations</h4>
      <div class="why">Travel band per head per day: Cat A (TfL 1–3) or Cat B (studios &amp; beyond). Auto-detected from schedules — override when the guess is wrong and every day at that location re-costs.</div>
      <table class="ps-tbl"><thead><tr><th>Location</th><th>Source</th><th>Detected</th><th>Override</th><th>Used on</th><th></th></tr></thead>
      <tbody id="psLocBody">${locs.map(psLocRow).join('')}</tbody></table>
      <button class="ps-add" id="psAddLoc">+ Add location</button></div>
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
  $('#prodSettings').classList.add('open');
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
  const info={company:($('#psCompany').value||'').trim(),people,...(P.info&&P.info.cover?{cover:P.info.cover}:{})};
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
$('#psClose').addEventListener('click',()=>$('#prodSettings').classList.remove('open'));
$('#prodSettings').addEventListener('click',e=>{if(e.target.id==='prodSettings')$('#prodSettings').classList.remove('open')});

window.__crowdos={get SOURCES(){return SOURCES},get CDAY(){return CDAY},get ADJ(){return ADJ},get MODEL(){return MODEL},get CLOUD(){return CLOUD},get PENDING(){return PENDING_IMPORT},get GLOSSARY(){return GLOSSARY},get PRODS(){return PRODS},get EVENTS(){return EVENTS},mergeDetail,prepModel};

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
      if(rec.kind==='pdf'&&(rec.text||rec.aiModel)){
        const m=modelFrom(rec,rec.unit||'Main');
        addSource(m,rec.title,rec.short,false,{kind:'pdf',text:rec.text,unit:rec.unit||'Main',ns:'p:'+rec.title,prod:rec.prod,version:rec.version,schedDate:rec.schedDate,colour:rec.colour||undefined,format:rec.format,rateCard:rec.rateCard,current:rec.current,createdAt:rec.createdAt||undefined,aiModel:rec.aiModel||null,docKind:rec.docKind||null});
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
