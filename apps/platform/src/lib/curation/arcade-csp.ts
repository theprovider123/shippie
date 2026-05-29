/**
 * Arcade Content-Security-Policy.
 *
 * Used in two places:
 *   1. Bake time — `prepare-showcases.mjs` injects a `<meta
 *      http-equiv="Content-Security-Policy">` into each
 *      `surface: 'arcade'` first-party showcase's `index.html` so the
 *      browser enforces the policy even when the bundle is opened
 *      offline / in dev / via direct file open.
 *   2. Runtime — `hooks.server.ts` `runtimeAssetTarget()` wraps the
 *      `assets.fetch()` response for first-party arcade slugs with
 *      this same string as a `Content-Security-Policy` HTTP header.
 *      Both layers active for defence-in-depth.
 *
 * Pure module — no `$lib` imports — so the Bun-driven
 * `prepare-showcases.mjs` script can import it via relative path.
 *
 * **What this allows + denies:**
 * - allows same-origin script + worker (so Stockfish.wasm + canvas
 *   game loops run)
 * - allows `'wasm-unsafe-eval'` for WebAssembly compilation
 * - allows Shippie's hashed local DB bootstrap that must run before
 *   the app bundle in hosted iframes
 * - allows blob: workers (Stockfish creates one)
 * - allows wss:// to shippie.app + *.shippie.app (proximity rendezvous
 *   uses same-origin `/__shippie/signal/[roomId]`)
 * - denies third-party CDN, payments, ads, trackers — they're simply
 *   not in any allow-list
 * - denies arbitrary inline scripts and `eval` — gameplay code must be
 *   bundled
 * - denies frames + objects + base — no smuggling extra hosts in
 *
 * Style allows `'unsafe-inline'` because the showcase apps' bundlers
 * commonly inject style tags. Reassess after Phase 1 if any game
 * style payload looks risky.
 */

export const CONTAINER_LOCAL_DB_BRIDGE_SCRIPT = `(function(){var currentScript=document.currentScript;var appId=currentScript&&currentScript.dataset&&currentScript.dataset.appId?currentScript.dataset.appId:'app_unknown';var protocol='shippie.bridge.v1';var seq=0;var pending=new Map();function postPending(id){var entry=pending.get(id);if(!entry)return;window.parent.postMessage(entry.message,window.location.origin);}function settle(id){var entry=pending.get(id);if(!entry)return null;pending.delete(id);clearTimeout(entry.timer);clearInterval(entry.interval);return entry;}function request(capability,method,payload){var id='local_db_'+(++seq);var message={protocol:protocol,id:id,appId:appId,capability:capability,method:method,payload:payload};return new Promise(function(resolve,reject){var entry={resolve:resolve,reject:reject,message:message,timer:0,interval:0};entry.timer=setTimeout(function(){var timedOut=settle(id);if(timedOut)timedOut.reject(new Error('Shippie local DB request timed out.'));},5000);entry.interval=setInterval(function(){postPending(id);},100);pending.set(id,entry);postPending(id);});}window.addEventListener('message',function(event){if(event.origin!==window.location.origin)return;var data=event.data;if(!data||data.protocol!==protocol||!pending.has(data.id))return;var entry=settle(data.id);if(!entry)return;if(data.ok){entry.resolve(data.result);return;}entry.reject(new Error(data.error&&data.error.message?data.error.message:'Shippie local DB request failed.'));});function rows(result){var list=result&&Array.isArray(result.rows)?result.rows:[];return list.map(function(row){return row&&row.payload&&typeof row.payload==='object'?row.payload:row;});}var shippie=window.shippie||{};var local=shippie.local||{};local.db={create:function(table,schema){return request('db.insert','create',{table:table,schema:schema}).then(function(){});},insert:function(table,value){return request('db.insert','insert',{table:table,value:value}).then(function(){});},query:function(table,opts){return request('db.query','query',Object.assign({table:table},opts||{})).then(rows);},search:function(table,query,opts){return request('db.query','search',Object.assign({table:table,query:query},opts||{})).then(rows);},vectorSearch:function(table,vector,opts){var v=Array.prototype.slice.call(vector||[]);return request('db.query','vectorSearch',{table:table,vector:v,opts:opts||{}}).then(function(result){return rows(result).map(function(row,index){var source=result&&result.rows&&result.rows[index];return Object.assign({},row,{score:source&&typeof source.score==='number'?source.score:0});});});},update:function(table,id,patch){return request('db.insert','update',{table:table,id:id,patch:patch}).then(function(){});},delete:function(table,id){return request('db.insert','delete',{table:table,id:id}).then(function(){});},count:function(table,opts){return request('db.query','count',Object.assign({table:table},opts||{})).then(function(result){return result&&typeof result.count==='number'?result.count:0;});},export:function(table,opts){return request('db.query','export',Object.assign({table:table},opts||{})).then(function(result){return new Blob([JSON.stringify(result)],{type:'application/json'});});},restore:function(){return Promise.resolve({createdAt:new Date().toISOString(),appId:appId,schemaVersion:1,encrypted:false});},lastBackup:function(){return request('db.query','lastBackup',{});},usage:function(){return request('storage.getUsage','usage',{}).then(function(result){return {usedBytes:result&&typeof result.bytes==='number'?result.bytes:0,warningLevel:'none',persisted:true};});},requestPersistence:function(){return Promise.resolve(true);}};shippie.local=local;window.shippie=shippie;})();`;

export const CONTAINER_LOCAL_DB_BRIDGE_SCRIPT_HASH = "'sha256-zv5iVNwgmH6P6I9rZYJPYErdtbVDHCQodhkXMnXXRy4='";

const DIRECTIVES: ReadonlyArray<readonly [string, string]> = [
  ['default-src', "'self'"],
  ['script-src', `'self' 'wasm-unsafe-eval' ${CONTAINER_LOCAL_DB_BRIDGE_SCRIPT_HASH}`],
  ['worker-src', "'self' blob:"],
  ['connect-src', "'self' wss://shippie.app wss://*.shippie.app"],
  ['img-src', "'self' data: blob:"],
  ['media-src', "'self' data: blob:"],
  ['font-src', "'self' data:"],
  ['style-src', "'self' 'unsafe-inline'"],
  ['frame-src', "'none'"],
  ['object-src', "'none'"],
  ['base-uri', "'none'"],
  ['form-action', "'self'"],
];

/**
 * Build the canonical arcade CSP string. Stable output (joined with
 * `; `) so HTTP header + meta tag emit byte-identical text.
 */
export function buildArcadeCsp(): string {
  return DIRECTIVES.map(([k, v]) => `${k} ${v}`).join('; ');
}

/**
 * Build the `<meta>` tag form for injection into a baked
 * `index.html`. Always include the trailing semicolon-free form so
 * the bake idempotency check (don't re-inject if already present) can
 * grep for the directive prefix.
 */
export function buildArcadeCspMetaTag(): string {
  return `<meta http-equiv="Content-Security-Policy" content="${buildArcadeCsp()}">`;
}

/**
 * Marker comment we emit alongside the meta tag so the bake step can
 * detect prior injection without re-parsing the CSP. Lets us run
 * `prepare-showcases.mjs` repeatedly without growing the head.
 */
export const ARCADE_CSP_INJECTION_MARKER = '<!-- shippie-arcade-csp v1 -->';
