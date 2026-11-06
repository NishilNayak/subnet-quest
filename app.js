/*!
 * Subnet Quest: learn IPv4 addressing and subnetting by playing.
 * Made by Nishil Nayak using Claude (Anthropic's AI assistant).
 * LinkedIn: https://www.linkedin.com/in/nishil-nayak
 *
 * A static site with no build step and no server. Player progress is
 * stored only in the player's own browser (localStorage).
 */
'use strict';

/* =========================================================
   Helpers
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const fmt = n => Number(n).toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"]/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;'
}[c]));

/* =========================================================
   IPv4 math
   ========================================================= */
const IP = {
  toInt(s) {
    const p = String(s).trim().split('.');
    if (p.length !== 4) return null;
    let n = 0;
    for (const x of p) {
      if (!/^\d{1,3}$/.test(x)) return null;
      const v = Number(x);
      if (v > 255) return null;
      n = n * 256 + v;
    }
    return n;
  },
  toStr(n) {
    n = n >>> 0;
    return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  },
  octets(n) {
    n = n >>> 0;
    return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  },
  mask(c) {
    return c === 0 ? 0 : (0xFFFFFFFF << (32 - c)) >>> 0;
  },
  wildcard(c) {
    return (~IP.mask(c)) >>> 0;
  },
  net(ip, c) {
    return (ip & IP.mask(c)) >>> 0;
  },
  bcast(ip, c) {
    return (IP.net(ip, c) | IP.wildcard(c)) >>> 0;
  },
  hosts(c) {
    if (c === 32) return 1;
    if (c === 31) return 2;
    return Math.pow(2, 32 - c) - 2;
  },
  bin8(v) {
    return v.toString(2).padStart(8, '0');
  },
  bin32(n) {
    return (n >>> 0).toString(2).padStart(32, '0');
  },
  binDots(n) {
    return IP.octets(n).map(IP.bin8).join('.');
  },
  maskToCidr(m) {
    const b = IP.bin32(m);
    if (!/^1*0*$/.test(b)) return null;
    const i = b.indexOf('0');
    return i === -1 ? 32 : i;
  },
  classify(n) {
    const [a, b] = IP.octets(n);
    if (a === 127) return 'Loopback';
    if (a === 169 && b === 254) return 'Link-local (APIPA)';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'Private';
    if (a >= 224 && a <= 239) return 'Multicast';
    if (a === 0 || a >= 240) return 'Reserved';
    return 'Public';
  },
  klass(a) {
    if (a < 128) return 'A';
    if (a < 192) return 'B';
    if (a < 224) return 'C';
    if (a < 240) return 'D';
    return 'E';
  }
};

/* Place values of the 8 bits in an octet, left to right */
const PV = [128, 64, 32, 16, 8, 4, 2, 1];

/* A labelled row of 32 bit-cells, coloured network (first c) vs host */
function bitLine(label, n, c) {
  const b = IP.bin32(n);
  let oct = '';
  for (let o = 0; o < 4; o++) {
    let cells = '';
    for (let k = 0; k < 8; k++) {
      const i = o * 8 + k;
      cells += `<span class="bit ${i < c ? 'n' : 'h'}">${b[i]}</span>`;
    }
    oct += `<div class="octet">${cells}</div>`;
  }
  return `<div class="bitline"><span class="lbl">${label}</span><span class="val">${IP.toStr(n)}</span><div class="octets">${oct}</div></div>`;
}

/* Colour a dotted binary string: first c bits network, rest host */
function binColored(n, c) {
  const b = IP.bin32(n);
  let out = '';
  for (let i = 0; i < 32; i++) {
    if (i > 0 && i % 8 === 0) out += '<span class="dim">.</span>';
    out += i < c ? `<span style="color:var(--net)">${b[i]}</span>` : `<span style="color:var(--host)">${b[i]}</span>`;
  }
  return `<span class="binline">${out}</span>`;
}

/* =========================================================
   Persistence (localStorage, safely)
   ========================================================= */
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('sq_' + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('sq_' + k, JSON.stringify(v));
    } catch {
      /* ignore */ }
  }
};

const BEST_KEYS = ['blitz', 'mask', 'classes', 'detective', 'same', 'solver'];

/* Saved data can be edited by anyone with dev tools, so never trust it:
   keep only known keys, whole non-negative numbers and short id strings. */
function cleanProfile(raw) {
  const p = {
    xp: 0,
    badges: [],
    lessons: [],
    best: {},
    bestStreak: 0,
    correct: 0
  };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return p;
  const num = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 1e9) : 0);
  const ids = v => (Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string' && /^[a-z0-9]{1,20}$/.test(x)))].slice(0, 50) : []);
  p.xp = num(raw.xp);
  p.bestStreak = num(raw.bestStreak);
  p.correct = num(raw.correct);
  p.badges = ids(raw.badges);
  p.lessons = ids(raw.lessons);
  if (raw.best && typeof raw.best === 'object') {
    for (const k of BEST_KEYS)
      if (raw.best[k] !== undefined) p.best[k] = num(raw.best[k]);
  }
  return p;
}
let profile = cleanProfile(store.get('profile', {}));
let streak = 0;
const save = () => store.set('profile', profile);

/* =========================================================
   XP, levels, streaks, badges
   ========================================================= */
const LEVEL_XP = 150;
const RANKS = ['Packet Rookie', 'Bit Flipper', 'Octet Operator', 'Mask Maker', 'Subnet Scout',
  'Route Ranger', 'CIDR Sage', 'Network Ninja', 'Backbone Boss'
];
const levelOf = xp => Math.floor(xp / LEVEL_XP) + 1;
const rankOf = lvl => RANKS[Math.min(lvl - 1, RANKS.length - 1)];

const BADGES = {
  first: {
    icon: '📦',
    name: 'First Packet',
    desc: 'Get your first answer right'
  },
  streak10: {
    icon: '🔥',
    name: 'On a Roll',
    desc: '10 correct in a row'
  },
  streak25: {
    icon: '⚡',
    name: 'Unstoppable',
    desc: '25 correct in a row'
  },
  scholar: {
    icon: '🎓',
    name: 'Scholar',
    desc: 'Finish every lesson'
  },
  lab: {
    icon: '🧪',
    name: 'Lab Rat',
    desc: 'Experiment in the Subnet Lab'
  },
  bits15: {
    icon: '🧮',
    name: 'Bit Wizard',
    desc: 'Score 15+ in Binary Blitz'
  },
  flawless: {
    icon: '💯',
    name: 'Flawless',
    desc: 'Score 10/10 in any quiz'
  },
  solver: {
    icon: '🧩',
    name: 'Problem Solver',
    desc: 'Solve a subnet perfectly'
  },
  surgeon: {
    icon: '🩺',
    name: 'Subnet Surgeon',
    desc: 'Perfect solve on Hard, no hint'
  },
  level5: {
    icon: '🛰️',
    name: 'Subnet Scout',
    desc: 'Reach level 5'
  }
};

function addXP(n) {
  const before = levelOf(profile.xp);
  profile.xp += n;
  save();
  renderHUD();
  const after = levelOf(profile.xp);
  if (after > before) {
    toast(`Level up! Level ${after} · ${rankOf(after)}`, 'level');
    if (after >= 5) award('level5');
  }
}

function hit() {
  streak++;
  profile.correct++;
  if (streak > profile.bestStreak) profile.bestStreak = streak;
  save();
  award('first');
  if (streak >= 10) award('streak10');
  if (streak >= 25) award('streak25');
  renderHUD();
}

function miss() {
  streak = 0;
  renderHUD();
}

function award(id) {
  if (profile.badges.includes(id)) return;
  profile.badges.push(id);
  save();
  const b = BADGES[id];
  toast(`Badge unlocked: ${b.icon} ${b.name}`, 'badge');
  addXP(25);
}

function setBest(key, val) {
  const prev = profile.best[key] || 0;
  if (val > prev) {
    profile.best[key] = val;
    save();
    return true;
  }
  return false;
}

function renderHUD() {
  const lvl = levelOf(profile.xp);
  $('#hud-level').textContent = `Lv ${lvl}`;
  $('#hud-level').title = `${rankOf(lvl)} · ${fmt(profile.xp)} XP`;
  $('#hud-xp').style.width = ((profile.xp % LEVEL_XP) / LEVEL_XP * 100) + '%';
  const s = $('#hud-streak');
  s.textContent = `🔥 ${streak}`;
  s.classList.toggle('hot', streak >= 5);
}

function toast(msg, kind = 'info') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.classList.add('out'), 2800);
  setTimeout(() => t.remove(), 3200);
}

/* =========================================================
   Router
   ========================================================= */
const VIEWS = ['home', 'learn', 'lab', 'play', 'blitz', 'solver', 'quiz'];

