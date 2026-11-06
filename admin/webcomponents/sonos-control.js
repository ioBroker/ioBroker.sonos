import{useEffect as e,useRef as t,useState as n,Fragment as r,jsx as i,jsxs as a,createRoot as o}from"../../../lib/esm/react-19.js";var s=`iob-dialog-close`;function c(e){return!!e.form}var l=[`header`,`staticText`,`divider`];function u(e,t){return e==null?``:typeof e==`object`?e[t]||e.en||Object.values(e).find(e=>!!e)||``:String(e)}function d(e){let t={};for(let[n,r]of Object.entries(e.items||{}))r&&!l.includes(r.type)&&(t[n]=r.type);return t}function f(e){return typeof e==`string`?e:typeof e==`number`||typeof e==`boolean`?e.toString():JSON.stringify(e)}function p(e,t){if(t!=null)switch(e){case`number`:case`slider`:{if(typeof t==`number`)return Number.isFinite(t)?t:void 0;let e=f(t).trim().replace(`,`,`.`);if(!e)return;let n=Number(e);return Number.isFinite(n)?n:void 0}case`checkbox`:return t===!0||t===`true`||t===1||t===`1`;default:return f(t)}}function m(e,t){let n={};for(let[r,i]of Object.entries(e)){let e=p(i,t[r]);e!==void 0&&(n[r]=e)}return n}var h=`"Roboto", "Helvetica", "Arial", sans-serif`,g=Object.freeze({type:`light`,primary:`#3399CC`,primaryContrast:`#FFFFFF`,secondary:`#164477`,secondaryContrast:`#FFFFFF`,background:`#FFFFFF`,paper:`#FFFFFF`,text:`rgba(0, 0, 0, 0.87)`,textSecondary:`rgba(0, 0, 0, 0.6)`,divider:`rgba(0, 0, 0, 0.12)`,error:`#D32F2F`,warning:`#ED6C02`,info:`#0288D1`,success:`#2E7D32`,fontFamily:h,fontSize:14,borderRadius:4}),_=Object.freeze({type:`dark`,primary:`#4DABF5`,primaryContrast:`rgba(0, 0, 0, 0.87)`,secondary:`#436A93`,secondaryContrast:`#FFFFFF`,background:`#121212`,paper:`#121212`,text:`#FFFFFF`,textSecondary:`rgba(255, 255, 255, 0.7)`,divider:`rgba(255, 255, 255, 0.12)`,error:`#F44336`,warning:`#FFA726`,info:`#29B6F6`,success:`#66BB6A`,fontFamily:h,fontSize:14,borderRadius:4}),v=[`primary`,`primaryContrast`,`secondary`,`secondaryContrast`,`background`,`paper`,`text`,`textSecondary`,`divider`,`error`,`warning`,`info`,`success`,`fontFamily`],y=[`fontSize`,`borderRadius`];function b(e){return{...e===`dark`?_:g}}function x(e){if(!e||typeof e!=`object`)return b(typeof e==`string`?e:`light`);let t=e,n=b(typeof t.type==`string`?t.type:`light`);for(let e of v){let r=t[e];typeof r==`string`&&r.trim()&&(n[e]=r.trim())}for(let e of y){let r=t[e],i=typeof r==`string`?parseFloat(r):r;typeof i==`number`&&Number.isFinite(i)&&i>=0&&(n[e]=i)}return n}function S(e,t){return e.type===t.type&&v.every(n=>e[n]===t[n])&&y.every(n=>e[n]===t[n])}function C(e){return`--iob-${e.replace(/[A-Z]/g,e=>`-${e.toLowerCase()}`)}`}function w(e){let t={};for(let n of v)t[C(n)]=e[n];for(let n of y)t[C(n)]=`${e[n]}px`;return t[`color-scheme`]=e.type,t}var T={ok:{en:`OK`,"zh-cn":`确定`},cancel:{en:`Cancel`,de:`Abbrechen`,ru:`Отмена`,pt:`Cancelar`,nl:`Annuleren`,fr:`Annuler`,it:`Annulla`,es:`Cancelar`,pl:`Anuluj`,uk:`Скасувати`,"zh-cn":`取消`},close:{en:`Close`,de:`Schließen`,ru:`Закрыть`,pt:`Fechar`,nl:`Sluiten`,fr:`Fermer`,it:`Chiudi`,es:`Cerrar`,pl:`Zamknij`,uk:`Закрити`,"zh-cn":`关闭`}},ee=`
dialog {
    box-sizing: border-box;
    width: 480px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    padding: 0;
    border: 0;
    border-radius: calc(var(--iob-border-radius) * 2);
    background: var(--iob-paper);
    color: var(--iob-text);
    font-family: var(--iob-font-family);
    font-size: var(--iob-font-size);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
/* as the dialogs of MUI: a dark paper gets lighter the higher it lies */
dialog.dark { background-image: linear-gradient(rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.16)); }
dialog::backdrop { background: rgba(0, 0, 0, 0.5); }
dialog:focus { outline: none; }
form { display: flex; flex-direction: column; height: 100%; max-height: inherit; margin: 0; }
header { display: flex; align-items: center; gap: 8px; padding: 12px 8px 12px 16px; font-size: 1.15em; font-weight: 500; }
header span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.body { flex: 1; min-height: 0; padding: 0 16px 16px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
footer { display: flex; justify-content: flex-end; gap: 8px; padding: 0 16px 16px; }
button { font: inherit; padding: 6px 16px; border-radius: var(--iob-border-radius); border: 1px solid var(--iob-primary); background: transparent; color: var(--iob-primary); cursor: pointer; }
button.primary { background: var(--iob-primary); color: var(--iob-primary-contrast); }
button.close { border: 0; padding: 2px 8px; font-size: 1.4em; line-height: 1; color: var(--iob-text-secondary); }
label { display: flex; flex-direction: column; gap: 4px; }
label.check { flex-direction: row; align-items: center; gap: 8px; }
input, select, textarea { font: inherit; accent-color: var(--iob-primary); }
.help { color: var(--iob-text-secondary); font-size: 0.85em; }
h3 { margin: 4px 0 0; font-size: 1em; }
p { margin: 0; }
hr { width: 100%; border: 0; border-top: 1px solid var(--iob-divider); margin: 0; }
[hidden] { display: none !important; }
`;function E(e){if(!e)return null;try{let t=Function(`data`,`return (${e});`);return e=>{try{return!!t(e)}catch{return!1}}}catch{return null}}function D(e){return typeof e==`string`?e:typeof e==`number`||typeof e==`boolean`?String(e):``}function te(e){let{input:t,setting:n}=e;if(t)return t instanceof HTMLInputElement&&t.type===`checkbox`?t.checked:t instanceof HTMLSelectElement?n.options?.[t.selectedIndex]?.value:t.value}function ne(e,t,n,r,i){let a={name:t,setting:n,box:e.createElement(`div`),hidden:E(n.hidden),disabled:E(n.disabled)},o=u(n.label,i);switch(n.type){case`header`:return a.box=e.createElement(`h3`),a.box.textContent=u(n.text,i)||o,a;case`staticText`:return a.box=e.createElement(`p`),a.box.textContent=u(n.text,i)||o,a;case`divider`:return a.box=e.createElement(`hr`),a}let s=e.createElement(`label`);a.box=s;let c=e.createElement(`span`);if(c.textContent=o||t,n.type===`checkbox`){let t=e.createElement(`input`);t.type=`checkbox`,t.checked=r===!0||r===`true`,s.className=`check`,s.append(t,c),a.input=t}else if(n.type===`select`){let t=e.createElement(`select`);for(let r of n.options||[]){let n=e.createElement(`option`);n.textContent=u(r.label,i),t.append(n)}let o=(n.options||[]).findIndex(e=>String(e.value)===D(r));t.selectedIndex=o===-1?0:o,s.append(c,t),a.input=t}else if(n.type===`text`&&(n.minRows||1)>1){let t=e.createElement(`textarea`);t.rows=n.minRows||2,t.value=D(r),s.append(c,t),a.input=t}else{let t=e.createElement(`input`),i=D(r);switch(n.type){case`number`:case`slider`:t.type=n.type===`slider`?`range`:`number`,n.min!==void 0&&(t.min=String(n.min)),n.max!==void 0&&(t.max=String(n.max)),t.step=n.step===void 0?`any`:String(n.step);break;case`password`:t.type=`password`;break;case`color`:t.type=!i||/^#[0-9a-f]{6}$/i.test(i)?`color`:`text`;break;default:t.type=`text`}if(t.value=i,t.type===`range`){let n=e.createElement(`output`);n.textContent=t.value,t.addEventListener(`input`,()=>n.textContent=t.value),c.append(`: `,n)}s.append(c,t),a.input=t}if(n.help){let t=e.createElement(`span`);t.className=`help`,t.textContent=u(n.help,i),s.append(t)}return a}function re(e,t={}){let n=t.lang||`en`,r=document,i=e=>T[e][n]||T[e].en||e,a=r.createElement(`div`);a.setAttribute(`data-iob-dialog`,``);let o=a.attachShadow({mode:`open`}),l=r.createElement(`style`);l.textContent=ee;let f=r.createElement(`dialog`),p=x(t.theme);f.className=p.type===`dark`?`dark`:``;for(let[e,t]of Object.entries(w(p)))f.style.setProperty(e,t);e.width&&(f.style.width=`${e.width}px`),e.height&&(f.style.height=`${e.height}px`);let h=r.createElement(`form`),g=r.createElement(`header`),_=r.createElement(`span`);_.textContent=u(e.title,n);let v=r.createElement(`button`);v.type=`button`,v.className=`close`,v.title=i(`close`),v.setAttribute(`aria-label`,i(`close`)),v.textContent=`×`,g.append(_,v);let y=r.createElement(`div`);return y.className=`body`,h.append(g,y),f.append(h),o.append(l,f),new Promise(t=>{let l=!1,p=e=>{l||(l=!0,f.open&&f.close(),a.remove(),t(e))};if(v.addEventListener(`click`,()=>p(null)),f.addEventListener(`close`,()=>p(null)),h.addEventListener(`submit`,e=>e.preventDefault()),c(e)){let t={},a=[];for(let[t,i]of Object.entries(e.form.items||{})){let o=e.data?.[t]??i.default,s=ne(r,t,i,o,n);a.push(s),y.append(s.box)}let o=()=>{for(let e of a)e.input&&(t[e.name]=te(e));return t},s=()=>{let e=o();for(let t of a)t.box.hidden=t.hidden?t.hidden(e):!1,t.input&&(t.input.disabled=t.disabled?t.disabled(e):!1)};h.addEventListener(`input`,s),h.addEventListener(`change`,s),s();let c=a.find(e=>e.input&&!e.box.hidden&&!e.input.disabled);c?.input&&(c.input.autofocus=!0);let l=r.createElement(`footer`),f=r.createElement(`button`);f.type=`button`,f.textContent=u(e.cancel,n)||i(`cancel`),f.addEventListener(`click`,()=>p(null));let g=r.createElement(`button`);g.type=`submit`,g.className=`primary`,g.textContent=u(e.ok,n)||i(`ok`),l.append(f,g),h.append(l),h.addEventListener(`submit`,()=>p(m(d(e.form),o())))}else y.append(e.element),f.addEventListener(s,e=>p(e.detail??null));r.body.append(a),f.showModal(),o.activeElement&&o.activeElement!==v||(f.tabIndex=-1,f.focus())})}function O(e){return[...new Set(e.filter(e=>typeof e==`string`&&!!e))]}var ie=[`socket`,`dialogs`,`theme`,`editMode`,`settings`,`value`],ae=class extends HTMLElement{states={};objects={};#e=null;#t={};#n=x(`light`);#r=!1;#i=null;#a=void 0;#o=null;#s=!1;#c=(e,t)=>{this.#o?.states.includes(e)&&(this.states[e]=t||null,this.#_())};#l=(e,t)=>{this.#o?.objects.includes(e)&&(this.objects[e]=t||null,this.#d())};get socket(){return this.#e}set socket(e){this.#e=e||null,this.#d()}get settings(){return this.#t}set settings(e){this.#t=e||{},this.#d()}get theme(){return this.#n}set theme(e){let t=x(e);S(t,this.#n)||(this.#n=t,this.#u(),this.#_())}get editMode(){return this.#r}set editMode(e){let t=!!e;t!==this.#r&&(this.#r=t,this.#_())}get dialogs(){return this.#i}set dialogs(e){this.#i=e||null}get value(){return this.#a}set value(e){e!==this.#a&&(this.#a=e,this.#_())}connectedCallback(){for(let e of ie)if(Object.prototype.hasOwnProperty.call(this,e)){let t=this[e];delete this[e],this[e]=t}this.#u(),this.#d()}disconnectedCallback(){this.#g()}getStateIds(e){return[]}getObjectIds(e){return[]}get systemLang(){return this.#e?.systemLang||`en`}text(e){return u(e,this.systemLang)}setState(e,t){return this.#e&&!this.#r?this.#e.setState(e,t):Promise.resolve()}changeValue(e){return this.#r||this.emit(`iob-change`,e)?!1:(this.value=e,!0)}emit(e,t){return this.dispatchEvent(new CustomEvent(e,{detail:t,bubbles:!0,composed:!0,cancelable:!0}))}async openDialog(e){if(this.#r)return null;let t=this.#i?await this.#i.open(e):await re(e,{lang:this.systemLang,theme:this.#n});return c(e)?t&&typeof t==`object`?m(d(e.form),t):null:t??null}#u(){for(let[e,t]of Object.entries(w(this.#n)))this.style.setProperty(e,t)}#d(){if(!this.isConnected)return;let e=this.#e,t=e?O(this.getStateIds(this.#t)):[],n=e?O(this.getObjectIds(this.#t)):[];this.#o&&this.#o.socket!==e&&this.#g();let r=this.#o?.states||[],i=this.#o?.objects||[],a=r.filter(e=>!t.includes(e)),o=i.filter(e=>!n.includes(e)),s=t.filter(e=>!r.includes(e)),c=n.filter(e=>!i.includes(e));e&&a.length&&e.unsubscribeState(a,this.#c),e&&o.length&&this.#h(e,o);for(let e of a)delete this.states[e];for(let e of[...a,...o])!t.includes(e)&&!n.includes(e)&&delete this.objects[e];this.#o=e&&(t.length||n.length)?{socket:e,states:t,objects:n}:null,e&&s.length&&this.#p(e,s),e&&c.length&&this.#m(e,c),this.#_()}#f(e,t,n){return this.#o?.socket===e&&this.#o[t].includes(n)}#p(e,t){e.subscribeState(t,this.#c).catch(e=>console.warn(`<${this.localName}>: cannot subscribe ${t.join(`, `)}: ${e}`));for(let n of t)e.getState(n).then(t=>{this.#f(e,`states`,n)&&this.states[n]===void 0&&(this.states[n]=t||null,this.#_())}).catch(()=>{}),e.getObject(n).then(t=>{this.#f(e,`states`,n)&&!this.#f(e,`objects`,n)&&(this.objects[n]=t||null,this.#_())}).catch(()=>{})}#m(e,t){e.subscribeObject(t,this.#l).catch(e=>console.warn(`<${this.localName}>: cannot subscribe the objects ${t.join(`, `)}: ${e}`));for(let n of t)e.getObject(n).then(t=>{this.#f(e,`objects`,n)&&(this.objects[n]=t||null,this.#d())}).catch(()=>{})}#h(e,t){e.unsubscribeObject(t,this.#l).catch(()=>{})}#g(){if(this.#o){let{socket:e,states:t,objects:n}=this.#o;t.length&&e.unsubscribeState(t,this.#c),n.length&&this.#h(e,n),this.#o=null}this.states={},this.objects={}}#_(){this.#s||(this.#s=!0,queueMicrotask(()=>{this.#s=!1,this.isConnected&&this.render()}))}};function oe(e,t){let n=typeof e==`string`?e:e.tag;customElements.get(n)||customElements.define(n,t)}var se={player:{tag:`iob-sonos-player`,module:`sonos-player.js`,manifest:`sonos-player.json`},rooms:{tag:`iob-sonos-rooms`,module:`sonos-rooms.js`,manifest:`sonos-rooms.json`},control:{tag:`iob-sonos-control`,module:`sonos-control.js`,manifest:`sonos-control.json`}},k=[`alive`,`coordinator`,`current_album`,`current_artist`,`current_cover`,`current_duration`,`current_elapsed`,`current_station`,`current_title`,`current_type`,`membersChannels`,`muted`,`night_mode`,`repeat`,`shuffle`,`speech_enhancement`,`state_simple`,`volume`],ce=[`alive`,`coordinator`,`current_artist`,`current_title`,`membersChannels`,`muted`,`state_simple`,`volume`],A=[`favorites_list_array`,`playlist_list_array`,`queue`,`queue_array`,`recent_tracks`,`media_browse_result`];function j(e){let t=typeof e==`string`?e.match(/^(sonos\.\d+)\.root\.([^.]+)(\.|$)/):null;return t?{namespace:t[1],room:t[2]}:null}function le(e){let t=String(e??``).trim(),n=t.match(/^(?:system\.adapter\.)?sonos\.(\d+)$/)||t.match(/^(\d+)$/);return n?`sonos.${n[1]}`:null}function M(e,t,n){return`${e}.root.${t}.${n}`}function N(e,t){let n=t==null?``:String(t).trim();return n&&n!==e?n:e}function P(e){return String(e??``).split(`,`).map(e=>e.trim()).filter(Boolean)}function F(e){if(!e||e<0||!Number.isFinite(e))return`0:00`;let t=Math.floor(e),n=Math.floor(t/3600),r=Math.floor(t%3600/60),i=String(t%60).padStart(2,`0`);return n?`${n}:${String(r).padStart(2,`0`)}:${i}`:`${r}:${i}`}function ue(e){if(e==null||e===``)return null;if(typeof e==`object`)return e;if(typeof e!=`string`)return null;try{return JSON.parse(e)}catch{return null}}function de(e,t){return e?typeof e==`string`?e:e[t]||e.en||``:``}function fe(e,t,n){let r=`${t}.root.`,i=[];for(let[t,a]of Object.entries(e||{})){let e=t.substring(r.length);if(!t.startsWith(r)||!e||e.includes(`.`))continue;let o=a?.common||{},s=typeof o.icon==`string`?o.icon:``;i.push({room:e,name:de(o.name,n)||e,color:typeof o.color==`string`?o.color:``,icon:/^(https?:|data:image\/)/.test(s)?s:``})}return i.sort((e,t)=>e.name.localeCompare(t.name))}function pe(e,t){return Number(e)===2&&t===`TV`}var me={play:`M8 5v14l11-7z`,pause:`M6 19h4V5H6v14zm8-14v14h4V5h-4z`,next:`M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z`,previous:`M6 6h2v12H6zm3.5 6l8.5 6V6z`,shuffle:`M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z`,repeat:`M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z`,repeatOne:`M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z`,volume:`M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z`,volumeOff:`M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z`,music:`M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z`,tv:`M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z`,night:`M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z`,speech:`M17 20c-.29 0-.56-.06-.76-.15-.71-.37-1.21-.88-1.71-2.38-.51-1.56-1.47-2.29-2.39-3-.79-.61-1.61-1.24-2.32-2.53C9.29 10.98 9 9.93 9 9c0-2.8 2.2-5 5-5s5 2.2 5 5h2c0-3.93-3.07-7-7-7S7 5.07 7 9c0 1.26.38 2.65 1.07 3.9.91 1.65 1.98 2.48 2.85 3.15.81.62 1.39 1.07 1.71 2.05.6 1.82 1.37 2.84 2.73 3.55.51.23 1.07.35 1.64.35 2.21 0 4-1.79 4-4h-2c0 1.1-.9 2-2 2zM7.64 2.64L6.22 1.22C4.23 3.21 3 5.96 3 9s1.23 5.79 3.22 7.78l1.41-1.41C6.01 13.74 5 11.49 5 9s1.01-4.74 2.64-6.36zM11.5 9c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5-1.12-2.5-2.5-2.5-2.5 1.12-2.5 2.5z`,library:`M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 5h-3v5.5c0 1.38-1.12 2.5-2.5 2.5S10 13.88 10 12.5s1.12-2.5 2.5-2.5c.57 0 1.08.19 1.5.51V5h4v2zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6z`,speakers:`M18.2 1H9.8C8.81 1 8 1.81 8 2.8v14.4c0 .99.81 1.79 1.8 1.79l8.4.01c.99 0 1.8-.81 1.8-1.8V2.8c0-.99-.81-1.8-1.8-1.8zM14 3c1.1 0 2 .89 2 2s-.9 2-2 2-2-.89-2-2 .9-2 2-2zm0 13.5c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 5H4v16c0 1.1.89 2 2 2h10v-2H6V5z`,link:`M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z`,star:`M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z`,playlist:`M19 9H2v2h17V9zm0-4H2v2h17V5zM2 15h13v-2H2v2zm15-2v6l5-3-5-3z`,queue:`M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z`,history:`M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z`,folder:`M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z`,back:`M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z`,search:`M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z`,clear:`M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z`,login:`M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z`,expand:`M21 11V3h-8l3.29 3.29-10 10L3 13v8h8l-3.29-3.29 10-10z`,speaker:`M17 2H7c-1.1 0-2 .9-2 2v16c0 1.1.9 1.99 2 1.99L17 22c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-5 2c1.1 0 2 .9 2 2s-.9 2-2 2c-1.11 0-2-.9-2-2s.89-2 2-2zm0 16c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z`,refresh:`M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z`};function I({name:e}){return/* @__PURE__ */ i(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":`true`,focusable:`false`,children:/* @__PURE__ */ i(`path`,{d:me[e]})})}var L=[``,`files/`,`webfs/`];function R(e){let t=new URL(e);t.search=``,t.hash=``;let n=t.pathname.split(`/`);return t.pathname=`${n.slice(0,Math.max(1,n.length-4)).join(`/`)}/`,t.href}var z=R(import.meta.url),B=0;function V(e){if(!e)return[];if(!/^\/[^/]/.test(e))return[e];let t=e.substring(1);return[B,...L.keys()].filter((e,t,n)=>n.indexOf(e)===t).map(e=>`${z}${L[e]}${t}`)}function he(e){for(let t=L.length-1;t>=0;t--)if(e.startsWith(`${z}${L[t]}`)){B=t;return}}function H(e){let t=[e.children?`pill`:`icon`];return e.className&&t.push(e.className),e.active&&t.push(`active`),/* @__PURE__ */ a(`button`,{type:`button`,className:t.join(` `),title:e.title,"aria-label":e.title,"aria-pressed":e.active===void 0?void 0:e.active,disabled:e.disabled,onClick:t=>{t.stopPropagation(),e.onClick()},children:[/* @__PURE__ */ i(I,{name:e.icon}),e.children]})}function U({value:r,max:a,step:o,label:s,disabled:c,onCommit:l,onPreview:u}){let[d,f]=n(null),p=t(null),m=t({onCommit:l,onPreview:u}),h=t(void 0);e(()=>{m.current={onCommit:l,onPreview:u}}),e(()=>{let e=p.current;if(!e)return;let t=()=>{m.current.onCommit(Number(e.value)),clearTimeout(h.current),h.current=setTimeout(()=>{f(null),m.current.onPreview?.(null)},2e3)};return e.addEventListener(`change`,t),()=>{e.removeEventListener(`change`,t),clearTimeout(h.current)}},[]);let g=Math.min(a,Math.max(0,d??r)),_=a>0?g/a*100:0;return/* @__PURE__ */ i(`input`,{ref:p,type:`range`,min:0,max:a,step:o||1,value:g,disabled:c,"aria-label":s,title:s,style:{"--fill":`${_}%`},onClick:e=>e.stopPropagation(),onChange:e=>{clearTimeout(h.current);let t=Number(e.currentTarget.value);f(t),u?.(t)}})}function W({url:t,icon:r,className:a}){let[o,s]=n(null);e(()=>{if(!t)return;let e=V(t),n=new Image,r=0,i=!1,a=()=>{r<e.length?n.src=e[r]:(i=!0,s({url:t,src:``}))};return n.onload=()=>{i||(i=!0,e.length>1&&he(e[r]),s({url:t,src:e[r]}))},n.onerror=()=>{i||(r++,a())},a(),()=>{i=!0,n.onload=null,n.onerror=null}},[t]);let c=t&&o?o.src:``;return/* @__PURE__ */ i(`div`,{className:a?`cover ${a}`:`cover`,children:c?/* @__PURE__ */ i(`img`,{src:c,alt:``,referrerPolicy:`no-referrer`}):/* @__PURE__ */ i(I,{name:r})})}function G({text:e,icon:t,editMode:n,children:r}){return/* @__PURE__ */ a(`div`,{className:`hint${n?` edit`:``}`,children:[/* @__PURE__ */ i(I,{name:t}),/* @__PURE__ */ i(`span`,{children:e}),r]})}function ge(e,t,n,r,i=!0){let a=e=>{let t=n(e);return t==null?``:String(t)},o=e=>Number(n(e))||0,s=i?a(`current_cover`):``;return s&&r&&/^\/[^/]/.test(s)&&(s=`${s}${s.includes(`?`)?`&`:`?`}ts=${r}`),{name:t,grouped:N(e,n(`coordinator`))!==e||P(n(`membersChannels`)).filter(t=>t!==e).length>0,offline:n(`alive`)===!1,playing:n(`state_simple`)===!0,muted:n(`muted`)===!0,volume:o(`volume`),shuffle:n(`shuffle`)===!0,repeat:o(`repeat`),elapsed:o(`current_elapsed`),duration:o(`current_duration`),title:a(`current_title`),sub:[a(`current_artist`),a(`current_album`)||a(`current_station`)].filter(Boolean).join(` · `),cover:s,tv:pe(n(`current_type`),n(`current_title`)),nightMode:n(`night_mode`)===!0,speech:n(`speech_enhancement`)===!0}}var _e=[`sonosdm_repeat`,`sonosdm_repeat_all`,`sonosdm_repeat_one`];function K(e){return/* @__PURE__ */ a(`div`,{className:`groups`,children:[/* @__PURE__ */ i(`span`,{className:`label secondary`,children:e.label}),e.group.map(t=>/* @__PURE__ */ i(H,{icon:`link`,title:t.name,active:t.member,disabled:t.coordinator,onClick:()=>e.onGroup(t.room,!t.member),children:t.name},t.room))]})}function ve(e){let{values:t,word:o,onCommand:s}=e,[c,l]=n(null),u=t.offline,d=t.repeat>=0&&t.repeat<=2?t.repeat:0,f=e.showSeek&&!t.tv&&t.duration>0,p=c===null?t.elapsed:c/100*t.duration,m=[`view`,`player`];e.editMode&&m.push(`edit`),t.offline&&m.push(`offline`);let h=``;t.offline?h=` · ${o(`sonosdm_offline`)}`:t.grouped&&(h=` · ${o(`sonosdm_grouped`)}`);let g=e=>/* @__PURE__ */ i(H,{icon:t.playing?`pause`:`play`,className:e,title:o(t.playing?`sonosdm_pause`:`sonosdm_play`),disabled:u,onClick:()=>s(`state_simple`,!t.playing)}),_=/* @__PURE__ */ i(H,{icon:t.muted||t.volume<=0?`volumeOff`:`volume`,className:`small`,title:o(t.muted?`sonosdm_unmute`:`sonosdm_mute`),active:t.muted,disabled:u,onClick:()=>s(`muted`,!t.muted)}),v;return v=t.tv?/* @__PURE__ */ a(`div`,{className:`transport`,children:[e.showVolume?null:_,/* @__PURE__ */ i(H,{icon:`night`,title:o(`vis_night_mode`),active:t.nightMode,disabled:u,onClick:()=>s(`night_mode`,!t.nightMode)}),/* @__PURE__ */ i(H,{icon:`speech`,title:o(`vis_speech_enhancement`),active:t.speech,disabled:u,onClick:()=>s(`speech_enhancement`,!t.speech)})]}):/* @__PURE__ */ a(`div`,{className:`transport`,children:[e.showModes?/* @__PURE__ */ i(H,{icon:`shuffle`,className:`small mode`,title:o(`sonosdm_shuffle`),active:t.shuffle,disabled:u,onClick:()=>s(`shuffle`,!t.shuffle)}):null,/* @__PURE__ */ i(H,{icon:`previous`,title:o(`sonosdm_previous`),disabled:u,onClick:()=>s(`prev`,!0)}),g(`main`),/* @__PURE__ */ i(H,{icon:`next`,title:o(`sonosdm_next`),disabled:u,onClick:()=>s(`next`,!0)}),e.showModes?/* @__PURE__ */ i(H,{icon:d===2?`repeatOne`:`repeat`,className:`small mode`,title:o(_e[d]),active:d>0,disabled:u,onClick:()=>s(`repeat`,(d+1)%3)}):null,e.showVolume?null:_]}),/* @__PURE__ */ a(`div`,{className:m.join(` `),style:{"--accent":e.accent},children:[e.rooms&&e.rooms.length>1?/* @__PURE__ */ i(`div`,{className:`chips`,children:e.rooms.map(t=>/* @__PURE__ */ i(H,{icon:`music`,title:t.name,active:t.selected,disabled:!t.alive,onClick:()=>e.onSelectRoom(t.room),children:t.name},t.room))}):null,/* @__PURE__ */ a(`div`,{className:`head`,children:[e.showCover?/* @__PURE__ */ i(W,{url:t.cover,icon:t.tv?`tv`:`music`}):null,/* @__PURE__ */ a(`div`,{className:`info`,children:[/* @__PURE__ */ a(`div`,{className:`name secondary ellipsis`,children:[t.name,h]}),/* @__PURE__ */ i(`div`,{className:`title ellipsis`,children:t.title||o(`sonosdm_nothing_playing`)}),t.sub?/* @__PURE__ */ i(`div`,{className:`sub secondary ellipsis`,children:t.sub}):null]}),e.dialog?null:/* @__PURE__ */ a(`div`,{className:`quick`,children:[t.tv?null:g(`small`),e.onOpenPlayer?/* @__PURE__ */ i(H,{icon:`expand`,className:`small`,title:o(`wc_open_player`),disabled:u,onClick:e.onOpenPlayer}):null]})]}),f?/* @__PURE__ */ a(`div`,{className:`seek`,children:[/* @__PURE__ */ i(`span`,{className:`time`,children:F(p)}),/* @__PURE__ */ i(U,{value:Math.min(100,Math.max(0,t.elapsed/t.duration*100)),max:100,step:.1,label:o(`wc_position`),disabled:u,onPreview:l,onCommit:e=>s(`seek`,Math.round(e*10)/10)}),/* @__PURE__ */ i(`span`,{className:`time end`,children:F(t.duration)})]}):null,v,e.showVolume||e.showSource?/* @__PURE__ */ a(`div`,{className:`volume`,children:[e.showVolume?/* @__PURE__ */ a(r,{children:[_,/* @__PURE__ */ i(U,{value:t.volume,max:100,label:o(`wc_volume`),disabled:u,onCommit:e=>s(`volume`,e)}),/* @__PURE__ */ i(`span`,{className:`level`,children:Math.round(t.volume)})]}):/* @__PURE__ */ i(`span`,{style:{flex:1}}),e.showSource?/* @__PURE__ */ i(H,{icon:`library`,className:`small`,title:o(`sonosdm_select_source`),disabled:u,onClick:e.onOpenSources}):null]}):null,e.group&&e.group.length>1?/* @__PURE__ */ i(K,{group:e.group,label:o(`vis_group`),onGroup:e.onGroup}):null]})}var ye=[{id:`player`,label:`wc_player`,icon:`music`},{id:`group`,label:`sonos_ctrl_group`,icon:`link`},{id:`library`,label:`wc_library`,icon:`library`}];function be(e){let{word:t,speakers:r,group:o,library:s}=e,[c,l]=n(`player`),u=s!=null,d=ye.filter(e=>e.id===`player`||(e.id===`group`?!!o:u)),f=d.some(e=>e.id===c)?c:`player`,p=e=>`part part-${e}${e===f?` current`:``}`,m=[`view`,`control`];e.editMode&&m.push(`edit`);let h=t(`sonos_ctrl_group`);return o?.follows&&(h+=` · ${t(`sonos_ctrl_follows`)} ${o.follows}`),/* @__PURE__ */ a(`div`,{className:m.join(` `),style:{"--accent":e.accent},children:[r?/* @__PURE__ */ a(`div`,{className:`speakers`,children:[/* @__PURE__ */ a(`div`,{className:`speakers-head`,children:[/* @__PURE__ */ i(I,{name:`speakers`}),/* @__PURE__ */ i(`span`,{className:`label ellipsis`,children:t(`sonos_ctrl_speakers`)}),/* @__PURE__ */ i(H,{icon:`refresh`,className:`small`,title:t(`sonos_ctrl_refresh`),onClick:e.onRefresh})]}),/* @__PURE__ */ i(`div`,{className:`speaker-list`,children:r.map(n=>{let r=[`speaker`];return n.room===e.selected&&r.push(`selected`),n.playing&&r.push(`playing`),n.alive||r.push(`offline`),/* @__PURE__ */ a(`button`,{type:`button`,className:r.join(` `),title:n.name,"aria-pressed":n.room===e.selected,onClick:()=>e.onSelect(n.room),children:[/* @__PURE__ */ i(I,{name:n.playing?`play`:`speaker`}),/* @__PURE__ */ a(`span`,{className:`text`,children:[/* @__PURE__ */ a(`span`,{className:`speaker-name ellipsis`,style:n.color?{color:n.color}:void 0,children:[n.name,n.grouped?/* @__PURE__ */ i(`span`,{className:`secondary`,children:` · ${t(`sonosdm_grouped`)}`}):null]}),/* @__PURE__ */ i(`span`,{className:`speaker-sub secondary ellipsis`,children:n.alive?n.playingText||t(`sonosdm_nothing_playing`):t(`sonosdm_offline`)})]}),n.alive?/* @__PURE__ */ i(`span`,{className:`speaker-level secondary`,children:Math.round(n.volume)}):null]},n.room)})})]}):null,/* @__PURE__ */ a(`div`,{className:u?`control-main has-library`:`control-main`,children:[d.length>1?/* @__PURE__ */ i(`div`,{className:`part-tabs`,children:d.map(e=>/* @__PURE__ */ i(H,{icon:e.icon,title:t(e.label),active:e.id===f,onClick:()=>l(e.id),children:t(e.label)},e.id))}):null,/* @__PURE__ */ i(`div`,{className:p(`player`),children:e.player}),o?/* @__PURE__ */ a(`div`,{className:p(`group`),children:[/* @__PURE__ */ i(K,{group:o.members,label:h,onGroup:e.onGroup}),o.volume===null?null:/* @__PURE__ */ a(`div`,{className:`group-volume`,children:[/* @__PURE__ */ i(I,{name:`volume`}),/* @__PURE__ */ i(`span`,{className:`label secondary ellipsis`,children:t(`wc_group_volume`)}),/* @__PURE__ */ i(U,{value:o.volume,max:100,label:t(`wc_group_volume`),disabled:o.disabled,onCommit:e.onGroupVolume}),/* @__PURE__ */ i(`span`,{className:`level`,children:Math.round(o.volume)})]})]}):null,u?/* @__PURE__ */ i(`div`,{className:p(`library`),children:s}):null]})]})}var xe=[{id:`favorites`,label:`sonosdm_favorites`,icon:`star`},{id:`playlists`,label:`sonosdm_playlists`,icon:`playlist`},{id:`queue`,label:`sonosdm_queue`,icon:`queue`},{id:`recent`,label:`sonosdm_recent`,icon:`history`},{id:`sources`,label:`sonosdm_sources`,icon:`folder`}];function q({room:e,coordinator:t,value:o,command:s,word:c}){let[l,u]=n(`favorites`),[d,f]=n(``),[p,m]=n([]),h=(e,t)=>ue(o(e,t)),g=h(t,`media_browse_result`),_=d.trim().toLowerCase(),v=e=>!_||e.toLowerCase().includes(_),y=e=>{u(e),f(``),m([]),e===`sources`&&s(`media_browse`,`root`)},b=(e,t)=>{m(e),f(``),s(`media_browse`,t)},x=e=>{e.folder?b([...p,{id:e.id,title:e.title}],e.id):(e.uri||e.favorite||e.playlist||e.id===`tv`)&&s(`media_play`,JSON.stringify({uri:e.uri||``,metadata:e.metadata||``,favorite:e.favorite,playlist:e.playlist,tv:e.id===`tv`||void 0}))},S;if(l===`favorites`||l===`playlists`){let e=l===`favorites`;S=(h(t,e?`favorites_list_array`:`playlist_list_array`)||[]).filter(e=>typeof e==`string`&&v(e)).map((t,n)=>({key:`${l}-${n}`,title:t,icon:e?`star`:`playlist`,onClick:()=>s(e?`favorites_set`:`playlist_set`,t)}))}else if(l===`queue`){let e=h(t,`queue_array`);S=(e?.length?e.map(e=>({...e,title:e.title||``})):String(o(t,`queue`)??``).split(/\r?\n|, /).map(e=>e.trim()).filter(Boolean).map(e=>({title:e,artist:``,album:``,cover:``}))).map((e,t)=>({track:e,index:t})).filter(({track:e})=>v(`${e.title} ${e.artist||``}`)).map(({track:e,index:t})=>({key:`queue-${t}`,title:e.title,sub:e.artist||e.album,cover:e.cover,icon:`music`,onClick:()=>s(`current_track_number`,t+1)}))}else S=l===`recent`?(h(e,`recent_tracks`)||[]).filter(e=>v(`${e.title} ${e.artist||``} ${e.album||``}`)).map((e,t)=>({key:`recent-${t}`,title:e.title,sub:e.artist||e.album,cover:e.cover,icon:`music`,onClick:()=>e.uri&&s(`play_uri`,e.uri)})):(g?.items||[]).filter(e=>v(`${e.title} ${e.artist||``} ${e.album||``}`)).map((e,t)=>({key:`source-${t}-${e.id}`,title:e.title,sub:e.artist||e.album,cover:e.cover,icon:e.id===`tv`?`tv`:e.folder?`folder`:`music`,onClick:()=>x(e)}));let C=l===`sources`&&!!g?.searchable&&!!g.serviceName;return/* @__PURE__ */ a(r,{children:[/* @__PURE__ */ i(`div`,{className:`tabs`,children:xe.map(e=>/* @__PURE__ */ i(H,{icon:e.icon,title:c(e.label),active:l===e.id,onClick:()=>y(e.id),children:c(e.label)},e.id))}),/* @__PURE__ */ a(`div`,{className:`search`,children:[/* @__PURE__ */ i(I,{name:`search`}),/* @__PURE__ */ i(`input`,{type:`search`,value:d,placeholder:c(`sonosdm_search`),"aria-label":c(`sonosdm_search`),onChange:e=>f(e.currentTarget.value),onKeyUp:e=>{e.key===`Enter`&&C&&d.trim()&&s(`media_browse`,`smapi-search:${encodeURIComponent(g?.serviceName||``)}:${encodeURIComponent(d.trim())}`)}}),d?/* @__PURE__ */ i(H,{icon:`clear`,className:`small`,title:c(`wc_clear`),onClick:()=>f(``)}):null]}),l===`sources`?/* @__PURE__ */ a(`div`,{className:`crumb secondary`,children:[p.length?/* @__PURE__ */ i(H,{icon:`back`,className:`small`,title:c(`wc_back`),onClick:()=>{let e=p.slice(0,-1);b(e,e.length?e[e.length-1].id:`root`)}}):null,/* @__PURE__ */ i(`span`,{className:`ellipsis`,children:p.length?p[p.length-1].title:g?.title||``}),g?.loginUrl?/* @__PURE__ */ i(H,{icon:`login`,className:`small`,title:g.loginHint||c(`wc_sign_in`),onClick:()=>s(`media_browse`,`smapi-auth:${encodeURIComponent(g.serviceName||``)}`)}):null]}):null,/* @__PURE__ */ i(`div`,{className:`items`,children:S.length?S.map(e=>/* @__PURE__ */ a(`button`,{type:`button`,className:`item`,onClick:e.onClick,children:[/* @__PURE__ */ i(W,{url:e.cover||``,icon:e.icon}),/* @__PURE__ */ a(`span`,{className:`text`,children:[/* @__PURE__ */ i(`span`,{className:`ellipsis`,children:e.title}),e.sub?/* @__PURE__ */ i(`span`,{className:`sub secondary ellipsis`,children:e.sub}):null]})]},e.key)):/* @__PURE__ */ i(`div`,{className:`empty secondary`,children:c(`sonosdm_nothing_found`)})})]})}var J=`
:host {
    display: block;
    width: 100%;
    height: 100%;
}
* {
    box-sizing: border-box;
}
.mount {
    width: 100%;
    height: 100%;
    /* the size of the box does not depend on what is in it - the parts follow it, see the container queries */
    container-type: size;
}
.mount.dialog {
    height: auto;
    /* in a dialog the content decides the height: only the width is queried */
    container-type: inline-size;
}
.view {
    --hover: color-mix(in srgb, currentColor 10%, transparent);
    --track: color-mix(in srgb, currentColor 22%, transparent);
    --pad: clamp(4px, 3cqmin, 12px);
    --gap: clamp(4px, 2.5cqmin, 10px);
    --icon: clamp(18px, 8cqmin, 26px);
    width: 100%;
    height: 100%;
    padding: var(--pad);
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    overflow: hidden;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
}
.dialog .view {
    --pad: 0px;
    --gap: 12px;
    --icon: 24px;
    height: auto;
}
.edit {
    pointer-events: none;
}
.secondary {
    color: var(--iob-text-secondary);
}
button {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    margin: 0;
    padding: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
}
button:disabled {
    cursor: default;
    opacity: 0.4;
}
button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
}
button svg {
    width: var(--icon);
    height: var(--icon);
    fill: currentColor;
    display: block;
}
button.icon {
    padding: calc(var(--icon) * 0.2);
    border-radius: 50%;
}
button.icon:hover:not(:disabled),
button.pill:hover:not(:disabled) {
    background: var(--hover);
}
button.small svg {
    width: calc(var(--icon) * 0.8);
    height: calc(var(--icon) * 0.8);
}
button.active {
    color: var(--accent);
}
button.main {
    color: var(--accent);
    box-shadow: inset 0 0 0 2px var(--accent);
}
button.main svg {
    width: calc(var(--icon) * 1.25);
    height: calc(var(--icon) * 1.25);
}
button.pill {
    gap: 6px;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--iob-divider);
    font-size: 0.85em;
    white-space: nowrap;
}
button.pill svg {
    width: 1.2em;
    height: 1.2em;
}
button.pill.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
}
input[type='range'] {
    --fill: 0%;
    /* a form control does not inherit the color; the thumb and the track are drawn in it */
    color: inherit;
    flex: 1;
    min-width: 0;
    height: 18px;
    margin: 0;
    background: transparent;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
}
input[type='range']:disabled {
    cursor: default;
    opacity: 0.4;
}
input[type='range']:focus-visible {
    outline: none;
}
input[type='range']::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(to right, var(--accent) var(--fill), var(--track) var(--fill));
}
input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -4px;
    border: none;
    border-radius: 50%;
    background: var(--accent);
}
input[type='range']:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 4px var(--track);
}
input[type='range']::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: var(--track);
}
input[type='range']::-moz-range-progress {
    height: 4px;
    border-radius: 2px;
    background: var(--accent);
}
input[type='range']::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: none;
    border-radius: 50%;
    background: var(--accent);
}
.cover {
    border-radius: calc(var(--iob-border-radius) * 2);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--hover);
}
.cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}
.cover svg {
    width: 45%;
    height: 45%;
    fill: currentColor;
    opacity: 0.35;
}
.ellipsis {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.hint {
    width: 100%;
    height: 100%;
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-align: center;
    color: var(--iob-text-secondary);
    font-size: clamp(11px, 5cqmin, 15px);
}
.hint svg {
    width: clamp(18px, 10cqmin, 30px);
    height: clamp(18px, 10cqmin, 30px);
    fill: currentColor;
}
`,Y=`
.player.offline .head .cover,
.player.offline .seek,
.player.offline .transport,
.player.offline .volume {
    opacity: 0.5;
}
.chips,
.groups {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
}
.groups .label {
    font-size: 0.8em;
    margin-right: 4px;
}
.head {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    align-items: center;
    gap: var(--gap);
}
.head > .cover {
    flex: none;
    height: min(100%, 40cqw);
    aspect-ratio: 1;
}
.info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
}
.name {
    font-size: clamp(10px, 4cqmin, 13px);
    line-height: 1.4;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}
