# Radar Maison

Outils d'analyse d'annonces immobilières (Saône-et-Loire).

## `analyse/`
- `collecte.js` — collecte des données publiques autour d'une adresse (cadastre, PLU, DPE ADEME, trajets IGN, écoles, commerces, bâti IGN, carburants, taxe foncière, eau potable, ventes DVF). À exécuter dans une page `https://data.geopf.fr` après avoir défini `window.P` ; résultat dans `window.__R`.
- `georisques.js` — risques Géorisques (catastrophes naturelles, argiles, radon, installations classées, anciens sites industriels). À exécuter sur une page `georisques.gouv.fr` ; résultat dans `window.__G`.
- `rapport.py` — note sur 100 et rapport HTML visuel : `python3 rapport.py data.json rapport.html`.

Aucune donnée personnelle dans ces fichiers : les destinations (travail, sport…) sont passées en paramètre.
