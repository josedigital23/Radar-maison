# Les règles du rapport

Le rapport de l'extension n'appelle aucune IA. Tout texte vient d'une règle qui lit une donnée publique sourcée.
Code : `extension/moteur/regles.js`. Tests : `tests/test_moteur.js` (`node --test tests/test_moteur.js`).

## Principes

- **Une donnée inconnue ne déclenche rien.** Seules les règles d'absence (fibre, assainissement) posent une question.
- **Un thème = une carte.** On garde la plus grave et on fusionne les questions.
- **Chaque carte porte un chiffre et sa source.** Une déduction porte le badge « déduction ».
- **Le texte de l'annonce ne déclenche jamais seul une carte de gravité 3** : il renforce ou formule une question.
- **5 cartes visibles au maximum**, classées par gravité, puis « + N autres ».

## Les règles (gravité ● à ●●●, D = déduction)

| Famille | Déclencheur | Carte | Question |
|---|---|---|---|
| Annonce / bases | Surface annoncée > DPE de plus de 15 % et plus de 10 m² | ●● Surface gonflée | Vendeur : quelles pièces ? Documents : DPE complet |
| | Surface en hausse entre deux DPE (+10 % dans une même base, +25 % entre bases) sans permis sur la parcelle | ●●● D Agrandissement non déclaré ? | Mairie : autorisé ? |
| | Deux DPE en moins de 18 mois, gain d'au moins 2 classes, sans permis | ●● D DPE refait | Vendeur : quels travaux, factures ? |
| | Grande route (importance 1-2) à moins de 100 m ; ●●● si l'annonce dit « au calme » | ●● | Sur place : bruit ? |
| | Terrain annoncé ≠ parcelle de plus de 20 % | — | Vendeur : quelles parcelles ? |
| Prix dans le temps | Vente de la parcelle dans les 5 ans (DVF) | ● ou ●● si plus de 25 % sans permis | Vendeur : travaux depuis l'achat ? |
| | Revente en moins de 2 ans | — | Vendeur : pourquoi si vite ? |
| | Visite du DPE il y a 9 à 36 mois | ● D En vente depuis longtemps ? | Vendeur : depuis quand ? |
| | Prix au m² 15 % ou plus sous la médiane | Force | Vendeur : pourquoi ce prix ? |
| Énergie | DPE F ou G | ●● Audit énergétique obligatoire | Documents : l'audit |
| | Chauffage au fioul | ● | Vendeur : âge de la chaudière ? |
| | DPE de l'annonce d'avant juillet 2021 | ●● DPE caduc | Documents : DPE en vigueur |
| Diagnostics | Toujours : une ligne calculée (DPE, état des risques, audit si F/G, plomb avant 1949, amiante avant 1998, électricité, gaz, assainissement) | — | Documents |
| Sol | Argiles fortes + sécheresse reconnue dans la commune (●● sans arrêté) | ●●● | Sur place : fissures ? Vendeur : sinistre indemnisé ? |
| | Argiles moyennes | — | Sur place : fissures ? |
| | Radon catégorie 3 ; ●●● si cave ou sous-sol dans l'annonce | ●● | Documents : mesure de radon ? |
| | Dans un PPR inondation | ●●● | Notaire, mairie |
| | Dans l'enveloppe inondable potentielle (●● si arrêté inondation depuis 2000) | ● | Vendeur : déjà inondée ? |
| | Hors enveloppe, au moins 4 arrêtés inondation depuis 2000 | ● | — |
| | PPR inondation à moins de 600 m, bien hors périmètre | ● | — |
| | Débordement de nappe | ●● | Sur place : cave humide ? |
| | Cavité ou mouvement de terrain à moins de 500 m | ●● | — |
| Voisinage | Élevage classé : < 500 m ●●●, < 1 km ●● | | Sur place : odeurs, épandages ? |
| | Exploitation agricole classée sans espèce déclarée, < 1 km | ● / ●● D | Sur place : odeurs ? |
| | Méthaniseur < 1 km, carrière < 2 km | ●● | Sur place |
| | Site Seveso < 5 km | ●●● | — |
| | Bâtiment agricole IGN < 100 m (sans installation classée) | ● | Vendeur : activité ? fait-il partie de la vente (< 30 m) ? |
| | Ligne ≥ 63 kV < 200 m, voie ferrée < 300 m, éolienne < 1,5 km | ● | — |
| | Ancien site industriel < 300 m | ●● | Vendeur : quelle activité ? potager ? |
| | Eau : au moins 2 prélèvements non conformes, ou 20 % | ● | — |
| Urbanisme | Zone A ou N ; ●● si ni garage ni atelier (connus) | ● | Mairie : annexe possible ? |
| | Servitude AC1 (abords de monument historique) | ●● | Mairie : contraintes ABF ? |
| | Au moins 3 logements autorisés dans la rue en 3 ans | ● D | — |
| | Pas de PLU numérisé | — | Mairie : quel document ? |
| Absences | Connexion inconnue | — | Sur place : fibre ? |

