/* Tests du moteur — lancer : node --test tests/
   Chaque cas reprend une situation rencontrée lors du calibrage sur biens réels du 10/10/2026
   (Changy, Saint-Aubin, Digoin, Vendenesse, Moroges, Paray, Épinac, Artaix). Les données sont réduites
   et sans adresse : on fige le comportement des règles, pas les biens. */
const test = require('node:test');
const assert = require('node:assert');
const M = require('../extension/moteur/collecte.js');
require('../extension/moteur/notation.js');
require('../extension/moteur/regles.js');

const AUJ = '2026-10-10';
const base = over => Object.assign({
  dpe: { surface_habitable_logement: 108, etiquette_dpe: 'E', cout_total_5_usages: 2817, date_visite_diagnostiqueur: '2026-01-22', periode_construction: '1948-1974', type_energie_principale_chauffage: 'Gaz naturel', description_installation_chauffage_n1: 'Chaudière gaz' },
  parcelle: { contenance: 682 }, isolement: { voisin_m: 30, voisins_m: [30, 60], maisons_100m: 6, maisons_250m: 20 },
  trajets: { travail: { dest: 'Lycée', min: 18, km: 13 }, ecole: { min: 3 }, supermarche: { min: 5 }, depannage: { min: 2 }, autre_salle: { min: 6 } },
  dvf: { comparables: [], ventes_du_bien: [] }, georisques: { catnat: [], argiles: 'Exposition faible', radon: '1', icpe: [], casias: [] },
  brgm: { argiles: 'faible', eaip: 0, ppr_inondation: 0, nappe: "Pas de débordement de nappe ni d'inondation de cave", cavites_m: [], mvt_m: [] },
  plu: [{ libelle: 'Uc2', typezone: 'U' }], servitudes: [], permis: [], historique_dpe: [], eau: { prelevements: 10, non_conformes: 0 }, routes: [], lignes: [], agricoles_m: []
}, over);
const analyser = (c, annonce) => { const a = Object.assign({ prix: 189000 }, annonce); const D = M.construireDossier(c, a); const R = M.noter(D); return { D, R, X: M.regles(c, D, R, a, AUJ) }; };
const theme = (X, t) => X.cartes.find(k => k.theme === t);

test('Digoin : surface gonflée, radon, pas de carte argiles moyennes, question fissures', () => {
  const c = base({ georisques: { catnat: [{ date: '2018-07-01', libelle: 'Sécheresse' }, { date: '2003-12-01', libelle: 'Inondations et/ou Coulées de Boue' }, { date: '2008-11-02', libelle: 'Inondations et/ou Coulées de Boue' }, { date: '2021-06-01', libelle: 'Inondations et/ou Coulées de Boue' }, { date: '2024-10-17', libelle: 'Inondations et/ou Coulées de Boue' }], argiles: 'Exposition moyenne', radon: '3', icpe: [], casias: [] },
    brgm: { argiles: 'moyenne', eaip: 0, ppr_inondation: 0, cavites_m: [], mvt_m: [] }, servitudes: [{ code: 'PM1', nom: 'PM1_PPRI-DE-LA-LOIRE' }] });
  const { X } = analyser(c, { surface: 165, texte: 'Maison au calme, 4 chambres, garage, cave.' });
  assert.match(theme(X, 'surface').detail, /\+53 %/);
  assert.strictEqual(theme(X, 'radon').gravite, 3, 'radon 3 + cave dans l’annonce');
  assert.ok(!theme(X, 'sol'), 'argiles moyennes : pas de carte (bruit sur tout le 71)');
  assert.ok(X.questions.some(q => /Fissures/.test(q.texte)));
  assert.strictEqual(theme(X, 'inondation').gravite, 1, '4 arrêtés depuis 2000, hors enveloppe : gravité 1');
});

test('Inondation : des arrêtés anciens ne font pas de carte', () => {
  const c = base({ georisques: { catnat: [{ date: '1982-11-01', libelle: 'Inondations et coulées de boue' }, { date: '1999-12-25', libelle: 'Inondations et coulées de boue' }], argiles: 'Exposition faible', radon: '1', icpe: [], casias: [] } });
  assert.ok(!theme(analyser(c).X, 'inondation'));
});

test('Zone inondable potentielle + arrêté récent : gravité 2 ; PPR : gravité 3', () => {
  const cat = [{ date: '2016-06-01', libelle: 'Inondations et coulées de boue' }];
  const X1 = analyser(base({ georisques: { catnat: cat, argiles: '', radon: '1', icpe: [], casias: [] }, brgm: { argiles: 'faible', eaip: 2, ppr_inondation: 0 } })).X;
  assert.strictEqual(theme(X1, 'inondation').gravite, 2);
  const X2 = analyser(base({ brgm: { argiles: 'faible', eaip: 2, ppr_inondation: 1 } })).X;
  assert.strictEqual(theme(X2, 'inondation').gravite, 3);
});

