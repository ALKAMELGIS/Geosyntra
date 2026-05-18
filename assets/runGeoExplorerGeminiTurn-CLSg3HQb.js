import{buildGisContentLayersContext as j}from"./geoAiChatClaude-Ck2pqPa-.js";import{a2 as X,bb as V,d as z,af as J,bc as Z,i as ee,e as te,G as ae,p as O,bd as c,be as h,bf as b,h as ne,bg as P,bh as oe,bi as ie,bj as se,bk as re,bl as le,bm as ce,bn as de,bo as me,bp as pe,ai as ue,bq as ye,aj as fe}from"./fieldsStore-CZ3L0u-o.js";import{a7 as Re}from"./fieldsStore-CZ3L0u-o.js";import{g as he}from"./geoExplorerGeminiApi-egIRxMiY.js";import"./index-DMtGvrSs.js";function ge(p,u){const e=(u[1]-p[1])*Math.PI/180,d=(u[0]-p[0])*Math.PI/180,g=p[1]*Math.PI/180,$=u[1]*Math.PI/180,M=Math.sin(e/2)*Math.sin(e/2)+Math.cos(g)*Math.cos($)*Math.sin(d/2)*Math.sin(d/2);return 2*6371*Math.asin(Math.min(1,Math.sqrt(M)))}async function Ie(p){var T;const{apiKey:u,historyWithUser:A,userTextForMapFallback:e,primaryVectorLayers:d,mapboxAccessToken:g,openWeatherApiKey:$,pinLngLat:M,lastMapQueryCoords:C,inspectAnchorLngLat:N,mapPopup:Q,addedLayersHeading:U,attachGisSavedLayers:k,extraSystemAppend:E,questionEditInPlace:q}=p,D=k===!0;let m=[...d],R=`### GIS Content (saved layers from GIS Map)
(Not attached on this page — open **GIS Map** → Geo AI to use layers saved in IndexedDB.)`;if(D){const i=await X();m=[...d,...i.map(n=>({name:n.name,visible:n.visible,source:n.source,data:n.data,arcgisLayerDefinition:n.arcgisLayerDefinition}))],R=await j(22e3)}const F=V(d,2e4),l=e.trim().length>0?z(e,m):null;let _="";l&&l.score>=32&&(_=`

### RESOLVED LAYER FEATURE (authoritative for this user message)
The question matches **one** loaded vector feature. Answer using **only** this JSON for its attributes and treat the centroid as its map location—do not claim this id/code is missing from layers because the one-line "example attributes" sample showed a different row.
- Layer: ${l.layerName}
- Centroid WGS84 (longitude, latitude): ${l.lng}, ${l.lat}
- Attributes:
${l.matchSummary}`);const B=await J({userText:e,pinLngLat:M,lastMapQueryCoords:C,inspectAnchorLngLat:N,combinedLayers:m,mapboxAccessToken:g,openWeatherApiKey:$,mapPopup:Q}),H=E!=null&&E.trim()?`

${E.trim()}`:"",W=`${pe}

${ue}

${ye}

${fe}${B}${_}

---
${U}
${F}

${R}${q?`

### In-place question refinement
The user edited their latest question in the same thread (no new chat). Prior assistant replies after that question are not in this history. Answer only the **updated** wording: apply new field/layer/selection/stat instructions concisely. Skip greetings, recap, and generic onboarding.`:""}${H}`;let t=await he({apiKey:u,systemInstruction:W,contents:Z(A)});const G=ee(e,m),Y=((T=e?te(e,m):null)==null?void 0:T.trim())??"",S=l,a=S&&S.score>=ae?S:null;let s=O(t);if(G&&!a&&s&&(t=`${c(t).trimEnd()}

**Map:** MAP_QUERY was removed — no confident feature match in your active or GIS Content layers; the app will not move the map to an unrelated location.${h(b(e))}`,s=null),s&&!a){const i=ne({userText:e,replyText:t,mapQueryCoords:s,strongLayerHit:a});if(!i.allow){const n=b(e);t=`${c(t).trimEnd()}`,t=P(t,n,"lowConfidenceMapQuery",i.confidence),t=`${t.trimEnd()}${h(n)}`,s=null}}let r=null,o=t,y="geocode";const w=i=>{const n=i.matchSummary.trim();return`

(Map pin from layer "${i.layerName}" — matched feature attributes: ${n.slice(0,200)}${n.length>200?"…":""})`};if(!!a&&(!!Y||!!(s&&a&&ge(s,[a.lng,a.lat])>2))&&a)r=[a.lng,a.lat],y="layer",o=`${c(t).trimEnd()}${w(a)}`;else if(s&&(!G||a))r=s,y="map_query",o=t;else if(e){if(a)r=[a.lng,a.lat],y="layer",o=`${t.trimEnd()}${w(a)}`;else if(oe(e,m)&&!(ie(e)&&!se(e))){const i=re(le(e));if(i.length>=2){const n=await ce(i,{mapboxAccessToken:g}),{chosen:L,ambiguous:v}=de(n),f=b(e);if(L&&!v){r=[L.lng,L.lat],y="geocode";const I=L.label.replace(/\s+/g," ").trim().slice(0,160);o=`${c(t).trimEnd()}

(Map centered on "${I}" — geocoder confidence OK.)`}else if(n.length>=2&&v){const I=n.slice(0,3).map(K=>K.label.split(",").slice(0,2).join(",").trim()).filter(Boolean);o=me(c(t).trimEnd(),f,I)}else n.length?o=`${P(c(t).trimEnd(),f,"insufficientData").trimEnd()}${h(f)}`:o=`${P(c(t).trimEnd(),f,"cannotLocatePrecisely").trimEnd()}${h(f)}`}}else if(G){o=t.trimEnd();const i=b(e);/\b(not found|not available|no match|غير متوفر|لا توجد|لم يتم العثور)\b/i.test(o)||(o+=`

**Map:** No matching location in your layers — the map was not changed.${h(i)}`)}}r&&!O(o)&&(o=`${o.trimEnd()}
MAP_QUERY:${r[0]},${r[1]}`);const x={id:typeof crypto<"u"&&"randomUUID"in crypto?crypto.randomUUID():`geo-m-${Date.now()}`,role:"model",parts:[{type:"text",text:o}]};return r?{modelMsg:x,mapEffect:{coords:r,pinSource:y,layerHit:a,replyText:o}}:{modelMsg:x,mapEffect:null}}export{Re as geoExplorerTargetZoomForPinSource,Ie as runGeoExplorerGeminiTurn};
