#!/usr/bin/env python3
"""Note un bien et produit le rapport HTML visuel. Usage : python3 rapport.py data.json sortie.html"""
import json, sys, html, statistics as st

D = json.load(open(sys.argv[1], encoding="utf-8"))
E = html.escape
eur = lambda v: f"{v:,.0f}".replace(",", " ")

def palier(v, seuils):
    if v is None:
        return None
    for m, s in seuils:
        if v <= m:
            return s
    return 0.0

# ---------------- Notation ----------------
t = D.get("trajets", {})
mn = lambda k: (t.get(k) or {}).get("min") if isinstance(t.get(k), dict) else None
s_trav = palier(mn("travail"), [(10, 1), (17, .7), (25, .35)])
s_ecole = palier(mn("ecole"), [(5, 1), (10, .7), (15, .35)])
s_super = palier(mn("supermarche"), [(4.99, 1), (9.99, .7), (14.99, .35)])
dep = mn("depannage"); s_dep = 1 if dep is not None and dep <= 5 else 0
s_cour = None if s_super is None else min(1, .8 * s_super + .2 * s_dep + (.1 if s_dep else 0))
s_sport = palier(mn("sport"), [(10, 1), (20, .5)])
autre = mn("autre_salle")
if autre is not None and autre <= 10:
    s_sport = max(s_sport or 0, .8)
DEP = D.get("depenses_a_venir", [])
travaux = sum((x.get("min", 0) + x.get("max", 0)) / 2 for x in DEP)
prix = D["prix"]; budget = prix + travaux
s_budget = palier(budget, [(250000, 1), (300000, .6), (335000, .25)])
surf, ch = D.get("surface"), D.get("chambres")
s_taille = None if surf is None else 1 if (surf >= 125 and (ch or 3) >= 3) else (.6 if (ch or 0) >= 3 else .1) if surf >= 100 else 0
s_style = {"pierre_charme": 1, "neuf_recent": .6, "autre": .5, "sous_sol_70_80": .15}.get(D.get("style"), .5)
s_maison = None if s_taille is None else .6 * s_taille + .4 * s_style
comps = D.get("dvf", {}).get("comparables", [])
med = st.median([c["eur_m2"] for c in comps]) if len(comps) >= 3 else None
pm2 = prix / surf if surf else None
ratio = pm2 / med if (pm2 and med) else None
s_marche = palier(ratio, [(.85, 1), (1.0, .75), (1.15, .45), (1.3, .2)])
g, a = D.get("garage_ou_abri"), D.get("atelier")
s_depb = 1 if (g and a) else (.5 if (g or a) else 0)
iso = D.get("isolement", {}); vois = iso.get("voisin_m")
s_iso = None if vois is None else 1 if vois >= 200 else .75 if vois >= 100 else .45 if vois >= 50 else .15
if s_iso is not None:
    if iso.get("vis_a_vis"): s_iso = max(0, s_iso - .3)
    if iso.get("bourg"): s_iso = min(s_iso, .4)
ter = D.get("terrain")
s_ter = None if ter is None else (0 if ter < 500 else .4 if ter < 1000 else 1 if ter <= 3000 else .8)
C = D.get("couts_annuels", {})
cout_an = sum(v for v in C.values() if isinstance(v, (int, float)))
s_couts = (palier(cout_an / 12, [(400, 1), (550, .7), (700, .4)]) or .1) if C else None
s_net = {"fibre": 1, "fibre_prevue": .6, "4g_bonne": .4, "rien": 0}.get(D.get("connexion"), .5)
F = [("Trajet travail", 8, s_trav, f"{mn('travail')} min"), ("Trajet école", 6, s_ecole, f"{mn('ecole')} min"),
     ("Courses", 4, s_cour, f"supermarché {mn('supermarche')} min"), ("Sport", 2, s_sport, f"{mn('sport')} min"),
     ("Budget total", 15, s_budget, f"{eur(budget)} €"), ("Maison", 15, s_maison, f"{surf} m² · {ch} ch."),
     ("Prix vs marché", 10, s_marche, f"{eur(pm2)} vs {eur(med)} €/m²" if ratio else "comparables insuffisants"),
     ("Dépendances", 10, s_depb, f"garage {'✓' if g else '✗'} · atelier {'✓' if a else '✗'}"),
     ("Isolement", 10, s_iso, f"voisin à {vois} m"), ("Terrain", 8, s_ter, f"{eur(ter or 0)} m²"),
     ("Coûts annuels", 7, s_couts, f"{eur(cout_an/12)} €/mois"), ("Connexion", 5, s_net, D.get("connexion") or "inconnue")]
