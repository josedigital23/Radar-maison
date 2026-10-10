# Radar Maison

Outils personnels d'analyse d'annonces immobilières en Saône-et-Loire (71) : retrouver l'adresse réelle d'une annonce, rassembler toutes les données publiques sur le bien et son environnement, et produire un rapport visuel noté sur 100 avec des questions pour la visite.

## Les composants

| Composant | Rôle | État |
|---|---|---|
| **Extension Radar Maison** (`extension/`, Chrome MV3 et Firefox MV2) | Écran 1 : l'adresse par le DPE. Écran 2 : le rapport détaillé (note, 8 anneaux, points d'attention, questions pour la visite), sans IA. | v2.0 |
| **Veille** | Agrège les alertes e-mail des portails (PHP + MySQL, OVH). | En construction |
| **`analyse/`** (ce dépôt) | Scripts de collecte, de risques et de rapport. Utilisés par la skill Claude « analyse-maison » ; réutilisables par l'extension. | Fonctionnel, testé sur 3 biens le 10/10/2026 |

## L'extension `extension/`

Un seul code pour les deux navigateurs ; seuls le manifest et le script de fond diffèrent (`chrome/`, `firefox/`).

| Fichier | Rôle |
|---|---|
| `content.js` | Lecture de l'annonce, recherche de l'adresse dans l'ADEME, écran 1 |
| `rapport.js` | Style commun et écran 2 : note, anneaux, détail éditable, points d'attention, questions |
| `moteur/collecte.js` | Toutes les données publiques autour du bien (même code que la console et les tests) |
| `moteur/notation.js` | Le dossier du bien, la note sur 100, les 8 anneaux ; profil personnel (`PROFIL`) |
| `moteur/regles.js` | Les règles qui écrivent le rapport : voir [`docs/regles.md`](docs/regles.md) |

Le rapport se remplit au fil de la collecte (2 à 4 s sur les biens testés). Les corrections faites dans le détail d'un anneau et les questions cochées sont gardées par bien, dans le navigateur.

```bash
python3 extension/assembler.py     # → dist/radar-maison-chrome/ et dist/radar-maison-firefox/ (+ .zip)
```

- **Chrome** : `chrome://extensions` → mode développeur → « Charger l'extension non empaquetée » → `dist/radar-maison-chrome`. Pas à pas complet : `extension/chrome/INSTALLER-CHROME.txt`.
- **Firefox** : `about:debugging#/runtime/this-firefox` → « Charger un module complémentaire temporaire » → `dist/radar-maison-firefox/manifest.json`.

Le design turquoise / Montserrat d'août 2026 n'est **pas** dans ce code : la version la plus récente retrouvée (zip Chrome du 09/10/2026) a encore le style « plan » d'origine.

## Les scripts `analyse/`

Les trois scripts JavaScript s'exécutent dans une page `https://data.geopf.fr` (ou `georisques.gouv.fr` pour le second), après avoir défini `window.P`. Ils tournent en arrière-plan et déposent un JSON compact dans une variable globale.

| Fichier | Entrée `window.P` | Sortie | Contenu |
|---|---|---|---|
| `collecte.js` | `lon, lat, insee, surf, dpe, dest{…}, exclureSalle` | `window.__R` | Parcelle, zonage PLU, servitudes, DPE détaillé, **historique des DPE à l'adresse**, trajets (destinations passées en paramètre, école publique, supermarché, boulangerie, salle de sport), bâti IGN (voisin, maisons à 100/250 m, bâtiments agricoles), lignes HT, routes, voie ferrée, antennes, carburants, taux de taxe foncière, eau potable, comparables DVF et ventes de la parcelle, **autorisations d'urbanisme** (même rue, parcelle du bien, bâtiments agricoles). |
| `georisques.js` | `lon, lat, insee` | `window.__G` | Rapport Géorisques à l'adresse, arrêtés de catastrophe naturelle, argiles, radon, installations classées à 5 km (élevage, méthanisation, carrière, Seveso), anciens sites industriels, cavités, mouvements de terrain. |
| `risques.js` | `lon, lat` | `window.__K` | Secours via le BRGM quand Géorisques est inaccessible : argiles, remontée de nappe, enveloppe des inondations potentielles, PPR inondation, cavités, mouvements de terrain, sites pollués, séisme. |
| `rapport.py` | `data.json` | HTML | Note sur 100 (critères sur 10, pondérés), rapport visuel en 11 sections : points d'attention, forces/faiblesses classées, **questions pour la visite**, note par critère, schéma des trajets, budget, coûts mensuels, comparables DVF, DPE, environnement, location. |

Utilisation type, depuis la console d'une page `data.geopf.fr` :

```js
window.P = {lon: 4.2667, lat: 46.4787, insee: '71021', surf: 192, dpe: '2471E2994323D',
  dest: {travail: {nom: 'Bureau', c: [4.12, 46.45]}}, exclureSalle: ''};
eval(await (await fetch('https://raw.githubusercontent.com/josedigital23/Radar-maison/main/analyse/collecte.js')).text());
// quelques secondes plus tard : JSON.parse(window.__R)
```

```bash
python3 analyse/rapport.py data.json rapport.html                  # critères de Victorien (analyse/profil.json)
python3 analyse/rapport.py data.json rapport.html profil-autre.json # critères de quelqu'un d'autre
python3 -m unittest discover tests                                  # 5 tests du rapport Python
node --test tests/test_moteur.js                                    # 17 tests du moteur de l'extension
```

