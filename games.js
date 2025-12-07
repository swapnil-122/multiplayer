/* Tap Coin Deluxe — games.js
   Features:
   - Shop with persistent upgrades & skins
   - Enemies (bombs) to avoid
   - Levels and progression (difficulty scaling)
   - Vector graphics and skins/themes
   - WebAudio SFX & simple background music
   - High scores saved locally (top 5)
   - Touch-and-drag collector (bottom)
   - Skins & themes
*/

// ---------- Constants & DOM ----------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: true });

const scoreValue = document.getElementById('scoreValue');
const livesValue = document.getElementById('livesValue');
const levelValue = document.getElementById('levelValue');
const coinsValue = document.getElementById('coinsValue');
const comboValue = document.getElementById('comboValue');

const shopModal = document.getElementById('shop');
const skinsModal = document.getElementById('skins');
const settingsModal = document.getElementById('settings');
const shopItemsWrap = document.getElementById('shopItems');
const shopCoins = document.getElementById('shopCoins');
const skinList = document.getElementById('skinList');

const gameOverScreen = document.getElementById('gameOver');
const finalScore = document.getElementById('finalScore');
const finalCoins = document.getElementById('finalCoins');
const highScoreList = document.getElementById('highScoreList');

const btnShop = document.getElementById('btnShop');
const btnSkins = document.getElementById('btnSkins');
const btnSettings = document.getElementById('btnSettings');
const restartBtn = document.getElementById('restartBtn');
const toShopBtn = document.getElementById('toShopBtn');

const toggleSound = document.getElementById('toggleSound');
const toggleMusic = document.getElementById('toggleMusic');

let W = 0, H = 0;
function resize(){ W = canvas.width = innerWidth; H = canvas.height = innerHeight; }
addEventListener('resize', resize);
resize();

// ---------- Local Storage keys ----------
const LS = {
  SETTINGS: 'tapcoin_settings_v2',
  UPGRADES: 'tapcoin_upgrades_v2',
  HIGHSCORES: 'tapcoin_highscores_v2',
  PROFILE: 'tapcoin_profile_v2'
};

// ---------- Default persistent data ----------
const defaultSettings = {
  sound: true, music: true, theme: 'ocean'
};
const defaultUpgrades = {
  coinValue: 1,
  maxLives: 3,
  magnetDuration: 2500, // ms
  slowDuration: 2500,
  autoCollect: false,
  skinsOwned: ['classic'],
  activeSkin: 'classic'
};
const defaultProfile = {
  coins: 0
};

// ---------- Load / Save helpers ----------
function load(key, fallback){ try { const j = localStorage.getItem(key); return j ? JSON.parse(j) : fallback; } catch(e){ return fallback; } }
function save(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){} }

let settings = load(LS.SETTINGS, defaultSettings);
let upgrades = load(LS.UPGRADES, defaultUpgrades);
let profile = load(LS.PROFILE, defaultProfile);
let highscores = load(LS.HIGHSCORES, []);

// Apply UI toggles from settings
toggleSound.checked = !!settings.sound;
toggleMusic.checked = !!settings.music;

// ---------- Game state ----------
let state = {
  running: true,
  score: 0,
  lives: upgrades.maxLives,
  level: 1,
  coinsEarned: 0,
  coinObjects: [],
  bombs: [],
  powerups: [],
  particles: [],
  combo: 1,
  comboTimer: 0,
  collectorX: W / 2,
  collectorW: 120,
  isDragging: false,
  lastSpawn: 0,
  spawnInterval: 950, // ms, reduces with level
  enemyChance: 0.06,
  powerupChance: 0.03,
  magnetActiveUntil: 0,
  slowActiveUntil: 0,
  unlockedSkins: upgrades.skinsOwned || ['classic']
};

