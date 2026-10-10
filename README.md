# Radar Maison

Outils d'analyse d'annonces immobilières (Saône-et-Loire).

## `analyse/`
- `collecte.js` — collecte des données publiques autour d'une adresse (cadastre, PLU, DPE ADEME, trajets IGN, écoles, commerces, bâti IGN, carburants, taxe foncière, eau potable, ventes DVF). À exécuter dans une page `https://data.geopf.fr` après avoir défini `window.P` ; résultat dans `window.__R`.
- `georisques.js` — risques Géorisques (catastrophes naturelles, argiles, radon, installations classées, anciens sites industriels). À exécuter sur une page `georisques.gouv.fr` ; résultat dans `window.__G`.
- `risques.js` — risques via le serveur du BRGM (argiles, remontée de nappe, zone inondable potentielle, PPR inondation, cavités, mouvements de terrain, sites pollués, séisme). Solution de secours quand Géorisques est inaccessible. Résultat dans `window.__K`.
- `rapport.py` — note sur 100 et rapport HTML visuel : `python3 rapport.py data.json rapport.html`.

Aucune donnée personnelle dans ces fichiers : les destinations (travail, sport…) sont passées en paramètre.
