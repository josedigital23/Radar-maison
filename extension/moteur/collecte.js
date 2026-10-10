/* Radar Maison — collecte des données publiques autour d'un bien.

   Une seule collecte, deux usages : l'extension (les appels passent par le script de fond)
   et la console ou les tests (appels directs). Tout passe par `io` :
     io.json(url)  → l'objet JSON, ou {err}
     io.texte(url) → le texte, ou null
   Rien d'inventé : une donnée qu'on n'a pas obtenue vaut null, jamais 0 ni "non".

   Entrée P : { lon, lat, insee, dpe (numéro), surf (m², DPE de préférence),
                dest: { travail: { nom, c:[lon,lat] } }, exclureSalle: 'regex' }
   onPartie(nom, O) est appelé à chaque bloc terminé : l'interface se remplit au fil de l'eau. */

(function (g) {
  const M = g.RadarMoteur = g.RadarMoteur || {};

  M.collecter = async function (P, io, onPartie, options) {
    const opt = options || {};
    const veut = nom => !opt.parties || opt.parties.includes(nom);
    const j = async u => { try { const r = await io.json(u); return r == null ? { err: 'vide' } : r; } catch (e) { return { err: String(e) }; } };
    const enc = encodeURIComponent;
    const kx = 111320 * Math.cos(P.lat * Math.PI / 180), ky = 111320, H = [P.lon, P.lat];
    const dist = (a, b) => Math.round(Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky));
    const first = gm => { let c = gm.coordinates; while (Array.isArray(c[0])) c = c[0]; return c; };
    const verts = gm => { const o = []; const w = c => Array.isArray(c[0]) ? c.forEach(w) : o.push(c); w(gm.coordinates); return o; };
    const inPoly = (p, gm) => {
      if (!gm) return false;
      const polys = gm.type === 'Polygon' ? [gm.coordinates] : gm.coordinates;
      return polys.some(poly => { const r = poly[0]; let ins = false;
        for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const [xi, yi] = r[i], [xk, yk] = r[k];
          if ((yi > p[1]) !== (yk > p[1]) && p[0] < (xk - xi) * (p[1] - yi) / (yk - yi) + xi) ins = !ins; }
        return ins; });
    };
    const bbox = R => { const a = R / ky, b = R / kx; return `${P.lat - a},${P.lon - b},${P.lat + a},${P.lon + b},urn:ogc:def:crs:EPSG::4326`; };
    const wfs = (t, R) => j(`https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=BDTOPO_V3:${t}&outputFormat=application/json&BBOX=${bbox(R)}&count=3000`);
    const route = async to => {
      const r = await j(`https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&start=${P.lon},${P.lat}&end=${to[0]},${to[1]}&profile=car&optimization=fastest&getSteps=false&getBbox=false&distanceUnit=kilometer&timeUnit=minute&geometryFormat=polyline`);
      return (r.err || r.duration == null) ? null : { min: Math.round(r.duration), km: +(+r.distance).toFixed(1) };
    };
    const best = async (list, n = 3) => {
      const c = list.map(x => ({ ...x, d: dist(x.c, H) })).sort((a, b) => a.d - b.d).slice(0, n);
      const rs = await Promise.all(c.map(x => route(x.c)));
      let b = null; rs.forEach((r, i) => { if (r && (!b || r.min < b.min)) b = { dest: c[i].nom, ...r }; });
      return b;
    };
    const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const O = { erreurs: [] };
    const fin = (nom) => { if (onPartie) try { onPartie(nom, O); } catch (e) {} };
    const pt = enc(JSON.stringify({ type: 'Point', coordinates: H }));
    const echec = (nom, r) => { if (r && r.err) O.erreurs.push(`${nom} : ${r.err}`); };

    /* ---------- 1. Parcelle, puis le bâti (qui en a besoin) ---------- */
    const pParcelle = (async () => {
      const pa = await j('https://apicarto.ign.fr/api/cadastre/parcelle?geom=' + pt); echec('parcelle', pa);
      const parc = pa.features && pa.features[0];
      O.parcelle = parc ? { section: parc.properties.section, numero: parc.properties.numero, idu: parc.properties.idu,
        contenance: +parc.properties.contenance || null } : null;
      fin('parcelle');
      return parc;
    })();

    const pUrba = veut('urbanisme') ? (async () => {
      const zu = await j('https://apicarto.ign.fr/api/gpu/zone-urba?geom=' + pt); echec('PLU', zu);
      O.plu = zu.err ? null : (zu.features || []).map(f => ({ libelle: f.properties.libelle, libelong: f.properties.libelong || '', typezone: f.properties.typezone || '' }));
      const R = 600;
      const buf = enc(JSON.stringify({ type: 'Polygon', coordinates: [[[P.lon - R / kx, P.lat - R / ky], [P.lon + R / kx, P.lat - R / ky], [P.lon + R / kx, P.lat + R / ky], [P.lon - R / kx, P.lat + R / ky], [P.lon - R / kx, P.lat - R / ky]]] }));
      const [s1, s2] = await Promise.all([j('https://apicarto.ign.fr/api/gpu/assiette-sup-s?geom=' + buf), j('https://apicarto.ign.fr/api/gpu/assiette-sup-l?geom=' + buf)]);
      O.servitudes = (s1.err && s2.err) ? null : [...new Set([...(s1.features || []), ...(s2.features || [])]
        .map(f => `${(f.properties.suptype || '').toUpperCase()}|${f.properties.nomass || f.properties.nomsuplitt || ''}`))]
        .map(x => { const [code, nom] = x.split('|'); return { code, nom }; });
      fin('urbanisme');
    })() : null;

    /* ---------- 2. DPE du bien, puis son historique à l'adresse ---------- */
    const pDpe = (async () => {
      const dp = P.dpe ? ((await j(`https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines?qs=${enc(`numero_dpe:"${P.dpe}"`)}&size=1`)).results || [])[0] : null;
      if (dp) {
        const k = ['numero_dpe', 'date_visite_diagnostiqueur', 'date_etablissement_dpe', 'adresse_ban', 'nom_rue_ban', 'code_postal_ban', 'etiquette_dpe', 'etiquette_ges',
          'surface_habitable_logement', 'periode_construction', 'annee_construction', 'type_energie_principale_chauffage', 'description_installation_chauffage_n1',
          'conso_5_usages_par_m2_ep', 'cout_total_5_usages', 'qualite_isolation_murs', 'qualite_isolation_menuiseries', 'type_ventilation', 'indicateur_confort_ete'];
        O.dpe = Object.fromEntries(k.filter(x => dp[x] != null).map(x => [x, dp[x]]));
      } else O.dpe = null;
      fin('dpe');
      // Historique : les autres DPE à la même adresse (avant/après travaux)
      const rev = ((await j(`https://api-adresse.data.gouv.fr/reverse/?lon=${P.lon}&lat=${P.lat}&limit=1`)).features || [])[0];
      const rp = rev ? rev.properties : {};
      O.adresse_ban = rp.label || null;
      const adr = (dp && dp.adresse_ban) || rp.label || '';
      const num = (adr.match(/^(\d+)/) || [])[1], rue = (dp && dp.nom_rue_ban) || rp.street || '';
      /* Deux pièges de l'ancienne base (vérifiés le 10/10/2026, Paray) : code_insee_commune_actualise contient
         tantôt l'INSEE, tantôt le code postal ; geo_adresse n'accepte que l'adresse entière exacte.
         D'où champ:(A OR B) et la recherche du numéro + rue en texte libre. */
      const cp = (dp && dp.code_postal_ban) || rp.postcode || '';
      const [h1, h2] = await Promise.all([
        adr ? j(`https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines?qs=${enc(`adresse_ban:"${adr}"`)}&size=20&select=numero_dpe,date_visite_diagnostiqueur,date_etablissement_dpe,etiquette_dpe,surface_habitable_logement,type_energie_principale_chauffage`) : { results: [] },
        (num && rue) ? j(`https://data.ademe.fr/data-fair/api/v1/datasets/dpe-france/lines?qs=${enc(`code_insee_commune_actualise:(${P.insee}${cp ? ' OR ' + cp : ''}) AND "${num} ${rue}"`)}&size=20&select=numero_dpe,date_etablissement_dpe,classe_consommation_energie,surface_thermique_lot,geo_adresse`) : { results: [] }
      ]);
      O.historique_dpe = [
        ...(h1.results || []).map(x => ({ date: x.date_visite_diagnostiqueur || x.date_etablissement_dpe, etiquette: x.etiquette_dpe, surface: x.surface_habitable_logement, numero: x.numero_dpe, base: 'récente' })),
        ...(h2.results || []).filter(x => norm(x.geo_adresse).startsWith(norm(num + ' ' + rue)))
          .map(x => ({ date: x.date_etablissement_dpe, etiquette: x.classe_consommation_energie, surface: x.surface_thermique_lot, numero: x.numero_dpe, base: 'ancienne' }))
      ].filter(x => x.date).sort((a, b) => a.date.localeCompare(b.date));
      fin('historique');
    })();

    /* ---------- 3. Trajets ---------- */
    const pTrajets = veut('trajets') ? (async () => {
      O.trajets = {};
      const ent = async (naf, rad) => {
        const o = [];
        for (const p of [1, 2]) {
          const d = await j(`https://recherche-entreprises.api.gouv.fr/near_point?lat=${P.lat}&long=${P.lon}&radius=${rad}&activite_principale=${naf}&per_page=25&page=${p}`);
          (d.results || []).forEach(e => (e.matching_etablissements || []).filter(x => x.etat_administratif === 'A' && x.latitude)
            .forEach(x => o.push({ nom: `${e.nom_complet}, ${x.libelle_commune}`, c: [+x.longitude, +x.latitude] })));
          if ((d.total_pages || 1) <= p) break;
        }
        return o;
      };
      const taches = Object.entries(P.dest || {}).map(async ([k, v]) => { const r = v && v.c ? await route(v.c) : null; O.trajets[k] = r ? { dest: v.nom, ...r } : null; });
      taches.push((async () => {
        const ed = await j(`https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records?where=${enc(`within_distance(position,geom'POINT(${P.lon} ${P.lat})',15km) and type_etablissement="Ecole" and ecole_elementaire=1`)}&limit=40&select=nom_etablissement,nom_commune,statut_public_prive,latitude,longitude`);
        O.trajets.ecole = await best((ed.results || []).filter(e => e.statut_public_prive === 'Public').map(e => ({ nom: `${e.nom_etablissement}, ${e.nom_commune}`, c: [+e.longitude, +e.latitude] })));
      })());
      taches.push((async () => { O.trajets.supermarche = await best(await ent('47.11D,47.11F', 20)); })());
      taches.push((async () => { O.trajets.depannage = await best(await ent('47.11B,47.11C,10.71C,10.71D', 10)); })());
      taches.push((async () => {
        const ex = P.exclureSalle ? new RegExp(P.exclureSalle, 'i') : null;
        O.trajets.autre_salle = await best((await ent('93.13Z', 15)).filter(x => !(ex && ex.test(x.nom))));
      })());
      await Promise.all(taches);
      fin('trajets');
    })() : null;

    /* ---------- 4. Bâti IGN autour de la maison ---------- */
    const pBati = veut('environnement') ? (async () => {
      const parc = await pParcelle;
      const [bt, cp, le, rt, vf] = await Promise.all([wfs('batiment', 1000), wfs('construction_ponctuelle', 5000), wfs('ligne_electrique', 1500), wfs('troncon_de_route', 600), wfs('troncon_de_voie_ferree', 1500)]);
      echec('bâti IGN', bt);
      const bats = bt.features || [];
      const own = bats.filter(f => inPoly(first(f.geometry), parc && parc.geometry));
      const refB = own.find(f => f.properties.usage_1 === 'Résidentiel') || own[0];
      const H2 = refB ? first(refB.geometry) : H;   // distances mesurées depuis la maison, pas depuis le point d'adresse
      const md = gm => Math.min(...verts(gm).map(c => dist(c, H2)));
      const oth = bats.filter(f => !own.includes(f)).map(f => ({ u: f.properties.usage_1, d: md(f.geometry) })).sort((a, b) => a.d - b.d);
      const res = oth.filter(x => x.u === 'Résidentiel');
      O.isolement = bt.err ? null : { batiments_sur_parcelle: own.length, voisin_m: res.length ? res[0].d : null,
        maisons_100m: res.filter(x => x.d < 100).length, maisons_250m: res.filter(x => x.d < 250).length };
      O.agricoles_m = bt.err ? null : oth.filter(x => x.u === 'Agricole').slice(0, 6).map(x => x.d);
      O.lignes = le.err ? null : (le.features || []).map(f => ({ kv: parseInt(f.properties.voltage, 10) || null, voltage: f.properties.voltage || '?', d: md(f.geometry) })).sort((a, b) => a.d - b.d);
      const rmin = {};
      (rt.features || []).filter(f => ['1', '2', '3'].includes(String(f.properties.importance))).forEach(f => {
        const k = f.properties.cpx_numero || f.properties.nature || 'route';
        const d = md(f.geometry);
        if (!rmin[k] || d < rmin[k].d) rmin[k] = { nom: k, importance: +f.properties.importance, d };
      });
      O.routes = rt.err ? null : Object.values(rmin).sort((a, b) => a.d - b.d);
      O.voie_ferree_m = vf.err ? null : ((vf.features || []).length ? Math.min(...vf.features.map(f => md(f.geometry))) : null);
      O.eoliennes_m = cp.err ? null : (cp.features || []).filter(f => /olienne/i.test(f.properties.nature)).map(f => md(f.geometry)).sort((a, b) => a - b);
      O.antennes_m = cp.err ? null : (cp.features || []).filter(f => /antenne/i.test(f.properties.nature)).map(f => md(f.geometry)).sort((a, b) => a - b);
      fin('environnement');
    })() : null;

    /* ---------- 5. Eau potable, taxe foncière ---------- */
    const pCommune = veut('commune') ? (async () => {
      const [tf, eau] = await Promise.all([
        j(`https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fiscalite-locale-des-particuliers/records?where=insee_com%3D%22${P.insee}%22&order_by=exercice%20desc&limit=1&select=exercice,taux_global_tfb,taux_plein_teom`),
        j(`https://hubeau.eaufrance.fr/api/v1/qualite_eau_potable/resultats_dis?code_commune=${P.insee}&size=500&fields=date_prelevement,conformite_limites_bact_prelevement,conformite_limites_pc_prelevement`)
      ]);
      const t = (tf.results || [])[0];
      O.taxe_fonciere = t ? { exercice: t.exercice, taux_tfb: t.taux_global_tfb, taux_teom: t.taux_plein_teom } : null;
      const pr = new Map(); (eau.data || []).forEach(r => pr.set(r.date_prelevement, r));
      const pv = [...pr.values()];
      O.eau = eau.err ? null : { prelevements: pv.length,
        non_conformes: pv.filter(r => r.conformite_limites_bact_prelevement === 'N' || r.conformite_limites_pc_prelevement === 'N').length,
        dernier: pv.map(r => r.date_prelevement || '').sort().pop() || null };
      fin('commune');
    })() : null;

    /* ---------- 6. DVF : les fichiers officiels par commune et par année ----------
       Choix du 10/10/2026 : les CSV geo-dvf (officiels, chaque vente géolocalisée) plutôt que l'API
       de l'application DVF. Filtres repris des deux anciennes versions : une seule maison par vente,
       12 000 € minimum, 25 m² bâtis minimum, 400 €/m² minimum (vente non marchande probable en dessous). */
    const pDvf = veut('dvf') ? (async () => {
      const parc = await pParcelle;
      const an = new Date().getFullYear(), dept = P.insee.slice(0, 2);
      const annees = [an - 1, an - 2, an - 3, an - 4, an - 5];
      const txt = await Promise.all(annees.map(a => io.texte(`https://files.data.gouv.fr/geo-dvf/latest/csv/${a}/communes/${dept}/${P.insee}.csv`).catch(() => null)));
      const lus = txt.filter(Boolean).length;
      const muts = new Map();
      txt.forEach(t => {
        if (!t) return;
        const li = t.replace(/\r/g, '').split('\n').filter(l => l.trim());
        const cols = li[0].split(',');
        for (const l of li.slice(1)) {
          const v = []; let cur = '', q = false;
          for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { v.push(cur); cur = ''; } else cur += ch; }
          v.push(cur);
          const x = {}; cols.forEach((c, i) => x[c] = v[i]);
          if (x.nature_mutation !== 'Vente') continue;
          const m = muts.get(x.id_mutation) || { date: x.date_mutation, valeur: +x.valeur_fonciere || 0, maisons: 0, bati: 0, terrain: 0, parcelles: new Set(), lat: null, lon: null, voie: '' };
          if (x.type_local === 'Maison') { m.maisons++; m.bati += +x.surface_reelle_bati || 0; if (x.latitude) { m.lat = +x.latitude; m.lon = +x.longitude; } m.voie = [x.adresse_numero, x.adresse_nom_voie].filter(Boolean).join(' '); }
          m.terrain = Math.max(m.terrain, +x.surface_terrain || 0);
          if (x.id_parcelle) m.parcelles.add(x.id_parcelle);
          muts.set(x.id_mutation, m);
        }
      });
      const toutes = [...muts.values()];
      const ventes = toutes.filter(m => m.maisons === 1 && m.bati >= 25 && m.valeur >= 12000 && m.valeur / m.bati >= 400 && m.lat)
        .map(m => ({ date: m.date, valeur: m.valeur, surface: m.bati, terrain: m.terrain, eur_m2: Math.round(m.valeur / m.bati), d: dist([m.lon, m.lat], H), voie: m.voie, parcelles: [...m.parcelles] }));
      const s = P.surf;
      const comps = s ? ventes.filter(m => m.surface >= s * 0.6 && m.surface <= s * 1.4).sort((a, b) => a.d - b.d) : [];
      const idu = parc && parc.properties.idu;
      O.dvf = lus ? {
        annees_lues: lus, ventes_maisons: ventes.length,
        comparables: comps.slice(0, 30).map(({ parcelles, ...m }) => m),
        ventes_du_bien: toutes.filter(m => (idu && m.parcelles.has(idu)) || (m.lat && dist([m.lon, m.lat], H) <= 30))
          .map(m => ({ date: m.date, valeur: m.valeur })).sort((a, b) => b.date.localeCompare(a.date))
      } : null;
      fin('dvf');
    })() : null;

    /* ---------- 7. Autorisations d'urbanisme (base SDES) ---------- */
    const pPermis = veut('permis') ? (async () => {
      const parc = await pParcelle; await pDpe;
      const rue = norm((O.dpe && O.dpe.nom_rue_ban) || (O.adresse_ban || '').replace(/^\d+\S*\s+/, '').replace(/\s\d{5}.*$/, ''));
      const mot = rue.split(/\s+/).filter(w => w.length > 3 && !/^(RUE|ROUTE|CHEMIN|IMPASSE|ALLEE|PLACE|LIEU|DIT|GRANDE|PETITE)$/.test(w)).pop() || '';
      const refBien = parc ? `${parc.properties.section}${parc.properties.numero}`.replace(/^0+/, '') : null;
      const DEST = { 1: 'habitation', 2: 'hébergement', 3: 'bureaux', 4: 'commerce', 5: 'artisanat', 6: 'industrie', 7: 'agricole', 8: 'entrepôt', 9: 'service public' };
      let tronque = false;
      const lire = async rid => {
        const o = [];
        for (let pg = 1; pg <= 10; pg++) {
          const r = await j(`https://tabular-api.data.gouv.fr/api/resources/${rid}/data/?COMM__exact=${P.insee}&page_size=50&page=${pg}`);
          if (r.err) { O.erreurs.push('permis : ' + r.err); break; }
          for (const x of r.data || []) {
            const ref = `${x.SEC_CADASTRE1 || ''}${(x.NUM_CADASTRE1 || '').replace(/^0+/, '')}`.replace(/^0+/, '');
            const memeRue = !!mot && norm(`${x.ADR_LIBVOIE_TER || ''} ${x.ADR_LIEUDIT_TER || ''}`).includes(mot.slice(0, Math.max(5, mot.length - 1)));
            const agri = String(x.DESTINATION_PRINCIPALE) === '7';
            const bien = !!refBien && ref === refBien;
            if (!(memeRue || bien || agri)) continue;
            o.push({ date: x.DATE_REELLE_AUTORISATION || (x.AN_DEPOT ? String(x.AN_DEPOT) : null), type: x.TYPE_DAU, adresse: [x.ADR_NUM_TER, x.ADR_LIBVOIE_TER, x.ADR_LIEUDIT_TER].filter(Boolean).join(' '),
              parcelle: ref, destination: DEST[x.DESTINATION_PRINCIPALE] || 'logement', surf_hab: +x.SURF_HAB_CREEE || 0, surf_agri: +x.SURF_AGR_CREEE || 0, bien, memeRue });
          }
          if (!r.links || !r.links.next) break;
          if (pg === 10) tronque = true;
        }
        return o;
      };
      const [a, b] = await Promise.all(['65a9e264-7a20-46a9-9d98-66becb817bc3', '8f23d65f-7142-4ac5-94c1-077b028255bf'].map(lire));
      const vus = new Set();
      O.permis = [...a, ...b].filter(x => { const k = JSON.stringify(x); if (vus.has(k)) return false; vus.add(k); return true; })
        .sort((x, y) => String(y.date).localeCompare(String(x.date)));
      O.permis_incomplet = tronque;
      fin('permis');
    })() : null;

    /* ---------- 8. Risques : Géorisques, et le BRGM en complément (il marche même avec un VPN) ---------- */
    const pGeorisques = veut('risques') ? (async () => {
      const B = 'https://www.georisques.gouv.fr/api/v1/', ll = P.lon + ',' + P.lat;
      const [cat, rga, rad, ic, cs, cav, mvt] = await Promise.all([
        j(`${B}gaspar/catnat?code_insee=${P.insee}&page_size=100`), j(`${B}rga?latlon=${ll}`), j(`${B}radon?code_insee=${P.insee}`),
        j(`${B}installations_classees?latlon=${ll}&rayon=5000&page_size=100`), j(`${B}ssp/casias?latlon=${ll}&rayon=2000&page_size=50`),
        j(`${B}cavites?latlon=${ll}&rayon=1000`), j(`${B}mvt?latlon=${ll}&rayon=1000`)]);
      const G = O.georisques = { joignable: !(cat.err && rga.err && rad.err) };
      G.catnat = cat.err ? null : (cat.data || []).map(c => ({ date: c.date_debut_evt, libelle: c.libelle_risque_jo || '' }));
      G.argiles = rga.err ? null : (rga.exposition || null);
      G.radon = rad.err ? null : (((rad.data || [])[0] || {}).classe_potentiel || null);
      const tags = i => { const r = (i.rubriques || []).map(x => String(x.numeroRubrique || '')); const t = [];
        if (i.bovins || i.porcs || i.volailles || r.some(x => /^(2101|2102|2111|3660)/.test(x))) t.push('elevage');
        if (i.porcs) t.push('porcs'); if (i.volailles) t.push('volailles');
        if (r.some(x => /^2781/.test(x))) t.push('methanisation'); if (r.some(x => /^2510/.test(x))) t.push('carriere');
        if (/seuil/i.test(i.statutSeveso || '')) t.push('seveso'); return t; };
      G.icpe = ic.err ? null : (ic.data || []).map(i => ({ nom: i.raisonSociale, d: dist([+i.longitude, +i.latitude], H), tags: tags(i) })).sort((a, b) => a.d - b.d);
      G.casias = cs.err ? null : (cs.data || []).map(c => ({ nom: c.nom_etablissement || '', d: c.geom ? dist(c.geom.coordinates, H) : null })).sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));
      G.cavites_1km = cav.err ? null : (cav.data || []).length;
      G.mvt_1km = mvt.err ? null : (mvt.data || []).length;
      fin('georisques');
    })() : null;

    const pBrgm = veut('risques') ? (async () => {
      const lat = P.lat, lon = P.lon;
      const Bw = 'https://mapsref.brgm.fr/wxs/georisques/risques?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:';
      const box = R => `${lat - R / 111320},${lon - R / kx},${lat + R / 111320},${lon + R / kx},urn:ogc:def:crs:EPSG::4326`;
      const gj = async (tn, R) => { try { const r = await io.json(`${Bw}${tn}&BBOX=${box(R)}&COUNT=50&OUTPUTFORMAT=geojson`); return r && !r.err ? (r.features || []) : null; } catch (e) { return null; } };
      const hits = async (tn, R) => { try { const t = await io.texte(`${Bw}${tn}&BBOX=${box(R)}&RESULTTYPE=hits`); const m = (t || '').match(/numberMatched="(\d+)"/); return m ? +m[1] : null; } catch (e) { return null; } };
      const gml = async (tn, R) => { try { const t = await io.texte(`${Bw}${tn}&BBOX=${box(R)}`); return t == null ? null : t.split(`<ms:${tn}`).slice(1); } catch (e) { return null; } };
      const dgml = s => { const p = ((s.match(/<gml:pos>([^<]+)</) || [])[1] || '').split(' ').map(Number); return p.length === 2 ? Math.round(Math.hypot((p[1] - lon) * kx, (p[0] - lat) * 111320)) : null; };
      const [rga, nap, eaip, ppr, cav, mvt, ssp, sis] = await Promise.all([gj('ALEARG_REALISE', 15), gj('REMNAPPE_FIAB', 15), hits('EAIP_CE_GE', 15), hits('PPRN_PERIMETRE_INOND', 15),
        gml('CAVITE_LOCALISEE', 1000), gml('MVT_LOCALISE', 1000), hits('SSP_INSTR_GE_POINT', 2000), hits('SSP_CLASSIF_SIS_GE', 2000)]);
      const K = O.brgm = {};
      K.argiles = rga === null ? null : rga.length ? ({ 1: 'faible', 2: 'moyenne', 3: 'forte' }[Math.max(...rga.map(f => +f.properties.id))] || null) : 'nulle';
      K.nappe = nap === null ? null : ([...new Set(nap.map(f => f.properties.classe))].join(' / ') || 'hors zone');
      K.eaip = eaip; K.ppr_inondation = ppr;
      K.cavites_m = cav === null ? null : cav.map(dgml).filter(x => x != null).sort((a, b) => a - b);
      K.mvt_m = mvt === null ? null : mvt.map(dgml).filter(x => x != null).sort((a, b) => a - b);
      K.sites_pollues_2km = ssp; K.sis_2km = sis;
      fin('brgm');
    })() : null;

    await Promise.all([pParcelle, pUrba, pDpe, pTrajets, pBati, pCommune, pDvf, pPermis, pGeorisques, pBrgm].filter(Boolean));
    fin('fini');
    return O;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
