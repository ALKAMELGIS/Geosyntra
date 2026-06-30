import{buildGisContentLayersContext as oe}from"./geoAiChatClaude-Uqxd6Xrn.js";import{k as ae,B as ie,y as se,q as Q,z as le,C as re,D as ce,E as de,F as ue,G as pe,H as ge,I as me,J as fe,K as he,L as ye,M as Le,N as $e,O as Ee,g as V,e as x,P as A,Q as k,R as Ge,S as B,T as xe,U as Me,V as be,W as Se,X as ve,t as Pe,x as we,Y as _e}from"./SatelliteIntelligenceMain--tQ2CVsA.js";import{Z as at}from"./SatelliteIntelligenceMain--tQ2CVsA.js";import{g as Ie}from"./geoExplorerGeminiApi-CXQL26wQ.js";import{d as Ae}from"./intentDetector-Cg7MVrOW.js";import{readGeoSpatialMemory as Re,groundingSuggestionChipsFromMemory as Ce,writeGeoSpatialMemory as Oe}from"./spatialMemory-DwP1Bk4f.js";import"./index-YSXxnnuT.js";import"./useSubscription-xDwG5i4q.js";import"./sentinelHubWmsCapabilities-JnEAPnp5.js";import"./systemTokensApi-AQYKRDPv.js";import"./index-CzIfi2AG.js";function Te(e){if(!e)return"";const t=["### Geo Dataset Engine — AOI snapshot"];return e.label&&t.push(`- Label: ${e.label}`),e.bbox&&t.push(`- Bbox (W,S,E,N): ${e.bbox.map(h=>Number(h).toFixed(5)).join(", ")}`),e.areaHa!=null&&t.push(`- Area (ha): ${e.areaHa.toFixed(2)}`),e.timelineLabel&&t.push(`- Timeline: ${e.timelineLabel}`),e.layerId&&t.push(`- Layer: ${e.layerId}`),e.ndviMean!=null&&t.push(`- NDVI: mean ${e.ndviMean.toFixed(3)}${e.ndviMin!=null?`, min ${e.ndviMin.toFixed(3)}`:""}${e.ndviMax!=null?`, max ${e.ndviMax.toFixed(3)}`:""}`),t.length>1?t.join(`
`):""}function Fe(e){return e.length?e.slice(0,8).map((t,h)=>{var a,s;const n=t.lat!=null&&t.lng!=null?` @ ${(a=t.lng)==null?void 0:a.toFixed(5)},${(s=t.lat)==null?void 0:s.toFixed(5)}`:"",o=t.rating!=null?` · rating ${t.rating}`:"";return`${h+1}. **${t.name||"Place"}** — ${t.address||"—"}${n}${o}`}).join(`
`):"(no places returned)"}function Ne(e){return e?`- Distance: ~${e.distanceMeters!=null?(e.distanceMeters/1e3).toFixed(1):"?"} km
- Duration: ${e.duration||"—"}
- Encoded polyline available: ${e.polyline?"yes":"no"}`:"(no route returned)"}function ke(e){var n;const t=[],h=Te(e.engine.aoi);return h&&t.push(h),(n=e.engine.satelliteLayerSummary)!=null&&n.trim()&&t.push(`### Geo Dataset Engine — Live layers
${e.engine.satelliteLayerSummary.trim().slice(0,4e3)}`),e.engine.pinLngLat&&t.push(`### Session map anchor
WGS84: ${e.engine.pinLngLat[0].toFixed(5)}, ${e.engine.pinLngLat[1].toFixed(5)}`),t.push(`### GOOGLE MAPS GROUNDING (live)
Tools invoked: ${e.toolsUsed.join(", ")||"none"}
User query: ${e.engine.userText.slice(0,300)}`),e.places.length&&t.push(`**Places (text search)**
${Fe(e.places)}`),e.geocodes.length&&t.push(`**Geocoding**
${e.geocodes.map((o,a)=>{var s,g;return`${a+1}. ${o.label} → ${(s=o.lng)==null?void 0:s.toFixed(5)},${(g=o.lat)==null?void 0:g.toFixed(5)}`}).join(`
`)}`),e.route&&t.push(`**Route**
${Ne(e.route)}`),e.elevations.length&&t.push(`**Elevation**
${e.elevations.map(o=>{var a,s,g;return`- ${(a=o.lat)==null?void 0:a.toFixed(5)},${(s=o.lng)==null?void 0:s.toFixed(5)} → ${(g=o.elevationMeters)==null?void 0:g.toFixed(1)} m`}).join(`
`)}`),t.join(`

`)}const Ue=`### Geo Explor AI Agent — Google Maps Platform grounding (Grounding Lite MCP layer)
When a **### GOOGLE MAPS GROUNDING (live)** block appears below, treat it as **authoritative** for places, routes, geocoding, and elevation at query time — not general web knowledge.

**Rules:**
- Cite place **names and addresses** exactly as listed; include ratings only when present in the block.
- For **routes**, summarize distance/duration from the block; do not invent turn-by-turn unless provided.
- Prefer grounding coordinates for MAP_QUERY when the user asked about a **specific grounded place** and layer data does not override.
- When grounding is empty or missing, say live Google Maps data was unavailable and continue with GIS/satellite context only.
- Combine with AOI / NDVI / raster blocks when both are present: separate **Places intelligence** vs **Remote sensing** sections.`;async function De(e){var O,T;const t=await ae(),h=Re(),n=Ce(h);if(!t.configured)return{configured:!1,toolsUsed:[],contextBlock:"",suggestedChips:n,primaryCoords:e.pinLngLat??null,places:[]};const o=Ae(e.userText);if(!o.tools.length)return{configured:!0,toolsUsed:[],contextBlock:"",suggestedChips:n,primaryCoords:e.pinLngLat??null,places:[]};const a=[];let s=[];const g=[];let G=null,R=[],y=e.pinLngLat??null;const M=(O=e.pinLngLat)==null?void 0:O[1],b=(T=e.pinLngLat)==null?void 0:T[0];if(o.placesQuery&&o.tools.includes("places_text_search")){a.push("places_text_search"),s=await se({textQuery:o.placesQuery,lat:M,lng:b});const c=s.find(d=>d.lat!=null&&d.lng!=null);c&&(y=[c.lng,c.lat])}if(o.geocodeQuery&&o.tools.includes("geocode")){a.push("geocode");const c=await Q(o.geocodeQuery);g.push(...c);const d=c.find(P=>P.lat!=null&&P.lng!=null);d&&(y=[d.lng,d.lat])}if(o.routeEndpoints&&o.tools.includes("compute_route")){a.push("compute_route");let c=o.routeEndpoints.destinationText,d=o.routeEndpoints.originText;!d&&M!=null&&b!=null&&(d=`${M},${b}`);const P=await Q(c),_=d?await Q(d):[],m=P[0],f=_[0];if((m==null?void 0:m.lat)!=null&&(m==null?void 0:m.lng)!=null&&(f==null?void 0:f.lat)!=null&&(f==null?void 0:f.lng)!=null){a.push("geocode");const L=await le({origin:{lat:f.lat,lng:f.lng},destination:{lat:m.lat,lng:m.lng}});G=(L==null?void 0:L.route)??null,G&&(y=[m.lng,m.lat])}}if(o.wantsElevation&&o.tools.includes("elevation")){a.push("elevation");const c=y!=null?[{lat:y[1],lng:y[0]}]:M!=null&&b!=null?[{lat:M,lng:b}]:[];c.length&&(R=await ie(c))}const v=ke({engine:e,places:s,geocodes:g,route:G,elevations:R,toolsUsed:a});Oe({lastPlaces:s,lastCoords:y,lastQuery:e.userText.slice(0,200)});const C=[...n];for(const c of s.slice(0,2))c.name&&C.unshift(String(c.name).slice(0,42));return{configured:!0,toolsUsed:a,contextBlock:v,suggestedChips:[...new Set(C)].slice(0,8),primaryCoords:y,places:s,routePolyline:G==null?void 0:G.polyline}}function Qe(e,t){const n=(t[1]-e[1])*Math.PI/180,o=(t[0]-e[0])*Math.PI/180,a=e[1]*Math.PI/180,s=t[1]*Math.PI/180,g=Math.sin(n/2)*Math.sin(n/2)+Math.cos(a)*Math.cos(s)*Math.sin(o/2)*Math.sin(o/2);return 2*6371*Math.asin(Math.min(1,Math.sqrt(g)))}async function tt(e){var j;const{apiKey:t,historyWithUser:h,userTextForMapFallback:n,primaryVectorLayers:o,mapboxAccessToken:a,openWeatherApiKey:s,pinLngLat:g,lastMapQueryCoords:G,inspectAnchorLngLat:R,mapPopup:y,addedLayersHeading:M,attachGisSavedLayers:b,extraSystemAppend:v,questionEditInPlace:C,groundingEnabled:O=!0,geoDatasetAoi:T,satelliteLayerSummary:c,layerRegistryBlock:d}=e,P=b===!0;let _,m="",f=null;if(O&&n.trim()){const l=await De({userText:n,pinLngLat:g,aoi:T??null,satelliteLayerSummary:c});_={toolsUsed:l.toolsUsed,suggestedChips:l.suggestedChips,routePolyline:l.routePolyline},l.contextBlock&&(m=`

${Ue}

${l.contextBlock}`),f=l.primaryCoords}let L=[...o],W=`### GIS Content (saved layers)
(Not attached on this page — only layers on this map session are used.)`;if(P){const l=await re();L=[...o,...l.map(p=>({name:p.name,visible:p.visible,source:p.source,data:p.data,arcgisLayerDefinition:p.arcgisLayerDefinition}))],W=await oe(22e3)}const X=ce(o,2e4),z=d!=null&&d.trim()?`

### MAP LAYER REGISTRY (all loaded layers — vector, raster, WMS, imagery)
${d.trim()}`:"",S=n.trim().length>0?de(n,L):null;let q="";S&&S.score>=32&&(q=`

### RESOLVED LAYER FEATURE (authoritative for this user message)
The question matches **one** loaded vector feature. Answer using **only** this JSON for its attributes and treat the centroid as its map location—do not claim this id/code is missing from layers because the one-line "example attributes" sample showed a different row.
- Layer: ${S.layerName}
- Centroid WGS84 (longitude, latitude): ${S.lng}, ${S.lat}
- Attributes:
${S.matchSummary}`);const J=await ue({userText:n,pinLngLat:g,lastMapQueryCoords:G,inspectAnchorLngLat:R,combinedLayers:L,mapboxAccessToken:a,openWeatherApiKey:s,mapPopup:y}),Z=v!=null&&v.trim()?`

${v.trim()}`:"",ee=`${pe}

${ge}

${me}

${fe}

${he}${J}${q}${m}

---
${M}
${X}${z}

${W}${C?`

### In-place question refinement
The user edited their latest question in the same thread (no new chat). Prior assistant replies after that question are not in this history. Answer only the **updated** wording: apply new field/layer/selection/stat instructions concisely. Skip greetings, recap, and generic onboarding.`:""}${Z}`;let i=await Ie({...t!=null&&t.trim()&&t!=="__gateway__"?{apiKey:t}:{},systemInstruction:ee,contents:ye(h)});const F=Le(n,L),te=((j=n?$e(n,L):null)==null?void 0:j.trim())??"",U=S,r=U&&U.score>=Ee?U:null;let E=V(i);if(F&&!r&&E&&(i=`${x(i).trimEnd()}

**Map:** MAP_QUERY was removed — no confident feature match in your active or GIS Content layers; the app will not move the map to an unrelated location.${A(k(n))}`,E=null),E&&!r){const l=Ge({userText:n,replyText:i,mapQueryCoords:E,strongLayerHit:r});if(!l.allow){const p=k(n);i=`${x(i).trimEnd()}`,i=B(i,p,"lowConfidenceMapQuery",l.confidence),i=`${i.trimEnd()}${A(p)}`,E=null}}let $=null,u=i,w="geocode";const H=l=>{const p=l.matchSummary.trim();return`

(Map pin from layer "${l.layerName}" — matched feature attributes: ${p.slice(0,200)}${p.length>200?"…":""})`};if(!!r&&(!!te||!!(E&&r&&Qe(E,[r.lng,r.lat])>2))&&r)$=[r.lng,r.lat],w="layer",u=`${x(i).trimEnd()}${H(r)}`;else if(E&&(!F||r))$=E,w="map_query",u=i;else if(n){if(r)$=[r.lng,r.lat],w="layer",u=`${i.trimEnd()}${H(r)}`;else if(xe(n,L)&&!(Me(n)&&!be(n))){const l=Se(ve(n));if(l.length>=2){const p=await Pe(l,{mapboxAccessToken:a}),{chosen:N,ambiguous:K}=we(p),I=k(n);if(N&&!K){$=[N.lng,N.lat],w="geocode";const D=N.label.replace(/\s+/g," ").trim().slice(0,160);u=`${x(i).trimEnd()}

(Map centered on "${D}" — geocoder confidence OK.)`}else if(p.length>=2&&K){const D=p.slice(0,3).map(ne=>ne.label.split(",").slice(0,2).join(",").trim()).filter(Boolean);u=_e(x(i).trimEnd(),I,D)}else p.length?u=`${B(x(i).trimEnd(),I,"insufficientData").trimEnd()}${A(I)}`:u=`${B(x(i).trimEnd(),I,"cannotLocatePrecisely").trimEnd()}${A(I)}`}}else if(f&&!F)$=f,w="grounding",u=`${x(i).trimEnd()}

(Map centered on Google Maps grounded place.)`;else if(F){u=i.trimEnd();const l=k(n);/\b(not found|not available|no match|غير متوفر|لا توجد|لم يتم العثور)\b/i.test(u)||(u+=`

**Map:** No matching location in your layers — the map was not changed.${A(l)}`)}}$&&!V(u)&&(u=`${u.trimEnd()}
MAP_QUERY:${$[0]},${$[1]}`);const Y={id:typeof crypto<"u"&&"randomUUID"in crypto?crypto.randomUUID():`geo-m-${Date.now()}`,role:"model",parts:[{type:"text",text:u}]};return $?{modelMsg:Y,mapEffect:{coords:$,pinSource:w,layerHit:r,replyText:u},grounding:_}:{modelMsg:Y,mapEffect:null,grounding:_}}export{at as geoExplorerTargetZoomForPinSource,tt as runGeoExplorerGeminiTurn};
