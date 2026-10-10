// Risques via le BRGM (mapsref.brgm.fr) — fonctionne quand Géorisques est inaccessible.
// À exécuter dans une page https://data.geopf.fr après avoir défini window.P = {lon, lat}. Résultat dans window.__K.
// Validé le 10/10/2026 : argiles « 3 » à Saint-Aubin-en-Charollais = « exposition forte » chez Géorisques.
window.__K = null; (async () => {
const P = window.P, lat = P.lat, lon = P.lon, kx = 111320 * Math.cos(lat * Math.PI / 180);
const B = 'https://mapsref.brgm.fr/wxs/georisques/risques?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:';
const box = R => `${lat - R / 111320},${lon - R / kx},${lat + R / 111320},${lon + R / kx},urn:ogc:def:crs:EPSG::4326`;
const gj = async (tn, R) => { try { return (await (await fetch(`${B}${tn}&BBOX=${box(R)}&COUNT=50&OUTPUTFORMAT=geojson`)).json()).features || []; } catch (e) { return null; } };
const hits = async (tn, R) => { try { const t = await (await fetch(`${B}${tn}&BBOX=${box(R)}&RESULTTYPE=hits`)).text(); const m = t.match(/numberMatched="(\d+)"/); return m ? +m[1] : null; } catch (e) { return null; } };
const gml = async (tn, R) => { try { return (await (await fetch(`${B}${tn}&BBOX=${box(R)}`)).text()).split(`<ms:${tn}`).slice(1); } catch (e) { return []; } };
const dist = s => { const p = (s.match(/<gml:pos>([^<]+)</) || [])[1]?.split(' ').map(Number); return p ? Math.round(Math.hypot((p[1] - lon) * kx, (p[0] - lat) * 111320)) : null; };
const K = {};
const rga = await gj('ALEARG_REALISE', 15);
K.argiles = rga === null ? 'inconnu (BRGM injoignable)' : rga.length ? ({1: 'faible', 2: 'moyenne', 3: 'forte'}[Math.max(...rga.map(f => +f.properties.id))] || 'niveau ' + rga[0].properties.id) : 'non cartographiée (exposition nulle ou négligeable)';
const nap = await gj('REMNAPPE_FIAB', 15);
K.remontee_nappe = nap === null ? 'inconnu' : [...new Set(nap.map(f => f.properties.classe))].join(' / ') || 'hors zone cartographiée';
K.zone_inondable_potentielle_EAIP = await hits('EAIP_CE_GE', 15);
K.perimetre_PPR_inondation = await hits('PPRN_PERIMETRE_INOND', 15);
K.cavites_1km = (await gml('CAVITE_LOCALISEE', 1000)).map(s => `${dist(s)} m (${(s.match(/<ms:type_cavite>([^<]*)</) || [])[1] || '?'})`).sort((a, b) => parseInt(a) - parseInt(b));
K.mouvements_terrain_1km = (await gml('MVT_LOCALISE', 1000)).map(s => `${dist(s)} m`);
K.sites_pollues_2km = (await hits('SSP_INSTR_GE_POINT', 2000)) ?? '?';
K.secteurs_info_sols_2km = (await hits('SSP_CLASSIF_SIS_GE', 2000)) ?? '?';
try { const d = 0.0005, t = await (await fetch(`https://mapsref.brgm.fr/wxs/georisques/risques?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=risq_zonage_sismique&QUERY_LAYERS=risq_zonage_sismique&STYLES=&CRS=EPSG:4326&BBOX=${lat - d},${lon - d},${lat + d},${lon + d}&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=text/plain`)).text(); K.seisme = (t.match(/zone_sismicite = '([^']+)'/) || [])[1] || 'inconnu'; } catch (e) { K.seisme = 'inconnu'; }
K.radon = 'non disponible hors Géorisques';
window.__K = JSON.stringify(K);
})().catch(e => { window.__K = 'ERREUR ' + e.message; });
'lancé';