pts = sum(p * (s if s is not None else .5) for _, p, s, _ in F)
loc = D.get("location", {})
bonus_loc = min(5, max(0, loc.get("net_annuel", 0)) / 1000); bonus_pisc = 3 if D.get("piscine") else 0
bonus = min(8, bonus_loc + bonus_pisc)
note = round(pts + bonus)
GOOD, WARN, SER, CRIT = "#0ca30c", "#fab219", "#ec835a", "#d03b3b"
coul, lib, ico = ((GOOD, "Très bonne affaire", "✓") if note >= 75 else (WARN, "Intéressante", "◐") if note >= 60
                  else (SER, "Moyenne", "!") if note >= 45 else (CRIT, "À éviter", "✗"))
SER_COL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"]

# ---------------- Composants visuels ----------------
import math
def lvl(s):
    return ("—", "#8a8983") if s is None else ("Génial", GOOD) if s >= .95 else ("Bien", "#4a9d4a") if s >= .65 else ("Moyen", "#c98500") if s >= .3 else ("Faible", CRIT)

def jauge(n, col):
    r = 52; c = 2 * math.pi * r
    return (f'<svg viewBox="0 0 130 130" width="140" height="140" role="img" aria-label="Note {n} sur 100">'
            f'<circle cx="65" cy="65" r="{r}" fill="none" stroke="var(--track)" stroke-width="12"/>'
            f'<circle cx="65" cy="65" r="{r}" fill="none" stroke="{col}" stroke-width="12" stroke-linecap="round" stroke-dasharray="{c*n/100:.1f} {c:.1f}" transform="rotate(-90 65 65)"/>'
            f'<text x="65" y="72" text-anchor="middle" class="big">{n}</text><text x="65" y="92" text-anchor="middle" class="tick">/ 100</text></svg>')

def kpi(lab, val, sub, col="var(--fg)"):
    return f'<div class="kpi"><small>{lab}</small><b style="color:{col}">{val}</b><span>{sub}</span></div>'

def norm(items):
    """Forces/faiblesses : chaîne ou {texte, poids 1-3} ; tri par importance décroissante."""
    o = [x if isinstance(x, dict) else {"texte": x, "poids": 1} for x in items]
    return sorted(o, key=lambda x: -x.get("poids", 1))

def ff(items, icon, col):
    rows = []
    for x in norm(items):
        p = max(1, min(3, x.get("poids", 1)))
        dots = "".join(f'<i class="dot{" on" if k < p else ""}" style="--c:{col}"></i>' for k in range(3))
        rows.append(f'<div class="card"><span class="ic" style="background:{col}">{icon}</span><span class="tx">{E(x["texte"])}</span><span class="imp" title="Importance {p}/3">{dots}</span></div>')
    return "".join(rows)

def facteurs():
    o = []
    for n, p, s, d in F:
        sc = s if s is not None else .5
        lb, col = lvl(s)
        o.append(f'<div class="fr" title="{E(d)} · poids {p}"><span class="fn">{E(n)}<small>{E(d)}</small></span>'
                 f'<span class="track"><span class="fill" style="width:{sc*100:.0f}%;background:{col}"></span></span>'
                 f'<span class="fp">{sc*10:.1f}<small>/10</small></span><span class="fw">×{p}</span></div>')
    if bonus:
        o.append(f'<div class="fr"><span class="fn">Bonus<small>location {bonus_loc:.1f} · piscine {bonus_pisc}</small></span><span class="track"><span class="fill" style="width:{bonus/8*100:.0f}%;background:#2a78d6"></span></span><span class="fp">+{bonus:.1f}</span><span class="fw">pts</span></div>')
    return "".join(o)

