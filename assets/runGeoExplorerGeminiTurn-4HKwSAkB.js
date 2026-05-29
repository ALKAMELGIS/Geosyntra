import{buildGisContentLayersContext as te}from"./geoAiChatClaude-BQvs-4Mo.js";import{T as ne,a2 as oe,$ as ae,Y as Q,a0 as ie,a3 as se,a4 as le,a5 as re,a6 as ce,a7 as de,a8 as ue,a9 as pe,aa as ge,K,I as x,ab as C,ac as N,ad as me,ae as B,af as fe,ag as he,ah as ye,ai as $e,aj as Le,Z as Ee,_ as Ge,ak as xe,al as Me,am as be,an as ve,ao as Pe}from"./SatelliteIntelligenceMain-B791lGIs.js";import{ap as ot}from"./SatelliteIntelligenceMain-B791lGIs.js";import{g as Se}from"./geoExplorerGeminiApi-Bd2MZfzy.js";import{d as we}from"./intentDetector-Cg7MVrOW.js";import{readGeoSpatialMemory as _e,groundingSuggestionChipsFromMemory as Ce,writeGeoSpatialMemory as Ie}from"./spatialMemory-DwP1Bk4f.js";import"./apiGatewayClient-BznVXEnQ.js";import"./index-DSXKJo9q.js";import"./useSubscription-CtQRdj2R.js";import"./mapboxAccessToken-MtTxDnJM.js";import"./sentinelHubWmsCapabilities-41jISShh.js";import"./systemTokensApi-mnoStiKF.js";import"./index-aviX5Pxf.js";function Ae(e){if(!e)return"";const t=["### Geo Dataset Engine — AOI snapshot"];return e.label&&t.push(`- Label: ${e.label}`),e.bbox&&t.push(`- Bbox (W,S,E,N): ${e.bbox.map(h=>Number(h).toFixed(5)).join(", ")}`),e.areaHa!=null&&t.push(`- Area (ha): ${e.areaHa.toFixed(2)}`),e.timelineLabel&&t.push(`- Timeline: ${e.timelineLabel}`),e.layerId&&t.push(`- Layer: ${e.layerId}`),e.ndviMean!=null&&t.push(`- NDVI: mean ${e.ndviMean.toFixed(3)}${e.ndviMin!=null?`, min ${e.ndviMin.toFixed(3)}`:""}${e.ndviMax!=null?`, max ${e.ndviMax.toFixed(3)}`:""}`),t.length>1?t.join(`
`):""}function Re(e){return e.length?e.slice(0,8).map((t,h)=>{var a,s;const n=t.lat!=null&&t.lng!=null?` @ ${(a=t.lng)==null?void 0:a.toFixed(5)},${(s=t.lat)==null?void 0:s.toFixed(5)}`:"",o=t.rating!=null?` · rating ${t.rating}`:"";return`${h+1}. **${t.name||"Place"}** — ${t.address||"—"}${n}${o}`}).join(`
`):"(no places returned)"}function Oe(e){return e?`- Distance: ~${e.distanceMeters!=null?(e.distanceMeters/1e3).toFixed(1):"?"} km
- Duration: ${e.duration||"—"}
- Encoded polyline available: ${e.polyline?"yes":"no"}`:"(no route returned)"}function Te(e){var n;const t=[],h=Ae(e.engine.aoi);return h&&t.push(h),(n=e.engine.satelliteLayerSummary)!=null&&n.trim()&&t.push(`### Geo Dataset Engine — Live layers
${e.engine.satelliteLayerSummary.trim().slice(0,4e3)}`),e.engine.pinLngLat&&t.push(`### Session map anchor
WGS84: ${e.engine.pinLngLat[0].toFixed(5)}, ${e.engine.pinLngLat[1].toFixed(5)}`),t.push(`### GOOGLE MAPS GROUNDING (live)
Tools invoked: ${e.toolsUsed.join(", ")||"none"}
User query: ${e.engine.userText.slice(0,300)}`),e.places.length&&t.push(`**Places (text search)**
${Re(e.places)}`),e.geocodes.length&&t.push(`**Geocoding**
${e.geocodes.map((o,a)=>{var s,m;return`${a+1}. ${o.label} → ${(s=o.lng)==null?void 0:s.toFixed(5)},${(m=o.lat)==null?void 0:m.toFixed(5)}`}).join(`
`)}`),e.route&&t.push(`**Route**
${Oe(e.route)}`),e.elevations.length&&t.push(`**Elevation**
${e.elevations.map(o=>{var a,s,m;return`- ${(a=o.lat)==null?void 0:a.toFixed(5)},${(s=o.lng)==null?void 0:s.toFixed(5)} → ${(m=o.elevationMeters)==null?void 0:m.toFixed(1)} m`}).join(`
`)}`),t.join(`

`)}const Fe=`### Geo Explor AI Agent — Google Maps Platform grounding (Grounding Lite MCP layer)
When a **### GOOGLE MAPS GROUNDING (live)** block appears below, treat it as **authoritative** for places, routes, geocoding, and elevation at query time — not general web knowledge.

**Rules:**
- Cite place **names and addresses** exactly as listed; include ratings only when present in the block.
- For **routes**, summarize distance/duration from the block; do not invent turn-by-turn unless provided.
- Prefer grounding coordinates for MAP_QUERY when the user asked about a **specific grounded place** and layer data does not override.
- When grounding is empty or missing, say live Google Maps data was unavailable and continue with GIS/satellite context only.
- Combine with AOI / NDVI / raster blocks when both are present: separate **Places intelligence** vs **Remote sensing** sections.`;async function ke(e){var R,O;const t=await ne(),h=_e(),n=Ce(h);if(!t.configured)return{configured:!1,toolsUsed:[],contextBlock:"",suggestedChips:n,primaryCoords:e.pinLngLat??null,places:[]};const o=we(e.userText);if(!o.tools.length)return{configured:!0,toolsUsed:[],contextBlock:"",suggestedChips:n,primaryCoords:e.pinLngLat??null,places:[]};const a=[];let s=[];const m=[];let E=null,I=[],y=e.pinLngLat??null;const M=(R=e.pinLngLat)==null?void 0:R[1],b=(O=e.pinLngLat)==null?void 0:O[0];if(o.placesQuery&&o.tools.includes("places_text_search")){a.push("places_text_search"),s=await ae({textQuery:o.placesQuery,lat:M,lng:b});const c=s.find(f=>f.lat!=null&&f.lng!=null);c&&(y=[c.lng,c.lat])}if(o.geocodeQuery&&o.tools.includes("geocode")){a.push("geocode");const c=await Q(o.geocodeQuery);m.push(...c);const f=c.find(G=>G.lat!=null&&G.lng!=null);f&&(y=[f.lng,f.lat])}if(o.routeEndpoints&&o.tools.includes("compute_route")){a.push("compute_route");let c=o.routeEndpoints.destinationText,f=o.routeEndpoints.originText;!f&&M!=null&&b!=null&&(f=`${M},${b}`);const G=await Q(c),T=f?await Q(f):[],g=G[0],p=T[0];if((g==null?void 0:g.lat)!=null&&(g==null?void 0:g.lng)!=null&&(p==null?void 0:p.lat)!=null&&(p==null?void 0:p.lng)!=null){a.push("geocode");const S=await ie({origin:{lat:p.lat,lng:p.lng},destination:{lat:g.lat,lng:g.lng}});E=(S==null?void 0:S.route)??null,E&&(y=[g.lng,g.lat])}}if(o.wantsElevation&&o.tools.includes("elevation")){a.push("elevation");const c=y!=null?[{lat:y[1],lng:y[0]}]:M!=null&&b!=null?[{lat:M,lng:b}]:[];c.length&&(I=await oe(c))}const P=Te({engine:e,places:s,geocodes:m,route:E,elevations:I,toolsUsed:a});Ie({lastPlaces:s,lastCoords:y,lastQuery:e.userText.slice(0,200)});const A=[...n];for(const c of s.slice(0,2))c.name&&A.unshift(String(c.name).slice(0,42));return{configured:!0,toolsUsed:a,contextBlock:P,suggestedChips:[...new Set(A)].slice(0,8),primaryCoords:y,places:s,routePolyline:E==null?void 0:E.polyline}}function Ne(e,t){const n=(t[1]-e[1])*Math.PI/180,o=(t[0]-e[0])*Math.PI/180,a=e[1]*Math.PI/180,s=t[1]*Math.PI/180,m=Math.sin(n/2)*Math.sin(n/2)+Math.cos(a)*Math.cos(s)*Math.sin(o/2)*Math.sin(o/2);return 2*6371*Math.asin(Math.min(1,Math.sqrt(m)))}async function et(e){var j;const{apiKey:t,historyWithUser:h,userTextForMapFallback:n,primaryVectorLayers:o,mapboxAccessToken:a,openWeatherApiKey:s,pinLngLat:m,lastMapQueryCoords:E,inspectAnchorLngLat:I,mapPopup:y,addedLayersHeading:M,attachGisSavedLayers:b,extraSystemAppend:P,questionEditInPlace:A,groundingEnabled:R=!0,geoDatasetAoi:O,satelliteLayerSummary:c}=e,f=b===!0;let G,T="",g=null;if(R&&n.trim()){const l=await ke({userText:n,pinLngLat:m,aoi:O??null,satelliteLayerSummary:c});G={toolsUsed:l.toolsUsed,suggestedChips:l.suggestedChips,routePolyline:l.routePolyline},l.contextBlock&&(T=`

${Fe}

${l.contextBlock}`),g=l.primaryCoords}let p=[...o],S=`### GIS Content (saved layers)
(Not attached on this page — only layers on this map session are used.)`;if(f){const l=await se();p=[...o,...l.map(u=>({name:u.name,visible:u.visible,source:u.source,data:u.data,arcgisLayerDefinition:u.arcgisLayerDefinition}))],S=await te(22e3)}const V=le(o,2e4),v=n.trim().length>0?re(n,p):null;let W="";v&&v.score>=32&&(W=`

### RESOLVED LAYER FEATURE (authoritative for this user message)
The question matches **one** loaded vector feature. Answer using **only** this JSON for its attributes and treat the centroid as its map location—do not claim this id/code is missing from layers because the one-line "example attributes" sample showed a different row.
- Layer: ${v.layerName}
- Centroid WGS84 (longitude, latitude): ${v.lng}, ${v.lat}
- Attributes:
${v.matchSummary}`);const X=await ce({userText:n,pinLngLat:m,lastMapQueryCoords:E,inspectAnchorLngLat:I,combinedLayers:p,mapboxAccessToken:a,openWeatherApiKey:s,mapPopup:y}),z=P!=null&&P.trim()?`

${P.trim()}`:"",Z=`${Me}

${be}

${ve}

${Pe}${X}${W}${T}

---
${M}
${V}

${S}${A?`

### In-place question refinement
The user edited their latest question in the same thread (no new chat). Prior assistant replies after that question are not in this history. Answer only the **updated** wording: apply new field/layer/selection/stat instructions concisely. Skip greetings, recap, and generic onboarding.`:""}${z}`;let i=await Se({...t!=null&&t.trim()&&t!=="__gateway__"?{apiKey:t}:{},systemInstruction:Z,contents:de(h)});const F=ue(n,p),J=((j=n?pe(n,p):null)==null?void 0:j.trim())??"",U=v,r=U&&U.score>=ge?U:null;let L=K(i);if(F&&!r&&L&&(i=`${x(i).trimEnd()}

**Map:** MAP_QUERY was removed — no confident feature match in your active or GIS Content layers; the app will not move the map to an unrelated location.${C(N(n))}`,L=null),L&&!r){const l=me({userText:n,replyText:i,mapQueryCoords:L,strongLayerHit:r});if(!l.allow){const u=N(n);i=`${x(i).trimEnd()}`,i=B(i,u,"lowConfidenceMapQuery",l.confidence),i=`${i.trimEnd()}${C(u)}`,L=null}}let $=null,d=i,w="geocode";const q=l=>{const u=l.matchSummary.trim();return`

(Map pin from layer "${l.layerName}" — matched feature attributes: ${u.slice(0,200)}${u.length>200?"…":""})`};if(!!r&&(!!J||!!(L&&r&&Ne(L,[r.lng,r.lat])>2))&&r)$=[r.lng,r.lat],w="layer",d=`${x(i).trimEnd()}${q(r)}`;else if(L&&(!F||r))$=L,w="map_query",d=i;else if(n){if(r)$=[r.lng,r.lat],w="layer",d=`${i.trimEnd()}${q(r)}`;else if(fe(n,p)&&!(he(n)&&!ye(n))){const l=$e(Le(n));if(l.length>=2){const u=await Ee(l,{mapboxAccessToken:a}),{chosen:k,ambiguous:Y}=Ge(u),_=N(n);if(k&&!Y){$=[k.lng,k.lat],w="geocode";const D=k.label.replace(/\s+/g," ").trim().slice(0,160);d=`${x(i).trimEnd()}

(Map centered on "${D}" — geocoder confidence OK.)`}else if(u.length>=2&&Y){const D=u.slice(0,3).map(ee=>ee.label.split(",").slice(0,2).join(",").trim()).filter(Boolean);d=xe(x(i).trimEnd(),_,D)}else u.length?d=`${B(x(i).trimEnd(),_,"insufficientData").trimEnd()}${C(_)}`:d=`${B(x(i).trimEnd(),_,"cannotLocatePrecisely").trimEnd()}${C(_)}`}}else if(g&&!F)$=g,w="grounding",d=`${x(i).trimEnd()}

(Map centered on Google Maps grounded place.)`;else if(F){d=i.trimEnd();const l=N(n);/\b(not found|not available|no match|غير متوفر|لا توجد|لم يتم العثور)\b/i.test(d)||(d+=`

**Map:** No matching location in your layers — the map was not changed.${C(l)}`)}}$&&!K(d)&&(d=`${d.trimEnd()}
MAP_QUERY:${$[0]},${$[1]}`);const H={id:typeof crypto<"u"&&"randomUUID"in crypto?crypto.randomUUID():`geo-m-${Date.now()}`,role:"model",parts:[{type:"text",text:d}]};return $?{modelMsg:H,mapEffect:{coords:$,pinSource:w,layerHit:r,replyText:d},grounding:G}:{modelMsg:H,mapEffect:null,grounding:G}}export{ot as geoExplorerTargetZoomForPinSource,et as runGeoExplorerGeminiTurn};
