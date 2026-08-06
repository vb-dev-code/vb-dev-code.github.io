// Shared app shell.
// IA matches the CURRENT product (May 2026): Home · [Arc Spaces] Projects,
// My Tasks · [Arc Graph] Assets, Brands, Audiences. The older Apr-2026 build
// used "Hub"/"Other" group labels and an "Arcs" item — superseded.

const IC = {
  home:  '<path d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1z"/>',
  proj:  '<path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h3l1.5 2h6.5A1.5 1.5 0 0 1 17 7.5v7A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5z"/>',
  tasks: '<path d="M5 3h7l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M7.5 12l1.8 1.8L13 10.2"/>',
  asset: '<rect x="3" y="4.5" width="14" height="11" rx="1.5"/><circle cx="7.5" cy="8.5" r="1.2"/><path d="M3.5 13.5 8 9.8l3 2.4 2.6-2 3 2.8"/>',
  brand: '<path d="M6 3.5h8l3 4-7 9-7-9z"/><path d="M3 7.5h14"/>',
  aud:   '<circle cx="8" cy="8" r="2.6"/><path d="M3.2 16c.5-2.5 2.5-4 4.8-4s4.3 1.5 4.8 4"/><circle cx="14.4" cy="8.6" r="1.9"/><path d="M13.4 12.2c2 .2 3.4 1.6 3.8 3.8"/>',
  tmpl:  '<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M3 8h14M8 8v8"/>',
  set:   '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.8v2M10 15.2v2M17.2 10h-2M4.8 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3 4.9 4.9"/>',
  flag:  '<path d="M5 3v14"/><path d="M5 4.2h9l-1.8 3L14 10.2H5z"/>',
};
const svg = (d, cls='') =>
  `<svg class="${cls}" width="20" height="20" viewBox="0 0 20 20" fill="none"
     stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const chev = `<svg class="chev" width="14" height="14" viewBox="0 0 20 20" fill="none"
  stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8l3 3 3-3"/></svg>`;
const updown = `<svg class="chev" width="14" height="14" viewBox="0 0 20 20" fill="none"
  stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8.5 10 5.5l3 3M7 11.5l3 3 3-3"/></svg>`;

// Every nav destination maps to a real page so the prototype is walkable.
const PAGES = {
  'Home':          '00-home.html',
  'Projects':      '10-projects.html',
  'My Tasks':      '11-my-tasks.html',
  'Assets':        '12-assets.html',
  'Brands':        '03-brand-foundations.html',
  'Audiences':     '13-audiences.html',
  'Templates':     '14-templates.html',
  'Settings':      null,
  'Feature Flags': '05-scope.html',
};

function navHTML(active) {
  const item = (label, icon, opts = {}) => {
    const href = PAGES[label] ? ` href="${PAGES[label]}"` : '';
    return `<a class="tf-navitem"${href}${active === label ? ' aria-current="page"' : ''}>
       <span class="ic">${svg(icon)}</span>${label}${opts.chev ? chev : ''}
     </a>`;
  };
  return `
  <nav class="tf-nav">
    <div class="tf-brandmark"><i>l</i> Typeface</div>

    <div class="tf-workspace">
      <div class="av">MT</div>
      <div class="who"><b>Marketing team</b><span>Meridian Athletics</span></div>
      ${updown}
    </div>

    <div class="tf-navsearch">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
        stroke-width="1.5" stroke-linecap="round"><circle cx="9" cy="9" r="5.2"/><path d="M13 13l3.4 3.4"/></svg>
      Search
    </div>

    ${item('Home', IC.home)}
    <div class="tf-navdiv"></div>

    <div class="tf-navgroup">Arc Spaces</div>
    ${item('Projects', IC.proj)}
    ${item('My Tasks', IC.tasks)}
    <div class="tf-navdiv"></div>

    <div class="tf-navgroup">Arc Graph</div>
    ${item('Assets', IC.asset)}
    ${item('Brands', IC.brand)}
    ${item('Audiences', IC.aud)}
    ${item('Templates', IC.tmpl)}
    <div class="tf-navdiv"></div>

    <div class="tf-navgroup">Other</div>
    ${item('Settings', IC.set, { chev: true })}
    ${item('Feature Flags', IC.flag)}

    <div class="tf-navfoot">
      <div class="tf-workspace" style="margin-bottom:0">
        <div class="av" style="background:#DCDCE4;color:#4A4A55">VB</div>
        <div class="who"><b>Varun Bhardwaj</b><span>varun@meridian.com</span></div>
        ${updown}
      </div>
      <button class="tf-invite">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
          stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="7.5" r="2.8"/><path d="M3.4 16c.4-2.6 2.4-4.2 4.6-4.2s4.2 1.6 4.6 4.2"/>
          <path d="M15.5 6.5v4M13.5 8.5h4"/></svg>
        Invite
      </button>
    </div>
  </nav>`;
}



