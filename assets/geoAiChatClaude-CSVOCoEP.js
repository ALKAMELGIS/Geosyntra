import{bb as b,a2 as f,a5 as v,br as D,bs as G}from"./fieldsStore-C-YNMsFr.js";import{ah as O}from"./fieldsStore-C-YNMsFr.js";import"./index-CHKcSSx4.js";function g(e){const a=e;return Array.isArray(a.fields)?a.fields:[]}function m(e){var o;const a=g(e).slice(0,48).join(", ");let t="";const n=e.data;if((o=n==null?void 0:n.features)!=null&&o.length){const r=n.features[0],s=r==null?void 0:r.properties,i=e.source==="arcgis"?e.arcgisLayerDefinition??void 0:void 0;if(s&&typeof s=="object"){const d=i&&typeof i=="object"?D(s,r,i):s;t=` | ${i&&typeof i=="object"?"example attributes (domain/subtype descriptions)":"example attributes"}: ${JSON.stringify(d).slice(0,420)}`}const u=n.features,c=G(u,2400);c&&(t+=` | ${c}`)}return`- ${e.name} (type=${e.type}, source=${e.source??"n/a"}, visible=${e.visible}) fields=[${a||"—"}]${t}`}async function C(e=4e4){try{const a=await f();let t=a.length>0?`### GIS Content (layers saved in GIS Map — this browser)
`+a.map(m).join(`
`):`### GIS Content
(no saved layers yet — open GIS Map, add layers, and save them to attach data here).`;return t.length>e&&(t=`${t.slice(0,e)}
[…truncated…]`),t}catch{return`### GIS Content
(could not read saved layers).`}}async function E(e=48e3,a){var r;const t=[],n=(a==null?void 0:a.includeGisSavedLayers)!==!1;if((r=a==null?void 0:a.satelliteLayers)!=null&&r.length){const s=Math.min(3e4,Math.max(8e3,e-12e3));t.push(`### Satellite Imagery — Added layers (visible vector layers on this map session)
`+b(a.satelliteLayers,s))}if(n)try{const s=await f();s.length?t.push(`### GIS Content (layers saved in this browser / GIS Map)
`+s.map(m).join(`
`)):t.push(`### GIS Content
(no saved layers in IndexedDB for this browser yet).`)}catch{t.push(`### GIS Content
(could not read saved layers).`)}else t.push(`### GIS Content
(Omitted on this page — Satellite Geo AI uses only layers added on this map. Open **GIS Map** for Geo AI with saved GIS layers.)`);try{if(typeof localStorage>"u")t.push(`### Develop Dashboard — Data
(localStorage unavailable).`);else{const s=localStorage.getItem(v);s?t.push(`### Develop Dashboard — Data pane snapshot (JSON)
`+s.slice(0,e)):t.push(`### Develop Dashboard — Data
(no snapshot yet). Open Develop Dashboard and use the Data panel (layers / CSV) so the app can record a summary here.`)}}catch{t.push(`### Develop Dashboard
(could not read snapshot).`)}let o=t.join(`

`);return o.length>e&&(o=`${o.slice(0,e)}

[…context truncated…]`),o}const I=["claude-3-5-haiku-20241022","claude-3-5-sonnet-20241022"];function A(e){return e.map(a=>({role:a.role,content:[{type:"text",text:a.text}]}))}async function L(e){var i,u,c,d;const{apiKey:a,system:t,turns:n,userMessage:o}=e,r=[...A(n),{role:"user",content:o}];let s="Unknown error";for(const y of I){const l=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":a,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:y,max_tokens:4096,system:t,messages:r})}),p=await l.json().catch(()=>({}));if(!l.ok){if(s=((i=p==null?void 0:p.error)==null?void 0:i.message)||l.statusText||`HTTP ${l.status}`,l.status===404||l.status===400)continue;throw new Error(s)}const h=(d=(c=(u=p.content)==null?void 0:u.find(S=>S.type==="text"))==null?void 0:c.text)==null?void 0:d.trim();if(h)return h;s="Empty Claude response"}throw new Error(s)}export{v as DEVELOP_DATA_CONTEXT_LS_KEY,O as GEO_AI_CHAT_SYSTEM_BASE,E as buildGeoAiDataContext,C as buildGisContentLayersContext,L as claudeGeoAiComplete,m as summarizeGisLayer};
