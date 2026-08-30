// ==UserScript==
// @name         XenForo Story Reader (AO3-style)
// @namespace    xfreader.local
// @version      0.7.2
// @description  Reformats threadmarked XenForo story threads into an AO3-style reader: chapter TOC, inline discussion, persistent cache, EPUB export.
// @author       elfensky
// @homepageURL  https://github.com/elfensky/xenforo-story-reader
// @supportURL   https://github.com/elfensky/xenforo-story-reader/issues
// @downloadURL  https://raw.githubusercontent.com/elfensky/xenforo-story-reader/main/xenforo-story-reader.user.js
// @updateURL    https://raw.githubusercontent.com/elfensky/xenforo-story-reader/main/xenforo-story-reader.user.js
// @match        https://forum.questionablequesting.com/threads/*
// @match        https://questionablequesting.com/threads/*
// @match        https://forums.spacebattles.com/threads/*
// @match        https://forums.sufficientvelocity.com/threads/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function(){
'use strict';
/* ===== CONSTANTS ===== */
const LS_PREFIX='xfReader:', DB_NAME='xfReaderDB', DB_STORE='cache', CACHE_SCHEMA=2;
const MIN_GAP=120, MAX_CONC=4, RETRIES=3, PREFETCH_DISC_MAX=10;
const SITE_FONT='"Segoe UI","Helvetica Neue",Helvetica,Roboto,Oxygen,Ubuntu,Cantarell,"Fira Sans","Droid Sans",sans-serif';

/* ===== NET ===== */
const Net = (() => {
  let active=0; const q=[]; let last=0;
  function pump(){
    if(active>=MAX_CONC || !q.length) return;
    const now=Date.now(), wait=Math.max(0, last+MIN_GAP-now);
    if(wait>0){ setTimeout(pump, wait); return; }
    last=Date.now(); active++;
    const {url,opts,resolve,reject,tries}=q.shift();
    fetch(url,{credentials:'include',...opts})
      .then(async r=>{
        if((r.status===429||r.status===503) && tries<RETRIES){
          const back=Math.min(8000,(2**tries)*300)+Math.random()*200;
          setTimeout(()=>{ q.push({url,opts,resolve,reject,tries:tries+1}); pump(); }, back); return;
        }
        if(!r.ok) throw new Error('HTTP '+r.status);
        resolve(await r.text());
      })
      .catch(e=>{
        if(tries<RETRIES){ const back=Math.min(8000,(2**tries)*300)+Math.random()*200; setTimeout(()=>{ q.push({url,opts,resolve,reject,tries:tries+1}); pump(); }, back); }
        else reject(e);
      })
      .finally(()=>{ active--; pump(); });
  }
  return { text:(url,opts={})=>new Promise((resolve,reject)=>{ q.push({url,opts,resolve,reject,tries:0}); pump(); }) };
})();

