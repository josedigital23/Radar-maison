/* Radar Maison — panneau injecté dans la page d'annonce.

   Ce que quatre cas réels nous ont appris (Vitry, Changy, Saint-Aubin, Digoin) :
   la seule donnée que l'agent immobilier recopie sans la retoucher, c'est la DATE DE VISITE
   du diagnostiqueur. Tout le reste — surface, consommation, étiquettes — il le gonfle,
   toujours dans le même sens. Le moteur en découle : un seul filtre dur (date + département),
   tout le reste au score, et aucun critère douteux n'a le droit d'éliminer un candidat. */

(() => {
  if (window.__radarMaison) { window.__radarMaison.basculer(); return; }   // déjà chargé : on bascule

  const API_NEUF  = "https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines";
  const API_VIEUX = "https://data.ademe.fr/data-fair/api/v1/datasets/dpe-france/lines";
  const BAN       = "https://api-adresse.data.gouv.fr/search/";

  const C_NEUF = ["adresse_ban","nom_commune_ban","code_postal_ban","code_insee_ban","surface_habitable_logement",
    "etiquette_dpe","etiquette_ges","cout_total_5_usages","conso_5_usages_par_m2_ep","emission_ges_5_usages_par_m2",
    "type_energie_principale_chauffage","periode_construction","date_etablissement_dpe","_geopoint",
    "qualite_isolation_menuiseries","qualite_isolation_murs","categorie_enr","nombre_niveau_logement","numero_dpe",
    "date_visite_diagnostiqueur"];
  const C_VIEUX = ["geo_adresse","geo_score","latitude","longitude","surface_thermique_lot",
    "classe_consommation_energie","classe_estimation_ges","consommation_energie","annee_construction",
    "date_etablissement_dpe","numero_dpe"];

  const nb = t => { const v = parseFloat(String(t).replace(/[\s  ]/g,"").replace(",",".")); return isNaN(v)?null:v; };
  const km = (la1,lo1,la2,lo2) => {
    const R=6371, r=Math.PI/180;
    const a=Math.sin((la2-la1)*r/2)**2+Math.cos(la1*r)*Math.cos(la2*r)*Math.sin((lo2-lo1)*r/2)**2;
    return 2*R*Math.asin(Math.sqrt(a));
  };
  const req = (url, type) => browser.runtime.sendMessage({ type: type || "fetch", url });

  /* La page ne parle pas que du bien : « biens similaires », suggestions, pied de page.
     On coupe net à la première frontière connue — sinon on ramasse les surfaces des voisins. */
  const BRUIT = /(?:plus de biens similaires|biens? similaires|annonces? similaires|autres? (?:biens|annonces)|vous aimerez aussi|ces biens pourraient|ces annonces peuvent vous intéresser|les annonces de ce pro|voir plus d.annonces|dans les environs|à quel point êtes-vous satisfait|nos autres|recherches associées|à découvrir également|signaler l.annonce|vos droits et obligations)/i;

  /* Beaucoup d'annonces replient leur description derrière « Voir plus ».
     Le texte n'existe pas dans la page tant qu'on n'a pas cliqué : on clique donc à la place de l'utilisateur. */
  function deplier(){
    document.querySelectorAll("details:not([open])").forEach(d => d.open = true);

    const cible = /^(voir plus|lire la suite|afficher plus|voir la suite|plus de détails|afficher la description)$/i;
    const dpe   = /^(performance énergétique|diagnostic de performance énergétique|voir le dpe|dpe|diagnostics?|en savoir plus sur le dpe)$/i;
    document.querySelectorAll('button, a, span[role="button"], div[role="button"]').forEach(el => {
      if(el.closest("#radar-maison-hote") || el.closest("#radar-maison-pastille")) return;
      const t = (el.innerText || "").trim();
      if(t.length < 45 && (cible.test(t) || dpe.test(t))) { try { el.click(); } catch(e){} }
    });
  }

  function texteAnnonce(){
    // Certaines annonces replient la description derrière « Voir plus » : on ouvre tout ce qui peut l'être.
    document.querySelectorAll("details:not([open])").forEach(d => d.open = true);

    const zone = document.querySelector("main") || document.body;
    let t = zone.innerText;
    if(t.length < 400) t = document.body.innerText;   // <main> vide ou décoratif

    const c = t.search(BRUIT);
    // On ne coupe que si la frontière arrive après la description (sinon on emporte l'essentiel).
    t = (c > 600) ? t.slice(0, c) : t;

    /* SeLoger range son DPE dans une fenêtre modale, rendue HORS du <main>. Tant qu'on ne lisait
       que <main>, la consommation et le GES n'existaient tout simplement pas pour nous — ce n'était
       pas une regex à corriger, c'était un texte qu'on n'avait jamais sous les yeux.
       On AJOUTE donc le contenu des modales ouvertes. Sur Leboncoin il n'y en a pas : rien ne bouge. */
    const modales = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')]
      .filter(m => !m.closest("#radar-maison-hote") && !m.closest("#radar-maison-pastille"))
      .filter(m => { const r = m.getBoundingClientRect(); return r.width > 200 && r.height > 150; })
      .map(m => m.innerText || "")
      .filter(x => x.trim().length > 30);

    return modales.length ? t + "\n\n" + modales.join("\n\n") : t;
  }

  /* Toutes les surfaces citées, celles du terrain écartées.
     SeLoger n'écrit jamais "surface habitable" : il aligne "208 m² · 1239 m² de terrain". */
  function surfaces(t){
    const exclu = /^\s*(?:de\s+)?(?:terrain|jardin|parcelle|parc|terrasse|piscine|cave|garage|grange|d[ée]pendance|au\s+sol|hangar|combles?|sous-sol|balcon)/i;
    const vus = new Map();     // valeur → priorité (plus bas = meilleur)
    const re = /([0-9]{1,4}(?:[.,][0-9]+)?)\s*m(?:²|2|²)/gi;
    let m;
    while((m = re.exec(t)) !== null){
      const v = nb(m[1]);
      if(v === null || v < 20 || v > 900) continue;             // ni dressing ni pré
      const apres = t.slice(m.index + m[0].length, m.index + m[0].length + 22);
      if(exclu.test(apres)) continue;                          // "… m² de terrain"
      const avant = t.slice(Math.max(0, m.index - 40), m.index);
      if(/€|prix|par\s*$/i.test(avant.slice(-8))) continue;    // "1 587 €/m²"
      const habitable = /habitable|surface\s*:?\s*$/i.test(avant) || /\s*habitables?/i.test(apres);
      const prio = habitable ? 0 : 1;
      if(!vus.has(v) || vus.get(v) > prio) vus.set(v, prio);
    }
    // Ordre d'apparition conservé : la surface du bandeau vient avant celles de la description.
    return [...vus.entries()]
      .sort((a,b) => a[1] - b[1])
      .map(e => e[0]);
  }

  /* ---------- les étiquettes : dans le DOM, pas dans le texte ----------
     Une étiquette DPE n'est pas un mot, c'est une règle : A B C D E F G, dont une seule
     lettre est mise en avant — par la taille, la graisse, la couleur. En texte brut, les sept
     lettres se valent : une regex qui cherche « classe énergie ... [A-G] » attrapera toujours
     le A. C'était le bug. On va donc regarder la page, pas sa transcription. */
  function etiquettesDOM(){
    // Les feuilles du DOM qui ne contiennent qu'une lettre de A à G.
    const feuilles = [...document.querySelectorAll("body *")].filter(el =>
      el.childElementCount === 0 && /^[A-G]$/.test((el.textContent || "").trim())
    );
    if(feuilles.length < 6) return {};

    // On regroupe les lettres qui vivent sous le même toit : c'est ça, une règle.
    const groupes = new Map();
    feuilles.forEach(el => {
      [el.parentElement, el.parentElement && el.parentElement.parentElement].forEach(p => {
        if(!p) return;
        if(!groupes.has(p)) groupes.set(p, new Set());
        groupes.get(p).add(el);
      });
    });

    // Une règle valide : au moins six lettres distinctes, dont le A et le G aux extrémités.
    const regles = [...groupes.entries()]
      .map(([p, s]) => ({ p, lettres: [...s] }))
      .filter(g => {
        const vues = new Set(g.lettres.map(e => e.textContent.trim()));
        return vues.size >= 6 && vues.has("A") && vues.has("G");
      })
      .sort((a, b) => a.lettres.length - b.lettres.length);   // le parent le plus proche gagne

    const out = {}, deja = new Set(), trouvees = [];
    for(const g of regles){
      if(g.lettres.some(e => deja.has(e))) continue;   // règle déjà traitée par un parent plus serré
      g.lettres.forEach(e => deja.add(e));

      // La lettre retenue se détache : plus grande, plus grasse, ou seule pleinement opaque.
      const m = g.lettres.map(e => {
        const r = e.getBoundingClientRect(), s = getComputedStyle(e);
        return { l: e.textContent.trim(), aire: Math.round(r.width * r.height),
                 taille: parseFloat(s.fontSize) || 0, gras: parseInt(s.fontWeight) || 400,
                 opa: parseFloat(s.opacity) || 1 };
      });
      let choix = null;
      for(const cle of ["aire", "taille", "gras"]){
        const haut = Math.max(...m.map(x => x[cle]));
        const tete = m.filter(x => x[cle] === haut);
        if(tete.length === 1){ choix = tete[0]; break; }   // une seule se détache : c'est elle (Leboncoin)
      }
      if(!choix){
        const opaques = m.filter(x => x.opa >= 0.99);
        if(opaques.length === 1) choix = opaques[0];
      }

      /* SeLoger : les sept lettres de la règle sont DESSINÉES À L'IDENTIQUE. Ce qui varie, c'est
         la barre colorée à côté — et surtout, la lettre retenue est répétée dans un encart voisin,
         relié à la règle par un trait. On la cherche donc À CÔTÉ de la règle, pas dedans. */
      if(!choix){
        let n = g.p;
        for(let i = 0; i < 4 && n && !choix; i++, n = n.parentElement){
          const dehors = [...n.querySelectorAll("*")].filter(el =>
            el.childElementCount === 0 &&
            /^[A-G]$/.test((el.textContent || "").trim()) &&
            !g.lettres.includes(el)
          );
          if(dehors.length === 1) choix = { l: dehors[0].textContent.trim() };
          else if(dehors.length > 1) break;   // deux encarts en vue : ambigu, on n'invente pas
        }
      }
      if(!choix) continue;   // rien ne tranche : on n'invente pas de lettre

      trouvees.push({ lettre: choix.l, p: g.p });
    }
    if(!trouvees.length) return {};

    /* Le filet ci-dessous suppose que les règles sont dans l'ordre de la page. Elles ne l'étaient
       pas : elles arrivaient triées par proximité de parent. On remet l'ordre du document. */
    trouvees.sort((a, b) => {
      const rel = a.p.compareDocumentPosition(b.p);
      if(rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if(rel & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    /* Énergie ou climat ? On remonte jusqu'au conteneur qui porte un intitulé, et on regarde
       lequel des deux mots-clés arrive EN PREMIER. Tester les deux à l'aveugle ne suffit pas :
       l'encart du DPE parle aussi d'« émissions », et on le prenait pour du GES. */
    const etiqueter = (n) => {
      for(let i = 0; i < 4 && n; i++, n = n.parentElement){
        const t = (n.innerText || "").toLowerCase();
        const iG = [/gaz à effet de serre/, /\bges\b/, /climat/].reduce((min, re) => {
          const m = t.search(re); return (m >= 0 && m < min) ? m : min; }, 1e9);
        const iE = [/performance [ée]nerg/, /classe [ée]nerg/, /[ée]nergie/, /consommation/].reduce((min, re) => {
          const m = t.search(re); return (m >= 0 && m < min) ? m : min; }, 1e9);
        if(iG === 1e9 && iE === 1e9) continue;   // ce conteneur ne dit rien : on monte
        return iG < iE ? "etiqGes" : "etiqDpe";
      }
      return null;
    };
    trouvees.forEach(f => f.quoi = etiqueter(f.p));

    /* Filet : partout — Leboncoin, SeLoger, sites d'agence — l'énergie est affichée avant le climat.
       Si l'intitulé n'a pas tranché, ou s'il a donné deux fois le même, l'ordre du document décide. */
    if(trouvees.length >= 2 && (!trouvees[0].quoi || !trouvees[1].quoi || trouvees[0].quoi === trouvees[1].quoi)){
      trouvees[0].quoi = "etiqDpe";
      trouvees[1].quoi = "etiqGes";
    }
    trouvees.forEach(f => { if(f.quoi && !out[f.quoi]) out[f.quoi] = f.lettre; });
    return out;
  }

  /* Les prix que la page déclare pour les machines : JSON-LD (offers.price) et balises meta.
     Plus sûrs que le texte, mais une page peut aussi y lister des biens similaires : ils ne font que départager. */
  function prixStructures(){
    const o = [];
    const fouiller = x => {
      if(!x || typeof x !== "object") return;
      if(Array.isArray(x)){ x.forEach(fouiller); return; }
      if(x.price != null && (!x.priceCurrency || /EUR/i.test(x.priceCurrency))) o.push(parseFloat(String(x.price).replace(/[^\d.]/g, "")));
      Object.values(x).forEach(v => { if(v && typeof v === "object") fouiller(v); });
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => { try { fouiller(JSON.parse(s.textContent)); } catch(e){} });
    document.querySelectorAll('meta[itemprop="price"], meta[property="product:price:amount"], meta[property="og:price:amount"]').forEach(m => o.push(parseFloat(m.content)));
    return o.filter(v => !isNaN(v));
  }

  /* ---------- lecture du texte visible de la page ---------- */
  function lire(){
    const t = texteAnnonce();
    const d = { lieux:[] };

    // Le prix demandé : voir RadarMoteur.choisirPrix (le premier montant venu était parfois le prix hors honoraires).
    d.prix = RadarMoteur.choisirPrix(t, prixStructures());

    d.surfaces = surfaces(t);
    if(d.surfaces.length) d.surface = d.surfaces[0];
    let m;

    m = t.match(/entre\s*([0-9\s  ]{3,8})\s*(?:€|euros?)?\s*et\s*([0-9\s  ]{3,8})\s*(?:€|euros?)/i);
    if(m){ d.coutmin = nb(m[1]); d.coutmax = nb(m[2]); }

    m = t.match(/consommation[^0-9]{0,45}?([0-9]{2,4}[.,]?[0-9]*)\s*kWh/i)
     || t.match(/[ée]nergie\s+primaire[^0-9]{0,25}?([0-9]{2,4}[.,]?[0-9]*)/i)
     || t.match(/([0-9]{2,4}[.,]?[0-9]*)\s*kWh\s*(?:EP)?\s*\/?\s*m(?:²|2|²)?\s*[\/.]?\s*an/i)
     || t.match(/([0-9]{2,4}[.,]?[0-9]*)\s*kWh/i);
    if(m) d.conso = nb(m[1]);

    m = t.match(/ann[ée]e\s+de\s+construction[^0-9]{0,15}((?:1[6-9]|20)[0-9]{2})/i);
    if(m) d.annee = nb(m[1]);

    // Indice GES : « CLIMAT A indice 3 », « 7 kg CO2/m².an ». Second entier exact du diagnostic.
    m = t.match(/(?:climat|ges|gaz à effet de serre)[^0-9]{0,30}?indice\s*([0-9]{1,3})/i)
     || t.match(/([0-9]{1,3})\s*kg\s*(?:eq)?\s*CO[₂²₂2]?\s*[\/.]?\s*m/i);   // « 4 kg CO₂/m².an » : le ₂ est un indice Unicode
    if(m) d.ges = nb(m[1]);

    // Étiquettes : « classe ENERGIE B et classe CLIMAT A », « DPE : D / GES : B ».
    // Mais d'abord on efface les rangées « A B C D E F G » : ce ne sont pas des étiquettes,
    // c'est le décor de la règle. Sans ça, la première lettre venue — le A — passe pour la bonne.
    const tSansRegle = t.replace(/\bA\b[\s\S]{0,40}?\bB\b[\s\S]{0,40}?\bC\b[\s\S]{0,40}?\bD\b[\s\S]{0,40}?\bE\b[\s\S]{0,40}?\bF\b[\s\S]{0,40}?\bG\b/g, " ▮ ");
    // Un marqueur EXPLICITE est exigé : « classe énergie D », « DPE : D ». Une lettre isolée
    // dans la page n'est pas une étiquette — c'est comme ça qu'on attrapait un C au hasard.
    m = tSansRegle.match(/classe\s*[ée]nerg\w*\s*:?\s*\b([A-G])\b/i) || tSansRegle.match(/\bDPE\s*:\s*\b([A-G])\b/i);
    if(m) d.etiqDpe = m[1].toUpperCase();
    m = tSansRegle.match(/classe\s*climat\s*:?\s*\b([A-G])\b/i) || tSansRegle.match(/\bGES\s*:\s*\b([A-G])\b/i);
    if(m) d.etiqGes = m[1].toUpperCase();

    // Ce que la page montre l'emporte sur ce qu'elle écrit.
    const dom = etiquettesDOM();
    if(dom.etiqDpe) d.etiqDpe = dom.etiqDpe;
    if(dom.etiqGes) d.etiqGes = dom.etiqGes;

    // Date du diagnostic : point de correspondance quasi unique quand l'annonce la donne.
    m = t.match(/(?:diagnostic|DPE)[^0-9]{0,40}?([0-3]?[0-9])\/([0-1]?[0-9])\/(20[0-9]{2})/i);
    if(m) d.dateDpe = `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;

    // Énergie de chauffage annoncée
    const en = t.match(/\b(fioul|gaz|électri\w+|bois|granul\w+|pompe à chaleur|pac|charbon|propane|réseau de chaleur)\b/i);
    if(en) d.energie = en[1].toLowerCase();

    d.type = (/\bappartement\b/i.test(t) && !/\bmaison\b/i.test(t)) ? "appartement" : "maison";

    // Ligne par ligne : sinon le fil d'Ariane « Auvergne › Allier › Chassenard 03510 »
    // se retrouve avalé d'un bloc et la commune devient illisible.
    const CP = "(?:0[1-9]|[1-8][0-9]|9[0-5])[0-9]{3}";
    const reCom = new RegExp(`([A-ZÉÈÀÂÎÔÛ][A-Za-zÀ-ÿ'’\\-]+(?:[ \\-][A-Za-zÀ-ÿ'’\\-]+){0,3})[ ,(]+(${CP})\\b`);
    for(const ligne of t.split("\n")){
      const c = ligne.match(reCom);
      if(c){ d.commune = `${c[1].trim()} ${c[2]}`; break; }
    }
    if(!d.commune){ const cp = t.match(new RegExp(`\\b(${CP})\\b`)); if(cp) d.commune = cp[1]; }

    // Le vrai secteur est souvent dans la description, pas dans le champ commune.
    const re = /(?:proximit[ée] de|portes? de|proche de|pr[eè]s de|secteur (?:de )?|[àa][ ]*\d+[ ]*(?:mn|min|minutes|km)[ ]*d[eu]s?[ ]*)([A-ZÉÈÀÂÎÔÛ][A-Za-zÀ-ÿ'’\-]+(?:[ \-][A-ZÉÈÀÂÎÔÛa-zà-ÿ'’\-]+){0,3})/g;
    const vus = new Set(d.commune ? [d.commune] : []);
    let x;
    while((x = re.exec(t)) !== null){
      const nom = x[1].trim().replace(/[,.;].*$/,"");
      if(nom.length > 2 && !/^(la|le|les|ce|cette|un|une)$/i.test(nom)) vus.add(nom);
    }
    d.lieux = [...vus];

    /* Comment l'agent parle de la commune trahit la vérité qu'il ne peut pas écrire.
       « sur la commune de X » → c'est X. « proche de X », « à 10 min de X » → c'est autour, pas X.
       On lit les mots qui précèdent le nom de la commune et on en tire un mode géographique.
       Vérifié sur de vraies annonces (Bourgogne, Gironde, Vendômois…), tournures récurrentes. */
    d.geoMode = lireLocalisation(t, d.commune);
    return d;
  }

  function lireLocalisation(texte, commune){
    if(!commune) return "centre";
    const ville = commune.replace(/\s*\d{5}.*$/, "").trim();   // « Paray-le-Monial 71600 » → « Paray-le-Monial »
    if(ville.length < 3) return "centre";
    const esc = ville.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // On rassemble tout ce qui précède immédiatement une mention de la ville (≤ 45 caractères).
    const avant = [];
    const re = new RegExp(`([\\s\\S]{0,45})${esc}`, "gi");
    let m; while((m = re.exec(texte)) !== null){ avant.push(m[1].toLowerCase()); if(re.lastIndex <= m.index) re.lastIndex++; }
    if(!avant.length) return "centre";

    // EXCLUT : proximité floue, ou « à » suivi d'un CHIFFRE (à 10 min, à 5 km).
    const EXCLUT = [
      /proximit[ée]\s+(?:imm[ée]diate\s+)?d[eu]s?\s*$/, /\bproche[s]?\s+d[eu]s?\s*$/, /\bpr[eè]s\s+d[eu]s?\s*$/,
      /\bportes?\s+d[eu]s?\s*$/, /\babords?\s+d[eu]s?\s*$/, /\bsecteur\s+(?:de\s+)?$/,
      /[àa]\s+l['’]\s*[ée]cart\s+d[eu]s?\s*$/, /\benviron[s]?\s+d[eu]s?\s*$/, /\bentour[ée]e?s?\s+d[eu]s?\s*$/,
      // « à 10 min de », « à seulement 10 minutes de », « à 5 km en voiture de »
      /[àa]\s+(?:seulement\s+|environ\s+|moins\s+de\s+)?\d+\s*(?:mn|min|minute[s]?|km|h)\s*(?:en\s+voiture\s*)?d[eu]s?\s*$/,
    ];
    // VERROUILLE : tournures explicites, ou « à » suivi directement d'une MAJUSCULE (à Changy).
    const VERROU = [
      /sur\s+la\s+commune\s+d[eu]s?\s*$/, /\bau\s+c(?:œ|oe)ur\s+d[ue]\s+village\s+d[eu]s?\s*$/,
      /\ben\s+plein\s+c(?:œ|oe)ur\s+d[eu]s?\s*$/, /\ben\s+centre[\s-]ville\s+d[eu]s?\s*$/,
      /\bcommune\s+d[eu]s?\s*$/,
    ];
    /* « à » + Majuscule (à Changy) → verrouille. Mais PAS « à 10 min » (à + chiffre).
       On regarde ce qui suit immédiatement le « à » qui précède la ville. */
    const aMaj = new RegExp(`(?:^|[\\s.,;])([àaÀA])\\s+(?:seulement\\s+)?(.)`, "g");
    let aMajuscule = false, mm;
    const posVille = texte.search(new RegExp(esc, "i"));
    while((mm = aMaj.exec(texte)) !== null){
      // ce « à » colle-t-il juste à la ville ? (la ville commence dans les ~3 caractères qui suivent)
      const apres = texte.slice(mm.index + mm[0].length - 1);
      if(new RegExp(`^\\s*${esc}`, "i").test(apres) && /[A-ZÉÈÀÂÎÔÛ]/.test(mm[2])) aMajuscule = true;
    }

    const excl = avant.some(a => EXCLUT.some(re => re.test(a)));
    const verr = avant.some(a => VERROU.some(re => re.test(a))) || aMajuscule;

    if(excl) return "exclu";       // priorité à l'exclusion : « à 10 min de X, proche du centre » = pas X
    if(verr) return "verrouillé";
    return "centre";
  }

  /* ---------- requêtes ---------- */

  /* L'annonce écrit « Date de réalisation du diagnostic ». Ce n'est ni la date d'établissement
     (l'édition du document), ni une approximation : c'est `date_visite_diagnostiqueur`, un champ
     de la base — et il tombe au JOUR EXACT. Trois cas sur trois (Vitry, Saint-Aubin, Digoin).

     `date_etablissement_dpe` reste en second, dans un OR, pour les DPE où la visite n'est pas
     renseignée. Fenêtre courte : l'établissement suit la visite de quelques jours (J+5 à Digoin,
     J+8 à Changy), pas de quelques mois. Trop large, elle noierait la requête sous des centaines
     de DPE sans rapport. */
  function fenetre(iso, marge){
    const d0 = new Date(iso + "T00:00:00");
    if(isNaN(d0)) return null;
    const j = n => { const x = new Date(d0); x.setDate(x.getDate() + n); return x.toISOString().slice(0,10); };
    const v = marge>0 ? 5 : 2;
    return `(date_visite_diagnostiqueur:[${j(-v)} TO ${j(v)}]`
         + ` OR date_etablissement_dpe:[${j(marge>0 ? -5 : -2)} TO ${j(marge>0 ? 40 : 21)}])`;
  }

  /* ---------- ce qui filtre, ce qui ne fait qu'indice ----------
     Quatre cas réels (Vitry, Changy, Saint-Aubin, Digoin) :

       DATE DE VISITE — jour exact, trois fois sur trois.  → LE filtre
       SURFACE        — 99,7 → « 100 ». 171,1 → « 171 ». Mais 108 → « 165 » à Digoin.
                        L'agent compte l'étage aménageable et la véranda quand ça l'arrange.
                        → indice seul dès qu'on a la date. Filtre large sinon.
       CONSO          — 386,7 → « 413 ». 58,8 → « 71 ».  → indice, filtre très large
       ÉTIQUETTES     — E/D → « E/E » à Digoin, A/A → « B/A » à Saint-Aubin.  → indice seul
       FACTURE        — 2 817 € tombe dans la fourchette 2 360-3 270 annoncée.  → indice honnête

     Et un motif : l'agent gonfle TOUJOURS dans le même sens. Jamais il ne sous-évalue.
     D'où des pénalités asymétriques au score.

     Principe : aucun critère douteux n'élimine. On accumule, on tolère large, le score tranche. */

  const SURF = 0.03;   // l'arrondi de l'agent quand il est honnête
  const CONSO = 0.25;  // l'écart constaté va jusqu'à 21 %

  function bornesSurface(s, marge, large){
    if(s == null) return null;
    const k = (large ? 0.40 : SURF) + (marge>0 ? 0.10 : 0);
    const d = Math.max(s*k, 2);
    // L'agent gonfle : la vraie surface est plus souvent en dessous qu'au-dessus.
    return `surface_habitable_logement:[${Math.max(s-d*1.6, 15).toFixed(0)} TO ${(s+d).toFixed(0)}]`;
  }

  /* ---------- chercher dans un cercle, pas dans un département ----------
     Le département est une frontière administrative, pas une frontière de marché.
     Le 71 fait 150 km de large ; toi, tu cherches dans 15. Résultat : je ramène cent fois
     trop de bruit, la base me tronque à 1 000 lignes, et la bonne maison reste page 12.
     Pire : une maison « à 10 minutes de Digoin » peut être dans l'Allier — jamais cherchée.

     La base est géolocalisée (`_geopoint`). On lui demande donc un CADRE autour du centre,
     dérivé du rayon choisi. Cette requête vient EN PLUS de la départementale, jamais à sa
     place : ce qui marche aujourd'hui continue de marcher, la bbox ne fait qu'ajouter. */
  function boite(centre, rayonKm){
    if(!centre || !rayonKm || rayonKm > 100) return null;   // « tout le département » : pas de cadre
    const marge = rayonKm * 1.25;                           // un peu de gras : le cadre est carré, le rayon rond
    const dLat = marge / 111;
    const dLon = marge / (111 * Math.cos(centre.lat * Math.PI / 180));
    // bbox = ouest,sud,est,nord
    return [ (centre.lon - dLon).toFixed(4), (centre.lat - dLat).toFixed(4),
             (centre.lon + dLon).toFixed(4), (centre.lat + dLat).toFixed(4) ].join(",");
  }

  function urlNeuf(v, dept, marge, local){
    const f = [`type_batiment:"${v.type}"`];
    let mode;

    /* Le garde-fou géographique : soit un cadre (bbox), soit le département.
       Le cadre est meilleur — il colle au rayon demandé et ignore les frontières administratives.
       Le département reste, en parallèle, comme filet : c'est lui qui a validé nos quatre cas. */
    const bbox = local && local.bbox ? local.bbox : null;
    const geo  = () => { if(!bbox && dept) f.push(`code_departement_ban:"${dept}"`); };
    const fin  = (m) => ({
      url: `${API_NEUF}?size=100&select=${C_NEUF.join(",")}&qs=${encodeURIComponent(f.join(" AND "))}`
           + (bbox ? `&bbox=${bbox}` : ""),
      mode: m
    });

    if(v.dateDpe && (dept || bbox) && fenetre(v.dateDpe, marge)){
      // 1. La date de visite du diagnostiqueur. Le seul point que l'agent recopie sans le retoucher.
      // Aucun autre critère ne s'en mêle : c'est la surface qui avait tué Digoin.
      geo();
      f.push(fenetre(v.dateDpe, marge));
      return fin("date");
    }

    const S = bornesSurface(v.surface, marge, true);   // sans la date, la surface borne — mais large

    if(v.conso != null){
      // 2. La consommation, large. L'annonce la gonfle : +7 % à Changy, +21 % à Saint-Aubin.
      const k = CONSO + (marge>0 ? 0.15 : 0);
      f.push(`conso_5_usages_par_m2_ep:[${(v.conso*(1-k)).toFixed(0)} TO ${(v.conso*(1+k)).toFixed(0)}]`);
      if(S) f.push(S);
      // Sans garde-fou, la conso seule ramène la France entière : la requête large reste nationale
      // (une page, pour la curiosité), les variantes bornées font le vrai travail.
      if(local) geo();
      mode = "conso";

    }else{
      if(!dept && !bbox) return null;
      geo();

      if(v.ges != null){
        const k = CONSO + (marge>0 ? 0.15 : 0);
        f.push(`emission_ges_5_usages_par_m2:[${(v.ges*(1-k)).toFixed(0)} TO ${(v.ges*(1+k)).toFixed(0)}]`);
        mode = "ges";

      }else if(v.coutmin != null && v.coutmax != null){
        // La facture s'est révélée honnête à Digoin : 2 817 € dans la fourchette 2 360-3 270.
        const l = v.coutmax - v.coutmin;
        f.push(`cout_total_5_usages:[${Math.floor(v.coutmin - l*0.25)} TO ${Math.ceil(v.coutmax + l*(0.25 + marge))}]`);
        mode = "facture";

      }else if(S){
        mode = "surface";

      }else{
        return null;   // rien à quoi se raccrocher
      }
      if(S) f.push(S);
    }
    return fin(mode);
  }

  function urlVieux(v, dept, marge){
    if(!dept || v.surface==null || v.conso==null) return null;   // sans conso, cette base est inexploitable
    const tolS = 10 + (marge>0?6:0);   // surface thermique ≠ surface habitable
    const k = CONSO + (marge>0 ? 0.15 : 0);   // même dérive que dans la base récente
    const f = [`tv016_departement_code:"${dept}"`, `geo_score:[0.3 TO 1]`,
      `surface_thermique_lot:[${(v.surface-tolS).toFixed(1)} TO ${(v.surface+tolS).toFixed(1)}]`,
      `consommation_energie:[${(v.conso*(1-k)).toFixed(0)} TO ${(v.conso*(1+k)).toFixed(0)}]`];
    if(v.annee!=null){
      // L'ancienne base tasse tout l'avant-guerre sur 1947/1948 : une année réelle (1880) n'y figure jamais.
      f.push(v.annee < 1949 ? `annee_construction:[1800 TO 1948]`
                            : `annee_construction:[${v.annee-(marge>0?5:2)} TO ${v.annee+(marge>0?5:2)}]`);
    }
    return `${API_VIEUX}?size=60&select=${C_VIEUX.join(",")}&qs=${encodeURIComponent(f.join(" AND "))}`;
  }

  /* La base répond 100 lignes par page, dans SON ordre — pas dans le nôtre. Se contenter de la
     première page, c'est tirer au sort : 162 DPE dans le 71, 100 rapatriés, et la bonne maison
     jamais envoyée (Changy). On moissonne donc jusqu'au bout.

     On suit le lien `next` que la base nous tend dans sa réponse, plutôt que de fabriquer un
     `&page=N` dont rien ne garantit qu'il soit supporté. C'est elle qui sait paginer, pas nous. */
  async function moisson(url, maxPages, norm){
    let r = await req(url);
    if(!r || !r.data) return { liste: [], total: 0, recus: 0, pages: 0, erreur: (r && r.erreur) || "pas de réponse" };
    const total = r.data.total || 0;
    let brut = r.data.results || [];
    let pages = 1;

    while(r.data.next && brut.length < total && pages < maxPages){
      r = await req(r.data.next);
      if(!r || !r.data || !r.data.results || !r.data.results.length) break;
      brut = brut.concat(r.data.results);
      pages++;
    }
    return { liste: brut.map(norm), total, recus: brut.length, pages };
  }

  const normNeuf = x => {
    const [la,lo] = (x._geopoint||",").split(",").map(parseFloat);
    return { source:"récent", adresse:x.adresse_ban, commune:x.nom_commune_ban, cp:x.code_postal_ban,
      insee:x.code_insee_ban,
      surface:x.surface_habitable_logement, dpe:x.etiquette_dpe, ges2:x.etiquette_ges,
      ges:x.emission_ges_5_usages_par_m2,
      cout:x.cout_total_5_usages, conso:x.conso_5_usages_par_m2_ep, construction:x.periode_construction,
      chauffage:x.type_energie_principale_chauffage,
      date:x.date_etablissement_dpe, visite:x.date_visite_diagnostiqueur,
      lat:la, lon:lo, fiab:1, id:x.numero_dpe };
  };
  const normVieux = x => ({ source:"avant 2021", adresse:x.geo_adresse, commune:"", cp:"",
    insee:x.code_insee_commune_actualise,
    surface:x.surface_thermique_lot, dpe:x.classe_consommation_energie, ges2:x.classe_estimation_ges,
    ges:null,
    cout:null, conso:x.consommation_energie, construction:x.annee_construction, chauffage:"",
    date:x.date_etablissement_dpe, visite:null, lat:x.latitude, lon:x.longitude, fiab:x.geo_score, id:x.numero_dpe });

  /* L'écran 2 (le rapport détaillé) et la collecte vivent dans rapport.js et moteur/ : un seul code pour l'extension et les tests. */

  /* ---------- panneau ---------- */
  function ouvrirPanneau(){
  if(document.getElementById("radar-maison-hote")){
    document.getElementById("radar-maison-hote").remove();
    return;                                    // second appel = on referme
  }
  const hote = document.createElement("div");
  hote.id = "radar-maison-hote";
  hote.style.cssText = "position:fixed;top:0;right:0;width:430px;height:100vh;z-index:2147483647";
  document.documentElement.appendChild(hote);
  const S = hote.attachShadow({ mode:"open" });

  RadarUI.police();
  S.innerHTML = `<style>${RadarUI.css}</style>
  <div class="panneau" id="zone">
    <div class="entete"><div class="ligne">
      <span class="marque"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3FD0DA" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="4.5"></circle><path d="M12 12 L18 6"></path></svg>Radar Maison</span>
      <button class="ico" id="x" aria-label="Fermer">${RadarUI.SVG.fermer}</button>
    </div></div>
    <div id="ecran1" class="corps">
      <div class="carte pile">
        <div><label class="etiq" for="commune">Commune</label><input id="commune"><div class="chips petites" id="chips" style="margin-top:8px"></div></div>
        <div><span class="etiq">Interprétation</span>
          <div class="seg" id="seg-geo">
            <button data-v="verrouillé">Dans la ville</button><button data-v="centre">Autour</button><button data-v="exclu">Autour, pas dedans</button>
          </div><input type="hidden" id="geoMode" value="centre"></div>
        <div><span class="etiq">Rayon</span>
          <div class="chips rayons" id="chips-rayon">
            <button class="chip" data-v="5">5 km</button><button class="chip" data-v="10">10 km</button><button class="chip on" data-v="15">15 km</button><button class="chip" data-v="25">25 km</button><button class="chip" data-v="40">40 km</button><button class="chip" data-v="999">Dépt</button>
          </div><input type="hidden" id="rayon" value="15"></div>
        <button class="bouton contour" id="plus"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9 V4 H9 M20 9 V4 H15 M4 15 V20 H9 M20 15 V20 H15"></path></svg>Élargir les critères</button>
        <div class="sep">
          <button class="replier" id="tog-crit" aria-expanded="false"><span>Caractéristiques retenues</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6 L15 12 L9 18"></path></svg></button>
          <div id="crit" style="display:none;flex-direction:column;gap:10px;padding-bottom:4px">
            <div class="grille2">
              <div><label class="etiq" for="type">Type</label><select id="type" style="height:40px;font-size:14px;padding:0 8px"><option value="maison">Maison</option><option value="appartement">Appartement</option></select></div>
              <div><label class="etiq" for="surface">Surface (m²)</label><input id="surface"></div>
              <div><label class="etiq" for="conso">Conso (kWh/m²)</label><input id="conso"></div>
              <div><label class="etiq" for="ges">GES (kg CO₂/m²)</label><input id="ges"></div>
              <div><label class="etiq" for="etiqDpe">Étiquette énergie</label><input id="etiqDpe" maxlength="1" placeholder="A→G"></div>
              <div><label class="etiq" for="etiqGes">Étiquette climat</label><input id="etiqGes" maxlength="1" placeholder="A→G"></div>
              <div><label class="etiq" for="dateDpe">Date du DPE</label><input id="dateDpe" placeholder="2025-07-12"></div>
              <div><label class="etiq" for="annee">Année</label><input id="annee"></div>
              <div><label class="etiq" for="coutmin">Facture min (€)</label><input id="coutmin"></div>
              <div><label class="etiq" for="coutmax">Facture max (€)</label><input id="coutmax"></div>
            </div>
            <div class="chips petites" id="chips-surf"></div>
            <button class="bouton doux" id="relire" style="height:40px;font-size:13px">Relire la page</button>
            <button class="bouton" id="go" style="display:none;height:40px;font-size:13px">Relancer</button>
          </div>
        </div>
        <div class="statut" id="statut"></div>
      </div>
      <div id="res" class="pile"></div>
      <pre id="brut" style="display:none"></pre>
    </div>
    <div id="ecran2" style="display:none;flex:1;flex-direction:column"></div>
  </div>`;

  const $ = id => S.getElementById(id);
  $("x").onclick = () => hote.remove();

  $("statut").textContent = "Lecture de l'annonce…";
  deplier();
  setTimeout(demarrer, 450);   // le temps que le « Voir plus » ait fait son effet

  function demarrer(){
  const v = lire();
  $("brut").textContent = texteAnnonce();
  ["surface","conso","ges","etiqDpe","etiqGes","dateDpe","annee","coutmin","coutmax","commune"].forEach(k => { if(v[k]!=null) $(k).value = v[k]; });
  $("type").value = v.type;

  // Interprétation géographique : pré-remplie par la lecture, corrigeable d'un clic.
  const poserGeo = val => { $("geoMode").value = val; $("seg-geo").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === val)); };
  poserGeo(v.geoMode || "centre");
  $("seg-geo").onclick = e => { const b = e.target.closest("button"); if(!b) return; poserGeo(b.dataset.v); chercher(0); };
  $("chips-rayon").onclick = e => { const b = e.target.closest("button"); if(!b) return;
    $("rayon").value = b.dataset.v; $("chips-rayon").querySelectorAll(".chip").forEach(o => o.classList.toggle("on", o === b)); chercher(0); };
  const ouvrirCrit = ouvert => { $("crit").style.display = ouvert ? "flex" : "none"; $("tog-crit").classList.toggle("ouvert", ouvert); $("tog-crit").setAttribute("aria-expanded", ouvert); };
  $("tog-crit").onclick = () => ouvrirCrit($("crit").style.display === "none");

  if(v.surfaces && v.surfaces.length > 1){
    $("chips-surf").innerHTML = v.surfaces.slice(0,5)
      .map(s => `<button class="chip${s===v.surface?" actif":""}">${s}</button>`).join("");
    $("chips-surf").querySelectorAll(".chip").forEach(b => b.onclick = () => {
      $("surface").value = b.textContent;
      $("chips-surf").querySelectorAll(".chip").forEach(o => o.classList.remove("actif"));
      b.classList.add("actif");
    });
  }

  if(v.lieux.length > 1){
    $("chips").innerHTML = v.lieux.map(l => `<button class="chip${l===v.commune?" actif":""}">${l}</button>`).join("");
    $("chips").querySelectorAll(".chip").forEach(b => b.onclick = () => {
      $("commune").value = b.textContent;
      $("chips").querySelectorAll(".chip").forEach(o => o.classList.remove("actif"));
      b.classList.add("actif");
    });
  }

  const manque = [];
  if(v.surface==null) manque.push("surface");
  if(v.conso==null && v.coutmin==null) manque.push("conso ou facture");
  if(!v.commune) manque.push("commune");

  /* ---------- recherche ---------- */
  let centre = null;

  async function geocoder(q){
    for(const u of [`${BAN}?q=${encodeURIComponent(q)}&type=municipality&limit=1`, `${BAN}?q=${encodeURIComponent(q)}&limit=1`]){
      const r = await req(u);
      const f = r.data && r.data.features && r.data.features[0];
      if(f) return { lon:f.geometry.coordinates[0], lat:f.geometry.coordinates[1],
                     nom:f.properties.city || f.properties.label, dept:(f.properties.postcode||"").slice(0,2) };
    }
    return null;
  }

  async function chercher(marge){
    // Les étiquettes viennent du champ, pas de la lecture initiale : c'est toi qui as le dernier mot.
    const lettre = id => { const m = $(id).value.trim().toUpperCase().match(/^[A-G]$/); return m ? m[0] : null; };
    const c = {
      type:$("type").value, surface:nb($("surface").value), conso:nb($("conso").value),
      ges:nb($("ges").value), dateDpe:$("dateDpe").value.trim() || null,
      etiqDpe:lettre("etiqDpe"), etiqGes:lettre("etiqGes"), energie:v.energie,
      annee:nb($("annee").value), coutmin:nb($("coutmin").value), coutmax:nb($("coutmax").value)
    };
    if(!$("commune").value.trim()){ $("statut").textContent = "Indique une commune."; return; }

    // L'interprétation géographique pilote le rayon effectif et l'exclusion de la ville.
    const geoMode = $("geoMode").value;
    const villeCible = $("commune").value.trim().replace(/\s*\d{5}.*$/, "").trim().toLowerCase();
    // « verrouillé » resserre à 4 km, quel que soit le rayon affiché. Les autres respectent le curseur.
    const rayonEffectif = geoMode === "verrouillé" ? 4 : parseFloat($("rayon").value);

    $("go").disabled = true;
    $("statut").textContent = "Localisation…";
    centre = await geocoder($("commune").value.trim());
    if(!centre){ $("statut").textContent = "Commune introuvable."; $("go").disabled = false; return; }

    const rN_ = urlNeuf(c, centre.dept, marge, false);
    const uN = rN_ ? rN_.url : null, mode = rN_ ? rN_.mode : null;

    // La départementale : elle a validé nos quatre cas, on la garde telle quelle.
    const rL_ = (mode === "conso" && centre.dept) ? urlNeuf(c, centre.dept, marge, true) : null;
    const uL = rL_ ? rL_.url : null;

    /* La géographique : un cadre autour du centre, du rayon que tu as choisi.
       Elle vient EN PLUS, jamais à la place. Elle rattrape deux choses que la départementale
       ne peut pas voir : les candidats noyés par la troncature (1 000 lignes pour un département
       de 150 km de large), et ceux qui sont juste de l'autre côté d'une frontière administrative. */
    const bb = boite(centre, rayonEffectif);
    const rB_ = bb ? urlNeuf(c, centre.dept, marge, { bbox: bb }) : null;
    const uB = rB_ ? rB_.url : null;

    const uV = urlVieux(c, centre.dept, marge);
    if(!uN && !uV){ $("statut").textContent = "Il faut au moins la date du DPE, la conso ou la surface."; ouvrirCrit(true); $("go").disabled = false; return; }

    $("statut").textContent = "Recherche…";
    /* Combien de pages ? Ça dépend de l'étendue de la requête.
       - Mode conso sans borne : la requête couvre la France entière. Une page, pour la curiosité.
       - Tout le reste est borné (département ou cadre) : on moissonne jusqu'au bout. */
    const pagesN = (mode === "conso") ? 1 : 10;
    const [mN, mL, mB, mV] = await Promise.all([
      uN ? moisson(uN, pagesN, normNeuf) : null,
      uL ? moisson(uL, 10, normNeuf)     : null,
      uB ? moisson(uB, 10, normNeuf)     : null,
      uV ? moisson(uV, 5,  normVieux)    : null
    ]);
    const a  = mN ? mN.liste : [];
    const aL = mL ? mL.liste : [];
    const aB = mB ? mB.liste : [];
    const b  = mV ? mV.liste : [];

    // Ce que la base avait vraiment sous la main, face à ce qu'elle nous a servi.
    const compte = { national: mN, local: mL, boite: mB, vieux: mV, rayon: rayonEffectif };

    // Fusion : la géographique d'abord, c'est elle qui colle au besoin. Le numéro de DPE fait la clé.
    const vus = new Set(), tout = [];
    [...aB, ...aL, ...a, ...b].forEach(x => {
      const cle = x.id || `${x.adresse}|${x.date}|${x.conso}`;
      if(vus.has(cle)) return;
      vus.add(cle);
      tout.push(x);
    });

    $("statut").textContent = "";
    $("go").disabled = false;

    afficher(tout, c, marge, mode, compte, { geoMode, villeCible, rayonEffectif });
  }

  function afficher(res, c, marge, mode, compte, geo){
    geo = geo || { geoMode:"centre", villeCible:"", rayonEffectif: parseFloat($("rayon").value) };
    const rayon = geo.rayonEffectif;

    // Un DPE sans adresse ni coordonnées ne répond pas à la question posée. Pire : sans coordonnées,
    // il échappe à la pénalité de distance et remonte en tête. On l'écarte — mais on le COMPTE :
    // tant qu'on jette dans le noir, on ne peut pas dire honnêtement « le bien n'est pas dans la base ».
    const avant = res.length;
    res = res.filter(x => x.adresse && x.lat && x.lon);
    const muets = avant - res.length;

    /* Le mouchard, réduit à l'essentiel : rien quand tout va bien, une alerte quand la base a été coupée
       (la leçon de Changy : la bonne maison peut être dans ce qui n'a pas été lu) ou quand le cadre a échoué.
       Le détail chiffré reste au survol. */
    const alertes = () => {
      if(!compte) return "";
      const national = (mode === "conso");
      /* Une requête coupée ne compte que si elle couvre le rayon demandé : quand la recherche par cadre a répondu
         en entier, la départementale tronquée ne cache rien d'utile (Digoin, 10/10/2026 : alerte à tort). */
      const coupe = k => compte[k] && !compte[k].erreur && compte[k].total > compte[k].recus;
      const cadreOk = compte.boite && !compte.boite.erreur;
      const trou = cadreOk ? (coupe("boite") || coupe("vieux")) : ((coupe("national") && !national) || coupe("local") || coupe("vieux"));
      const bboxKo = compte.boite && compte.boite.erreur;
      const detail = [["national", national ? "France" : "Département"], ["local", "Département"], ["boite", `Cadre ${compte.rayon} km`], ["vieux", "Avant 2021"]]
        .filter(([k]) => compte[k]).map(([k, n]) => `${n} : ${compte[k].erreur ? "échec" : compte[k].recus + "/" + compte[k].total}`).join(" · ")
        + (muets ? ` · ${muets} sans adresse` : "");
      const sansDate = { conso: "Sans date de DPE", ges: "Sans date ni conso", facture: "Sur la facture seule", surface: "Sur la surface seule" }[mode];
      const a = [];
      if(sansDate) a.push(`<span class="alerte" title="Sans la date du diagnostic, les résultats sont moins sûrs. Saisis-la dans Caractéristiques retenues si tu la trouves.">${RadarUI.SVG.alerte}${sansDate}</span>`);
      if(trou) a.push(`<span class="alerte" title="${RadarUI.esc(detail)}">${RadarUI.SVG.alerte}Base coupée : réduis le rayon</span>`);
      if(bboxKo) a.push(`<span class="alerte" title="${RadarUI.esc(detail)}">${RadarUI.SVG.alerte}Recherche par cadre en échec</span>`);
      return a.length ? `<div class="alertes">${a.join("")}</div>` : "";
    };

    if(!res.length){
      const rien = !compte || !compte.national || compte.national.total === 0;
      $("res").innerHTML = `<div class="vide"><b>${rien ? "Aucun DPE ne correspond." : "Aucun candidat avec une adresse."}</b><br>
        ${rien ? "Vérifie la date du DPE, puis élargis." : `${muets} DPE sans adresse géocodée.`}</div>` + alertes();
      return 0;
    }

    const cands = res.map(x => {
      const d = (x.lat && centre) ? km(centre.lat,centre.lon,x.lat,x.lon) : null;
      const dS = x.surface - c.surface;
      const dE = (c.conso!=null && x.conso!=null) ? x.conso - c.conso : null;

      /* Barème commun à tous les critères souples.
         Le principe est le même partout : un écart proche RAPPORTE gros, un écart aberrant COÛTE
         gros, et rien n'élimine jamais. Une saisie bâclée reste possible — le candidat reste dans
         la liste — mais elle est improbable, donc elle se paie. C'est la différence entre
         « ne jamais éliminer » et « ne presque pas peser » : on avait glissé du mauvais côté.

         `gonfle` : l'agent gonfle toujours dans le même sens (386,7 → « 413 », 108 m² → « 165 »).
         Une valeur de base plus basse que l'annonce est donc à demi-excusable. Mais l'excuse a
         une limite : elle explique +50 %, pas +125 %. Au-delà, la pénalité redevient pleine. */
      const gonfle = (base, annonce, plafond) =>
        (base <= annonce && Math.abs(base - annonce) / annonce <= plafond) ? 0.5 : 1;

      const bareme = (ecart, paliers, plafondExcuse, base, annonce) => {
        for(const [seuil, points, nom] of paliers){
          if(ecart <= seuil) return { pts: points, nom: points > 0 ? nom : null };
        }
        // Au-delà du dernier palier : la pénalité continue de creuser, sans limite.
        const [dernier, malus] = paliers[paliers.length - 1];
        const p = malus - (ecart - dernier) * 120;
        return { pts: p * gonfle(base, annonce, plafondExcuse), nom: null };
      };

      // Faisceau d'indices. Aucun n'élimine : chacun pousse ou retient.
      let s = 60;                       // on part au milieu, pas de la perfection
      const indices = [];               // ce qui a matché, pour l'afficher

      // Distance : le plus lourd. Une annonce ment sur le point, pas sur le secteur.
      if(d != null) s -= Math.min(d * 1.6, 55);

      /* Mode « exclu » : l'annonce dit « proche de X », « à 10 min de X » — donc PAS X.
         Un candidat situé dans la ville nommée est très probablement le mauvais : on le déclasse
         fortement. Mais on ne l'efface JAMAIS — si l'agent a mal tourné sa phrase, il reste là,
         tout en bas, rattrapable. C'est la règle : aucun critère de texte n'élimine en dur. */
      if(geo.geoMode === "exclu" && geo.villeCible && x.commune
         && x.commune.toLowerCase().includes(geo.villeCible)){
        s -= 35; indices.push("⚠ dans la ville exclue");
      }

      // La date de VISITE — le seul point que l'agent recopie sans le retoucher.
      if(c.dateDpe){
        if(x.visite === c.dateDpe){ s += 35; indices.push("MÊME JOUR DE VISITE"); }
        else if(x.date){
          const e = Math.round((new Date(x.date) - new Date(c.dateDpe)) / 86400000);
          if(e === 0){ s += 25; indices.push("MÊME JOUR DE DPE"); }
          else if(e >= -2 && e <= 35){ s += 15; indices.push(`DPE établi J${e>=0?"+":""}${e}`); }
          else s -= 15;
        }
      }

      /* Surface. Digoin a montré qu'elle ne peut pas FILTRER (108 m² annoncés « 165 »).
         Mais une maison de 86 m² pour 192 annoncés n'est pas une saisie bâclée, c'est une autre
         maison. Elle reste affichée, elle plonge au classement. */
      if(c.surface && x.surface){
        const ec = Math.abs(dS) / c.surface;
        const r = bareme(ec, [
          [0.01, +25, "surface exacte"],
          [0.03, +16, "surface arrondie"],
          [0.10,  +6, "surface proche"],
          [0.25, -10],
          [0.50, -30]
        ], 0.50, x.surface, c.surface);
        s += r.pts;
        if(r.nom) indices.push(r.nom);
      }

      // Consommation. L'annonce la gonfle : +7 % à Changy, +21 % à Saint-Aubin. Mais pas de 200 %.
      if(dE != null && c.conso){
        const ec = Math.abs(dE) / c.conso;
        const r = bareme(ec, [
          [0.02, +20, "conso exacte"],
          [0.10, +12, "conso proche"],
          [0.25,  +5, "conso plausible"],
          [0.50, -20]
        ], 0.30, x.conso, c.conso);
        s += r.pts;
        if(r.nom) indices.push(r.nom);
      }

      /* GES : PRUDENCE. L'annonce affiche parfois l'émission « 4 kg CO₂/m².an », mais le champ
         `emission_ges_5_usages_par_m2` de la base ne vaut pas la même chose (26 pour ce bien).
         Tant qu'on n'a pas élucidé ce facteur d'échelle, le GES récompense un accord franc mais
         ne fait JAMAIS plonger un candidat : sa pénalité est bornée à −8. */
      if(c.ges != null && x.ges != null && c.ges){
        const ec = Math.abs(x.ges - c.ges) / c.ges;
        if(ec <= 0.02){ s += 14; indices.push("GES exact"); }
        else if(ec <= 0.15){ s += 8; indices.push("GES proche"); }
        else if(ec <= 0.40){ s += 2; }
        else s -= 8;   // borné : on ne comprend pas encore l'échelle, on ne détruit pas le score
      }

      // Étiquettes : elles se trompent aussi (Digoin : annonce E/E, base E/D).
      // On récompense l'accord, on ne sanctionne pas le désaccord.
      if(c.etiqDpe && x.dpe && c.etiqDpe === x.dpe){ s += 6; indices.push("étiquette DPE"); }
      if(c.etiqGes && x.ges2 && c.etiqGes === x.ges2){ s += 6; indices.push("étiquette GES"); }

      // Facture : à Digoin, 2 817 € tombait pile dans la fourchette 2 360-3 270 annoncée.
      // Elle est plus honnête que la conso — c'est un calcul, pas une saisie.
      if(c.coutmin != null && c.coutmax != null && x.cout != null){
        if(x.cout >= c.coutmin && x.cout <= c.coutmax){ s += 12; indices.push("facture dans la fourchette"); }
        else {
          const hors = x.cout < c.coutmin ? (c.coutmin - x.cout)/c.coutmin : (x.cout - c.coutmax)/c.coutmax;
          s -= Math.min(hors * 50, 10);
        }
      }

      // Énergie de chauffage : saisie du diagnostiqueur incertaine → on récompense, on ne punit pas
      if(c.energie && x.chauffage){
        const ch = x.chauffage.toLowerCase();
        const colle = ch.includes(c.energie.slice(0,4)) ||
                      (c.energie.includes("pompe") && (ch.includes("électri") || ch.includes("pac"))) ||
                      (c.energie.includes("pac") && ch.includes("électri")) ||
                      (c.energie.includes("granul") && ch.includes("bois"));
        if(colle){ s += 7; indices.push("chauffage"); }
      }

      // Période de construction : tranches larges, indice faible
      if(c.annee && x.construction){
        const bornes = String(x.construction).match(/(\d{4})/g);
        if(bornes){
          const min = +bornes[0], max = bornes[1] ? +bornes[1] : min;
          if(/avant/i.test(x.construction) ? c.annee < 1949 : (c.annee >= min - 3 && c.annee <= max + 3)){
            s += 5; indices.push("époque");
          }
        }
      }

      if(x.source !== "récent") s -= 8;
      if(x.fiab < 0.8) s -= 8;

      // Plancher à 1 (jamais négatif à l'affichage), mais PAS de plafond : c'est lui qui écrasait
      // une maison parfaite et une maison à moitié fausse au même rang de 99.
      return {...x, d, dS, dE, indices, s: Math.max(1, Math.round(s))};
    }).sort((a,b) => b.s - a.s);

    const dans = cands.filter(x => x.d==null || x.d<=rayon);
    const hors = cands.filter(x => x.d!=null && x.d>rayon);

    /* Le score traduit en mots (10/10/2026) : Très probable = même jour de visite ET score ≥ 90, ou score ≥ 110 ;
       Probable ≥ 80 ; Possible ≥ 55 ; en dessous, Peu probable. Deux premiers à moins de 10 points : « à départager ».
       Calibrage Digoin : deux maisons visitées le même jour (98 et 79) — la date seule ne suffit pas à dire « très probable ». */
    const proba = x => ((x.indices.includes("MÊME JOUR DE VISITE") && x.s >= 90) || x.s >= 110) ? ["Très probable", "p-tres"]
      : x.s >= 80 ? ["Probable", "p-prob"] : x.s >= 55 ? ["Possible", "p-poss"] : ["Peu probable", "p-peu"];
    const serres = dans.length > 1 && dans[0].s - dans[1].s < 10;
    const esc = RadarUI.esc;
    const fiche = (x, i, idx) => {
      const [lib, cls] = proba(x);
      return `<div class="carte fiche ${i===0?"top":""} ${x.d>rayon?"loin":""}">
      <div class="haut"><div style="min-width:0"><p class="adr">${esc(x.adresse || "Adresse non géocodée")}</p><span class="com">${esc([x.commune, x.cp].filter(Boolean).join(" "))}</span></div>
        <div class="proba"><span class="pill ${cls}">${lib}</span><span class="petit">${serres && i < 2 ? "à départager · " : ""}score ${x.s}</span></div></div>
      <div class="duo">
        <a href="https://www.google.com/maps?q&layer=c&cbll=${x.lat},${x.lon}" target="_blank" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="5" r="2.5"></circle><path d="M12 8 V14 M9 21 L12 14 L15 21 M8 11 H16"></path></svg>Street View</a>
        <a href="https://www.google.com/maps/@${x.lat},${x.lon},130m/data=!3m1!1e3" target="_blank" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3 L21 8 L12 13 L3 8 Z M3 12 L12 17 L21 12 M3 16 L12 21 L21 16"></path></svg>Vue aérienne</a>
      </div>
      <div class="sep"></div>
      <button class="bouton" data-rapport="${idx}">Rapport détaillé ${RadarUI.SVG.suite}</button>
    </div>`; };

    $("res").innerHTML =
      `<div class="info"><span>${dans.length} adresse${dans.length>1?"s":""} · ${rayon >= 100 ? "département" : rayon + " km"}${marge>0?" · élargi":""}</span></div>`
      + alertes()
      + dans.map((x,i) => fiche(x, i, cands.indexOf(x))).join("")
      + (hors.length ? `<details class="autres"><summary>${hors.length} au-delà du rayon</summary><div class="pile">${hors.map(x => fiche(x, -1, cands.indexOf(x))).join("")}</div></details>` : "");

    $("res").querySelectorAll("[data-rapport]").forEach(b => b.onclick = () => {
      const x = cands[parseInt(b.dataset.rapport, 10)];
      $("ecran1").style.display = "none";
      $("ecran2").style.display = "flex";
      const annonce = { prix: v.prix, surface: c.surface, dateDpe: c.dateDpe, texte: texteAnnonce() };
      RadarUI.ouvrirRapport($("ecran2"), { x, annonce, req, BAN, retour: () => { $("ecran2").style.display = "none"; $("ecran1").style.display = "flex"; } });
    });
    return dans.length;
  }

  /* ---------- démarrage ---------- */
  $("go").onclick   = () => chercher(0);
  $("plus").onclick = () => chercher(1.5);
  $("relire").onclick = () => {
    const n = lire();
    $("brut").textContent = texteAnnonce();
    ["surface","conso","ges","etiqDpe","etiqGes","dateDpe","annee","coutmin","coutmax","commune"].forEach(k => { if(n[k]!=null) $(k).value = n[k]; });
    if(n.prix!=null) v.prix = n.prix;
    $("statut").textContent = "Page relue.";
    chercher(0);
  };

  // Toute modification d'un critère relance la recherche : aucun bouton à aller chercher.
  let minuteur = null;
  ["surface","conso","ges","etiqDpe","etiqGes","dateDpe","annee","coutmin","coutmax","commune"].forEach(k => {
    $(k).oninput = () => {
      $("go").style.display = "flex";
      clearTimeout(minuteur);
      minuteur = setTimeout(() => chercher(0), 900);
    };
  });
  $("type").onchange = () => chercher(0);
  $("chips").querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => chercher(0)));

  if(manque.length){
    $("statut").textContent = "Non lu sur la page : " + manque.join(", ") + ".";
    ouvrirCrit(true);   // une lecture ratée ne doit pas rester cachée dans un menu replié
    $("go").style.display = "flex";
  }else{
    chercher(0);   // tout est là : on cherche sans rien demander
  }
  } /* fin demarrer */
  } /* fin ouvrirPanneau */

  /* ---------- pastille flottante ---------- */
  /* On ne s'affiche que si la page ressemble à une annonce. Le DPE n'est pas toujours du texte :
     sur les sites d'agences, l'étiquette est une image. L'URL prend alors le relais. */
  function ressembleAnnonce(){
    const t = (document.querySelector("main") || document.body).innerText.slice(0, 12000);
    const prix    = /\d[\d\s  ]{4,}\s*€/.test(t);
    const surface = /\d{2,4}\s*m(?:²|2|²)/.test(t);
    const mots    = /(maison|appartement|villa|demeure|propriété|ferme|longère|à vendre|pièces?)/i.test(t);
    const dpe     = /(dpe|diagnostic de performance|classe énergie|énergétique|kwh\/m|ges)/i.test(t);
    const urlImmo = /\/(vente|annonce|annonces|bien|biens|ad|achat|immobilier|maison|appartement|propriete|propriété)[\/\-_]/i.test(location.pathname);
    return prix && surface && mots && (dpe || urlImmo);
  }

  function pastille(){
    if(document.getElementById("radar-maison-pastille")) return;
    RadarUI.police();
    const b = document.createElement("div");
    b.id = "radar-maison-pastille";
    b.style.cssText = "position:fixed;bottom:22px;right:22px;z-index:2147483646";
    const s = b.attachShadow({ mode:"open" });
    s.innerHTML = `<style>
      button{all:initial;display:flex;align-items:center;gap:9px;cursor:pointer;
        font-family:"Radar Montserrat",Montserrat,"Segoe UI",system-ui,sans-serif;font-size:14px;font-weight:700;
        background:#1D63ED;color:#fff;padding:13px 18px;border-radius:999px;
        box-shadow:0 4px 18px rgba(29,99,237,.35)}
      button:hover{background:#0D2B4E}
      .pt{width:8px;height:8px;border-radius:50%;background:#3FD0DA;box-shadow:0 0 0 3px rgba(63,208,218,.35)}
    </style><button><span class="pt"></span>Trouver l'adresse</button>`;
    s.querySelector("button").onclick = ouvrirPanneau;
    document.documentElement.appendChild(b);
  }

  window.__radarMaison = { basculer: ouvrirPanneau };
  if(ressembleAnnonce()) pastille();
})();