function route() {
  const [v, arg] = (location.hash.slice(1) || 'home').split('/');
  const view = VIEWS.includes(v) ? v : 'home';
  stopBlitz();
  $$('.view').forEach(s => {
    s.hidden = s.id !== 'view-' + view;
  });
  const navKey = ['blitz', 'solver', 'quiz'].includes(view) ? 'play' : view;
  $$('.nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + navKey));
  if (view === 'home') renderHome();
  if (view === 'learn') renderLessons();
  if (view === 'play') renderGames();
  if (view === 'lab') renderLab();
  if (view === 'blitz') resetBlitz();
  if (view === 'solver') newProblem();
  if (view === 'quiz') startQuiz(arg);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* =========================================================
   Home
   ========================================================= */
function renderHome() {
  const lvl = levelOf(profile.xp);
  $('#home-stats').innerHTML = [
    [`${lvl}`, `Level · ${rankOf(lvl)}`],
    [fmt(profile.xp), 'Total XP'],
    [profile.bestStreak, 'Best streak'],
    [`${profile.lessons.length}/${LESSONS.length}`, 'Lessons done']
  ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');

  $('#badges').innerHTML = Object.entries(BADGES).map(([id, b]) => {
    const got = profile.badges.includes(id);
    return `<div class="badge ${got ? '' : 'locked'}" title="${got ? 'Unlocked' : 'Locked'}">
      <span class="ico">${b.icon}</span><div><b>${b.name}</b><span>${b.desc}</span></div></div>`;
  }).join('');
}

$('#reset-progress').addEventListener('click', () => {
  if (!confirm('Reset all XP, badges and lesson progress?')) return;
  profile = cleanProfile({});
  streak = 0;
  save();
  renderHUD();
  renderHome();
  toast('Progress reset');
});

/* =========================================================
   Lessons
   ========================================================= */
const placeRow = (v) => {
  const bits = IP.bin8(v);
  const vals = [128, 64, 32, 16, 8, 4, 2, 1];
  return `<div class="place">${vals.map(x => `<div class="lbl">${x}</div>`).join('')}
    ${[...bits].map(b => `<div class="${b === '1' ? 'on' : ''}">${b}</div>`).join('')}</div>`;
};

/* Step-by-step decimal → binary walkthrough (used by lessons and games) */
function conversionSteps(n) {
  let left = n,
    rows = '',
    bits = '';
  for (const v of PV) {
    const fits = v <= left;
    rows += `<tr class="${fits ? 'yes' : ''}"><td>${v}</td><td>${left}</td>
      <td>${fits ? `Yes → write <b>1</b>. ${left} − ${v} = <b>${left - v}</b> still needed` : `No (${v} is bigger than ${left}) → write <b>0</b>`}</td>
      <td class="bitcell">${fits ? 1 : 0}</td></tr>`;
    if (fits) left -= v;
    bits += fits ? '1' : '0';
  }
  const parts = PV.filter(v => n & v);
  return `<div class="table-wrap"><table class="ref steps"><tr><th>Switch</th><th>Still need</th><th>Does it fit?</th><th>Bit</th></tr>${rows}</table></div>
    <p>Read the bit column top to bottom: <b class="mono">${n} = ${bits}</b>${parts.length > 1 ? ` (${parts.join(' + ')})` : ''}</p>`;
}

/* A plain-language walk through each switch, used for the worked example */
function walkList(n) {
  let left = n,
    items = '';
  for (const v of PV) {
    const ok = v <= left;
    const after = ok ? left - v : left;
    items += `<li class="${ok ? 'yes' : 'no'}"><span class="coin mono">${v}</span><span>Is ${v} ≤ ${left}? ${ok
      ? `<b>Yes</b> → ON, write <b>1</b>. ${left} − ${v} = ${after}.`
      : `<b>No</b>, too big → OFF, write <b>0</b>.`}</span><span class="need">still need <b>${after}</b></span></li>`;
    left = after;
  }
  return `<ol class="walk">${items}</ol>`;
}

const LESSONS = [{
  id: 'ip',
  title: 'What is an IP address, and why do we need one?',
  body: `
      <h4>The problem: how does data find its way?</h4>
      <p>When you open a website, watch a video or send a message, your device has to send data to another computer, often on the other side of the world. That computer then has to send its answer back to <i>you</i>, not to one of the billions of other devices online.</p>
      <p>To make that possible, data is chopped into small pieces called <b>packets</b>. Every packet is like an envelope with two addresses written on it:</p>
      <div class="packet">
        <div class="pk-head">📨 Packet</div>
        <div class="pk-row"><span class="dim">From</span><b class="mono">192.168.1.42</b><span class="dim small">your laptop</span></div>
        <div class="pk-row"><span class="dim">To</span><b class="mono">142.250.70.14</b><span class="dim small">a web server</span></div>
        <div class="pk-row"><span class="dim">Inside</span><span>“Please send me the home page”</span></div>
      </div>
      <p>Those addresses are <b>IP addresses</b> (IP = Internet Protocol, the rules for addressing and delivering packets). Along the way, devices called <b>routers</b> read the “To” address and pass the packet one hop closer to where it’s going, like sorting offices passing a letter from city to city. The server then uses the “From” address to send the reply back.</p>
      <p><b>Without IP addresses, nobody would know where to deliver data, or where to send the answer.</b> That’s why every phone, laptop, printer, smart TV and server on a network needs one. Two devices on the same network can never share an address, just as two houses can’t share one postal address.</p>

      <h4>What an IP address looks like</h4>
      <p>An IPv4 address is four numbers separated by dots:</p>
      <div class="ipdemo"><span>192</span><span class="dot">.</span><span>168</span><span class="dot">.</span><span>1</span><span class="dot">.</span><span>42</span></div>
      <p>Each of those four numbers is called an <b>octet</b>. Why “octet”? Because inside the computer each one is stored as <b>8 bits</b> (8 zeros and ones; “oct” means eight, as in octopus). 4 octets × 8 bits = <b>32 bits</b> in total.</p>
      <p>With 8 bits the biggest number you can make is <b>255</b> and the smallest is <b>0</b>, so every octet must be between 0 and 255. (The binary lesson shows exactly why.)</p>

      <h4>Two parts: street and house</h4>
      <p>Every IP address is split into two parts, just like a postal address:</p>
      <ul>
        <li>the <span class="tag net">network</span> part says <i>which street</i> (which network) the device is on;</li>
        <li>the <span class="tag host">host</span> part says <i>which house</i> on that street (which device).</li>
      </ul>
      <p>Devices on the same “street” can talk directly. To reach another street, data has to go through a router. This split is what lets the internet grow so big: a router doesn’t need to know every house in the world, only which <i>street</i> to send things towards.</p>

      <h4>Good to know</h4>
      <ul>
        <li><b>How do devices get an address?</b> Usually automatically, from a service called <b>DHCP</b> on your router. That’s why you’ve never had to type one in.</li>
        <li><b>IPv4 vs IPv6:</b> IPv4 has about 4.3 billion addresses, which isn’t enough for every device on Earth. IPv6 is the newer, much bigger version (128 bits). This game covers IPv4, which is still everywhere and is what exams test.</li>
        <li><b>Find your own:</b> on Windows run <code>ipconfig</code>; on a Mac open System Settings → Network; on a phone, look in your Wi-Fi network’s details.</li>
      </ul>`,
  q: {
    text: 'Why does every packet carry a “From” IP address as well as a “To” address?',
    options: ['So routers can count packets', 'So the reply knows where to go back to', 'To make the packet bigger', 'It doesn’t; only “To” is used'],
    answer: 1,
    why: 'The “To” address gets the packet to its destination. The “From” address tells the other side where to send its answer.'
  }
}, {
  id: 'binary',
  title: 'Binary from zero',
  game: {
    href: '#blitz',
    name: 'Binary Blitz'
  },
  body: `
      <p>Computers are made of billions of tiny switches that can only be <b>off</b> or <b>on</b>. We write off as <b>0</b> and on as <b>1</b>. A single 0 or 1 is called a <b>bit</b>. Counting with only 0s and 1s is called <b>binary</b>. Subnetting is all about bits, so let’s learn to read them. No maths background needed!</p>

      <h4>Step 1 · How normal numbers work</h4>
      <p>You already use a place-value system every day. In the number <b>254</b>, each position is worth 10× the one to its right:</p>
      <div class="decbox mono">
        <div><span class="dim">hundreds</span><b>2</b><span>2 × 100 = 200</span></div>
        <div><span class="dim">tens</span><b>5</b><span>5 × 10 = 50</span></div>
        <div><span class="dim">ones</span><b>4</b><span>4 × 1 = 4</span></div>
      </div>
      <p>200 + 50 + 4 = 254. Easy, right?</p>

      <h4>Step 2 · Binary works the same way, but with 2</h4>
      <p>In binary each position is worth <b>double</b> the one to its right. Start at 1 on the right and keep doubling: 1, 2, 4, 8, 16, 32, 64, 128. One octet has 8 positions:</p>
      ${placeRow(0)}
      <p>Each position can only be 0 or 1. Picture <b>8 light switches</b>, each with a price tag. A switch that is <b>ON (1)</b> adds its value; <b>OFF (0)</b> adds nothing.</p>

      <h4>Step 3 · Try it yourself</h4>
      <p>Click the switches below and watch the number change. Can you make <b>5</b>? <b>100</b>? What happens when <b>every</b> switch is on?</p>
      <div class="bitrow switches"></div>
      <p class="sw-out center"></p>

      <h4>Step 4 · Reading binary → a normal number</h4>
      <p>Just add up the values of the switches that are ON. Example: <b class="mono">10100000</b></p>
      ${placeRow(160)}
      <p>The 1s are under 128 and 32, so 128 + 32 = <b>160</b>.</p>

      <h4>Step 5 · Writing a number → binary</h4>
      <p>This is Step 4 backwards. You start with a normal number and have to work out <b>which switches to turn on</b> so that they add up to it.</p>
      <p><b>Think of it like paying with coins.</b> You have exactly <b>one</b> coin of each value: 128, 64, 32, 16, 8, 4, 2 and 1. You need to pay an exact amount. The trick is to <b>try the biggest coin first</b> and only use it if it doesn’t take you over the amount.</p>
      <div class="rule">
        <p>Go through the switches from <b>128 down to 1</b>. For each one, ask just one question:</p>
        <p class="rule-q">“Is this switch’s value <b>less than or equal to</b> what I still need?”</p>
        <div class="rule-row">
          <div class="yes"><b>Yes</b> → turn it <b>ON (1)</b> and subtract its value from what you still need.</div>
          <div class="no"><b>No</b> (it’s too big) → leave it <b>OFF (0)</b>. What you still need stays the same.</div>
        </div>
        <p class="small dim">When “still need” reaches 0, you’re done: every switch left over is 0.</p>
      </div>

      <p><b>Worked example: turn 13 into binary.</b> At the start we still need <b>13</b>.</p>
      ${walkList(13)}
      ${placeRow(13)}
      <p>Read the bits left to right: <b class="mono">13 = 00001101</b>. Check by adding the ON switches: 8 + 4 + 1 = 13 ✓</p>

      <h4>Now you try, one step at a time</h4>
      <p>Type a number (or press 🎲), then press <b>Next step</b>. Before each press, try to guess: will the next switch be ON or OFF?</p>
      <div class="stepper">
        <div class="row st-top">
          <label class="field conv-field"><span>Number (0–255)</span><input class="mono conv-in" value="200" inputmode="numeric"></label>
          <button class="btn st-rand" type="button">🎲 Random</button>
        </div>
        <div class="st-need">Still need: <b class="mono">200</b></div>
        <div class="bitrow st-bits"></div>
        <p class="st-msg"></p>
        <div class="row center">
          <button class="btn st-back" type="button">← Back</button>
          <button class="btn primary st-next" type="button">Next step →</button>
          <button class="btn st-all" type="button">Show all steps</button>
        </div>
        <div class="conv-steps" hidden></div>
      </div>

      <div class="callout">⚡ <b>Shortcuts once you get the hang of it</b>
        <ul>
          <li>Any number <b>128 or more</b> always starts with 1. Any number <b>under 128</b> always starts with 0.</li>
          <li><b>Odd</b> numbers always end in 1; <b>even</b> numbers always end in 0.</li>
          <li>255 is all ones (<span class="mono">11111111</span>) and 0 is all zeros.</li>
        </ul>
      </div>

      <div class="callout">💡 <b>Why does it matter?</b> Subnet masks are made of switches turned on from the left. 1 switch on = 128, 2 on = 128+64 = <b>192</b>, 3 on = <b>224</b>, 4 on = <b>240</b>… You’ll see these numbers everywhere in subnetting.</div>`,
  init(el) {
    let val = 0;
    const sw = $('.switches', el),
      out = $('.sw-out', el);
    sw.innerHTML = PV.map(v => `<button class="bitbtn" data-v="${v}"><span class="b">0</span><span class="pv">${v}</span></button>`).join('');
    const draw = () => {
      $$('.bitbtn', sw).forEach(b => {
        const on = (val & Number(b.dataset.v)) !== 0;
        b.classList.toggle('on', on);
        $('.b', b).textContent = on ? '1' : '0';
      });
      const parts = PV.filter(v => val & v);
      out.innerHTML = `<span class="mono">${IP.bin8(val)}</span> = ${parts.length > 1 ? parts.join(' + ') + ' = ' : ''}<b class="mono">${val}</b>` +
        (val === 255 ? '<br>🎉 All 8 switches on = 255. That’s the biggest number one octet can hold!' :
          val === 0 ? '<br><span class="dim">All off = 0, the smallest an octet can be.</span>' : '');
    };
    sw.addEventListener('click', e => {
      const b = e.target.closest('.bitbtn');
      if (!b) return;
      val ^= Number(b.dataset.v);
      draw();
    });
    draw();
    // Step-by-step converter
    const inp = $('.conv-in', el),
      all = $('.conv-steps', el);
    const st = {
      n: 200,
      k: 0
    };
    const cells = $('.st-bits', el),
      need = $('.st-need b', el),
      msgEl = $('.st-msg', el);
    const next = $('.st-next', el),
      back = $('.st-back', el);
    const drawStep = () => {
      const n = st.n;
      let left = n;
      const on = [];
      for (let i = 0; i < st.k; i++) {
        const ok = PV[i] <= left;
        on.push(ok);
        if (ok) left -= PV[i];
      }
      cells.innerHTML = PV.map((v, i) => {
        const cls = i < st.k ? (on[i] ? 'on' : 'off') : i === st.k ? 'cur' : '';
        return `<div class="stcell ${cls}"><span class="b">${i < st.k ? (on[i] ? 1 : 0) : '?'}</span><span class="pv">${v}</span></div>`;
      }).join('');
      need.textContent = left;
      let m;
      if (st.k === 0) {
        m = `We want to make <b>${n}</b>. Start with the biggest switch, <b>128</b>. Is 128 less than or equal to ${n}? Make a guess, then press <b>Next step</b>.`;
      } else {
        const i = st.k - 1,
          v = PV[i],
          before = left + (on[i] ? v : 0);
        m = on[i] ?
          `<span class="yes-t">Is ${v} ≤ ${before}? <b>Yes</b></span> → switch ${v} goes <b>ON (1)</b>. ${before} − ${v} = <b>${left}</b>, so we still need ${left}.` :
          `<span class="no-t">Is ${v} ≤ ${before}? <b>No</b>, ${v} is bigger than ${before}</span> → switch ${v} stays <b>OFF (0)</b>. We still need ${left}.`;
        if (st.k < 8) {
          m += left === 0 ? ` We’ve reached 0, so all the remaining switches will be 0.` : ` Next up: the <b>${PV[st.k]}</b> switch. Is ${PV[st.k]} ≤ ${left}?`;
        } else {
          const parts = PV.filter(x => n & x);
          m += `<br>🎉 <b>Done!</b> ${n} in binary is <b class="mono">${IP.bin8(n)}</b>.${parts.length ? ` Check: ${parts.join(' + ')} = ${n} ✓` : ''}`;
        }
      }
      msgEl.innerHTML = m;
      back.disabled = st.k === 0;
      next.disabled = st.k === 8;
    };
    const setN = () => {
      const n = Number(inp.value);
      const ok = inp.value.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 255;
      inp.classList.toggle('invalid', !ok);
      if (!ok) return;
      st.n = n;
      st.k = 0;
      all.innerHTML = conversionSteps(n);
      drawStep();
    };
    inp.addEventListener('input', setN);
    next.addEventListener('click', () => {
      if (st.k < 8) {
        st.k++;
        drawStep();
      }
    });
    back.addEventListener('click', () => {
      if (st.k > 0) {
        st.k--;
        drawStep();
      }
    });
    $('.st-rand', el).addEventListener('click', () => {
      inp.value = rand(1, 255);
      setN();
    });
    $('.st-all', el).addEventListener('click', e => {
      all.hidden = !all.hidden;
      e.target.textContent = all.hidden ? 'Show all steps' : 'Hide all steps';
    });
    setN();
  },
  q: {
    text: 'What is 11100000 in decimal?',
    options: ['192', '224', '240', '112'],
    answer: 1,
    why: 'The 1s are under 128, 64 and 32. 128 + 64 + 32 = 224.'
  }
}, {
  id: 'classes',
  title: 'IP address classes (A, B, C, D, E)',
  game: {
    href: '#quiz/classes',
    name: 'Class Clash'
  },
  body: `
      <p>Remember that every IP address has a <span class="tag net">network</span> part (the street) and a <span class="tag host">host</span> part (the house)? The first question is: <b>how big is each part?</b></p>
      <p>When the internet was young (before 1993), the answer was simple. Addresses were sorted into a few fixed-size groups called <b>classes</b>, and the <b>first octet</b> alone told you the class. The class then decided how many octets were network and how many were host. This is the easiest way to start thinking about network and host parts, which is why we learn it first.</p>
      <p>Today networks use a more flexible system called <b>CIDR</b> (next lesson), but classes still appear on every networking exam and people still say things like “a Class C network”.</p>
      <p class="small dim">You’ll see the term <b>default mask</b> below. A mask is simply how a computer records where the network part ends. The next lesson explains masks properly; for now, read <code>255.0.0.0</code> as “1 network octet”, <code>255.255.0.0</code> as “2 network octets” and <code>255.255.255.0</code> as “3 network octets”.</p>

      <h4>The five classes</h4>
      <div class="table-wrap"><table class="ref wide">
        <tr><th>Class</th><th>First octet</th><th>Starts with bits</th><th>Default mask</th><th>Networks</th><th>Hosts per network</th><th>Used for</th></tr>
        <tr><td>A</td><td>1 – 126</td><td>0</td><td>255.0.0.0 (/8)</td><td>126</td><td>16,777,214</td><td>Huge organisations</td></tr>
        <tr><td>B</td><td>128 – 191</td><td>10</td><td>255.255.0.0 (/16)</td><td>16,384</td><td>65,534</td><td>Medium/large organisations</td></tr>
        <tr><td>C</td><td>192 – 223</td><td>110</td><td>255.255.255.0 (/24)</td><td>2,097,152</td><td>254</td><td>Small networks</td></tr>
        <tr><td>D</td><td>224 – 239</td><td>1110</td><td>—</td><td>—</td><td>—</td><td>Multicast (one-to-many)</td></tr>
        <tr><td>E</td><td>240 – 255</td><td>1111</td><td>—</td><td>—</td><td>—</td><td>Experimental / reserved</td></tr>
      </table></div>

      <h4>Which octets are network and which are host?</h4>
      <p>For A, B and C the default mask splits the address on octet boundaries. <span class="tag net">N</span> = network, <span class="tag host">H</span> = host:</p>
      <div class="splits">
        <div class="split"><span class="lbl">Class A · /8</span><span class="sg n">N</span><span class="sg h">H</span><span class="sg h">H</span><span class="sg h">H</span><span class="eg mono">10.45.200.7 → network 10</span></div>
        <div class="split"><span class="lbl">Class B · /16</span><span class="sg n">N</span><span class="sg n">N</span><span class="sg h">H</span><span class="sg h">H</span><span class="eg mono">150.20.3.4 → network 150.20</span></div>
        <div class="split"><span class="lbl">Class C · /24</span><span class="sg n">N</span><span class="sg n">N</span><span class="sg n">N</span><span class="sg h">H</span><span class="eg mono">200.1.2.99 → network 200.1.2</span></div>
      </div>
      <p>More network octets means <b>more networks</b> but <b>fewer hosts</b> in each one. Class A: few giant networks. Class C: millions of tiny ones.</p>

      <h4>Why those ranges? It’s the binary!</h4>
      <p>The class is set by the <b>first few bits</b> of the first octet:</p>
      <ul>
        <li><b>Class A</b> starts with <b class="mono">0</b>: 0xxxxxxx goes from 00000000 (0) to 01111111 (127).</li>
        <li><b>Class B</b> starts with <b class="mono">10</b>: 10000000 (128) to 10111111 (191).</li>
        <li><b>Class C</b> starts with <b class="mono">110</b>: 11000000 (192) to 11011111 (223).</li>
        <li><b>Class D</b> starts with <b class="mono">1110</b>: 224 to 239. <b>Class E</b> starts with <b class="mono">1111</b>: 240 to 255.</li>
      </ul>
      <p>Try it. Type a first octet and see which bits decide the class:</p>
      <label class="field conv-field"><span>First octet (0–255)</span><input class="mono cls-in" value="172" inputmode="numeric"></label>
      <div class="cls-out"></div>

      <div class="callout">🧠 <b>Memory trick:</b> the classes start at <b>0, 128, 192, 224, 240</b>. Those are the same numbers you get by switching on 0, 1, 2, 3 and 4 bits from the left, the same values you see in subnet masks!</div>

      <h4>Gotchas</h4>
      <ul>
        <li><b>127</b> is missing from Class A because 127.x.x.x is reserved for <b>loopback</b> (a device talking to itself). <b>0</b> is reserved too.</li>
        <li>Hosts per network is always 2<sup>host bits</sup> − 2. Class C has 8 host bits, so 2⁸ − 2 = 254.</li>
        <li><b>Why classes died:</b> a company with 300 computers was too big for Class C (254), so it got a Class B with 65,534 addresses and wasted over 65,000 of them. <b>CIDR</b> (“classless”) fixed this by letting you pick any mask, for example a /23 with 510 hosts.</li>
      </ul>`,
  init(el) {
    const inp = $('.cls-in', el),
      out = $('.cls-out', el);
    const info = {
      A: 'Default mask 255.0.0.0 (/8): the first octet is the network and the last three are hosts.',
      B: 'Default mask 255.255.0.0 (/16): the first two octets are the network and the last two are hosts.',
      C: 'Default mask 255.255.255.0 (/24): the first three octets are the network and the last one is hosts.',
      D: 'Multicast. These addresses are for groups, not single devices, so there’s no mask.',
      E: 'Experimental/reserved. Not used on normal networks.'
    };
    const draw = () => {
      const a = Number(inp.value);
      if (inp.value.trim() === '' || !Number.isInteger(a) || a < 0 || a > 255) {
        out.innerHTML = '<p class="dim">Enter a whole number from 0 to 255.</p>';
        return;
      }
      const k = IP.klass(a);
      const lead = {
        A: 1,
        B: 2,
        C: 3,
        D: 4,
        E: 4
      }[k];
      const b = IP.bin8(a);
      let note = info[k];
      if (a === 0) note = '0 is reserved (it means “this network”), so it is never given to a device.';
      if (a === 127) note = '127 is inside Class A’s binary range, but it is reserved for loopback (127.0.0.1 = “myself”).';
      out.innerHTML = `<div class="clsbin mono"><span class="lead">${b.slice(0, lead)}</span>${b.slice(lead)}</div>
          <p>${a} in binary starts with <b class="mono">${b.slice(0, lead)}</b> → <b>Class ${k}</b>. ${note}</p>`;
    };
    inp.addEventListener('input', draw);
    draw();
  },
  q: {
    text: 'What is the default subnet mask for 150.10.4.2?',
    options: ['255.0.0.0', '255.255.0.0', '255.255.255.0', '255.255.255.255'],
    answer: 1,
    why: 'The first octet is 150, which is between 128 and 191, so it is Class B. Class B’s default mask is 255.255.0.0 (/16).'
  }
}, {
  id: 'cidr',
  title: 'Network bits, host bits, masks & CIDR',
  game: {
    href: '#quiz/mask',
    name: 'Mask Match'
  },
  body: `
      <h4>Step 1 · An IP address is really 32 bits</h4>
      <p>You now know binary, so here’s what an IP address really looks like inside the computer. Each octet becomes 8 bits:</p>
      <div class="ipbits">
        <div class="mono">192 . 168 . 1 . 42</div>
        <div class="mono">${IP.binDots(IP.toInt('192.168.1.42'))}</div>
      </div>
      <p>That’s 32 bits in a row. The big question in subnetting is: <b>which of those 32 bits say “which network”, and which say “which device”?</b></p>

      <h4>Step 2 · Network bits and host bits</h4>
      <p>Every IP address is cut into two pieces at some point along those 32 bits:</p>
      <ul>
        <li><span class="tag net">Network bits</span> come <b>first</b> (on the left). They’re the <b>same for every device</b> on that network, like a street name that everyone on the street shares.</li>
        <li><span class="tag host">Host bits</span> come <b>after</b> (on the right). They’re <b>different for every device</b>, like house numbers. They’re what makes each device unique.</li>
      </ul>
      <p>Here are three devices on the same home network. Look at the colours: the first 24 bits are <b>identical</b> for all three (network bits) and only the last 8 change (host bits):</p>
      <div class="devices">
        ${[10, 42, 200].map(x => `<div class="dev"><span class="mono dname">192.168.1.${x}</span>${binColored(IP.toInt('192.168.1.' + x), 24)}</div>`).join('')}
      </div>
      <p>So for this network: <b>24 network bits + 8 host bits = 32 bits.</b> The two always add up to 32.</p>

      <h4>Step 3 · Host bits decide how many devices fit</h4>
      <p>Each host bit can be 0 or 1, and every extra host bit <b>doubles</b> the number of addresses. It’s the same doubling as the binary switches:</p>
      <div class="dbl">
        ${[[1, '2'], [2, '4'], [3, '8'], [4, '16'], [5, '32'], [6, '64'], [7, '128'], [8, '256'], [16, '65,536'], [24, '16.7 million']].map(([h, a]) => `<div><b>${h}</b><span>host bit${h > 1 ? 's' : ''}</span><i>${a}</i><span>addresses</span></div>`).join('')}
      </div>
      <p>The rule is <b>addresses = 2<sup>host bits</sup></b>. With 8 host bits: 2⁸ = 256 addresses.</p>
      <p>That gives you a <b>trade-off</b>: since the total is always 32, <b>more network bits means fewer host bits</b>, so you get <b>smaller networks</b>. Fewer network bits means bigger networks.</p>

      <h4>Step 4 · The subnet mask: a stencil that marks the line</h4>
      <p>An IP address on its own doesn’t say where the network bits end. That’s the job of the <b>subnet mask</b>. A mask is another 32-bit pattern that you lay under the IP address like a stencil:</p>
      <ul>
        <li>a <b>1</b> under every <span class="tag net">network bit</span></li>
        <li>a <b>0</b> under every <span class="tag host">host bit</span></li>
      </ul>
      <div class="ipbits">
        <div><span class="dim lbl2">IP</span>${binColored(IP.toInt('192.168.1.42'), 24)}</div>
        <div><span class="dim lbl2">Mask</span>${binColored(IP.mask(24), 24)}</div>
      </div>
      <p>Because network bits always come first, a mask is <b>always a run of 1s followed by a run of 0s</b>, never mixed up. <span class="mono">11110000</span> is a valid mask octet; <span class="mono">10100000</span> never is.</p>
      <p>To write the mask the normal way, convert each octet with your binary skills: <span class="mono">11111111</span> = 255 and <span class="mono">00000000</span> = 0, so this mask is <code>255.255.255.0</code>.</p>

      <h4>Step 5 · CIDR: the short way to write a mask</h4>
      <p>Writing out <code>255.255.255.0</code> every time is a lot of typing, so people just <b>count the 1s</b> in the mask and write that number after a slash. This is called <b>CIDR notation</b> (or the <b>prefix length</b>):</p>
      <div class="cidr-eq mono"><span>192.168.1.42<b>/24</b></span><span class="dim">means</span><span>“the first <b>24</b> bits are the network”</span></div>
      <p><code>/24</code>, <code>255.255.255.0</code> and “24 network bits” all mean exactly the same thing. They’re three ways of saying where the line is.</p>

      <h4>Step 6 · Move the line yourself</h4>
      <p>Drag the slider. Watch the line between <span class="tag net">network</span> and <span class="tag host">host</span> bits move, and see how the mask and the network size change with it:</p>
      <label class="field"><span>Prefix length <b class="mono pf-val">/24</b></span><input type="range" class="pf-range" min="8" max="30" value="24"></label>
      <div class="bits pf-bits"></div>
      <div class="pf-out"></div>

      <h4>Step 7 · When the line falls in the middle of an octet</h4>
      <p>If the prefix is a multiple of 8 (/8, /16, /24), each mask octet is simply 255 or 0. Otherwise one octet is <b>partly</b> network and partly host. Turn its first few switches on, from the left, and add them up:</p>
      <table class="ref">
        <tr><th>Network bits in that octet</th><th>Binary</th><th>Add up</th><th>Value</th></tr>
        <tr><td>1</td><td class="mono">10000000</td><td>128</td><td><b>128</b></td></tr>
        <tr><td>2</td><td class="mono">11000000</td><td>128 + 64</td><td><b>192</b></td></tr>
        <tr><td>3</td><td class="mono">11100000</td><td>128 + 64 + 32</td><td><b>224</b></td></tr>
        <tr><td>4</td><td class="mono">11110000</td><td>… + 16</td><td><b>240</b></td></tr>
        <tr><td>5</td><td class="mono">11111000</td><td>… + 8</td><td><b>248</b></td></tr>
        <tr><td>6</td><td class="mono">11111100</td><td>… + 4</td><td><b>252</b></td></tr>
        <tr><td>7</td><td class="mono">11111110</td><td>… + 2</td><td><b>254</b></td></tr>
        <tr><td>8</td><td class="mono">11111111</td><td>… + 1</td><td><b>255</b></td></tr>
      </table>
      <div class="rule">
        <p><b>Recipe: turning /N into a mask</b> (example: <b>/20</b>)</p>
        <ol>
          <li>How many full octets of 8? 20 = 8 + 8 + <b>4</b>, so two octets of <b>255</b>.</li>
          <li>The leftover <b>4</b> bits go in the next octet: 128 + 64 + 32 + 16 = <b>240</b>.</li>
          <li>Every octet after that is <b>0</b>.</li>
        </ol>
        <p>/20 = <code>255.255.240.0</code>. It has 32 − 20 = <b>12 host bits</b>, so 2¹² = 4,096 addresses.</p>
        <p><b>Backwards</b> (mask → /N): count the 1s. 255 = 8, 240 = 4 (from the table), 0 = 0. So <code>255.255.240.0</code> = 8 + 8 + 4 + 0 = <b>/20</b>.</p>
      </div>

      <div class="callout">🔗 <b>Remember the IP classes?</b> They were just fixed masks: Class A was always /8, Class B /16 and Class C /24. CIDR lets you put the line <b>anywhere</b>, so a network can be exactly the size it needs. That’s what makes subnetting possible, which is the next lesson.</div>`,
  init(el) {
    const r = $('.pf-range', el),
      bits = $('.pf-bits', el),
      out = $('.pf-out', el);
    const ip = IP.toInt('192.168.1.42');
    const draw = () => {
      const c = Number(r.value),
        h = 32 - c,
        m = IP.mask(c);
      $('.pf-val', el).textContent = '/' + c;
      bits.innerHTML = bitLine('IP', ip, c) + bitLine('Mask', m, c);
      out.innerHTML = `<p><b>/${c}</b> = <span class="tag net">${c} network bits</span> + <span class="tag host">${h} host bits</span> = 32.</p>
          <p>Mask: <code>${IP.toStr(m)}</code>. ${maskBuild(c)}</p>
          <p>Each network has 2<sup>${h}</sup> = <b>${fmt(Math.pow(2, h))}</b> addresses${c <= 30 ? ` (${fmt(IP.hosts(c))} usable for devices; you’ll see why “minus 2” in a later lesson)` : ''}.</p>`;
    };
    r.addEventListener('input', draw);
    draw();
  },
  q: {
    text: 'In 10.20.30.40/16, how many host bits are there?',
    options: ['8', '16', '24', '32'],
    answer: 1,
    why: '/16 means 16 network bits. The total is always 32, so 32 − 16 = 16 host bits (the last two octets).'
  }
}, {
  id: 'subnet',
  title: 'What is a subnet, and why use one?',
  game: {
    href: '#lab',
    name: 'Subnet Lab'
  },
  body: `
      <h4>A subnet is a smaller network inside a bigger one</h4>
      <p><b>Subnet</b> is short for <b>sub-network</b>. It’s a group of IP addresses that share the same network part, so all the devices in it are on the same “street”. Devices in the same subnet can talk to each other directly. To reach a device in a <i>different</i> subnet, traffic has to go through a <b>router</b>.</p>
      <p><b>Subnetting</b> means taking one block of addresses and cutting it into several smaller blocks.</p>

      <h4>An example: one office, four teams</h4>
      <p>Imagine a company has the addresses <code>192.168.1.0</code> to <code>192.168.1.255</code>: 256 addresses in one big network. Instead of putting everyone together, the IT team cuts it into four subnets of 64 addresses each:</p>
      <div class="sbar">
        <div style="--c:var(--net)"><b>Sales</b><span class="mono">.0 – .63</span></div>
        <div style="--c:var(--accent)"><b>Engineering</b><span class="mono">.64 – .127</span></div>
        <div style="--c:var(--host)"><b>HR</b><span class="mono">.128 – .191</span></div>
        <div style="--c:var(--warn)"><b>Guest Wi-Fi</b><span class="mono">.192 – .255</span></div>
      </div>
      <p>Now a laptop at <code>192.168.1.70</code> is clearly in Engineering, and a phone at <code>192.168.1.200</code> is a guest.</p>

      <h4>Why bother? Four big reasons</h4>
      <ul class="reasons">
        <li><b>🔒 Security.</b> The router between subnets decides who may talk to whom. Guests on the Wi-Fi can use the internet but can’t reach HR’s files or the company servers.</li>
        <li><b>📢 Less noise.</b> Some messages are <b>broadcasts</b>, shouted to every device in the subnet (“Who has address .42?”). In one giant network of thousands of devices, everyone hears everyone else shouting and things slow down. Smaller subnets keep the shouting inside each room.</li>
        <li><b>🗂️ Organisation.</b> The address tells you where a device belongs. “Anything in .64–.127 is Engineering” makes managing and fixing the network much easier.</li>
        <li><b>💸 No wasted addresses.</b> Each group gets a block sized to what it needs instead of everyone sharing one huge block.</li>
      </ul>

      <h4>Try splitting it yourself</h4>
      <p>Choose how many subnets to cut <code>192.168.1.0</code> – <code>192.168.1.255</code> into:</p>
      <div class="seg split-btns">${[1, 2, 4, 8, 16].map(n => `<button data-n="${n}">${n}</button>`).join('')}</div>
      <div class="sbar live"></div>
      <p class="split-msg"></p>

      <h4>What every subnet has</h4>
      <ul>
        <li>The <b>first</b> address is the <b>network address</b>: the subnet’s name (192.168.1.64 for Engineering). It isn’t given to a device.</li>
        <li>The <b>last</b> address is the <b>broadcast address</b>, used to “shout” to everyone in the subnet (192.168.1.127). It isn’t given to a device either.</li>
        <li>Everything in between is for devices: the <b>usable hosts</b>. Engineering can use .65 to .126, which is 62 devices.</li>
      </ul>
      <h4>How subnetting works in bits: borrowing host bits</h4>
      <p>From the last lesson you know <code>192.168.1.0/24</code> has 24 network bits and 8 host bits. To cut it into smaller subnets, you <b>borrow</b> some host bits and use them as extra network bits, which moves the line to the right:</p>
      ${bitLine('/24', IP.toInt('192.168.1.0'), 24)}
      ${bitLine('/26', IP.toInt('192.168.1.0'), 26)}
      <p class="small dim">(Blue = network bits, purple = host bits. Two purple bits turned blue.)</p>
      <ul>
        <li>Each borrowed bit <b>doubles the number of subnets</b>: borrow 2 bits → 2² = <b>4 subnets</b>.</li>
        <li>The host bits that are left decide each subnet’s size: 8 − 2 = 6 host bits → 2⁶ = <b>64 addresses</b> each.</li>
        <li>That’s exactly the Sales / Engineering / HR / Guest split above: four <b>/26</b> subnets of 64.</li>
      </ul>
      <p>The buttons in the “Try splitting it yourself” box above show the same thing: 2 subnets = /25, 4 = /26, 8 = /27, 16 = /28.</p>
      <div class="callout">🧭 <b>Next up:</b> for any subnet you can now work out its first address (network), last address (broadcast) and how many devices fit. The next lesson shows how.</div>`,
  init(el) {
    const bar = $('.sbar.live', el),
      msg = $('.split-msg', el);
    const colors = ['var(--net)', 'var(--accent)', 'var(--host)', 'var(--warn)'];
    const draw = n => {
      const size = 256 / n;
      bar.innerHTML = Array.from({
          length: n
        }, (_, i) =>
        `<div style="--c:${colors[i % 4]}"><b>${n <= 4 ? 'Subnet ' + (i + 1) : i + 1}</b>${n <= 8 ? `<span class="mono">.${i * size}–.${i * size + size - 1}</span>` : ''}</div>`).join('');
      msg.innerHTML = n === 1 ?
        'One big network: all <b>256</b> addresses together (254 usable devices). Everyone hears every broadcast. In bits: a single /24.' :
        `<b>${n}</b> subnets of <b>${size}</b> addresses each, so <b>${size - 2}</b> usable devices in each after taking away the network and broadcast addresses. Each time you <b>double</b> the number of subnets, each one gets <b>half</b> the addresses.<br>In bits: borrowing <b>${Math.log2(n)}</b> host bit${n > 2 ? 's' : ''} turns the /24 into <b>/${24 + Math.log2(n)}</b> subnets.`;
      $$('.split-btns button', el).forEach(b => b.classList.toggle('on', Number(b.dataset.n) === n));
    };
    $('.split-btns', el).addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) draw(Number(b.dataset.n));
    });
    draw(4);
  },
  q: {
    text: 'Why would a company put its guest Wi-Fi on its own subnet?',
    options: ['To make the internet faster for guests', 'To keep guests separated from company devices', 'Because guests need public IP addresses', 'Wi-Fi only works on subnets'],
    answer: 1,
    why: 'In their own subnet, all guest traffic to company devices has to pass through the router, which can block it. Guests get the internet without reaching internal systems.'
  }
}, {
  id: 'nb',
  title: 'Network, broadcast & hosts',
  game: {
    href: '#quiz/same',
    name: 'Same Network?'
  },
  body: `
      <p>Every subnet is a range of addresses. Two of them are special:</p>
      <ul>
        <li><b>Network address</b> — all host bits set to <b>0</b>. Names the subnet itself.</li>
        <li><b>Broadcast address</b> — all host bits set to <b>1</b>. Reaches every host on the subnet.</li>
      </ul>
      <p>Everything in between is a <b>usable host</b>. With <i>h</i> host bits:</p>
      <p style="font-size:1.2rem" class="mono">usable hosts = 2<sup>h</sup> − 2</p>
      <table class="ref">
        <tr><th>Prefix</th><th>Host bits</th><th>Addresses</th><th>Usable</th></tr>
        <tr><td>/24</td><td>8</td><td>256</td><td>254</td></tr>
        <tr><td>/26</td><td>6</td><td>64</td><td>62</td></tr>
        <tr><td>/28</td><td>4</td><td>16</td><td>14</td></tr>
        <tr><td>/30</td><td>2</td><td>4</td><td>2</td></tr>
      </table>
      <p><b>Example:</b> <code>192.168.1.0/24</code> → network <code>192.168.1.0</code>, broadcast <code>192.168.1.255</code>, hosts <code>.1</code> to <code>.254</code>.</p>`,
  q: {
    text: 'How many usable hosts are in a /28?',
    options: ['16', '14', '30', '12'],
    answer: 1,
    why: '32 − 28 = 4 host bits. 2⁴ = 16 addresses, minus network and broadcast = 14.'
  }
}, {
  id: 'magic',
  title: 'The magic number trick',
  game: {
    href: '#solver',
    name: 'Subnet Solver'
  },
  body: `
      <p>You don’t need to write out 32 bits every time. Use the <b>block size</b> (a.k.a. magic number):</p>
      <ol>
        <li>Find the <b>interesting octet</b> — the one where the mask isn’t 255 or 0.</li>
        <li>Block size = <b>256 − mask value</b> in that octet.</li>
        <li>Subnets start at multiples of the block size: 0, B, 2B, 3B…</li>
        <li>Find the block your IP falls into. Its start is the <b>network</b>; one before the next block is the <b>broadcast</b>.</li>
      </ol>
      <p><b>Example — <code>192.168.10.77/26</code>:</b></p>
      <ul>
        <li>/26 → mask <code>255.255.255.192</code>, interesting octet is the 4th.</li>
        <li>Block size = 256 − 192 = <b>64</b> → blocks at 0, 64, 128, 192.</li>
        <li>77 sits in the <b>64–127</b> block.</li>
        <li>Network <code>192.168.10.64</code>, broadcast <code>192.168.10.127</code>, hosts <code>.65</code>–<code>.126</code>.</li>
      </ul>
      <p>Octets <i>after</i> the interesting one are 0 in the network address and 255 in the broadcast. Try it in the <a href="#lab">Lab</a>, then in <a href="#solver">Subnet Solver</a>.</p>`,
  q: {
    text: 'What is the network address of 10.1.1.100/27?',
    options: ['10.1.1.64', '10.1.1.96', '10.1.1.100', '10.1.1.0'],
    answer: 1,
    why: 'Block size = 256 − 224 = 32. Blocks start at 0, 32, 64, 96, 128… 100 falls in 96–127, so the network is 10.1.1.96.'
  }
}, {
  id: 'special',
  title: 'Special address ranges',
  game: {
    href: '#quiz/detective',
    name: 'IP Detective'
  },
  body: `
      <p>Some ranges are reserved for particular jobs. These come up constantly:</p>
      <table class="ref">
        <tr><th>Range</th><th>Purpose</th></tr>
        <tr><td>10.0.0.0/8</td><td>Private</td></tr>
        <tr><td>172.16.0.0/12</td><td>Private (172.16.x.x – 172.31.x.x)</td></tr>
        <tr><td>192.168.0.0/16</td><td>Private</td></tr>
        <tr><td>127.0.0.0/8</td><td>Loopback (this machine)</td></tr>
        <tr><td>169.254.0.0/16</td><td>Link-local / APIPA (no DHCP)</td></tr>
        <tr><td>224.0.0.0/4</td><td>Multicast (224–239)</td></tr>
      </table>
      <p><b>Private</b> addresses aren’t routed on the public internet; your router uses NAT to share one public address. Everything else (roughly) is <b>public</b>.</p>
      <p>Notice that each private range sits inside one of the old classes: 10.x.x.x is one Class A network, 172.16–31.x.x are 16 Class B networks, and 192.168.x.x are 256 Class C networks.</p>`,
  q: {
    text: 'Which address is private?',
    options: ['172.32.5.1', '172.20.5.1', '11.0.0.1', '192.169.0.1'],
    answer: 1,
    why: '172.16.0.0/12 covers 172.16.x.x through 172.31.x.x. 172.20 is inside; 172.32 is not.'
  }
}];

