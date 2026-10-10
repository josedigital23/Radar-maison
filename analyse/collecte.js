// Collecte Radar Maison — exécuter dans une page https://data.geopf.fr après avoir défini window.P. Tourne en arrière-plan ; résultat dans window.__R
window.__R = null; (async () => {
const P = window.P; // {lon, lat, insee, surf, dpe, dest: {travail:{nom,c}, sport:{nom,c}, ref:{nom,c}}, exclureSalle: 'regex'}
const j = async (u, o) => { try { const r = await fetch(u, o); return r.ok ? await r.json() : {err: r.status}; } catch (e) { return {err: e.message}; } };
const kx = 111320 * Math.cos(P.lat * Math.PI / 180), ky = 111320, H = [P.lon, P.lat];
const dist = (a, b) => Math.round(Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky));
const first = g => { let c = g.coordinates; while (Array.isArray(c[0])) c = c[0]; return c; };
const verts = g => { const o = []; const w = c => Array.isArray(c[0]) ? c.forEach(w) : o.push(c); w(g.coordinates); return o; };
const md0 = g => Math.min(...verts(g).map(c => dist(c, H)));
const inPoly = (p, g) => { if (!g) return false; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return polys.some(poly => { const r = poly[0]; let ins = false; for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const [xi, yi] = r[i], [xk, yk] = r[k]; if ((yi > p[1]) !== (yk > p[1]) && p[0] < (xk - xi) * (p[1] - yi) / (yk - yi) + xi) ins = !ins; } return ins; }); };
const route = async to => { const r = await j(`https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&start=${P.lon},${P.lat}&end=${to[0]},${to[1]}&profile=car&optimization=fastest&getSteps=false&getBbox=false&distanceUnit=kilometer&timeUnit=minute&geometryFormat=polyline`); return r.err ? null : {min: Math.round(r.duration), km: +r.distance.toFixed(1)}; };
const bbox = R => { const a = R / ky, b = R / kx; return `${P.lat - a},${P.lon - b},${P.lat + a},${P.lon + b},urn:ogc:def:crs:EPSG::4326`; };
const wfs = (t, R) => j(`https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=BDTOPO_V3:${t}&outputFormat=application/json&BBOX=${bbox(R)}&count=3000`);
const best = async (list, n = 3) => { const c = list.map(x => ({...x, d: dist(x.c, H)})).sort((a, b) => a.d - b.d).slice(0, n); let b = null; for (const x of c) { const r = await route(x.c); if (r && (!b || r.min < b.min)) b = {dest: x.nom, ...r}; } return b; };
const O = {};
const pt = encodeURIComponent(JSON.stringify({type: 'Point', coordinates: H}));

// 1. Parcelle, urbanisme, servitudes
const pa = await j('https://apicarto.ign.fr/api/cadastre/parcelle?geom=' + pt);
const parc = pa.features?.[0];
O.parcelle = parc ? `${parc.properties.section} ${parc.properties.numero} · ${parc.properties.contenance} m²` : pa.err;
const zu = await j('https://apicarto.ign.fr/api/gpu/zone-urba?geom=' + pt);
O.plu = zu.features?.map(f => `${f.properties.libelle} (${f.properties.libelong || ''})`).join(' / ') || 'aucun zonage numérisé';
const buf = encodeURIComponent(JSON.stringify({type: 'Polygon', coordinates: [[[P.lon - 600 / kx, P.lat - 600 / ky], [P.lon + 600 / kx, P.lat - 600 / ky], [P.lon + 600 / kx, P.lat + 600 / ky], [P.lon - 600 / kx, P.lat + 600 / ky], [P.lon - 600 / kx, P.lat - 600 / ky]]]}));
const sup = [...((await j('https://apicarto.ign.fr/api/gpu/assiette-sup-s?geom=' + buf)).features || []), ...((await j('https://apicarto.ign.fr/api/gpu/assiette-sup-l?geom=' + buf)).features || [])];
O.servitudes_600m = [...new Set(sup.map(f => `${f.properties.suptype || ''} ${f.properties.nomass || ''}`.trim()))];