**Forces et faiblesses** : un critère noté 8/10 ou plus devient une force, 3/10 ou moins une faiblesse, avec sa mesure. S'y ajoutent « Sol et risques : rien à signaler » et « DPE A à C ».

## Calibrage du 10/10/2026 (8 biens réels)

Changy, Saint-Aubin, Digoin, Vendenesse, Moroges, Paray (route de Saint-Yan), Épinac, Artaix.

| Constat | Correction |
|---|---|
| « Inondations reconnues dans la commune » sur 8 biens sur 8 (arrêtés de 1982, 1999…) | On ne compte que depuis 2000 ; la carte n'est grave que dans l'enveloppe inondable |
| « Argiles moyennes + sécheresse » sur 6 biens sur 8 (2018-2020 a touché tout le 71) | Plus de carte, une question |
| « 1 prélèvement non conforme sur 10 » banal | Au moins 2, ou 20 % |
| Premier voisin à 5-20 m partout | Voisin = bâtiment d'habitation de 40 m² ou plus, mesuré mur à mur ; hors bourg, un bâtiment à 2-15 m est une dépendance probable |
| Point d'adresse hors de toute parcelle (Digoin) | Parcelle de la maison la plus proche, à moins de 40 m |
| Itinéraires vides en collecte complète (HTTP 429 de l'IGN) | 2 appels simultanés au plus vers l'IGN, 3 tentatives |
| Exploitations agricoles classées sans espèce (GAEC, EARL) | Tag « agricole », carte en déduction |
| Deux maisons visitées le même jour (98 et 79) toutes deux « Très probable » | Même jour de visite **et** score d'au moins 90 |
| Dates de catastrophe naturelle en JJ/MM/AAAA | Converties à la collecte |

Trouvailles réelles que les règles ont fait remonter : l'ancienne usine Eternit à 11 m (Paray), une décharge de pneus à 87 m (Artaix), une carrière à 839 m (Vendenesse), les abords d'un monument historique (Épinac), la surface gonflée de 53 % (Digoin).

## Sources juridiques des règles « obligations »

- Audit énergétique à la vente des maisons F et G depuis le 1er avril 2023 : [ministère de la Transition écologique](https://www.ecologie.gouv.fr/politiques-publiques/diagnostic-performance-energetique-dpe).
- Location interdite : G depuis 2025, F en 2028, E en 2034 : [ministère, guide FALC](https://www.ecologie.gouv.fr/sites/default/files/falc/passoires_energetiques_FALC.pdf).
- Pas de chaudière fioul neuve depuis le 1er juillet 2022 ; réparer l'existante reste permis : [Effy](https://www.effy.fr/pro/actualite/fin-des-nouvelles-chaudieres-au-fioul-le-decret-est-paru).
- Plomb (avant 1949), amiante (permis avant juillet 1997), assainissement non collectif (contrôle de moins de 3 ans), électricité et gaz (plus de 15 ans) : [construires.fr](https://www.construires.fr/diagnostics-immobiliers-obligatoires/).
