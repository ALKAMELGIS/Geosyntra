import{l as b,$ as A,aw as C,ax as O,x as Q}from"./index-ByJrRHCq.js";import{e as U,s as w,h as k,i as B}from"./GeoExplorerGeminiChatBody-DGMS41T_.js";import{g as D,a as F,p as $,s as v,G as H,b as W,c as N}from"./geoExplorerGemini-fXalC-8m.js";function q(n,i){const a=(i[1]-n[1])*Math.PI/180,c=(i[0]-n[0])*Math.PI/180,p=n[1]*Math.PI/180,y=i[1]*Math.PI/180,u=Math.sin(a/2)*Math.sin(a/2)+Math.cos(p)*Math.cos(y)*Math.sin(c/2)*Math.sin(c/2);return 2*6371*Math.asin(Math.min(1,Math.sqrt(u)))}async function Z(n){var M;const{apiKey:i,historyWithUser:f,userTextForMapFallback:a,primaryVectorLayers:c,mapboxAccessToken:p,openWeatherApiKey:y,pinLngLat:u,lastMapQueryCoords:x,mapPopup:G,addedLayersHeading:P}=n,R=await b(),L=[...c,...R.map(t=>({name:t.name,visible:t.visible,source:t.source,data:t.data,arcgisLayerDefinition:t.arcgisLayerDefinition}))],_=await A(22e3),T=C(c,2e4);let g=`

${H}`;g+=await U({userText:a,pinLngLat:u,lastMapQueryCoords:x,combinedLayers:L,mapboxAccessToken:p,openWeatherApiKey:y,mapPopup:G});const S=`${W}

${N}${g}

---
${P}
${T}

${_}`,s=await D({apiKey:i,systemInstruction:S,contents:F(f)}),d=$(s),I=((M=a?O(a):null)==null?void 0:M.trim())??"",e=a.trim().length>0?Q(a,L):null;let r=null,o=s,l="geocode";const h=t=>{const m=t.matchSummary.trim();return`

(Map pin from layer "${t.layerName}" — matched feature attributes: ${m.slice(0,200)}${m.length>200?"…":""})`};if(!!e&&(!!I||!!(d&&e&&q(d,[e.lng,e.lat])>2&&e.score>=22))&&e)r=[e.lng,e.lat],l="layer",o=`${v(s).trimEnd()}${h(e)}`;else if(d)r=d,l="map_query",o=s;else if(a)if(e)r=[e.lng,e.lat],l="layer",o=`${s.trimEnd()}${h(e)}`;else{const t=w(k(a));if(t.length>=2){const m=await B(t,{mapboxAccessToken:p});m&&(r=m,l="geocode",o=`${s.trimEnd()}

(Map centered on the best place-name match for your message.)`)}}r&&!$(o)&&(o=`${o.trimEnd()}
MAP_QUERY:${r[0]},${r[1]}`);const E={id:typeof crypto<"u"&&"randomUUID"in crypto?crypto.randomUUID():`geo-m-${Date.now()}`,role:"model",parts:[{type:"text",text:o}]};return r?{modelMsg:E,mapEffect:{coords:r,pinSource:l,layerHit:e,replyText:o}}:{modelMsg:E,mapEffect:null}}function j(n){return n==="layer"?17:n==="map_query"?15.75:13.65}export{j as geoExplorerTargetZoomForPinSource,Z as runGeoExplorerGeminiTurn};