# Schéma radial des trajets : la maison au centre, chaque destination à une distance proportionnelle aux minutes
TR = [("travail", "Travail", s_trav), ("ecole", "École", s_ecole), ("supermarche", "Supermarché", s_super),
      ("sport", "Sport", s_sport), ("depannage", "Boulangerie", 1 if s_dep else .5), ("autre_salle", "Autre salle", None)]
def radial():
    W = 360; cx = cy = W / 2; R = 150; mx = 30
    o = [f'<circle cx="{cx}" cy="{cy}" r="{R*m/mx:.0f}" fill="none" stroke="var(--track)" stroke-width="1.5"/><text x="{cx}" y="{cy+R*m/mx+14:.0f}" text-anchor="middle" class="tick">{m} min</text>' for m in (10, 20, 30)]
    pts = [(k, n, s, t.get(k)) for k, n, s in TR if isinstance(t.get(k), dict) and t[k].get("min") is not None]
    for i, (k, n, s, x) in enumerate(pts):
        ang = -math.pi / 2 + math.pi / max(1, len(pts)) + 2 * math.pi * i / max(1, len(pts))
        r = R * min(x["min"], mx) / mx
        px, py = cx + r * math.cos(ang), cy + r * math.sin(ang)
        col = lvl(s)[1] if s is not None else "#8a8983"
        lx, ly = cx + (r + 14) * math.cos(ang), cy + (r + 14) * math.sin(ang)
        anc = "start" if math.cos(ang) > .3 else "end" if math.cos(ang) < -.3 else "middle"
        o.append(f'<line x1="{cx}" y1="{cy}" x2="{px:.0f}" y2="{py:.0f}" stroke="{col}" stroke-width="2.5" stroke-linecap="round"/>'
                 f'<circle cx="{px:.0f}" cy="{py:.0f}" r="7" fill="{col}" stroke="var(--card)" stroke-width="2"><title>{E(str(x.get("dest","")))} · {x["min"]} min · {x.get("km")} km</title></circle>'
                 f'<text x="{lx:.0f}" y="{ly+4:.0f}" text-anchor="{anc}" class="lab">{n} {x["min"]}′</text>')
    o.append(f'<circle cx="{cx}" cy="{cy}" r="15" fill="var(--fg)"/><text x="{cx}" y="{cy+5}" text-anchor="middle" font-size="15">🏠</text>')
    return f'<svg viewBox="-50 0 {W+100} {W}" class="wide" role="img" aria-label="Schéma des trajets">{"".join(o)}</svg>'

def tr_table():
    o = []
    for k, n, s in TR:
        x = t.get(k)
        if not isinstance(x, dict): continue
        lb, col = lvl(s)
        o.append(f'<div class="trow"><span class="pill" style="background:{col}">{x.get("min","—")}′</span><span><b>{n}</b><small>{E(str(x.get("dest","")))} · {x.get("km","—")} km</small></span></div>')
    ref = t.get("ref")
    if isinstance(ref, dict):
        o.append(f'<div class="trow"><span class="pill" style="background:#8a8983">{ref.get("min")}′</span><span><b>Référence</b><small>{E(str(ref.get("dest","")))} · {ref.get("km","—")} km</small></span></div>')
    return "".join(o)

def budget_svg():
    W, mx = 1000, 360000
    xs = lambda v: 10 + (W - 20) * min(v, mx) / mx
    seg = [("Prix", prix, "#2a78d6")] + [(x["poste"], (x.get("min", 0) + x.get("max", 0)) / 2, SER_COL[(i + 1) % 6]) for i, x in enumerate(DEP)]
    o, cur = [], 0
    for n, v, col in seg:
        o.append(f'<rect x="{xs(cur):.1f}" y="24" width="{max(1, xs(cur+v)-xs(cur)-2):.1f}" height="26" rx="5" fill="{col}"><title>{E(n)} : {eur(v)} €</title></rect>')
        cur += v
    for v, lab, col, y, anc in [(250000, "250 k", GOOD, 72, "middle"), (300000, "300 k", WARN, 72, "middle"), (335000, "335 k plafond", CRIT, 14, "middle")]:
        o.append(f'<line x1="{xs(v):.1f}" x2="{xs(v):.1f}" y1="18" y2="56" stroke="{col}" stroke-width="2" stroke-dasharray="4 3"/><text x="{xs(v):.1f}" y="{y}" text-anchor="{anc}" class="tick">{lab}</text>')
    leg = "".join(f'<span class="lg"><i style="background:{c}"></i>{E(n)} · <b>{eur(v)} €</b></span>' for n, v, c in seg)
    return f'<svg viewBox="0 0 {W} 78" class="wide">{"".join(o)}</svg><div class="legend">{leg}</div>'

