/* LOGIN-CORE:START — logika murni (tanpa DOM/Supabase) untuk tema latar & pengingat login. Diuji di tests/login-core.test.mjs */
const LoginCore=(function(){
  'use strict';
  const WIB_OFFSET_MIN=7*60;            // Asia/Jakarta = UTC+7, tanpa DST
  const DAY_MS=864e5, MIN_MS=6e4;
  const VARIANTS=['night','sunset','day'];
  const VARIANT_LABEL={night:'Malam',sunset:'Senja',day:'Siang'};
  const VARIANT_HOURS={night:'19:00–04:59',sunset:'05:00–06:00 & 16:01–18:59',day:'06:01–16:00'};
  // Menit-dalam-hari WIB tempat bucket berganti: 05:00→sunset, 06:01→day, 16:01→sunset, 19:00→night
  const BOUNDARIES=[300,361,961,1140];
  const toMs=d=>d instanceof Date?d.getTime():typeof d==='number'?d:Date.parse(d);
  function wibMinutes(date){const t=Math.floor(toMs(date)/MIN_MS)+WIB_OFFSET_MIN;return ((t%1440)+1440)%1440}
  /** 19:00–04:59 NIGHT · 05:00–06:00 SUNSET · 06:01–16:00 DAY · 16:01–18:59 SUNSET (resolusi menit) */
  function timeBucket(date){const m=wibMinutes(date);
    if(m>=1140||m<300)return 'night';
    if(m<=360)return 'sunset';
    if(m<=960)return 'day';
    return 'sunset'}
  /** ms sampai pergantian bucket berikutnya (selalu > 0) */
  function msToNextBoundary(date){const ms=toMs(date);const w=(((ms+WIB_OFFSET_MIN*MIN_MS)%DAY_MS)+DAY_MS)%DAY_MS;
    const nxt=BOUNDARIES.map(b=>b*MIN_MS).find(b=>b>w);return (nxt!==undefined?nxt:DAY_MS+BOUNDARIES[0]*MIN_MS)-w}
  const parseT=v=>{if(v===null||v===undefined||v==='')return null;const t=toMs(v);return isNaN(t)?null:t};
  function inSchedule(item,now){if(!item)return false;const n=toMs(now),s=parseT(item.startsAt),e=parseT(item.endsAt);
    if(s!==null&&n<s)return false;if(e!==null&&n>=e)return false;return true}
  function isComplete(t){return !!(t&&t.assets&&VARIANTS.every(v=>typeof t.assets[v]==='string'&&t.assets[v].length>0))}
  function canActivate(t){return isComplete(t)&&t.status!=='archived'}
  const hasSched=t=>(parseT(t.startsAt)!==null||parseT(t.endsAt)!==null)?1:0;
  /** Urutan: tema acara aktif (lengkap, dalam jadwal) prioritas tertinggi → tema default → bawaan */
  function resolveTheme(themes,now,builtin){
    const list=(Array.isArray(themes)?themes:[]).filter(t=>t&&t.status==='active'&&isComplete(t)&&inSchedule(t,now));
    list.sort((a,b)=>((+b.priority||0)-(+a.priority||0))||(hasSched(b)-hasSched(a))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))||String(a.id).localeCompare(String(b.id)));
    if(list.length)return {theme:list[0],source:'event'};
    const def=(Array.isArray(themes)?themes:[]).find(t=>t&&t.isDefault&&t.status!=='archived'&&isComplete(t));
    if(def)return {theme:def,source:'default'};
    return {theme:builtin||null,source:'builtin'}}
  function pickAsset(theme,bucket,builtin){return (theme&&theme.assets&&theme.assets[bucket])||(builtin&&builtin.assets&&builtin.assets[bucket])||''}
  /** waktu berikutnya (ms dari now) ketika hasil jadwal tema/pengingat bisa berubah; null jika tidak ada */
  function msToNextScheduleChange(items,now){const n=toMs(now);let best=null;
    (items||[]).forEach(t=>{[parseT(t&&t.startsAt),parseT(t&&t.endsAt)].forEach(x=>{if(x!==null&&x>n&&(best===null||x-n<best))best=x-n})});return best}
  /* ---------- Pengingat ---------- */
  const REM_LIMITS={title:60,message:240};
  function cleanText(s,max){let v=String(s??'').replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g,'');
    v=v.split('\n').map(l=>l.replace(/[ \t]+$/,'')).join('\n').replace(/\n{3,}/g,'\n\n').trim();return max?v.slice(0,max):v}
  function validateReminder(inp){inp=inp||{};const errors={};
    const rawT=cleanText(inp.title),rawM=cleanText(inp.message);
    if(rawT.length>REM_LIMITS.title)errors.title='Judul maksimal '+REM_LIMITS.title+' karakter';
    if(rawM.length>REM_LIMITS.message)errors.message='Pesan maksimal '+REM_LIMITS.message+' karakter';
    const enabled=inp.enabled===true;
    if(enabled&&!rawM)errors.message='Pesan wajib diisi jika pengingat ditampilkan';
    const s=parseT(inp.startsAt),e=parseT(inp.endsAt);
    if(inp.startsAt&&s===null)errors.startsAt='Tanggal mulai tidak valid';
    if(inp.endsAt&&e===null)errors.endsAt='Tanggal selesai tidak valid';
    if(s!==null&&e!==null&&e<=s)errors.endsAt='Waktu selesai harus setelah waktu mulai';
    return {ok:Object.keys(errors).length===0,errors,
      value:{enabled,title:rawT.slice(0,REM_LIMITS.title),message:rawM.slice(0,REM_LIMITS.message),
        startsAt:s!==null?new Date(s).toISOString():null,endsAt:e!==null?new Date(e).toISOString():null}}}
  /** Pengingat tampil hanya jika aktif, pesan tidak kosong, dan dalam jadwal */
  function reminderVisible(r,now){return !!(r&&r.enabled===true&&cleanText(r.message)&&inSchedule(r,now))}
  const reminderTitle=r=>cleanText(r&&r.title,REM_LIMITS.title)||'Pengingat';
  /* Dismiss = hanya sesi pengunjung ini (sessionStorage). Kunci memakai versi (updated_at) agar pesan baru dari admin tampil lagi. */
  const DISMISS_KEY='kasRT03_reminderDismissed';
  const remVersion=r=>String((r&&(r.version||r.updatedAt))||'v0');
  function isDismissed(store,r){try{return !!store&&store.getItem(DISMISS_KEY)===remVersion(r)}catch(e){return false}}
  function dismiss(store,r){try{store&&store.setItem(DISMISS_KEY,remVersion(r))}catch(e){}}
  /* ---------- Waktu WIB untuk input datetime-local (admin) ---------- */
  function wibLocalToIso(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);if(!m)return null;
    return new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5])-WIB_OFFSET_MIN*MIN_MS).toISOString()}
  function isoToWibLocal(iso){const t=parseT(iso);if(t===null)return '';const d=new Date(t+WIB_OFFSET_MIN*MIN_MS);const p=n=>String(n).padStart(2,'0');
    return d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate())+'T'+p(d.getUTCHours())+':'+p(d.getUTCMinutes())}
  /* ---------- Validasi file gambar tema ---------- */
  const IMG_RULES={types:{'image/jpeg':'jpg','image/png':'png','image/webp':'webp'},maxBytes:5*1024*1024,minW:1280,minH:720};
  function validateImageMeta(meta){const errs=[],warn=[];meta=meta||{};
    if(!IMG_RULES.types[meta.type])errs.push('Format harus JPG, PNG, atau WEBP');
    if(!(meta.size>0))errs.push('File kosong');else if(meta.size>IMG_RULES.maxBytes)errs.push('Ukuran maksimal 5 MB');
    if(meta.width!==undefined&&meta.height!==undefined){
      if(meta.width<IMG_RULES.minW||meta.height<IMG_RULES.minH)errs.push('Resolusi minimal '+IMG_RULES.minW+'×'+IMG_RULES.minH+' px');
      else{const r=meta.width/meta.height;if(r<1.5||r>2.1)warn.push('Disarankan rasio 16:9 (lanskap) agar gerbang tetap terlihat di semua layar')}}
    return {ok:errs.length===0,errors:errs,warnings:warn,ext:IMG_RULES.types[meta.type]||null}}
  function themeStatusLabel(t){if(!t)return '';if(t.status==='archived')return 'Arsip';if(t.status==='active')return 'Aktif';if(!isComplete(t))return 'Draft (belum lengkap)';return t.status==='inactive'?'Nonaktif':'Draft'}
  return {WIB_OFFSET_MIN,VARIANTS,VARIANT_LABEL,VARIANT_HOURS,BOUNDARIES,REM_LIMITS,IMG_RULES,DISMISS_KEY,
    wibMinutes,timeBucket,msToNextBoundary,inSchedule,isComplete,canActivate,resolveTheme,pickAsset,msToNextScheduleChange,
    cleanText,validateReminder,reminderVisible,reminderTitle,isDismissed,dismiss,wibLocalToIso,isoToWibLocal,validateImageMeta,themeStatusLabel};
})();
/* LOGIN-CORE:END */
