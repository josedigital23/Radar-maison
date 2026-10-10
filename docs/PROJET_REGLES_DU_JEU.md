# Projet "Radar Maison" — Cadre & règles du jeu

> **Document maître.** À relire au début de chaque conversation du projet, avant toute proposition ou tout code.
> Version 0.1 — 12/07/2026 — statut : brouillon à valider

---

## 1. Vision (en une phrase)

Un outil simple, accessible et partageable qui, à partir d'une annonce de maison en vente en ligne, remonte **le maximum d'informations utiles** sur le bien — au-delà de ce que dit l'annonce.

**Exemple concret de ce qu'on vise :**
Je colle `https://www.leboncoin.fr/ad/maisons/xxxxxxx` → l'outil me sort une fiche : prix / m², DPE, année de construction probable, risques naturels (inondation, retrait-gonflement des argiles), zonage PLU, distance école / gare / commerces, historique du prix de l'annonce, photos analysées (état, exposition), etc.

## 2. Périmètre

**Dans le périmètre (à ce stade)**
- Point d'entrée : **une URL d'annonce**.
- Si l'URL est protégée (DataDome, Cloudflare, login) : **solution de repli à définir** (ex. copier-coller du texte de l'annonce, extension navigateur, capture d'écran, saisie manuelle adresse + prix).
- Enrichissement via sources ouvertes (à qualifier une par une).
- Restitution : une fiche lisible, partageable.

