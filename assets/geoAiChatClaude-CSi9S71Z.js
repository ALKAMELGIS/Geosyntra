import{d as S}from"./geoExplorerGeminiApi-BV8F1F6a.js";import{D as b,C as f,_ as v,$ as D,a0 as A}from"./SatelliteIntelligenceMain-BXWWXsYI.js";import{a1 as R}from"./SatelliteIntelligenceMain-BXWWXsYI.js";import{h as G}from"./index-BgIbkTkq.js";import"./useSubscription-DdF5ufSl.js";import"./sentinelHubWmsCapabilities-CGq2vccD.js";import"./systemTokensApi-IomGV62u.js";import"./index-iBBVB9ok.js";function w(t){const e=t;return Array.isArray(e.fields)?e.fields:[]}function m(t){var r;const e=w(t).slice(0,48).join(", ");let a="";const o=t.data;if((r=o==null?void 0:o.features)!=null&&r.length){const i=o.features[0],n=i==null?void 0:i.properties,s=t.source==="arcgis"?t.arcgisLayerDefinition??void 0:void 0;if(n&&typeof n=="object"){const d=s&&typeof s=="object"?D(n,i,s):n;a=` | ${s&&typeof s=="object"?"example attributes (domain/subtype descriptions)":"example attributes"}: ${JSON.stringify(d).slice(0,420)}`}const u=o.features,c=A(u,2400);c&&(a+=` | ${c}`)}return`- ${t.name} (type=${t.type}, source=${t.source??"n/a"}, visible=${t.visible}) fields=[${e||"—"}]${a}`}async function O(t=4e4){try{const e=await f();let a=e.length>0?`### GIS Content (layers saved in this browser)
`+e.map(m).join(`
`):`### GIS Content
(no saved layers yet — add layers on Satellite Intelligence and save them to attach data here).`;return a.length>t&&(a=`${a.slice(0,t)}
[…truncated…]`),a}catch{return`### GIS Content
(could not read saved layers).`}}async function j(t=48e3,e){var i,n;const a=[],o=(e==null?void 0:e.includeGisSavedLayers)!==!1;if((i=e==null?void 0:e.layerRegistryBlock)!=null&&i.trim()&&a.push(`### MAP LAYER REGISTRY (all loaded layers — vector, raster, WMS, imagery)
`+e.layerRegistryBlock.trim().slice(0,Math.min(32e3,t-8e3))),(n=e==null?void 0:e.satelliteLayers)!=null&&n.length){const s=Math.min(3e4,Math.max(8e3,t-12e3));a.push(`### Satellite Imagery — Added layers (visible vector layers on this map session)
`+b(e.satelliteLayers,s))}if(o)try{const s=await f();s.length?a.push(`### GIS Content (layers saved in this browser)
`+s.map(m).join(`
`)):a.push(`### GIS Content
(no saved layers in IndexedDB for this browser yet).`)}catch{a.push(`### GIS Content
(could not read saved layers).`)}else a.push(`### GIS Content
(Omitted on this page — Geo AI uses only layers added on this map session.)`);try{if(typeof localStorage>"u")a.push(`### Develop Dashboard — Data
(localStorage unavailable).`);else{const s=localStorage.getItem(v);s?a.push(`### Develop Dashboard — Data pane snapshot (JSON)
`+s.slice(0,t)):a.push(`### Develop Dashboard — Data
(no snapshot yet). Open Develop Dashboard and use the Data panel (layers / CSV) so the app can record a summary here.`)}}catch{a.push(`### Develop Dashboard
(could not read snapshot).`)}let r=a.join(`

`);return r.length>t&&(r=`${r.slice(0,t)}

[…context truncated…]`),r}const E=["claude-3-5-haiku-20241022","claude-3-5-sonnet-20241022"];function I(t){return t.map(e=>({role:e.role,content:[{type:"text",text:e.text}]}))}async function k(t){var s,u,c,d;const{apiKey:e,system:a,turns:o,userMessage:r}=t;if(G()||e==="__gateway__")return S({system:a,turns:o,userMessage:r});const i=[...I(o),{role:"user",content:r}];let n="Unknown error";for(const p of E){const l=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":e,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:p,max_tokens:4096,system:a,messages:i})}),y=await l.json().catch(()=>({}));if(!l.ok){if(n=((s=y==null?void 0:y.error)==null?void 0:s.message)||l.statusText||`HTTP ${l.status}`,l.status===404||l.status===400)continue;throw new Error(n)}const h=(d=(c=(u=y.content)==null?void 0:u.find(g=>g.type==="text"))==null?void 0:c.text)==null?void 0:d.trim();if(h)return h;n="Empty Claude response"}throw new Error(n)}export{v as DEVELOP_DATA_CONTEXT_LS_KEY,R as GEO_AI_CHAT_SYSTEM_BASE,j as buildGeoAiDataContext,O as buildGisContentLayersContext,k as claudeGeoAiComplete,m as summarizeGisLayer};