// ---- Meridian mark ---------------------------------------------------------
// The tenant's actual logo, drawn once and reused everywhere it legitimately
// appears: the brand library, the asset list, and every composed artboard.
// Same file in the library = same file in the output, which is the point.
const MARK_SVG = `<svg viewBox="0 0 40 34" aria-hidden="true">
  <path class="peak-b" d="M21,31 L29,15 L37,31 Z"/>
  <path class="peak-a" d="M3,31 L15,7 L27,31 Z"/>
  <rect class="merid" x="1" y="23.4" width="38" height="2.4" rx="1.2"/>
</svg>`;
const markHTML = (cls='', label='Meridian') =>
  `<span class="mk ${cls}">${MARK_SVG}<span class="wm">${label}</span></span>`;

// Replace the plain word-logo in every artboard with the real lockup.
function fillMarks() {
  document.querySelectorAll('.ab-logo').forEach(el => {
    if (el.querySelector('svg')) return;
    const rev = getComputedStyle(el).color;
    const isLight = /^rgb\(2[0-9]{2}|^rgb\(25[0-5]/.test(rev);
    el.innerHTML = markHTML(isLight ? 'mk--rev' : '');
    el.style.display = 'flex';
  });
  document.querySelectorAll('[data-mark]').forEach(el => {
    if (el.querySelector('svg')) return;
    el.innerHTML = markHTML(el.dataset.mark, el.dataset.label || 'Meridian');
  });
}


// ---- approved product render ----------------------------------------------
// One definition, used by BOTH the Assets library and every composed artboard.
// That is the demonstration: the file the brand team approved is the file the
// agent composes with, not a lookalike.
const PRODUCT = (upper='var(--brand-primary)', mid='var(--brand-accent)', trim='var(--brand-support)') => `
  <ellipse cx="102" cy="80" rx="90" ry="4" fill="var(--brand-primary)" opacity=".13"/>
  <path fill="${upper}" d="M14,62 C17,50 28,43 46,40 L98,33 C110,31 121,27 129,20
    C133,16 139,17 140,23 C141,30 147,34 154,33 C162,32 167,25 170,18
    C173,13 181,15 184,23 C188,33 189,46 187,57 L15,64 Z"/>
  <path fill="var(--brand-paper)" d="M140,23 C142,30 148,34 155,33 C162,32 167,26 170,18
    C164,14 154,15 147,18 C143,20 140,21 140,23 Z"/>
  <path fill="${trim}" d="M14,62 C17,50 27,43 44,40 L54,61 Z"/>
  <path fill="${trim}" d="M60,58 C74,47 94,40 116,37 C122,36 126,38 127,41 C114,43 92,49 76,59 Z"/>
  <path fill="${trim}" d="M172,22 C178,20 183,25 185,33 C186,41 187,49 186,56 L174,57 C176,45 176,32 172,22 Z"/>
  <g stroke="var(--brand-paper)" stroke-width="2.4" stroke-linecap="round" opacity=".92">
    <path d="M74,45 L94,39"/><path d="M80,52 L101,45"/><path d="M87,59 L108,51"/></g>
  <path fill="${mid}" d="M12,62 C10,68 12,72 20,72 L184,70 C193,70 197,64 196,57 L187,56 L15,64 Z"/>
  <path fill="#14202E" d="M13,68 C13,73 17,76 25,76 L182,74 C190,74 195,71 196,66 L192,63 L14,70 Z"/>
  <g fill="var(--brand-paper)" opacity=".5">
    <rect x="40" y="70" width="3" height="5" rx="1.4"/><rect x="66" y="69.6" width="3" height="5" rx="1.4"/>
    <rect x="92" y="69.2" width="3" height="5" rx="1.4"/><rect x="118" y="68.8" width="3" height="5" rx="1.4"/>
    <rect x="144" y="68.4" width="3" height="5" rx="1.4"/><rect x="168" y="68" width="3" height="5" rx="1.4"/></g>`;

const COLORWAY = {
  navy: [],                                                  // asset.product.4421
  sand: ['#8A6A4F', 'var(--brand-support)', '#C9B49B'],      // asset.product.4422
};

// Asset-library tiles: <div data-product="navy">
function fillProducts() {
  document.querySelectorAll('[data-product]').forEach(el => {
    if (el.querySelector('svg')) return;
    const c = COLORWAY[el.dataset.product] || [];
    el.insertAdjacentHTML('beforeend',
      `<svg class="tf-assetart" viewBox="0 0 210 90" aria-hidden="true">${PRODUCT(...c)}</svg>`);
  });
}

// ---- composed image region -------------------------------------------------
// Every .ab-fill becomes a generated landscape with the approved Peak 2 render
// composited on top. Inline SVG keeps it vector, self-contained and themeable
// from --brand-* tokens, so a brand-kit swap re-skins the imagery too.
const SCENE = `
<svg viewBox="0 0 200 108" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="var(--brand-support)"/><stop offset="100%" stop-color="var(--brand-primary)"/>
  </linearGradient></defs>
  <rect width="200" height="108" fill="url(#sky)"/>
  <circle class="sun" cx="158" cy="22" r="10"/>
  <path class="ridge-far"  d="M0,46 L28,30 L50,42 L76,24 L102,44 L130,28 L158,46 L200,26 L200,108 L0,108 Z"/>
  <path class="ridge-mid"  d="M0,62 L32,46 L60,58 L90,40 L122,58 L152,46 L200,64 L200,108 L0,108 Z"/>
  <path class="haze"       d="M0,64 L200,58 L200,74 L0,78 Z"/>
  <path class="ridge-near" d="M0,78 L44,64 L86,76 L128,62 L172,78 L200,72 L200,108 L0,108 Z"/>
  <ellipse cx="100" cy="90" rx="62" ry="5" fill="#000" opacity=".18"/>
  <g transform="translate(28,27) scale(0.68)">${PRODUCT()}</g>
</svg>
<span class="genmark">background · generated</span>`;

function fillScenes() {
  document.querySelectorAll('.ab-fill').forEach(el => {
    if (el.dataset.plain === 'true' || el.querySelector('svg')) return;
    el.insertAdjacentHTML('beforeend', SCENE);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const b = document.body;
  const main = document.querySelector('main.tf-main');
  const app = document.createElement('div');
  app.className = 'tf-app' + (b.dataset.chrome === 'off' ? ' tf-app--nochrome' : '');
  app.innerHTML = navHTML(b.dataset.nav || 'Home');

  if (b.dataset.chrome !== 'off') {
    app.innerHTML += `
      <header class="tf-top">
        <h1>${b.dataset.title || ''}</h1>
        ${b.dataset.status || ''}
        <div class="spacer"></div>
        <button class="tf-btn tf-btn--sm">Optimize</button>
        <button class="tf-btn tf-btn--sm">Share</button>
        <button class="tf-btn tf-btn--sm tf-btn--primary">Publish</button>
      </header>`;
  }

  main.parentNode.insertBefore(app, main);
  app.appendChild(main);
  fillScenes();
  fillMarks();
  fillProducts();
});

/* ---------------------------------------------------------------------------
   Reviewer navigation v2. Always: a chip back to the index. With ?tour=N&s=M:
   a step bar that carries the marketer journey, where stops can have SCENES —
   in-page actions the reviewer performs as the marketer (a populated prompt, a
   progressive brief analysis, a pulsing control that advances the journey).
   Next advances scene-by-scene, then page-by-page; the highlighted in-page
   control does the same thing as Next, so acting like the user always works.
   --------------------------------------------------------------------------- */
const TOUR = [
  { page: '00-home.html', title: 'Start with a brief',
    scenes: [
      { hint: 'You arrive with one thing: an approved brief PDF from your CMO. No project exists yet. Click Next.' },
      { hint: 'Your ask and the brief are in the prompt. Click Go, or Next.', act: 'homePrompt' },
      { hint: 'The agent reads the brief and works out what this campaign is.', act: 'homeAnalysis' },
    ]},
  { page: '14-templates.html', title: 'Create the Arc',
    scenes: [ { hint: 'The Product Launch Arc is recommended from your brief. Click the highlighted card, or Next.', act: 'recoLaunch' } ]},
  { page: '20-arc-canvas.html', title: 'Your campaign home',
    scenes: [
      { hint: 'The agent proposes the channel plan. Approve it in the chat, or click the prompt bar and Go, or use ＋ Create.', act: 'arcPlan' },
      { hint: 'The agents compose — objects and layout only, nothing generated until the plan is approved. Watch the flyer.', act: 'arcRun' },
    ]},
  { page: '01-brief.html', title: 'The agent reads the brief',
    scenes: [ { hint: 'The PDF is parsed; only four fields are yours. Try ⚡ Apply recommended fixes: watch the requests resolve and legal approve the pre-order claim, then approve the plan at the bottom.' } ]},
  { page: '32-concept.html', title: 'The Campaign Visual Kit',
    scenes: [ { hint: 'The plan composed the layouts — locked objects are placed, open slots carry suggested prompts from your brand guidelines. Click a slot to edit its prompt and generate it, or use the pulsing Generate all. Then submit for approval, or Next.', act: 'ctaGenerateAll' } ]},
  { page: '35-edit.html', title: 'Edit without breaking',
    scenes: [ { hint: 'The agent turned \u201cmake the headline tighter\u201d into one operation. Click the pulsing Apply: only the headline changes, and only its rules re-check. Show diff and Undo work too. Next when done.', act: 'ctaApplyPatch' } ]},
  { page: '33-blocked.html', title: 'One format refuses',
    scenes: [ { hint: 'The flyer cannot fit the required disclosure at legal minimum size, so it stops. Pick the highlighted resolution, or Next.', act: 'ctaResolution' } ]},
  { page: '34-approve.html', title: 'Approve and ship',
    scenes: [
      { hint: 'Reviewers see only exceptions; the designer is skipped because no locked object changed. Approve the family, or Next.', act: 'ctaApprove' },
      { hint: 'Approved. Now deliver it: publish the kit via the connector, or Next.', act: 'approveDone' },
      { hint: 'Delivery is the finish line. Lineage travels with every asset, and only now does the set count toward the north star.', act: 'exportRun' },
    ]},
  { page: '05-scope.html', title: 'What you just walked',
    scenes: [ { hint: 'Your kit is shipped: brief to delivered assets, end to end. That was Phase 1 — and the es-US variant you could not ship yet is exactly what Phase 2, Data-Grounded Formats, adds.' } ]},
];

let _tourStep = 0, _tourScene = 0, _selfGuided = false;

function tourUrl(page, step, scene) {
  const k = _selfGuided ? 'walk' : 'tour';
  return `${page}?${k}=${step}` + (scene ? `&s=${scene}` : '');
}

function tourAdvance() {
  const stop = TOUR[_tourStep - 1];
  if (_tourScene < stop.scenes.length - 1) {
    _tourScene += 1;
    history.replaceState(null, '', tourUrl(stop.page, _tourStep, _tourScene));
    if (!_selfGuided) renderTourBar();
    runScene(stop.scenes[_tourScene]);
  } else if (_tourStep < TOUR.length) {
    location.href = tourUrl(TOUR[_tourStep].page, _tourStep + 1);
  } else {
    location.href = 'index.html';
  }
}

function runScene(scene) { if (scene.act && ACTS[scene.act]) ACTS[scene.act](); }

function renderTourBar() {
  const stop = TOUR[_tourStep - 1], scene = stop.scenes[_tourScene];
  let bar = document.querySelector('.tf-tourbar');
  if (!bar) { bar = document.createElement('div'); bar.className = 'tf-tourbar'; document.body.appendChild(bar); }
  const back = _tourStep > 1 ? `<a class="btn" href="${tourUrl(TOUR[_tourStep-2].page, _tourStep-1)}">← Back</a>` : '';
  const last = _tourStep === TOUR.length && _tourScene === stop.scenes.length - 1;
  if (!_selfGuided) try { localStorage.setItem('tfTourPos', JSON.stringify({ step: _tourStep, scene: _tourScene, page: stop.page })); } catch(e) {}
  bar.innerHTML = `
    <span class="n">TOUR ${_tourStep}/${TOUR.length}</span>
    <div class="txt"><b>${stop.title}</b><span>${scene.hint}</span></div>
    ${back}<a class="btn primary" href="#" id="tournext">${last ? 'Finish →' : 'Next →'}</a>
    <a class="exit" href="index.html" title="Exit tour">✕</a>`;
  document.getElementById('tournext').addEventListener('click', e => {
    e.preventDefault();
    if (last) { try { localStorage.removeItem('tfTourPos'); } catch(e) {} }
    tourAdvance();
  });
}

function lockNext() { const n = document.getElementById('tournext'); if (n) { n.style.opacity = .35; n.style.pointerEvents = 'none'; } }
function unlockNext() { const n = document.getElementById('tournext'); if (n) { n.style.opacity = ''; n.style.pointerEvents = ''; } }

let _toastEl, _toastT;
function toast(msg) {
  if (!_toastEl) { _toastEl = document.createElement('div'); _toastEl.className = 'tf-toast'; document.body.appendChild(_toastEl); }
  _toastEl.textContent = msg; _toastEl.classList.add('show');
  clearTimeout(_toastT); _toastT = setTimeout(() => _toastEl.classList.remove('show'), 1600);
}

function agentDock(html, chipText) {
  let d = document.querySelector('.tf-agentdock');
  if (d) d.remove();
  d = document.createElement('div');
  d.className = 'tf-agentdock';
  d.innerHTML = `<div class="hd">◆ Design Agent<button class="mini" title="Minimize chat">—</button></div>
    <div class="bd">${html}<br>
      <span class="tf-suggest">${chipText}</span>
      <div class="tf-reply"><input type="text" placeholder="Reply to the Design Agent…"><button disabled title="Send">↑</button></div>
    </div>`;
  document.body.appendChild(d);
  d.querySelector('.hd .mini').addEventListener('click', () => {
    d.style.display = 'none';
    let b = document.querySelector('.tf-dockbubble');
    if (!b) {
      b = document.createElement('button');
      b.className = 'tf-dockbubble'; b.title = 'Open Design Agent chat'; b.textContent = '💬';
      b.addEventListener('click', () => { d.style.display = ''; b.remove(); });
      document.body.appendChild(b);
    }
  });
  const input = d.querySelector('input'), send = d.querySelector('.tf-reply button');
  d.querySelector('.tf-suggest').addEventListener('click', () => { input.value = chipText.replace(' →',''); setTimeout(tourAdvance, 350); });
  input.addEventListener('input', () => { send.disabled = input.value.trim() === ''; });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && input.value.trim()) tourAdvance(); });
  send.addEventListener('click', () => { if (input.value.trim()) tourAdvance(); });
}