// 2. DPE
const dq = P.dpe ? `numero_dpe:${P.dpe}` : `code_insee_ban:${P.insee}`;
const dp = (await j(`https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines?qs=${encodeURIComponent(dq)}&size=1`)).results?.[0];
if (dp) { const k = ['numero_dpe','date_etablissement_dpe','adresse_ban','etiquette_dpe','etiquette_ges','surface_habitable_logement','periode_construction','annee_construction','type_energie_principale_chauffage','description_installation_chauffage_n1','type_energie_n1','conso_5_usages_ef_energie_n1','type_energie_n2','conso_5_usages_ef_energie_n2','besoin_chauffage','cout_total_5_usages','qualite_isolation_murs','qualite_isolation_plancher_bas','qualite_isolation_plancher_haut_comble_perdu','qualite_isolation_menuiseries','type_ventilation','indicateur_confort_ete','production_electricite_pv_kwhep_par_an']; O.dpe = Object.fromEntries(k.filter(x => dp[x] != null).map(x => [x, dp[x]])); }

// 3. Trajets fixes
O.trajets = {};
for (const [k, v] of Object.entries(P.dest || {})) O.trajets[k] = {dest: v.nom, ...(await route(v.c))};

// 4. Écoles publiques proches (élémentaire)
const ed = await j(`https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records?where=${encodeURIComponent(`within_distance(position,geom'POINT(${P.lon} ${P.lat})',15km) and type_etablissement="Ecole" and ecole_elementaire=1`)}&limit=40&select=nom_etablissement,nom_commune,statut_public_prive,latitude,longitude`);
O.trajets.ecole = await best((ed.results || []).filter(e => e.statut_public_prive === 'Public').map(e => ({nom: `${e.nom_etablissement}, ${e.nom_commune}`, c: [+e.longitude, +e.latitude]})));

// 5. Commerces et salles (annuaire des entreprises, établissements actifs par code NAF)
const ent = async (naf, rad) => { const o = []; for (const p of [1, 2]) { const d = await j(`https://recherche-entreprises.api.gouv.fr/near_point?lat=${P.lat}&long=${P.lon}&radius=${rad}&activite_principale=${naf}&per_page=25&page=${p}`); (d.results || []).forEach(e => (e.matching_etablissements || []).filter(x => x.etat_administratif === 'A' && x.latitude).forEach(x => o.push({nom: `${e.nom_complet}, ${x.libelle_commune}`, c: [+x.longitude, +x.latitude]}))); if ((d.total_pages || 1) <= p) break; } return o; };
O.trajets.supermarche = await best(await ent('47.11D,47.11F', 20));
O.trajets.depannage = await best(await ent('47.11B,47.11C,10.71C,10.71D', 10));
O.trajets.autre_salle = await best((await ent('93.13Z', 15)).filter(x => !(P.exclureSalle && new RegExp(P.exclureSalle, 'i').test(x.nom))));
const cp = (await wfs('construction_ponctuelle', 5000)).features || [];
O.eoliennes_antennes_5km = cp.filter(f => /olienne|Antenne/i.test(f.properties.nature)).map(f => `${f.properties.nature} ${md0(f.geometry)} m`).slice(0, 8);

// 6. Bâti IGN : isolement, bâtiments agricoles, lignes HT, routes, voie ferrée
const bt = (await wfs('batiment', 1000)).features || [];
const own = bt.filter(f => inPoly(first(f.geometry), parc?.geometry));
const refB = own.find(f => f.properties.usage_1 === 'Résidentiel') || own[0];
const H2 = refB ? first(refB.geometry) : H; // distances mesurées depuis la maison, pas depuis le point d'adresse
const md = g => Math.min(...verts(g).map(c => dist(c, H2)));
const oth = bt.filter(f => !own.includes(f)).map(f => ({u: f.properties.usage_1, n: f.properties.nature, d: md(f.geometry)})).sort((a, b) => a.d - b.d);
const res = oth.filter(x => x.u === 'Résidentiel');
O.isolement = {batiments_sur_parcelle: own.map(f => `${f.properties.usage_1}/${f.properties.nature}`), voisin_m: res[0]?.d ?? null, maisons_100m: res.filter(x => x.d < 100).length, maisons_250m: res.filter(x => x.d < 250).length};
O.agricoles_1km = oth.filter(x => x.u === 'Agricole').slice(0, 6).map(x => x.d + ' m');
const le = (await wfs('ligne_electrique', 1500)).features || [];
O.lignes_electriques_1500m = le.map(f => `${f.properties.voltage || '?'} à ${md(f.geometry)} m`);
const rt = ((await wfs('troncon_de_route', 600)).features || []).filter(f => ['1', '2', '3'].includes(String(f.properties.importance)));
const rmin = {}; rt.forEach(f => { const k = `${f.properties.cpx_numero || f.properties.nature} (importance ${f.properties.importance})`; rmin[k] = Math.min(rmin[k] ?? 1e9, md(f.geometry)); });
O.routes_importantes = Object.entries(rmin).map(([k, v]) => `${k} à ${v} m`);
const vf = (await wfs('troncon_de_voie_ferree', 1500)).features || [];
O.voie_ferree = vf.length ? Math.min(...vf.map(f => md(f.geometry))) + ' m' : 'aucune à moins de 1,5 km';