// ---------- Audio (WebAudio) ----------
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function ensureAudio(){
  if (!audioCtx){
    audioCtx = new AudioCtx();
    if (!settings.music) stopMusic();
    if (settings.music) startMusic();
  }
}
function playBeep(freq = 440, length = 0.08, type='sine', vol = 0.12){
  if (!settings.sound) return;
  ensureAudio();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g); g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + length);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + length);
}
let musicOsc = null;
function startMusic(){
  if (!settings.music) return;
  ensureAudio();
  if (musicOsc) return;
  // simple ambient drone using two oscillators modulated
  musicOsc = audioCtx.createGain();
  musicOsc.gain.value = 0.04;
  musicOsc.connect(audioCtx.destination);

  const o1 = audioCtx.createOscillator(); o1.type='sine'; o1.frequency.value = 110;
  const o2 = audioCtx.createOscillator(); o2.type='sine'; o2.frequency.value = 220;
  const g1 = audioCtx.createGain(); g1.gain.value = 0.7;
  const g2 = audioCtx.createGain(); g2.gain.value = 0.6;
  o1.connect(g1); o2.connect(g2);
  g1.connect(musicOsc); g2.connect(musicOsc);
  o1.start(); o2.start();
  musicOsc._nodes = [o1,o2,g1,g2];
}
function stopMusic(){
  if (!musicOsc) return;
  musicOsc._nodes.forEach(n => { try { n.stop(); } catch(e){} });
  try { musicOsc.disconnect(); } catch(e){}
  musicOsc = null;
}

// ---------- UI: Shop & Skins ----------
const SHOP_ITEMS = [
  { id:'coin_plus', title:'+ Coin Value', desc:'Increase base coin value by 1', cost:40, apply(){ upgrades.coinValue += 1; save(LS.UPGRADES, upgrades); } },
  { id:'life_plus', title:'+1 Life (max)', desc:'Increase max lives by 1', cost:80, apply(){ upgrades.maxLives += 1; state.lives = upgrades.maxLives; save(LS.UPGRADES, upgrades); } },
  { id:'magnet_up', title:'Longer Magnet', desc:'Increase magnet duration', cost:60, apply(){ upgrades.magnetDuration += 1500; save(LS.UPGRADES, upgrades); } },
  { id:'slow_up', title:'Longer Slow', desc:'Increase slow duration', cost:60, apply(){ upgrades.slowDuration += 1500; save(LS.UPGRADES, upgrades); } },
  { id:'auto_collect', title:'Auto-collect', desc:'Auto-catch nearby coins', cost:250, apply(){ upgrades.autoCollect = true; save(LS.UPGRADES, upgrades); } },
  { id:'skin_neon', title:'Neon Skin', desc:'Unlock a neon coin skin', cost:120, apply(){ if (!upgrades.skinsOwned.includes('neon')) upgrades.skinsOwned.push('neon'); save(LS.UPGRADES, upgrades); } }
];

function renderShop(){
  shopCoins.textContent = profile.coins;
  shopItemsWrap.innerHTML = '';
  SHOP_ITEMS.forEach(it=>{
    const div = document.createElement('div'); div.className='shopItem';
    div.innerHTML = `<div>
        <div style="font-weight:800">${it.title}</div>
        <div style="font-size:13px;opacity:.9">${it.desc}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <div style="font-weight:900">${it.cost}</div>
        <button ${profile.coins < it.cost ? 'disabled' : ''}>Buy</button>
      </div>`;
    const btn = div.querySelector('button');
    btn.onclick = ()=>{
      if (profile.coins >= it.cost){
        profile.coins -= it.cost; save(LS.PROFILE, profile);
        it.apply();
        renderShop(); updateHUD();
        playBeep(880,0.06,'square',0.08);
      } else { playBeep(200,0.08,'sawtooth',0.06); }
    };
    shopItemsWrap.appendChild(div);
  });
}