`profil.json` porte ce qui est personnel : budget (confortable / acceptable / plafond), surface et chambres minimales, seuil de verdict.

### Règles de notation
- **Rien d'incertain n'est noté.** Une donnée inconnue ou contradictoire vaut `null` : le critère s'affiche « à déterminer », la note globale est calculée sur les critères connus (la part notée est affichée), et le doute devient une question pour la visite.
- **Pas de verdict sous 60 % de critères notés** (réglable dans le profil). La jauge affiche « ? provisoire » et le chiffre partiel passe dans l'étiquette. Sans ce seuil, un prix seul donnait 100/100 « Très bonne affaire ».
- **Une valeur inconnue s'affiche « ? »**, jamais ✗, « Non » ou 0 : un garage inconnu n'est pas un garage absent.
- Une dépense supposée (`"certain": false`) est affichée mais **hors budget**. Un coût non sourcé va dans `couts_indicatifs`, hors note.
- Les risques et nuisances ne changent pas la note : ils sont listés comme points d'attention, avec distance et source.

## Sources de données (toutes publiques, testées le 10/10/2026)

| Donnée | Source |
|---|---|
| DPE et historique par adresse | ADEME `dpe03existant` et `dpe-france` |
| Adresses | Base Adresse Nationale (`api-adresse.data.gouv.fr`) |
| Cadastre, PLU, servitudes | IGN API Carto (`apicarto.ign.fr`) |
| Itinéraires, bâti, routes, lignes, photos aériennes | IGN Géoplateforme (`data.geopf.fr`) |
| Ventes immobilières | DVF Etalab (`app.dvf.etalab.gouv.fr`) |
| Autorisations d'urbanisme | SDES, via l'API tabulaire de data.gouv.fr |
| Commerces, salles de sport | Annuaire des entreprises (`recherche-entreprises.api.gouv.fr`) |
| Écoles | Annuaire de l'éducation (`data.education.gouv.fr`) |
| Carburants, taxe foncière | `data.economie.gouv.fr` |
| Eau potable | Hub'Eau |
| Risques | Géorisques ; BRGM (`mapsref.brgm.fr`) en secours |

Pièges connus :
- **Géorisques filtre par pays** : avec un VPN hors de France, le site refuse la connexion. Couper le VPN ou utiliser `risques.js`.
- Overpass (OpenStreetMap) est souvent saturé : remplacé par l'annuaire des entreprises.
- La photo aérienne avec le cadastre doit être demandée en **PNG** (le JPEG est refusé).
- La recherche ponctuelle (GetFeatureInfo) du BRGM sur les argiles renvoie « aucun résultat » même en zone forte : utiliser le WFS, comme `risques.js`.
- Le lieu-dit d'une annonce est rarement dans la base d'adresses : passer par le DPE.
- **Ancienne base DPE (`dpe-france`)** : `code_insee_commune_actualise` contient tantôt l'INSEE, tantôt le **code postal** (Paray : 311 DPE sous 71342, 72 sous 71600). Et `geo_adresse` n'accepte que l'adresse **entière et exacte** : `geo_adresse:"14 Rue Parmentier"` → 0, `"14 Rue Parmentier"` en texte libre → 2. Syntaxe qui marche : `code_insee_commune_actualise:(71342 OR 71600) AND "14 Rue Parmentier"` ; la forme `(champ:A OR champ:B) AND "…"` fait ignorer toute la requête (10,7 millions de résultats).
- **Communes nouvelles** : les sections DVF se construisent avec `com_abs` + section (`000` + `0A`), pas en complétant par des zéros.

Le cadre du projet et le journal des décisions sont dans [`docs/PROJET_REGLES_DU_JEU.md`](docs/PROJET_REGLES_DU_JEU.md).

## Prochaines étapes

1. ~~Mettre le code de l'extension dans ce dépôt~~ → fait le 10/10/2026 (v1.15).
2. ~~Brancher les scripts sur l'écran 2~~ → fait le 10/10/2026 (v2.0).
3. ~~Le rapport sans Claude~~ → fait : `moteur/` en JavaScript. `analyse/rapport.py` reste pour la skill ; les deux notations divergent sur les coûts (l'extension note l'énergie seule tant que la taxe foncière n'est pas saisie).
4. ~~Questions générées par règles~~ → fait, calibré sur 8 biens réels : [`docs/regles.md`](docs/regles.md).
4 bis. **Tester la lecture DVF dans l'extension installée** : elle n'a pas pu être testée en réel (le navigateur de test refuse ces fichiers), seulement sur un CSV d'exemple.
4 ter. **Page d'options** : destination travail, budget, critères d'un autre profil (aujourd'hui dans `moteur/notation.js`, `PROFIL`).
5. **Nouvelles sources à intégrer** : photos aériennes historiques IGN (1950 → aujourd'hui, pour dater extensions et piscines), base nationale des bâtiments BDNB (année, matériaux, potentiel solaire et géothermie), effectifs des écoles, couverture mobile ARCEP, fibre à l'adresse.
6. **Accélérer la skill** : lancer collecte, Géorisques et BRGM en parallèle ; photo aérienne seulement en cas de doute ; vérification de la fibre intégrée à la collecte.
7. **Veille** : terminer les analyseurs SeLoger, Green Acres et LocationAd71.
