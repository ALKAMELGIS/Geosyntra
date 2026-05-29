import{a as S}from"./apiGatewayClient-CRTNoUjw.js";import{a4 as b,a3 as f,aq as v,ar as D,as as G}from"./SatelliteIntelligenceMain-BQqRTkEZ.js";import{at as J}from"./SatelliteIntelligenceMain-BQqRTkEZ.js";import{h as A}from"./index-Bm-6UClh.js";import"./useSubscription-2Gv-iB00.js";import"./mapboxAccessToken-CVHKyNWE.js";import"./sentinelHubWmsCapabilities-F5GCmg29.js";import"./systemTokensApi-B-Qfu5s6.js";import"./index-BDFkXDEW.js";function w(e){const a=e;return Array.isArray(a.fields)?a.fields:[]}function m(e){var o;const a=w(e).slice(0,48).join(", ");let t="";const n=e.data;if((o=n==null?void 0:n.features)!=null&&o.length){const r=n.features[0],s=r==null?void 0:r.properties,i=e.source==="arcgis"?e.arcgisLayerDefinition??void 0:void 0;if(s&&typeof s=="object"){const p=i&&typeof i=="object"?D(s,r,i):s;t=` | ${i&&typeof i=="object"?"example attributes (domain/subtype descriptions)":"example attributes"}: ${JSON.stringify(p).slice(0,420)}`}const u=n.features,c=G(u,2400);c&&(t+=` | ${c}`)}return`- ${e.name} (type=${e.type}, source=${e.source??"n/a"}, visible=${e.visible}) fields=[${a||"—"}]${t}`}async function M(e=4e4){try{const a=await f();let t=a.length>0?`### GIS Content (layers saved in this browser)
`+a.map(m).join(`
`):`### GIS Content
(no saved layers yet — add layers on Satellite Intelligence and save them to attach data here).`;return t.length>e&&(t=`${t.slice(0,e)}
[…truncated…]`),t}catch{return`### GIS Content
(could not read saved layers).`}}async function k(e=48e3,a){var r;const t=[],n=(a==null?void 0:a.includeGisSavedLayers)!==!1;if((r=a==null?void 0:a.satelliteLayers)!=null&&r.length){const s=Math.min(3e4,Math.max(8e3,e-12e3));t.push(`### Satellite Imagery — Added layers (visible vector layers on this map session)
`+b(a.satelliteLayers,s))}if(n)try{const s=await f();s.length?t.push(`### GIS Content (layers saved in this browser)
`+s.map(m).join(`
`)):t.push(`### GIS Content
(no saved layers in IndexedDB for this browser yet).`)}catch{t.push(`### GIS Content
(could not read saved layers).`)}else t.push(`### GIS Content
(Omitted on this page — Geo AI uses only layers added on this map session.)`);try{if(typeof localStorage>"u")t.push(`### Develop Dashboard — Data
(localStorage unavailable).`);else{const s=localStorage.getItem(v);s?t.push(`### Develop Dashboard — Data pane snapshot (JSON)
`+s.slice(0,e)):t.push(`### Develop Dashboard — Data
(no snapshot yet). Open Develop Dashboard and use the Data panel (layers / CSV) so the app can record a summary here.`)}}catch{t.push(`### Develop Dashboard
(could not read snapshot).`)}let o=t.join(`

`);return o.length>e&&(o=`${o.slice(0,e)}

[…context truncated…]`),o}const C=["claude-3-5-haiku-20241022","claude-3-5-sonnet-20241022"];function I(e){return e.map(a=>({role:a.role,content:[{type:"text",text:a.text}]}))}async function N(e){var i,u,c,p;const{apiKey:a,system:t,turns:n,userMessage:o}=e;if(A()||a==="__gateway__")return S({system:t,turns:n,userMessage:o});const r=[...I(n),{role:"user",content:o}];let s="Unknown error";for(const y of C){const l=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":a,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:y,max_tokens:4096,system:t,messages:r})}),d=await l.json().catch(()=>({}));if(!l.ok){if(s=((i=d==null?void 0:d.error)==null?void 0:i.message)||l.statusText||`HTTP ${l.status}`,l.status===404||l.status===400)continue;throw new Error(s)}const h=(p=(c=(u=d.content)==null?void 0:u.find(g=>g.type==="text"))==null?void 0:c.text)==null?void 0:p.trim();if(h)return h;s="Empty Claude response"}throw new Error(s)}export{v as DEVELOP_DATA_CONTEXT_LS_KEY,J as GEO_AI_CHAT_SYSTEM_BASE,k as buildGeoAiDataContext,M as buildGisContentLayersContext,N as claudeGeoAiComplete,m as summarizeGisLayer};