// 7. Carburants (15 km)
const cb = (await j(`https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?where=${encodeURIComponent(`within_distance(geom, geom'POINT(${P.lon} ${P.lat})', 15km)`)}&limit=50&select=ville,e85_prix,e10_prix`)).results || [];
const mini = k => { const v = cb.filter(s => s[k]).sort((a, b) => a[k] - b[k])[0]; return v ? `${v[k]} € (${v.ville})` : null; };
O.carburants = {e85: mini('e85_prix'), e10: mini('e10_prix')};

// 8. Taxe foncière, eau potable
const tf = (await j(`https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fiscalite-locale-des-particuliers/records?where=insee_com%3D%22${P.insee}%22&order_by=exercice%20desc&limit=1&select=exercice,taux_global_tfb,taux_plein_teom`)).results?.[0];
O.taxe_fonciere = tf ? `taux global TFB ${tf.taux_global_tfb} % (${tf.exercice})${tf.taux_plein_teom ? ', TEOM ' + tf.taux_plein_teom + ' %' : ''}` : null;
const eau = (await j(`https://hubeau.eaufrance.fr/api/v1/qualite_eau_potable/resultats_dis?code_commune=${P.insee}&size=500&fields=date_prelevement,conformite_limites_bact_prelevement,conformite_limites_pc_prelevement`)).data || [];
const pr = new Map(); eau.forEach(r => pr.set(r.date_prelevement, r));
const pv = [...pr.values()];
O.eau_potable = `${pv.length} prélèvements, ${pv.filter(r => r.conformite_limites_bact_prelevement === 'N' || r.conformite_limites_pc_prelevement === 'N').length} non conformes (dernier : ${pv[0]?.date_prelevement?.slice(0, 10) || '?'})`;

// 9. DVF : maisons vendues dans la commune (5 ans), comparables 0,6–1,6 × surface
const dv = (await j(`https://apicarto.ign.fr/api/cadastre/division?code_insee=${P.insee}`)).features || [];
const secs = [...new Set(dv.map(f => f.properties.section.padStart(5, '0')))];
const muts = (await Promise.all(secs.map(s => j(`https://app.dvf.etalab.gouv.fr/api/mutations3/${P.insee}/${s}`)))).flatMap(r => r.mutations || []);
const by = new Map();
for (const m of muts) { if (m.nature_mutation !== 'Vente') continue; const x = by.get(m.id_mutation) || {date: m.date_mutation, valeur: +m.valeur_fonciere, surface: 0, terrain: 0, maisons: 0, parcelles: new Set()}; if (m.type_local === 'Maison') { x.surface += +m.surface_reelle_bati || 0; x.maisons++; } x.terrain = Math.max(x.terrain, +m.surface_terrain || 0); x.parcelles.add(m.id_parcelle); by.set(m.id_mutation, x); }
const ventes = [...by.values()].filter(x => x.maisons === 1 && x.surface > 0 && x.valeur / x.surface >= 400); // < 400 €/m² = vente non marchande probable
O.dvf = {ventes_maisons: ventes.length,
  comparables: ventes.filter(x => x.surface >= P.surf * .6 && x.surface <= P.surf * 1.6).map(x => ({date: x.date, valeur: x.valeur, surface: x.surface, terrain: x.terrain, eur_m2: Math.round(x.valeur / x.surface)})).sort((a, b) => b.date.localeCompare(a.date)),
  ventes_de_cette_parcelle: parc ? [...by.values()].filter(x => x.parcelles.has(parc.properties.idu)).map(x => `${x.date} ${x.valeur} €`) : []};
window.__R = JSON.stringify(O);
})().catch(e => { window.__R = 'ERREUR ' + e.message; });
'lancé';
