/* Radar Maison — les règles qui écrivent le rapport, sans IA.

   Une règle lit des données sourcées et rend une carte (point d'attention), une force, une faiblesse
   ou des questions. Principes (décidés le 10/10/2026) :
   - une donnée inconnue ne déclenche rien ; seules les règles d'« absence » posent une question ;
   - un thème = une carte : on garde la plus grave et on fusionne les questions ;
   - chaque carte porte un chiffre et sa source ; une déduction porte le drapeau `deduction` ;
   - les règles sur le texte de l'annonce ne déclenchent jamais seules une carte de gravité 3.
   Seuils : propositions initiales, calibrées sur les cas réels (voir tests). */

(function (g) {
  const M = g.RadarMoteur = g.RadarMoteur || {};

  const DPE_RANG = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7 };
  const mois = (a, b) => { const x = new Date(a), y = new Date(b); return (y - x) / (30.44 * 86400000); };
  const m = n => n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(n) + ' m';
  const eur = n => Math.round(n).toLocaleString('fr-FR') + ' €';
  const pct = x => (x > 0 ? '+' : '') + Math.round(x * 100 + (x > 0 ? 1e-9 : -1e-9)) + ' %';   // 0,575 → +58 %, pas +57
  const annee = d => String(d || '').slice(0, 4);

  M.regles = function (c, D, R, annonce, aujourdhui) {
    c = c || {}; annonce = annonce || {};
    const T = D.texte || {};
    const now = aujourdhui ? new Date(aujourdhui) : new Date();
    const dpe = c.dpe || {}, G = c.georisques || {}, K = c.brgm || {};
    const cartes = [], forces = [], faiblesses = [], questionsLibres = [];
    const carte = (theme, gravite, titre, detail, source, opts) => cartes.push({ theme, gravite, titre, detail, source, deduction: !!(opts && opts.deduction), q: (opts && opts.q) || [] });
    const Q = (ou, texte, lien) => ({ ou, texte, lien });
    const permisBien = (c.permis || []).filter(p => p.bien);

    /* ===== A. L'annonce contre les bases ===== */
    const sDpe = dpe.surface_habitable_logement, sAnn = annonce.surface;
    let ecartSurface = null;
    if (sDpe && sAnn && sAnn > sDpe * 1.15 && sAnn - sDpe >= 10) {
      ecartSurface = (sAnn - sDpe) / sDpe;
      carte('surface', 2, 'Surface annoncée gonflée', `${Math.round(sAnn)} m² annoncés · ${Math.round(sDpe)} m² au DPE (${pct(ecartSurface)})`, 'DPE',
        { q: [Q('vendeur', `Quelles pièces comptent dans les ${Math.round(sAnn)} m² ?`, `surface ${pct(ecartSurface)}`), Q('documents', 'Le DPE complet, avec le détail des surfaces', `surface ${pct(ecartSurface)}`)] });
    }
    // Agrandissement : la surface monte d'un DPE à l'autre, sans autorisation retrouvée sur la parcelle
    // L'ancienne base donne une surface THERMIQUE, pas habitable : entre les deux bases, on exige +25 %.
    const hist = (c.historique_dpe || []).filter(h => h.surface);
    if (hist.length >= 2) {
      const a = hist[0], b = hist[hist.length - 1];
      const seuil = a.base === b.base ? 1.1 : 1.25;
      if (b.surface > a.surface * seuil && b.surface - a.surface >= 10) {
        const sansPermis = !permisBien.some(p => p.surf_hab > 0 || /PC|DP/.test(p.type || ''));
        carte('surface', sansPermis ? 3 : 1, sansPermis ? 'Agrandissement non déclaré ?' : 'Maison agrandie',
          `Surface du DPE : ${Math.round(a.surface)} m² en ${annee(a.date)} → ${Math.round(b.surface)} m² en ${annee(b.date)}${sansPermis ? ', aucune autorisation retrouvée sur la parcelle' : ''}`,
          'DPE + permis', { deduction: sansPermis, q: sansPermis ? [Q('mairie', `L'agrandissement entre ${annee(a.date)} et ${annee(b.date)} a-t-il été autorisé ?`, 'aucun permis retrouvé')] : [] });
      }
    }
    // DPE refait qui s'améliore vite
    const histE = (c.historique_dpe || []).filter(h => DPE_RANG[h.etiquette]);
    for (let i = 1; i < histE.length; i++) {
      const a = histE[i - 1], b = histE[i];
      if (mois(a.date, b.date) <= 18 && DPE_RANG[a.etiquette] - DPE_RANG[b.etiquette] >= 2 && !permisBien.length) {
        carte('dpe-refait', 2, 'DPE refait', `${a.etiquette} → ${b.etiquette} en ${Math.max(1, Math.round(mois(a.date, b.date)))} mois, sans travaux déclarés`, 'DPE',
          { deduction: true, q: [Q('vendeur', 'Quels travaux entre les deux DPE ? Avec quelles factures ?', `${a.etiquette} → ${b.etiquette}`)] });
      }
    }
    // « Au calme » contre une grande route
    const grandeRoute = (c.routes || []).find(r => r.importance <= 2 && r.d < 100);
    if (grandeRoute) carte('bruit', T.calme ? 3 : 2, T.calme ? 'Annonce « au calme » contredite' : 'Grande route', `${grandeRoute.nom} à ${m(grandeRoute.d)}`, 'IGN',
      { q: [Q('sur place', 'Bruit de la route aux heures de pointe ?', `${grandeRoute.nom} à ${m(grandeRoute.d)}`)] });
    // Terrain annoncé contre parcelle
    const cont = c.parcelle && c.parcelle.contenance, tAnn = annonce.terrain ?? T.terrain;
    if (cont && tAnn && Math.abs(tAnn - cont) / cont > 0.2) questionsLibres.push(Q('vendeur', 'Quelles parcelles sont vendues ?', `${Math.round(tAnn).toLocaleString('fr-FR')} m² annoncés · parcelle de ${cont.toLocaleString('fr-FR')} m²`));
    if (T.mitoyen) faiblesses.push('Maison mitoyenne (annonce)');

    /* ===== B. Le prix dans le temps ===== */
    const ventes = ((c.dvf && c.dvf.ventes_du_bien) || []).filter(v => v.valeur >= 12000);
    if (ventes.length) {
      const v = ventes[0], age = mois(v.date, now);
      if (age <= 60 && D.prix) {
        const pv = (D.prix - v.valeur) / v.valeur;
        const sansTravaux = !permisBien.length;
        carte('historique-prix', pv > 0.25 && sansTravaux ? 2 : 1, 'Déjà vendue récemment', `${eur(v.valeur)} en ${annee(v.date)} · demandé ${eur(D.prix)} (${pct(pv)})`, 'DVF',
          { q: pv > 0.25 ? [Q('vendeur', `Quels travaux depuis l'achat en ${annee(v.date)} ? Avec factures ?`, `${pct(pv)} en ${Math.round(age / 12) || 1} an${Math.round(age / 12) > 1 ? 's' : ''}`)] : [] });
        if (age < 24) questionsLibres.push(Q('vendeur', 'Pourquoi revendre si vite ?', `achetée en ${annee(v.date)}`));
      }
    }
    const visite = dpe.date_visite_diagnostiqueur || annonce.dateDpe;
    if (visite) {
      const age = mois(visite, now);
      if (age > 9 && age < 36) carte('anciennete', 1, 'En vente depuis longtemps ?', `DPE réalisé il y a ${Math.round(age)} mois`, 'DPE',
        { deduction: true, q: [Q('vendeur', 'Depuis quand la maison est-elle en vente ? Des offres ?', `DPE de ${Math.round(age)} mois`)] });
    }
    if (R.ratio != null && R.ratio <= 0.85) {
      forces.push(`Prix ${pct(R.ratio - 1)} sous la médiane du secteur`);
      questionsLibres.push(Q('vendeur', 'Pourquoi ce prix, sous le marché ?', `${pct(R.ratio - 1)} vs médiane`));
    }

    /* ===== C. Énergie et obligations ===== */
    const etiq = dpe.etiquette_dpe;
    if (etiq === 'F' || etiq === 'G') carte('energie', 2, `Passoire énergétique (${etiq})`, 'Audit énergétique obligatoire pour vendre', 'DPE',
      { q: [Q('documents', "L'audit énergétique, avec ses scénarios de travaux", `DPE ${etiq}`)] });
    if (M.PROFIL.projet_location && (etiq === 'G' || etiq === 'F' || etiq === 'E'))
      faiblesses.push(`Location : ${etiq === 'G' ? 'interdite depuis 2025' : etiq === 'F' ? 'interdite en 2028' : 'interdite en 2034'}`);
    const chauff = `${dpe.type_energie_principale_chauffage || ''} ${dpe.description_installation_chauffage_n1 || ''}`;
    if (/fioul/i.test(chauff)) carte('chauffage', 1, 'Chauffage au fioul', 'Pas de chaudière fioul neuve depuis 2022 : changer de système à son remplacement', 'DPE',
      { q: [Q('vendeur', 'Âge et entretien de la chaudière fioul ?', 'fioul')] });
    if (/électri/i.test(dpe.type_energie_principale_chauffage || '') && /convecteur|radiateur|panneau|joule|plafond|plancher rayonnant/i.test(dpe.description_installation_chauffage_n1 || '') && DPE_RANG[etiq] >= 5)
      faiblesses.push(`Chauffage électrique direct, DPE ${etiq}`);
    if (annonce.dateDpe && annonce.dateDpe < '2021-07-01') carte('dpe-caduc', 2, 'DPE caduc', `DPE de l'annonce daté de ${annee(annonce.dateDpe)}`, 'annonce',
      { q: [Q('documents', 'Le DPE en vigueur', 'DPE caduc')] });
    if (DPE_RANG[etiq] && DPE_RANG[etiq] <= 3) forces.push(`DPE ${etiq}`);

    /* ===== D. Le dossier de diagnostics : une seule ligne, calculée ===== */
    const per = String(dpe.periode_construction || ''), an = +dpe.annee_construction || null;
    const ansPer = (per.match(/\d{4}/g) || []).map(Number);
    const avant1949 = /avant\s*19(4[0-8]|49)/i.test(per) || (an && an < 1949);
    const peutAvant1997 = avant1949 || (an ? an < 1998 : ansPer.length ? Math.min(...ansPer) < 1998 : false);
    const ddt = ['DPE', 'état des risques'];
    if (etiq === 'F' || etiq === 'G') ddt.push('audit énergétique');
    if (avant1949) ddt.push('plomb');
    if (peutAvant1997) ddt.push('amiante');
    if (!/après 20(1[1-9]|2)/i.test(per)) ddt.push('électricité');
    if (/gaz/i.test(chauff)) ddt.push('gaz');
    if (!T.toutALegout) ddt.push('assainissement');
    questionsLibres.push(Q('documents', 'Dossier de diagnostics : ' + ddt.join(', '), 'obligatoires à la vente'));
    if (T.assainissementIndividuel) questionsLibres.push(Q('documents', 'Contrôle SPANC de moins de 3 ans : conforme ? travaux exigés ?', 'assainissement individuel'));
    else if (!T.toutALegout) questionsLibres.push(Q('mairie', 'Raccordée au tout-à-l’égout ?', 'non précisé'));

    /* ===== E. Le sol ===== */
    const argiles = (G.argiles || '').toLowerCase().includes('fort') ? 'forte' : (G.argiles || '').toLowerCase().includes('moyen') ? 'moyenne'
      : K.argiles || ((G.argiles || '').toLowerCase().includes('faible') ? 'faible' : null);
    const catnat = G.catnat || [];
    const secheresses = catnat.filter(x => /s[ée]cheresse/i.test(x.libelle)).map(x => annee(x.date));
    const inondCat = catnat.filter(x => /inondation|coul[ée]e de boue/i.test(x.libelle));
    if (argiles === 'forte') {
      const sech = [...new Set(secheresses)].sort();
      carte('sol', sech.length ? 3 : 2, 'Argiles : exposition forte', sech.length ? `Sécheresse reconnue en catastrophe naturelle : ${sech.slice(-3).join(', ')}` : 'Sol qui gonfle et se rétracte', sech.length ? 'Géorisques' : 'BRGM',
        { q: [Q('sur place', 'Fissures en façade ou aux angles des ouvertures ?', 'argiles fortes'), ...(sech.length ? [Q('vendeur', 'Un sinistre sécheresse a-t-il été déclaré ou indemnisé ?', `arrêtés ${sech.slice(-2).join(', ')}`)] : [])] });
    } else if (argiles === 'moyenne') {
      // Calibrage du 10/10/2026 : sur 8 biens réels, « argiles moyennes + sécheresse 2018-2020 » sortait 6 fois — tout le 71.
      // Pas de carte : une question, rien de plus.
      questionsLibres.push(Q('sur place', 'Fissures en façade ?', 'argiles moyennes'));
    }
    if (String(G.radon) === '3') carte('radon', T.cave ? 3 : 2, 'Radon', `Potentiel catégorie 3${T.cave ? ', avec cave ou sous-sol' : ''}`, 'Géorisques',
      { q: [Q('documents', 'Une mesure de radon a-t-elle été faite ?', 'radon catégorie 3')] });
    if (K.ppr_inondation > 0) carte('inondation', 3, 'Zone inondable réglementée', 'Dans un plan de prévention du risque inondation', 'BRGM',
      { q: [Q('notaire', 'Sinistres inondation déjà indemnisés ?', 'PPR inondation'), Q('mairie', 'Zone du PPR : rouge ou bleue ?', 'PPR inondation')] });
    else {
      /* Calibrage du 10/10/2026 : 8 communes sur 8 avaient au moins 2 arrêtés « inondation » (1982, 1999…).
         On ne compte que depuis 2000, et la carte n'est grave que si le bien est dans l'enveloppe inondable potentielle. */
      const recents = inondCat.filter(x => String(x.date) >= '2000');
      if (K.eaip > 0) carte('inondation', recents.length ? 2 : 1, 'Zone inondable potentielle',
        recents.length ? `Enveloppe potentielle · ${recents.length} arrêté${recents.length > 1 ? 's' : ''} depuis 2000` : 'Enveloppe potentielle, pas une zone réglementée', 'BRGM',
        { q: [Q('vendeur', 'La maison a-t-elle déjà été inondée ?', 'zone inondable potentielle')] });
      else if (recents.length >= 4) carte('inondation', 1, 'Inondations fréquentes dans la commune', `${recents.length} arrêtés depuis 2000 · le bien est hors zone inondable potentielle`, 'Géorisques');
    }
    if (K.nappe && /d[ée]bordement/i.test(K.nappe) && !/pas de d[ée]bordement/i.test(K.nappe)) carte('nappe', 2, 'Remontée de nappe', 'Zone sujette aux débordements de nappe', 'BRGM', { q: [Q('sur place', 'Cave ou sous-sol humides ?', 'nappe')] });
    else if (K.nappe && /inondations? de cave/i.test(K.nappe) && !/pas de/i.test(K.nappe)) { if (T.cave) carte('nappe', 1, 'Nappe proche', 'Zone sujette aux inondations de cave', 'BRGM', { q: [Q('sur place', 'Cave humide, traces d’eau ?', 'nappe')] }); }
    const cav = (K.cavites_m || []).filter(d => d < 500), mvt = (K.mvt_m || []).filter(d => d < 500);
    if (cav.length || mvt.length) carte('terrain', 2, cav.length ? 'Cavité souterraine' : 'Mouvement de terrain', `à ${m(Math.min(...cav, ...mvt))}`, 'BRGM');
    const solSain = argiles && ['faible', 'nulle'].includes(argiles) && !(K.eaip > 0) && !(K.ppr_inondation > 0) && G.radon && String(G.radon) === '1';
    if (solSain) forces.push('Sol et risques : rien à signaler');

    /* ===== F. Le voisinage ===== */
    const ic = G.icpe || [];
    const elev = ic.find(i => i.tags.includes('elevage'));
    if (elev && elev.d < 1000) carte('elevage', elev.d < 500 ? 3 : 2, 'Élevage classé', `${elev.tags.includes('porcs') ? 'porcs · ' : elev.tags.includes('volailles') ? 'volailles · ' : ''}à ${m(elev.d)}`, 'Géorisques',
      { q: [Q('sur place', 'Odeurs, mouches, épandages ?', `élevage à ${m(elev.d)}`)] });
    const agriIc = ic.find(i => i.tags.includes('agricole') && i.d < 1000);
    if (agriIc && !(elev && elev.d < 1000)) carte('elevage', agriIc.d < 500 ? 2 : 1, 'Exploitation agricole classée', `${agriIc.nom} à ${m(agriIc.d)} · élevage probable`, 'Géorisques',
      { deduction: true, q: [Q('sur place', 'Odeurs, épandages, passages d’engins ?', `exploitation à ${m(agriIc.d)}`)] });
    const meth = ic.find(i => i.tags.includes('methanisation') && i.d < 1000);
    if (meth) carte('methanisation', 2, 'Méthaniseur', `à ${m(meth.d)}`, 'Géorisques', { q: [Q('sur place', 'Odeurs, passages de camions ?', `méthaniseur à ${m(meth.d)}`)] });
    const carr = ic.find(i => i.tags.includes('carriere') && i.d < 2000);
    if (carr) carte('carriere', 2, 'Carrière', `à ${m(carr.d)}`, 'Géorisques', { q: [Q('sur place', 'Tirs de mine, poussière, camions ?', `carrière à ${m(carr.d)}`)] });
    const sev = ic.find(i => i.tags.includes('seveso') && i.d < 5000);
    if (sev) carte('seveso', 3, 'Site Seveso', `${sev.nom} à ${m(sev.d)}`, 'Géorisques');
    const agri = (c.agricoles_m || [])[0];
    // À moins de 30 m, un bâtiment agricole peut faire partie de la propriété (Changy, 24 m) : on pose la question.
    if (agri != null && agri < 100 && !(elev && elev.d < 1000)) carte('agricole', 1, 'Bâtiment agricole', `à ${m(agri)} de la maison`, 'IGN',
      { q: [Q('vendeur', agri < 30 ? 'Le bâtiment agricole à côté fait-il partie de la vente ? Sinon, quelle activité ?' : 'Quelle activité dans le bâtiment agricole voisin ?', `à ${m(agri)}`)] });
    const ht = (c.lignes || []).find(l => l.kv >= 63 && l.d < 200);
    if (ht) carte('ligne', 1, 'Ligne haute tension', `${ht.voltage} à ${m(ht.d)}`, 'IGN');
    if (c.voie_ferree_m != null && c.voie_ferree_m < 300) carte('train', 1, 'Voie ferrée', `à ${m(c.voie_ferree_m)}`, 'IGN');
    const eol = (c.eoliennes_m || [])[0];
    if (eol != null && eol < 1500) carte('eolienne', 1, 'Éolienne', `à ${m(eol)}`, 'IGN');
    const cas = (G.casias || []).find(x => x.d != null && x.d < 300);
    if (cas) carte('pollution', 2, 'Ancien site industriel', `${cas.nom || 'activité'} à ${m(cas.d)}`, 'Géorisques', { q: [Q('vendeur', 'Que faisait le site voisin ? Potager possible ?', `ancien site à ${m(cas.d)}`)] });
    if (c.eau && (c.eau.non_conformes >= 2 || (c.eau.prelevements && c.eau.non_conformes / c.eau.prelevements >= 0.2))) carte('eau', 1, 'Eau du robinet', `${c.eau.non_conformes} prélèvement${c.eau.non_conformes > 1 ? 's' : ''} non conforme${c.eau.non_conformes > 1 ? 's' : ''} sur ${c.eau.prelevements}`, 'Hub’Eau');

    /* ===== G. Urbanisme ===== */
    const zones = c.plu || null;
    if (zones && zones.length) {
      const z = zones[0], tz = String(z.typezone || z.libelle || '').toUpperCase();
      const agriN = /^(A|N)/.test(tz) && !/^AU/.test(tz);
      if (agriN) {
        const sansAnnexe = D.garage === false && D.atelier === false;   // gravité 2 seulement si l'on SAIT qu'il n'y a ni l'un ni l'autre
        carte('zonage', sansAnnexe ? 2 : 1, `Zone ${tz.startsWith('A') ? 'agricole' : 'naturelle'} (${z.libelle})`, 'Annexes et piscine encadrées', 'PLU',
          { q: [Q('mairie', 'Une annexe (garage, atelier) est-elle possible ?', `zone ${z.libelle}`)] });
      }
    } else if (zones && !zones.length) questionsLibres.push(Q('mairie', 'Quel document d’urbanisme s’applique ?', 'pas de PLU numérisé'));
    // Un PPR inondation à moins de 600 m, sans que le bien soit dedans (Digoin, la Loire) : à savoir, pas à craindre
    if (!(K.ppr_inondation > 0) && (c.servitudes || []).some(s => /^PM1/i.test(s.code) && /inond|PPRI/i.test(s.nom)))
      carte('inondation', 1, 'Zone inondable réglementée à proximité', 'PPR inondation à moins de 600 m · le bien est hors périmètre', 'servitudes');
    const ac1 = (c.servitudes || []).find(s => /^AC1/i.test(s.code));
    if (ac1) carte('abf', 2, 'Abords d’un monument historique', 'Travaux extérieurs soumis à l’architecte des Bâtiments de France', 'servitudes',
      { q: [Q('mairie', 'Contraintes ABF pour menuiseries, toiture, panneaux solaires ?', 'monument historique')] });
    const neuves = (c.permis || []).filter(p => p.memeRue && !p.bien && p.destination === 'habitation' && p.surf_hab >= 60 && mois(p.date, now) <= 36);
    if (neuves.length >= 3) carte('lotissement', 1, 'La rue se construit', `${neuves.length} logements autorisés depuis ${annee(neuves.map(p => p.date).sort()[0])}`, 'permis', { deduction: true });
    if (c.permis_incomplet) questionsLibres.push(Q('mairie', 'Autorisations d’urbanisme de la parcelle depuis 10 ans ?', 'liste des permis incomplète'));

    /* ===== H. Absences ===== */
    if (D.connexion == null) questionsLibres.push(Q('sur place', T.fibre ? 'Fibre raccordée ou seulement raccordable ?' : 'Fibre raccordable à l’adresse ?', 'connexion inconnue'));

    /* ===== Forces et faiblesses tirées des notes ===== */
    const mesure = {
      travail: () => `${(c.trajets && c.trajets.travail && c.trajets.travail.dest) || 'Travail'} à ${D.trajets.travail} min`,
      ecole: () => `École à ${D.trajets.ecole} min`, courses: () => `Supermarché à ${D.trajets.supermarche} min`, sport: () => `Salle de sport à ${D.trajets.sport} min`,
      budget: () => `Budget ${eur(R.budget)}`, marche: () => `Prix ${pct(R.ratio - 1)} vs médiane`,
      maison: () => `${Math.round(D.surface)} m², ${D.chambres} chambres`, dependances: () => D.garage && D.atelier ? 'Garage et atelier' : D.garage || D.atelier ? (D.garage ? 'Garage, sans atelier' : 'Atelier, sans garage') : 'Ni garage ni atelier',
      terrain: () => `Terrain de ${Math.round(D.terrain).toLocaleString('fr-FR')} m²`, isolement: () => D.voisin_m != null ? `Premier voisin à ${m(D.voisin_m)}` : 'Isolement',
      couts: () => `Coût estimé ${eur(R.mois)}/mois${D.taxe_fonciere_an ? '' : ' (énergie)'}`, connexion: () => ({ fibre: 'Fibre', fibre_prevue: 'Fibre prévue', '4g_bonne': '4G seulement', rien: 'Pas de bonne connexion' })[D.connexion]
    };
    R.criteres.forEach(x => {
      if (x.s == null) return;
      try {
        if (x.s >= 0.8 && !(x.id === 'marche' && R.ratio <= 0.85)) forces.push(mesure[x.id]());
        else if (x.s <= 0.3) faiblesses.push(mesure[x.id]());
      } catch (e) {}
    });

    /* ===== Assemblage : un thème = une carte, tri par gravité ===== */
    const parTheme = new Map();
    cartes.forEach(k => {
      const p = parTheme.get(k.theme);
      if (!p) { parTheme.set(k.theme, k); return; }
      const [haut, bas] = k.gravite > p.gravite ? [k, p] : [p, k];
      haut.q = [...haut.q, ...bas.q];
      parTheme.set(k.theme, haut);
    });
    const finales = [...parTheme.values()].sort((a, b) => b.gravite - a.gravite);
    const vues = new Set(), questions = [];
    [...finales.flatMap(k => k.q), ...questionsLibres].forEach(q => { if (!vues.has(q.texte)) { vues.add(q.texte); questions.push(q); } });
    return {
      cartes: finales.map(({ q, ...k }) => k),
      forces: [...new Set(forces)], faiblesses: [...new Set(faiblesses)], questions
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
