// @ts-nocheck — intentional: vanilla canvas game prototype, see note in shippie.json
(() => {
  const cv=document.getElementById('stage'), ctx=cv.getContext('2d'); const $=id=>document.getElementById(id);
  let W=0,H=0,DPR=Math.min(2,devicePixelRatio||1), t=0;
  let phase='prep';
  const GRID=11; let TW=40, TH=20, origin={x:0,y:0};
  const CORE={x:5,y:5}; const ALL_GATES=[{x:5,y:0},{x:0,y:5},{x:10,y:5},{x:5,y:10}]; const GATE=ALL_GATES[0];
  const GATE_ROUND=[1,6,12,18]; // when each entrance opens
  function activeGates(){const n=round>=18?4:round>=12?3:round>=6?2:1;return ALL_GATES.slice(0,n);}
  let built=[]; const inGrid=(x,y)=>x>=0&&y>=0&&x<GRID&&y<GRID;
  const isCore=(x,y)=>x===CORE.x&&y===CORE.y, isGate=(x,y)=>ALL_GATES.some(g=>g.x===x&&g.y===y);
  function blank(){built=Array.from({length:GRID},()=>Array(GRID).fill(null));}

  // ---------- iso + BFS pathfinding ----------
  const iso=(gx,gy)=>({x:origin.x+(gx-gy)*TW/2, y:origin.y+(gx+gy)*TH/2});
  const compactMode=()=>W<560;
  function pick(mx,my){const gx=Math.round(((mx-origin.x)/(TW/2)+(my-origin.y)/(TH/2))/2-0.5);const gy=Math.round(((my-origin.y)/(TH/2)-(mx-origin.x)/(TW/2))/2-0.5);return{gx,gy};}
  function pickTouch(mx,my){if(!compactMode())return pick(mx,my);let best=pick(mx,my),bd=Infinity;
    for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){const p=iso(x,y),cx=p.x,cy=p.y+TH/2,d=Math.hypot(mx-cx,(my-cy)*1.18);if(d<bd){bd=d;best={gx:x,gy:y};}}
    return bd<=Math.max(36,TW*1.1)?best:pick(mx,my);}
  function chromeInsets(compact){
    const topRect=document.querySelector('.top')?.getBoundingClientRect();
    const prepRect=$('prepbar')?.classList.contains('show')?$('prepbar').getBoundingClientRect():null;
    const top=compact?Math.max(78,Math.min(122,(topRect?.height||92)+8)):124;
    let bottom=compact?98:120;
    if(phase==='defend')bottom=compact?154:124;
    else if(prepRect)bottom=compact?Math.max(86,Math.min(126,prepRect.height+8)):Math.max(112,prepRect.height+8);
    return{top,bottom};
  }
  function layout(){const vw=Math.round(innerWidth),vh=Math.round(window.visualViewport?.height||innerHeight);
    W=cv.width=vw*DPR;H=cv.height=vh*DPR;cv.style.width=vw+'px';cv.style.height=vh+'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);W=vw;H=vh;
    const compact=W<560;
    TW=compact?Math.max(36,Math.min(44,(W+56)/(GRID-1))):(W>=760?42:40);TH=compact?TW*.68:TW/2;
    const ins=chromeInsets(compact),boardH=GRID*TH,playTop=ins.top,playBottom=Math.max(playTop+boardH,H-ins.bottom),playH=playBottom-playTop;
    origin={x:W/2,y:playTop+Math.max(8,(playH-boardH)*(compact ? .34 : .5))};recenter();}
  addEventListener('resize',layout);
  window.visualViewport?.addEventListener('resize',layout);
  let routeTiles=[], routeC=[], routeLen=0, routeSeg=[], field=[];
  function findPath(blockExtra){const key=(x,y)=>y*GRID+x,q=[[GATE.x,GATE.y]],prev=new Map();prev.set(key(GATE.x,GATE.y),-1);
    const walk=(x,y)=>inGrid(x,y)&&(isCore(x,y)||(!built[y][x]&&!(blockExtra&&blockExtra.x===x&&blockExtra.y===y)));
    while(q.length){const [x,y]=q.shift();if(isCore(x,y)){const out=[];let k=key(x,y);while(k!==-1){out.push({x:k%GRID,y:Math.floor(k/GRID)});k=prev.get(k);}return out.reverse();}
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(walk(nx,ny)&&!prev.has(key(nx,ny))){prev.set(key(nx,ny),key(x,y));q.push([nx,ny]);}}}return null;}
  function recenter(){routeC=routeTiles.map(tt=>{const p=iso(tt.x,tt.y);return{x:p.x,y:p.y+TH/2};});routeSeg=[];routeLen=0;
    for(let i=0;i<routeC.length-1;i++){const d=Math.hypot(routeC[i+1].x-routeC[i].x,routeC[i+1].y-routeC[i].y);routeSeg.push(d);routeLen+=d;}}
  function refreshRoute(){const p=findPath();if(p){routeTiles=p;recenter();}computeField();if(typeof updMeter==='function')updMeter();return p;}
  // flow field: BFS distance-to-Beacon over open floor (towers/blocks are walls) — gunk flows downhill
  function computeField(){field=Array.from({length:GRID},()=>Array(GRID).fill(Infinity));const q=[[CORE.x,CORE.y]];field[CORE.y][CORE.x]=0;
    const open=(x,y)=>inGrid(x,y)&&!built[y][x];
    while(q.length){const [x,y]=q.shift(),d=field[y][x];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(open(nx,ny)&&field[ny][nx]>d+1){field[ny][nx]=d+1;q.push([nx,ny]);}}}}
  function invIso(mx,my){return{gx:((mx-origin.x)/(TW/2)+(my-origin.y)/(TH/2))/2-0.5,gy:((my-origin.y)/(TH/2)-(mx-origin.x)/(TW/2))/2-0.5};}
  function blocksAnyGate(bx,by){const d=Array.from({length:GRID},()=>Array(GRID).fill(Infinity)),q=[[CORE.x,CORE.y]];d[CORE.y][CORE.x]=0;
    const open=(x,y)=>inGrid(x,y)&&!built[y][x]&&!(x===bx&&y===by);
    while(q.length){const [x,y]=q.shift(),dd=d[y][x];for(const [ax,ay] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+ax,ny=y+ay;if(open(nx,ny)&&d[ny][nx]>dd+1){d[ny][nx]=dd+1;q.push([nx,ny]);}}}
    return activeGates().some(g=>d[g.y][g.x]===Infinity);}
  function mazeStats(){let covered=0;const tw=[];for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){const b=built[y][x];if(b&&b.kind!=='block'&&b.kind!=='net'){const p=iso(x,y);tw.push({x:p.x,y:p.y+TH/2,r:(TDEF[b.kind].range+(b.tier||0)*.4)*TW/2*1.42});}}
    for(const c of routeC){if(tw.some(o=>Math.hypot(c.x-o.x,c.y-o.y)<o.r))covered++;}return{len:routeTiles.length,pct:routeC.length?Math.round(covered/routeC.length*100):0};}
  function updMeter(){const el=$('meter');if(!el)return;el.style.display=phase==='prep'?'flex':'none';if(phase!=='prep')return;const m=mazeStats();el.innerHTML=`<span>⛓ ROUTE <b>${m.len}</b></span><span>🛡 DEFENDED <b>${m.pct}%</b></span>`;}
  function routeAt(d){if(!routeC.length)return{x:origin.x,y:origin.y};if(d<=0)return{...routeC[0]};let acc=0;
    for(let i=0;i<routeSeg.length;i++){if(d<=acc+routeSeg[i]){const f=(d-acc)/routeSeg[i];return{x:routeC[i].x+(routeC[i+1].x-routeC[i].x)*f,y:routeC[i].y+(routeC[i+1].y-routeC[i].y)*f};}acc+=routeSeg[i];}return{...routeC[routeC.length-1]};}

  // ---------- state ----------
  let round=1, tokens=140, gems=0;
  let MAX_HEARTS=3, hearts=MAX_HEARTS;
  let pulsePower=40, pulseRing=0, slamCd=0, bestRound=1, over=false, coachShown=false, dpadCoach=false;
  let enemies=[], shots=[], fxs=[], floats=[], spawnQ=[], spawnT=0;
  let roundEarned=0, roundKills=0;
  const MOD={income:1, dmg:1, cost:1};
  const costOf=D=>D.cur==='gem'?D.cost:Math.round(D.cost*MOD.cost);
  const AV={x:0,y:0,dmg:9,range:1.6,maxHp:70,hp:70,cd:0,cdBase:.45,fx:'melee',weapon:'wrench',owned:{wrench:1},powBonus:0,rangeBonus:0,evolved:false,lastAtk:-9,down:false,downT:0,outfit:'#5a78c0',skin:'#e9b98c',hair:'#3a2a1a',name:'PELL'};
  const OUTFITS=['#5a78c0','#c0405a','#3a8f5a','#8a4fb0','#e8a23c','#2c8f8a'], SKINS=['#f1c9a5','#e9b98c','#c98a5a','#8a5a34','#5e3a1e'], NAMES=['PELL','MARA','KOJI','RUE','SOLA','VEX'];
  let capEmote='', capEmoteT=0, beaconShake=0, curMood='determined', curStat='guarding the Beacon'; const pops=[]; const pad={u:0,d:0,l:0,r:0}; const keys={};
  const WEAPON={
    wrench:{ic:'sword',name:'Wrench',accent:'#ef6a4a',dmg:9,range:1.6,cd:.45,fx:'melee',cost:0,cur:'tok',tag:'MELEE',desc:'heavy close-range hits'},
    flare:{ic:'target',name:'Flare Gun',accent:'#e8a23c',dmg:7,range:3.2,cd:.6,fx:'shot',cost:55,cur:'tok',tag:'RANGED',desc:'picks off gunk at long range'},
    net:{ic:'net',name:'Net Gun',accent:'#5a78c0',dmg:3,range:2.6,cd:.5,fx:'slow',cost:60,cur:'tok',tag:'SLOW',desc:'slows its target — combos with towers'},
    spark:{ic:'coil',name:'Spark Fist',accent:'#b07ff0',dmg:6,range:1.9,cd:.55,fx:'aoe',cost:3,cur:'gem',tag:'AOE',desc:'zaps a whole cluster around you'},
  };
  function equipWeapon(k){const w=WEAPON[k];if(!AV.owned[k]){const have=w.cur==='gem'?gems:tokens;if(have<w.cost){flash('Need '+(w.cur==='gem'?'◈':'◆')+w.cost,1);return;}if(w.cur==='gem'){gems-=w.cost;updRes();floatAtWallet('−◈'+w.cost,'#ef6a4a');}else spend(w.cost);AV.owned[k]=1;}
    AV.weapon=k;AV.fx=w.fx;AV.cdBase=w.cd;AV.dmg=w.dmg+AV.powBonus;AV.range=w.range+AV.rangeBonus;flash(w.name+' equipped');renderSheet();}

  // ---------- icons ----------
  const SVG=i=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${i}</svg>`;
  const ICON={
    zapper:SVG('<path d="M13 2 6 13h5l-2 9 9-12h-5l2-8z" fill="currentColor" stroke-width="1"/>'),
    cannon:SVG('<circle cx="7" cy="17" r="3.4"/><path d="M9.2 14.8 19 5"/><path d="M16 3.5 20 4.6 21 8.5"/>'),
    coil:SVG('<circle cx="12" cy="12" r="2"/><path d="M12 8.5a3.5 3.5 0 1 0 3.5 3.5"/><path d="M12 5a7 7 0 1 0 7 7"/>'),
    block:SVG('<rect x="3" y="6" width="18" height="5.2" rx="1"/><rect x="3" y="12.8" width="18" height="5.2" rx="1"/><path d="M9.5 6v5.2M14.5 12.8V18"/>'),
    sword:SVG('<path d="M14.5 3 21 3 21 9.5 9 21.5 4.5 21.5 4.5 17z"/><path d="M5 15 9 19"/>'),
    target:SVG('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3.5M12 19.5V23M1 12h3.5M19.5 12H23"/>'),
    heart:SVG('<path d="M12 21C5.5 15.5 3.5 11.6 3.5 8.4A4.4 4.4 0 0 1 12 6a4.4 4.4 0 0 1 8.5 2.4c0 3.2-2 7.1-8.5 12.6z" fill="currentColor" stroke-width="1"/>'),
    star:SVG('<path d="M12 3 14.7 9.3 21 9.8 16.1 14 17.7 20.4 12 16.8 6.3 20.4 7.9 14 3 9.8 9.3 9.3z" fill="currentColor" stroke-width="1"/>'),
    up:SVG('<path d="M6 13l6-6 6 6M6 19l6-6 6 6"/>'),
    sell:SVG('<path d="M4.5 9A8 8 0 0 1 18 5.5M19.5 15A8 8 0 0 1 6 18.5"/><path d="M4 4.5V9h4.5M20 19.5V15h-4.5"/>'),
    coins:SVG('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>'),
    net:SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8"/>'),
  };

  // ---------- buildables ----------
  const TDEF={
    turret:{ic:'zapper',name:'Zapper Tower',accent:'#7fd4d0',cost:30,cur:'tok',range:2.4,cd:.55,dmg:5,tag:'FAST'},
    cannon:{ic:'cannon',name:'Cannon Tower',accent:'#e8a23c',cost:55,cur:'tok',range:2.0,cd:.9,dmg:9,splash:1.2,tag:'SPLASH'},
    net:{ic:'net',name:'Net Post',accent:'#5a78c0',cost:40,cur:'tok',range:2.1,cd:1,dmg:1,slow:1,tag:'SLOW'},
    coil:{ic:'coil',name:'Spark Coil',accent:'#b07ff0',cost:3,cur:'gem',range:2.2,cd:.6,dmg:5,chain:2,tag:'CHAIN'},
    block:{ic:'block',name:'Block Wall',accent:'#caa06a',cost:10,cur:'tok',tag:'WALL'},
  };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)); const pip=(v,mx)=>clamp(Math.round(v/mx*5),1,5);
  function towerRows(D,tier){tier=tier||0;const mult=1+tier*.6,dmg=D.dmg*mult,rate=1/D.cd;
    return{rows:[{l:'DMG',pips:pip(dmg,16),v:Math.round(dmg)},{l:'RNG',pips:pip(D.range,3.2),v:D.range.toFixed(1)},{l:'RATE',pips:pip(rate,2.2),v:rate.toFixed(1)}],dps:(dmg*rate*(D.chain||1)).toFixed(1),tag:D.tag};}

  // ---------- buy sheet ----------
  let sheetOpen=false, sCtx=null, sTile=null;
  function openSheet(c,tile){sCtx=c;sTile=tile||null;sheetOpen=true;document.body.classList.add('sheet-open');const sh=$('sheet');sh.className='sheet ctx-'+c;renderSheet();sh.classList.add('show');}
  function closeSheet(){sheetOpen=false;document.body.classList.remove('sheet-open');$('sheet').className='sheet';}
  function upPrice(b){return Math.round(TDEF[b.kind].cost*(0.8+b.tier*0.8)*MOD.cost);}
  function renderSheet(){const wrap=$('opts');wrap.innerHTML='';let title,sub,items=[];
    if(sCtx==='tile'){title='Deploy';sub='pick one to place';items=['turret','cannon','net','coil','block'].map(buildCard);}
    else if(sCtx==='built'){const b=built[sTile.y][sTile.x],D=TDEF[b.kind];title=D.name;sub=b.kind==='block'?'a wall — reroutes the gunk':'Lv '+(b.tier+1)+' · upgrade or sell';
      if(b.kind!=='block'){const cur=towerRows(D,b.tier),nx=towerRows(D,b.tier+1),up=upPrice(b),can=tokens>=up&&b.tier<3;
        items.push(card({ic:ICON.up,accent:D.accent,name:'Tune up',rows:[{l:'DMG',pips:cur.rows[0].pips,next:nx.rows[0].pips,v:cur.rows[0].v,nv:nx.rows[0].v}],tag:'Lv '+(b.tier+2),cost:up,cur:'tok',disabled:!can,maxed:b.tier>=3,on:()=>{spend(up);b.tier++;flash('Tuned up to Lv '+(b.tier+1));updMeter();renderSheet();}}));}
      items.push(card({ic:ICON.sell,accent:'#9fb7c9',name:'Sell',note:TDEF[b.kind].cur==='gem'?'premium — no refund':'recover half the cost only',refund:Math.round(TDEF[b.kind].cost*(TDEF[b.kind].cur==='gem'?0:.5)),cur:'tok',on:()=>{const r=Math.round(TDEF[b.kind].cost*(TDEF[b.kind].cur==='gem'?0:.5));built[sTile.y][sTile.x]=null;refreshRoute();tokens+=r;updRes();floatAtWallet('+◆'+r,'#5ad08a');flash('Sold · +◆'+r+' (half back)');closeSheet();}}));}
    else if(sCtx==='avatar'){title=AV.evolved?'Captain · Bulwark':'Captain';sub='weapons, traits, and appearance';items=avCards();}
    else if(sCtx==='customize'){title='Customise the Captain';sub='make Capt. '+AV.name+' your own';items=custCards();}
    $('sheetTi').innerHTML=title+'<small>'+sub+'</small>';items.forEach(el=>wrap.appendChild(el));}
  function buildCard(k){const D=TDEF[k],cur=D.cur,c=costOf(D),have=cur==='gem'?gems:tokens,afford=have>=c;
    const notes={turret:'Fast shots',cannon:'Splash damage',net:'Slows enemies',coil:'Chain lightning',block:'Wall · reroutes path'};
    return card({ic:ICON[D.ic],accent:D.accent,name:D.name,note:notes[k],cost:c,cur,disabled:!afford,on:()=>placeBuild(k)});}
  function secLabel(txt){const d=document.createElement('div');d.className='seclabel';d.textContent=txt;return d;}
  function swatchRow(lbl,cols,cur,key){const w=document.createElement('div');w.className='swrow';const s=document.createElement('span');s.textContent=lbl;w.appendChild(s);const row=document.createElement('div');row.className='sws';
    cols.forEach(c=>{const b=document.createElement('button');b.className='sw'+(c===cur?' on':'');b.style.background=c;b.onclick=()=>{AV[key]=c;renderFace();renderSheet();};row.appendChild(b);});w.appendChild(row);return w;}
  function custCards(){const out=[];const nm=document.createElement('div');nm.className='swrow';const ns=document.createElement('span');ns.textContent='Name';nm.appendChild(ns);
    const nb=document.createElement('button');nb.className='namebtn';nb.textContent=AV.name+'  ⟳';nb.onclick=()=>{const i=NAMES.indexOf(AV.name);AV.name=NAMES[(i+1)%NAMES.length];renderFace();renderSheet();};nm.appendChild(nb);out.push(nm);
    out.push(swatchRow('Outfit',OUTFITS,AV.outfit,'outfit'));out.push(swatchRow('Skin',SKINS,AV.skin,'skin'));return out;}
  function weaponCard(k){const w=WEAPON[k],owned=AV.owned[k],equipped=AV.weapon===k,have=w.cur==='gem'?gems:tokens;
    return card({ic:ICON[w.ic],accent:w.accent,name:w.name,rows:[{l:'DMG',pips:pip(w.dmg,16),v:w.dmg},{l:'RNG',pips:pip(w.range,3.2),v:w.range.toFixed(1)}],tag:w.tag,syn:w.desc,
      cost:w.cost,cur:w.cur,equipped,free:owned&&!equipped,disabled:!owned&&have<w.cost,actLabel:'EQUIP',on:()=>equipWeapon(k)});}
  function avCards(){const out=[card({ic:ICON.star,accent:'#9fb7c9',name:'Customise Captain',note:'Name, outfit, and skin tone',tag:'LOOKS',cost:0,cur:'tok',free:true,actLabel:'OPEN',on:()=>openSheet('customize')}),secLabel('Weapon · tap to equip')];['wrench','flare','net','spark'].forEach(k=>out.push(weaponCard(k)));
    out.push(secLabel('Upgrades'));
    [{id:'power',ic:ICON.sword,accent:'#ef6a4a',name:'Power',l:'ATK',cur:AV.dmg,nv:AV.dmg+6,mx:30},
     {id:'range',ic:ICON.target,accent:'#7fd4d0',name:'Range',l:'RNG',cur:AV.range,nv:AV.range+0.5,mx:4,dec:1},
     {id:'vigor',ic:ICON.heart,accent:'#5ad08a',name:'Vigor',l:'HP',cur:AV.maxHp,nv:AV.maxHp+30,mx:200}].forEach(o=>out.push(card({ic:o.ic,accent:o.accent,name:o.name,rows:[{l:o.l,pips:pip(o.cur,o.mx),next:pip(o.nv,o.mx),v:o.dec?o.cur.toFixed(1):o.cur,nv:o.dec?o.nv.toFixed(1):o.nv}],cost:40,cur:'tok',disabled:tokens<40,on:()=>buyAv(o.id)})));
    out.push(card({ic:ICON.star,accent:'#f6c66b',name:'Evolve → Bulwark',note:'ATK ＋ · HP ＋ · RNG ＋',tag:'PREMIUM',cost:2,cur:'gem',disabled:gems<2||AV.evolved,maxed:AV.evolved,on:()=>buyAv('evolve')}));
    return out;}
  function card(o){const b=document.createElement('button');b.className='opt'+(o.cur==='gem'?' gemc':'')+(o.refund!==undefined?' refundc':'')+(o.equipped?' equipped':'');b.style.setProperty('--ac',o.accent);b.disabled=o.disabled||o.maxed||o.equipped;
    const sym=o.cur==='gem'?'◈':'◆';
    const rows=(o.rows||[]).map(r=>`<span class="srow"><i>${r.l}</i><span class="bar">${segs(r.pips,r.next)}</span><b>${r.nv!==undefined?`${r.v}<span class="nx"> → ${r.nv}</span>`:r.v}</b></span>`).join('');
    const tagline=(o.dps||o.tag)?`<span class="tagline">${o.dps?`<span class="dps">DPS ${o.dps}</span>`:''}${o.tag?`<span class="tag">${o.tag}</span>`:''}</span>`:'';
    const note=o.note?`<span class="note">${o.note}</span>`:'';
    const synl=o.syn?`<span class="syn">⚡ ${o.syn}</span>`:'';
    const price=o.equipped?`<span class="act" style="background:var(--good)">EQUIPPED</span>`
      :o.free?`<span class="act">${o.actLabel||'EQUIP'}</span>`
      :o.refund!==undefined?`<span class="cost" style="color:var(--good)">+${sym}${o.refund}</span><span class="act">SELL</span>`
      :o.maxed?`<span class="cost" style="color:var(--ink-dim)">MAX</span>`
      :`<span class="cost">${sym}${o.cost}</span><span class="act">${o.disabled?'NEED '+sym+o.cost:(o.actLabel||'BUILD')}</span>`;
    b.innerHTML=`<span class="ic">${o.ic}</span><span class="mid"><span class="nm">${o.name}</span>${rows}${note}${tagline}${synl}</span><span class="price">${price}</span>`;
    b.onclick=()=>{if(!b.disabled)o.on();};return b;}
  function segs(on,next){let s='';for(let i=0;i<5;i++)s+=`<i class="${i<on?'on':(next&&i<next?'next':'')}"></i>`;return s;}
  function spend(amt){tokens-=amt;updRes();floatAtWallet('−◆'+amt,'#ef6a4a');}
  function placeBuild(k){const D=TDEF[k],cur=D.cur,c=costOf(D),have=cur==='gem'?gems:tokens;if(have<c){flash('Need '+(cur==='gem'?'◈':'◆')+c,1);return;}
    const {x,y}=sTile;if(blocksAnyGate(x,y)){flash('That would seal off a gate!',1);return;}
    if(cur==='gem'){gems-=c;updRes();floatAtWallet('−◈'+c,'#ef6a4a');}else spend(c);
    built[y][x]={kind:k,tier:0,cd:0,born:t};refreshRoute();coachShown=true;buzz(12);
    flash(k==='net'?'Net Post deployed — slowed gunk takes +50% from your towers':D.name+' deployed — tap it later to tune up');
    closeSheet();}  // keep building; tap a placed tower to upgrade/sell
  function buyAv(id){const cost=id==='evolve'?2:40,cur=id==='evolve'?'gem':'tok',have=cur==='gem'?gems:tokens;
    if(id==='evolve'&&AV.evolved){flash('Maxed');return;}if(have<cost){flash('Need '+(cur==='gem'?'◈':'◆')+cost,1);return;}
    if(cur==='gem'){gems-=cost;updRes();floatAtWallet('−◈'+cost,'#ef6a4a');}else spend(cost);
    if(id==='power'){AV.powBonus+=6;AV.dmg+=6;}else if(id==='range'){AV.rangeBonus+=.5;AV.range+=.5;}else if(id==='vigor'){AV.maxHp+=30;AV.hp=AV.maxHp;updCapHp();}
    else if(id==='evolve'){AV.evolved=true;AV.powBonus+=10;AV.dmg+=10;AV.rangeBonus+=.4;AV.range+=.4;AV.maxHp+=45;AV.hp=AV.maxHp;updCapHp();}
    flash('Upgraded ✓');renderSheet();}

  // ---------- enemies (calmer cadence + gentler ramp) ----------
  const TYPES={skipper:{col:'#5fb0c0',r:8,hp:5,spd:1.2},crab:{col:'#c98a4a',r:10,hp:15,spd:0.72},kelp:{col:'#6ad08a',r:9,hp:9,spd:1.0,split:true},
    runner:{col:'#f0a050',r:7,hp:5,spd:2.1},shielded:{col:'#8a96a8',r:10,hp:9,spd:0.72,shield:1},flyer:{col:'#d98fd0',r:8,hp:6,spd:1.05,fly:true},
    brute:{col:'#b07ff0',r:15,hp:70,spd:0.5,boss:true,named:'Tide Brute'},leviathan:{col:'#7a3a8f',r:20,hp:170,spd:0.42,boss:true,named:'Barnacle Leviathan'}};
  function hpScale(){return 1+(round-1)*0.17;} function spdScale(){return Math.min(1.7,1+round*0.012);}
  function pickType(i){const pool=['skipper','skipper'];if(round>=3)pool.push('crab');if(round>=5)pool.push('runner');if(round>=7)pool.push('kelp');if(round>=9)pool.push('shielded');if(round>=12)pool.push('flyer');return pool[(i*5+round)%pool.length];}
  function startWave(){const g=activeGates(),count=Math.min(40,4+Math.floor(round*1.6));spawnQ=[];
    for(let i=0;i<count;i++)spawnQ.push({key:pickType(i),gate:g[i%g.length]});
    if(round%10===0)spawnQ.push({key:'leviathan',gate:g[0]});else if(round%5===0)spawnQ.push({key:'brute',gate:g[0]});
    spawnT=1.4;}
  function spawn(it){const k=it.key,T=TYPES[k],g=it.gate,s=hpScale(),sp=iso(g.x,g.y),shd=T.shield?Math.round(T.hp*s*0.6):0;
    fxs.push({kind:'spawn',x:sp.x,y:sp.y+TH/2,life:.5,ph:Math.random()*6,col:T.col});
    enemies.push({k,col:T.col,r:T.r,gx:g.x,gy:g.y,x:sp.x,y:sp.y+TH/2,hp:T.hp*s,max:T.hp*s,spd:T.spd*spdScale(),boss:T.boss||false,fly:T.fly||false,shield:shd,maxShield:shd,named:T.named||'',ph:Math.random()*6,slow:0,born:t});}
  function step(dt){
    if(spawnQ.length){spawnT-=dt;if(spawnT<=0){spawn(spawnQ.shift());spawnT=Math.max(.4,1.15-round*.015);}}
    for(const e of enemies){if(e.dead)continue;let sp=e.spd*(e.slow>0?.45:1);if(e.slow>0)e.slow-=dt;
      const ep=iso(e.gx,e.gy);e.x=ep.x;e.y=ep.y+TH/2;
      if(!AV.down && Math.hypot(e.x-AV.x,(e.y-8)-(AV.y-12))<76){ // DIVERGE: chase the captain when near
        const ct=invIso(AV.x,AV.y-TH/2),dx=ct.gx-e.gx,dy=ct.gy-e.gy,d=Math.hypot(dx,dy)||1;e.gx+=dx/d*sp*dt;e.gy+=dy/d*sp*dt;
        if(Math.hypot(e.x-AV.x,(e.y-8)-(AV.y-12))<e.r+14){AV.hp-=dt*8;updCapHp();if(AV.hp<=0&&!AV.down){AV.down=true;AV.downT=0;setMood('worried',"I'm down — hold the line!");capSay('!');}}
        continue;}
      if(e.fly){const dx=CORE.x-e.gx,dy=CORE.y-e.gy,d=Math.hypot(dx,dy)||1;e.gx+=dx/d*sp*dt;e.gy+=dy/d*sp*dt; // FLYER: ignores walls, beelines the Beacon
        if(d<0.55){e.dead=true;hearts=Math.max(0,hearts-1);updHearts();if(beaconHit())return;}continue;}
      // flow downhill across the open floor toward the Beacon
      const cgx=clamp(Math.round(e.gx),0,GRID-1),cgy=clamp(Math.round(e.gy),0,GRID-1);let tgt=CORE,bd=field[cgy][cgx];
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=cgx+dx,ny=cgy+dy;if(inGrid(nx,ny)&&field[ny][nx]<bd){bd=field[ny][nx];tgt={x:nx,y:ny};}}
      const dx=tgt.x-e.gx,dy=tgt.y-e.gy,d=Math.hypot(dx,dy)||1;e.gx+=dx/d*sp*dt;e.gy+=dy/d*sp*dt;
      if(Math.hypot(CORE.x-e.gx,CORE.y-e.gy)<0.55){e.dead=true;hearts=Math.max(0,hearts-1);updHearts();if(beaconHit())return;}}
    for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){const b=built[y][x];if(!b||b.kind==='block')continue;const D=TDEF[b.kind];
      const cpx=iso(x,y),cx=cpx.x,cy=cpx.y+TH/2,rng=(D.range+(b.tier||0)*.4)*TW/2*1.42;
      if(b.kind==='net'){for(const e of enemies){if(e.dead)continue;if(Math.hypot(e.x-cx,e.y-cy)<rng)e.slow=Math.max(e.slow,.5);}continue;} // SYNERGY: slow aura
      b.cd-=dt;let best=null,bd=rng;for(const e of enemies){if(e.dead)continue;const dd=Math.hypot(e.x-cx,e.y-cy);if(dd<bd){bd=dd;best=e;}}
      if(best&&b.cd<=0){b.cd=D.cd*(adjCoil(x,y)?0.7:1);b.flash=t;const dmg=D.dmg*(1+b.tier*.6)*MOD.dmg; // SYNERGY: coil amplifies neighbours
        if(D.chain){let n=0;for(const e of enemies){if(e.dead||n>=D.chain)continue;if(Math.hypot(e.x-cx,e.y-cy)<rng){shots.push({x:cx,y:cy-26,tx:e,dmg});n++;}}}
        else shots.push({x:cx,y:cy-26,tx:best,dmg,splash:D.splash});}}
    if(AV.down){AV.downT+=dt;const bp=iso(CORE.x,CORE.y),bx=bp.x,by=bp.y+TH/2+92;AV.x+=(bx-AV.x)*.06;AV.y+=(by-AV.y)*.06;if(AV.downT>4){AV.down=false;AV.hp=AV.maxHp*.6;updCapHp();setMood('determined','back on my feet');}}
    else{const ix=(pad.r-pad.l)+((keys.ArrowRight||keys.d)?1:0)-((keys.ArrowLeft||keys.a)?1:0),iy=(pad.d-pad.u)+((keys.ArrowDown||keys.s)?1:0)-((keys.ArrowUp||keys.w)?1:0);
      const m=Math.hypot(ix,iy);if(m>0){const s=130*dt;AV.x=clamp(AV.x+ix/m*s,16,W-16);AV.y=clamp(AV.y+iy/m*s,H*.16,H*.92);}
      AV.cd-=dt;const rng=AV.range*TW/2*1.42;let best=null,bd=rng;for(const e of enemies){if(e.dead)continue;const dd=Math.hypot(e.x-AV.x,e.y-(AV.y-14));if(dd<bd){bd=dd;best=e;}}
      if(best&&AV.cd<=0){AV.cd=AV.cdBase;AV.lastAtk=t;
        if(AV.fx==='shot')shots.push({x:AV.x,y:AV.y-14,tx:best,dmg:AV.dmg});
        else{hit(best,AV.dmg);fxs.push({x:AV.x,y:AV.y-14,a:Math.atan2(best.y-(AV.y-14),best.x-AV.x),life:.2,kind:'slash'});
          if(AV.fx==='slow')best.slow=Math.max(best.slow,.9);
          if(AV.fx==='aoe')for(const e2 of enemies){if(!e2.dead&&e2!==best&&Math.hypot(e2.x-AV.x,e2.y-(AV.y-14))<TW*.9)hit(e2,AV.dmg*.6);}}}
      let near=0;for(const e of enemies){if(!e.dead&&Math.hypot(e.x-AV.x,e.y-(AV.y-12))<20)near++;} // gunk in melee hurts the captain
      if(near){AV.hp-=dt*6*near;updCapHp();if(AV.hp<=0&&!AV.down){AV.down=true;AV.downT=0;setMood('worried',"I'm down — hold the line!");capSay('!');}}}
    for(const s of shots){if(s.dead)continue;if(s.tx.dead){s.dead=true;continue;}const dx=s.tx.x-s.x,dy=s.tx.y-s.y,d=Math.hypot(dx,dy);
      if(d<8){s.dead=true;hit(s.tx,s.dmg);if(s.splash)for(const e of enemies)if(!e.dead&&e!==s.tx&&Math.hypot(e.x-s.tx.x,e.y-s.tx.y)<s.splash*TW/2)hit(e,s.dmg*.6);}else{s.x+=dx/d*460*dt;s.y+=dy/d*460*dt;}}
    shots=shots.filter(s=>!s.dead);for(const f of fxs)f.life-=dt;fxs=fxs.filter(f=>f.life>0);
    for(let i=enemies.length-1;i>=0;i--)if(enemies[i].dead)enemies.splice(i,1);
    if(phase==='defend'&&!spawnQ.length&&enemies.length===0&&!over)endRound();}
  function adjCoil(x,y){for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(inGrid(nx,ny)&&built[ny][nx]&&built[ny][nx].kind==='coil')return true;}return false;}
  function hit(e,dmg){if(e.slow>0)dmg*=1.5;if(e.shield>0){const a=Math.min(e.shield,dmg);e.shield-=a;dmg-=a;boom(e.x,e.y,'#bcd6e8');if(dmg<=0)return;}e.hp-=dmg;boom(e.x,e.y,e.slow>0?'#9be0ff':'#f6c66b');
    if(e.hp<=0&&!e.dead){e.dead=true;roundKills++;pops.push({x:e.x,y:e.y,r:e.r,col:e.col,life:1});gain(3,e.x,e.y-e.r-12);
      if(e.boss){gems+=2;floats.push({x:e.x,y:e.y-e.r-12,txt:'+◈2',col:'#67dcec',life:1});updRes();buzz([20,40,80]);flash('Brute down! +◈2');}
      else if(Math.random()<.06){gems+=1;floats.push({x:e.x,y:e.y-e.r-12,txt:'+◈1',col:'#67dcec',life:1});updRes();}
      if(e.k==='kelp'&&!e.s2)for(let j=0;j<2;j++)enemies.push({k:'s',col:'#6ad08a',r:5,gx:e.gx+(j?.3:-.3),gy:e.gy,x:e.x,y:e.y,hp:3,max:3,spd:e.spd*1.2,ph:0,slow:0,s2:1});}}
  function gain(amt,x,y){const v=Math.round(amt*MOD.income);tokens+=v;roundEarned+=v;floats.push({x,y,txt:'+◆'+v,col:'#f6c66b',life:1});updRes();}
  function floatAtWallet(txt,col){floats.push({x:W/2,y:96,txt,col,life:1});}
  function boom(x,y,c){for(let i=0;i<6;i++)fxs.push({x,y,vx:(Math.random()-.5)*3,vy:(Math.random()-.7)*3,life:.6,kind:'spark',c});}

  function endRound(){phase='reward';setMood('happy','we held!');capSay('♪');const kills=roundKills,killGold=kills*3,bonus=15+round*8;tokens+=bonus;roundEarned+=bonus;pulsePower=Math.min(100,pulsePower+25);updRes();
    $('cardIn').innerHTML=`<div class="t" style="color:var(--good)">Wave ${round} held</div>
      <div class="ledger">
        <div class="r"><span>Gunk cleared (${kills})</span><span>+◆${killGold}</span></div>
        <div class="r"><span>Wave bonus</span><span>+◆${bonus}</span></div>
        ${gems?`<div class="r"><span>Gems banked</span><span style="color:var(--gem)">◈${gems}</span></div>`:''}
        <div class="r tot"><span>Earned this round</span><span class="totval">+◆${roundEarned}</span></div>
      </div><button class="again" id="cardBtn">Continue →</button>`;
    $('card').classList.add('show');countUp($('cardIn').querySelector('.totval'),roundEarned,'+◆');buzz(18);$('cardBtn').onclick=()=>{$('card').classList.remove('show');round++;startPrep();};}

  // ---------- Special: one perk, chosen upfront, kept for the whole run ----------
  const SPECIALS=[
    {key:'engineer',ic:ICON.up,col:'#7fd4d0',name:'Engineer',desc:'Towers & blocks cost 20% less'},
    {key:'quartermaster',ic:ICON.coins,col:'#f6c66b',name:'Quartermaster',desc:'+30% token income, every round'},
    {key:'warden',ic:ICON.heart,col:'#5ad08a',name:'Warden',desc:'Start with +1 Beacon heart (4 total)'},
    {key:'ranger',ic:ICON.target,col:'#ef6a4a',name:'Ranger',desc:'Captain starts tougher — +damage & +range'},
  ];
  let chosenSpecial=null;
  function applySpecial(k){chosenSpecial=k;
    if(k==='engineer')MOD.cost=0.8; else if(k==='quartermaster')MOD.income=1.3;
    else if(k==='warden'){MAX_HEARTS=4;hearts=Math.max(hearts,4);updHearts();}
    else if(k==='ranger'){AV.powBonus+=6;AV.dmg+=6;AV.rangeBonus+=.5;AV.range+=.5;}}
  function pickSpecial(){$('cardIn').innerHTML=`<div class="t" style="color:var(--brass-2)">Choose a Bonus</div><div class="s">Pick one bonus for this run.</div>`+
      SPECIALS.map(s=>`<button class="boon" data-k="${s.key}" style="color:${s.col}"><span class="bic">${s.ic}</span><span style="color:var(--ink)"><b style="color:${s.col}">${s.name}</b><i>${s.desc}</i></span></button>`).join('');
    $('card').classList.add('show');
    $('cardIn').querySelectorAll('.boon').forEach(btn=>btn.onclick=()=>{const k=btn.dataset.k;applySpecial(k);try{localStorage.setItem('docklands_special',k);}catch(e){}flash(SPECIALS.find(x=>x.key===k).name+' — your Special!');$('card').classList.remove('show');});}
  function showIntro(){$('cardIn').innerHTML=`<div class="t" style="color:var(--brass-2)">Protect the Beacon</div>
    <div class="walk"><p class="walklead">Stop enemies before they reach the light.</p><div class="steps"><div class="step"><b>1</b><span>Tap a glowing tile.</span></div><div class="step"><b>2</b><span>Choose what to build.</span></div><div class="step"><b>3</b><span>Press Start Wave.</span></div></div><p class="walknote"><b>Portrait</b> opens captain upgrades.</p></div>
    <button class="again" id="cardBtn">Start</button>`;$('card').classList.add('show');$('cardBtn').onclick=()=>{$('card').classList.remove('show');if(!chosenSpecial)pickSpecial();};}
  function gameOver(){over=true;phase='over';bestRound=Math.max(bestRound,round);try{localStorage.setItem('docklands_best',bestRound);}catch(e){}
    $('cardIn').innerHTML=`<div class="t" style="color:var(--danger)">The dock fell</div><div class="big">W${round}</div><div class="s">You survived ${round} wave${round>1?'s':''}.<br>Best run: <b style="color:var(--brass-2)">Wave ${bestRound}</b></div><button class="again" id="cardBtn">Play again</button>`;$('card').classList.add('show');$('cardBtn').onclick=()=>{$('card').classList.remove('show');resetRun();};}

  function startPrep(){phase='prep';closeSheet();AV.hp=AV.maxHp;AV.down=false;AV.downT=0;updCapHp();roundEarned=0;roundKills=0;
    {const bp=iso(CORE.x,CORE.y);AV.x=bp.x;AV.y=bp.y+TH/2+92;}setMood('determined','guarding the Beacon');
    $('phase').className='phase prep';$('phaseLabel').textContent='BUILD';$('prepbar').classList.add('show');$('abar').classList.remove('show');$('dpad').classList.remove('show');layout();
    {const bp=iso(CORE.x,CORE.y);AV.x=bp.x;AV.y=bp.y+TH/2+92;}updRound();updMeter();
    if(!coachShown)flash('Tap a glowing tile to build');}
  function startDefend(){phase='defend';closeSheet();if(!refreshRoute()){flash('No path! free a route first',1);phase='prep';return;}
    {const bp=iso(CORE.x,CORE.y);AV.x=bp.x;AV.y=bp.y+TH/2+92;AV.down=false;AV.downT=0;AV.hp=AV.maxHp;updCapHp();}
    $('phase').className='phase defend';$('phaseLabel').textContent='DEFEND';$('prepbar').classList.remove('show');$('abar').classList.add('show');$('dpad').classList.add('show');layout();
    {const bp=iso(CORE.x,CORE.y);AV.x=bp.x;AV.y=bp.y+TH/2+92;}updMeter();setMood('determined','guarding the Beacon');
    if(!dpadCoach){dpadCoach=true;setTimeout(()=>{if(phase==='defend')flash('Hold the ◀▲▼▶ pad to move Capt. Pell',0);},600);}
    let nTw=0;for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++)if(built[y][x]&&built[y][x].kind!=='block')nTw++;
    if(nTw===0)setTimeout(()=>{if(phase==='defend')flash('⚠ No towers built — the Beacon is exposed!',1);},1700);
    const nt={3:'Rust Crab',5:'Runner',7:'Kelp Crawler',9:'Shielded Hulk',12:'Flyer — ignores walls!'}[round];
    const newPortal=(round===6||round===12||round===18);
    let sub='Hold the line';
    if(newPortal&&nt)sub='New portal · '+nt;
    else if(newPortal)sub='A new portal opened — defend more sides!';
    else if(round%10===0)sub='☠ '+TYPES.leviathan.named+' incoming';
    else if(round%5===0)sub='Mini-boss — Tide Brute';
    else if(nt)sub='New gunk: '+nt;
    startWave();banner('Wave '+round,sub);buzz(round%5===0?[40,60,40]:20);}

  // ---------- draw ----------
  function tile(gx,gy,fill,stroke){const p=iso(gx,gy);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+TW/2,p.y+TH/2);ctx.lineTo(p.x,p.y+TH);ctx.lineTo(p.x-TW/2,p.y+TH/2);ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
  function box(gx,gy,h,c){const p=iso(gx,gy);
    ctx.fillStyle=shade(c,-26);ctx.beginPath();ctx.moveTo(p.x-TW/2,p.y+TH/2);ctx.lineTo(p.x,p.y+TH);ctx.lineTo(p.x,p.y+TH-h);ctx.lineTo(p.x-TW/2,p.y+TH/2-h);ctx.closePath();ctx.fill();
    ctx.fillStyle=shade(c,-12);ctx.beginPath();ctx.moveTo(p.x+TW/2,p.y+TH/2);ctx.lineTo(p.x,p.y+TH);ctx.lineTo(p.x,p.y+TH-h);ctx.lineTo(p.x+TW/2,p.y+TH/2-h);ctx.closePath();ctx.fill();
    ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(p.x,p.y+TH/2-h);ctx.lineTo(p.x+TW/2,p.y+TH-h);ctx.lineTo(p.x,p.y+TH/2-h+TH/2);ctx.lineTo(p.x-TW/2,p.y+TH-h);ctx.closePath();ctx.fill();}
  function shade(hex,a){const n=parseInt(hex.slice(1),16);let r=(n>>16)+a,g=((n>>8)&255)+a,b=(n&255)+a;return`rgb(${clamp(r,0,255)},${clamp(g,0,255)},${clamp(b,0,255)})`;}
  const onRoute=(x,y)=>routeTiles.some(tt=>tt.x===x&&tt.y===y);
  function drawTower(b,gx,gy){const p=iso(gx,gy),cx=p.x,cy=p.y+TH/2;
    const gr=Math.min(1,(t-(b.born||t))*4);ctx.save();ctx.translate(cx,cy);ctx.scale(1,.25+.75*gr);ctx.translate(-cx,-cy); // plonk-in
    if(b.kind==='block'){box(gx,gy,16,'#9a6a38');const top=cy-16;ctx.strokeStyle='rgba(0,0,0,.28)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(cx-TW/4,top+TH/4);ctx.lineTo(cx+TW/4,top-TH/4);ctx.moveTo(cx-TW/4,top-TH/4+2);ctx.lineTo(cx+TW/4,top+TH/4+2);ctx.stroke();ctx.restore();return;}
    box(gx,gy,8,'#54636c'); // shared base
    if(b.kind==='turret'){ctx.strokeStyle='#aebfc8';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx,cy-8);ctx.lineTo(cx,cy-23);ctx.stroke();
      const gl=ctx.createRadialGradient(cx,cy-26,1,cx,cy-26,10);gl.addColorStop(0,'#cdf4f0');gl.addColorStop(1,'rgba(127,212,208,0)');ctx.fillStyle=gl;ctx.beginPath();ctx.arc(cx,cy-26,10,0,7);ctx.fill();
      ctx.fillStyle='#7fd4d0';ctx.beginPath();ctx.arc(cx,cy-26,4.5,0,7);ctx.fill();}
    else if(b.kind==='cannon'){ctx.save();ctx.translate(cx,cy-11);ctx.rotate(-0.55);ctx.fillStyle='#caa06a';ctx.fillRect(-3.5,-14,7,16);ctx.fillStyle='#3a2c18';ctx.fillRect(-3.5,-14,7,3);ctx.restore();
      ctx.fillStyle='#8a6a3a';ctx.beginPath();ctx.arc(cx,cy-9,5.5,0,7);ctx.fill();}
    else if(b.kind==='coil'){ctx.strokeStyle='#c79bff';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(cx,cy-11-i*6,8-i*1.6,3.2-i*.7,0,0,7);ctx.stroke();}
      const gl=ctx.createRadialGradient(cx,cy-31,1,cx,cy-31,8);gl.addColorStop(0,'#e9d6ff');gl.addColorStop(1,'rgba(176,127,240,0)');ctx.fillStyle=gl;ctx.beginPath();ctx.arc(cx,cy-31,8,0,7);ctx.fill();
      ctx.fillStyle='#d9b3ff';ctx.beginPath();ctx.arc(cx,cy-31,3,0,7);ctx.fill();}
    else if(b.kind==='net'){ctx.strokeStyle='#8aa0dd';ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(cx,cy-8);ctx.lineTo(cx,cy-20);ctx.stroke();
      ctx.strokeStyle='#aebfe8';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(cx,cy-25,6.5,0,7);ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx-4.5,cy-28.5);ctx.lineTo(cx+4.5,cy-21.5);ctx.moveTo(cx+4.5,cy-28.5);ctx.lineTo(cx-4.5,cy-21.5);ctx.moveTo(cx,cy-31.5);ctx.lineTo(cx,cy-18.5);ctx.moveTo(cx-6.5,cy-25);ctx.lineTo(cx+6.5,cy-25);ctx.stroke();}
    if(b.tier>0){ctx.fillStyle='#f6c66b';ctx.font='9px "Bahnschrift","Arial Narrow",sans-serif';ctx.textAlign='center';ctx.fillText('★'.repeat(b.tier),cx,cy-36);ctx.textAlign='left';}
    ctx.restore();
    if(b.flash&&t-b.flash<0.12){const em=b.kind==='cannon'?cy-9:b.kind==='coil'?cy-31:cy-26,a=1-(t-b.flash)/0.12;ctx.save();ctx.globalAlpha=a;const fl=ctx.createRadialGradient(cx,em,1,cx,em,7*a+4);fl.addColorStop(0,'#fff8e0');fl.addColorStop(1,'rgba(246,198,107,0)');ctx.fillStyle=fl;ctx.beginPath();ctx.arc(cx,em,7*a+4,0,7);ctx.fill();ctx.restore();}}
  function drawPortal(gx,gy,open,i){const p=iso(gx,gy),cx=p.x,cy=p.y+TH/2,pulse=.5+.5*Math.sin(t*(open?3.1:1.35)+i),fade=open?1:.55;
    ctx.save();ctx.globalAlpha=fade;tile(gx,gy,open?`rgba(239,106,74,${.08+.1*pulse})`:'rgba(38,58,65,.42)',open?'rgba(246,198,107,.34)':'rgba(127,212,208,.2)');
    ctx.fillStyle='rgba(0,0,0,.32)';ctx.beginPath();ctx.ellipse(cx,cy+TH*.35,TW*.43,TH*.34,0,0,7);ctx.fill();
    ctx.fillStyle=open?'#2b5962':'#263c43';ctx.beginPath();ctx.moveTo(cx,cy-TH*.28);ctx.lineTo(cx+TW*.38,cy);ctx.lineTo(cx,cy+TH*.28);ctx.lineTo(cx-TW*.38,cy);ctx.closePath();ctx.fill();
    ctx.strokeStyle=open?'rgba(246,198,107,.7)':'rgba(127,212,208,.35)';ctx.lineWidth=1.4;ctx.stroke();
    for(const side of [-1,1]){const px=cx+side*TW*.25,base=cy+TH*.07,h=open?TH*1.42:TH*.88;ctx.fillStyle=shade('#54636c',side<0?-24:-8);
      ctx.beginPath();ctx.moveTo(px-4,base);ctx.lineTo(px+4,base);ctx.lineTo(px+3,base-h);ctx.lineTo(px-3,base-h+2);ctx.closePath();ctx.fill();
      ctx.strokeStyle=open?'rgba(246,198,107,.75)':'rgba(127,212,208,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px+side*2,base-3);ctx.lineTo(px+side*2,base-h+5);ctx.stroke();}
    const py=cy-TH*.76,rx=TW*.29,ry=TH*.86;
    if(open){const glow=ctx.createRadialGradient(cx,py,2,cx,py,Math.max(26,TW*.72));glow.addColorStop(0,`rgba(103,220,236,${.5+.28*pulse})`);glow.addColorStop(.45,`rgba(239,106,74,${.25+.22*pulse})`);glow.addColorStop(1,'rgba(103,220,236,0)');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,py,Math.max(26,TW*.72),0,7);ctx.fill();
      const core=ctx.createRadialGradient(cx,py,2,cx,py,rx*1.25);core.addColorStop(0,'rgba(255,243,208,.9)');core.addColorStop(.28,'rgba(103,220,236,.8)');core.addColorStop(.68,'rgba(20,64,82,.85)');core.addColorStop(1,'rgba(6,18,22,.15)');
      ctx.fillStyle=core;ctx.beginPath();ctx.ellipse(cx,py,rx*.78,ry*.78,0,0,7);ctx.fill();
      ctx.strokeStyle=`rgba(255,196,108,${.78+.18*pulse})`;ctx.lineWidth=3.2;ctx.beginPath();ctx.ellipse(cx,py,rx,ry,0,0,7);ctx.stroke();
      for(let j=0;j<3;j++){ctx.strokeStyle=j===1?'rgba(103,220,236,.85)':'rgba(255,243,208,.62)';ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(cx,py,rx*(.68-j*.1),ry*(.68-j*.07),Math.sin(t*1.2+i+j)*.35,t*2+j*2.1,t*2+j*2.1+Math.PI*1.1);ctx.stroke();}
      for(let j=0;j<5;j++){const a=t*2.4+j*1.27+i,sx=cx+Math.cos(a)*rx*(.75+.18*Math.sin(t+j)),sy=py+Math.sin(a)*ry*.72;ctx.fillStyle=j%2?'#67dcec':'#f6c66b';ctx.fillRect(sx-1,sy-1,2,2);}
      ctx.fillStyle='rgba(255,243,208,.92)';ctx.font='700 7px "Bahnschrift","Arial Narrow",sans-serif';ctx.textAlign='center';ctx.fillText('PORTAL',cx,cy+TH*.72);
    }else{ctx.strokeStyle='rgba(127,212,208,.34)';ctx.lineWidth=1.4;ctx.setLineDash([3,3]);ctx.beginPath();ctx.ellipse(cx,py,rx*.82,ry*.66,0,0,7);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='rgba(246,198,107,.9)';ctx.font='700 8px "Bahnschrift","Arial Narrow",sans-serif';ctx.textAlign='center';ctx.fillText('W'+GATE_ROUND[i],cx,cy+TH*.55);}
    ctx.restore();}
  function draw(){
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#07222a');g.addColorStop(1,'#0a3038');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(127,212,208,.05)';ctx.lineWidth=1;for(let i=0;i<W;i+=28){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,H*.66);ctx.stroke();}
    // soft water plane + drop-shadow grounding the board
    {const bc=iso(CORE.x,CORE.y),rx=GRID*TW*.62,ry=GRID*TH*.78;const sh=ctx.createRadialGradient(bc.x,bc.y+TH,4,bc.x,bc.y+TH,rx);sh.addColorStop(0,'rgba(2,12,16,.55)');sh.addColorStop(.7,'rgba(2,12,16,.28)');sh.addColorStop(1,'rgba(2,12,16,0)');ctx.save();ctx.translate(bc.x,bc.y+TH);ctx.scale(1,ry/rx);ctx.translate(-bc.x,-(bc.y+TH));ctx.fillStyle=sh;ctx.beginPath();ctx.arc(bc.x,bc.y+TH,rx,0,7);ctx.fill();ctx.restore();}
    for(let s=0;s<GRID*2;s++)for(let gx=0;gx<GRID;gx++){const gy=s-gx;if(gy<0||gy>=GRID)continue;
      const sh=((gx+gy)%2===0);tile(gx,gy,sh?'#c9a06a':'#bd9560','rgba(0,0,0,.18)');
      if(phase==='prep'&&!built[gy][gx]&&!isCore(gx,gy)&&!isGate(gx,gy)){const pr=.5+.5*Math.sin(t*2+gx+gy);tile(gx,gy,`rgba(246,198,107,${.05+.08*pr})`);}}
    // ENTRANCES: active portals pulse; dormant portals show the wave they open.
    {const nOpen=activeGates().length;for(let i=0;i<ALL_GATES.length;i++){const g=ALL_GATES[i];drawPortal(g.x,g.y,i<nOpen,i);}}
    if(sheetOpen&&sTile){const pr=.5+.5*Math.sin(t*5);tile(sTile.x,sTile.y,`rgba(127,212,208,${.14+.08*pr})`,`rgba(246,198,107,${.75+.25*pr})`);
      const sp=iso(sTile.x,sTile.y);ctx.save();ctx.strokeStyle=`rgba(255,243,208,${.55+.25*pr})`;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(sp.x,sp.y+TH/2,TW*.3,TH*.3,0,0,7);ctx.stroke();ctx.restore();}
    // SYNERGY links: coil amplifies adjacent towers (pulsing violet thread)
    for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){if(!built[y][x]||built[y][x].kind!=='coil')continue;const c=iso(x,y);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;const nb=inGrid(nx,ny)&&built[ny][nx];if(nb&&nb.kind!=='block'&&nb.kind!=='coil'&&nb.kind!=='net'){const n=iso(nx,ny);
        ctx.strokeStyle=`rgba(176,127,240,${.3+.25*Math.sin(t*5+x+y)})`;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(c.x,c.y+TH/2-18);ctx.lineTo(n.x,n.y+TH/2-18);ctx.stroke();}}}
    const items=[];for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++)if(built[y][x])items.push({d:x+y,z:0,kind:'b',x,y});
    const ag=pick(AV.x,AV.y);items.push({d:CORE.x+CORE.y,z:1,kind:'core'});items.push({d:ag.gx+ag.gy,z:1,kind:'av'});for(const e of enemies)items.push({d:99,z:2,kind:'e',e});
    items.sort((a,b)=>a.d-b.d||a.z-b.z);
    for(const it of items){if(it.kind==='b')drawTower(built[it.y][it.x],it.x,it.y);else if(it.kind==='core')drawBeacon();else if(it.kind==='av')drawAv();else drawEnemy(it.e);}
    ctx.fillStyle='#f6c66b';for(const s of shots){ctx.beginPath();ctx.arc(s.x,s.y,2.6,0,7);ctx.fill();}
    for(const f of fxs){if(f.kind==='beam'&&!f.tx.dead){ctx.strokeStyle='rgba(246,198,107,.7)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(f.tx.x,f.tx.y);ctx.stroke();}
      else if(f.kind==='slash'){const a=Math.max(0,f.life/.2);ctx.save();ctx.globalAlpha=a;ctx.strokeStyle='#fff3d0';ctx.lineWidth=3;ctx.beginPath();ctx.arc(f.x,f.y,16,f.a-.7,f.a+.7);ctx.stroke();ctx.restore();}
      else if(f.kind==='slamring'){const a=Math.max(0,f.life/.45),R=(1-a)*TW*1.8+8;ctx.save();ctx.globalAlpha=a;ctx.strokeStyle='#f6c66b';ctx.lineWidth=3;ctx.beginPath();ctx.arc(f.x,f.y,R,0,7);ctx.stroke();ctx.restore();}
      else if(f.kind==='spawn'){const a=Math.max(0,f.life/.5),R=(1-a)*TW*.62+TW*.14;ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=f.col||'#67dcec';ctx.lineWidth=2.2;ctx.beginPath();ctx.ellipse(f.x,f.y,R,R*TH/TW,0,0,7);ctx.stroke();
        ctx.strokeStyle='rgba(255,243,208,.7)';ctx.lineWidth=1;for(let j=0;j<4;j++){const an=f.ph+j*1.57+t*2,px=f.x+Math.cos(an)*R*.45;ctx.beginPath();ctx.moveTo(px,f.y-TH*(.8+.25*j));ctx.lineTo(px+Math.sin(an)*4,f.y-TH*.2);ctx.stroke();}ctx.restore();}
      else if(f.kind==='spark'){ctx.globalAlpha=Math.max(0,f.life/.6);ctx.fillStyle=f.c||'#f6c66b';ctx.fillRect(f.x+(f.vx||0)*8,f.y+(f.vy||0)*8,2,2);ctx.globalAlpha=1;}}
    // enemy death pops
    for(const p of pops){const a=p.life,r2=p.r*(1+(1-a)*2);ctx.save();ctx.globalAlpha=a*.85;ctx.strokeStyle=p.col;ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(p.x,p.y-8,r2,0,7);ctx.stroke();ctx.restore();}
    // range ring while inspecting a built tower
    if(sheetOpen&&sCtx==='built'&&sTile){const b=built[sTile.y][sTile.x];if(b&&b.kind!=='block'){const tp=iso(sTile.x,sTile.y),cx=tp.x,cy=tp.y+TH/2,rng=(TDEF[b.kind].range+(b.tier||0)*.4)*TW/2*1.42;ctx.save();ctx.strokeStyle='rgba(127,212,208,.55)';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.beginPath();ctx.arc(cx,cy,rng,0,7);ctx.stroke();ctx.restore();}}
    // floating currency
    ctx.font='bold 15px "Bahnschrift","Arial Narrow",sans-serif';ctx.textAlign='center';
    for(const f of floats){ctx.globalAlpha=Math.max(0,Math.min(1,f.life));ctx.fillStyle=f.col;ctx.fillText(f.txt,f.x,f.y-(1-f.life)*34);}ctx.globalAlpha=1;ctx.textAlign='left';
    if(pulseRing>0){const cp=iso(CORE.x,CORE.y);ctx.save();ctx.globalAlpha=Math.max(0,1-pulseRing);ctx.strokeStyle='#f6c66b';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(cp.x,cp.y+TH/2,pulseRing*W*.6,pulseRing*W*.6*TH/TW,0,0,7);ctx.stroke();ctx.restore();}
    // cinematic vignette
    {const vg=ctx.createRadialGradient(W/2,H*.46,Math.min(W,H)*.34,W/2,H*.5,Math.max(W,H)*.72);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.30)');ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);}}
  function drawBeacon(){const cp=iso(CORE.x,CORE.y);const dx=beaconShake>0?Math.sin(t*50)*beaconShake*5:0;let bx=cp.x+dx;const by=cp.y+TH/2,low=hearts<=1,pulse=.6+.4*Math.sin(t*(low?6:2));
    const col=low?'239,106,74':'246,198,107',lampY=by-34;
    // rotating lighthouse sweep — two opposing light cones
    {const sweep=(t*1.1)%(Math.PI*2);ctx.save();ctx.translate(bx,lampY);for(let k=0;k<2;k++){const a=sweep+k*Math.PI;const grd=ctx.createLinearGradient(0,0,Math.cos(a)*160,Math.sin(a)*74);grd.addColorStop(0,`rgba(${col},${.26*pulse})`);grd.addColorStop(1,`rgba(${col},0)`);ctx.fillStyle=grd;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a-.14)*160,Math.sin(a-.14)*74);ctx.lineTo(Math.cos(a+.14)*160,Math.sin(a+.14)*74);ctx.closePath();ctx.fill();}ctx.restore();}
    // vertical light shaft
    const beam=ctx.createLinearGradient(bx,by-104,bx,by-22);beam.addColorStop(0,'rgba(246,198,107,0)');beam.addColorStop(1,`rgba(${col},${.22*pulse})`);ctx.fillStyle=beam;ctx.fillRect(bx-9,by-104,18,82);
    // ground bloom
    const aura=ctx.createRadialGradient(bx,by-13,2,bx,by-13,54*pulse+24);aura.addColorStop(0,`rgba(${col},.95)`);aura.addColorStop(.5,`rgba(${col},.5)`);aura.addColorStop(1,`rgba(${col},0)`);
    ctx.fillStyle=aura;ctx.beginPath();ctx.arc(bx,by-13,54*pulse+24,0,7);ctx.fill();
    // lighthouse tower base (3-face iso) + upper segment — shaken in lockstep with the column
    ctx.save();ctx.translate(dx,0);box(CORE.x,CORE.y,16,'#b98a4e');ctx.restore();
    ctx.fillStyle='#b98a4e';ctx.fillRect(bx-9,by-32,18,16);ctx.fillStyle='#caa06a';ctx.fillRect(bx-11,by-36,22,5);
    // lamp room + white-hot core
    ctx.fillStyle=`rgba(${col},${.85})`;ctx.beginPath();ctx.arc(bx,lampY,11+2.5*pulse,0,7);ctx.fill();
    ctx.fillStyle=low?'#ffd2c4':'#fffceb';ctx.beginPath();ctx.arc(bx,lampY,5.5+1.5*pulse,0,7);ctx.fill();}
  function drawAv(){const bx=AV.x,by=AV.y;
    const out=AV.evolved?'#f6c66b':AV.outfit,skin=AV.skin,hair=AV.hair;
    if(AV.down){ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(bx,by,9,4,0,0,7);ctx.fill();
      const pr=.5+.5*Math.sin(t*5);ctx.strokeStyle=`rgba(246,198,107,${.5+.4*pr})`;ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(bx,by-4,15,-1.57,-1.57+6.283*Math.min(1,AV.downT/4));ctx.stroke();
      ctx.fillStyle=out;ctx.beginPath();ctx.arc(bx,by-4,7,0,7);ctx.fill();ctx.fillStyle=skin;ctx.beginPath();ctx.arc(bx+4,by-6,4,0,7);ctx.fill();
      ctx.fillStyle='#f6c66b';ctx.font='8px "Bahnschrift","Arial Narrow",sans-serif';ctx.textAlign='center';ctx.fillText('DOWN — recovering',bx,by-16);ctx.textAlign='left';return;}
    const bob=Math.sin(t*2.4)*1.0, breathe=Math.sin(t*2.4)*0.7, atk=(t-AV.lastAtk)<0.18;
    if(phase==='prep'){const pr=.5+.5*Math.sin(t*3);ctx.strokeStyle=`rgba(127,212,208,${.28+.28*pr})`;ctx.lineWidth=1.6;ctx.setLineDash([4,4]);ctx.beginPath();ctx.arc(bx,by-10,18,0,7);ctx.stroke();ctx.setLineDash([]);}
    ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(bx,by+2,9,4,0,0,7);ctx.fill();
    const topY=by-9-bob;
    // legs
    ctx.strokeStyle='#2c3a52';ctx.lineWidth=2.6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(bx-2.6,by-3);ctx.lineTo(bx-2.6,by+2);ctx.moveTo(bx+2.6,by-3);ctx.lineTo(bx+2.6,by+2);ctx.stroke();
    // body
    ctx.fillStyle=out;rr(bx-5,topY,10,12+breathe,3);
    if(AV.evolved){ctx.strokeStyle='#caa06a';ctx.lineWidth=1;ctx.strokeRect(bx-5,topY+3,10,5);} // bulwark plate
    // arms — outer arm lifts when attacking
    ctx.strokeStyle=out;ctx.lineWidth=2.8;ctx.beginPath();ctx.moveTo(bx-4,topY+3);ctx.lineTo(bx-7,topY+8);
    ctx.moveTo(bx+4,topY+3);ctx.lineTo(bx+(atk?8:7),topY+(atk?-3:8));ctx.stroke();
    // a little lantern/tool in the raised hand
    ctx.fillStyle=atk?'#fff3d0':(WEAPON[AV.weapon]?WEAPON[AV.weapon].accent:'#e8a23c');ctx.beginPath();ctx.arc(bx+(atk?8:7),topY+(atk?-4:9),2.7,0,7);ctx.fill();
    // head
    ctx.fillStyle=skin;ctx.beginPath();ctx.arc(bx,topY-5,5.6,0,7);ctx.fill();
    ctx.fillStyle=hair;ctx.beginPath();ctx.arc(bx,topY-6.5,5.9,Math.PI,0);ctx.fill();ctx.fillRect(bx-5.9,topY-6.5,11.8,2);
    const blink=Math.sin(t*0.8)>0.97; if(!blink){ctx.fillStyle='#221208';ctx.beginPath();ctx.arc(bx-2,topY-5,.95,0,7);ctx.arc(bx+2,topY-5,.95,0,7);ctx.fill();}
    // emote bubble (the name lives in the HUD portrait card)
    if(capEmoteT>t){ctx.fillStyle='#fff';ctx.font='15px "Bahnschrift","Arial Narrow",sans-serif';ctx.textAlign='center';ctx.fillText(capEmote,bx,topY-15+Math.sin(t*7));ctx.textAlign='left';}}
  function drawEnemy(e){const a=Math.min(1,(t-(e.born||t))*4);ctx.save();ctx.globalAlpha=a;
    const ph=Math.sin(t*6+e.ph),y=e.y-8+ph*1.3,sx=1+ph*.08,sy=1-ph*.08;
    ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(e.x,e.y+2,e.r*.95,e.r*.42,0,0,7);ctx.fill();
    ctx.save();ctx.translate(e.x,y);ctx.scale(sx,sy);
    ctx.fillStyle=e.col;ctx.beginPath();ctx.arc(0,0,e.r,0,7);ctx.fill();
    ctx.strokeStyle='rgba(4,18,22,.45)';ctx.lineWidth=1.6;ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.2)';ctx.beginPath();ctx.arc(-e.r*.32,-e.r*.36,e.r*.36,0,7);ctx.fill();
    ctx.fillStyle='#06181c';ctx.beginPath();ctx.arc(-e.r*.3,-2,1.7,0,7);ctx.arc(e.r*.3,-2,1.7,0,7);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.85)';ctx.beginPath();ctx.arc(-e.r*.3+.5,-2.5,.6,0,7);ctx.arc(e.r*.3+.5,-2.5,.6,0,7);ctx.fill();
    ctx.restore();
    if(e.shield>0){ctx.strokeStyle='rgba(170,210,240,.9)';ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(e.x,y,e.r+4,0,7);ctx.stroke();}
    if(e.fly){ctx.strokeStyle='rgba(230,160,222,.85)';ctx.lineWidth=2;const w=4+Math.abs(Math.sin(t*16))*4;ctx.beginPath();ctx.moveTo(e.x-e.r+1,y-1);ctx.lineTo(e.x-e.r-w,y-7);ctx.moveTo(e.x+e.r-1,y-1);ctx.lineTo(e.x+e.r+w,y-7);ctx.stroke();}
    if(e.boss){ctx.fillStyle='#f6c66b';ctx.font='700 9px "Bahnschrift","Arial Narrow",sans-serif';ctx.textAlign='center';ctx.fillText(e.named||'BOSS',e.x,y-e.r-12);ctx.textAlign='left';}
    if(e.slow>0){ctx.strokeStyle='rgba(150,220,255,.85)';ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(e.x,y,e.r+3,0,7);ctx.stroke();ctx.fillStyle='#bfeaff';ctx.font='9px "Bahnschrift","Arial Narrow",sans-serif';ctx.textAlign='center';ctx.fillText('❄',e.x,y-e.r-9);ctx.textAlign='left';}
    ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(e.x-e.r,y-e.r-8,e.r*2,3.6);ctx.fillStyle=e.hp/e.max>.4?'#7fd4d0':'#ef6a4a';ctx.fillRect(e.x-e.r,y-e.r-8,e.r*2*Math.max(0,e.hp/e.max),3.6);
    ctx.restore();}

  // ---------- HUD ----------
  function updRes(){$('tokens').textContent=Math.round(tokens);$('gems').textContent=gems;pop('tok');}
  function pop(k){const el=document.querySelector('.coin.'+k+' b');if(!el)return;el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop');}
  function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();ctx.fill();}
  function capFace(mood){const skin=AV.skin,hair=AV.hair,out=AV.evolved?'#f6c66b':AV.outfit;
    const mouth=mood==='happy'?'<path d="M9 16.5q3 3 6 0" stroke="#7a3a26" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
      :mood==='worried'?'<path d="M9 17.5q3 -2.5 6 0" stroke="#7a3a26" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
      :'<path d="M9.5 16.5h5" stroke="#7a3a26" stroke-width="1.5" stroke-linecap="round"/>';
    const brow=mood==='worried'?'<path d="M8 8.5l3 1M16 8.5l-3 1" stroke="#2a1a12" stroke-width="1.2" stroke-linecap="round"/>':'';
    return `<svg viewBox="0 0 24 26"><rect x="3.5" y="20" width="17" height="6.5" rx="3.2" fill="${out}"/><circle cx="12" cy="12" r="7" fill="${skin}"/><path d="M5 11.5a7 7 0 0 1 14 0c.2-5.5-3-8-7-8s-7.2 2.5-7 8z" fill="${hair}"/><circle cx="9.4" cy="12" r="1.15" fill="#221208"/><circle cx="14.6" cy="12" r="1.15" fill="#221208"/>${brow}${mouth}</svg>`;}
  function setMood(m,txt){curMood=m;curStat=txt||'guarding the Beacon';renderFace();}
  function renderFace(){const f=$('cface');if(f)f.innerHTML=capFace(curMood);const c=$('cstat');if(c){c.textContent=curStat;c.className='cstat'+(curMood==='happy'?' happy':curMood==='worried'?' worried':'');}const n=$('cname');if(n)n.textContent='CAPT. '+AV.name;}
  function capSay(em){capEmote=em;capEmoteT=t+1.6;}
  function updRound(){$('roundNum').textContent=round;}
  function updHearts(){$('hearts').innerHTML=Array.from({length:MAX_HEARTS},(_,i)=>`<span class="${i<hearts?'':'gone'}">♥</span>`).join('');}
  function updCapHp(){const b=$('chpbar');if(!b)return;const f=Math.max(0,AV.hp/AV.maxHp);b.style.width=(f*100)+'%';b.classList.toggle('low',f<.35);}
  function beaconHit(){boom(CORE.x,CORE.y,'#ef6a4a');beaconShake=1;buzz([30,40,30]);setMood('worried',"the Beacon's hurt!");capSay('!');if(hearts<=0){gameOver();return true;}flash('Beacon hit! '+hearts+' ♥ left',1);return false;}
  function flash(m,bad){const el=$('toast');el.textContent=m;el.className='toast show'+(bad?' bad':'');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),1900);}
  function banner(title,sub){const el=$('wavebanner');if(!el)return;el.innerHTML='<b>'+title+'</b>'+(sub?'<i>'+sub+'</i>':'');el.classList.remove('show');void el.offsetWidth;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2200);}
  function buzz(p){try{if(navigator.vibrate)navigator.vibrate(p);}catch(e){}}
  function countUp(el,target,prefix){if(!el)return;let v=0;const step=Math.max(1,Math.ceil(target/22));el.textContent=prefix+'0';function tick(){v=Math.min(target,v+step);el.textContent=prefix+v;if(v<target)requestAnimationFrame(tick);}requestAnimationFrame(tick);}

  // ---------- loop + input ----------
  let last=performance.now();
  function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;t+=dt;if(pulseRing>0){pulseRing+=dt*1.6;if(pulseRing>=1)pulseRing=0;}
    for(const f of floats)f.life-=dt*.8;floats=floats.filter(f=>f.life>0);for(const p of pops)p.life-=dt*2.4;for(let i=pops.length-1;i>=0;i--)if(pops[i].life<=0)pops.splice(i,1);if(beaconShake>0)beaconShake=Math.max(0,beaconShake-dt*3);if(slamCd>0)slamCd=Math.max(0,slamCd-dt);
    draw();if(phase==='defend')step(dt);requestAnimationFrame(frame);}
  function hitsChrome(x,y){
    const top=document.querySelector('.top')?.getBoundingClientRect();if(top&&y<top.bottom+6)return true;
    if(phase==='prep'){const bar=$('prepbar');if(bar?.classList.contains('show')){const r=bar.getBoundingClientRect();if(y>r.top-4)return true;}}
    return false;
  }
  cv.addEventListener('pointerdown',e=>{const x=e.clientX,y=e.clientY;
    if(phase==='defend')return; // captain moves via the D-pad / WASD
    if(phase!=='prep')return;
    if(sheetOpen){closeSheet();return;}
    if(hitsChrome(x,y))return;
    if(Math.hypot(AV.x-x,(AV.y-10)-y)<24){openSheet('avatar');return;} // tap the captain
    const {gx,gy}=pickTouch(x,y);if(!inGrid(gx,gy))return;
    if(isCore(gx,gy)){flash("That's the Beacon — protect it!");return;}if(isGate(gx,gy)){flash('The gunk enters through this portal');return;}
    if(built[gy][gx])openSheet('built',{x:gx,y:gy});else openSheet('tile',{x:gx,y:gy});});
  $('sheetX').onclick=closeSheet;
  $('capcard').addEventListener('click',()=>{if(phase==='prep')openSheet('avatar');else flash('Captain upgrades are in BUILD');});
  document.querySelectorAll('#dpad button').forEach(b=>{const d=b.dataset.d;
    const on=e=>{e.preventDefault();pad[d]=1;b.classList.add('on');};const off=()=>{pad[d]=0;b.classList.remove('on');};
    b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);b.addEventListener('pointerleave',off);b.addEventListener('pointercancel',off);});
  addEventListener('keydown',e=>{keys[e.key]=true;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();});
  addEventListener('keyup',e=>{keys[e.key]=false;});
  $('ready').onclick=()=>{if(phase==='prep')startDefend();};
  $('pulse').onclick=()=>{if(pulsePower<50){flash('Pulse needs 50 power',1);return;}pulsePower-=50;pulseRing=1;for(const e of enemies){if(e.dead)continue;const dx=e.gx-CORE.x,dy=e.gy-CORE.y,d=Math.hypot(dx,dy)||1;e.gx+=dx/d*1.6;e.gy+=dy/d*1.6;e.slow=1.4;hit(e,4);}flash('◎ Pulse — gunk shoved back!');};
  function updPulse(){$('pulse').disabled=pulsePower<50;$('pulse').textContent='◎ PULSE '+Math.round(pulsePower);}const pulseTimer=setInterval(updPulse,200);
  $('slam').onclick=()=>{if(AV.down){flash('Captain is down',1);return;}if(slamCd>0){flash('Slam recharging…',1);return;}slamCd=6;fxs.push({x:AV.x,y:AV.y-8,life:.45,kind:'slamring'});
    const ct=invIso(AV.x,AV.y-TH/2);for(const e of enemies){if(e.dead)continue;if(Math.hypot(e.x-AV.x,(e.y-8)-(AV.y-12))<TW*1.6){hit(e,AV.dmg*2);const dx=e.gx-ct.gx,dy=e.gy-ct.gy,d=Math.hypot(dx,dy)||1;e.gx+=dx/d*1.4;e.gy+=dy/d*1.4;e.slow=Math.max(e.slow,.7);}}flash('⊛ SLAM!');};
  function updSlam(){const b=$('slam');if(!b)return;b.disabled=slamCd>0;b.textContent=slamCd>0?'⊛ '+Math.ceil(slamCd)+'s':'⊛ SLAM';}const slamTimer=setInterval(updSlam,200);
  // Cleanup: clear always-on HUD intervals when the iframe is torn down or backgrounded so they don't leak.
  function clearTimers(){clearInterval(pulseTimer);clearInterval(slamTimer);}
  addEventListener('pagehide',clearTimers);
  addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')clearTimers();});
  function resetRun(){round=1;tokens=140;gems=0;MAX_HEARTS=3;hearts=3;pulsePower=40;over=false;enemies=[];shots=[];fxs=[];floats=[];spawnQ=[];coachShown=false;MOD.income=1;MOD.dmg=1;MOD.cost=1;
    Object.assign(AV,{dmg:9,range:1.6,maxHp:70,hp:70,evolved:false,down:false,downT:0,weapon:'wrench',owned:{wrench:1},powBonus:0,rangeBonus:0,fx:'melee',cdBase:.45});
    const sp=chosenSpecial;chosenSpecial=null;if(sp)applySpecial(sp); // keep the once-per-player Special
    blank();refreshRoute();updRound();updRes();updHearts();updCapHp();updPulse();startPrep();}
  layout();blank();refreshRoute();updRound();updRes();updHearts();updCapHp();updPulse();startPrep();
  {let saved=null;try{saved=localStorage.getItem('docklands_special');bestRound=+localStorage.getItem('docklands_best')||1;}catch(e){}if(saved)applySpecial(saved);}
  showIntro();requestAnimationFrame(frame);
})();