let lessonsRendered = false;

function renderLessons() {
  if (lessonsRendered) {
    refreshLessonState();
    return;
  }
  lessonsRendered = true;
  $('#lessons').innerHTML = LESSONS.map((l, i) => `
    <details class="lesson" data-id="${l.id}" ${i === firstOpenLesson() ? 'open' : ''}>
      <summary><span class="num">0${i + 1}</span><span>${l.title}</span><span class="done"></span><span class="chev">›</span></summary>
      <div class="lesson-body">
        ${l.body}
        <div class="check">
          <h4>Quick check: ${l.q.text}</h4>
          <div class="options">${l.q.options.map((o, j) => `<button class="opt" data-j="${j}"><span class="t">${esc(o)}</span></button>`).join('')}</div>
          <div class="feedback" hidden></div>
        </div>
        ${l.game ? `<div class="row"><a class="btn practice" href="${l.game.href}">🎮 Practise this: ${l.game.name} →</a></div>` : ''}
      </div>
    </details>`).join('');

  $$('.lesson').forEach(el => {
    const lesson = LESSONS.find(l => l.id === el.dataset.id);
    if (lesson.init) lesson.init(el);
    $$('.opt', el).forEach(btn => btn.addEventListener('click', () => {
      const j = Number(btn.dataset.j);
      const fb = $('.feedback', el);
      fb.hidden = false;
      if (j === lesson.q.answer) {
        btn.classList.add('ok');
        $$('.opt', el).forEach(b => {
          b.disabled = true;
          if (b !== btn) b.classList.add('faded');
        });
        fb.className = 'feedback good';
        fb.innerHTML = `<div class="verdict">Correct!</div>${lesson.q.why}`;
        hit();
        if (!profile.lessons.includes(lesson.id)) {
          profile.lessons.push(lesson.id);
          save();
          addXP(20);
          if (profile.lessons.length === LESSONS.length) award('scholar');
        }
        refreshLessonState();
      } else {
        btn.classList.add('bad');
        btn.disabled = true;
        fb.className = 'feedback badf';
        fb.innerHTML = `<div class="verdict">Not quite — try again.</div>`;
        miss();
      }
    }));
  });
  refreshLessonState();
}

