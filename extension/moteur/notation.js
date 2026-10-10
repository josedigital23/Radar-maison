/* Radar Maison — de la collecte à la note.

   construireDossier(collecte, annonce, profil, corrections) → le dossier du bien (une valeur par critère,
   null quand on ne sait pas). noter(dossier, profil) → les critères notés sur 10, les 8 anneaux, la note sur 100.
   Barème repris de analyse/rapport.py (même pondération, mêmes paliers), sauf les coûts : sans taxe foncière
   connue, on note l'énergie seule, sur des paliers propres (voir plus bas). */

(function (g) {
  const M = g.RadarMoteur = g.RadarMoteur || {};

  M.PROFIL = {
    nom: 'Victorien',
    budget: { confortable: 250000, acceptable: 300000, plafond: 335000 },
    maison: { surface_ideale: 125, surface_min: 100, chambres_min: 3 },
    seuil_verdict_pct: 60,
    travail: { nom: "Lycée Jeanne d'Arc, Paray-le-Monial", adresse: '17 rue Pasteur 71600 Paray-le-Monial' },
    projet_location: false
  };

  /* ---------- la facture d'énergie, aux prix d'aujourd'hui ----------
     Le DPE chiffre la facture aux prix du 1er janvier 2021 (« prix moyens des énergies indexés sur 01/01/2021 »,
     écrit sur les annonces). Il donne aussi les kWh consommés par énergie : on les multiplie par les prix actuels.
     Prix relevés le 10/10/2026 :
     - électricité, tarif bleu Base au 1er août 2026 : 0,2001 €/kWh et 190,35 €/an en 6 kVA ; 0,1985 €/kWh et 238,60 €/an
       en 9 kVA (Selectra, d'après la délibération CRE du 15/07/2026) ;
     - gaz, prix repère CRE d'octobre 2026, profil chauffage : 0,1456 €/kWh et 360,8 €/an (Hellowatt, Kelwatt,
       fournisseurs-electricite.com, concordants) ;
     - fioul : 1 899 € les 1 000 L au 28/09/2026 (Fioulmarket), à ~10 kWh par litre → 0,19 €/kWh ;
     - granulés : 431 €/t en vrac au 25/09/2026 (Selectra, 130 villes), à ~4,6 kWh/kg → 0,094 €/kWh.
     Bois bûche, GPL, réseau de chaleur, charbon : pas de prix actuel fiable → coût du DPE gardé, signalé « prix 2021 ». */
  M.PRIX_ENERGIE = {
    releve: 'octobre 2026',
    elec6: { kwh: 0.2001, abo: 190.35 }, elec9: { kwh: 0.1985, abo: 238.60 },
    gaz: { kwh: 0.1456, abo: 360.8 }, fioul: { kwh: 0.19 }, granules: { kwh: 0.094 }
  };
  M.energieActuelle = function (dpe) {
    if (!dpe) return null;
    const PE = M.PRIX_ENERGIE, lignes = [];
    const elecChauffage = /électri/i.test(dpe.type_energie_principale_chauffage || '');
    const tarifElec = elecChauffage ? PE.elec9 : PE.elec6;
    let elecVue = false, total = 0, nonActualise = 0;
    for (const n of [1, 2, 3]) {
      const type = dpe['type_energie_n' + n], kwh = +dpe['conso_5_usages_ef_energie_n' + n] || 0, c21 = +dpe['cout_total_5_usages_energie_n' + n] || 0;
      if (!type || (!kwh && !c21)) continue;
      let c26 = null;
      if (/électri/i.test(type)) { c26 = kwh * tarifElec.kwh + tarifElec.abo; elecVue = true; }
      else if (/gaz naturel/i.test(type)) c26 = kwh * PE.gaz.kwh + PE.gaz.abo;
      else if (/fioul/i.test(type)) c26 = kwh * PE.fioul.kwh;
      else if (/granul|pellet/i.test(type)) c26 = kwh * PE.granules.kwh;
      if (c26 == null) nonActualise += c21;
      total += c26 != null ? c26 : c21;
      lignes.push({ type, kwh: Math.round(kwh), cout2021: Math.round(c21), cout: Math.round(c26 != null ? c26 : c21), actualise: c26 != null });
    }
    if (!lignes.length) return null;
    if (!elecVue) { total += tarifElec.abo; lignes.push({ type: 'Abonnement électricité', kwh: 0, cout2021: 0, cout: Math.round(tarifElec.abo), actualise: true }); }
    return { an: Math.round(total), an2021: dpe.cout_total_5_usages != null ? Math.round(dpe.cout_total_5_usages) : null, lignes, nonActualise: Math.round(nonActualise), kva: elecChauffage ? 9 : 6 };
  };

  /* ---------- le prix demandé ----------
     Premier test réel (SeLoger, 10/10/2026) : 201 600 € lus au lieu de 252 000 € — le prix hors honoraires
     (252 000 / 1,25) arrivait avant dans le texte, et l'ancienne lecture prenait le premier montant venu.
     Désormais : on écarte les montants « hors honoraires », « net vendeur », mensualités, €/m², frais ;
     on préfère un montant aussi présent dans les données structurées de la page (JSON-LD, meta) ;
     sinon le plus répété (le vrai prix est affiché plusieurs fois) ; à égalité, le premier. */
  M.choisirPrix = function (texte, structures) {
    const t = texteOu(texte), n = s => parseFloat(String(s).replace(/[\s\u202f\u00a0]/g, '').replace(',', '.'));
    const re = /([0-9][0-9\s\u202f\u00a0.]{3,12})\s*(?:€|euros?\b)/gi, vus = new Map();
    let m;
    while ((m = re.exec(t)) !== null) {
      const v = n(m[1].replace(/\.(?=\d{3}\b)/g, ''));
      if (!(v >= 15000 && v <= 5000000)) continue;
      const apres = t.slice(m.index + m[0].length, m.index + m[0].length + 40);
      const avant = t.slice(Math.max(0, m.index - 60), m.index);
      if (/^\s*(?:\/|par)\s*(?:mois|m|mètre)/i.test(apres)) continue;
      if (/^\s*(?:hors\s+honoraires|h\.?\s?h\b|net\s+vendeur|hors\s+frais)/i.test(apres)) continue;
      if (/(?:hors\s+honoraires|net\s+vendeur|soit|honoraires|frais\s+(?:de\s+)?notaire|frais\s+d['’]agence|mensualit|emprunt|apport|estim)[^€0-9·•|;,\n]{0,15}$/i.test(avant)) continue;   // le mot doit coller au montant, sans séparateur entre les deux
      const x = vus.get(v) || { n: 0, i: m.index }; x.n++; vus.set(v, x);
    }
    const S = (structures || []).map(Number).filter(v => v >= 15000 && v <= 5000000);
    const cands = [...vus.entries()].map(([v, x]) => ({ v, score: x.n + (S.includes(v) ? 3 : 0), i: x.i }));
    S.forEach(v => { if (!vus.has(v)) cands.push({ v, score: 2, i: 1e9 }); });
    cands.sort((a, b) => b.score - a.score || a.i - b.i);
    return cands.length ? cands[0].v : null;
  };
  const texteOu = t => t || '';

  /* ---------- ce que dit le texte de l'annonce (jamais « non » par simple absence) ---------- */
  M.lireTexte = function (t) {
    t = t || '';
    const n = s => { const v = parseFloat(String(s).replace(/[\s  ]/g, '').replace(',', '.')); return isNaN(v) ? null : v; };
    const o = {};
    let m = t.match(/(\d{1,2})\s*chambres?\b/i); if (m) o.chambres = +m[1];
    m = t.match(/(?:terrain|parcelle|jardin)[^0-9\n]{0,25}?([0-9][0-9\s  .]{1,8})\s*m(?:²|2)/i)
      || t.match(/([0-9][0-9\s  .]{1,8})\s*m(?:²|2)\s*de\s*(?:terrain|parcelle|jardin)/i);
    if (m) { const v = n(m[1].replace(/\./g, '')); if (v && v >= 100) o.terrain = v; }
    m = t.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:ha|hectares?)\b/i); if (m && !o.terrain) o.terrain = Math.round(n(m[1]) * 10000);
    if (/\bgarages?\b|\babri(?:s)?\s+(?:de\s+)?(?:jardin|voiture)|\bcarport\b|\bhangar\b/i.test(t)) o.garage = true;
    if (/\bateliers?\b/i.test(t)) o.atelier = true;
    if (/\bpiscine\b/i.test(t)) o.piscine = true;
    o.cave = /\bcaves?\b|\bsous-sol\b/i.test(t);
    o.mitoyen = /\bmitoyen(?:ne)?\b|\bmitoyenneté\b/i.test(t);
    o.calme = /\bau calme\b|\bsans nuisance|\btranquill|\bsans vis-à-vis\b|\bpas de vis-à-vis\b/i.test(t);
    o.sansVisAVis = /\bsans vis-à-vis\b|\bpas de vis-à-vis\b|\baucun vis-à-vis\b/i.test(t);
    o.assainissementIndividuel = /fosse\s+septique|fosse\s+toutes\s+eaux|assainissement\s+(?:individuel|autonome|non\s+collectif)|micro-?station|\bSPANC\b/i.test(t);
    o.toutALegout = /tout[\s-]à[\s-]l['’]?égout|assainissement\s+collectif|raccordée?\s+au\s+réseau/i.test(t);
    o.fibre = /\bfibre\b/i.test(t);
    o.aRenover = /\bà rénover\b|\bà rafraîchir\b|\btravaux à prévoir\b|\bà restaurer\b/i.test(t);
    return o;
  };

  /* Hors bourg, un bâtiment d'habitation à 2-15 m sur une autre parcelle est le plus souvent une dépendance de la
     propriété (une ferme est rarement sur une seule parcelle) : Vendenesse, 10/10/2026, « voisin à 8 m » avec 3 maisons
     seulement à 100 m. On le saute, et on le dit. En bourg (≥ 15 maisons à 250 m), 8 m, c'est un voisin. Mur contre mur
     (< 2 m), c'est une maison mitoyenne : on garde. */
  M.voisinEffectif = iso => {
    if (!iso || iso.voisin_m == null) return { d: null, dependance: null };
    const vs = iso.voisins_m || [iso.voisin_m];
    if (iso.maisons_250m >= 15) return { d: vs[0], dependance: null };
    const i = vs.findIndex(d => d < 2 || d >= 15);
    if (i <= 0) return { d: i === 0 ? vs[0] : (vs.length ? vs[vs.length - 1] : null), dependance: i === 0 ? null : vs[0] };
    return { d: vs[i], dependance: vs[0] };
  };

  const palier = (v, seuils) => { if (v == null) return null; for (const [m, s] of seuils) if (v <= m) return s; return 0; };
  const mediane = t => { if (!t.length) return null; const s = [...t].sort((a, b) => a - b), k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  M.mediane = mediane;

  M.construireDossier = function (c, annonce, profil, corr) {
    c = c || {}; annonce = annonce || {}; corr = corr || {};
    const T = M.lireTexte(annonce.texte);
    const dpe = c.dpe || {};
    const pick = (k, ...v) => (corr[k] !== undefined ? corr[k] : v.find(x => x !== undefined && x !== null) ?? null);
    const tr = c.trajets || {};
    const mn = k => (tr[k] && tr[k].min != null) ? tr[k].min : null;
    const D = {
      prix: pick('prix', annonce.prix),
      travaux: pick('travaux', 0),
      surface: pick('surface', dpe.surface_habitable_logement, annonce.surface),
      surface_annonce: annonce.surface ?? null,
      chambres: pick('chambres', annonce.chambres, T.chambres),
      style: pick('style', null),
      garage: pick('garage', T.garage),
      atelier: pick('atelier', T.atelier),
      piscine: pick('piscine', T.piscine),
      terrain: pick('terrain', annonce.terrain, T.terrain, c.parcelle && c.parcelle.contenance),
      connexion: pick('connexion', null),
      vis_a_vis: pick('vis_a_vis', T.sansVisAVis ? false : null),
      bourg: pick('bourg', c.isolement ? (c.isolement.maisons_250m >= 15) : null),
      voisin_m: pick('voisin_m', M.voisinEffectif(c.isolement).d),
      voisin_dependance: M.voisinEffectif(c.isolement).dependance,
      trajets: {
        travail: pick('min_travail', mn('travail')), ecole: pick('min_ecole', mn('ecole')),
        supermarche: pick('min_supermarche', mn('supermarche')), depannage: pick('min_depannage', mn('depannage')),
        sport: pick('min_sport', mn('sport'), mn('autre_salle'))
      },
      energie_an: pick('energie_an', (M.energieActuelle(c.dpe) || {}).an ?? (dpe.cout_total_5_usages != null ? Math.round(dpe.cout_total_5_usages) : null)),
      energie: M.energieActuelle(c.dpe),
      taxe_fonciere_an: pick('taxe_fonciere_an', null),
      comparables: (c.dvf && c.dvf.comparables) || [],
      texte: T
    };
    return D;
  };

  /* ---------- la note ---------- */
  M.noter = function (D, profil) {
    const P = profil || M.PROFIL, B = P.budget, MS = P.maison;
    const t = D.trajets || {};
    const s = {};
    s.travail = palier(t.travail, [[10, 1], [17, .7], [25, .35]]);
    s.ecole = palier(t.ecole, [[5, 1], [10, .7], [15, .35]]);
    const sup = palier(t.supermarche, [[4.99, 1], [9.99, .7], [14.99, .35]]);
    const dep = t.depannage == null ? null : t.depannage <= 5 ? 1 : 0;
    s.courses = sup == null ? null : dep == null ? sup : Math.min(1, .8 * sup + .2 * dep + (dep ? .1 : 0));
    s.sport = palier(t.sport, [[10, 1], [20, .5]]);
    const budget = D.prix != null ? D.prix + (D.travaux || 0) : null;
    s.budget = palier(budget, [[B.confortable, 1], [B.acceptable, .6], [B.plafond, .25]]);
    const surf = D.surface, ch = D.chambres;
    const taille = (surf == null || ch == null) ? null : (surf >= MS.surface_ideale && ch >= MS.chambres_min) ? 1 : surf >= MS.surface_min ? (ch >= MS.chambres_min ? .6 : .1) : 0;
    const style = { pierre_charme: 1, neuf_recent: .6, autre: .5, sous_sol_70_80: .15 }[D.style] ?? null;
    s.maison = (taille == null || style == null) ? null : .6 * taille + .4 * style;
    const comps = D.comparables || [];
    const med = comps.length >= 3 ? mediane(comps.map(x => x.eur_m2)) : null;
    const pm2 = (D.prix && surf) ? D.prix / surf : null;
    const ratio = (pm2 && med) ? pm2 / med : null;
    s.marche = palier(ratio, [[.85, 1], [1.0, .75], [1.15, .45], [1.3, .2]]);
    s.dependances = (D.garage == null || D.atelier == null) ? null : (D.garage && D.atelier) ? 1 : (D.garage || D.atelier) ? .5 : 0;
    let iso = D.voisin_m == null ? null : D.voisin_m >= 200 ? 1 : D.voisin_m >= 100 ? .75 : D.voisin_m >= 50 ? .45 : .15;
    if (iso != null) { if (D.vis_a_vis) iso = Math.max(0, iso - .3); if (D.bourg) iso = Math.min(iso, .4); }
    s.isolement = iso;
    s.terrain = D.terrain == null ? null : D.terrain < 500 ? 0 : D.terrain < 1000 ? .4 : D.terrain <= 3000 ? 1 : .8;
    /* Coûts : la facture d'énergie du DPE est sourcée ; la taxe foncière ne l'est que si on la saisit.
       Énergie seule : ≤ 150 €/mois → 10, ≤ 230 → 7, ≤ 300 → 4, au-delà → 1.
       Avec taxe foncière : paliers de rapport.py (400 / 550 / 700 €/mois). */
    const mois = D.energie_an == null ? null : (D.energie_an + (D.taxe_fonciere_an || 0)) / 12;
    s.couts = mois == null ? null : D.taxe_fonciere_an ? (palier(mois, [[400, 1], [550, .7], [700, .4]]) || .1) : (palier(mois, [[150, 1], [230, .7], [300, .4]]) || .1);
    s.connexion = { fibre: 1, fibre_prevue: .6, '4g_bonne': .4, rien: 0 }[D.connexion] ?? null;

    const C = [
      ['travail', 'Trajet travail', 8, 'trajets'], ['ecole', 'Trajet école', 6, 'trajets'],
      ['courses', 'Courses', 4, 'courses'], ['sport', 'Sport', 2, 'courses'],
      ['budget', 'Budget', 15, 'budget'], ['marche', 'Prix vs marché', 10, 'prix'],
      ['maison', 'Taille et style', 15, 'maison'], ['dependances', 'Dépendances', 10, 'maison'], ['terrain', 'Terrain', 8, 'maison'],
      ['isolement', 'Isolement', 10, 'isolement'], ['couts', 'Coûts mensuels', 7, 'couts'], ['connexion', 'Connexion', 5, 'connexion']
    ].map(([id, nom, poids, groupe]) => ({ id, nom, poids, groupe, s: s[id] }));
    const connus = C.filter(x => x.s != null);
    const W = connus.reduce((a, x) => a + x.poids, 0);
    const pts = connus.reduce((a, x) => a + x.poids * x.s, 0);
    const bonus = D.piscine ? 3 : 0;
    const note = W ? Math.min(100, Math.round(pts / W * 100 + bonus)) : null;
    const couverture = W;   // poids total = 100
    const provisoire = couverture < (P.seuil_verdict_pct ?? 60);
    const verdict = provisoire || note == null ? null : note >= 75 ? 'Très bonne affaire' : note >= 60 ? 'Intéressante' : note >= 45 ? 'Moyenne' : 'À éviter';

    // Sans taxe foncière, l'anneau ne mesure que l'énergie : il s'appelle « Énergie », pas « Coûts » (retour du 10/10/2026)
    const nomCouts = D.taxe_fonciere_an ? 'Coûts' : 'Énergie';
    C.find(x => x.id === 'couts').nom = D.taxe_fonciere_an ? 'Coûts mensuels' : 'Énergie';
    const GR = [['trajets', 'Trajets'], ['courses', 'Courses'], ['budget', 'Budget'], ['prix', 'Prix'],
      ['maison', 'Maison'], ['isolement', 'Isolement'], ['couts', nomCouts], ['connexion', 'Connexion']];
    const groupes = GR.map(([id, nom]) => {
      const xs = C.filter(x => x.groupe === id), k = xs.filter(x => x.s != null);
      const w = k.reduce((a, x) => a + x.poids, 0);
      const v = w ? k.reduce((a, x) => a + x.poids * x.s, 0) / w * 10 : null;
      return { id, nom, v: v == null ? null : Math.round(v * 10) / 10, complet: k.length === xs.length, manque: xs.length - k.length };
    });
    return { criteres: C, groupes, note, couverture, provisoire, verdict, budget, pm2, med, ratio, mois, nbComparables: comps.length };
  };

  M.niveau = v => v == null ? null : v >= 6.5 ? 'bien' : v >= 3 ? 'moyen' : 'faible';

  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