const ACTS = {
  homePrompt() {
    const p = document.querySelector('.tf-prompt');
    if (!p || p.querySelector('.tour-go')) return;
    const input = p.querySelector('input');
    input.value = 'I have an approved brief and want to create a campaign';
    p.classList.add('tour-open');
    const brk = document.createElement('span'); brk.className = 'tour-break';
    const attach = document.createElement('span');
    attach.className = 'tour-attach'; attach.textContent = '📎 spring-brief.pdf';
    const go = document.createElement('button');
    go.className = 'tour-go'; go.textContent = 'Go →';
    go.addEventListener('click', tourAdvance);
    p.appendChild(brk); p.appendChild(attach); p.appendChild(go);
  },
  homeAnalysis() {
    const p = document.querySelector('.tf-prompt');
    if (!p || document.querySelector('.tf-analysis')) return;
    lockNext();
    const go = p.querySelector('.tour-go'); if (go) go.remove();
    const card = document.createElement('div');
    card.className = 'tf-analysis';
    card.innerHTML = '<div class="hd">Design Agent · analyzing spring-brief.pdf</div>';
    const LINES = [
      'Reading <b>spring-brief.pdf</b> · 2 pages',
      'Extracting content: goal, message, CTA, due date',
      'This is a <b>product launch</b> for the <b>Meridian Peak 2</b>',
      'Matching claims to the registry · <b>claim.recycled.204</b> found',
      'Audiences resolved from the CDP · <b>Urban Athletes</b>',
      'Recommending Arc type: <b>Product Launch</b>',
    ];
    const els = LINES.map(html => {
      const ln = document.createElement('div'); ln.className = 'ln';
      ln.innerHTML = `<span class="st spin">◌</span><span>${html}</span>`;
      card.appendChild(ln); return ln;
    });
    const done = document.createElement('div');
    done.className = 'done'; done.textContent = '✓ Analysis complete';
    card.appendChild(done);

    // Agent proposal + reply composer, Claude-style: suggestion chip for one
    // click, or type anything and send. Both advance the journey.
    const msg = document.createElement('div');
    msg.className = 'agentmsg';
    msg.innerHTML = `This looks like a product launch for the <b>Peak 2</b>. I can create a
      <b>Product Launch Arc</b>, carry the brief in, and pull brand context from your connected
      sources. Want me to go ahead?
      <br><span class="suggest">Yes — create the Arc →</span>
      <div class="tf-reply">
        <input type="text" placeholder="Reply to the Design Agent…">
        <button disabled title="Send">↑</button>
      </div>`;
    card.appendChild(msg);
    const reply = msg.querySelector('.tf-reply input');
    const send = msg.querySelector('.tf-reply button');
    msg.querySelector('.suggest').addEventListener('click', () => {
      reply.value = 'Yes — create the Arc';
      setTimeout(tourAdvance, 350);
    });
    reply.addEventListener('input', () => { send.disabled = reply.value.trim() === ''; });
    reply.addEventListener('keydown', e => { if (e.key === 'Enter' && reply.value.trim()) tourAdvance(); });
    send.addEventListener('click', () => { if (reply.value.trim()) tourAdvance(); });

    p.insertAdjacentElement('afterend', card);
    els.forEach((ln, i) => setTimeout(() => {
      ln.classList.add('show');
      if (i > 0) { const prev = els[i-1].querySelector('.st'); prev.classList.remove('spin'); prev.textContent = '✓'; prev.style.color = 'var(--tf-ok)'; }
      if (i === els.length - 1) setTimeout(() => {
        const st = ln.querySelector('.st'); st.classList.remove('spin'); st.textContent = '✓'; st.style.color = 'var(--tf-ok)';
        done.classList.add('show'); msg.classList.add('show'); unlockNext();
      }, 600);
    }, 550 * (i + 1)));
  },
  recoLaunch() {
    const card = [...document.querySelectorAll('.tf-agentcard')].find(c => (c.querySelector('b')||{}).textContent === 'Product launch');
    if (!card || card.querySelector('.tf-recobadge')) return;
    card.classList.add('tf-tour-highlight');
    card.style.position = 'relative';
    const b = document.createElement('span');
    b.className = 'tf-recobadge'; b.textContent = 'Recommended from your brief';
    card.appendChild(b);
    card.addEventListener('click', tourAdvance);
  },

  arcPlan() {
    if (document.querySelector('.tf-agentdock')) return;
    // Three doors into composition: the agent dock, the prompt bar (starts
    // empty, fills on click, Go), and the Create menu.
    const comp = document.querySelector('.tf-composer');
    if (comp && !comp.dataset.armed) {
      comp.dataset.armed = '1';
      const ta = comp.querySelector('textarea');
      comp.dataset.orig = ta.value;
      ta.value = ''; ta.placeholder = 'Ask the Design Agent to plan this campaign…';
      const row = comp.querySelector('.row');
      row.querySelectorAll('.tf-chip').forEach(c => c.style.display = 'none');
      comp.style.cursor = 'pointer';
      comp.addEventListener('click', () => {
        if (_tourScene !== 0 || comp.dataset.filled) return;
        comp.dataset.filled = '1';
        ta.value = comp.dataset.orig;
        row.querySelectorAll('.tf-chip').forEach(c => c.style.display = '');
        const go = document.createElement('button');
        go.className = 'tf-btn tf-btn--sm tf-btn--primary'; go.textContent = 'Go →';
        go.setAttribute('data-wired', '');
        go.addEventListener('click', e => { e.stopPropagation(); tourAdvance(); });
        row.appendChild(go);
      });
      // Create ▾ menu
      const wrap = document.createElement('div');
      wrap.className = 'tf-createwrap';
      wrap.innerHTML = `<button class="tf-btn tf-btn--sm" data-wired id="createbtn">＋ Create ▾</button>
        <div class="tf-createmenu" id="createmenu">
          <button data-wired id="cm-generate">⚡ Generate template<span>compose the channel plan from your brief</span></button>
          <button data-wired id="cm-library">▤ Select from template library<span>start from a saved Arc template</span></button>
        </div>`;
      row.insertBefore(wrap, row.querySelector('.spacer').nextSibling);
      wrap.querySelector('#createbtn').addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('createmenu').classList.toggle('open');
      });
      wrap.querySelector('#cm-generate').addEventListener('click', e => {
        e.stopPropagation();
        if (_tourScene === 0) tourAdvance();
      });
      wrap.querySelector('#cm-library').addEventListener('click', e => {
        e.stopPropagation();
        location.href = tourUrl('14-templates.html', 2);
      });
      document.addEventListener('click', () => document.getElementById('createmenu')?.classList.remove('open'));
    }
    // blank the lanes: nothing has run yet
    document.querySelectorAll('.lane .tf-column').forEach(col => {
      const art = col.querySelector('.tf-candidate, .tf-card');
      if (art) { art.style.transition = 'opacity .45s ease'; art.style.opacity = '0'; }
      const st = col.querySelector('h3 .tf-status');
      if (st) { st.className = 'tf-status tf-status--idle'; st.textContent = 'Queued'; }
    });
    agentDock(
      `I read <b>spring-brief.pdf</b>. For this launch I recommend three channels:
       <b>Email</b> for awareness across 2 audiences, <b>Social + Banner</b> for paid,
       and a <b>Flyer</b> for retail partners. Approve the channel plan and I will run the agents.`,
      'Approve — run the agents →');
  },
  arcRun() {
    const dock = document.querySelector('.tf-agentdock');
    if (dock) dock.remove();
    const comp = document.querySelector('.tf-composer');
    if (comp) {
      const ta = comp.querySelector('textarea');
      if (comp.dataset.orig && !ta.value) ta.value = comp.dataset.orig;
      comp.querySelectorAll('.tf-chip').forEach(c => c.style.display = '');
      comp.style.cursor = '';
    }
    lockNext();
    const cols = [...document.querySelectorAll('.lane .tf-column')];
    const WIRE = slots => `<div class="tf-wire">${slots.map(x =>
      `<i class="${x === 'image region' ? 'img' : x === 'cta' ? 'cta' : ''}">${x}</i>`).join('')}</div>`;
    const reveal = (col, slots) => {
      const art = col.querySelector('.tf-candidate, .tf-card');
      const st = col.querySelector('h3 .tf-status');
      st.className = 'tf-status tf-status--composing'; st.textContent = 'Composing…';
      setTimeout(() => {
        if (art) { art.innerHTML = WIRE(slots); art.style.opacity = '1'; }
        st.className = 'tf-status tf-status--ok'; st.textContent = 'Composed';
      }, 850);
    };
    const steps = [
      () => reveal(cols[0], ['subject', 'headline', 'body copy', 'cta']),          // email · serious runners
      () => reveal(cols[1], ['subject', 'headline', 'body copy', 'cta']),          // email · urban athletes
      () => reveal(cols[2], ['logo', 'headline', 'image region', 'cta', 'legal']), // design · social
      () => reveal(cols[3], ['logo', 'headline', 'image region', 'cta', 'legal']), // design · banner
      () => {                                                        // design · flyer fails
        const col = cols[4];
        const st = col.querySelector('h3 .tf-status');
        st.className = 'tf-status tf-status--composing'; st.textContent = 'Composing…';
        setTimeout(() => {
          st.className = 'tf-status tf-status--risk'; st.textContent = '⚠ Needs attention';
          const card = col.querySelector('.tf-card');
          card.outerHTML = `<div class="tf-flyerwarn" style="opacity:0;transition:opacity .45s ease">
            <span class="w">⚠</span>
            <b>Flyer could not be composed</b>
            <span>The required recycled-materials disclosure can't fit at its minimum legible size.</span>
            <button class="tf-btn tf-btn--sm tf-btn--primary tf-tour-highlight" id="flyercta">Review in Design Agent brief</button>
          </div>`;
          requestAnimationFrame(() => { col.querySelector('.tf-flyerwarn').style.opacity = '1'; });
          document.getElementById('flyercta').addEventListener('click', tourAdvance);
          col.scrollIntoView({ block: 'center', behavior: 'smooth' });
          agentDock(
            `Email, social and banner are <b>composed as layouts</b> — objects and structure only.
             Nothing renders until you approve the plan. And composition caught a problem on the
             <b>flyer</b>: the required disclosure can't fit at minimum size alongside the locked
             product render. Open the Design Agent brief to review.`,
            'Open the Design Agent brief →');
          unlockNext();
        }, 1100);
      },
    ];
    steps.forEach((fn, i) => setTimeout(fn, 400 + i * 1150));
  },
  ctaGenerateAll() {
    const b = document.getElementById('genall');
    if (b && !b.disabled) b.classList.add('tf-tour-highlight');
  },
  ctaApplyPatch() {
    const b = document.getElementById('applypatch');
    if (b) b.classList.add('tf-tour-highlight');
  },
  ctaEditHeadline() {
    const a = document.getElementById('editheadline');
    if (a) a.classList.add('tf-tour-highlight');
  },
  ctaResolution() {
    const b = [...document.querySelectorAll('.res button')][0];
    if (!b) return;
    b.classList.add('tf-tour-highlight');
    b.addEventListener('click', () => {
      b.classList.remove('tf-tour-highlight');
      b.disabled = true; b.innerHTML = 'Repairing…';
      setTimeout(() => {
        b.innerHTML = '✓ Hero scaled to 92% · disclosure fits · flyer clears 18/18';
        b.style.color = 'var(--tf-ok)';
        setTimeout(tourAdvance, 1100);
      }, 900);
    });
  },
  ctaApprove() {
    if (sessionStorage.getItem('tfGenerated') !== '1') return;  // incomplete kit: the warning owns this page
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Approve family');
    if (!b) return;
    b.classList.add('tf-tour-highlight');
    b.addEventListener('click', tourAdvance);
  },
  approveDone() {
    // the approval visibly lands, then the highlight moves to delivery
    const b = [...document.querySelectorAll('button')].find(x => ['Approve family','✓ Approved'].includes(x.textContent.trim()));
    if (b) { b.classList.remove('tf-tour-highlight'); b.disabled = true; b.textContent = '✓ Approved'; }
    const row = [...document.querySelectorAll('.rev')].find(r => r.textContent.includes('Channel owner'));
    if (row) { const st = row.querySelector('.tf-status'); st.className = 'tf-status tf-status--ok'; st.textContent = 'Approved'; }
    const li = [...document.querySelectorAll('li')].find(x => x.textContent.includes('Required reviewer approved'));
    if (li) { const st = li.querySelector('.tf-status'); st.className = 'tf-status tf-status--ok'; st.textContent = '✓'; }
    const pub = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Publish via connector');
    if (pub && !pub.disabled) {
      pub.classList.add('tf-tour-highlight');
      pub.addEventListener('click', tourAdvance);
      pub.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  },
  exportRun() {
    lockNext();
    const pub = [...document.querySelectorAll('button')].find(x => ['Publish via connector','Publishing…'].includes(x.textContent.trim()));
    if (pub) { pub.classList.remove('tf-tour-highlight'); pub.disabled = true; pub.textContent = 'Publishing…'; }
    const bar = document.querySelector('.tf-publishbar');
    if (!bar || document.querySelector('.tf-analysis')) return;
    const card = document.createElement('div');
    card.className = 'tf-analysis'; card.style.margin = '14px 0 0'; card.style.maxWidth = 'none';
    card.innerHTML = '<div class="hd">Design Agent · delivering</div>';
    const LINES = [
      'Rendering final assets · <b>social</b> 1080×1080 PNG',
      '<b>banner</b> 1200×628 PNG',
      '<b>flyer</b> PDF/X, print-ready',
      'Lineage attached · brief_31C · plan job_72A · <b>meridian@3.8.0</b> · pinned model versions',
      'Delivered to <b>approved-launch-assets</b> via connector',
      '✓ Counted toward the north star: <b>1 approved design set shipped</b>',
    ];
    const els = LINES.map(html => {
      const ln = document.createElement('div'); ln.className = 'ln';
      ln.innerHTML = `<span class="st spin">◌</span><span>${html}</span>`;
      card.appendChild(ln); return ln;
    });
    bar.insertAdjacentElement('afterend', card);
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    els.forEach((ln, i) => setTimeout(() => {
      ln.classList.add('show');
      if (i > 0) { const prev = els[i-1].querySelector('.st'); prev.classList.remove('spin'); prev.textContent = '✓'; prev.style.color = 'var(--tf-ok)'; }
      if (i === els.length - 1) setTimeout(() => {
        const st = ln.querySelector('.st'); st.classList.remove('spin'); st.textContent = '✓'; st.style.color = 'var(--tf-ok)';
        if (pub) pub.textContent = '✓ Published';
        const li = [...document.querySelectorAll('li')].find(x => x.textContent.includes('asset exported'));
        if (li) { const s = li.querySelector('.tf-status'); s.className = 'tf-status tf-status--ok'; s.textContent = '✓ Delivered'; }
        agentDock(
          `All three formats are delivered with lineage attached, and the set now counts toward the
           north star. Ask me where anything came from — <b>Delivered assets · lineage</b>, below the
           export bar, walks every asset and object back to its system of record.`,
          'Continue →');
        unlockNext();
      }, 550);
    }, 480 * (i + 1)));
  },
};