function firstOpenLesson() {
  const i = LESSONS.findIndex(l => !profile.lessons.includes(l.id));
  return i === -1 ? 0 : i;
}

function refreshLessonState() {
  $$('.lesson').forEach(el => {
    const done = profile.lessons.includes(el.dataset.id);
    el.classList.toggle('complete', done);
    $('.done', el).textContent = done ? '✓ done' : '';
  });
}

/* =========================================================
   Subnet Lab
   ========================================================= */
let labTouched = false;

function renderLab() {
  const inp = $('#lab-ip');
  const ip = IP.toInt(inp.value);
  const c = Number($('#lab-cidr').value);
  $('#lab-cidr-val').textContent = '/' + c;
  inp.classList.toggle('invalid', ip === null);
  if (ip === null) return;

  const m = IP.mask(c),
    net = IP.net(ip, c),
    bc = IP.bcast(ip, c);
  const bitRow = (label, n) => {
    const b = IP.bin32(n);
    let oct = '';
    for (let o = 0; o < 4; o++) {
      let cells = '';
      for (let k = 0; k < 8; k++) {
        const i = o * 8 + k;
        cells += `<span class="bit ${i < c ? 'n' : 'h'}">${b[i]}</span>`;
      }
      oct += `<div class="octet">${cells}</div>`;
    }
    return `<div class="bitline"><span class="lbl">${label}</span><span class="val">${IP.toStr(n)}</span><div class="octets">${oct}</div></div>`;
  };
  $('#lab-bits').innerHTML = bitRow('Address', ip) + bitRow('Mask', m) + bitRow('Network', net) + bitRow('Broadcast', bc);

  let first, last;
  if (c === 32) {
    first = last = ip;
  } else if (c === 31) {
    first = net;
    last = bc;
  } else {
    first = net + 1;
    last = bc - 1;
  }

  const items = [
    ['Subnet mask', IP.toStr(m)],
    ['Wildcard mask', IP.toStr(IP.wildcard(c))],
    ['Network address', IP.toStr(net)],
    ['Broadcast address', IP.toStr(bc)],
    ['First usable host', IP.toStr(first)],
    ['Last usable host', IP.toStr(last)],
    ['Total addresses', fmt(Math.pow(2, 32 - c))],
    ['Usable hosts', fmt(IP.hosts(c)) + (c >= 31 ? (c === 31 ? ' (point-to-point)' : ' (single host)') : '')],
    ['Address type', IP.classify(ip)],
    ['Legacy class', IP.klass(IP.octets(ip)[0])]
  ];
  $('#lab-results').innerHTML = items.map(([k, v]) => `<div class="result"><span>${k}</span><b>${v}</b></div>`).join('');

  // Splitter
  const split = $('#lab-split');
  const maxN = Math.max(0, Math.min(8, 30 - c));
  split.max = maxN;
  if (Number(split.value) > maxN) split.value = maxN;
  const n = Number(split.value);
  const nc = c + n;
  const count = Math.pow(2, n);
  const size = Math.pow(2, 32 - nc);
  $('#lab-split-val').textContent = n;
  $('#lab-split-count').textContent = fmt(count);
  split.disabled = maxN === 0;
  if (maxN === 0) {
    $('#lab-subnets').innerHTML = `<tr><td class="dim">A /${c} is too small to split further.</td></tr>`;
    return;
  }
  const show = Math.min(count, 16);
  let rows = `<tr><th>#</th><th>Subnet</th><th>Usable range</th><th>Broadcast</th><th>Hosts</th></tr>`;
  for (let i = 0; i < show; i++) {
    const s = net + i * size;
    const e = s + size - 1;
    const mine = ip >= s && ip <= e;
    rows += `<tr class="${mine ? 'mine' : ''}"><td>${i + 1}</td><td>${IP.toStr(s)}/${nc}</td><td>${IP.toStr(s + 1)} – ${IP.toStr(e - 1)}</td><td>${IP.toStr(e)}</td><td>${fmt(IP.hosts(nc))}</td></tr>`;
  }
  if (count > show) rows += `<tr><td colspan="5" class="dim">…and ${fmt(count - show)} more</td></tr>`;
  $('#lab-subnets').innerHTML = rows;
}
['#lab-ip', '#lab-cidr', '#lab-split'].forEach(sel => $(sel).addEventListener('input', () => {
  renderLab();
  if (!labTouched) {
    labTouched = true;
    award('lab');
  }
}));