/* ===== ADAPTER ===== */
const Adapter = (() => {
  const parse = h => new DOMParser().parseFromString(h,'text/html');
  const base = () => { const m=location.href.match(/(https?:\/\/[^\/]+\/threads\/[^\/]+\.(\d+))\//); return m?m[1]+'/':null; };
  return {
    parse, threadBase: base,
    threadId: () => { const m=location.href.match(/\.(\d+)\//); return m?m[1]:null; },
    threadTitle: () => (document.querySelector('h1.p-title-value')||{}).textContent?.trim()||'Story',
    threadmarksUrl: () => base()+'threadmarks',
    pageUrl: (n) => base()+(n>1?('page-'+n):''),
    categoryIdFromHref: (href) => { if(!href) return 1; const m=href.match(/threadmark_category=(\d+)/); return m?+m[1]:1; },
    tmUrl: (catId,page) => { let u=base()+'threadmarks'; const q=[]; if(catId&&catId!==1) q.push('threadmark_category='+catId); if(page&&page>1) q.push('page='+page); return u+(q.length?('?'+q.join('&')):''); },
    hasThreadmarks: () => {
      const tb=base(); if(!tb) return false;
      const tm=(tb+'threadmarks').replace(/\/$/,'');
      const tab=[...document.querySelectorAll('a[href]')].some(a=>{ try{return new URL(a.getAttribute('href'),location.href).href.replace(/\/$/,'')===tm;}catch(e){return false;} });
      return tab || !!document.querySelector('.structItem--threadmark, [class*="threadmark-category"]');
    },
    categoryTabs: (doc) => {
      const w=doc.querySelector('.block-tabHeader--threadmarkCategoryTabs')||doc.querySelector('[class*="threadmarkCategoryTabs"]');
      if(!w) return [];
      return [...w.querySelectorAll('.tabs-tab,[role="tab"],a')].map((t,i)=>({label:t.textContent.trim(),href:t.getAttribute('href'),idx:i})).filter(t=>t.label);
    },
    threadmarkRows: (doc) => [...doc.querySelectorAll('.structItem--threadmark')].map(r=>{
      const a=r.querySelector('.structItem-title a'); if(!a) return null;
      const href=a.getAttribute('href')||'';
      const pm=href.match(/page-(\d+)/), im=href.match(/post-(\d+)/);
      return { title:a.textContent.trim(), postId:im?im[1]:null, page:pm?+pm[1]:1 };
    }).filter(Boolean),
    tmMaxPage: (doc) => { const scope=doc.querySelector('.block--threadmarkList')||doc; const p=[...scope.querySelectorAll('.pageNav-page a,.pageNav a')].map(a=>a.textContent.trim()).filter(t=>/^\d+$/.test(t)); return p.length?Math.max(...p.map(Number)):1; },
    posts: (doc) => [...doc.querySelectorAll('.message--post, article.message')].map(p=>({
      id:(p.getAttribute('data-content')||'').replace('post-',''),
      author:(p.getAttribute('data-author')||'').trim(),
      bodyHtml:(p.querySelector('.message-body .bbWrapper')||{}).innerHTML||''
    })).filter(x=>x.id)
  };
})();

/* ===== CACHE ===== */
const Cache = (() => {
  const mem=new Map(); let dbp=null;
  function db(){ if(dbp) return dbp; dbp=new Promise((res,rej)=>{ const r=indexedDB.open(DB_NAME,1); r.onupgradeneeded=()=>r.result.createObjectStore(DB_STORE); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); return dbp; }
  async function get(k){
    if(mem.has(k)) return mem.get(k);
    try{ const d=await db(); return await new Promise((res)=>{ const t=d.transaction(DB_STORE).objectStore(DB_STORE).get(k); t.onsuccess=()=>{ const v=t.result; if(v&&v.schema===CACHE_SCHEMA){ mem.set(k,v.data); res(v.data);} else res(null); }; t.onerror=()=>res(null); }); }catch(e){ return null; }
  }
  async function set(k,data){ mem.set(k,data); try{ const d=await db(); const t=d.transaction(DB_STORE,'readwrite'); t.objectStore(DB_STORE).put({schema:CACHE_SCHEMA,data,ts:Date.now()},k);}catch(e){} }
  return {get,set,mem};
})();

/* ===== STORE ===== */
const Store = (() => {
  function makeIndex(threadId,title,sections){
    return { threadId, title, sections,
      allChapters(){ return sections.flatMap(s=>s.chapters).filter(c=>c.postId).sort((a,b)=>(+a.postId)-(+b.postId)); },
      grouped(){ return sections.flatMap(s=>s.chapters.filter(c=>c.postId)); },
      list(view){ return view==='chrono'?this.allChapters():this.grouped(); },
      firstChapterId(){ const a=this.grouped(); return a.length?a[0].postId:null; } };
  }
  async function fetchCategoryAll(catId){
    const first=Adapter.parse(await Net.text(Adapter.tmUrl(catId,1)));
    const maxP=Adapter.tmMaxPage(first);
    let rows=Adapter.threadmarkRows(first);
    for(let p=2;p<=maxP;p++){ const d=Adapter.parse(await Net.text(Adapter.tmUrl(catId,p))); rows=rows.concat(Adapter.threadmarkRows(d)); }
    return rows;
  }
  async function buildIndex(){
    const key='index:'+Adapter.threadId();
    const root=Adapter.parse(await Net.text(Adapter.threadmarksUrl()));
    const tabs=Adapter.categoryTabs(root);
    const cats = tabs.length ? tabs.map(t=>({label:t.label,id:Adapter.categoryIdFromHref(t.href)})) : [{label:'Threadmarks',id:1}];
    const sections=[];
    for(const c of cats){ try{ sections.push({label:c.label, chapters:await fetchCategoryAll(c.id)}); }catch(e){ console.error('[xfReader] category failed',c,e); } }
    const index=makeIndex(Adapter.threadId(), Adapter.threadTitle(), sections);
    await Cache.set(key,{sections, title:index.title});
    return index;
  }
  async function cachedIndex(){
    const c=await Cache.get('index:'+Adapter.threadId());
    return c ? makeIndex(Adapter.threadId(), c.title, c.sections) : null;
  }
  async function getChapterBody(ch){
    const key='body:'+ch.postId; const c=await Cache.get(key); if(c!=null) return c;
    const doc=Adapter.parse(await Net.text(Adapter.pageUrl(ch.page)+'#post-'+ch.postId));
    const el=doc.querySelector('#post-'+ch.postId+' .bbWrapper')||doc.querySelector('[data-content="post-'+ch.postId+'"] .bbWrapper');
    const html=el?el.innerHTML:''; await Cache.set(key,html); return html;
  }
  async function getPagePosts(page){
    const key='posts:'+Adapter.threadId()+':'+page; const c=await Cache.get(key); if(c) return c;
    const doc=Adapter.parse(await Net.text(Adapter.pageUrl(page)));
    const posts=Adapter.posts(doc); await Cache.set(key,posts); return posts;
  }
  async function collectDiscussion(ch,nextCh,tokRef){
    const startPage=ch.page;
    const endPage = nextCh ? nextCh.page : startPage+PREFETCH_DISC_MAX;
    const out=[]; const startId=+ch.postId, endId=nextCh?+nextCh.postId:Infinity;
    for(let p=startPage;p<=endPage;p++){
      if(tokRef && tokRef.cancelled) return out;
      let posts; try{ posts=await getPagePosts(p);}catch(e){ break; }
      for(const post of posts){ const id=+post.id; if(id>startId && id<endId) out.push(post); }
      if(nextCh && posts.some(pp=>+pp.id>=endId)) break;
      if(!nextCh && p>=startPage+PREFETCH_DISC_MAX) break;
    }
    return out;
  }
  async function prefetchDiscussion(ch,nextCh){
    const startPage=ch.page, endPage=nextCh?Math.min(nextCh.page,startPage+PREFETCH_DISC_MAX):startPage+PREFETCH_DISC_MAX;
    for(let p=startPage;p<=endPage;p++){ try{ await getPagePosts(p); }catch(e){ break; } }
  }
  return {buildIndex,cachedIndex,getChapterBody,getPagePosts,collectDiscussion,prefetchDiscussion,makeIndex,fetchCategoryAll};
})();

/* ===== EPUB ===== */
const crcTable=(()=>{let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(buf){let c=0xFFFFFFFF;for(let i=0;i<buf.length;i++)c=crcTable[(c^buf[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function makeZip(files){
  const enc=new TextEncoder(); const chunks=[]; const central=[]; let offset=0;
  const u16=n=>{const b=new Uint8Array(2);new DataView(b.buffer).setUint16(0,n,true);return b;};
  const u32=n=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n>>>0,true);return b;};
  for(const f of files){
    const name=enc.encode(f.name); const data=typeof f.data==='string'?enc.encode(f.data):f.data;
    const crc=crc32(data);
    [u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0)].forEach(c=>chunks.push(c));
    chunks.push(name); chunks.push(data);
    central.push([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
    offset+=30+name.length+data.length;
  }
  const cdStart=offset; let cdLen=0; const cdChunks=[];
  for(const ch of central){ ch.forEach(c=>{cdChunks.push(c); cdLen+=c.length;}); }
  const eocd=[u32(0x06054b50),u16(0),u16(0),u16(central.length),u16(central.length),u32(cdLen),u32(cdStart),u16(0)];
  const all=[...chunks,...cdChunks,...eocd];
  let total=0; all.forEach(c=>total+=c.length);
  const out=new Uint8Array(total); let o=0; all.forEach(c=>{out.set(c,o);o+=c.length;});
  return new Blob([out],{type:'application/epub+zip'});
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function bodyToXhtml(html,title){
  const doc=new DOMParser().parseFromString('<div>'+html+'</div>','text/html');
  const root=doc.body.firstChild;
  root.querySelectorAll('script,iframe,style,noscript').forEach(n=>n.remove());
  root.querySelectorAll('*').forEach(el=>{
    [...el.attributes].forEach(a=>{ if(/^on/i.test(a.name)||a.name==='class'||a.name==='id'||a.name==='data-xf-init') el.removeAttribute(a.name); });
    if(el.tagName==='IMG'){ const ds=el.getAttribute('data-src'); if(ds) el.setAttribute('src',ds); if(!el.getAttribute('alt')) el.setAttribute('alt',''); }
  });
  const xml=new XMLSerializer().serializeToString(root);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/><title>'+esc(title)+'</title></head><body><h2>'+esc(title)+'</h2>'+xml+'</body></html>';
}
async function buildEpub(index,onProgress){
  const chapters=index.allChapters(); const files=[];
  files.push({name:'mimetype',data:'application/epub+zip'});
  files.push({name:'META-INF/container.xml',data:'<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'});
  const manifest=[], spine=[], nav=[];
  for(let i=0;i<chapters.length;i++){
    const ch=chapters[i]; const body=await Store.getChapterBody(ch);
    const fn='chap'+(i+1)+'.xhtml';
    files.push({name:'OEBPS/'+fn,data:bodyToXhtml(body,ch.title)});
    manifest.push('<item id="c'+i+'" href="'+fn+'" media-type="application/xhtml+xml"/>');
    spine.push('<itemref idref="c'+i+'"/>');
    nav.push('<navPoint id="n'+i+'" playOrder="'+(i+1)+'"><navLabel><text>'+esc(ch.title)+'</text></navLabel><content src="'+fn+'"/></navPoint>');
    if(onProgress) onProgress((i+1)/chapters.length);
  }
  files.push({name:'OEBPS/content.opf',data:'<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>'+esc(index.title)+'</dc:title><dc:language>en</dc:language><dc:identifier id="bid">urn:xfreader:'+index.threadId+'</dc:identifier></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'+manifest.join('')+'</manifest><spine toc="ncx">'+spine.join('')+'</spine></package>'});
  files.push({name:'OEBPS/toc.ncx',data:'<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:xfreader:'+index.threadId+'"/></head><docTitle><text>'+esc(index.title)+'</text></docTitle><navMap>'+nav.join('')+'</navMap></ncx>'});
  return makeZip(files);
}

/* ===== CSS ===== */
const CSS = [
'*{box-sizing:border-box}',
':host{all:initial;--bg:#181818;--fg:#e8e8e8;--side:#111;--line:#333;--muted:#999;--accent:#5b9;--quote:#222;}',
':host(.light){--bg:#faf9f6;--fg:#1a1a1a;--side:#f0efea;--line:#ddd;--muted:#555;--accent:#276;--quote:#eaeae4;}',
'.wrap{position:fixed;inset:0;z-index:2147483000;display:flex;background:var(--bg);color:var(--fg);font-family:'+SITE_FONT+';}',
'.side{width:320px;flex:0 0 320px;background:var(--side);border-right:1px solid var(--line);display:flex;flex-direction:column;}',
'.toc{flex:1;overflow:auto;padding:6px;}',
'.toc .sec{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);padding:10px 10px 4px;}',
'.toc a{display:block;padding:6px 10px;color:var(--fg);text-decoration:none;border-radius:6px;font-size:14px;cursor:pointer;}',
'.toc a:hover{background:color-mix(in srgb,var(--fg) 8%,transparent);}',
'.toc a.active{background:var(--accent);color:#fff;}',
'.foot{display:flex;gap:6px;padding:10px;border-top:1px solid var(--line);align-items:center;flex-wrap:nowrap;}',
'.foot button{flex:1 1 0;min-width:0;padding:9px 0;border:1px solid var(--line);background:transparent;color:var(--fg);border-radius:6px;cursor:pointer;font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;position:relative;}',
'.foot button:hover{background:color-mix(in srgb,var(--fg) 10%,transparent);}',
'.foot .expbtn{border-color:#3aa66f;background:#3aa66f;color:#fff;font-weight:700;}',
'.foot .expbtn:hover{background:#33915f;}',
'.foot .expbtn.is-loading{cursor:progress;}',
'.foot .expbtn.is-loading .lbl{display:inline-block;animation:xfspin .9s linear infinite;}',
'@keyframes xfspin{to{transform:rotate(360deg);}}',
'.foot button[data-tip]:hover::after,.foot button[data-tip].tip-show::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);background:var(--fg);color:var(--bg);font-size:12px;line-height:1;white-space:nowrap;padding:5px 8px;border-radius:5px;pointer-events:none;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.35);}',
'.foot button[data-tip]:hover::before,.foot button[data-tip].tip-show::before{content:"";position:absolute;bottom:calc(100% + 3px);left:50%;transform:translateX(-50%);border:5px solid transparent;border-top-color:var(--fg);pointer-events:none;z-index:10;}',
'.main{flex:1;overflow:auto;position:relative;}',
'.discbar{position:sticky;top:0;z-index:5;width:100%;margin-top:24px;padding:12px 24px;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(8px);border-top:1px solid var(--line);border-bottom:1px solid var(--line);font-weight:600;}',
'.chapter{max-width:760px;margin:0 auto;padding:32px 24px 40px;}',
'.chapter h1{font-size:24px;margin:0 0 20px;}',
'.chapter :is(p,li){line-height:1.7;}',
'.disc{max-width:760px;margin:0 auto;padding:0 24px 100px;}',
'.comment{border-top:1px solid var(--line);padding:14px 0;font-size:14px;}',
'.comment .who{font-weight:600;color:var(--accent);margin-bottom:4px;}',
'.comment [style*="color"]{color:inherit !important;}',
'.comment [style*="background"]{background:transparent !important;}',
'.comment blockquote{background:var(--quote);padding:8px 12px;border-radius:6px;border-left:3px solid var(--accent);margin:8px 0;}',
'.skel{background:linear-gradient(90deg,var(--line),transparent,var(--line));background-size:200% 100%;animation:sk 1.2s infinite;height:14px;border-radius:4px;margin:10px 0;}',
'@keyframes sk{0%{background-position:200% 0}100%{background-position:-200% 0}}'
].join('\n');

/* ===== WEB COMPONENT ===== */
class QQReader extends HTMLElement {
  constructor(){ super(); this.attachShadow({mode:'open'}); this.view=localStorage.getItem(LS_PREFIX+'view')||'grouped'; this._tok=0; }
  connectedCallback(){
    if(localStorage.getItem(LS_PREFIX+'theme')==='light') this.classList.add('light');
    const v=this.view;
    this.shadowRoot.innerHTML='<style>'+CSS+'</style>'+
      '<div class="wrap"><div class="side">'+
        '<div class="toc"></div>'+
        '<div class="foot">'+
          '<button class="expbtn" data-tip="EPUB (whole story)" aria-label="Export EPUB"><span class="lbl">\u2B07</span></button>'+
          '<button class="prev" data-tip="Previous chapter" aria-label="Previous chapter">\u2039</button>'+
          '<button class="next" data-tip="Next chapter" aria-label="Next chapter">\u203a</button>'+
          '<button class="viewtgl" data-tip="'+(v==='grouped'?'Story-first order':'Chronological order')+'" aria-label="Toggle reading order">'+(v==='grouped'?'\u2630':'\u21C5')+'</button>'+
          '<button class="theme" data-tip="Toggle theme" aria-label="Toggle theme">\u25D0</button>'+
          '<button class="close" data-tip="Close reader" aria-label="Close reader">\u2715</button>'+
        '</div>'+
      '</div><div class="main"><div class="chapter"></div><div class="discbar" style="display:none"></div><div class="disc"></div></div></div>';
    this._wire(); this._boot();
  }
  _q(s){ return this.shadowRoot.querySelector(s); }
  _wire(){
    this._q('.close').onclick=()=>this.remove();
    this._q('.theme').onclick=()=>{ this.classList.toggle('light'); localStorage.setItem(LS_PREFIX+'theme',this.classList.contains('light')?'light':'dark'); };
    this._q('.viewtgl').onclick=()=>{
      this.view=this.view==='grouped'?'chrono':'grouped';
      localStorage.setItem(LS_PREFIX+'view',this.view);
      const b=this._q('.viewtgl');
      b.textContent=this.view==='grouped'?'\u2630':'\u21C5';
      b.setAttribute('data-tip',this.view==='grouped'?'Story-first order':'Chronological order');
      this._renderTOC();
    };
    this._q('.prev').onclick=()=>this._step(-1);
    this._q('.next').onclick=()=>this._step(1);
    this._q('.expbtn').onclick=()=>this._export(this._q('.expbtn'));
    // touch long-press tooltips
    this.shadowRoot.querySelectorAll('.foot button[data-tip]').forEach(b=>{
      let t;
      b.addEventListener('touchstart',()=>{ t=setTimeout(()=>b.classList.add('tip-show'),400); },{passive:true});
      const clr=()=>{ clearTimeout(t); setTimeout(()=>b.classList.remove('tip-show'),1200); };
      b.addEventListener('touchend',clr); b.addEventListener('touchcancel',clr);
    });
  }
  async _boot(){
    const cached=await Store.cachedIndex();
    if(cached){ this.index=cached; this._renderTOC(); this._openChapter(this._lastId()||cached.firstChapterId()); }
    else this._skeletonTOC();
    Store.buildIndex().then(index=>{
      this.index=index; this._renderTOC();
      if(!cached) this._openChapter(this._lastId()||index.firstChapterId());
      this._prefetch(index);
    }).catch(e=>console.error('[xfReader] index build failed',e));
  }
  _lastId(){ return localStorage.getItem(LS_PREFIX+'last:'+Adapter.threadId()); }
  _skeletonTOC(){ this._q('.toc').innerHTML=Array.from({length:12}).map(()=>'<div class="skel"></div>').join(''); }
  _renderTOC(){
    if(!this.index) return;
    const toc=this._q('.toc'); toc.innerHTML='';
    if(this.view==='grouped'){
      for(const s of this.index.sections){
        if(!s.chapters.some(c=>c.postId)) continue;
        const h=document.createElement('div'); h.className='sec'; h.textContent=s.label; toc.appendChild(h);
        for(const c of s.chapters){ if(c.postId) toc.appendChild(this._tocLink(c)); }
      }
    } else {
      for(const c of this.index.allChapters()) toc.appendChild(this._tocLink(c));
    }
    if(this._curId) this._markActive(this._curId);
  }
  _tocLink(c){ const a=document.createElement('a'); a.textContent=c.title; a.dataset.id=c.postId; a.onclick=()=>this._openChapter(c.postId); return a; }
  _markActive(id){ this.shadowRoot.querySelectorAll('.toc a').forEach(a=>a.classList.toggle('active',a.dataset.id===String(id))); }
  _neighbors(id){ const chrono=this.index.allChapters(); const i=chrono.findIndex(c=>c.postId===String(id)); return {ch:chrono[i], next:chrono[i+1]||null}; }
  _step(d){ const list=this.index.list(this.view); const i=list.findIndex(c=>c.postId===String(this._curId)); const n=list[i+d]; if(n) this._openChapter(n.postId); }
  async _openChapter(id){
    if(!id||!this.index) return;
    this._curId=String(id); this._markActive(id);
    localStorage.setItem(LS_PREFIX+'last:'+Adapter.threadId(), this._curId);
    const tok=++this._tok; const tokRef={cancelled:false};
    this._tokRef && (this._tokRef.cancelled=true); this._tokRef=tokRef;
    const {ch,next}=this._neighbors(id); if(!ch) return;
    const chap=this._q('.chapter'); const disc=this._q('.disc'); const bar=this._q('.discbar');
    this._q('.main').scrollTop=0;
    chap.innerHTML='<h1>'+esc(ch.title)+'</h1><div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    disc.innerHTML=''; bar.style.display='none';
    const body=await Store.getChapterBody(ch);
    if(tok!==this._tok) return;
    chap.innerHTML='<h1>'+esc(ch.title)+'</h1>'+body;
    bar.style.display='block'; bar.textContent='Discussion \u2026';
    const comments=await Store.collectDiscussion(ch,next,tokRef);
    if(tok!==this._tok) return;
    bar.textContent='Discussion ('+comments.length+')';
    disc.innerHTML=comments.map(c=>'<div class="comment"><div class="who">'+esc(c.author||'')+'</div>'+c.bodyHtml+'</div>').join('') || '<div class="comment">No discussion for this chapter.</div>';
  }
  async _prefetch(index){
    const chrono=index.allChapters();
    let i=0;
    const pump=()=>{
      if(i>=chrono.length) return;
      const ch=chrono[i], next=chrono[i+1]||null; i++;
      Store.getChapterBody(ch).then(()=>Store.prefetchDiscussion(ch,next)).catch(()=>{})
        .finally(()=>(window.requestIdleCallback||setTimeout)(pump, {timeout:1500}));
    };
    for(let k=0;k<MAX_CONC;k++) pump();
  }
  async _export(btn){
    if(btn.dataset.busy==='1'||!this.index) return;
    btn.dataset.busy='1'; btn.classList.add('is-loading'); btn.disabled=true;
    const lbl=btn.querySelector('.lbl'); const set=t=>{ lbl.textContent=t; btn.setAttribute('data-tip',t); };
    const spin=()=>{ lbl.textContent='\u21BB'; };
    try{
      const chapters=this.index.allChapters(); let done=0;
      spin(); btn.setAttribute('data-tip','Preparing 0/'+chapters.length);
      await Promise.all(chapters.map(ch=>Store.getChapterBody(ch).then(()=>{ done++; btn.setAttribute('data-tip','Preparing '+done+'/'+chapters.length); })));
      btn.setAttribute('data-tip','Building EPUB\u2026');
      const blob=await buildEpub(this.index,p=>btn.setAttribute('data-tip','Building '+Math.round(p*100)+'%'));
      const url=URL.createObjectURL(blob); const a=document.createElement('a');
      a.href=url; a.download=(this.index.title||'story').replace(/[^\w\- ]+/g,'').trim()+'.epub';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);
      btn.classList.remove('is-loading'); lbl.textContent='\u2713'; btn.setAttribute('data-tip','Downloaded');
      setTimeout(()=>{ lbl.textContent='\u2B07'; btn.setAttribute('data-tip','EPUB (whole story)'); },3000);
    }catch(e){
      console.error('[xfReader] EPUB export failed',e);
      btn.classList.remove('is-loading'); lbl.textContent='\u26A0'; btn.setAttribute('data-tip','Export failed');
      setTimeout(()=>{ lbl.textContent='\u2B07'; btn.setAttribute('data-tip','EPUB (whole story)'); },3000);
    }
    finally{ btn.disabled=false; btn.dataset.busy='0'; }
  }
}
if(!customElements.get('qq-reader')) customElements.define('qq-reader',QQReader);

/* ===== BOOTSTRAP / LAUNCHER (threadmark-gated) ===== */
function mountLauncher(){
  if(document.querySelector('.xfr-launch')) return;
  if(!Adapter.hasThreadmarks()) return;
  const btn=document.createElement('button');
  btn.className='xfr-launch';
  btn.textContent='\uD83D\uDCD6 Reader';
  const s=document.createElement('style'); s.textContent='.xfr-launch{position:fixed;right:16px;bottom:16px;z-index:2147482000;padding:10px 16px;border-radius:24px;border:none;background:#5b9;color:#fff;font:600 14px '+SITE_FONT+';cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.3);}';
  document.head.appendChild(s);
  btn.onclick=()=>{ if(!document.querySelector('qq-reader')) document.body.appendChild(document.createElement('qq-reader')); };
  document.body.appendChild(btn);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mountLauncher);
else mountLauncher();
})();