**Hors périmètre (pour l'instant)**
- Estimation de valeur "à la Meilleurs Agents" (peut revenir plus tard comme feature).
- Comptes utilisateurs, paiement, mobile natif.
- Scraping massif / veille automatique multi-annonces.

## 3. Solution envisagée (hypothèse, pas une décision)

- **App web.** Design réalisé avec **Claude Design**.
- Hébergement vs. standalone : **question ouverte**, tranchée plus tard.
- Rien n'est figé : chaque brique se justifie par une feature validée.

## 4. Méthode

Agile, par petits pas :
1. On isole **une** feature.
2. On la cadre (besoin → solution).
3. On la teste.
4. On **garde ou on jette**. Pas de produit fini au départ, pas de dette de complaisance.

## 5. Règles de collaboration (non négociables)

| # | Règle |
|---|-------|
| R1 | **Claude ne code pas avant un GO explicite** de l'utilisateur. |
| R2 | Le GO ne peut être demandé que si la feature est **définie : le contenu (quoi, quelles données, quel résultat) ET le contenant (où, sous quelle forme, quelle UI)**. |
| R3 | Ordre imposé : **cadrer le besoin → cadrer la solution → demander le GO → déployer**. Jamais de raccourci. |
| R4 | Claude relit ce document à chaque ouverture de conversation et signale s'il s'écarte du cadre. |
| R5 | On raisonne par **exemples concrets**, pas par abstraction. Une feature se décrit par un cas d'usage réel, pas par un concept. |
| R6 | Toute décision structurante est ajoutée au **journal des décisions** (§7) et ce document est mis à jour. |

## 6. Définition d'une feature "prête pour le GO"

Une feature est cadrée quand on peut répondre à :
- **Cas d'usage** : "En tant que X, je colle Y, j'obtiens Z, ça me sert à décider W."
- **Contenu** : quelles données exactes, depuis quelle source, quelle fiabilité, quel coût.
- **Contenant** : où ça s'affiche, sous quelle forme, quelle interaction.
- **Critère de succès** : à quoi on voit qu'on garde… ou qu'on jette.
- **Coût / risque** : effort, dépendance externe, blocage technique (anti-bot, API payante, RGPD).

## 7. Journal des décisions

| Date | Décision | Raison |
|------|----------|--------|
| 12/07/2026 | Point d'entrée = URL d'annonce | Le plus simple à partager et à utiliser |
| 12/07/2026 | App web, design via Claude Design | Accessibilité + partage |
| 12/07/2026 | Utilisateurs = moi + mes proches, via partage de lien | Pas de compte / pas d'auth / pas de monétisation à prévoir |
| 12/07/2026 | **Feature 1 « Détection d'adresse » : VALIDÉE** sur cas réel (annonce Charolles → Vendenesse-lès-Charolles) | 15 M de DPE → 2 candidats → 1 bonne adresse, en une requête |
| 12/07/2026 | Source : API ADEME open data, dataset `dpe03existant` | Gratuit, sans clé, licence Etalab, adresse BAN complète |
| 12/07/2026 | **On cherche par département (`code_departement_ban`), jamais par commune** | L'annonce affiche souvent une commune fausse ou approximative (piège du code postal partagé) |
| 12/07/2026 | **Correctif : la commune annoncée est un CENTRE, pas un filtre** — rayon réglable (défaut 15 km), géocodage BAN, distance dans le score | Chercher tout le département génère trop de bruit. L'agence ment sur le point, pas sur le secteur : Vendenesse est à 8 km de Charolles, pas à 80. |
| 12/07/2026 | ~~**Deux clés d'entrée possibles : la facture €/an OU la conso `conso_5_usages_par_m2_ep`**~~ → **INVALIDÉ le 13/07** : la conso annoncée n'est pas celle du DPE. | On croyait l'entier recopié sans retouche. Il ne l'est pas. |
| 12/07/2026 | Livrable v1 = **page HTML autonome** (`radar-maison.html`), zéro hébergement | Test de l'usage avant tout investissement d'infra |
| 12/07/2026 | **Confirmé : la page autonome peut interroger l'ADEME et la BAN sans serveur** | Testé en conditions réelles. L'option « sans hébergement » tient debout. |
| 12/07/2026 | Le vrai secteur est **dans la description**, pas dans le champ commune (« à proximité de Charolles », « aux portes de Paray ») → l'outil détecte tous les lieux cités et l'utilisateur choisit le centre | La machine repère les indices, l'humain lit l'annonce |
| 12/07/2026 | **Limite assumée : les annonces à DPE d'avant juillet 2021 sont peu exploitables.** Adresse absente ~1 fois sur 2, surface *thermique* ≠ habitable, années d'avant-guerre toutes tassées sur 1947/1948. | Ne pas investir à fiabiliser l'ancienne base. Elle reste branchée, sans garantie. |
| 12/07/2026 | Piste ouverte (non cadrée) : **« ce que l'annonce ne vous dit pas »** — si l'annonce affiche un DPE périmé, aller chercher le DPE en vigueur à l'adresse trouvée | Tous les DPE d'avant juillet 2021 sont caducs depuis le 01/01/2025 : une annonce qui en affiche un est en défaut |
| 12/07/2026 | **La fourchette € de l'annonce = `cout_total_5_usages` ± 15 %** → on reconstruit la valeur centrale | C'est LE filtre discriminant : `min/0,85` à `max/1,15` |
| 12/07/2026 | Filtres retenus : `type_batiment`, `code_departement_ban`, `surface_habitable_logement` (±2), `cout_total_5_usages` (fourchette reconstruite) | Suffisant pour tomber à 1-3 candidats |
| 12/07/2026 | Le chauffage n'est **pas** un filtre primaire | Saisie du diagnostiqueur incertaine (poêle d'appoint, bi-énergie) |
| 12/07/2026 | Validation finale = **humaine** (vue aérienne / Street View vs photos de l'annonce) | Œil humain plus fiable et gratuit ; pas de dépendance API payante |
| 12/07/2026 | Le fetch serveur de Leboncoin **passe** (à date) | À ne pas considérer comme acquis : plan B = copier-coller / bookmarklet |
| 13/07/2026 | **INVALIDÉ : « la conso primaire est un entier quasi exact »** — l'annonce la gonfle. Changy : 413 annoncés, 386,7 au DPE (+7 %). Saint-Aubin : 71 annoncés, 58,8 au DPE (+21 %). | Deux cas réels sur deux. Notre filtre à ±1,5 excluait la bonne maison. Tolérance portée à ±25 %, et la conso descend au rang d'indice. |
| 13/07/2026 | **INVALIDÉ : les étiquettes DPE/GES** — Saint-Aubin : annonce B/A, base A/A. | Elles ne filtrent plus jamais. Score seul, et sans pénalité en cas de désaccord. |
| 13/07/2026 | **NOUVEAU PILIER nº 1 : la date du diagnostic.** Jour exact à Vitry et Saint-Aubin, J+8 à Changy. | L'annonce donne la date de *visite*, la base la date d'*établissement* : fenêtre J−3 → J+30. Filtre dur, avec département + surface. |
| 13/07/2026 | **NOUVEAU PILIER nº 2 : la surface, serrée à ±3 %.** 99,7 → « 100 ». 171,1 → « 171 ». | L'agent n'invente pas la surface : il arrondit celle du DPE. On la croyait molle, elle est le second point le plus sûr. |
| 13/07/2026 | **L'étiquette DPE n'est pas du texte** : c'est une règle A→G dont une seule lettre est mise en avant graphiquement. Lecture dans le DOM, pas dans la transcription. | Notre regex attrapait toujours le A. Bug systématique sur tout Leboncoin. |
| 13/07/2026 | **La base ADEME répond 100 lignes par page, dans SON ordre.** On pagine désormais la requête départementale jusqu'à 1 000. | 162 DPE dans le 71, 100 rapatriés : la bonne maison n'était pas jetée, elle n'était jamais envoyée. |
| 13/07/2026 | **Principe général : aucun critère douteux n'élimine.** On accumule les critères, on tolère large, le score tranche. | Trois heures perdues à resserrer des filtres sur des données que l'agent immobilier retape à la main. |
| 13/07/2026 | **LE PILIER : `date_visite_diagnostiqueur`.** L'annonce écrit « date de réalisation du diagnostic » — c'est la VISITE, pas l'établissement. Champ existant dans la base, correspondance au **jour exact**. Vitry, Saint-Aubin, Digoin : 3/3. | On filtrait sur `date_etablissement_dpe` avec une fenêtre de 30 jours pour rattraper le décalage. Il suffisait de demander le bon champ. |
| 13/07/2026 | **INVALIDÉ (24 h après l'avoir décidé) : la surface comme filtre serré.** Digoin : 108 m² au DPE, **165 annoncés**. L'agent compte l'étage aménageable et la véranda. | Deux cas (Changy, Saint-Aubin) m'avaient fait croire à une règle. Le troisième l'a cassée. La surface ne filtre plus dès qu'on a la date. |
| 13/07/2026 | **Motif découvert : l'agent gonfle TOUJOURS dans le même sens.** 386,7 → « 413 ». 58,8 → « 71 ». 108 m² → « 165 ». Jamais l'inverse. | D'où des **pénalités asymétriques** : une valeur de base inférieure à l'annonce coûte moitié moins qu'une valeur supérieure. |
| 13/07/2026 | **La facture annuelle réhabilitée.** Digoin : `cout_total_5_usages` = 2 817 €, fourchette annoncée 2 360-3 270 €. Elle tombe dedans. | C'est un calcul du logiciel, pas une saisie humaine. Plus honnête que la conso. Remonte au score (+12). |
| — | *(à compléter)* | |

## 8. Backlog (idées non cadrées — ne pas coder)

- ~~Détection de l'adresse exacte via DPE ADEME~~ → **validée 12/07/2026, à industrialiser**
- Extraction des données brutes d'une annonce à partir de l'URL
- Repli si le fetch Leboncoin casse (copier-coller / bookmarklet). Pas de contournement anti-bot.
- Enrichissement géographique (risques, PLU, cadastre, DVF)
- Analyse des photos
- Fiche partageable (lien, PDF)
- Comparaison de plusieurs biens

## 9. Questions ouvertes

1. ~~Qui est l'utilisateur ?~~ → tranché : toi + tes proches, partage par lien.
2. Quels sites d'annonces en priorité (Leboncoin, SeLoger, Bien'ici, sites d'agences) ?
3. Quel manque concret l'outil vient combler, vécu sur une vraie annonce ?

> ⚠️ Règle R5 bis : le besoin se cadre à partir de cas vécus, pas de listes d'options fournies par Claude. Claude pose des questions ouvertes et ne propose pas de features tant que le besoin n'est pas décrit par l'utilisateur.