/* =========================================================
   Games list
   ========================================================= */
const GAMES = [{
  href: '#blitz',
  icon: '🧮',
  title: 'Binary Blitz',
  lvl: 'Warm-up',
  desc: 'Flip bits to convert decimal to binary against the clock.',
  best: () => profile.best.blitz ? `Best: ${profile.best.blitz} in 60s` : ''
}, {
  href: '#quiz/mask',
  icon: '🎭',
  title: 'Mask Match',
  lvl: 'Beginner',
  desc: 'CIDR ↔ subnet masks, host counts and “how big a subnet do I need?”',
  best: () => profile.best.mask ? `Best: ${profile.best.mask}/10` : ''
}, {
  href: '#quiz/classes',
  icon: '🏛️',
  title: 'Class Clash',
  lvl: 'Beginner',
  desc: 'Class A, B, C, D or E? Default masks, leading bits and host counts.',
  best: () => profile.best.classes ? `Best: ${profile.best.classes}/10` : ''
}, {
  href: '#quiz/detective',
  icon: '🕵️',
  title: 'IP Detective',
  lvl: 'Beginner',
  desc: 'Private, public, loopback, APIPA or multicast? Spot the address type.',
  best: () => profile.best.detective ? `Best: ${profile.best.detective}/10` : ''
}, {
  href: '#quiz/same',
  icon: '🔗',
  title: 'Same Network?',
  lvl: 'Intermediate',
  desc: 'Two hosts, one mask. Can they talk without a router?',
  best: () => profile.best.same ? `Best: ${profile.best.same}/10` : ''
}, {
  href: '#solver',
  icon: '🧩',
  title: 'Subnet Solver',
  lvl: 'Boss level',
  desc: 'Find mask, network, broadcast, host range and host count — from scratch.',
  best: () => profile.best.solver ? `${profile.best.solver} perfect solves` : ''
}];

function renderGames() {
  $('#games').innerHTML = GAMES.map(g => `
    <a class="game" href="${g.href}">
      <span class="gi">${g.icon}</span>
      <span class="lvltag">${g.lvl}</span>
      <h3>${g.title}</h3>
      <p>${g.desc}</p>
      <span class="best">${g.best()}</span>
    </a>`).join('');
}

/* =========================================================
   Binary Blitz
   ========================================================= */
const blitz = {
  running: false,
  time: 60,
  score: 0,
  target: 0,
  bits: 0,
  timer: null
};

$('#blitz-bits').innerHTML = PV.map((v, i) =>
  `<button class="bitbtn" data-v="${v}" aria-label="Bit ${v}"><span class="b">0</span><span class="pv">${v}</span></button>`).join('');
$$('#blitz-bits .bitbtn').forEach(b => b.addEventListener('click', () => flipBit(Number(b.dataset.v))));

function renderBits() {
  $$('#blitz-bits .bitbtn').forEach(b => {
    const on = (blitz.bits & Number(b.dataset.v)) !== 0;
    b.classList.toggle('on', on);
    $('.b', b).textContent = on ? '1' : '0';
  });
  $('#blitz-sum').textContent = blitz.bits;
  $('#blitz-bin').textContent = IP.bin8(blitz.bits);
}

function flipBit(v) {
  blitz.bits ^= v;
  renderBits();
  if (blitz.running && blitz.bits === blitz.target) {
    blitz.score++;
    if (blitz.helped) blitz.helpedCount++;
    hit();
    $('#blitz-score').textContent = blitz.score;
    const t = $('#blitz-target');
    t.classList.remove('pop');
    void t.offsetWidth;
    t.classList.add('pop');
    const parts = PV.filter(x => blitz.target & x);
    $('#blitz-last').innerHTML = `✓ <b>${blitz.target}</b> = ${parts.join(' + ')} = <b class="mono">${IP.bin8(blitz.target)}</b>`;
    nextTarget();
  } else renderHelper();
}

function renderHelper() {
  const h = $('#blitz-helper');
  if (!blitz.running || !$('#blitz-help').checked) {
    h.hidden = true;
    return;
  }
  h.hidden = false;
  const t = blitz.target;
  const diff = PV.find(v => (blitz.bits ^ t) & v);
  if (diff === undefined) {
    h.innerHTML = '';
    return;
  }
  const need = t % (diff * 2); // what's left after the correct higher switches
  if (blitz.bits & diff) {
    h.innerHTML = `⚠️ The <b>${diff}</b> switch is on, but ${t} doesn’t need it${blitz.bits > t ? ` (you’re at ${blitz.bits}, which is too high)` : ''}. Turn it off.`;
  } else {
    const done = t - need;
    h.innerHTML = `${done ? `You’ve got <b>${done}</b> so far. ` : ''}Still need <b>${need}</b>. The biggest switch that fits into ${need} is <b>${diff}</b>, so turn it on.`;
  }
}

function nextTarget() {
  let t;
  do {
    t = rand(1, 255);
  } while (t === blitz.target);
  blitz.target = t;
  blitz.bits = 0;
  blitz.helped = $('#blitz-help').checked;
  $('#blitz-target').textContent = t;
  $('#blitz-steps').hidden = true;
  renderBits();
  renderHelper();
}