def donut():
    items = [(k, v) for k, v in C.items() if isinstance(v, (int, float)) and v > 0]
    if not items: return '<p class="mut">Non calculé.</p>'
    r, c = 60, 2 * math.pi * 60; o, off = [], 0
    for i, (k, v) in enumerate(items):
        ln = c * v / cout_an
        o.append(f'<circle cx="80" cy="80" r="{r}" fill="none" stroke="{SER_COL[i%6]}" stroke-width="22" stroke-dasharray="{max(0,ln-2):.1f} {c:.1f}" stroke-dashoffset="{-off:.1f}" transform="rotate(-90 80 80)"><title>{E(k)} : {eur(v/12)} €/mois</title></circle>')
        off += ln
    o.append(f'<text x="80" y="80" text-anchor="middle" class="mid">{eur(cout_an/12)} €</text><text x="80" y="98" text-anchor="middle" class="tick">par mois</text>')
    leg = "".join(f'<div class="lg"><i style="background:{SER_COL[i%6]}"></i><span>{E(k.split(" (")[0])}</span><b>{eur(v/12)} €</b></div>' for i, (k, v) in enumerate(items))
    return f'<div class="donut"><svg viewBox="0 0 160 160" width="170" height="170">{"".join(o)}</svg><div class="dleg">{leg}</div></div>'

def dep_bars():
    if not DEP: return '<p class="mut">Aucune dépense détectée.</p>'
    mx = max(x.get("max", 0) for x in DEP) * 1.1 or 1
    o = [f'<div class="dr"><div class="drh"><span class="fn">{E(x["poste"])}<small>{E(x.get("source",""))}</small></span><span class="fp">{eur(x.get("min",0))}–{eur(x.get("max",0))} €</span></div><span class="track"><span class="rng" style="left:{x.get("min",0)/mx*100:.1f}%;width:{max(1,(x.get("max",0)-x.get("min",0))/mx*100):.1f}%"></span></span></div>' for x in DEP]
    return "".join(o)

def dvf_svg():
    if not comps: return '<p class="mut">Pas de ventes comparables.</p>'
    vals = [c["eur_m2"] for c in comps] + ([pm2] if pm2 else [])
    lo, hi = min(vals) * .9, max(vals) * 1.05
    W = 900; xs = lambda v: 30 + (W - 60) * (v - lo) / (hi - lo)
    o = []
    for i, c in enumerate(comps):
        o.append(f'<circle cx="{xs(c["eur_m2"]):.1f}" cy="{40 + (i % 5) * 12}" r="6" fill="#2a78d6" fill-opacity=".55" stroke="var(--card)" stroke-width="1.5"><title>{c["date"]} · {eur(c["valeur"])} € · {c["surface"]} m² · {eur(c["eur_m2"])} €/m²</title></circle>')
    if med:
        o.append(f'<line x1="{xs(med):.1f}" x2="{xs(med):.1f}" y1="26" y2="100" stroke="var(--mut)" stroke-width="2" stroke-dasharray="4 3"/><text x="{xs(med):.1f}" y="18" text-anchor="middle" class="tick">médiane {eur(med)} €/m²</text>')
    if pm2:
        o.append(f'<path d="M{xs(pm2):.1f},104 l-9,14 h18 z" fill="#eb6834"/><text x="{xs(pm2):.1f}" y="138" text-anchor="middle" class="lab">ce bien {eur(pm2)} €/m²</text>')
    o += [f'<text x="{xs(v):.1f}" y="160" text-anchor="middle" class="tick">{eur(v)}</text>' for v in (lo, (lo + hi) / 2, hi)]
    return f'<svg viewBox="0 0 {W} 166" class="wide">{"".join(o)}</svg>'