function initTourChrome() {
  const params = new URLSearchParams(location.search);
  const tourStep = parseInt(params.get('tour'), 10);
  const walkStep = parseInt(params.get('walk'), 10);
  const step = tourStep || walkStep;
  const valid = step >= 1 && step <= TOUR.length;
  _selfGuided = !tourStep && !!walkStep;

  if (!valid) {
    const chip = document.createElement('a');
    chip.className = 'tf-protochip';
    chip.href = 'index.html';
    chip.textContent = '⌂ prototype index';
    document.body.appendChild(chip);
    // The journey is self-startable: clicking the home prompt begins the
    // same simulation without the tour narration.
    const prompt = document.querySelector('.tf-prompt');
    if (prompt && location.pathname.endsWith('00-home.html')) {
      prompt.style.cursor = 'pointer';
      prompt.title = 'Try it — start from an approved brief';
      prompt.addEventListener('click', () => { location.href = '00-home.html?walk=1&s=1'; });
    }
    return;
  }

  _tourStep = step;
  _tourScene = Math.min(parseInt(params.get('s'), 10) || 0, TOUR[step-1].scenes.length - 1);
  // A fresh journey starts clean: landing on step 1 resets the simulation
  // (generated content, carried resolutions). Mid-journey state survives.
  if (step === 1) {
    try { ['tfGenerated', 'tfV_srcs', 'tfV_checks', 'tfPublished', 'tfMissing'].forEach(k => sessionStorage.removeItem(k)); } catch(e) {}
  }
  if (_selfGuided) {
    const chip = document.createElement('a');
    chip.className = 'tf-protochip';
    chip.href = 'index.html';
    chip.textContent = '⌂ exit walkthrough';
    document.body.appendChild(chip);
  } else {
    document.body.classList.add('tour-active');
    renderTourBar();
  }
  // replay scenes up to the current one so a mid-scene refresh reconstructs state
  for (let i = 0; i <= _tourScene; i++) runScene(TOUR[step-1].scenes[i]);

  const d = document.querySelector('details.tf-drill');
  if (d && location.pathname.endsWith('05-scope.html')) d.open = true;

  // At the journey's very first beat the prompt itself is the control:
  // clicking it fills the ask and attaches the brief, same as Next.
  if (_tourStep === 1 && _tourScene === 0) {
    const prompt = document.querySelector('.tf-prompt');
    if (prompt) {
      prompt.style.cursor = 'pointer';
      prompt.title = 'Try it — start from an approved brief';
      prompt.addEventListener('click', () => tourAdvance(), { once: true });
    }
  }

  // The page's own CTAs must never strand the reviewer: any link to a page
  // that is a tour stop re-enters the tour at that stop. index.html exits.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || !a.href.includes('.html') || a.closest('.tf-tourbar')) return;
    const file = a.getAttribute('href').split('?')[0].split('#')[0];
    if (file === 'index.html' || file.startsWith('http')) return;
    const idx = TOUR.findIndex(s => s.page === file);
    if (idx === -1) return;
    e.preventDefault();
    location.href = tourUrl(file, idx + 1);
  }, true);
}
document.addEventListener('DOMContentLoaded', () => {
  // Dead-control feedback: anything that looks clickable but isn't wired says so.
  document.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.closest('.tf-tourbar, .tf-agentdock, .tf-reply, .tf-scoretabs, #objpanel, .tf-analysis')) return;
    if (btn.id === 'tournext' || btn.id === 'fixall' || btn.id === 'flyercta') return;
    if (btn.dataset.fix || btn.dataset.pick || btn.dataset.wired !== undefined) return;
    if (btn.classList.contains('tour-go') || btn.classList.contains('tf-tour-highlight')) return;
    toast('Not wired in this prototype — the guided tour path is fully interactive');
  });
});
document.addEventListener('DOMContentLoaded', initTourChrome);
