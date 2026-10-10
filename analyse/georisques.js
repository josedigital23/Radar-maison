// Géorisques — exécuter sur la page rapport2 (voir SKILL.md). Tourne en arrière-plan ; lire ensuite window.__G
window.__G = null; (async () => {
const P = window.P; // {lon, lat, insee}
const ll = P.lon + ',' + P.lat, B = 'https://www.georisques.gouv.fr/api/v1/';
const j = async u => { try { const r = await fetch(B + u); return r.ok ? await r.json() : {err: r.status}; } catch (e) { return {err: e.message}; } };
const kx = 111320 * Math.cos(P.lat * Math.PI / 180), d = (lo, la) => Math.round(Math.hypot((lo - P.lon) * kx, (la - P.lat) * 111320));
await new Promise(s => setTimeout(s, 5000));
const txt = (document.querySelector('main') || document.body).innerText;
const G = {};
G.cartes = [...txt.matchAll(/([A-ZÉÈÀÂÎÔÛÇ][A-ZÉÈÀÂÎÔÛÇ' ()\-]{3,})\s*\n+\s*à mon adresse :\s*\n+\s*([^\n]+)\n+\s*sur ma commune :\s*\n+\s*([^\n]+)/g)].map(m => `${m[1].trim()} — adresse : ${m[2].trim()} / commune : ${m[3].trim()}`);
G.catnat = ((await j(`gaspar/catnat?code_insee=${P.insee}&page_size=100`)).data || []).map(c => `${c.date_debut_evt} ${c.libelle_risque_jo}`);
const rga = await j(`rga?latlon=${ll}`); G.argiles = rga.exposition || rga.err;
G.radon = (await j(`radon?code_insee=${P.insee}`)).data?.[0]?.classe_potentiel;
const ic = (await j(`installations_classees?latlon=${ll}&rayon=5000&page_size=100`)).data || [];
const tag = i => { const r = (i.rubriques || []).map(x => x.numeroRubrique); const t = []; if (i.bovins || i.porcs || i.volailles || r.some(x => /^(2101|2102|2111|3660)/.test(x))) t.push('ÉLEVAGE' + (i.porcs ? ' porcs' : '') + (i.volailles ? ' volailles' : '') + (i.bovins ? ' bovins' : '')); if (r.some(x => /^2781/.test(x))) t.push('MÉTHANISATION'); if (r.some(x => /^2510/.test(x))) t.push('CARRIÈRE'); if (/seuil/i.test(i.statutSeveso || '')) t.push('SEVESO ' + i.statutSeveso); return t.join(', '); };
G.icpe_5km = ic.map(i => ({n: i.raisonSociale, d: d(+i.longitude, +i.latitude), r: i.regime, t: tag(i), act: i.codeNaf})).sort((a, b) => a.d - b.d).map(i => `${i.d} m · ${i.n} · ${i.r}${i.t ? ' · ' + i.t : ''}`);
const cs = (await j(`ssp/casias?latlon=${ll}&rayon=2000&page_size=50`)).data || [];
G.anciens_sites_industriels_2km = cs.map(c => `${c.geom ? d(...c.geom.coordinates) + ' m' : '?'} · ${c.nom_etablissement || ''} · ${c.statut || ''}`);
G.cavites_1km = ((await j(`cavites?latlon=${ll}&rayon=1000`)).data || []).length;
G.mouvements_terrain_1km = ((await j(`mvt?latlon=${ll}&rayon=1000`)).data || []).length;
window.__G = JSON.stringify(G);
})().catch(e => { window.__G = 'ERREUR ' + e.message; });
'lancé';