DPE_C = {"A": "#009036", "B": "#55ab26", "C": "#c8d200", "D": "#ffed00", "E": "#fbba00", "F": "#eb6909", "G": "#e2001a"}
def dpe_svg():
    d = D.get("dpe") or {}
    L = (d.get("lettre") or "").upper()
    if not L: return '<p class="mut">DPE inconnu.</p>'
    o = []
    for i, k in enumerate("ABCDEFG"):
        w = 60 + i * 22; y = 4 + i * 22
        o.append(f'<path d="M0,{y} h{w} l9,9 l-9,9 h-{w} z" fill="{DPE_C[k]}" opacity="{1 if k == L else .35}"/><text x="8" y="{y+14}" class="dpl">{k}</text>')
        if k == L:
            o.append(f'<path d="M{w+18},{y+9} l10,-9 h70 v18 h-70 z" fill="var(--fg)"/><text x="{w+60}" y="{y+14}" text-anchor="middle" class="dpv">{d.get("kwh","?")} kWh</text>')
    ges = f'<p class="mut">GES : <b>{E(str(d.get("ges","?")))}</b> · {E(str(d.get("date","")))}</p>' if d.get("ges") else ""
    return f'<svg viewBox="0 0 260 162" width="260" height="162">{"".join(o)}</svg>{ges}'

def facts():
    rows = [("Surface", f'{surf} m²'), ("Chambres", ch), ("Terrain", f'{eur(ter or 0)} m²'),
            ("Garage / abri", "✓" if g else "✗"), ("Atelier", "✓" if a else "✗"), ("Piscine", "✓" if D.get("piscine") else "✗"),
            ("Chauffage", (D.get("dpe") or {}).get("chauffage", "—"))]
    return '<div class="facts">' + "".join(f'<div><small>{k}</small><b>{E(str(v))}</b></div>' for k, v in rows) + '</div>'

def iso_svg():
    W, mx = 1000, 400; xs = lambda v: 20 + (W - 40) * min(v, mx) / mx
    z = [(0, 50, CRIT), (50, 100, SER), (100, 200, WARN), (200, 400, GOOD)]
    o = [f'<rect x="{xs(a)+1:.1f}" y="22" width="{xs(b)-xs(a)-2:.1f}" height="12" rx="4" fill="{c}" opacity=".4"/><text x="{xs(a):.1f}" y="52" class="tick">{a} m</text>' for a, b, c in z]
    o.append('<text x="20" y="14" class="tick">🏠 maison → premier voisin</text>')
    if vois is not None:
        o.append(f'<circle cx="{xs(vois):.1f}" cy="28" r="9" fill="var(--fg)" stroke="var(--card)" stroke-width="2"/><text x="{xs(vois):.1f}" y="74" text-anchor="middle" class="lab">{vois} m</text>')
    cnt = f'<div class="mini"><b>{iso.get("maisons_100m","?")}</b><small>maison(s) &lt; 100 m</small></div><div class="mini"><b>{iso.get("maisons_250m","?")}</b><small>&lt; 250 m</small></div><div class="mini"><b style="color:{CRIT if iso.get("vis_a_vis") else GOOD}">{"Oui" if iso.get("vis_a_vis") else "Non"}</b><small>vis-à-vis jardin</small></div>'
    return f'<svg viewBox="0 0 {W} 80" class="wide">{"".join(o)}</svg><div class="minis">{cnt}</div>'

NIV = {"ok": (GOOD, "✓"), "moyen": (WARN, "!"), "fort": (CRIT, "✗"), "inconnu": ("#8a8983", "?")}
def tuiles():
    xs = D.get("risques_tuiles") or []
    if not xs: return ""
    return '<div class="tiles">' + "".join(f'<div class="tile"><span class="ic" style="background:{NIV.get(x.get("niveau"),NIV["inconnu"])[0]}">{NIV.get(x.get("niveau"),NIV["inconnu"])[1]}</span><b>{E(x["nom"])}</b><small>{E(x.get("detail",""))}</small></div>' for x in xs) + '</div>'