// Skins
const SKINS = {
  classic: { display:'Classic', accent:'#f5c04a', shape:'circle' },
  neon: { display:'Neon', accent:'#7cfffb', shape:'star' },
  ocean: { display:'Ocean', accent:'#6ac3ff', shape:'droplet' }
};
function renderSkins(){
  skinList.innerHTML = '';
  Object.keys(SKINS).forEach(k=>{
    const s = SKINS[k];
    const tile = document.createElement('div');
    tile.className='skinTile';
    tile.title = s.display + (upgrades.skinsOwned.includes(k) ? '' : ' (locked)');
    tile.innerHTML = `<div style="text-align:center">
        <div style="font-weight:800">${s.display}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.6)">${k===upgrades.activeSkin ? 'Active' : (upgrades.skinsOwned.includes(k) ? 'Owned' : 'Locked')}</div>
      </div>`;
    tile.onclick = ()=>{
      if (!upgrades.skinsOwned.includes(k)) {
        // try to buy quick if have coins (cheap)
        if (profile.coins >= 50){
          profile.coins -= 50; upgrades.skinsOwned.push(k);
          upgrades.activeSkin = k; save(LS.UPGRADES, upgrades); save(LS.PROFILE, profile);
          renderSkins(); updateHUD(); playBeep(700,0.06,'square',0.08);
        } else {
          playBeep(220,0.08,'sawtooth',0.06);
        }
      } else {
        upgrades.activeSkin = k; save(LS.UPGRADES, upgrades); renderSkins(); updateHUD(); playBeep(900,0.04,'sine',0.08);
      }
    };
    skinList.appendChild(tile);
  });
}

// ---------- High Scores ----------
function saveHighscore(score){
  highscores.push({score, date:Date.now()});
  highscores.sort((a,b)=>b.score-a.score);
  highscores = highscores.slice(0,5);
  save(LS.HIGHSCORES, highscores);
}
function renderHighScores(){
  highScoreList.innerHTML = highscores.length ? highscores.map(h=>{
    const d = new Date(h.date);
    return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed rgba(255,255,255,0.03)"><span>${h.score}</span><small style="opacity:.6">${d.toLocaleString()}</small></div>`;
  }).join('') : '<div style="opacity:.7">No high scores yet</div>';
}

