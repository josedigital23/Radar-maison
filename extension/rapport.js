/* Radar Maison — l'interface : le style commun et l'écran 2 (le rapport détaillé).

   Le rapport : 1. la note et 8 anneaux  ·  2. points d'attention, forces, faiblesses  ·  3. questions pour la visite.
   Un clic sur un anneau ouvre son détail, où chaque valeur se corrige ou se complète ; la note se recalcule aussitôt.
   Les corrections et les questions cochées sont gardées par bien (stockage local du navigateur).
   Tout texte venu d'une API passe par esc() : ce sont des données, pas du HTML. */

(function (g) {
  const UI = g.RadarUI = g.RadarUI || {};
  const M = g.RadarMoteur;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const eur = n => n == null ? '?' : Math.round(n).toLocaleString('fr-FR') + ' €';
  const nbf = n => n == null ? '?' : Math.round(n).toLocaleString('fr-FR');
  UI.esc = esc;

  /* ---------- la police : enregistrée au niveau du document (dans un shadow DOM, @font-face est ignoré) ---------- */
  UI.police = () => {
    if (g.__radarPolice) return; g.__radarPolice = true;
    try { const f = new FontFace('Radar Montserrat', `url(${browser.runtime.getURL('montserrat.woff2')}) format("woff2")`, { weight: '400 700', display: 'swap' });
      f.load().then(p => document.fonts.add(p)).catch(() => {}); } catch (e) {}
  };

  UI.css = `
  :host{all:initial}
  *{box-sizing:border-box;font-family:"Radar Montserrat",Montserrat,"Segoe UI",system-ui,sans-serif}
  .panneau{height:100vh;overflow-y:auto;background:#F2F6FA;color:#14263A;font-size:14px;line-height:1.4;border-left:1px solid #D5E0EB;box-shadow:-8px 0 30px rgba(13,43,78,.18);display:flex;flex-direction:column}
  .entete{background:#0D2B4E;color:#fff;padding:12px 12px 14px;flex:none}
  .entete .ligne{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .marque{display:flex;align-items:center;gap:9px;font-size:17px;font-weight:700;padding-left:6px}
  .ico{width:44px;height:44px;border:0;background:transparent;color:#B9CCE0;display:grid;place-items:center;cursor:pointer;border-radius:10px}
  .ico:hover{background:rgba(255,255,255,.08);color:#fff}
  .retour{all:unset;cursor:pointer;height:44px;padding:0 8px;display:flex;align-items:center;gap:6px;color:#B9CCE0;font-size:13px;font-weight:600;border-radius:10px}
  .retour:hover{color:#fff}
  .points{display:flex;gap:6px;padding-right:8px}.points i{width:6px;height:6px;border-radius:3px;background:#3D5878}.points i.on{width:22px;background:#3FD0DA}
  .titre-bien{padding:2px 8px 0;display:flex;flex-direction:column;gap:2px}
  .titre-bien b{font-size:17px}.titre-bien span{font-size:13px;color:#B9CCE0}
  .corps{flex:1;padding:16px;display:flex;flex-direction:column;gap:14px}
  .carte{background:#fff;border-radius:16px;padding:16px;box-shadow:0 1px 2px rgba(13,43,78,.06),0 4px 16px rgba(13,43,78,.06)}
  .pile{display:flex;flex-direction:column;gap:14px}
  .etiq{font-size:12px;font-weight:600;color:#5A6B7D;margin-bottom:6px;display:block}
  input,select{width:100%;height:44px;border:1.5px solid #D5E0EB;border-radius:12px;padding:0 14px;font-size:15px;font-weight:600;color:#14263A;background:#F8FBFD}
  input:focus{outline:2px solid #1D63ED;outline-offset:0;border-color:#1D63ED}
  .seg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;background:#EEF3F8;padding:4px;border-radius:12px}
  .seg button{height:40px;border:0;border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;background:transparent;color:#5A6B7D;padding:0 4px}
  .seg button.on{background:#fff;color:#0D2B4E;box-shadow:0 1px 3px rgba(13,43,78,.15)}
  .chips{display:flex;gap:6px;flex-wrap:wrap}
  .chip{height:36px;min-width:52px;padding:0 12px;border-radius:18px;font-size:13px;font-weight:600;cursor:pointer;border:1.5px solid #D5E0EB;background:#fff;color:#14263A}
  .chip.on,.chip.actif{border-color:#0D2B4E;background:#0D2B4E;color:#fff}
  .chips.petites .chip{height:30px;min-width:0;font-size:12px}
  .rayons{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}.rayons .chip{min-width:0;padding:0 4px;font-size:12.5px}
  .bouton{width:100%;height:48px;border-radius:12px;border:0;background:#1D63ED;color:#fff;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none}
  .bouton:hover{background:#174FC0}
  .bouton.contour{background:#fff;color:#1D63ED;border:1.5px solid #1D63ED}
  .bouton.contour:hover{background:#E8F0FE}
  .bouton.doux{background:#EEF3F8;color:#0D2B4E}
  .bouton.doux:hover{background:#E1E9F2}
  .bouton.grand{height:52px;font-size:15px;border-radius:14px}
  .replier{width:100%;height:44px;border:0;background:transparent;display:flex;align-items:center;justify-content:space-between;padding:0;cursor:pointer;color:#5A6B7D;font-size:13px;font-weight:600}
  .replier svg{transition:transform .15s}.replier.ouvert svg{transform:rotate(90deg)}
  .sep{border-top:1px solid #E3EBF2}
  .grille2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
  .grille2 input{height:40px;font-size:14px;padding:0 10px}
  .statut{font-size:12.5px;color:#5A6B7D;min-height:16px}
  .info{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 4px;font-size:13px;font-weight:600;color:#5A6B7D}
  .alertes{display:flex;gap:6px;flex-wrap:wrap}
  .alerte{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;color:#8A5A00;background:#FFF4E0;padding:4px 9px;border-radius:8px;cursor:help}
  .fiche{display:flex;flex-direction:column;gap:12px}
  .fiche.top{box-shadow:0 0 0 2px #1D63ED,0 6px 20px rgba(29,99,237,.16)}
  .fiche.loin{opacity:.7}
  .fiche .haut{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
  .adr{font-size:16px;font-weight:700;line-height:1.3;margin:0}
  .com{font-size:13px;color:#5A6B7D}
  .proba{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none}
  .pill{font-size:12px;font-weight:700;padding:5px 10px;border-radius:999px;white-space:nowrap}
  .p-tres{background:#D5F2F4;color:#0B6E77}.p-prob{background:#E3ECFD;color:#1A4FB8}.p-poss{background:#FDF1DA;color:#8A5A00}.p-peu{background:#E9EDF1;color:#4E5D6C}
  .petit{font-size:11px;color:#5A6B7D}
  .duo{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .duo a{height:44px;border-radius:12px;background:#EEF3F8;color:#0D2B4E;text-decoration:none;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px}
  .duo a:hover{background:#E1E9F2}
  .vide{background:#fff;border:1.5px dashed #D5E0EB;border-radius:16px;padding:16px;font-size:13.5px}
  details.autres summary{cursor:pointer;font-size:13px;font-weight:600;color:#5A6B7D;padding:6px 4px}
  /* rapport */
  .note{display:flex;align-items:center;gap:18px;padding:20px 18px}
  .note .cote{display:flex;flex-direction:column;gap:10px;min-width:0}
  .lien-att{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;background:#FFF4E0;color:#8A5A00;font-size:13px;font-weight:700;padding:8px 12px;border-radius:10px;border:0;cursor:pointer}
  .anneaux{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
  .anneau{background:#fff;border-radius:14px;padding:12px 4px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;border:0;cursor:pointer;color:#14263A;box-shadow:0 1px 2px rgba(13,43,78,.06),0 3px 10px rgba(13,43,78,.05)}
  .anneau:hover{box-shadow:0 0 0 2px #1D63ED}
  .anneau b{font-size:11.5px;text-align:center;line-height:1.2}
  .anneau span{font-size:10.5px;text-align:center;line-height:1.2;color:#5A6B7D}
  .anneau span.a-faire{color:#1D63ED;font-weight:600}
  .legende{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;font-size:11px;color:#5A6B7D}
  .legende i{display:inline-block;width:10px;height:10px;border-radius:5px;margin-right:5px;vertical-align:-1px}
  .barre{height:4px;border-radius:2px;background:#E3EBF2;overflow:hidden}.barre i{display:block;height:100%;background:#1D63ED;transition:width .3s}
  .sous{font-size:13px;font-weight:700;padding:4px 2px 0;display:flex;align-items:center;gap:6px}
  .att{display:flex;align-items:center;gap:12px;padding:12px 14px;box-shadow:inset 0 0 0 1.5px #F5D9A3}
  .att.g3{box-shadow:inset 0 0 0 2px #E09A12;background:#FFFBF2}
  .att .pastille{flex:none;width:36px;height:36px;border-radius:10px;background:#FFF4E0;display:grid;place-items:center;color:#B37A00}
  .att .txt{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
  .att .txt b{font-size:14px}.att .txt span{font-size:12.5px;color:#5A6B7D}
  .src{flex:none;font-size:10.5px;font-weight:600;color:#5A6B7D;background:#EEF3F8;padding:3px 7px;border-radius:6px;display:flex;flex-direction:column;align-items:center;gap:2px}
  .src em{font-style:normal;color:#8A5A00}
  .liste{background:#fff;border-radius:14px;padding:4px 14px}
  .liste div{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #EEF3F8;font-size:13.5px;font-weight:600}
  .liste div:last-child{border-bottom:0}
  .rond{flex:none;width:22px;height:22px;border-radius:11px;display:grid;place-items:center;color:#fff}
  .groupe-q{display:flex;flex-direction:column;gap:8px}
  .groupe-q>span{font-size:12px;font-weight:700;color:#5A6B7D;text-transform:uppercase;letter-spacing:.06em;padding:0 2px}
  .q{display:flex;align-items:flex-start;gap:12px;padding:12px 8px;cursor:pointer;min-height:44px;border-bottom:1px solid #EEF3F8}
  .q:last-child{border-bottom:0}
  .q input{flex:none;width:22px;height:22px;margin:1px 0 0;accent-color:#1D63ED}
  .q span{display:flex;flex-direction:column;gap:3px}.q b{font-size:14px;font-weight:600;line-height:1.35}.q small{font-size:11.5px;color:#8A5A00;font-weight:600}
  .q.fait{opacity:.5}
  .champ{display:flex;flex-direction:column;gap:8px}
  .champ .tete{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:14px;font-weight:700}
  .tag{font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;background:#D5F2F4;color:#0B6E77;white-space:nowrap}
  .tag.manque{background:#E8F0FE;color:#1D63ED}.tag.saisi{background:#E9EDF1;color:#4E5D6C}
  .champ .val{display:flex;align-items:center;gap:10px}
  .champ .val input{width:120px;height:44px}
  .ecart{margin-left:auto;font-size:12px;font-weight:700;color:#8A5A00;background:#FFF4E0;padding:5px 9px;border-radius:8px}
  .opts{display:flex;gap:6px;flex-wrap:wrap}
  .opts button{flex:1;min-width:56px;height:44px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:1.5px solid #D5E0EB;background:#fff;color:#14263A}
  .opts button.on{border-color:#0D2B4E;background:#0D2B4E;color:#fff}
  .ligne-d{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:8px 0;border-bottom:1px solid #EEF3F8}
  .ligne-d:last-child{border-bottom:0}.ligne-d span:first-child{color:#5A6B7D}.ligne-d b{text-align:right}
  `;

  /* ---------- l'anneau ---------- */
  const COUL = { bien: '#0E9AA7', moyen: '#E09A12', faible: '#4E5D6C' };
  UI.anneau = (v, taille, opts) => {
    const o = opts || {}, r = 25, C = 2 * Math.PI * r, inconnu = v == null, niv = M.niveau(v);
    const fond = o.sombre ? (inconnu ? '#5F7896' : '#2A4568') : (inconnu ? '#B8C5D2' : '#E6EDF4');
    const texte = o.sombre ? '#FFFFFF' : inconnu ? '#5A6B7D' : '#14263A';
    const col = o.attente ? '#C9D5E1' : inconnu ? 'transparent' : COUL[niv];
    return `<svg width="${taille}" height="${taille}" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="${r}" fill="none" stroke="${fond}" stroke-width="8" ${inconnu && !o.attente ? 'stroke-dasharray="4 4"' : ''}></circle>
      ${inconnu || o.attente || v <= 0 ? '' : `<circle cx="32" cy="32" r="${r}" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(C * v / 10).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 32 32)"></circle>`}
      <text x="32" y="37" text-anchor="middle" style="font:700 15px 'Radar Montserrat',Montserrat,'Segoe UI',sans-serif;fill:${texte}">${o.attente ? '…' : inconnu ? '?' : String(v.toFixed(1)).replace('.', ',')}</text></svg>`;
  };
  const SVG = {
    retour: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M15 6 L9 12 L15 18"></path></svg>',
    suite: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12 H19 M13 6 L19 12 L13 18"></path></svg>',
    alerte: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 L22 20 H2 Z M12 10 V14 M12 17 V17.5"></path></svg>',
    ok: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12 L10 17 L19 7"></path></svg>',
    moins: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 12 H18"></path></svg>',
    fermer: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18"></path></svg>'
  };
  UI.SVG = SVG;

  const stock = {
    lire: async k => { try { const r = await browser.storage.local.get(k); return r ? r[k] : undefined; } catch (e) { return undefined; } },
    ecrire: async (k, v) => { try { await browser.storage.local.set({ [k]: v }); } catch (e) {} }
  };

  /* ---------- le rapport ---------- */
  UI.ouvrirRapport = async function (zone, ctx) {
    const { x, annonce, req, BAN, retour } = ctx;
    const io = {
      json: async u => { const r = await req(u); return r && r.data !== undefined ? r.data : { err: (r && r.erreur) || 'pas de réponse' }; },
      texte: async u => { const r = await req(u, 'texte'); return r && r.texte != null ? r.texte : null; }
    };
    const cle = 'radar.bien.' + (x.id || x.adresse);
    const garde = (await stock.lire(cle)) || {};
    const st = { page: 'note', groupe: null, c: {}, fini: false, parts: 0, corr: garde.corr || {}, coches: garde.coches || {}, tous: false };
    const sauver = () => stock.ecrire(cle, { corr: st.corr, coches: st.coches, adresse: x.adresse, vu: new Date().toISOString().slice(0, 10) });
    const titreBien = () => `<div class="titre-bien"><b>${esc(x.adresse || 'Adresse non géocodée')}</b><span>${esc([x.commune, x.surface ? Math.round(x.surface) + ' m²' : null, annonce.prix ? eur(annonce.prix) : null].filter(Boolean).join(' · '))}</span></div>`;

    let calc = null;
    const calculer = () => {
      const D = M.construireDossier(st.c, annonce, M.PROFIL, st.corr);
      const R = M.noter(D, M.PROFIL);
      const X = st.fini ? M.regles(st.c, D, R, annonce) : null;
      calc = { D, R, X };
    };

    const rendre = () => {
      calculer();
      const p = st.page;
      zone.innerHTML = p === 'note' ? pageNote() : p === 'attention' ? pageAttention() : p === 'questions' ? pageQuestions() : pageDetail();
      zone.scrollTop = 0;
    };
    let attente = null;
    const rendreBientot = () => { clearTimeout(attente); attente = setTimeout(rendre, 250); };

    const entete = (etape, retourTxt, retourAct) => `<div class="entete"><div class="ligne">
        <button class="retour" data-act="${retourAct}">${SVG.retour}${retourTxt}</button>
        ${etape ? `<div class="points" aria-label="Étape ${etape} sur 3">${[1, 2, 3].map(i => `<i class="${i === etape ? 'on' : ''}"></i>`).join('')}</div>` : ''}
      </div>${titreBien()}</div>`;

    /* ----- page 1 : la note ----- */
    const pageNote = () => {
      const { R, X } = calc;
      const nAtt = X ? X.cartes.length : null;
      const v = R.note, prov = R.provisoire || v == null;
      const C = 2 * Math.PI * 50;
      const coul = prov ? '#B8C5D2' : v >= 75 ? '#0E9AA7' : v >= 60 ? '#E09A12' : '#4E5D6C';
      const pillCls = prov ? 'p-peu' : v >= 75 ? 'p-tres' : v >= 60 ? 'p-poss' : 'p-peu';
      const grand = `<svg width="116" height="116" viewBox="0 0 120 120" aria-hidden="true" style="flex:none">
        <circle cx="60" cy="60" r="50" fill="none" stroke="#E6EDF4" stroke-width="12" ${prov ? 'stroke-dasharray="6 6"' : ''}></circle>
        ${prov ? '' : `<circle cx="60" cy="60" r="50" fill="none" stroke="${coul}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(C * v / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)"></circle>`}
        <text x="60" y="${prov ? 70 : 66}" text-anchor="middle" style="font:700 34px 'Radar Montserrat',Montserrat,sans-serif;fill:#14263A">${prov ? '?' : v}</text>
        <text x="60" y="${prov ? 92 : 86}" text-anchor="middle" style="font:500 12px 'Radar Montserrat',Montserrat,sans-serif;fill:#5A6B7D">${prov ? 'provisoire' : '/ 100'}</text></svg>`;
      const anneaux = R.groupes.map(gp => {
        const sub = sousTitre(gp.id);
        const att = !st.fini && gp.v == null;
        return `<button class="anneau" data-act="detail" data-g="${gp.id}" aria-label="${esc(gp.nom)} : ${gp.v == null ? 'à compléter' : gp.v + ' sur 10'}">
          ${UI.anneau(gp.v, 58, { attente: att })}<b>${esc(gp.nom)}</b><span class="${gp.v == null || !gp.complet ? 'a-faire' : ''}">${esc(att ? '…' : gp.v == null ? 'à compléter' : !gp.complet ? sub + ' · à compléter' : sub)}</span></button>`;
      }).join('');
      return entete(1, 'Adresses', 'retour') + `<div class="corps">
        <div class="carte note">${grand}<div class="cote">
          <span class="pill ${pillCls}" style="align-self:flex-start;font-size:14px">${prov ? 'Note provisoire' : esc(R.verdict)}</span>
          <span class="petit">${prov && v != null ? `${v}/100 sur ${R.couverture} % des critères` : `Notée sur ${R.couverture} % des critères`}${R.groupes.some(x => !x.complet) ? ' · à compléter' : ''}</span>
          ${nAtt == null ? '<span class="petit">Analyse en cours…</span>' : nAtt ? `<button class="lien-att" data-act="page" data-p="attention">${SVG.alerte}${nAtt} point${nAtt > 1 ? 's' : ''} d’attention</button>` : '<span class="petit">Aucun point d’attention</span>'}
        </div></div>
        ${st.fini ? '' : `<div class="barre" aria-label="Collecte en cours"><i style="width:${Math.min(100, Math.round(st.parts / 12 * 100))}%"></i></div>`}
        <div class="anneaux">${anneaux}</div>
        <div class="legende"><span><i style="background:#0E9AA7"></i>Bien</span><span><i style="background:#E09A12"></i>Moyen</span><span><i style="background:#4E5D6C"></i>Faible</span><span><i style="border:1.5px dashed #8FA0B2;width:10px;height:10px;box-sizing:border-box"></i>À compléter</span></div>
        <div style="flex:1"></div>
        <button class="bouton grand" data-act="page" data-p="attention" ${st.fini ? '' : 'disabled style="opacity:.5"'}>Points d’attention ${SVG.suite}</button>
      </div>`;
    };

    const sousTitre = id => {
      const { D, R } = calc, t = D.trajets;
      switch (id) {
        case 'trajets': return t.travail != null ? `${t.travail} min` : t.ecole != null ? `école ${t.ecole} min` : '';
        case 'courses': return t.supermarche != null ? `${t.supermarche} min` : '';
        case 'budget': return R.budget != null ? `${Math.round(R.budget / 1000)} k€` : '';
        case 'prix': return R.ratio != null ? `${R.ratio >= 1 ? '+' : ''}${Math.round((R.ratio - 1) * 100)} %` : R.nbComparables < 3 ? 'peu de ventes' : '';
        case 'maison': return D.surface ? `${Math.round(D.surface)} m²` : '';
        case 'isolement': return D.voisin_m != null ? `voisin ${Math.round(D.voisin_m)} m` : '';
        case 'couts': return R.mois != null ? `${Math.round(R.mois)} €/mois` : '';
        case 'connexion': return ({ fibre: 'fibre', fibre_prevue: 'fibre prévue', '4g_bonne': '4G', rien: 'aucune' })[D.connexion] || '';
      }
      return '';
    };

    /* ----- page 2 : attention, forces, faiblesses ----- */
    const pageAttention = () => {
      const { X, R } = calc;
      const visibles = st.tous ? X.cartes : X.cartes.slice(0, 5), reste = X.cartes.length - visibles.length;
      const carteHtml = k => `<div class="carte att ${k.gravite >= 3 ? 'g3' : ''}"><span class="pastille">${SVG.alerte}</span>
        <span class="txt"><b>${esc(k.titre)}</b><span>${esc(k.detail)}</span></span>
        <span class="src">${esc(k.source)}${k.deduction ? '<em>déduction</em>' : ''}</span></div>`;
      const liste = (xs, rond, couleur) => xs.length ? `<div class="liste">${xs.map(f => `<div><span class="rond" style="background:${couleur}">${rond}</span>${esc(f)}</div>`).join('')}</div>` : '<div class="petit" style="padding:0 4px">—</div>';
      return entete(2, 'La note', 'page" data-p="note') + `<div class="corps" style="gap:10px">
        <span class="sous" style="color:#8A5A00">${SVG.alerte}Points d’attention</span>
        ${X.cartes.length ? visibles.map(carteHtml).join('') : '<div class="vide">Rien de notable dans les données publiques.</div>'}
        ${reste > 0 ? `<button class="bouton doux" data-act="tous">+ ${reste} autre${reste > 1 ? 's' : ''}</button>` : ''}
        <span class="sous" style="color:#0B6E77;padding-top:8px">Forces</span>${liste(X.forces, SVG.ok, '#0E9AA7')}
        <span class="sous" style="color:#4E5D6C;padding-top:8px">Faiblesses</span>${liste(X.faiblesses, SVG.moins, '#4E5D6C')}
        <div style="flex:1;min-height:12px"></div>
        <button class="bouton grand" data-act="page" data-p="questions">Questions pour la visite ${SVG.suite}</button>
      </div>`;
    };

    /* ----- page 3 : les questions ----- */
    const OU = [['vendeur', 'Au vendeur'], ['sur place', 'Sur place'], ['mairie', 'À la mairie'], ['notaire', 'Au notaire'], ['documents', 'Documents à demander']];
    const pageQuestions = () => {
      const qs = calc.X.questions, faites = qs.filter(q => st.coches[q.texte]).length;
      const groupes = OU.map(([ou, titre]) => {
        const xs = qs.filter(q => q.ou === ou);
        return xs.length ? `<div class="groupe-q"><span>${titre}</span><div class="liste" style="padding:2px 6px">${xs.map(q => `<label class="q ${st.coches[q.texte] ? 'fait' : ''}">
          <input type="checkbox" data-act="cocher" data-q="${esc(q.texte)}" ${st.coches[q.texte] ? 'checked' : ''}>
          <span><b>${esc(q.texte)}</b>${q.lien ? `<small>${esc(q.lien)}</small>` : ''}</span></label>`).join('')}</div></div>` : '';
      }).join('');
      return entete(3, 'Points d’attention', 'page" data-p="attention') + `<div class="corps">
        <div class="info"><span>Pour la visite</span><span style="color:#1D63ED">${faites} / ${qs.length}</span></div>
        ${groupes}
        <div style="flex:1;min-height:12px"></div>
        <button class="bouton grand doux" data-act="retour">Retour aux adresses</button>
      </div>`;
    };

    /* ----- le détail d'un anneau ----- */
    const tag = (k, source) => st.corr[k] !== undefined ? '<span class="tag saisi">saisi</span>' : source ? `<span class="tag">${esc(source)}</span>` : '<span class="tag manque">à compléter</span>';
    const nombre = (k, nom, val, unite, source, extra) => `<div class="carte champ"><div class="tete"><label for="f-${k}">${nom}</label>${tag(k, val != null ? source : null)}</div>
      <div class="val"><input id="f-${k}" inputmode="numeric" data-k="${k}" value="${val == null ? '' : Math.round(val)}" placeholder="?"><span class="petit">${unite}</span>${extra || ''}</div></div>`;
    const choix = (k, nom, val, opts, source) => `<div class="carte champ"><div class="tete"><span>${nom}</span>${tag(k, val != null ? source : null)}</div>
      <div class="opts">${opts.map(([v, l]) => `<button data-act="choix" data-k="${k}" data-v="${esc(JSON.stringify(v))}" class="${val === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
    const lignes = xs => `<div class="carte" style="padding:6px 16px">${xs.filter(Boolean).map(([a, b]) => `<div class="ligne-d"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div>`;
    const OUI = [[true, 'Oui'], [false, 'Non']];

    const pageDetail = () => {
      const { D, R } = calc, c = st.c, t = D.trajets, tr = c.trajets || {}, gp = R.groupes.find(x => x.id === st.groupe);
      const dest = k => tr[k] ? `${tr[k].dest} · ${tr[k].km} km` : null;
      let corps = '';
      switch (st.groupe) {
        case 'trajets':
          corps = nombre('min_travail', 'Travail', t.travail, 'min', 'IGN', '') + (dest('travail') ? lignes([['Destination', dest('travail')]]) : '')
            + nombre('min_ecole', 'École publique', t.ecole, 'min', 'IGN') + (dest('ecole') ? lignes([['La plus rapide', dest('ecole')]]) : ''); break;
        case 'courses':
          corps = nombre('min_supermarche', 'Supermarché', t.supermarche, 'min', 'IGN') + nombre('min_depannage', 'Boulangerie, supérette', t.depannage, 'min', 'IGN')
            + nombre('min_sport', 'Salle de sport', t.sport, 'min', 'IGN')
            + lignes([dest('supermarche') && ['Supermarché', dest('supermarche')], dest('depannage') && ['Dépannage', dest('depannage')], dest('autre_salle') && ['Salle', dest('autre_salle')]]); break;
        case 'budget':
          corps = nombre('prix', 'Prix demandé', D.prix, '€', 'annonce') + nombre('travaux', 'Travaux à prévoir', D.travaux || null, '€', null)
            + lignes([['Budget total', eur(R.budget)], ['Plafond', eur(M.PROFIL.budget.plafond)]]); break;
        case 'prix': {
          const comps = D.comparables.slice(0, 6);
          corps = nombre('prix', 'Prix demandé', D.prix, '€', 'annonce')
            + lignes([['Prix au m²', R.pm2 ? eur(R.pm2) : '?'], ['Médiane des ventes', R.med ? eur(R.med) + ' /m²' : 'moins de 3 ventes'], ['Ventes comparables', String(R.nbComparables)]])
            + (comps.length ? lignes(comps.map(v => [`${String(v.date).slice(0, 7)} · ${Math.round(v.surface)} m² · ${v.d >= 1000 ? (v.d / 1000).toFixed(1) + ' km' : v.d + ' m'}`, `${eur(v.valeur)} · ${nbf(v.eur_m2)} €/m²`])) : '')
            + (c.dvf === null ? '<div class="vide">Les ventes DVF n’ont pas pu être lues.</div>' : ''); break;
        }
        case 'maison': {
          const ecart = D.surface_annonce && c.dpe && c.dpe.surface_habitable_logement && Math.abs(D.surface_annonce - c.dpe.surface_habitable_logement) >= 5 ? `<span class="ecart">annonce : ${Math.round(D.surface_annonce)} m²</span>` : '';
          corps = nombre('surface', 'Surface habitable', D.surface, 'm²', c.dpe ? 'DPE' : 'annonce', ecart)
            + choix('chambres', 'Chambres', D.chambres, [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5+']], 'annonce')
            + choix('style', 'Style', D.style, [['pierre_charme', 'Pierre, charme'], ['neuf_recent', 'Récent'], ['sous_sol_70_80', 'Sous-sol 70-80'], ['autre', 'Autre']], null)
            + choix('garage', 'Garage, abri', D.garage, OUI, 'annonce') + choix('atelier', 'Atelier', D.atelier, OUI, 'annonce')
            + nombre('terrain', 'Terrain', D.terrain, 'm²', (annonce.terrain || (D.texte && D.texte.terrain)) ? 'annonce' : 'cadastre'); break;
        }
        case 'isolement': {
          const iso = c.isolement || {};
          corps = nombre('voisin_m', 'Premier voisin', D.voisin_m, 'm', 'IGN')
            + lignes([D.voisin_dependance != null && ['Bâtiment plus proche', `${Math.round(D.voisin_dependance)} m · compté comme dépendance`], ['Maisons à moins de 100 m', String(iso.maisons_100m ?? '?')], ['à moins de 250 m', String(iso.maisons_250m ?? '?')]])
            + choix('vis_a_vis', 'Vis-à-vis sur le jardin', D.vis_a_vis, OUI, 'annonce') + choix('bourg', 'Dans le bourg', D.bourg, OUI, 'IGN'); break;
        }
        case 'couts': {
          const tf = c.taxe_fonciere;
          corps = nombre('energie_an', 'Énergie', D.energie_an, '€/an', 'DPE')
            + nombre('taxe_fonciere_an', 'Taxe foncière', D.taxe_fonciere_an, '€/an', null)
            + lignes([tf && ['Taux de la commune', `${String(tf.taux_tfb).replace('.', ',')} % (${tf.exercice})`], ['Par mois', R.mois != null ? eur(R.mois) : '?']]); break;
        }
        case 'connexion':
          corps = choix('connexion', 'Connexion', D.connexion, [['fibre', 'Fibre'], ['fibre_prevue', 'Prévue'], ['4g_bonne', '4G'], ['rien', 'Rien']], null); break;
      }
      return `<div class="entete"><div class="ligne"><button class="retour" data-act="page" data-p="note">${SVG.retour}La note</button></div>
        <div style="padding:2px 8px 0;display:flex;align-items:center;gap:14px">${UI.anneau(gp.v, 64, { sombre: true })}
        <div class="titre-bien" style="padding:0"><b style="font-size:20px">${esc(gp.nom)}</b><span>${gp.v == null ? 'à compléter' : gp.complet ? 'complet' : gp.manque + ' élément' + (gp.manque > 1 ? 's' : '') + ' à compléter'}</span></div></div></div>
        <div class="corps" style="gap:10px">${corps}<div style="flex:1"></div>
        <button class="bouton grand" data-act="page" data-p="note">${SVG.ok} Valider</button></div>`;
    };

    /* ----- les gestes ----- */
    zone.onclick = e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'retour') { retour(); return; }
      if (a === 'page') { st.page = b.dataset.p; rendre(); return; }
      if (a === 'detail') { st.page = 'detail'; st.groupe = b.dataset.g; rendre(); return; }
      if (a === 'tous') { st.tous = true; rendre(); return; }
      if (a === 'choix') { const v = JSON.parse(b.dataset.v); if (st.corr[b.dataset.k] === v) delete st.corr[b.dataset.k]; else st.corr[b.dataset.k] = v; sauver(); rendre(); return; }
    };
    zone.onchange = e => {
      const el = e.target;
      if (el.dataset.act === 'cocher') { st.coches[el.dataset.q] = el.checked; if (!el.checked) delete st.coches[el.dataset.q]; sauver(); rendre(); return; }
      if (el.dataset.k) {
        const v = parseFloat(String(el.value).replace(/[\s  €]/g, '').replace(',', '.'));
        if (el.value.trim() === '' || isNaN(v)) delete st.corr[el.dataset.k]; else st.corr[el.dataset.k] = v;
        sauver(); rendre();
      }
    };

    rendre();

    /* ----- la collecte : le rapport se remplit au fil de l'eau ----- */
    let insee = /^\d{5}$/.test(x.insee || '') ? x.insee : null;
    if (x.adresse) {
      const r = await io.json(`${BAN}?q=${encodeURIComponent(x.adresse)}&limit=1`);
      const f = r && r.features && r.features[0];
      if (f && f.properties.citycode) insee = f.properties.citycode;
    }
    let travail = await stock.lire('radar.travail');
    if (!travail || travail.adresse !== M.PROFIL.travail.adresse) {
      const r = await io.json(`${BAN}?q=${encodeURIComponent(M.PROFIL.travail.adresse)}&limit=1`);
      const f = r && r.features && r.features[0];
      travail = f ? { adresse: M.PROFIL.travail.adresse, c: f.geometry.coordinates } : null;
      if (travail) stock.ecrire('radar.travail', travail);
    }
    if (!insee) { st.fini = true; st.c = { erreurs: ['commune introuvable'] }; rendre(); return; }
    const P = { lon: x.lon, lat: x.lat, insee, dpe: x.source === 'récent' ? x.id : null, surf: x.surface || annonce.surface,
      dest: travail ? { travail: { nom: M.PROFIL.travail.nom, c: travail.c } } : {} };
    st.c = await M.collecter(P, io, (nom, O) => { st.parts++; st.c = O; if (st.page === 'note') rendreBientot(); });
    st.fini = true;
    rendre();
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = UI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
