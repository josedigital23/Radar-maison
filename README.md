# Radar Maison

Outils personnels d'analyse d'annonces immobilières en Saône-et-Loire (71) : retrouver l'adresse réelle d'une annonce, rassembler toutes les données publiques sur le bien et son environnement, et produire un rapport visuel noté sur 100 avec des questions pour la visite.

## Les composants

| Composant | Rôle | État |
|---|---|---|
| **Extension Radar Maison** (Firefox, Manifest v2) | Panneau sur les annonces Leboncoin et SeLoger : adresse par le DPE, comparables DVF. Blocs Géorisques et PLU encore vides. | v1.14+, code pas encore dans ce dépôt |
| **Veille** | Agrège les alertes e-mail des portails (PHP + MySQL, OVH). | En construction |
| **`analyse/`** (ce dépôt) | Scripts de collecte, de risques et de rapport. Utilisés par la skill Claude « analyse-maison » ; réutilisables par l'extension. | Fonctionnel, testé sur 3 biens le 10/10/2026 |

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
python3 analyse/rapport.py data.json rapport.html
```

### Règles de notation
- **Rien d'incertain n'est noté.** Une donnée inconnue ou contradictoire vaut `null` : le critère s'affiche « à déterminer », la note globale est calculée sur les critères connus (la part notée est affichée), et le doute devient une question pour la visite.
- **Pas de verdict sous 60 % de critères notés.** La note reste visible, en gris, avec la mention « Note provisoire — données insuffisantes ». Sans ce seuil, un prix seul donnait 100/100 « Très bonne affaire ».
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

## Prochaines étapes

1. **Mettre le code de l'extension dans ce dépôt** (dossier `extension/`), tel quel.
2. **Brancher les scripts sur l'écran 2 de l'extension** : remplir les blocs Géorisques et PLU, puis ajouter trajets, historique DPE et permis. Spécification et maquette d'abord, puis feu vert, puis code.
3. **Traduire `rapport.py` en JavaScript** pour que l'extension produise le rapport sans Claude (usage par la compagne, sans compte).
4. **Questions pour la visite générées par règles**, sans IA : radon catégorie 3, bâtiment agricole à moins de 100 m, surface du DPE qui augmente sans autorisation, annonce contradictoire, nappe et caves, argiles et fissures…
5. **Nouvelles sources à intégrer** : photos aériennes historiques IGN (1950 → aujourd'hui, pour dater extensions et piscines), base nationale des bâtiments BDNB (année, matériaux, potentiel solaire et géothermie), effectifs des écoles, couverture mobile ARCEP, fibre à l'adresse.
6. **Accélérer la skill** : lancer collecte, Géorisques et BRGM en parallèle ; photo aérienne seulement en cas de doute ; vérification de la fibre intégrée à la collecte.
7. **Veille** : terminer les analyseurs SeLoger, Green Acres et LocationAd71.