li = lambda xs: "".join(f"<li>{E(x)}</li>" for x in xs)
src = "".join(f'<li><a href="{E(u)}">{E(n)}</a></li>' for n, u in D.get("sources", []))
bud_col = GOOD if budget <= 250000 else WARN if budget <= 300000 else SER if budget <= 335000 else CRIT
mar_col = "var(--fg)" if ratio is None else GOOD if ratio <= 1 else "#c98500" if ratio <= 1.15 else CRIT
sec = lambda n, titre, corps, cls="": f'<section class="panel {cls}"><h2><span class="num">{n}</span>{titre}</h2>{corps}</section>'

page = f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(D.get('titre','Analyse maison'))}</title><style>
:root{{--bg:#efeee9;--card:#fcfcfb;--fg:#0b0b0b;--mut:#52514e;--bd:#e3e1da;--track:#e6e4dc}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0f0f0e;--card:#1a1a19;--fg:#f0efec;--mut:#c3c2b7;--bd:#2e2d2a;--track:#2e2d2a}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,sans-serif}}
main{{max-width:1080px;margin:auto;padding:28px 16px 56px}}h1{{font-size:26px;margin:0}}small{{color:var(--mut)}}.mut{{color:var(--mut);margin:6px 0 0}}
.panel{{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:20px 22px;margin-top:22px}}
h2{{display:flex;align-items:center;gap:10px;font-size:18px;margin:0 0 16px;padding-bottom:10px;border-bottom:2px solid var(--bd)}}h3{{font-size:14px;margin:0 0 8px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}}
.num{{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--fg);color:var(--card);font-size:14px}}
.big{{font:700 34px system-ui;fill:var(--fg)}}.mid{{font:700 18px system-ui;fill:var(--fg)}}.tick{{fill:var(--mut);font-size:13px}}.lab{{fill:var(--fg);font-size:14px;font-weight:600}}.dpl{{font:700 13px system-ui;fill:#111}}.dpv{{font:700 12px system-ui;fill:var(--card)}}
.hero{{display:grid;grid-template-columns:150px 1fr;gap:20px;align-items:center}}.badge{{display:inline-block;color:#fff;border-radius:999px;padding:4px 14px;font-weight:700;margin-bottom:6px}}.syn{{font-size:16px;margin:0}}
.kpis{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:18px}}.kpi{{background:var(--bg);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column}}.kpi b{{font-size:22px}}.kpi span{{font-size:12px;color:var(--mut)}}
.g2{{display:grid;grid-template-columns:1fr 1fr;gap:28px}}.g2>div{{min-width:0}}
.card{{display:flex;gap:10px;align-items:center;padding:9px 12px;border:1px solid var(--bd);border-radius:10px;margin:7px 0}}.tx{{flex:1}}
.ic{{flex:none;width:24px;height:24px;border-radius:50%;color:#fff;display:grid;place-items:center;font-size:13px;font-weight:700}}
.imp{{display:flex;gap:3px}}.dot{{width:8px;height:8px;border-radius:50%;background:var(--track)}}.dot.on{{background:var(--c)}}
.att .card{{border-color:#ec835a66;background:#ec835a14}}
.fr{{display:grid;grid-template-columns:200px 1fr 70px 34px;gap:12px;align-items:center;margin:9px 0}}.dr{{display:block;margin:12px 0}}.drh{{display:flex;justify-content:space-between;gap:12px;margin-bottom:6px}}
.fn{{display:flex;flex-direction:column;font-weight:600;font-size:14px}}.fn small{{font-weight:400;font-size:12px}}.fp{{text-align:right;font-weight:700;font-size:16px}}.fp small{{font-weight:400}}.fw{{color:var(--mut);font-size:12px}}
.track{{position:relative;height:12px;background:var(--track);border-radius:6px;overflow:hidden}}.fill{{position:absolute;inset:0 auto 0 0;border-radius:6px}}.rng{{position:absolute;top:0;bottom:0;background:#ec835a;border-radius:6px}}
.trow{{display:flex;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--bd)}}.trow span{{display:flex;flex-direction:column}}.pill{{flex:none;min-width:48px;text-align:center;color:#fff;font-weight:700;border-radius:8px;padding:6px 8px}}
.wide{{width:100%;height:auto}}.legend{{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;margin-top:6px}}.lg i{{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}}
.donut{{display:flex;gap:16px;align-items:center;flex-wrap:wrap}}.dleg{{flex:1;min-width:180px}}.dleg .lg{{display:grid;grid-template-columns:16px 1fr auto;align-items:center;padding:4px 0;font-size:14px}}
.facts{{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}}.facts div,.mini{{background:var(--bg);border-radius:10px;padding:8px 12px;display:flex;flex-direction:column}}.facts b{{font-size:16px}}
.minis{{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}}.mini b{{font-size:20px}}
.tiles{{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}}.tile{{background:var(--bg);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:4px}}.tile small{{font-size:12px}}
details{{margin-top:10px}}summary{{cursor:pointer;font-weight:700}}ul{{margin:8px 0;padding-left:20px}}a{{color:inherit}}
@media (max-width:760px){{.hero,.g2{{grid-template-columns:1fr}}.kpis{{grid-template-columns:1fr 1fr}}.fr{{grid-template-columns:110px 1fr 56px 28px}}}}
</style></head><body><main>
<h1>{E(D.get('titre',''))}</h1><small>{E(D.get('adresse',''))} · {E(D.get('date',''))}</small>
<section class="panel"><div class="hero"><div>{jauge(note, coul)}</div><div><span class="badge" style="background:{coul}">{ico} {lib}</span><p class="syn">{E(D.get('synthese',''))}</p></div></div>
<div class="kpis">{kpi('Prix', eur(prix)+' €', f'{eur(pm2 or 0)} €/m²')}{kpi('Budget total', eur(budget)+' €', 'prix + travaux', bud_col)}{kpi('Coût mensuel', eur(cout_an/12)+' €', 'hors crédit')}{kpi('vs marché', f'{(ratio-1)*100:+.0f} %' if ratio else '—', f'médiane {eur(med or 0)} €/m²', mar_col)}</div></section>
{sec(1, "Points d'attention", ff(D.get('points_attention', []), '!', SER), 'att')}
{sec(2, "Forces et faiblesses", f'<div class="g2"><div><h3>Forces</h3>{ff(D.get("forces", []), "✓", GOOD)}</div><div><h3>Faiblesses</h3>{ff(D.get("faiblesses", []), "✗", CRIT)}</div></div>')}
{sec(3, "Note par critère", facteurs())}
{sec(4, "Trajets", f'<div class="g2"><div>{radial()}</div><div>{tr_table()}</div></div>')}
{sec(5, "Argent", f'<h3>Budget vs plafond</h3>{budget_svg()}<div class="g2" style="margin-top:22px"><div><h3>Coûts mensuels</h3>{donut()}</div><div><h3>Dépenses à venir</h3>{dep_bars()}</div></div>')}
{sec(6, "Prix du marché (DVF)", dvf_svg() + f'<p class="mut">{len(comps)} maisons comparables vendues sur 5 ans dans la commune.</p>')}
{sec(7, "Maison et énergie", f'<div class="g2"><div><h3>Étiquette DPE</h3>{dpe_svg()}</div><div><h3>Caractéristiques</h3>{facts()}</div></div>')}
{sec(8, "Environnement", f'<h3>Isolement</h3>{iso_svg()}<h3 style="margin-top:20px">Risques</h3>{tuiles()}<details><summary>Détail des risques</summary><ul>{li(D.get("risques", []))}</ul></details>')}
{sec(9, "Location", f'<p>{E(loc.get("detail","Aucun logement ou local louable."))}</p><p><b>Net annuel prudent : {eur(loc.get("net_annuel",0))} €</b></p>') if loc.get('net_annuel') or loc.get('detail') else ''}
{sec(10, "Ce que je n'ai PAS vérifié", f'<ul>{li(D.get("non_verifie", []))}</ul><details><summary>Hypothèses de calcul</summary><ul>{li(D.get("hypotheses", []))}</ul></details><details><summary>Sources</summary><ul>{src}</ul></details>')}
</main></body></html>"""
open(sys.argv[2], "w", encoding="utf-8").write(page)
print(json.dumps({"note": note, "verdict": lib, "budget_total": round(budget), "cout_mensuel": round(cout_an / 12),
                  "prix_m2": round(pm2 or 0), "mediane_dvf": round(med or 0), "nb_comparables": len(comps)}, ensure_ascii=False))
