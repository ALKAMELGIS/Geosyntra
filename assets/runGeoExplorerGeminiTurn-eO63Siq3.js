import{av as b,Z as v,aw as C,ax as w,w as O}from"./index-BRX3RgpL.js";import{d as Q,s as U,h as B,i as D}from"./GeoExplorerGeminiChatBody-DqMsge5I.js";import{g as k,a as F,p as $,s as H,G as N,b as W,c as q}from"./geoExplorerGemini-tCfmRZ13.js";function K(n,l){const a=(l[1]-n[1])*Math.PI/180,i=(l[0]-n[0])*Math.PI/180,d=n[1]*Math.PI/180,y=l[1]*Math.PI/180,u=Math.sin(a/2)*Math.sin(a/2)+Math.cos(d)*Math.cos(y)*Math.sin(i/2)*Math.sin(i/2);return 2*6371*Math.asin(Math.min(1,Math.sqrt(u)))}async function j(n){var G;const{apiKey:l,historyWithUser:h,userTextForMapFallback:a,primaryVectorLayers:i,mapboxAccessToken:d,openWeatherApiKey:y,pinLngLat:u,lastMapQueryCoords:x,mapPopup:I,addedLayersHeading:S,attachGisSavedLayers:P}=n,R=P===!0;let f=[...i],L=`### GIS Content (saved layers from GIS Map)
(Not attached on this page — open **GIS Map** → Geo AI to use layers saved in IndexedDB.)`;if(R){const s=await b();f=[...i,...s.map(t=>({name:t.name,visible:t.visible,source:t.source,data:t.data,arcgisLayerDefinition:t.arcgisLayerDefinition}))],L=await v(22e3)}const _=C(i,2e4);let g=`

${N}`;g+=await Q({userText:a,pinLngLat:u,lastMapQueryCoords:x,combinedLayers:f,mapboxAccessToken:d,openWeatherApiKey:y,mapPopup:I});const T=`${W}

${q}${g}

---
${S}
${_}

${L}`,c=await k({apiKey:l,systemInstruction:T,contents:F(h)}),p=$(c),A=((G=a?w(a):null)==null?void 0:G.trim())??"",e=a.trim().length>0?O(a,f):null;let o=null,r=c,m="geocode";const M=s=>{const t=s.matchSummary.trim();return`

(Map pin from layer "${s.layerName}" — matched feature attributes: ${t.slice(0,200)}${t.length>200?"…":""})`};if(!!e&&(!!A||!!(p&&e&&K(p,[e.lng,e.lat])>2&&e.score>=22))&&e)o=[e.lng,e.lat],m="layer",r=`${H(c).trimEnd()}${M(e)}`;else if(p)o=p,m="map_query",r=c;else if(a)if(e)o=[e.lng,e.lat],m="layer",r=`${c.trimEnd()}${M(e)}`;else{const s=U(B(a));if(s.length>=2){const t=await D(s,{mapboxAccessToken:d});t&&(o=t,m="geocode",r=`${c.trimEnd()}

(Map centered on the best place-name match for your message.)`)}}o&&!$(r)&&(r=`${r.trimEnd()}
MAP_QUERY:${o[0]},${o[1]}`);const E={id:typeof crypto<"u"&&"randomUUID"in crypto?crypto.randomUUID():`geo-m-${Date.now()}`,role:"model",parts:[{type:"text",text:r}]};return o?{modelMsg:E,mapEffect:{coords:o,pinSource:m,layerHit:e,replyText:r}}:{modelMsg:E,mapEffect:null}}function J(n){return n==="layer"?17:n==="map_query"?15.75:13.65}export{J as geoExplorerTargetZoomForPinSource,j as runGeoExplorerGeminiTurn};