// ---------- Utility ----------
function rand(min,max){ return Math.random()*(max-min)+min; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function now(){ return performance.now(); }

// ---------- Game Objects ----------
function spawnCoin(){
  const typeRoll = Math.random();
  const types = ['normal','fast','rare'];
  let type = 'normal';
  if (typeRoll < 0.12) type = 'rare';
  else if (typeRoll < 0.33) type = 'fast';

  const x = rand(24, W-24);
  const y = -30;
  const baseSpeed = type === 'fast' ? rand(4.6,6.6) : type === 'rare' ? rand(2.8,4.0) : rand(3.0,4.4);

  state.coinObjects.push({ x,y, vx:0, vy:baseSpeed, type, id:Math.random(), radius: type==='rare'?28:20, collected:false });
}

function spawnBomb(){
  const x = rand(28, W-28), y=-36;
  state.bombs.push({x,y,vy:rand(3.5,6.2), radius:22, id:Math.random()});
}

function spawnPowerup(){
  const types = ['magnet','slow','coin_big'];
  const t = types[Math.floor(Math.random()*types.length)];
  state.powerups.push({ x: rand(28,W-28), y:-40, vy:rand(2.8,4.4), type:t, radius:20, id:Math.random() });
}

// Particles
function spawnParticles(x,y,count=10, col='rgba(255,230,180,0.95)'){
  for(let i=0;i<count;i++){
    state.particles.push({
      x,y,
      vx:rand(-2.6,2.6),
      vy:rand(-3.6,1.6),
      life: rand(30,80),
      col
    });
  }
}

// ---------- Collector (touch & drag) ----------
function setCollectorFromPointer(x){
  state.collectorX = clamp(x, state.collectorW/2, W - state.collectorW/2);
}

// Pointer handling
canvas.addEventListener('pointerdown', e=>{
  // don't steal if UI clicked
  if (e.target !== canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // if tapped a coin on screen -> pop (tap) else start dragging collector if near bottom
  let tapped = false;
  for (let i = state.coinObjects.length - 1; i >= 0; i--) {
    const c = state.coinObjects[i];
    if (Math.hypot(c.x - x, c.y - y) < c.radius + 8) {
      popCoin(c);
      tapped = true;
      break;
    }
  }
  for (let i = state.powerups.length - 1; i >= 0 && !tapped; i--) {
    const p = state.powerups[i];
    if (Math.hypot(p.x - x, p.y - y) < p.radius + 6) {
      collectPowerup(p);
      tapped = true;
      break;
    }
  }
  if (!tapped){
    // start dragging
    state.isDragging = true;
    setCollectorFromPointer(x);
  }
});
window.addEventListener('pointermove', e=>{
  if (!state.isDragging) return;
  const rect = canvas.getBoundingClientRect();
  setCollectorFromPointer(e.clientX - rect.left);
});
window.addEventListener('pointerup', e=>{ state.isDragging = false; });

// ---------- Gameplay: tap/pop/collect ----------
function popCoin(c){
  // tapping a coin gives combo + score but does not add to coin inventory unless collected by collector
  if (c.collected) return;
  playBeep(900,0.05,'sine',0.08);
  spawnParticles(c.x, c.y, 12, 'rgba(255,215,120,0.95)');
  // score based on type and upgrades
  const base = (c.type === 'normal') ? 1 : (c.type === 'fast') ? 2 : 6;
  const total = base * upgrades.coinValue * state.combo;
  state.score += total;
  state.combo++;
  state.comboTimer = 1200; // ms
  state.coinObjects = state.coinObjects.filter(xx => xx.id !== c.id);
  // reward small coin currency for popped coin
  const give = Math.max(0, Math.round(total * 0.25));
  profile.coins += give; profile.coins = Math.floor(profile.coins);
  save(LS.PROFILE, profile);
  updateHUD();
}

function collectCoin(c){
  if (c.collected) return;
  c.collected = true;
  playBeep(1200,0.06,'triangle',0.09);
  spawnParticles(c.x, c.y, 10, 'rgba(200,255,240,0.95)');
  const base = (c.type === 'normal') ? 1 : (c.type === 'fast') ? 2 : 6;
  const total = base * upgrades.coinValue * state.combo;
  state.score += total;
  state.coinsEarned += Math.round(total * 0.5);
  profile.coins += Math.round(total * 0.5);
  profile.coins = Math.floor(profile.coins);
  save(LS.PROFILE, profile);
  state.combo++;
  state.comboTimer = 1200;
  // remove object
  state.coinObjects = state.coinObjects.filter(xx => xx.id !== c.id);
  updateHUD();
}

// powerup collected by tap or collector
function collectPowerup(p){
  playBeep(600,0.07,'sine',0.08);
  if (p.type === 'magnet'){
    state.magnetActiveUntil = now() + upgrades.magnetDuration;
  } else if (p.type === 'slow'){
    state.slowActiveUntil = now() + upgrades.slowDuration;
  } else if (p.type === 'coin_big'){
    profile.coins += 25; save(LS.PROFILE, profile);
  }
  state.powerups = state.powerups.filter(x => x.id !== p.id);
  updateHUD();
}

// bomb tapped
function tapBomb(b){
  playBeep(150,0.12,'sawtooth',0.12);
  spawnParticles(b.x, b.y, 20, 'rgba(255,100,80,0.95)');
  state.lives -= 1;
  state.bombs = state.bombs.filter(x => x.id !== b.id);
  if (state.lives <= 0) endGame();
  updateHUD();
}

// ---------- Level progression ----------
function updateLevel(){
  const nextLevelAt = 50 * state.level; // e.g., level up every 50 points*level
  if (state.score >= nextLevelAt){
    state.level++;
    // scale difficulty
    state.spawnInterval = Math.max(300, state.spawnInterval * 0.88);
    state.enemyChance = Math.min(0.22, state.enemyChance + 0.02);
    state.powerupChance = Math.min(0.12, state.powerupChance + 0.006);
    playBeep(1200 + state.level*40, 0.14, 'sine', 0.09);
    // reward a coin pack for leveling up
    profile.coins += 12 + (state.level*2);
    save(LS.PROFILE, profile);
    updateHUD();
  }
}

// ---------- HUD Update ----------
function updateHUD(){
  scoreValue.textContent = Math.floor(state.score);
  livesValue.textContent = state.lives;
  levelValue.textContent = state.level;
  coinsValue.textContent = profile.coins;
  comboValue.textContent = 'x' + Math.max(1,state.combo);
  shopCoins.textContent = profile.coins;
}

// ---------- Game loop ----------
let lastFrame = now();
function gameLoop(){
  const t = now();
  const dt = t - lastFrame;
  lastFrame = t;

  // spawn logic
  if (t - state.lastSpawn > state.spawnInterval){
    state.lastSpawn = t;
    if (Math.random() < state.enemyChance) spawnBomb();
    if (Math.random() < state.powerupChance) spawnPowerup();
    spawnCoin();
  }

  // update coins
  const magnetOn = t < state.magnetActiveUntil;
  const slowOn = t < state.slowActiveUntil;
  state.coinObjects.forEach(c=>{
    // magnet effect
    if (magnetOn){
      const dx = state.collectorX - c.x;
      const dy = (H-80) - c.y;
      const dist = Math.hypot(dx,dy);
      if (dist < 220){
        c.vx += (dx/dist) * 0.12;
        c.vy += (dy/dist) * 0.12;
      }
    }
    // slow effect
    if (slowOn) { c.vy *= 0.985; }
    c.x += c.vx; c.y += c.vy;

    // collector auto-catch or collision
    const colLeft = state.collectorX - state.collectorW/2;
    const colRight = state.collectorX + state.collectorW/2;
    const colTop = H - 80;
    if ((c.y + c.radius) >= colTop && c.x > colLeft && c.x < colRight){
      collectCoin(c);
    }
  });

  // bombs
  state.bombs.forEach(b=>{
    b.y += b.vy;
    // bomb collides with collector
    const colLeft = state.collectorX - state.collectorW/2;
    const colRight = state.collectorX + state.collectorW/2;
    const colTop = H - 80;
    if ((b.y + b.radius) >= colTop && b.x > colLeft && b.x < colRight){
      // bomb hits player
      playBeep(160,0.18,'sawtooth',0.12);
      spawnParticles(b.x, b.y, 26, 'rgba(255,120,80,0.95)');
      state.lives -= 1;
      state.bombs = state.bombs.filter(x=>x.id !== b.id);
      if (state.lives <= 0) endGame();
      updateHUD();
    }
  });

  // powerups
  state.powerups.forEach(p=>{ p.y += p.vy; if (p.y > H + 60) state.powerups = state.powerups.filter(x=>x.id!==p.id); });

  // remove coins off-screen
  state.coinObjects = state.coinObjects.filter(c=>{
    if (c.y > H + 60){
      // missed normal/fast/rare => lose life for rare and normal
      if (['normal','fast','rare'].includes(c.type)){
        state.lives -= (c.type==='rare'?1:0); // only rare causes life loss; normal just vanish
        if (state.lives <= 0) endGame();
        updateHUD();
      }
      return false;
    }
    return true;
  });

  // particles update
  state.particles = state.particles.filter(p=>{
    p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.life--;
    return p.life > 0;
  });

  // combo timer
  if (state.comboTimer > 0){
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) { state.combo = 1; state.comboTimer = 0; }
  }

  // auto-collect upgrade effect (soft magnet)
  if (upgrades.autoCollect){
    state.coinObjects.forEach(c=>{
      const dx = state.collectorX - c.x;
      const dy = (H-80) - c.y;
      const dist = Math.hypot(dx,dy);
      if (dist < 120){
        c.vx += (dx/dist) * 0.07;
        c.vy += (dy/dist) * 0.07;
      }
    });
  }

  // level progression
  updateLevel();

  // render
  drawFrame();

  updateHUD();

  if (state.running) requestAnimationFrame(gameLoop);
}

// ---------- Drawing ----------
function drawFrame(){
  ctx.clearRect(0,0,W,H);

  // background subtle gradient that changes with level/theme
  const theme = upgrades.activeSkin || 'classic';
  let bgA = '#04141a', bgB = '#021017';
  if (theme === 'neon'){ bgA = '#02020c'; bgB = '#071a2b'; }
  if (theme === 'ocean'){ bgA = '#04162b'; bgB = '#001520'; }
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,bgA); g.addColorStop(1,bgB);
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

  // level bar
  ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(8,H-46, W-16, 28);
  const levelPct = clamp((state.score % (50*state.level)) / (50*state.level), 0, 1);
  ctx.fillStyle = 'linear-gradient(90deg,#ffd37a,#ff8a5b)';
  ctx.fillRect(8,H-46, Math.max(6,(W-16)*levelPct), 28);

  // draw powerups
  state.powerups.forEach(p=>{
    drawPowerup(p);
  });

  // draw coins
  state.coinObjects.forEach(c=>{
    drawCoin(c);
  });

  // draw bombs
  state.bombs.forEach(b=>{
    drawBomb(b);
  });

  // draw particles
  state.particles.forEach(p=>{
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x, p.y, 3, 3);
  });

  // draw collector
  drawCollector();

  // HUD overlays (small)
  if (now() < state.magnetActiveUntil){
    ctx.fillStyle = 'rgba(120,200,255,0.07)';
    ctx.beginPath(); ctx.arc(state.collectorX, H-60, 120, 0, Math.PI*2); ctx.fill();
  }
}

