#!/usr/bin/env python3
"""Assemble l'extension pour chaque navigateur, à partir d'un seul content.js.

    python3 extension/assembler.py

Produit dist/chrome/ et dist/firefox/ (dossiers prêts à charger) et leurs .zip.
Pourquoi : un navigateur exige le manifest à la racine du dossier qu'on lui donne,
avec content.js à côté. Garder deux copies de content.js, c'est garantir qu'elles divergent."""
import os, shutil, zipfile

ICI = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ICI, "..", "dist")
COMMUNS = ["content.js", "rapport.js", "moteur", "icones", "montserrat.woff2", "montserrat-OFL.txt"]

for nav in ("chrome", "firefox"):
    cible = os.path.join(DIST, f"radar-maison-{nav}")
    shutil.rmtree(cible, ignore_errors=True)
    os.makedirs(cible)
    for f in COMMUNS:
        src = os.path.join(ICI, f)
        (shutil.copytree if os.path.isdir(src) else shutil.copy2)(src, os.path.join(cible, f))
    for f in os.listdir(os.path.join(ICI, nav)):
        shutil.copy2(os.path.join(ICI, nav, f), cible)
    archive = cible + ".zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        for racine, _, fichiers in os.walk(cible):
            for f in fichiers:
                p = os.path.join(racine, f)
                z.write(p, os.path.relpath(p, DIST))   # le zip contient le dossier, comme l'ancien
    print(f"{nav:8} → dist/radar-maison-{nav}/  et  dist/radar-maison-{nav}.zip")
