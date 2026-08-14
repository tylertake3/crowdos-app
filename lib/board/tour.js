// ============================================================================
// First-run guided tour.
//
// Someone opening Laural for the first time sees a dense board and nine tabs
// with no idea which one holds the money. This walks them round it: a welcome
// card, then a spotlight that moves from control to control with a short
// plain-English note on each.
//
// Two tours: `welcome` (the dashboard and the sidebar, shown once on first
// load) and `board` (the tabs, shown once the first time a production is
// actually opened — explaining tabs before there's a board on screen is
// useless). Each remembers it has been seen in localStorage, and the "?"
// button in the sidebar footer replays whichever one fits where you are.
//
// Deliberately self-contained: no imports from app.js, no shared state. It
// only ever reads the DOM by id/selector and never clicks anything for you.
// Steps whose target is missing or hidden (crowd-only tabs in stunt mode, the
// sidebar on a phone) are skipped rather than pointing at nothing.
// ============================================================================

const MEM = {};
const store = {
  get(k){ try { return window.localStorage.getItem(k) } catch(e) { return MEM[k] ?? null } },
  set(k,v){ try { window.localStorage.setItem(k,v) } catch(e) { MEM[k] = v } }
};

const txt = el => (el && el.textContent || '').trim();
const boardOnScreen = () => {
  const b = document.querySelector('#boardView');
  return !!b && !b.classList.contains('hidden');
};

// ---------- the tours ----------
// title/body may be functions so labels that change with the app mode
// (Stunt/Crowd) read the live button rather than a stale guess.
const TOURS = {
  welcome: {
    key: 'crowdos-tour-welcome-v1',
    intro: {
      title: 'Welcome to Laural',
      body: 'Laural turns a shooting schedule into a day-by-day board with your crowd and stunt costs already worked out. Here is a quick look round — about a minute.',
      go: 'Show me around',
      skip: 'Not now'
    },
    steps: [
      { el:'#sideDash', place:'right', title:'Your dashboard',
        body:'Home base. Every production you are working on sits here, along with today’s date, the weather and your next shoot day.' },
      // only on a fresh account — skipped automatically once there's work here
      { el:'#efAdd', place:'bottom', title:'Start here',
        body:'This is the one thing to do first. Upload a shooting schedule as a PDF and Laural builds the whole board from it — or set the days up by hand if the schedule hasn’t landed yet.' },
      { el:'#sideDemo', place:'right', title:'A sample schedule to play with',
        body:'A real-shaped schedule is already loaded. Click into it and press things — nothing here is yours, so you cannot break anything.' },
      { el:'#btnAdd', place:'bottom', title:'Add your own schedule',
        body:'Drop in a shooting schedule or call sheet as a PDF. Laural reads it and builds the board for you — scenes, days, cast numbers and locations.' },
      { el:'#modeBar', place:'bottom', title:'Stunts or crowd',
        body:'Switch between the two departments. The board, the costs and the tabs all change to match whichever one you are working in.' },
      { el:'#sideCalc', place:'right', title:'Quick calculator',
        body:'Day rates, overtime, night work and travel worked out on the spot — no need to open a production first.' },
      { el:'#sideBriefsNav', place:'right', title:'Casting briefs',
        body:'Write the brief you send to the agency — numbers, ages, wardrobe, dates — and keep it attached to the production.' },
      { el:'#btnAccount', place:'bottom', title:'Sign in to sync',
        body:'Sign in and your productions follow you between the office, your laptop and set. Without it, everything stays on this device only.' },
      { el:'#sideHelp', place:'top', title:'Lost? Start here',
        body:'The question mark brings this tour back whenever you want it.' }
    ],
    // what comes next depends on whether there's a board on screen to hand
    // over to — promising a board tour to an empty account is a broken promise
    outro: {
      title: 'That’s the tour',
      body: () => boardOnScreen()
        ? 'Next, a quick run through the board itself — the tabs across the top and what each one gives you.'
        : 'Add your first schedule when you are ready. The board gets its own short tour the moment you open one.',
      go: () => boardOnScreen() ? 'Show me the board' : 'Got it'
    }
  },

  board: {
    key: 'crowdos-tour-board-v1',
    intro: {
      title: 'This is the board',
      body: 'A schedule is open. These tabs are the different ways of looking at it — here is what each one is for.',
      go: 'Walk me through it',
      skip: 'Not now'
    },
    steps: [
      { el:'.tabs button[data-view="days"]', place:'bottom', title:'Day board',
        body:'Every shoot day in order — scenes, cast, locations and what the day costs. Click any day to open it up and edit it.' },
      { el:'.tabs button[data-view="cal"]', place:'bottom', title:'Calendar',
        body:'The same schedule laid out as a month or a week. Best for spotting gaps, clashes and how the weeks fall.' },
      { el:'#tabBreakdown', place:'bottom', title: el => txt(el) || 'Cost breakdown',
        body:'The money, in full. Every performer, every day, with basic rates, overtime, night work and travel all added up.' },
      { el:'#tabCrowd', place:'bottom', title: el => txt(el) || 'By day',
        body:'The same people grouped a different way, so you can see who is needed on which day at a glance.' },
      { el:'#tabCbDoc', place:'bottom', title:'Crowd breakdown',
        body:'A tidy document version of the crowd numbers — the one you hand to production.' },
      { el:'#tabBriefs', place:'bottom', title:'Briefs',
        body:'The casting briefs for this production, ready to send to the agency.' },
      { el:'#tabDoods', place:'bottom', title:'Doods',
        body:'Day-out-of-days: who works which day across the whole shoot, in one grid.' },
      { el:'#tabCalc', place:'bottom', title:'Calculator',
        body:'Scratch maths for a single day or performer, without touching the schedule.' },
      { el:'.tabs button[data-view="cast"]', place:'bottom', title:'Cast list',
        body:'Everyone in the schedule with their character numbers — useful when the schedule uses numbers and you need names.' },
      { el:'#search', place:'bottom', title:'Search and jump',
        body:'Find a day, a scene or a character in seconds. The drop-down beside it jumps straight to a shoot day.' },
      { el:'#expBar', place:'left', title:'Export it',
        body:'Send any view out as a PDF, a spreadsheet or a CSV — whatever the production office asks for.' },
      { el:'#ratesBar', place:'bottom', title:'Rate card',
        body:'The rates every figure on this board is built from. Change one here and the whole board recalculates.' },
      { el:'#sideSettings', place:'top', title:'Production settings',
        body:'Rates, locations and cast for this production. The pencil marks you will see on the board mean a figure was set by hand.' }
    ],
    outro: {
      title: 'You are set',
      body: 'Anything with a pencil on it has been edited by hand. Hover anything you are unsure of — most things explain themselves.',
      go: 'Done'
    }
  }
};