// coin visuals depending on skin
function drawCoin(c){
  const skin = SKINS[upgrades.activeSkin] || SKINS.classic;
  ctx.save();
  ctx.translate(c.x, c.y);
  // shadow
  ctx.beginPath(); ctx.ellipse(0, c.radius+8, c.radius*0.9, c.radius*0.3, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  // shape
  if (skin.shape === 'circle'){
    ctx.beginPath(); ctx.arc(0,0,c.radius,0,Math.PI*2);
    ctx.fillStyle = skin.accent || '#f5c04a'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.stroke();
    // inner shine
    ctx.beginPath(); ctx.arc(-c.radius*0.22, -c.radius*0.32, c.radius*0.28, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
  } else if (skin.shape === 'star'){
    // star path
    const r = c.radius;
    ctx.beginPath();
    for (let i=0;i<5;i++){
      const a = i * (Math.PI*2/5) - Math.PI/2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      ctx.lineTo(x,y);
      const a2 = a + (Math.PI/5);
      ctx.lineTo(Math.cos(a2) * (r*0.5), Math.sin(a2) * (r*0.5));
    }
    ctx.closePath();
    ctx.fillStyle = skin.accent; ctx.fill();
  } else if (skin.shape === 'droplet'){
    ctx.beginPath();
    ctx.moveTo(0, -c.radius);
    ctx.bezierCurveTo(c.radius, -c.radius/3, c.radius*0.2, c.radius, 0, c.radius);
    ctx.bezierCurveTo(-c.radius*0.2, c.radius, -c.radius, -c.radius/3, 0, -c.radius);
    ctx.fillStyle = skin.accent; ctx.fill();
  }
  // value overlay for rare
  if (c.type === 'rare'){
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★', 0, 4);
  }
  ctx.restore();
}

function drawBomb(b){
  ctx.save(); ctx.translate(b.x,b.y);
  // body
  ctx.beginPath(); ctx.arc(0,0,b.radius,0,Math.PI*2); ctx.fillStyle='rgba(40,40,40,0.95)'; ctx.fill();
  // fuse
  ctx.fillStyle='rgba(200,120,60,0.9)'; ctx.fillRect(-6,-b.radius-8,12,8);
  // spark
  ctx.beginPath(); ctx.arc(0,-b.radius-12,6,0,Math.PI*2); ctx.fillStyle='orange'; ctx.fill();
  ctx.restore();
}

function drawPowerup(p){
  ctx.save(); ctx.translate(p.x,p.y);
  ctx.beginPath(); ctx.arc(0,0,p.radius,0,Math.PI*2);
  if (p.type==='magnet') ctx.fillStyle='rgba(140,200,255,0.98)';
  else if (p.type==='slow') ctx.fillStyle='rgba(180,255,180,0.98)';
  else ctx.fillStyle='rgba(255,220,140,0.98)';
  ctx.fill();
  ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.font='700 12px sans-serif'; ctx.textAlign='center'; ctx.fillText(p.type==='magnet'?'M': p.type==='slow'?'S':'$' , 0, 5);
  ctx.restore();
}

function drawCollector(){
  const x = state.collectorX;
  const y = H - 60;
  const w = state.collectorW;
  // shadow
  ctx.beginPath(); ctx.ellipse(x,y+18, w*0.6, 10, 0,0,Math.PI*2); ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fill();
  // bar
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.roundRect ? ctx.roundRect(x-w/2, y-12, w, 28, 12) : (ctx.fillRect(x-w/2,y-12,w,28));
  ctx.fill();
  // icon
  ctx.fillStyle = '#fff'; ctx.font='700 13px sans-serif'; ctx.textAlign='center'; ctx.fillText('CATCH', x, y+5);
}

// add roundRect polyfill if missing
if (!CanvasRenderingContext2D.prototype.roundRect){
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
    if (typeof r === 'undefined') r = 6;
    this.beginPath();
    this.moveTo(x+r, y);
    this.arcTo(x+w, y, x+w, y+h, r);
    this.arcTo(x+w, y+h, x, y+h, r);
    this.arcTo(x, y+h, x, y, r);
    this.arcTo(x, y, x+w, y, r);
    this.closePath();
    this.fill();
  };
}

// ---------- End / Restart ----------
function endGame(){
  state.running = false;
  finalScore.textContent = Math.floor(state.score);
  finalCoins.textContent = profile.coins;
  saveHighscore(Math.floor(state.score));
  renderHighScores();
  playBeep(160,0.8,'sawtooth',0.06);
  gameOverScreen.style.display = 'flex';
  stopMusic();
}

function restartGame(){
  // reinitialize some state but keep upgrades/profile
  state.running = true;
  state.score = 0;
  state.coinsEarned = 0;
  state.coinObjects = []; state.bombs = []; state.powerups = []; state.particles = [];
  state.combo = 1; state.comboTimer = 0;
  state.level = 1; state.spawnInterval = 950; state.enemyChance = 0.06; state.powerupChance = 0.03;
  state.lives = upgrades.maxLives;
  state.magnetActiveUntil = 0; state.slowActiveUntil = 0;
  gameOverScreen.style.display = 'none';
  lastFrame = now();
  state.lastSpawn = now();
  if (settings.music) startMusic();
  requestAnimationFrame(gameLoop);
}

// ---------- Input: UI buttons & modals ----------
btnShop.onclick = ()=>{ renderShop(); shopModal.style.display='block'; };
btnSkins.onclick = ()=>{ renderSkins(); skinsModal.style.display='block'; };
btnSettings.onclick = ()=>{ settingsModal.style.display='block'; };

document.querySelectorAll('.closeBtn').forEach(b=>{ b.onclick = (e)=>{ const t = e.target.dataset.close; if (t) document.getElementById(t).style.display='none'; else b.parentElement.parentElement.style.display='none'; }; });

restartBtn.onclick = ()=>{ restartGame(); };
toShopBtn.onclick = ()=>{ gameOverScreen.style.display='none'; renderShop(); shopModal.style.display='block'; };

toggleSound.onchange = (e)=>{ settings.sound = toggleSound.checked; save(LS.SETTINGS, settings); playBeep(900,0.06,'sine',0.06); };
toggleMusic.onchange = (e)=>{ settings.music = toggleMusic.checked; save(LS.SETTINGS, settings); if (settings.music) startMusic(); else stopMusic(); };

// close modals on background click
[shopModal, skinsModal, settingsModal].forEach(m=>{
  m.addEventListener('pointerdown', (ev)=>{
    if (ev.target === m) m.style.display = 'none';
  });
});

// ---------- Persistence: ensure defaults saved ----------
save(LS.SETTINGS, settings);
save(LS.UPGRADES, upgrades);
save(LS.PROFILE, profile);

// ---------- Initial render & start ----------
updateHUD();
renderShop();
renderSkins();
renderHighScores();
ensureAudio();
if (settings.music) startMusic();
requestAnimationFrame(gameLoop);

// ---------- Small helper: resume audio on first user gesture for mobile autoplay policy ----------
window.addEventListener('pointerdown', function resumeAudio(){
  if (audioCtx && audioCtx.state === 'suspended'){ audioCtx.resume(); }
  window.removeEventListener('pointerdown', resumeAudio);
});