test('Vendenesse : argiles fortes + sécheresse reconnue = gravité 3, et la dépendance n’est pas un voisin', () => {
  const c = base({ georisques: { catnat: [{ date: '2018-07-01', libelle: 'Sécheresse' }, { date: '2020-07-01', libelle: 'Sécheresse' }], argiles: 'Exposition forte', radon: '3', icpe: [], casias: [] },
    brgm: { argiles: 'forte', eaip: 0, ppr_inondation: 0 }, isolement: { voisin_m: 8, voisins_m: [8, 40, 90], maisons_100m: 3, maisons_250m: 12 } });
  const { X, D } = analyser(c);
  assert.strictEqual(theme(X, 'sol').gravite, 3);
  assert.match(theme(X, 'sol').detail, /2018, 2020/);
  assert.strictEqual(D.voisin_m, 40);
  assert.strictEqual(D.voisin_dependance, 8);
});

test('En bourg, un voisin à 8 m reste un voisin', () => {
  const { D } = analyser(base({ isolement: { voisin_m: 8, voisins_m: [8, 9], maisons_100m: 20, maisons_250m: 60 } }));
  assert.strictEqual(D.voisin_m, 8);
});

test('Paray : ancien site industriel à 11 m', () => {
  const { X } = analyser(base({ georisques: { catnat: [], argiles: '', radon: '1', icpe: [], casias: [{ nom: 'ETERNIT', d: 11 }] } }));
  assert.match(theme(X, 'pollution').detail, /ETERNIT à 11 m/);
});

test('Exploitation agricole classée sans espèce déclarée : carte en déduction', () => {
  const { X } = analyser(base({ georisques: { catnat: [], argiles: '', radon: '1', icpe: [{ nom: 'GAEC X', d: 450, tags: ['agricole'] }], casias: [] } }));
  const k = theme(X, 'elevage');
  assert.strictEqual(k.gravite, 2); assert.ok(k.deduction);
});

test('Eau : un prélèvement non conforme sur 10 ne fait pas de carte, trois oui', () => {
  assert.ok(!theme(analyser(base({ eau: { prelevements: 10, non_conformes: 1 } })).X, 'eau'));
  assert.ok(theme(analyser(base({ eau: { prelevements: 10, non_conformes: 3 } })).X, 'eau'));
});

