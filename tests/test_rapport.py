"""Tests de rapport.py — lancer : python3 -m unittest discover tests
Chaque test fige un comportement voulu. S'il casse, c'est qu'une règle a changé : vérifier que c'était voulu."""
import json, os, subprocess, sys, tempfile, unittest

ICI = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(ICI, "..", "analyse", "rapport.py")

def rapport(nom, profil=None):
    sortie = tempfile.mktemp(suffix=".html")
    cmd = [sys.executable, SCRIPT, os.path.join(ICI, "donnees", nom), sortie] + ([profil] if profil else [])
    res = json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)
    with open(sortie, encoding="utf-8") as f:
        page = f.read()
    os.remove(sortie)
    return res, page

class Verdict(unittest.TestCase):
    def test_prix_seul_pas_de_verdict(self):
        # Le cas qui a déclenché la règle : avant, 100/100 « Très bonne affaire » sur 15 % des critères.
        r, page = rapport("prix_seul.json")
        self.assertTrue(r["provisoire"])
        self.assertNotIn("Très bonne affaire", page)

    def test_dossier_complet_a_un_verdict(self):
        r, _ = rapport("complet.json")
        self.assertFalse(r["provisoire"])
        self.assertEqual(r["criteres_notes_pct"], 100)
        self.assertEqual(r["note"], 81)          # à mettre à jour si le barème change volontairement
        self.assertEqual(r["budget_total"], 225000)  # la fosse « certain: false » reste hors budget

class Inconnu(unittest.TestCase):
    def test_inconnu_affiche_point_d_interrogation(self):
        _, page = rapport("partiel.json")
        self.assertIn("Garage / abri</small><b>?", page)
        self.assertIn(">?</b><small>vis-à-vis", page)

    def test_jamais_none_a_l_ecran(self):
        for f in ("prix_seul.json", "partiel.json", "complet.json"):
            _, page = rapport(f)
            self.assertNotIn("None", page, f)

class Profil(unittest.TestCase):
    def test_un_autre_profil_change_la_note_budget(self):
        p = tempfile.mktemp(suffix=".json")
        with open(p, "w") as f:
            json.dump({"budget": {"confortable": 150000, "acceptable": 180000, "plafond": 200000},
                       "maison": {"surface_ideale": 125, "surface_min": 100, "chambres_min": 3}}, f)
        moi, _ = rapport("complet.json")
        autre, _ = rapport("complet.json", p)
        os.remove(p)
        self.assertLess(autre["note"], moi["note"])  # 225 000 € dépasse son plafond de 200 000 €

if __name__ == "__main__":
    unittest.main()