// ---------- runtime ----------
let root = null, scrim = null, hole = null, pop = null;
let active = null;      // {tour, steps, i}
let raf = 0, lastKey = '';
let onEnd = null;

function ensureDom(){
  if (root) return;
  root = document.createElement('div');
  root.id = 'tourRoot';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="tour-scrim" id="tourScrim"></div>
    <div class="tour-hole" id="tourHole" aria-hidden="true"></div>
    <div class="tour-pop" id="tourPop" role="dialog" aria-modal="true" aria-live="polite"></div>`;
  document.body.appendChild(root);
  scrim = root.querySelector('#tourScrim');
  hole  = root.querySelector('#tourHole');
  pop   = root.querySelector('#tourPop');

  root.addEventListener('click', e => {
    const b = e.target.closest('[data-tour-act]');
    if (b) { act(b.dataset.tourAct); return }
    if (e.target === scrim) act('next');   // tapping the dimmed area moves on
  });
  document.addEventListener('keydown', e => {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); act('skip') }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); act('next') }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); act('back') }
  });
}

const visible = el => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 4 && r.height > 4;
};

function act(a){
  if (!active) return;
  if (a === 'skip') { finish(true, false); return }
  if (a === 'back') { if (active.i > 0) { active.i--; render() } return }
  // next
  if (active.i >= active.steps.length - 1) { finish(true, true); return }
  active.i++; render();
}

// `seen` marks the tour as done with (skipping counts — nobody wants it back
// uninvited); `completed` says they actually reached the end, which is what
// decides whether the follow-on tour is offered.
function finish(seen, completed){
  if (!active) return;
  if (seen) store.set(active.tour.key, '1');
  const cb = onEnd; onEnd = null;
  active = null;
  cancelAnimationFrame(raf); raf = 0; lastKey = '';
  if (root) root.classList.add('hidden');
  document.body.classList.remove('tour-on');
  if (cb) try { cb(!!completed) } catch(e) {}
}

// The spotlight has to survive the page scrolling and the window resizing
// underneath it, so the hole re-measures on a frame loop and only writes to
// the DOM when the numbers actually change.
function track(){
  raf = requestAnimationFrame(track);
  if (!active) return;
  const s = active.steps[active.i];
  if (!s || !s.el) return;
  const el = document.querySelector(s.el);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const key = [r.top|0, r.left|0, r.width|0, r.height|0].join(',');
  if (key === lastKey) return;
  lastKey = key;
  placeHole(r);
  placePop(r, s.place);
}

function placeHole(r){
  const pad = 6;
  hole.style.display = 'block';
  hole.style.top    = (r.top - pad) + 'px';
  hole.style.left   = (r.left - pad) + 'px';
  hole.style.width  = (r.width + pad*2) + 'px';
  hole.style.height = (r.height + pad*2) + 'px';
}

function placePop(r, place){
  const gap = 14;
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;

  // narrow screens: the card is a bottom sheet, the spotlight does the pointing
  if (vw <= 720) {
    pop.classList.add('sheet');
    pop.style.left = ''; pop.style.top = '';
    return;
  }
  pop.classList.remove('sheet');

  let top, left;
  const fits = {
    bottom: r.bottom + gap + ph < vh - 8,
    top:    r.top - gap - ph > 8,
    right:  r.right + gap + pw < vw - 8,
    left:   r.left - gap - pw > 8
  };
  const order = [place, 'bottom', 'top', 'right', 'left'].filter(Boolean);
  const side = order.find(p => fits[p]) || 'bottom';

  if (side === 'bottom' || side === 'top') {
    top  = side === 'bottom' ? r.bottom + gap : r.top - gap - ph;
    left = r.left + r.width/2 - pw/2;
  } else {
    left = side === 'right' ? r.right + gap : r.left - gap - pw;
    top  = r.top + r.height/2 - ph/2;
  }
  pop.style.left = Math.max(10, Math.min(left, vw - pw - 10)) + 'px';
  pop.style.top  = Math.max(10, Math.min(top,  vh - ph - 10)) + 'px';
  pop.dataset.side = side;
}

function render(){
  const s = active.steps[active.i];
  const n = active.steps.length;
  const isCard = !s.el;                       // intro / outro sit in the middle
  const el = s.el ? document.querySelector(s.el) : null;

  const val = v => typeof v === 'function' ? v(el) : v;
  // the dots track the pointed-at steps only — the welcome and sign-off cards
  // aren't steps, so counting them would contradict the "step 3 of 9" line
  const first = active.tour.intro ? 1 : 0;
  const last  = active.tour.outro ? n - 2 : n - 1;
  let dots = '';
  for (let k = first; k <= last; k++) dots += `<i class="${k === active.i ? 'on' : ''}"></i>`;

  pop.className = 'tour-pop' + (isCard ? ' card' : '');
  pop.innerHTML = `
    ${isCard ? '' : `<div class="tour-count">Step ${active.i - first + 1} of ${last - first + 1}</div>`}
    <h4>${val(s.title)}</h4>
    <p>${val(s.body)}</p>
    <div class="tour-acts">
      ${s.skip ? `<button class="tour-ghost" data-tour-act="skip">${val(s.skip)}</button>` : ''}
      ${!isCard ? `<button class="tour-ghost" data-tour-act="skip">Skip tour</button>` : ''}
      <span class="tour-grow"></span>
      ${(!isCard && active.i > 0) ? `<button class="tour-back" data-tour-act="back">Back</button>` : ''}
      <button class="tour-next" data-tour-act="next">${val(s.go) || (active.i >= n-1 ? 'Done' : 'Next')}</button>
    </div>
    ${isCard ? '' : `<div class="tour-dots">${dots}</div>`}`;

  // with nothing spotlit there's no hole casting the dim, so the scrim does it
  scrim.classList.toggle('dim', isCard);

  if (isCard) {
    hole.style.display = 'none';
    pop.classList.remove('sheet');
    pop.style.left = ''; pop.style.top = '';
    lastKey = '';
  } else if (el) {
    const r0 = el.getBoundingClientRect();
    if (r0.top < 80 || r0.bottom > window.innerHeight - 80) {
      try { el.scrollIntoView({ block:'center', behavior:'smooth' }) } catch(e) { el.scrollIntoView() }
    }
    lastKey = '';
    const r = el.getBoundingClientRect();
    placeHole(r); placePop(r, s.place);
  }
  const nx = pop.querySelector('.tour-next');
  if (nx) nx.focus();
}

// ---------- public ----------
export function tourSeen(id){
  const t = TOURS[id];
  return !!(t && store.get(t.key));
}

export function startTour(id, done){
  const t = TOURS[id];
  if (!t) return false;
  ensureDom();
  if (active) finish(false, false);

  // only the steps whose target is actually on screen right now
  const steps = t.steps.filter(s => !s.el || visible(document.querySelector(s.el)));
  const seq = [];
  if (t.intro) seq.push({ ...t.intro, intro:true });
  seq.push(...steps);
  if (t.outro) seq.push({ ...t.outro, outro:true });
  if (!steps.length) return false;

  active = { tour:t, steps:seq, i:0 };
  onEnd = done || null;
  root.classList.remove('hidden');
  document.body.classList.add('tour-on');
  render();
  if (!raf) raf = requestAnimationFrame(track);
  return true;
}

// Start only if this tour has never been finished or skipped before.
export function maybeStartTour(id, done){
  if (tourSeen(id)) return false;
  return startTour(id, done);
}

export function tourActive(){ return !!active }
export function stopTour(){ finish(false, false) }