test('Déjà vendue récemment : plus-value chiffrée et question sur les travaux', () => {
  const { X } = analyser(base({ dvf: { comparables: [], ventes_du_bien: [{ date: '2023-05-02', valeur: 120000 }] } }));
  // toLocaleString('fr-FR') sépare les milliers par une espace fine insécable : on normalise avant de comparer
  assert.match(theme(X, 'historique-prix').detail.replace(/[\u202f\u00a0]/g, ' '), /120 000 € en 2023 · demandé 189 000 € \(\+58 %\)/);
  assert.ok(X.questions.some(q => /travaux depuis l'achat en 2023/.test(q.texte)));
});

test('DPE refait F → D en 7 mois sans permis : déduction', () => {
  const { X } = analyser(base({ historique_dpe: [{ date: '2025-01-10', etiquette: 'F', surface: 108, base: 'récente' }, { date: '2025-08-10', etiquette: 'D', surface: 108, base: 'récente' }] }));
  const k = theme(X, 'dpe-refait'); assert.ok(k.deduction); assert.match(k.detail, /F → D en 7 mois/);
});

test('Agrandissement sans autorisation : gravité 3 ; entre deux bases, +25 % exigés', () => {
  const X1 = analyser(base({ historique_dpe: [{ date: '2022-01-10', etiquette: 'E', surface: 90, base: 'récente' }, { date: '2025-08-10', etiquette: 'E', surface: 120, base: 'récente' }] })).X;
  assert.strictEqual(theme(X1, 'surface').gravite, 3);
  // Digoin réel : 113 m² (ancienne base, thermique) → 127,6 → 108 : rien
  const X2 = analyser(base({ historique_dpe: [{ date: '2018-05-23', etiquette: 'E', surface: 113.34, base: 'ancienne' }, { date: '2024-06-20', etiquette: 'E', surface: 127.6, base: 'récente' }, { date: '2026-01-22', etiquette: 'E', surface: 108, base: 'récente' }] })).X;
  assert.ok(!theme(X2, 'surface'));
});

test('Un thème = une carte, la plus grave, questions fusionnées', () => {
  const c = base({ historique_dpe: [{ date: '2022-01-10', etiquette: 'E', surface: 90, base: 'récente' }, { date: '2025-08-10', etiquette: 'E', surface: 120, base: 'récente' }] });
  const { X } = analyser(c, { surface: 160 });
  assert.strictEqual(X.cartes.filter(k => k.theme === 'surface').length, 1);
  assert.ok(X.questions.some(q => /pièces comptent/.test(q.texte)) && X.questions.some(q => /agrandissement/.test(q.texte)));
});

test('Dossier de diagnostics calculé : plomb avant 1949, audit si F/G, une seule ligne', () => {
  const { X } = analyser(base({ dpe: { surface_habitable_logement: 120, etiquette_dpe: 'G', periode_construction: 'avant 1948', type_energie_principale_chauffage: 'Fioul domestique', cout_total_5_usages: 4000 } }));
  const ddt = X.questions.filter(q => /^Dossier de diagnostics/.test(q.texte));
  assert.strictEqual(ddt.length, 1);
  assert.match(ddt[0].texte, /audit énergétique, plomb, amiante/);
  assert.ok(theme(X, 'energie') && theme(X, 'chauffage'));
});

test('Note provisoire sous 60 % de critères ; aucune valeur inventée', () => {
  const D = M.construireDossier({}, { prix: 200000 });
  const R = M.noter(D);
  assert.ok(R.provisoire); assert.strictEqual(R.verdict, null);
  assert.strictEqual(D.garage, null, 'garage inconnu reste inconnu');
});

test('Corrections : elles priment sur les données et complètent la note', () => {
  const c = base({});
  const sans = M.noter(M.construireDossier(c, { prix: 189000 }));
  const avec = M.noter(M.construireDossier(c, { prix: 189000 }, M.PROFIL, { chambres: 4, style: 'pierre_charme', garage: true, atelier: false, connexion: 'fibre' }));
  assert.ok(avec.couverture > sans.couverture);
  assert.strictEqual(avec.groupes.find(g => g.id === 'maison').complet, true);
});

test('Lecture du texte : jamais « non » par simple absence', () => {
  const T = M.lireTexte('Maison 4 chambres, garage, terrain de 1 200 m², fosse septique, au calme');
  assert.deepStrictEqual([T.chambres, T.garage, T.terrain, T.assainissementIndividuel, T.calme], [4, true, 1200, true, true]);
  assert.strictEqual(T.atelier, undefined);
});

test('DVF : lecture des CSV, une maison par vente, filtres de prix, vente du bien retrouvée', async () => {
  const entete = 'id_mutation,date_mutation,nature_mutation,valeur_fonciere,adresse_numero,adresse_nom_voie,id_parcelle,type_local,surface_reelle_bati,surface_terrain,longitude,latitude';
  const csv = [entete,
    '2024-1,2024-03-01,Vente,150000,3,RUE A,71176000AH0100,Maison,110,500,3.9925,46.4745',
    '2024-1,2024-03-01,Vente,150000,3,RUE A,71176000AH0100,Dépendance,,500,3.9925,46.4745',
    '2024-2,2024-05-01,Vente,9000,5,RUE B,71176000AH0101,Maison,90,300,3.9930,46.4750',          // < 12 000 € : écartée
    '2024-3,2024-06-01,Vente,"250000",7,RUE C,71176000AH0102,Maison,100,400,3.9940,46.4760',
    '2024-3,2024-06-01,Vente,"250000",7,RUE C,71176000AH0103,Maison,95,400,3.9941,46.4761',     // deux maisons : écartée
    '2024-4,2024-07-01,Vente,130000,9,RUE D,71176000AH0104,Maison,120,600,3.9950,46.4770',
    '2024-5,2024-08-01,Vente,140000,11,RUE E,71176000AH0105,Maison,105,600,3.9960,46.4780',
    '2024-6,2024-09-01,Vente,120000,7,RUE DE LA FONTAINE,71176000AH0200,Maison,108,682,3.991935,46.474281'].join('\n');
  const io = { json: async () => ({ err: 'hors test' }), texte: async u => /\/2024\/communes\/71\/71176\.csv$/.test(u) ? csv : null };
  const c = await M.collecter({ lon: 3.991935, lat: 46.474281, insee: '71176', surf: 108 }, io, null, { parties: ['dvf'] });
  assert.strictEqual(c.dvf.annees_lues, 1);
  assert.strictEqual(c.dvf.ventes_maisons, 4);
  assert.strictEqual(c.dvf.comparables.length, 4);
  assert.deepStrictEqual(c.dvf.ventes_du_bien, [{ date: '2024-09-01', valeur: 120000 }]);
});