.title {
    font-size: clamp(13px, 6.5cqmin, 22px);
    line-height: 1.3;
    font-weight: 600;
}
.sub {
    font-size: clamp(11px, 4.5cqmin, 15px);
    line-height: 1.4;
}
.quick {
    display: none;
    align-items: center;
    gap: 2px;
}
.seek,
.volume {
    flex: none;
    display: flex;
    align-items: center;
    gap: calc(var(--gap) * 0.6);
    min-width: 0;
}
.time,
.level {
    font-size: clamp(10px, 3.8cqmin, 13px);
    font-variant-numeric: tabular-nums;
    color: var(--iob-text-secondary);
}
.time {
    min-width: 3.2em;
}
.time.end,
.level {
    text-align: right;
}
.level {
    min-width: 2.2em;
}
.transport {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(2px, 3cqw, 16px);
}
@container (max-height: 259px) {
    .player .groups {
        display: none;
    }
}
@container (max-height: 229px) {
    .player .chips {
        display: none;
    }
}
@container (max-height: 189px) {
    .player .seek {
        display: none;
    }
}
@container (max-height: 149px) {
    .player .volume {
        display: none;
    }
}
@container (max-height: 109px) {
    .player .transport {
        display: none;
    }
    .player .quick {
        display: flex;
    }
}
@container (max-width: 299px) {
    .player .mode {
        display: none;
    }
}
@container (max-width: 179px) {
    .player .head > .cover {
        display: none;
    }
}
/* a tall, narrow box: the cover above the text */
@container (max-aspect-ratio: 4/5) and (min-height: 320px) {
    .player .head {
        flex-direction: column;
        justify-content: center;
    }
    .player .head > .cover {
        height: auto;
        width: min(80cqw, 38cqh);
    }
    .player .info {
        flex: none;
        width: 100%;
        text-align: center;
    }
}
.dialog .head {
    flex: none;
    flex-direction: column;
}
.dialog .head > .cover {
    height: auto;
    width: min(100%, 320px, 40vh);
}
.dialog .info {
    flex: none;
    width: 100%;
    text-align: center;
}
`,X=`
.dialog .view.source {
    gap: 8px;
    height: min(70vh, 520px);
}
.tabs {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}
.search {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    border-bottom: 1px solid var(--iob-divider);
}
.search > svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
    opacity: 0.7;
}
.search input {
    flex: 1;
    min-width: 0;
    padding: 6px 0;
    border: none;
    outline: none;
    background: transparent;
    color: inherit;
    font: inherit;
}
.crumb {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 28px;
    font-size: 0.85em;
}
.items {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}
button.item {
    width: 100%;
    justify-content: flex-start;
    gap: 8px;
    padding: 4px;
    text-align: left;
    border-radius: var(--iob-border-radius);
}
button.item:hover {
    background: var(--hover);
}
.item .cover {
    width: 36px;
    height: 36px;
    flex: none;
    border-radius: 4px;
}
.item .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.item .text .sub {
    font-size: 0.8em;
}
.empty {
    padding: 8px;
    font-size: 0.85em;
}
`,Se=`${Y}${X}
.view.control {
    flex-direction: row;
}
.speakers {
    flex: 0 0 clamp(170px, 30cqw, 280px);
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-right: var(--gap);
    border-right: 1px solid var(--iob-divider);
}
.speakers-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.speakers-head > svg {
    width: calc(var(--icon) * 0.9);
    height: calc(var(--icon) * 0.9);
    fill: currentColor;
    flex: none;
}
.speakers-head .label {
    flex: 1;
    font-weight: 600;
}
.speaker-list {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
button.speaker {
    width: 100%;
    justify-content: flex-start;
    gap: 8px;
    padding: 6px 8px;
    text-align: left;
    border-radius: var(--iob-border-radius);
}
button.speaker:hover {
    background: var(--hover);
}
button.speaker.selected {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
}
button.speaker.selected .speaker-name {
    font-weight: 600;
}
button.speaker.offline {
    opacity: 0.5;
}
button.speaker > svg {
    width: 20px;
    height: 20px;
    opacity: 0.7;
}
button.speaker.playing > svg {
    fill: var(--accent);
    opacity: 1;
}
.speaker .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.speaker-sub {
    font-size: 0.85em;
}
.speaker-level {
    min-width: 2em;
    font-size: 0.8em;
    font-variant-numeric: tabular-nums;
    text-align: right;
}
.control-main {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--gap);
}
.part-tabs {
    flex: none;
    display: none;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
}
.part {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
.part > .view {
    flex: 1 1 0;
    min-height: 0;
    height: auto;
    padding: 0;
}
.part-player {
    flex: 0 0 clamp(150px, 44cqh, 260px);
    /* the player follows the size of its part, as in a box of its own */
    container-type: size;
}
.control-main:not(.has-library) .part-player {
    flex: 1 1 0;
}
.part-group {
    flex: none;
    max-height: 32cqh;
    overflow-y: auto;
    gap: 6px;
    padding: 6px 0;
    border-top: 1px solid var(--iob-divider);
    border-bottom: 1px solid var(--iob-divider);
}
.control-main:not(.has-library) .part-group {
    border-bottom: none;
}
.part-group .groups {
    flex-wrap: wrap;
    row-gap: 4px;
    overflow: visible;
}
.group-volume {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}
.group-volume > svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
    opacity: 0.75;
    flex: none;
}
.group-volume .label {
    flex: 0 1 auto;
    font-size: 0.8em;
}
.part-library {
    flex: 1 1 0;
}
.part-library > .view.source {
    gap: 6px;
}
/* a narrow box: the speakers are a row of pills above the rest */
@container (max-width: 599px) {
    .view.control {
        flex-direction: column;
    }
    .speakers {
        flex: none;
        padding: 0 0 var(--gap);
        border-right: none;
        border-bottom: 1px solid var(--iob-divider);
    }
    .speakers-head,
    .speaker-sub,
    .speaker-level {
        display: none;
    }
    .speaker-list {
        flex: none;
        flex-direction: row;
        gap: 4px;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
    }
    button.speaker {
        width: auto;
        max-width: 60cqw;
        gap: 6px;
        padding: 4px 12px;
        border: 1px solid var(--iob-divider);
        border-radius: 999px;
        font-size: 0.85em;
    }
    button.speaker.selected {
        border-color: var(--accent);
    }
    button.speaker > svg {
        width: 1.2em;
        height: 1.2em;
    }
}
/* a narrow or low box: one part at a time, picked with the tabs */
@container (max-width: 599px) or (max-height: 439px) {
    .part-tabs {
        display: flex;
    }
    .control-main .part {
        display: none;
    }
    .control-main .part.current {
        display: flex;
        flex: 1 1 0;
        max-height: none;
        border: none;
        padding: 0;
    }
}
`,Z={en:{wc_choose_speaker:`Choose a speaker in the settings`,wc_not_speaker:`This is not a SONOS speaker`,wc_choose_instance:`Choose a SONOS instance in the settings`,wc_volume:`Volume`,wc_position:`Position`,wc_open_player:`Open the player`,wc_show_all:`Show all speakers`,wc_back:`Back`,wc_sign_in:`Sign in`,wc_clear:`Clear`,wc_player:`Player`,wc_library:`Library`,wc_group_volume:`Group volume`,sonosdm_offline:`Not reachable`,sonosdm_nothing_playing:`Nothing is playing`,sonosdm_grouped:`in a group`,sonosdm_play:`Play`,sonosdm_pause:`Pause`,sonosdm_previous:`Previous track`,sonosdm_next:`Next track`,sonosdm_mute:`Mute`,sonosdm_unmute:`Unmute`,sonosdm_shuffle:`Shuffle`,sonosdm_repeat:`Repeat`,sonosdm_repeat_all:`Repeat all`,sonosdm_repeat_one:`Repeat track`,sonosdm_rooms_title:`SONOS`,sonosdm_no_rooms:`No SONOS speakers found`,sonosdm_all_idle:`All idle`,sonosdm_link_start:`Group with this speaker`,sonosdm_link_cancel:`Cancel grouping`,sonosdm_link_add:`Add to the group`,sonosdm_link_remove:`Remove from the group`,sonosdm_link_hint:`Pick the speakers that should join the selected one`,sonosdm_select_source:`Select source`,sonosdm_sources:`Sources`,sonosdm_favorites:`Favorites`,sonosdm_playlists:`Playlists`,sonosdm_queue:`Queue`,sonosdm_recent:`Recent`,sonosdm_search:`Search`,sonosdm_nothing_found:`Nothing found`,vis_night_mode:`Night sound`,vis_speech_enhancement:`Speech enhancement`,vis_group:`Group`,sonos_ctrl_speakers:`Speakers`,sonos_ctrl_refresh:`Read the speakers again`,sonos_ctrl_group:`Group`,sonos_ctrl_follows:`follows`,sonos_ctrl_instance_not_running:`The instance is not running - start it to control the speakers.`},de:{wc_choose_speaker:`Lautsprecher in den Einstellungen wählen`,wc_not_speaker:`Das ist kein SONOS-Lautsprecher`,wc_choose_instance:`SONOS-Instanz in den Einstellungen wählen`,wc_volume:`Lautstärke`,wc_position:`Position`,wc_open_player:`Player öffnen`,wc_show_all:`Alle Lautsprecher anzeigen`,wc_back:`Zurück`,wc_sign_in:`Anmelden`,wc_clear:`Leeren`,wc_player:`Player`,wc_library:`Mediathek`,wc_group_volume:`Gruppenlautstärke`,sonosdm_offline:`Nicht erreichbar`,sonosdm_nothing_playing:`Es läuft nichts`,sonosdm_grouped:`in einer Gruppe`,sonosdm_play:`Abspielen`,sonosdm_pause:`Pause`,sonosdm_previous:`Vorheriger Titel`,sonosdm_next:`Nächster Titel`,sonosdm_mute:`Stumm`,sonosdm_unmute:`Stummschaltung aufheben`,sonosdm_shuffle:`Zufall`,sonosdm_repeat:`Wiederholung`,sonosdm_repeat_all:`Alle wiederholen`,sonosdm_repeat_one:`Titel wiederholen`,sonosdm_rooms_title:`SONOS`,sonosdm_no_rooms:`Keine SONOS-Lautsprecher gefunden`,sonosdm_all_idle:`Alle im Leerlauf`,sonosdm_link_start:`Mit diesem Lautsprecher gruppieren`,sonosdm_link_cancel:`Gruppierung abbrechen`,sonosdm_link_add:`Zur Gruppe hinzufügen`,sonosdm_link_remove:`Aus der Gruppe entfernen`,sonosdm_link_hint:`Lautsprecher auswählen, die dem gewählten folgen sollen`,sonosdm_select_source:`Quelle auswählen`,sonosdm_sources:`Quellen`,sonosdm_favorites:`Favoriten`,sonosdm_playlists:`Playlists`,sonosdm_queue:`Warteschlange`,sonosdm_recent:`Zuletzt`,sonosdm_search:`Suchen`,sonosdm_nothing_found:`Nichts gefunden`,vis_night_mode:`Nachtmodus`,vis_speech_enhancement:`Sprachverbesserung`,vis_group:`Gruppe`,sonos_ctrl_speakers:`Lautsprecher`,sonos_ctrl_refresh:`Lautsprecher neu einlesen`,sonos_ctrl_group:`Gruppe`,sonos_ctrl_follows:`folgt`,sonos_ctrl_instance_not_running:`Die Instanz läuft nicht - starte sie, um die Lautsprecher zu steuern.`},ru:{wc_choose_speaker:`Выберите колонку в настройках`,wc_not_speaker:`Это не колонка SONOS`,wc_choose_instance:`Выберите экземпляр SONOS в настройках`,wc_volume:`Громкость`,wc_position:`Позиция`,wc_open_player:`Открыть плеер`,wc_show_all:`Показать все колонки`,wc_back:`Назад`,wc_sign_in:`Войти`,wc_clear:`Очистить`,wc_player:`Плеер`,wc_library:`Библиотека`,wc_group_volume:`Громкость группы`,sonosdm_offline:`Недоступна`,sonosdm_nothing_playing:`Ничего не играет`,sonosdm_grouped:`в группе`,sonosdm_play:`Играть`,sonosdm_pause:`Пауза`,sonosdm_previous:`Предыдущий трек`,sonosdm_next:`Следующий трек`,sonosdm_mute:`Без звука`,sonosdm_unmute:`Включить звук`,sonosdm_shuffle:`Перемешать`,sonosdm_repeat:`Повтор`,sonosdm_repeat_all:`Повторять все`,sonosdm_repeat_one:`Повторять трек`,sonosdm_rooms_title:`SONOS`,sonosdm_no_rooms:`Колонки SONOS не найдены`,sonosdm_all_idle:`Все свободны`,sonosdm_link_start:`Группировать с этой колонкой`,sonosdm_link_cancel:`Отменить группировку`,sonosdm_link_add:`Добавить в группу`,sonosdm_link_remove:`Убрать из группы`,sonosdm_link_hint:`Выберите колонки, которые присоединятся к выбранной`,sonosdm_select_source:`Выбрать источник`,sonosdm_sources:`Источники`,sonosdm_favorites:`Избранное`,sonosdm_playlists:`Плейлисты`,sonosdm_queue:`Очередь`,sonosdm_recent:`Недавние`,sonosdm_search:`Поиск`,sonosdm_nothing_found:`Ничего не найдено`,vis_night_mode:`Ночной звук`,vis_speech_enhancement:`Улучшение речи`,vis_group:`Группа`,sonos_ctrl_speakers:`Колонки`,sonos_ctrl_refresh:`Перечитать колонки`,sonos_ctrl_group:`Группа`,sonos_ctrl_follows:`следует за`,sonos_ctrl_instance_not_running:`Экземпляр не запущен - запустите его, чтобы управлять колонками.`},pt:{wc_choose_speaker:`Escolha uma coluna nas configurações`,wc_not_speaker:`Isto não é uma coluna SONOS`,wc_choose_instance:`Escolha uma instância SONOS nas configurações`,wc_volume:`Volume`,wc_position:`Posição`,wc_open_player:`Abrir o leitor`,wc_show_all:`Mostrar todas as colunas`,wc_back:`Voltar`,wc_sign_in:`Iniciar sessão`,wc_clear:`Limpar`,wc_player:`Leitor`,wc_library:`Biblioteca`,wc_group_volume:`Volume do grupo`,sonosdm_offline:`Inacessível`,sonosdm_nothing_playing:`Nada a tocar`,sonosdm_grouped:`num grupo`,sonosdm_play:`Reproduzir`,sonosdm_pause:`Pausa`,sonosdm_previous:`Faixa anterior`,sonosdm_next:`Faixa seguinte`,sonosdm_mute:`Silenciar`,sonosdm_unmute:`Ativar som`,sonosdm_shuffle:`Aleatório`,sonosdm_repeat:`Repetir`,sonosdm_repeat_all:`Repetir tudo`,sonosdm_repeat_one:`Repetir faixa`,sonosdm_rooms_title:`SONOS`,sonosdm_no_rooms:`Nenhuma coluna SONOS encontrada`,sonosdm_all_idle:`Todas inativas`,sonosdm_link_start:`Agrupar com esta coluna`,sonosdm_link_cancel:`Cancelar agrupamento`,sonosdm_link_add:`Adicionar ao grupo`,sonosdm_link_remove:`Remover do grupo`,sonosdm_link_hint:`Escolha as colunas que devem juntar-se à selecionada`,sonosdm_select_source:`Selecionar fonte`,sonosdm_sources:`Fontes`,sonosdm_favorites:`Favoritos`,sonosdm_playlists:`Playlists`,sonosdm_queue:`Fila`,sonosdm_recent:`Recentes`,sonosdm_search:`Pesquisar`,sonosdm_nothing_found:`Nada encontrado`,vis_night_mode:`Som noturno`,vis_speech_enhancement:`Aprimoramento de fala`,vis_group:`Grupo`,sonos_ctrl_speakers:`Colunas`,sonos_ctrl_refresh:`Ler as colunas novamente`,sonos_ctrl_group:`Grupo`,sonos_ctrl_follows:`segue`,sonos_ctrl_instance_not_running:`A instância não está a correr - inicie-a para controlar as colunas.`},nl:{wc_choose_speaker:`Kies een luidspreker in de instellingen`,wc_not_speaker:`Dit is geen SONOS-luidspreker`,wc_choose_instance:`Kies een SONOS-instantie in de instellingen`,wc_volume:`Volume`,wc_position:`Positie`,wc_open_player:`Speler openen`,wc_show_all:`Alle luidsprekers tonen`,wc_back:`Terug`,wc_sign_in:`Aanmelden`,wc_clear:`Wissen`,wc_player:`Speler`,wc_library:`Bibliotheek`,wc_group_volume:`Groepsvolume`,sonosdm_offline:`Niet bereikbaar`,sonosdm_nothing_playing:`Er speelt niets`,sonosdm_grouped:`in een groep`,sonosdm_play:`Afspelen`,sonosdm_pause:`Pauze`,sonosdm_previous:`Vorig nummer`,sonosdm_next:`Volgend nummer`,sonosdm_mute:`Dempen`,sonosdm_unmute:`Dempen opheffen`,sonosdm_shuffle:`Shuffle`,sonosdm_repeat:`Herhalen`,sonosdm_repeat_all:`Alles herhalen`,sonosdm_repeat_one:`Nummer herhalen`,sonosdm_rooms_title:`SONOS`,sonosdm_no_rooms:`Geen SONOS-luidsprekers gevonden`,sonosdm_all_idle:`Allemaal inactief`,sonosdm_link_start:`Groeperen met deze luidspreker`,sonosdm_link_cancel:`Groeperen annuleren`,sonosdm_link_add:`Aan de groep toevoegen`,sonosdm_link_remove:`Uit de groep verwijderen`,sonosdm_link_hint:`Kies de luidsprekers die zich bij de geselecteerde moeten voegen`,sonosdm_select_source:`Bron kiezen`,sonosdm_sources:`Bronnen`,sonosdm_favorites:`Favorieten`,sonosdm_playlists:`Afspeellijsten`,sonosdm_queue:`Wachtrij`,sonosdm_recent:`Recent`,sonosdm_search:`Zoeken`,sonosdm_nothing_found:`Niets gevonden`,vis_night_mode:`Nachtgeluid`,vis_speech_enhancement:`Spraakverbetering`,vis_group:`Groep`,sonos_ctrl_speakers:`Luidsprekers`,sonos_ctrl_refresh:`Luidsprekers opnieuw inlezen`,sonos_ctrl_group:`Groep`,sonos_ctrl_follows:`volgt`,sonos_ctrl_instance_not_running:`De instantie draait niet - start hem om de luidsprekers te bedienen.`},fr:{wc_choose_speaker:`Choisissez une enceinte dans les paramètres`,wc_not_speaker:`Ce n'est pas une enceinte SONOS`,wc_choose_instance:`Choisissez une instance SONOS dans les paramètres`,wc_volume:`Volume`,wc_position:`Position`,wc_open_player:`Ouvrir le lecteur`,wc_show_all:`Afficher toutes les enceintes`,wc_back:`Retour`,wc_sign_in:`Se connecter`,wc_clear:`Effacer`,wc_player:`Lecteur`,wc_library:`Bibliothèque`,wc_group_volume:`Volume du groupe`,sonosdm_offline:`Injoignable`,sonosdm_nothing_playing:`Rien ne joue`,sonosdm_grouped:`dans un groupe`,sonosdm_play:`Lecture`,sonosdm_pause:`Pause`,sonosdm_previous:`Piste précédente`,sonosdm_next:`Piste suivante`,sonosdm_mute:`Muet`,sonosdm_unmute:`Réactiver le son`,sonosdm_shuffle:`Aléatoire`,sonosdm_repeat:`Répéter`,sonosdm_repeat_all:`Tout répéter`,sonosdm_repeat_one:`Répéter le titre`,sonosdm_rooms_title:`SONOS`,sonosdm_no_rooms:`Aucune enceinte SONOS trouvée`,sonosdm_all_idle:`Toutes inactives`,sonosdm_link_start:`Grouper avec cette enceinte`,sonosdm_link_cancel:`Annuler le groupement`,sonosdm_link_add:`Ajouter au groupe`,sonosdm_link_remove:`Retirer du groupe`,sonosdm_link_hint:`Choisissez les enceintes qui doivent rejoindre celle sélectionnée`,sonosdm_select_source:`Choisir la source`,sonosdm_sources:`Sources`,sonosdm_favorites:`Favoris`,sonosdm_playlists:`Playlists`,sonosdm_queue:`File d'attente`,sonosdm_recent:`Récents`,sonosdm_search:`Rechercher`,sonosdm_nothing_found:`Rien trouvé`,vis_night_mode:`Son de nuit`,vis_speech_enhancement:`Amélioration de la parole`,vis_group:`Groupe`,sonos_ctrl_speakers:`Enceintes`,sonos_ctrl_refresh:`Relire les enceintes`,sonos_ctrl_group:`Groupe`,sonos_ctrl_follows:`suit`,sonos_ctrl_instance_not_running:`L'instance n'est pas démarrée - démarrez-la pour piloter les enceintes.`},it:{wc_choose_speaker:`Scegli un altoparlante nelle impostazioni`,wc_not_speaker:`Questo non è un altoparlante SONOS`,wc_choose_instance:`Scegli un'istanza SONOS nelle impostazioni`,wc_volume:`Volume`,wc_position:`Posizione`,wc_open_player:`Apri il lettore`,wc_show_all:`Mostra tutti gli altoparlanti`,wc_back:`Indietro`,wc_sign_in:`Accedi`,wc_clear:`Cancella`,wc_player:`Lettore`,wc_library:`Libreria`,wc_group_volume:`Volume del gruppo`,sonosdm_offline:`Non raggiungibile`,sonosdm_nothing_playing:`Non è in riproduzione nulla`,sonosdm_grouped:`in un gruppo`,sonosdm_play:`Riproduci`,sonosdm_pause:`Pausa`,sonosdm_previous:`Traccia precedente`,sonosdm_next:`Traccia successiva`,sonosdm_mute:`Muto`,sonosdm_unmute:`Riattiva audio`,sonosdm_shuffle:`Casuale`,sonosdm_repeat:`Ripeti`,sonosdm_repeat_all:`Ripeti tutto`,sonosdm_repeat_one:`Ripeti brano`,sonosdm_rooms_title:`SONOS`,sonosdm_no_rooms:`Nessun altoparlante SONOS trovato`,sonosdm_all_idle:`Tutti inattivi`,sonosdm_link_start:`Raggruppa con questo altoparlante`,sonosdm_link_cancel:`Annulla raggruppamento`,sonosdm_link_add:`Aggiungi al gruppo`,sonosdm_link_remove:`Rimuovi dal gruppo`,sonosdm_link_hint:`Scegli gli altoparlanti che devono unirsi a quello selezionato`,sonosdm_select_source:`Seleziona sorgente`,sonosdm_sources:`Sorgenti`,sonosdm_favorites:`Preferiti`,sonosdm_playlists:`Playlist`,sonosdm_queue:`Coda`,sonosdm_recent:`Recenti`,sonosdm_search:`Cerca`,sonosdm_nothing_found:`Nessun risultato`,vis_night_mode:`Suono notturno`,vis_speech_enhancement:`Miglioramento del parlato`,vis_group:`Gruppo`,sonos_ctrl_speakers:`Altoparlanti`,sonos_ctrl_refresh:`Rileggi gli altoparlanti`,sonos_ctrl_group:`Gruppo`,sonos_ctrl_follows:`segue`,sonos_ctrl_instance_not_running:`L'istanza non è in esecuzione - avviala per controllare gli altoparlanti.`},es:{wc_choose_speaker:`Elija un altavoz en la configuración`,wc_not_speaker:`No es un altavoz SONOS`,wc_choose_instance:`Elija una instancia de SONOS en la configuración`,wc_volume:`Volumen`,wc_position:`Posición`,wc_open_player:`Abrir el reproductor`,wc_show_all:`Mostrar todos los altavoces`,wc_back:`Atrás`,wc_sign_in:`Iniciar sesión`,wc_clear:`Borrar`,wc_player:`Reproductor`,wc_library:`Biblioteca`,wc_group_volume:`Volumen del grupo`,sonosdm_offline:`No accesible`,sonosdm_nothing_playing:`No se reproduce nada`,sonosdm_grouped:`en un grupo`,sonosdm_play:`Reproducir`,sonosdm_pause:`Pausa`,sonosdm_previous:`Pista anterior`,sonosdm_next:`Pista siguiente`,sonosdm_mute:`Silenciar`,sonosdm_unmute:`Activar sonido`,sonosdm_shuffle:`Aleatorio`,sonosdm_repeat:`Repetir`,sonosdm_repeat_all:`Repetir todo`,sonosdm_repeat_one:`Repetir pista`,sonosdm_rooms_title:`SONOS`,sonosdm_no_rooms:`No se han encontrado altavoces SONOS`,sonosdm_all_idle:`Todos inactivos`,sonosdm_link_start:`Agrupar con este altavoz`,sonosdm_link_cancel:`Cancelar agrupación`,sonosdm_link_add:`Añadir al grupo`,sonosdm_link_remove:`Quitar del grupo`,sonosdm_link_hint:`Elija los altavoces que deben unirse al seleccionado`,sonosdm_select_source:`Seleccionar fuente`,sonosdm_sources:`Fuentes`,sonosdm_favorites:`Favoritos`,sonosdm_playlists:`Listas de reproducción`,sonosdm_queue:`Cola`,sonosdm_recent:`Recientes`,sonosdm_search:`Buscar`,sonosdm_nothing_found:`No se encontró nada`,vis_night_mode:`Sonido nocturno`,vis_speech_enhancement:`Mejora del habla`,vis_group:`Grupo`,sonos_ctrl_speakers:`Altavoces`,sonos_ctrl_refresh:`Volver a leer los altavoces`,sonos_ctrl_group:`Grupo`,sonos_ctrl_follows:`sigue a`,sonos_ctrl_instance_not_running:`La instancia no se está ejecutando: iníciela para controlar los altavoces.`},pl:{wc_choose_speaker:`Wybierz głośnik w ustawieniach`,wc_not_speaker:`To nie jest głośnik SONOS`,wc_choose_instance:`Wybierz instancję SONOS w ustawieniach`,wc_volume:`Głośność`,wc_position:`Pozycja`,wc_open_player:`Otwórz odtwarzacz`,wc_show_all:`Pokaż wszystkie głośniki`,wc_back:`Wstecz`,wc_sign_in:`Zaloguj się`,wc_clear:`Wyczyść`,wc_player:`Odtwarzacz`,wc_library:`Biblioteka`,wc_group_volume:`Głośność grupy`,sonosdm_offline:`Nieosiągalny`,sonosdm_nothing_playing:`Nic nie jest odtwarzane`,sonosdm_grouped:`w grupie`,sonosdm_play:`Odtwórz`,sonosdm_pause:`Pauza`,sonosdm_previous:`Poprzedni utwór`,sonosdm_next:`Następny utwór`,sonosdm_mute:`Wycisz`,sonosdm_unmute:`Wyłącz wyciszenie`,sonosdm_shuffle:`Losowo`,sonosdm_repeat:`Powtarzaj`,sonosdm_repeat_all:`Powtarzaj wszystko`,sonosdm_repeat_one:`Powtarzaj utwór`,sonosdm_rooms_title:`SONOS`,sonosdm_no_rooms:`Nie znaleziono głośników SONOS`,sonosdm_all_idle:`Wszystkie bezczynne`,sonosdm_link_start:`Grupuj z tym głośnikiem`,sonosdm_link_cancel:`Anuluj grupowanie`,sonosdm_link_add:`Dodaj do grupy`,sonosdm_link_remove:`Usuń z grupy`,sonosdm_link_hint:`Wybierz głośniki, które mają dołączyć do wybranego`,sonosdm_select_source:`Wybierz źródło`,sonosdm_sources:`Źródła`,sonosdm_favorites:`Ulubione`,sonosdm_playlists:`Playlisty`,sonosdm_queue:`Kolejka`,sonosdm_recent:`Ostatnie`,sonosdm_search:`Szukaj`,sonosdm_nothing_found:`Nic nie znaleziono`,vis_night_mode:`Nocny dźwięk`,vis_speech_enhancement:`Wzmocnienie mowy`,vis_group:`Grupa`,sonos_ctrl_speakers:`Głośniki`,sonos_ctrl_refresh:`Wczytaj głośniki ponownie`,sonos_ctrl_group:`Grupa`,sonos_ctrl_follows:`podąża za`,sonos_ctrl_instance_not_running:`Instancja nie jest uruchomiona - uruchom ją, aby sterować głośnikami.`},uk:{wc_choose_speaker:`Виберіть колонку в налаштуваннях`,wc_not_speaker:`Це не колонка SONOS`,wc_choose_instance:`Виберіть екземпляр SONOS у налаштуваннях`,wc_volume:`Гучність`,wc_position:`Позиція`,wc_open_player:`Відкрити плеєр`,wc_show_all:`Показати всі колонки`,wc_back:`Назад`,wc_sign_in:`Увійти`,wc_clear:`Очистити`,wc_player:`Плеєр`,wc_library:`Бібліотека`,wc_group_volume:`Гучність групи`,sonosdm_offline:`Недоступна`,sonosdm_nothing_playing:`Нічого не грає`,sonosdm_grouped:`у групі`,sonosdm_play:`Відтворити`,sonosdm_pause:`Пауза`,sonosdm_previous:`Попередній трек`,sonosdm_next:`Наступний трек`,sonosdm_mute:`Без звуку`,sonosdm_unmute:`Увімкнути звук`,sonosdm_shuffle:`Перемішати`,sonosdm_repeat:`Повтор`,sonosdm_repeat_all:`Повторювати все`,sonosdm_repeat_one:`Повторювати трек`,sonosdm_rooms_title:`SONOS`,sonosdm_no_rooms:`Колонки SONOS не знайдено`,sonosdm_all_idle:`Усі вільні`,sonosdm_link_start:`Групувати з цією колонкою`,sonosdm_link_cancel:`Скасувати групування`,sonosdm_link_add:`Додати до групи`,sonosdm_link_remove:`Прибрати з групи`,sonosdm_link_hint:`Виберіть колонки, які мають приєднатися до вибраної`,sonosdm_select_source:`Вибрати джерело`,sonosdm_sources:`Джерела`,sonosdm_favorites:`Обране`,sonosdm_playlists:`Плейлисти`,sonosdm_queue:`Черга`,sonosdm_recent:`Останні`,sonosdm_search:`Пошук`,sonosdm_nothing_found:`Нічого не знайдено`,vis_night_mode:`Нічний звук`,vis_speech_enhancement:`Поліпшення мовлення`,vis_group:`Група`,sonos_ctrl_speakers:`Колонки`,sonos_ctrl_refresh:`Перечитати колонки`,sonos_ctrl_group:`Група`,sonos_ctrl_follows:`слідує за`,sonos_ctrl_instance_not_running:`Екземпляр не запущено - запустіть його, щоб керувати колонками.`},"zh-cn":{wc_choose_speaker:`请在设置中选择扬声器`,wc_not_speaker:`这不是 SONOS 扬声器`,wc_choose_instance:`请在设置中选择 SONOS 实例`,wc_volume:`音量`,wc_position:`进度`,wc_open_player:`打开播放器`,wc_show_all:`显示所有扬声器`,wc_back:`返回`,wc_sign_in:`登录`,wc_clear:`清除`,wc_player:`播放器`,wc_library:`媒体库`,wc_group_volume:`群组音量`,sonosdm_offline:`无法访问`,sonosdm_nothing_playing:`没有正在播放的内容`,sonosdm_grouped:`在群组中`,sonosdm_play:`播放`,sonosdm_pause:`暂停`,sonosdm_previous:`上一曲`,sonosdm_next:`下一曲`,sonosdm_mute:`静音`,sonosdm_unmute:`取消静音`,sonosdm_shuffle:`随机播放`,sonosdm_repeat:`重复`,sonosdm_repeat_all:`全部循环`,sonosdm_repeat_one:`单曲循环`,sonosdm_rooms_title:`SONOS`,sonosdm_no_rooms:`未找到 SONOS 扬声器`,sonosdm_all_idle:`全部空闲`,sonosdm_link_start:`与此扬声器分组`,sonosdm_link_cancel:`取消分组`,sonosdm_link_add:`加入群组`,sonosdm_link_remove:`从群组移除`,sonosdm_link_hint:`选择要加入所选扬声器的扬声器`,sonosdm_select_source:`选择音源`,sonosdm_sources:`音源`,sonosdm_favorites:`收藏`,sonosdm_playlists:`播放列表`,sonosdm_queue:`队列`,sonosdm_recent:`最近播放`,sonosdm_search:`搜索`,sonosdm_nothing_found:`未找到内容`,vis_night_mode:`夜间音效`,vis_speech_enhancement:`语音增强`,vis_group:`群组`,sonos_ctrl_speakers:`扬声器`,sonos_ctrl_refresh:`重新读取扬声器`,sonos_ctrl_group:`群组`,sonos_ctrl_follows:`跟随`,sonos_ctrl_instance_not_running:`实例未运行 - 请启动它以控制扬声器。`}};function Ce(e){let t=Z[e]||{},n=Z.en||{};return e=>t[e]||n[e]||e}function Q(e){return[...new Set(e.filter(Boolean))].sort().join(`
`)}var we=class extends ae{#e;#t=null;#n=``;#r=null;#i=``;#a=null;#o=!1;#s=null;#c=/* @__PURE__ */ new Set;#l=null;constructor(e){super();let t=this.attachShadow({mode:`open`}),n=document.createElement(`style`);n.textContent=J+e,this.#e=document.createElement(`div`),this.#e.className=`mount`,t.append(n,this.#e)}disconnectedCallback(){super.disconnectedCallback(),queueMicrotask(()=>{!this.isConnected&&this.#t&&(this.#t.unmount(),this.#t=null)})}getStateIds(e){let t=[...this.getWantedStateIds(e),...this.#d()];return this.#n=Q(t),t}render(){this.isConnected&&(this.#u(),this.socket&&Q([...this.getWantedStateIds(this.settings),...this.#d()])!==this.#n?this.resubscribe():(this.#t||=o(this.#e),this.#t.render(this.draw()),this.#c.forEach(e=>e())))}resubscribe(){let e=this.settings;this.settings=e}get word(){let e=this.systemLang;return this.#l?.lang!==e&&(this.#l={lang:e,word:Ce(e)}),this.#l.word}get accent(){let e=this.settings.accent;return typeof e==`string`&&e.trim()?e.trim():`var(--iob-primary)`}get rooms(){let e=this.getRoomsNamespace(this.settings);return e&&e===this.#i&&this.socket===this.#a?this.#r:null}stateValue(e,t,n){return this.states[M(e,t,n)]?.val}reloadRooms(){this.editMode||(this.#o=!0,this.render())}#u(){let e=this.socket,t=e?this.getRoomsNamespace(this.settings):null,n=t===this.#i&&e===this.#a;if(!e||!t||n&&!this.#o)return;this.#o=!1,this.#i=t,this.#a=e,n||(this.#r=null);let r=`${t}.root.`;e.getObjectViewSystem(`channel`,r,`${r}香`).then(e=>fe(e,t,this.systemLang)).catch(e=>(console.warn(`<${this.localName}>: cannot read the speakers of ${t}: ${String(e)}`),[])).then(n=>{t===this.#i&&e===this.#a&&(this.#r=n,this.resubscribe())}).catch(()=>void 0)}#d(){let e=this.#s;if(!e)return[];let{namespace:t,room:n}=e,r=[M(t,n,`coordinator`)],i=N(n,this.stateValue(t,n,`coordinator`));for(let e of A)r.push(M(t,n,e)),i!==n&&r.push(M(t,i,e));return r}async openInDialog(e,t,n,r){if(this.editMode)return;let i=document.createElement(`div`),a=i.attachShadow({mode:`open`}),s=document.createElement(`style`);s.textContent=J+t;let c=document.createElement(`div`);c.className=`mount dialog`,a.append(s,c);let l=o(c),u=()=>{for(let[e,t]of Object.entries(w(this.theme)))i.style.setProperty(e,t);l.render(r())};this.#c.add(u),u();try{await this.openDialog({title:e,element:i,width:n})}finally{this.#c.delete(u),l.unmount()}}async openSources(e,t){if(this.editMode||this.#s)return;this.#s=e,this.resubscribe();let{namespace:n,room:r}=e;try{await this.openInDialog(`${this.word(`sonosdm_sources`)} · ${t}`,X,600,()=>/* @__PURE__ */ i(`div`,{className:`view source`,style:{"--accent":this.accent},children:/* @__PURE__ */ i(q,{room:r,coordinator:N(r,this.stateValue(n,r,`coordinator`)),value:(e,t)=>this.stateValue(n,e,t),command:(e,t)=>void this.setState(M(n,r,e),t),word:this.word})}))}finally{this.#s=null,this.isConnected&&this.resubscribe()}}};function $(e){return le(e.instance)||j(e.room)?.namespace||null}var Te=class extends we{#e=null;#t=void 0;constructor(){super(Se)}#n(e){let t=$(e);if(!t)return null;e.room!==this.#t&&(this.#t=e.room,this.#e=null);let n=this.rooms,r=e=>!!e&&(!n||n.some(t=>t.room===e)),i=this.#e?.namespace===t?this.#e.room:void 0;if(r(i))return i;let a=j(e.room);return a?.namespace===t&&r(a.room)?a.room:n?.[0]?.room??null}getRoomsNamespace(e){return $(e)}getWantedStateIds(e){let t=$(e);if(!t)return[];let n=[`system.adapter.${t}.alive`],r=this.rooms;if(r&&e.showRooms!==!1)for(let e of r)ce.forEach(r=>n.push(M(t,e.room,r)));let i=this.#n(e);if(!i)return n;k.forEach(e=>n.push(M(t,i,e)));let a=N(i,this.stateValue(t,i,`coordinator`));if(e.showGroups!==!1&&n.push(M(t,a,`membersChannels`),M(t,i,`group_volume`)),e.showLibrary!==!1)for(let e of A)n.push(M(t,i,e)),a!==i&&n.push(M(t,a,e));return n}#r(e,t){return t.map(t=>{let n=n=>this.stateValue(e,t.room,n),r=e=>{let t=n(e);return t==null?``:String(t)};return{room:t.room,name:t.name,color:t.color,alive:n(`alive`)!==!1,playing:n(`state_simple`)===!0,volume:Number(n(`volume`))||0,playingText:[r(`current_title`),r(`current_artist`)].filter(Boolean).join(` · `),grouped:N(t.room,n(`coordinator`))!==t.room||P(n(`membersChannels`)).some(e=>e!==t.room)}})}#i(e,t,n){let r=N(t,this.stateValue(e,t,`coordinator`)),i=P(this.stateValue(e,r,`membersChannels`)),a=r!==t||i.some(e=>e!==r),o=this.stateValue(e,t,`group_volume`);return{members:n.map(e=>({room:e.room,name:e.name,member:e.room===r||i.includes(e.room),coordinator:e.room===r})),follows:r===t?``:n.find(e=>e.room===r)?.name||r,volume:a&&o!=null?Number(o)||0:null,disabled:this.stateValue(e,t,`alive`)===!1}}#a(e,t){let{namespace:n,room:r}=e,a=ge(r,this.rooms?.find(e=>e.room===r)?.name||r,e=>this.stateValue(n,r,e),this.states[M(n,r,`current_cover`)]?.ts),o=this.settings.showLibrary!==!1;return/* @__PURE__ */ i(ve,{values:a,showCover:!0,showSeek:!0,showModes:!0,showVolume:!0,showSource:!o,rooms:null,group:null,accent:this.accent,editMode:this.editMode,dialog:t,word:this.word,onCommand:(e,t)=>void this.setState(M(n,r,e),t),onGroup:()=>void 0,onSelectRoom:()=>void 0,onOpenSources:()=>void this.openSources(e,a.name),onOpenPlayer:t?void 0:()=>void this.openInDialog(a.name,Y,440,()=>{let e=this.#n(this.settings);return e?this.#a({namespace:n,room:e},!0):null})})}draw(){let e=this.settings,t=this.word,n=$(e);if(!n)return/* @__PURE__ */ i(G,{text:t(`wc_choose_instance`),icon:`speakers`,editMode:this.editMode});if(this.states[`system.adapter.${n}.alive`]?.val===!1)return/* @__PURE__ */ i(G,{text:t(`sonos_ctrl_instance_not_running`),icon:`speakers`,editMode:this.editMode});let r=this.rooms;if(!r)return/* @__PURE__ */ i(`div`,{className:`view control`});let a=this.#n(e);if(!a)return/* @__PURE__ */ i(G,{text:t(`sonosdm_no_rooms`),icon:`speakers`,editMode:this.editMode,children:/* @__PURE__ */ i(H,{icon:`refresh`,title:t(`sonos_ctrl_refresh`),onClick:()=>this.reloadRooms()})});let o=N(a,this.stateValue(n,a,`coordinator`)),s=(e,t)=>void this.setState(M(n,a,e),t);return/* @__PURE__ */ i(be,{speakers:e.showRooms===!1?null:this.#r(n,r),selected:a,player:this.#a({namespace:n,room:a},!1),group:e.showGroups!==!1&&r.length>1?this.#i(n,a,r):null,library:e.showLibrary===!1?null:/* @__PURE__ */ i(`div`,{className:`view source`,children:/* @__PURE__ */ i(q,{room:a,coordinator:o,value:(e,t)=>this.stateValue(n,e,t),command:s,word:t},a)}),accent:this.accent,editMode:this.editMode,word:t,onSelect:e=>{!this.editMode&&e!==a&&(this.#e={namespace:n,room:e},this.resubscribe())},onRefresh:()=>this.reloadRooms(),onGroup:(e,t)=>void this.setState(M(n,o,t?`add_to_group`:`remove_from_group`),e),onGroupVolume:e=>s(`group_volume`,e)})}};oe(se.control.tag,Te);