function resetBlitz() {
  stopBlitz();
  blitz.score = 0;
  blitz.time = 60;
  blitz.bits = 0;
  blitz.target = 0;
  $('#blitz-time').textContent = 60;
  $('#blitz-score').textContent = 0;
  $('#blitz-target').textContent = '?';
  $('#blitz-last').innerHTML = '';
  $('#blitz-steps').hidden = true;
  $('#blitz-end').hidden = true;
  renderBits();
  renderHelper();
  $('#blitz-overlay-card').innerHTML = `
    <h2>Binary Blitz</h2>
    <p>A number appears. Turn switches on until their values add up to it. That’s the number written in binary!</p>
    <p class="small dim">New to binary? Start with <b>Practice</b>: no timer, with tips that tell you which switch to flip and why.</p>
    ${profile.best.blitz ? `<p class="dim">Your best timed score: ${profile.best.blitz}</p>` : ''}
    <div class="row center">
      <button class="btn primary" id="blitz-practice">Practice (no timer)</button>
      <button class="btn" id="blitz-start">Timed: 60 seconds</button>
    </div>`;
  $('#blitz-start').addEventListener('click', () => startBlitz(false));
  $('#blitz-practice').addEventListener('click', () => startBlitz(true));
  $('#blitz-overlay').hidden = false;
}

function startBlitz(practice) {
  stopBlitz();
  $('#blitz-overlay').hidden = true;
  blitz.practice = practice;
  blitz.running = true;
  blitz.score = 0;
  blitz.time = 60;
  blitz.helpedCount = 0;
  $('#blitz-score').textContent = 0;
  $('#blitz-last').innerHTML = '';
  $('#blitz-end').hidden = !practice;
  $('#blitz-time').textContent = practice ? '∞' : 60;
  if (practice) $('#blitz-help').checked = true;
  nextTarget();
  if (!practice) {
    blitz.timer = setInterval(() => {
      blitz.time--;
      $('#blitz-time').textContent = blitz.time;
      if (blitz.time <= 0) endBlitz();
    }, 1000);
  }
}

function stopBlitz() {
  clearInterval(blitz.timer);
  blitz.timer = null;
  blitz.running = false;
}

function endBlitz() {
  stopBlitz();
  renderHelper();
  const unhelped = blitz.score - blitz.helpedCount;
  const xp = unhelped * 4 + blitz.helpedCount * 2;
  const record = !blitz.practice && setBest('blitz', blitz.score);
  if (xp) addXP(xp);
  if (!blitz.practice && unhelped >= 15) award('bits15');
  $('#blitz-overlay-card').innerHTML = `
    <h2>${blitz.practice ? 'Practice done' : 'Time!'}</h2>
    <div class="big">${blitz.score}</div>
    <p>${record && blitz.score ? '🏆 New personal best! ' : ''}+${xp} XP</p>
    <p class="small dim">${blitz.helpedCount ? 'Answers solved with Helper tips on earn half XP. Turn tips off when you feel ready!' : 'No tips used. Nice work!'}</p>
    <div class="row center">
      <button class="btn primary" id="blitz-again">Timed round</button>
      <button class="btn" id="blitz-again-p">Practice</button>
      <a class="btn" href="#play">Games</a>
    </div>`;
  $('#blitz-again').addEventListener('click', () => startBlitz(false));
  $('#blitz-again-p').addEventListener('click', () => startBlitz(true));
  $('#blitz-overlay').hidden = false;
}
$('#blitz-skip').addEventListener('click', () => {
  if (blitz.running) {
    miss();
    nextTarget();
  }
});
$('#blitz-end').addEventListener('click', () => {
  if (blitz.running) endBlitz();
});
$('#blitz-help').addEventListener('change', () => {
  if ($('#blitz-help').checked) blitz.helped = true;
  renderHelper();
});
$('#blitz-show').addEventListener('click', () => {
  if (!blitz.running) return;
  blitz.helped = true;
  const s = $('#blitz-steps');
  s.hidden = false;
  s.innerHTML = `<h4>How to make ${blitz.target}</h4>${conversionSteps(blitz.target)}<p class="small dim">Now flip those switches to score the point.</p>`;
});

/* =========================================================
   Subnet Solver
   ========================================================= */
const solver = {
  diff: 'easy',
  ip: 0,
  c: 24,
  scored: false,
  hint: false
};

$$('#solver-diff button').forEach(b => b.addEventListener('click', () => {
  solver.diff = b.dataset.diff;
  $$('#solver-diff button').forEach(x => x.classList.toggle('on', x === b));
  newProblem();
}));

function genProblem(diff) {
  if (diff === 'easy') return {
    ip: IP.toInt(`192.168.${rand(0, 255)}.${rand(1, 254)}`),
    c: rand(24, 30)
  };
  if (diff === 'medium') return {
    ip: IP.toInt(`172.${rand(16, 31)}.${rand(0, 255)}.${rand(0, 255)}`),
    c: rand(16, 30)
  };
  return {
    ip: IP.toInt(`${rand(1, 223)}.${rand(0, 255)}.${rand(0, 255)}.${rand(0, 255)}`),
    c: rand(8, 30)
  };
}

function newProblem() {
  Object.assign(solver, genProblem(solver.diff), {
    scored: false,
    hint: false
  });
  $('#solver-problem').textContent = `${IP.toStr(solver.ip)}/${solver.c}`;
  $$('#solver-form input').forEach(i => {
    i.value = '';
    i.classList.remove('ok', 'bad');
  });
  $('#solver-feedback').hidden = true;
  renderSolverTips();
}

/* Guided mode: per-field "how to work it out" tips (method, not the answer) */
$$('#solver-form input').forEach(inp => {
  const tip = document.createElement('small');
  tip.className = 'tip';
  inp.after(tip);
  inp.addEventListener('input', () => {
    if (!$('#solver-guided').checked) return;
    const ok = fieldCorrect(inp, solverAnswers());
    inp.classList.toggle('ok', ok);
    inp.classList.remove('bad');
  });
});
$('#solver-guided').addEventListener('change', renderSolverTips);

function fieldCorrect(inp, ans) {
  const f = inp.dataset.f;
  if (f === 'hosts') return inp.value.replace(/[,\s]/g, '') === ans.hosts;
  return normIP(inp.value) === ans[f];
}

function renderSolverTips() {
  const on = $('#solver-guided').checked;
  const {
    ip,
    c
  } = solver;
  const idx = Math.min(3, Math.floor(c / 8));
  const mo = IP.octets(IP.mask(c))[idx];
  const block = 256 - mo;
  const io = IP.octets(ip)[idx];
  const full = Math.floor(c / 8),
    rem = c % 8;
  const ord = ['1st', '2nd', '3rd', '4th'][idx];
  const tips = {
    mask: `/${c} = ${c} ones. That’s ${full} full octet${full === 1 ? '' : 's'} of 255${rem ? `, then ${rem} more one${rem > 1 ? 's' : ''} in the ${ord} octet (${PV.slice(0, rem).join(' + ')})` : ''}. The rest are 0.`,
    net: `Look at the ${ord} octet. Block size = 256 − (mask value there). Count up in blocks: 0, ${block === 256 ? '…' : `${block}, ${block * 2}…`} The biggest one that is not more than ${io} goes there.${idx < 3 ? ' Every octet after it is 0.' : ''}`,
    bcast: `It’s the last address of the block: in the ${ord} octet, take the network value + block size − 1.${idx < 3 ? ' Every octet after it is 255.' : ''}`,
    first: `Network address + 1 (add 1 to the last octet).`,
    last: `Broadcast address − 1 (subtract 1 from the last octet).`,
    hosts: `Host bits = 32 − ${c} = ${32 - c}. Usable hosts = 2^${32 - c} − 2.`
  };
  $$('#solver-form input').forEach(inp => {
    const t = inp.nextElementSibling;
    t.hidden = !on;
    t.innerHTML = tips[inp.dataset.f];
  });
}

function solverAnswers() {
  const {
    ip,
    c
  } = solver;
  const net = IP.net(ip, c),
    bc = IP.bcast(ip, c);
  return {
    mask: IP.toStr(IP.mask(c)),
    net: IP.toStr(net),
    bcast: IP.toStr(bc),
    first: IP.toStr(net + 1),
    last: IP.toStr(bc - 1),
    hosts: String(IP.hosts(c))
  };
}

function explainSubnet(ip, c) {
  const m = IP.mask(c),
    net = IP.net(ip, c),
    bc = IP.bcast(ip, c);
  const idx = Math.min(3, Math.floor(c / 8));
  const mo = IP.octets(m)[idx],
    io = IP.octets(ip)[idx];
  const block = 256 - mo,
    start = Math.floor(io / block) * block;
  const starts = block === 256 ? '0 (the whole octet)' : [0, block, block * 2, block * 3].filter(x => x < 256).join(', ') + '…';
  return `<ol>
    <li><b>/${c}</b> = ${c} network bits → mask <code>${IP.toStr(m)}</code><br>${binColored(m, c)}</li>
    <li>The interesting octet is <b>octet ${idx + 1}</b>, where the mask is <b>${mo}</b>.</li>
    <li>Block size = 256 − ${mo} = <b>${block}</b>. Blocks start at ${starts}</li>
    <li>Your octet ${idx + 1} is <b>${io}</b>, which falls in the block <b>${start}–${start + block - 1}</b>.</li>
    <li>Network <code>${IP.toStr(net)}</code> (host bits all 0) · Broadcast <code>${IP.toStr(bc)}</code> (host bits all 1)${idx < 3 ? ` — octets after octet ${idx + 1} become 0 and 255` : ''}.</li>
    <li>Usable hosts = 2<sup>${32 - c}</sup> − 2 = <b>${fmt(IP.hosts(c))}</b>, from <code>${IP.toStr(net + 1)}</code> to <code>${IP.toStr(bc - 1)}</code>.</li>
  </ol>`;
}

function normIP(s) {
  const n = IP.toInt(s.replace(/\s+/g, ''));
  return n === null ? null : IP.toStr(n);
}

$('#solver-form').addEventListener('submit', e => {
  e.preventDefault();
  const ans = solverAnswers();
  let right = 0;
  $$('#solver-form input').forEach(inp => {
    const f = inp.dataset.f;
    let ok;
    if (f === 'hosts') ok = inp.value.replace(/[,\s]/g, '') === ans.hosts;
    else ok = normIP(inp.value) === ans[f];
    inp.classList.toggle('ok', ok);
    inp.classList.toggle('bad', !ok);
    if (ok) right++;
  });
  const all = right === 6;
  const fb = $('#solver-feedback');
  fb.hidden = false;
  fb.className = 'feedback ' + (all ? 'good' : 'badf');
  let xpMsg = '';
  if (!solver.scored) {
    solver.scored = true;
    let xp = right * 5 + (all ? 15 : 0);
    if (solver.diff === 'medium') xp = Math.round(xp * 1.5);
    if (solver.diff === 'hard') xp *= 2;
    if (solver.hint) xp = Math.round(xp / 2);
    if (xp) {
      addXP(xp);
      xpMsg = ` +${xp} XP`;
    }
    if (all) {
      hit();
      profile.best.solver = (profile.best.solver || 0) + 1;
      save();
      award('solver');
      if (solver.diff === 'hard' && !solver.hint) award('surgeon');
    } else miss();
  }
  fb.innerHTML = `<div class="verdict">${all ? 'Perfect solve!' : `${right}/6 correct.`}${xpMsg}</div>
    ${all ? '' : '<p>Fix the red fields and check again, or follow the steps:</p>'}${explainSubnet(solver.ip, solver.c)}`;
});
$('#solver-hint').addEventListener('click', () => {
  solver.hint = true;
  const idx = Math.min(3, Math.floor(solver.c / 8));
  const mo = IP.octets(IP.mask(solver.c))[idx];
  const fb = $('#solver-feedback');
  fb.hidden = false;
  fb.className = 'feedback';
  fb.innerHTML = `<div class="verdict">Hint (halves XP)</div>
    /${solver.c} → the mask is <code>${IP.toStr(IP.mask(solver.c))}</code>. The interesting octet is <b>octet ${idx + 1}</b>; block size = 256 − ${mo} = <b>${256 - mo}</b>. Which block does <b>${IP.octets(solver.ip)[idx]}</b> fall into?`;
});
$('#solver-reveal').addEventListener('click', () => {
  const ans = solverAnswers();
  $$('#solver-form input').forEach(inp => {
    inp.value = ans[inp.dataset.f];
    inp.classList.remove('ok', 'bad');
  });
  if (!solver.scored) {
    solver.scored = true;
    miss();
  }
  const fb = $('#solver-feedback');
  fb.hidden = false;
  fb.className = 'feedback';
  fb.innerHTML = `<div class="verdict">Here’s how it works</div>${explainSubnet(solver.ip, solver.c)}`;
});
$('#solver-next').addEventListener('click', newProblem);

/* =========================================================
   Quiz engine (Mask Match, Class Clash, IP Detective, Same Network?)
   Every question has a hint (before answering) and an explanation (after).
   ========================================================= */
function choices(correct, distractors, n = 4) {
  const set = [String(correct)];
  for (const d of distractors) {
    const s = String(d);
    if (!set.includes(s)) set.push(s);
    if (set.length === n) break;
  }
  return {
    options: shuffle(set),
    answer: String(correct)
  };
}

