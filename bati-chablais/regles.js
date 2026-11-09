/* Moteur de regles : lit un plan PDF vectoriel autour d'un surlignage, sans IA (Kevin 09/11/2026 : « 100 % gratuit »).
 * Entrees en points PDF, origine en HAUT a gauche (y vers le bas) :
 *   page = {largeur, hauteur, mots:[{t,x0,y0,x1,y1}], segments:[[x0,y0,x1,y1]]}
 *   boite = [x0,y0,x1,y1] du surlignage
 * Sortie : liste d'ouvertures {repere,type,forme,contour,largeur,hauteur,allege,epaisseur,faces,verif:[],remarque}
 * en cm (nombres tels qu'ecrits sur le plan). Regle d'or : ce qui n'est pas ecrit reste vide (rien n'est invente).
 * Faces coffrantes (Kevin) : fenetre 4 (linteau, appui, 2 montants), porte 3. */
(function (racine) {
  'use strict';
  const NOMBRE = /^\d{2,4}(?:[.,]\d{1,2})?$/;
  const num = t => parseFloat(String(t).replace(',', '.'));
  const cx = m => (m.x0 + m.x1) / 2, cy = m => (m.y0 + m.y1) / 2;
  const mediane = a => { const s = [...a].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : null; };

  // --- echelle locale : cote numerique posee au milieu d'un trait de cote de meme direction (points par cm)
  function echelleLocale(page, centre, rayon = 700) {
    const hor = [], ver = [];
    for (const s of page.segments) {
      if (Math.abs(s[1] - s[3]) < 0.3 && Math.abs(s[2] - s[0]) > 8) hor.push(s);
      else if (Math.abs(s[0] - s[2]) < 0.3 && Math.abs(s[3] - s[1]) > 8) ver.push(s);
    }
    const ratios = [];
    for (const m of page.mots) {
      if (!NOMBRE.test(m.t)) continue;
      const x = cx(m), y = cy(m);
      if (centre && Math.hypot(x - centre[0], y - centre[1]) > rayon) continue;
      const v = num(m.t), horiz = (m.x1 - m.x0) >= (m.y1 - m.y0);
      let best = null;
      for (const s of horiz ? hor : ver) {
        const a = horiz ? Math.min(s[0], s[2]) : Math.min(s[1], s[3]), b = horiz ? Math.max(s[0], s[2]) : Math.max(s[1], s[3]);
        const pos = horiz ? x : y, ecart = horiz ? s[1] - y : Math.abs(s[0] - x);
        if (a < pos && pos < b && ecart > 0 && ecart < 12 && Math.abs((a + b) / 2 - pos) < 0.15 * (b - a) + 3) {
          const L = b - a; if (best === null || Math.abs(L / v - 0.6) < Math.abs(best / v - 0.6)) best = L;
        }
      }
      if (best) ratios.push(best / v);
    }
    if (ratios.length < 3) return centre ? echelleLocale(page, null) : null;
    ratios.sort((p, q) => p - q);
    return mediane(ratios.slice(Math.floor(ratios.length / 4), Math.ceil(3 * ratios.length / 4)) || ratios);
  }

  // --- epaisseur mesuree : ecart entre traits paralleles au mur, juste de part et d'autre de l'ouverture
  function epaisseurMesuree(page, boite, k) {
    if (!k) return null;
    const [x0, y0, x1, y1] = boite, horiz = (x1 - x0) >= (y1 - y0), mesures = [];
    const centre = horiz ? (y0 + y1) / 2 : (x0 + x1) / 2;
    for (const p of horiz ? [x0 - 18, x1 + 18] : [y0 - 18, y1 + 18]) {
      const pos = new Set();
      for (const s of page.segments) {
        if (horiz && Math.abs(s[1] - s[3]) < 0.3 && Math.min(s[0], s[2]) - 1 <= p && p <= Math.max(s[0], s[2]) + 1 && Math.abs(s[1] - centre) < 60 * k) pos.add(Math.round(s[1] * 10) / 10);
        if (!horiz && Math.abs(s[0] - s[2]) < 0.3 && Math.min(s[1], s[3]) - 1 <= p && p <= Math.max(s[1], s[3]) + 1 && Math.abs(s[0] - centre) < 60 * k) pos.add(Math.round(s[0] * 10) / 10);
      }
      const l = [...pos].sort((a, b) => a - b), ecarts = [];
      for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
        const e = (l[j] - l[i]) / k; if (e >= 8 && e <= 60 && l[i] - 3 <= centre && centre <= l[j] + 3) ecarts.push(e);
      }
      if (ecarts.length) mesures.push(Math.min(...ecarts));
    }
    return mesures.length ? Math.round(mediane(mesures)) : null;
  }

  // --- aides de lecture du texte
  function lignesDe(mots) {   // regroupe les mots en lignes (meme hauteur), dans l'ordre de lecture
    const tri = [...mots].sort((a, b) => cy(a) - cy(b) || a.x0 - b.x0), lignes = [];
    for (const m of tri) {
      const l = lignes.find(l => Math.abs(cy(l[0]) - cy(m)) < 3);
      l ? l.push(m) : lignes.push([m]);
    }
    lignes.forEach(l => l.sort((a, b) => a.x0 - b.x0));
    return lignes;
  }
  // « All : 113.5 », « All=113.5 », « Ail : 113.5 » (allege) ; renvoie {valeur, x, y}
  function alleges(mots) {
    const res = [];
    for (const l of lignesDe(mots)) for (let i = 0; i < l.length; i++) {
      const t = l[i].t, m = t.match(/^a[il]l(?:[eè]ge|\.)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)$/i);
      if (m) { res.push({ valeur: num(m[1]), x: cx(l[i]), y: cy(l[i]) }); continue; }
      if (/^a[il]l(?:[eè]ge|\.)?$/i.test(t)) for (let j = i + 1; j <= i + 3 && j < l.length; j++) {
        if (/^\d+(?:[.,]\d+)?$/.test(l[j].t)) { res.push({ valeur: num(l[j].t), x: (l[i].x0 + l[j].x1) / 2, y: cy(l[i]) }); break; }
      }
    }
    return res;
  }
  // « 177.1 à 229.8 » (hauteur variable : trapeze) ; renvoie {a, b, x, y}
  function hauteursVariables(mots) {
    const res = [];
    for (const l of lignesDe(mots)) for (let i = 0; i + 2 < l.length; i++) {
      if (NOMBRE.test(l[i].t) && /^(à|a|\?|-|→)$/i.test(l[i + 1].t) && NOMBRE.test(l[i + 2].t))
        res.push({ a: num(l[i].t), b: num(l[i + 2].t), x: (l[i].x0 + l[i + 2].x1) / 2, y: cy(l[i]) });
    }
    return res;
  }

  const REPERE = /^(?:L|F|PF|PE|FE|Men|LT)\d{1,3}[a-z]?$|^0\d$|^\d{2}$/i;

  // --- analyse d'un surlignage
  function analyser(page, boite) {
    const [x0, y0, x1, y1] = boite, horiz = (x1 - x0) >= (y1 - y0);
    const centre = [(x0 + x1) / 2, (y0 + y1) / 2], BANDE = 380;
    const k = echelleLocale(page, centre);
    const dansBande = m => horiz
      ? cx(m) > x0 - 30 && cx(m) < x1 + 30 && Math.abs(cy(m) - centre[1]) < BANDE
      : cy(m) > y0 - 30 && cy(m) < y1 + 30 && Math.abs(cx(m) - centre[0]) < BANDE;
    const bande = page.mots.filter(dansBande);
    const proches = page.mots.filter(m => Math.hypot(cx(m) - centre[0], cy(m) - centre[1]) < 160 + (horiz ? (x1 - x0) : (y1 - y0)) / 2);
    const alls = alleges(bande), vars = hauteursVariables(bande);
    const pos = m => horiz ? cx(m) : cy(m);

    // 1) cotes candidates (largeurs d'ouverture) : nombres de la bande, sur des lignes de cotes
    const cotes = bande.filter(m => NOMBRE.test(m.t) && num(m.t) >= 30 && num(m.t) <= 900
      && !alls.some(a => Math.abs(a.y - cy(m)) < 3) && !vars.some(v => Math.abs(v.y - cy(m)) < 3));
    // 1a) ouvertures « annoncees » : une cote avec son allege ou sa hauteur variable juste a cote (meme axe)
    const annonce = cotes.filter(c => alls.some(a => Math.abs((horiz ? a.x : a.y) - pos(c)) < 40) || vars.some(v => Math.abs((horiz ? v.x : v.y) - pos(c)) < 40));
    let choisies = [];
    if (annonce.length) choisies = annonce;
    else if (k) {   // 1b) une seule ouverture : la cote dont la valeur colle a la longueur surlignee
      const attendu = (horiz ? x1 - x0 : y1 - y0) / k;
      let best = null, ecart = 1e9;
      for (const c of cotes) { const e = Math.abs(num(c.t) - attendu) / Math.max(attendu, 1); if (e < ecart) { ecart = e; best = c; } }
      if (best && ecart < 0.45) choisies = [best];
    }
    choisies.sort((a, b) => pos(a) - pos(b));

    // 2) epaisseur : largeur de la poutre/linteau ecrite pres (« prb : 20x60ht »), sinon mesuree sur le dessin
    let epaisseur = '', epVerif = false, remarqueLinteau = '', dLint = 1e9;
    for (const l of lignesDe(proches)) {   // le linteau ecrit le plus pres du surlignage
      const txt = l.map(m => m.t).join(' '), m = txt.match(/\b(prb|prm|p|bn)\s*:?\s*(\d{2})x(\d{2,3})\s*ht/i);
      if (!m) continue;
      const d = Math.min(...l.map(w => Math.hypot(cx(w) - centre[0], cy(w) - centre[1])));
      if (d < dLint) { dLint = d; remarqueLinteau = `Linteau ${m[1]} ${m[2]}x${m[3]}ht`; epaisseur = (+m[2] >= 10 && +m[2] <= 40) ? m[2] : ''; }
    }
    if (!epaisseur) { const e = epaisseurMesuree(page, boite, k); if (e) { epaisseur = String(e); epVerif = true; } }

    // 3) repere : etiquette la plus proche du centre de chaque ouverture
    const reperes = proches.filter(m => REPERE.test(m.t) && !NOMBRE.test(m.t) || /^0\d$/.test(m.t));
    const seuil = proches.some(m => /^(seuil|porte|pf)$/i.test(m.t));

    const fabrique = (c, i) => {
      const p = c ? pos(c) : (horiz ? centre[0] : centre[1]);
      const a = alls.filter(a => Math.abs((horiz ? a.x : a.y) - p) < 60).sort((u, v) => Math.abs((horiz ? u.x : u.y) - p) - Math.abs((horiz ? v.x : v.y) - p))[0];
      const v = vars.filter(v => Math.abs((horiz ? v.x : v.y) - p) < 60).sort((u, w) => Math.abs((horiz ? u.x : u.y) - p) - Math.abs((horiz ? w.x : w.y) - p))[0];
      const r = reperes.map(m => ({ m, d: Math.abs(pos(m) - p) + 0.3 * Math.abs((horiz ? cy(m) : cx(m)) - (horiz ? centre[1] : centre[0])) }))
        .sort((u, w) => u.d - w.d)[0];
      const largeur = c ? c.t : '';
      const allege = a ? String(a.valeur) : '';
      const porte = seuil || (a && a.valeur === 0);
      const o = { repere: r ? r.m.t : '', type: porte ? 'porte' : 'fenêtre', forme: 'rectangle', contour: [],
        largeur, hauteur: '', allege, epaisseur, faces: porte ? 3 : 4, verif: [], remarque: '' };
      if (v) {
        o.hauteur = `${v.a} à ${v.b}`; o.forme = 'trapèze';
        const L = num(largeur) || 100; o.contour = [[0, 0], [L, 0], [L, v.b], [0, v.a]];
      }
      if (epVerif) o.verif.push('epaisseur');
      const notes = [];
      if (remarqueLinteau) notes.push(remarqueLinteau);
      if (epVerif) notes.push('épaisseur mesurée sur le dessin, à vérifier');
      if (!o.largeur) notes.push('largeur non trouvée : à saisir');
      if (!o.hauteur) notes.push('hauteur non écrite sur le plan : à saisir');
      o.remarque = notes.join(' ; ');
      return o;
    };
    return choisies.length ? choisies.map(fabrique) : [fabrique(null, 0)];
  }

  // --- nom du chantier : la plus grande ecriture du cartouche (quart bas-droit de la feuille)
  function nomChantier(page) {
    // taille du texte : h (fournie par le navigateur) sinon hauteur de la boite ; les textes tournes sont ignores
    const taille = m => m.h != null ? m.h : (m.y1 - m.y0);
    const zone = page.mots.filter(m => !m.r && m.x0 > page.largeur * 0.6 && m.y0 > page.hauteur * 0.35 && /[A-Za-zÀ-ÿ]{2,}/.test(m.t)
      && (m.h != null || (m.x1 - m.x0) >= 0.5 * (m.y1 - m.y0))
      && !/^(plan|indice|date|échelle|echelle|phase|dossier|n°|coffrage|niveau|ferraillage)$/i.test(m.t));
    if (!zone.length) return '';
    const h = Math.max(...zone.map(taille));
    const grands = zone.filter(m => taille(m) > h * 0.85);
    const ligne = lignesDe(grands)[0] || [];
    return ligne.map(m => m.t).join(' ').trim();
  }

  const api = { analyser, nomChantier, echelleLocale, epaisseurMesuree };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else racine.Regles = api;
})(typeof window !== 'undefined' ? window : globalThis);