/* ---- Mask Match ---- */
function maskBuild(c) {
  const full = Math.floor(c / 8),
    rem = c % 8;
  const partial = PV.slice(0, rem);
  return `${c} ones = ${full} full octet${full === 1 ? '' : 's'} of 8 ones (255 each)` +
    (rem ? `, plus ${rem} more one${rem === 1 ? '' : 's'} in the next octet: ${partial.join(' + ')} = <b>${partial.reduce((x, y) => x + y, 0)}</b>` : '') +
    `. Every remaining octet is 0.`;
}

function genMaskQ() {
  const t = rand(0, 3);
  if (t === 0) {
    const c = rand(8, 30);
    const d = shuffle([c - 1, c + 1, c - 2, c + 2, c - 8, c + 8].filter(x => x >= 1 && x <= 32)).map(x => IP.toStr(IP.mask(x)));
    return {
      ...choices(IP.toStr(IP.mask(c)), d),
      prompt: `What subnet mask matches <span class="big mono">/${c}</span>?`,
      hint: `/${c} means the mask starts with <b>${c} ones</b>. Fill octets 8 ones at a time (8 ones = 255). If an octet is only partly filled, add up the switch values that are on, starting from 128.`,
      explain: `${maskBuild(c)}<br>${binColored(IP.mask(c), c)}<br>= <code>${IP.toStr(IP.mask(c))}</code>`
    };
  }
  if (t === 1) {
    const c = rand(8, 30);
    const d = shuffle([c - 1, c + 1, c - 2, c + 2, c - 8, c + 8].filter(x => x >= 1 && x <= 32)).map(x => '/' + x);
    return {
      ...choices('/' + c, d),
      prompt: `What CIDR prefix is <span class="big mono">${IP.toStr(IP.mask(c))}</span>?`,
      hint: `Count the 1 bits. Every 255 is 8 ones. For other values: 128 = 1 one, 192 = 2, 224 = 3, 240 = 4, 248 = 5, 252 = 6, 254 = 7. 0 = no ones.`,
      explain: `Count the 1 bits:<br>${binColored(IP.mask(c), c)}<br>${Math.floor(c / 8)} × 8${c % 8 ? ` + ${c % 8}` : ''} = <b>${c}</b> ones → <code>/${c}</code>`
    };
  }
  if (t === 2) {
    const c = rand(20, 30);
    const h = 32 - c;
    const d = shuffle([Math.pow(2, h), IP.hosts(c + 1), IP.hosts(c - 1), Math.pow(2, h) - 1].filter(x => x > 0)).map(fmt);
    return {
      ...choices(fmt(IP.hosts(c)), d),
      prompt: `How many <b>usable hosts</b> are in a <span class="big mono">/${c}</span> subnet?`,
      hint: `An address has 32 bits. /${c} uses ${c} for the network, so host bits = 32 − ${c} = <b>${h}</b>. Usable hosts = 2<sup>host bits</sup> − 2 (the network and broadcast addresses can’t be given to devices).`,
      explain: `${h} host bits → 2<sup>${h}</sup> = ${fmt(Math.pow(2, h))} addresses. Subtract the network and broadcast addresses: <b>${fmt(IP.hosts(c))}</b> usable.`
    };
  }
  const c = rand(20, 29);
  const need = rand(IP.hosts(c + 1) + 1, IP.hosts(c));
  return {
    ...choices('/' + c, shuffle(['/' + (c + 1), '/' + (c - 1), '/' + (c + 2)])),
    prompt: `You need <span class="big mono">${fmt(need)}</span> hosts on one subnet. What is the <b>smallest</b> subnet (largest prefix) that fits?`,
    hint: `Find the smallest number of host bits <i>h</i> where 2<sup>h</sup> − 2 is at least ${fmt(need)}. Try doubling: 2, 4, 8, 16, 32, 64, 128, 256… Then the prefix is 32 − h.`,
    explain: `/${c + 1} only gives ${fmt(IP.hosts(c + 1))} usable hosts, which is too few. /${c} gives 2<sup>${32 - c}</sup> − 2 = <b>${fmt(IP.hosts(c))}</b>, which fits ${fmt(need)}. Anything bigger (like /${c - 1}) works but wastes addresses.`
  };
}

/* ---- Same Network? ---- */
function genSameQ() {
  const c = rand(18, 30);
  const size = Math.pow(2, 32 - c);
  const prefix = pick([`10.${rand(0, 255)}`, `172.${rand(16, 31)}`, `192.168`]);
  const a = IP.toInt(`${prefix}.${rand(0, 255)}.${rand(1, 254)}`);
  const net = IP.net(a, c);
  let b;
  if (Math.random() < 0.5) {
    b = net + rand(1, Math.max(1, size - 2));
    if (b === a) b = net + ((a - net + 1) % size);
  } else {
    // Just across a subnet boundary, to make it tricky
    const up = Math.random() < 0.5 || net < size;
    const spread = Math.min(size - 1, rand(0, 20));
    b = up ? net + size + spread : net - 1 - spread;
  }
  const nb = IP.net(b, c);
  const isSame = nb === net;
  const idx = Math.min(3, Math.floor(c / 8));
  const mo = IP.octets(IP.mask(c))[idx],
    block = 256 - mo;
  const ao = IP.octets(a)[idx],
    bo = IP.octets(b)[idx];
  const sa = Math.floor(ao / block) * block,
    sb = Math.floor(bo / block) * block;
  const opts = ['Same network', 'Different networks'];
  return {
    options: opts,
    answer: isSame ? opts[0] : opts[1],
    prompt: `<div class="pair"><code>A: ${IP.toStr(a)}/${c}</code><code>B: ${IP.toStr(b)}/${c}</code></div>Are these two hosts on the <b>same network</b>?`,
    hint: `/${c} = mask <code>${IP.toStr(IP.mask(c))}</code>. The interesting octet is <b>octet ${idx + 1}</b> (mask value ${mo}), so the block size is 256 − ${mo} = <b>${block}</b>. Do ${ao} and ${bo} fall in the same block of ${block}${idx > 0 ? ', and are the octets before it the same' : ''}?`,
    explain: `Block size ${block} in octet ${idx + 1}: A’s <b>${ao}</b> is in block ${sa}–${sa + block - 1}; B’s <b>${bo}</b> is in block ${sb}–${sb + block - 1}.<br>
      A’s network: <code>${IP.toStr(net)}</code> · B’s network: <code>${IP.toStr(nb)}</code><br>
      ${isSame ? 'The network addresses match, so they’re on the same subnet and can talk directly.' : 'The network addresses are different, so traffic between them has to go through a router.'}`
  };
}

/* ---- IP Detective ---- */
const CATS = ['Private', 'Public', 'Loopback', 'Link-local (APIPA)', 'Multicast'];
const RANGE_HINT = 'Check the first one or two octets: <b>10.x</b>, <b>172.16–172.31.x</b> and <b>192.168.x</b> are private · <b>127.x</b> is loopback · <b>169.254.x</b> is APIPA · <b>224–239</b> is multicast · anything else is public.';

function randomIn(cat) {
  const r = () => rand(0, 255);
  switch (cat) {
    case 'Private':
      return pick([`10.${r()}.${r()}.${rand(1, 254)}`, `172.${rand(16, 31)}.${r()}.${rand(1, 254)}`, `192.168.${r()}.${rand(1, 254)}`]);
    case 'Loopback':
      return pick(['127.0.0.1', `127.${r()}.${r()}.${rand(1, 254)}`]);
    case 'Link-local (APIPA)':
      return `169.254.${rand(1, 254)}.${rand(1, 254)}`;
    case 'Multicast':
      return `${rand(224, 239)}.${r()}.${r()}.${r()}`;
    default: {
      // Sometimes generate look-alikes of private ranges to keep players honest
      if (Math.random() < 0.35) return pick([`172.${pick([rand(0, 15), rand(32, 255)])}.${r()}.${rand(1, 254)}`, `192.${pick([rand(0, 167), rand(169, 255)])}.${r()}.${rand(1, 254)}`, `11.${r()}.${r()}.${rand(1, 254)}`]);
      let a;
      do {
        a = rand(1, 223);
      } while ([10, 100, 127, 169, 172, 192].includes(a));
      return `${a}.${r()}.${r()}.${rand(1, 254)}`;
    }
  }
}

function genDetectiveQ() {
  const cat = pick(['Private', 'Private', 'Public', 'Public', 'Loopback', 'Link-local (APIPA)', 'Multicast']);
  const ip = randomIn(cat);
  const [o1, o2] = IP.octets(IP.toInt(ip));
  const ans = IP.classify(IP.toInt(ip));
  const why = {
    'Private': 'It falls inside a private range: 10.0.0.0/8, 172.16.0.0/12 (172.16 to 172.31) or 192.168.0.0/16. Private addresses are used inside homes and offices and are never routed on the public internet.',
    'Public': 'It isn’t in any private, loopback, link-local or multicast range, so it’s a public address that can be reached on the internet. Watch out for look-alikes such as 172.32.x.x or 192.169.x.x!',
    'Loopback': 'Anything in 127.0.0.0/8 is loopback: the device is talking to itself. 127.0.0.1 is often called “localhost”.',
    'Link-local (APIPA)': '169.254.0.0/16 is what a device gives itself when it can’t reach a DHCP server. Seeing one usually means “something’s wrong with the network”.',
    'Multicast': 'A first octet from 224 to 239 means multicast (Class D): one sender, many receivers, as in video streaming or routing protocols.'
  }[ans];
  return {
    options: CATS,
    answer: ans,
    prompt: `What kind of address is <span class="big mono">${ip}</span>?`,
    hint: RANGE_HINT,
    explain: `The address starts with <b>${o1}.${o2}</b>. ${why}`
  };
}

/* ---- Class Clash ---- */
const CLASS_ROWS = {
  A: {
    range: '1–126',
    lo: 1,
    hi: 126,
    lead: '0',
    mask: '255.0.0.0',
    cidr: 8,
    hosts: 16777214,
    net: 1
  },
  B: {
    range: '128–191',
    lo: 128,
    hi: 191,
    lead: '10',
    mask: '255.255.0.0',
    cidr: 16,
    hosts: 65534,
    net: 2
  },
  C: {
    range: '192–223',
    lo: 192,
    hi: 223,
    lead: '110',
    mask: '255.255.255.0',
    cidr: 24,
    hosts: 254,
    net: 3
  },
  D: {
    range: '224–239',
    lo: 224,
    hi: 239,
    lead: '1110'
  },
  E: {
    range: '240–255',
    lo: 240,
    hi: 255,
    lead: '1111'
  }
};
const CLASS_HINT = 'Look at the <b>first octet</b>. A: 1–126 · B: 128–191 · C: 192–223 · D: 224–239 · E: 240–255.';

function leadHtml(a, k) {
  const b = IP.bin8(a),
    n = CLASS_ROWS[k].lead.length;
  return `<span class="mono"><b style="color:var(--accent)">${b.slice(0, n)}</b>${b.slice(n)}</span>`;
}

function genClassQ() {
  const t = rand(0, 4);
  const k = t === 0 || t === 2 ? pick(['A', 'B', 'C', 'D', 'E']) : pick(['A', 'B', 'C']);
  const R = CLASS_ROWS[k];
  const a = rand(R.lo, R.hi);
  const o = [a, rand(0, 255), rand(0, 255), rand(1, 254)];
  const ip = o.join('.');
  if (t === 0) {
    return {
      options: ['A', 'B', 'C', 'D', 'E'],
      answer: k,
      prompt: `Which class is <span class="big mono">${ip}</span>?`,
      hint: CLASS_HINT,
      explain: `The first octet is <b>${a}</b>, which is in the ${R.range} range → <b>Class ${k}</b>.<br>In binary, ${a} = ${leadHtml(a, k)}: it starts with <b>${R.lead}</b>, which is what makes it Class ${k}.`
    };
  }
  if (t === 1) {
    return {
      options: ['255.0.0.0', '255.255.0.0', '255.255.255.0', '255.255.255.255'],
      answer: R.mask,
      prompt: `What is the <b>default subnet mask</b> of <span class="big mono">${ip}</span>?`,
      hint: `First find the class from the first octet (${CLASS_HINT.replace('Look at the <b>first octet</b>. ', '')}). Then Class A → 255.0.0.0, Class B → 255.255.0.0, Class C → 255.255.255.0.`,
      explain: `${a} is in ${R.range} → <b>Class ${k}</b> → default mask <code>${R.mask}</code> (/${R.cidr}). One “255” for each network octet.`
    };
  }
  if (t === 2) {
    const b = IP.bin8(a);
    return {
      options: ['A', 'B', 'C', 'D', 'E'],
      answer: k,
      prompt: `The first octet of an address in binary is <span class="big mono">${b}</span>. Which class is it?`,
      hint: 'You don’t even need to convert it. Just look at how it <b>starts</b>: 0… = A · 10… = B · 110… = C · 1110… = D · 1111… = E.',
      explain: `It starts with <b>${R.lead}</b> → <b>Class ${k}</b>. (${leadHtml(a, k)} = ${a}, which is in ${R.range}.)`
    };
  }
  if (t === 3) {
    const hb = 32 - R.cidr;
    return {
      options: [fmt(254), fmt(65534), fmt(16777214), fmt(256)],
      answer: fmt(R.hosts),
      prompt: `How many usable hosts fit in one <b>Class ${k}</b> network (default mask)?`,
      hint: `Class ${k} uses ${R.net} octet${R.net > 1 ? 's' : ''} for the network, leaving ${4 - R.net} octet${4 - R.net > 1 ? 's' : ''} = <b>${hb} host bits</b>. Usable hosts = 2<sup>host bits</sup> − 2.`,
      explain: `Class ${k} → /${R.cidr} → ${hb} host bits → 2<sup>${hb}</sup> − 2 = <b>${fmt(R.hosts)}</b> usable hosts.`
    };
  }
  const parts = [o.slice(0, 1).join('.'), o.slice(0, 2).join('.'), o.slice(0, 3).join('.'), ip];
  const ans = parts[R.net - 1];
  return {
    options: parts,
    answer: ans,
    prompt: `Using its <b>default classful mask</b>, which part of <span class="big mono">${ip}</span> is the <b>network</b> portion?`,
    hint: `Find the class first. Class A = the first octet is network · Class B = the first two · Class C = the first three. The rest is the host.`,
    explain: `${a} → <b>Class ${k}</b> → the first ${R.net} octet${R.net > 1 ? 's are' : ' is'} the network: <b>${ans}</b>. The rest (<b>${o.slice(R.net).join('.')}</b>) identifies the host.`
  };
}

/* ---- Intros & cheat sheets ---- */
const maskCheat = () => `<div class="table-wrap"><table class="ref"><tr><th>CIDR</th><th>Mask</th><th>Host bits</th><th>Usable hosts</th></tr>${
  [8, 16, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30].map(c => `<tr><td>/${c}</td><td class="mono">${IP.toStr(IP.mask(c))}</td><td>${32 - c}</td><td>${fmt(IP.hosts(c))}</td></tr>`).join('')}</table></div>`;
const blockCheat = `<div class="table-wrap"><table class="ref"><tr><th>Mask octet</th><th>Binary</th><th>Block size (256 − value)</th></tr>${
  [128, 192, 224, 240, 248, 252].map(v => `<tr><td>${v}</td><td class="mono">${IP.bin8(v)}</td><td>${256 - v}</td></tr>`).join('')}</table></div>
  <p class="small">Subnets start at multiples of the block size. Two IPs are on the same network if they fall in the same block.</p>`;
const rangeCheat = `<div class="table-wrap"><table class="ref"><tr><th>Range</th><th>Type</th></tr>
  <tr><td>10.0.0.0 – 10.255.255.255</td><td>Private</td></tr>
  <tr><td>172.16.0.0 – 172.31.255.255</td><td>Private</td></tr>
  <tr><td>192.168.0.0 – 192.168.255.255</td><td>Private</td></tr>
  <tr><td>127.0.0.0 – 127.255.255.255</td><td>Loopback</td></tr>
  <tr><td>169.254.0.0 – 169.254.255.255</td><td>Link-local (APIPA)</td></tr>
  <tr><td>224.0.0.0 – 239.255.255.255</td><td>Multicast</td></tr>
  <tr><td>Everything else (mostly)</td><td>Public</td></tr></table></div>`;
const classCheat = `<div class="table-wrap"><table class="ref"><tr><th>Class</th><th>First octet</th><th>Starts with</th><th>Default mask</th><th>Network.Host</th><th>Hosts/network</th></tr>${
  Object.entries(CLASS_ROWS).map(([k, r]) => `<tr><td>${k}</td><td>${r.range}</td><td class="mono">${r.lead}</td><td>${r.mask || '—'}</td><td>${r.net ? ['N.H.H.H', 'N.N.H.H', 'N.N.N.H'][r.net - 1] : '—'}</td><td>${r.hosts ? fmt(r.hosts) : (k === 'D' ? 'Multicast' : 'Reserved')}</td></tr>`).join('')}</table></div>`;

const QUIZZES = {
  mask: {
    title: 'Mask Match',
    gen: genMaskQ,
    cheat: maskCheat(),
    intro: `<h3>Quick refresher: masks &amp; CIDR</h3><ul>
      <li>A <b>subnet mask</b> is 32 bits: a row of <span class="tag net">1s</span> (the network part) followed by <span class="tag host">0s</span> (the host part).</li>
      <li><b>/N</b> (CIDR notation) just counts the 1s. <code>/24</code> = 24 ones = <code>255.255.255.0</code>.</li>
      <li>An octet full of 1s is <b>255</b>. A partly filled octet can only be 128, 192, 224, 240, 248, 252 or 254.</li>
      <li><b>Usable hosts</b> = 2<sup>(32 − N)</sup> − 2.</li></ul>`
  },
  classes: {
    title: 'Class Clash',
    gen: genClassQ,
    cheat: classCheat,
    intro: `<h3>Quick refresher: IP classes</h3><ul>
      <li>The old “classful” system decides the class from the <b>first octet</b>: A 1–126, B 128–191, C 192–223, D 224–239 (multicast), E 240–255 (experimental).</li>
      <li>Each class has a default mask: A = <code>255.0.0.0</code>, B = <code>255.255.0.0</code>, C = <code>255.255.255.0</code>.</li>
      <li>In binary the first bits give it away: A starts with <b>0</b>, B with <b>10</b>, C with <b>110</b>, D with <b>1110</b>.</li>
      <li>127 is missing from Class A because it’s reserved for loopback.</li></ul>`
  },
  detective: {
    title: 'IP Detective',
    gen: genDetectiveQ,
    cheat: rangeCheat,
    intro: `<h3>Quick refresher: special ranges</h3><ul>
      <li><b>Private</b> (used inside homes and offices, not on the internet): <code>10.x.x.x</code>, <code>172.16.x.x – 172.31.x.x</code>, <code>192.168.x.x</code>.</li>
      <li><b>Loopback</b>: <code>127.x.x.x</code>, the device talking to itself.</li>
      <li><b>Link-local / APIPA</b>: <code>169.254.x.x</code>, self-assigned when DHCP fails.</li>
      <li><b>Multicast</b>: first octet 224–239.</li>
      <li><b>Public</b>: everything else. Watch out for tricks like 172.32.x.x (public!).</li></ul>`
  },
  same: {
    title: 'Same Network?',
    gen: genSameQ,
    cheat: blockCheat,
    intro: `<h3>Quick refresher: are they neighbours?</h3><ul>
      <li>Two devices are on the same network only if they have the same <b>network address</b> (the IP with all host bits set to 0).</li>
      <li>Shortcut: find the <b>interesting octet</b> (where the mask isn’t 255 or 0). <b>Block size</b> = 256 − that mask value.</li>
      <li>Subnets start at 0, block, 2×block… If both IPs land in the same block (and the earlier octets match), they’re on the same network.</li>
      <li><b>Example:</b> /26 → mask 255.255.255.192 → block 64. Hosts .10 and .60 are both in 0–63 (same). .60 and .70 are not (0–63 vs 64–127).</li></ul>`
  }
};
const QUIZ_LEN = 10;
let quiz = null;

function startQuiz(kind) {
  if (!QUIZZES[kind]) kind = 'mask';
  const Q = QUIZZES[kind];
  quiz = {
    kind,
    i: 0,
    score: 0,
    q: null,
    answered: false,
    hinted: false
  };
  $('#quiz-title').textContent = Q.title;
  $('#quiz-cheat-body').innerHTML = Q.cheat;
  $('#quiz-cheat').open = false;
  $('#quiz-body').hidden = true;
  $('#quiz-end').hidden = true;
  $('#quiz-num').textContent = 1;
  $('#quiz-score').textContent = 0;
  $('#quiz-progress').style.width = '0%';
  const intro = $('#quiz-intro');
  intro.hidden = false;
  intro.innerHTML = `${Q.intro}
    <p class="small dim">Stuck on a question? Press <b>💡 Hint</b> (you still get half XP), or open the cheat sheet below. Every answer comes with an explanation, so you learn as you go.</p>
    <div class="row"><button class="btn primary" id="quiz-go">Start the quiz →</button><a class="btn" href="#learn">Review the lessons</a></div>`;
  $('#quiz-go').addEventListener('click', () => {
    intro.hidden = true;
    $('#quiz-body').hidden = false;
    nextQ();
  });
}

function nextQ() {
  if (quiz.i >= QUIZ_LEN) return endQuiz();
  quiz.q = QUIZZES[quiz.kind].gen();
  quiz.answered = false;
  quiz.hinted = false;
  $('#quiz-num').textContent = quiz.i + 1;
  $('#quiz-score').textContent = quiz.score;
  $('#quiz-progress').style.width = (quiz.i / QUIZ_LEN * 100) + '%';
  $('#quiz-prompt').innerHTML = quiz.q.prompt;
  $('#quiz-options').innerHTML = quiz.q.options.map((o, i) =>
    `<button class="opt" data-o="${esc(o)}"><span class="k">${i + 1}</span><span class="t">${esc(o)}</span></button>`).join('');
  $$('#quiz-options .opt').forEach(b => b.addEventListener('click', () => answerQ(b)));
  $('#quiz-feedback').hidden = true;
  $('#quiz-hintbox').hidden = true;
  $('#quiz-hint').hidden = false;
  $('#quiz-next').hidden = true;
}

function showHint() {
  if (!quiz || quiz.answered) return;
  quiz.hinted = true;
  const h = $('#quiz-hintbox');
  h.hidden = false;
  h.innerHTML = `<div class="verdict">💡 Hint</div>${quiz.q.hint}`;
}

function answerQ(btn) {
  if (!quiz || quiz.answered) return;
  quiz.answered = true;
  const ok = btn.dataset.o === quiz.q.answer;
  $$('#quiz-options .opt').forEach(b => {
    b.disabled = true;
    if (b.dataset.o === quiz.q.answer) b.classList.add('ok');
    else if (b === btn) b.classList.add('bad');
    else b.classList.add('faded');
  });
  const xp = quiz.hinted ? 5 : 10;
  if (ok) {
    quiz.score++;
    hit();
    addXP(xp);
  } else miss();
  quiz.i++;
  $('#quiz-score').textContent = quiz.score;
  $('#quiz-progress').style.width = (quiz.i / QUIZ_LEN * 100) + '%';
  $('#quiz-hint').hidden = true;
  const fb = $('#quiz-feedback');
  fb.hidden = false;
  fb.className = 'feedback ' + (ok ? 'good' : 'badf');
  fb.innerHTML = `<div class="verdict">${ok ? `Correct! +${xp} XP` : `Not quite. The answer is ${esc(quiz.q.answer)}.`}</div><div class="why"><b>Why:</b> ${quiz.q.explain}</div>`;
  const nx = $('#quiz-next');
  nx.hidden = false;
  nx.textContent = quiz.i >= QUIZ_LEN ? 'See results →' : 'Next →';
  nx.focus({
    preventScroll: true
  });
}
$('#quiz-next').addEventListener('click', nextQ);
$('#quiz-hint').addEventListener('click', showHint);

function endQuiz() {
  const record = setBest(quiz.kind, quiz.score);
  if (quiz.score === QUIZ_LEN) award('flawless');
  const msg = quiz.score === 10 ? 'Flawless. Packet-perfect.' : quiz.score >= 8 ? 'Excellent work!' : quiz.score >= 5 ? 'Solid. Keep practising.' : 'Every mistake is a lesson. Review the explanations and try again!';
  $('#quiz-body').hidden = true;
  const end = $('#quiz-end');
  end.hidden = false;
  end.innerHTML = `
    <h2>${QUIZZES[quiz.kind].title} complete</h2>
    <div class="endscore">${quiz.score}/${QUIZ_LEN}</div>
    <p>${msg}${record ? ' 🏆 New personal best!' : ''}</p>
    <div class="row center">
      <button class="btn primary" id="quiz-again">Play again</button>
      <a class="btn" href="#play">Other games</a>
      <a class="btn" href="#learn">Lessons</a>
    </div>`;
  $('#quiz-again').addEventListener('click', () => startQuiz(quiz.kind));
}

/* =========================================================
   Keyboard shortcuts
   ========================================================= */
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const view = (location.hash.slice(1) || 'home').split('/')[0];
  if (view === 'blitz' && blitz.running && /^[1-8]$/.test(e.key)) {
    flipBit(PV[Number(e.key) - 1]);
    e.preventDefault();
  }
  if (view === 'quiz' && quiz && !$('#quiz-body').hidden) {
    if (!quiz.answered && /^[1-9]$/.test(e.key)) {
      const btn = $$('#quiz-options .opt')[Number(e.key) - 1];
      if (btn) {
        answerQ(btn);
        e.preventDefault();
      }
    } else if (quiz.answered && e.key === 'Enter' && document.activeElement !== $('#quiz-next')) {
      nextQ();
      e.preventDefault();
    }
  }
});

/* =========================================================
   Boot
   ========================================================= */
renderHUD();
route();
