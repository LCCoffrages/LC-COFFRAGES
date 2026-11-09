/* Exports fabriques dans le navigateur (gratuit) : synthese PDF / Excel / Word + PDF annote.
 * Chaque synthese porte le nom du chantier et un QR code « Demande de prix » : scanne (feuille imprimee) ou clique
 * (PDF, Excel, Word), il ouvre un mail pret a envoyer a LC Coffrages avec le tableau des ouvertures. */
(function () {
  'use strict';
  const MAIL = 'kevin.cichon@lc-coffrages.fr';
  const MARINE = '#1b2a7a', JAUNE = '#fff000';
  const COLS = [['quantite', 'Qté'], ['reperes', 'Repères'], ['type', 'Type'], ['forme', 'Forme'], ['largeur', 'Larg. ml'],
    ['hauteur', 'Haut. ml'], ['epaisseur', 'Ép. ml'], ['faces', 'Faces']];

  const propre = s => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const date = () => new Date().toLocaleDateString('fr-FR') + ' ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const valeur = (g, k) => String(g[k] ?? '') + ((g.verif || []).includes(k) && g[k] !== '' ? ' *' : '');
  function telecharger(blob, nom) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); return nom;
  }

  // --- mail « Demande de prix » (corps limite pour tenir dans un QR code)
  // corps compact : le QR code doit rester lisible par un telephone une fois imprime (lien complet <= ~650 caracteres)
  function mailto(s, plan, court) {
    const chantier = s.chantier || plan;
    const lignes = (s.groupes || []).map(g => `${g.quantite}x ${g.type.slice(0, 3)}${g.reperes ? ' ' + g.reperes : ''} L${g.largeur || '?'} H${(g.hauteur || '?').replace(' à ', '-')} ep${g.epaisseur || '?'} F${g.faces}`);
    const lien = c => `mailto:${MAIL}?subject=${encodeURIComponent('Demande de prix - ' + chantier)}&body=${encodeURIComponent(c)}`;
    let corps = `Demande de prix mannequins\nChantier : ${chantier}\n${lignes.join('\n')}`;
    if (!court) return lien(`Bonjour,\n\n${corps}\n(dimensions en ml)\n\nCordialement`);
    while (lien(corps).length > 650 && lignes.length) { lignes.pop(); corps = `Demande de prix mannequins\nChantier : ${chantier}\n${lignes.join('\n')}\n(+ suite : voir synthèse)`; }
    return lien(corps);
  }
  function qrPng(texte) {
    const q = qrcode(0, 'L'); q.addData(texte, 'Byte'); q.make();
    const n = q.getModuleCount(), t = 6, c = document.createElement('canvas'); c.width = c.height = (n + 8) * t;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (q.isDark(i, j)) x.fillRect((j + 4) * t, (i + 4) * t, t, t);
    return c.toDataURL('image/png');
  }

  // --- images : logo (SVG du site, sur fond bleu) et petites formes
  let logoCache = null;
  async function logoPng() {
    if (logoCache) return logoCache;
    const img = new Image(); img.src = 'images/logo_bati_chablais.svg';
    await img.decode();
    const h = 220, w = Math.round(h * (img.naturalWidth || 1018) / (img.naturalHeight || 518)), c = document.createElement('canvas');
    c.width = w + 60; c.height = h + 60; const x = c.getContext('2d');
    x.fillStyle = MARINE; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 30, 30, w, h);
    return (logoCache = { url: c.toDataURL('image/png'), w: c.width, h: c.height });
  }
  function formePng(contour, w = 120, h = 90) {
    if (!contour || contour.length < 3) return null;
    const xs = contour.map(p => p[0]), ys = contour.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
    const k = Math.min((w - 12) / ((Math.max(...xs) - x0) || 1), (h - 12) / ((Math.max(...ys) - y0) || 1));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.beginPath();
    contour.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](6 + (p[0] - x0) * k, h - 6 - (p[1] - y0) * k));
    x.closePath(); x.fillStyle = '#fff7c2'; x.fill(); x.lineWidth = 3; x.strokeStyle = MARINE; x.stroke();
    return c.toDataURL('image/png');
  }
  const b64 = url => url.split(',')[1];
  const octets = url => Uint8Array.from(atob(b64(url)), c => c.charCodeAt(0));

  // ================= PDF =================
  async function pdf({ plan, synth: s }) {
    const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true }), W = 210, logo = await logoPng();
    doc.setFillColor(MARINE); doc.rect(0, 0, W, 38, 'F');
    const lw = 46, lh = lw * logo.h / logo.w; doc.addImage(logo.url, 'PNG', 12, (38 - lh) / 2, lw, lh);
    doc.setTextColor('#ffffff'); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Tableau des ouvertures', 64, 15);
    doc.setTextColor(JAUNE); doc.setFontSize(14); doc.text(doc.splitTextToSize(s.chantier || plan, W - 76)[0], 64, 23);
    doc.setTextColor('#d6dcf5'); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(plan, W - 76)[0], 64, 29); doc.text(date() + '  —  dimensions en ml', 64, 33.5);
    const corps = [];
    (s.groupes || []).forEach(g => {
      corps.push(COLS.map(([k]) => k === 'forme' ? (g.contour && g.contour.length >= 3 ? '' : 'rect.') : valeur(g, k)));
      if (g.remarque) corps.push([{ content: g.remarque, colSpan: COLS.length, styles: { fontSize: 7, textColor: '#6b7686', fontStyle: 'italic', cellPadding: { top: 0, bottom: 2, left: 3, right: 2 } } }]);
    });
    const lignesG = []; (s.groupes || []).forEach(g => { lignesG.push(g); if (g.remarque) lignesG.push(null); });
    doc.autoTable({ startY: 46, head: [COLS.map(c => c[1])], body: corps, theme: 'grid',
      headStyles: { fillColor: MARINE, textColor: '#ffffff', fontStyle: 'bold' }, styles: { fontSize: 9, cellPadding: 2.2, valign: 'middle', lineColor: '#e1e4ea' },
      columnStyles: { 0: { halign: 'center', fontStyle: 'bold', cellWidth: 12 }, 3: { cellWidth: 20, minCellHeight: 14 }, 4: { halign: 'right', fontStyle: 'bold' },
        5: { halign: 'right', fontStyle: 'bold' }, 6: { halign: 'right' }, 7: { halign: 'center', fontStyle: 'bold', cellWidth: 13 } },
      didDrawCell: d => {
        if (d.section !== 'body' || d.column.index !== 3) return;
        const g = lignesG[d.row.index]; const png = g && formePng(g.contour);
        if (png) doc.addImage(png, 'PNG', d.cell.x + 2, d.cell.y + 1.5, d.cell.width - 4, d.cell.height - 3);
      } });
    let y = doc.lastAutoTable.finalY + 6;
    if ((s.groupes || []).some(g => (g.verif || []).length)) { doc.setFontSize(7.5); doc.setTextColor('#b45309'); doc.text('* mesuré sur le dessin : à vérifier', 14, y); y += 6; }
    // bloc « Demande de prix » avec QR code cliquable
    if (y + 62 > 285) { doc.addPage(); y = 20; }
    // QR (version courte, lisible a l'impression) et lien cliquable (mail complet)
    const lien = mailto(s, plan), qr = qrPng(mailto(s, plan, true));
    doc.setDrawColor(MARINE); doc.setLineWidth(0.6); doc.roundedRect(14, y, W - 28, 58, 3, 3);
    doc.addImage(qr, 'PNG', 17, y + 3, 52, 52); doc.link(17, y + 3, 52, 52, { url: lien });
    doc.setTextColor(MARINE); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('Demande de prix — LC Coffrages', 75, y + 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor('#1d2430');
    doc.text(['Scannez ce QR code avec votre téléphone, ou cliquez dessus :', 'un mail déjà rempli avec ce tableau s\'ouvre,', 'il ne reste qu\'à l\'envoyer.'], 75, y + 24);
    doc.setTextColor('#2563eb'); doc.textWithLink('Envoyer la demande de prix', 75, y + 44, { url: lien });
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('times', 'italic'); doc.setFontSize(10); doc.setTextColor('#7b86a0'); doc.text('By Sébastien REY', W - 14, 290, { align: 'right' }); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(`${i} / ${n}`, 14, 290); }
    return telecharger(doc.output('blob'), propre(`${s.chantier || plan} - tableau des ouvertures`) + '.pdf');
  }

  // ================= EXCEL =================
  async function xlsx({ plan, synth: s }) {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Ouvertures'), logo = await logoPng(), lien = mailto(s, plan);
    ws.columns = [{ width: 7 }, { width: 22 }, { width: 14 }, { width: 14 }, { width: 11 }, { width: 16 }, { width: 10 }, { width: 8 }, { width: 55 }];
    ws.addImage(wb.addImage({ base64: b64(logo.url), extension: 'png' }), { tl: { col: 0, row: 0 }, ext: { width: 150, height: 150 * logo.h / logo.w } });
    ws.getRow(1).height = 26; ws.getRow(2).height = 22; ws.getRow(3).height = 18;
    ws.getCell('C1').value = 'Tableau des ouvertures'; ws.getCell('C1').font = { bold: true, size: 16, color: { argb: 'FF1B2A7A' } };
    ws.getCell('C2').value = s.chantier || plan; ws.getCell('C2').font = { bold: true, size: 13 };
    ws.getCell('C3').value = plan + ' — ' + date() + ' — dimensions en ml'; ws.getCell('C3').font = { italic: true, size: 9, color: { argb: 'FF666666' } };
    const ent = ws.getRow(5); [...COLS.map(c => c[1]), 'Remarque'].forEach((t, i) => {
      const c = ent.getCell(i + 1); c.value = t; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A7A' } }; });
    let r = 6;
    for (const g of s.groupes || []) {
      const row = ws.getRow(r); row.height = 40;
      COLS.forEach(([k], i) => {
        const c = row.getCell(i + 1);
        if (k === 'forme') { const png = formePng(g.contour); if (png) ws.addImage(wb.addImage({ base64: b64(png), extension: 'png' }), { tl: { col: i + 0.1, row: r - 1 + 0.1 }, ext: { width: 70, height: 48 } }); else c.value = 'rectangle'; return; }
        const v = g[k] ?? '', n = parseFloat(String(v).replace(',', '.'));
        c.value = (['largeur', 'epaisseur', 'quantite', 'faces'].includes(k) && /^\d+([.,]\d+)?$/.test(String(v))) ? n : v;
        if ((g.verif || []).includes(k)) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1D6' } }; c.note = 'Mesuré sur le dessin : à vérifier'; }
        if (['quantite', 'largeur', 'hauteur', 'faces'].includes(k)) c.font = { bold: true };
        c.alignment = { vertical: 'middle', wrapText: true };
      });
      row.getCell(COLS.length + 1).value = g.remarque || ''; row.getCell(COLS.length + 1).alignment = { vertical: 'middle', wrapText: true };
      r++;
    }
    r += 1;
    ws.getCell(`B${r}`).value = { text: '✉ Envoyer la demande de prix à LC Coffrages', hyperlink: lien };
    ws.getCell(`B${r}`).font = { bold: true, size: 12, color: { argb: 'FF2563EB' }, underline: true };
    ws.getCell(`B${r + 1}`).value = 'ou scannez le QR code avec votre téléphone'; ws.getCell(`B${r + 1}`).font = { italic: true, size: 9, color: { argb: 'FF666666' } };
    ws.addImage(wb.addImage({ base64: b64(qrPng(mailto(s, plan, true))), extension: 'png' }), { tl: { col: 5, row: r - 1 }, ext: { width: 190, height: 190 } });
    ws.getCell(`I${r + 8}`).value = 'By Sébastien REY'; ws.getCell(`I${r + 8}`).font = { italic: true, size: 9, color: { argb: 'FF999999' } };
    const buf = await wb.xlsx.writeBuffer();
    return telecharger(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), propre(`${s.chantier || plan} - tableau des ouvertures`) + '.xlsx');
  }

  // ================= WORD =================
  async function docxExport({ plan, synth: s }) {
    const D = window.docx, logo = await logoPng(), lien = mailto(s, plan);
    const cellule = (enfants, opts = {}) => new D.TableCell({ children: Array.isArray(enfants) ? enfants : [enfants], ...opts });
    const texte = (t, o = {}) => new D.Paragraph({ children: [new D.TextRun({ text: String(t ?? ''), ...o })] });
    const lignes = [new D.TableRow({ tableHeader: true, children: COLS.map(([, t]) => cellule(texte(t, { bold: true, color: 'FFFFFF' }), { shading: { fill: '1B2A7A' } })) })];
    for (const g of s.groupes || []) {
      lignes.push(new D.TableRow({ children: COLS.map(([k]) => {
        if (k === 'forme') { const png = formePng(g.contour); return cellule(png ? new D.Paragraph({ children: [new D.ImageRun({ data: octets(png), transformation: { width: 60, height: 45 } })] }) : texte('rectangle')); }
        return cellule(texte(valeur(g, k), { bold: ['quantite', 'largeur', 'hauteur', 'faces'].includes(k) }), (g.verif || []).includes(k) ? { shading: { fill: 'FFF1D6' } } : {});
      }) }));
      if (g.remarque) lignes.push(new D.TableRow({ children: [cellule(texte(g.remarque, { italics: true, size: 16, color: '6B7686' }), { columnSpan: COLS.length })] }));
    }
    const doc = new D.Document({ sections: [{ children: [
      new D.Paragraph({ children: [new D.ImageRun({ data: octets(logo.url), transformation: { width: 170, height: 170 * logo.h / logo.w } })] }),
      new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, children: [new D.TextRun({ text: 'Tableau des ouvertures', color: '1B2A7A' })] }),
      texte(s.chantier || plan, { bold: true, size: 28 }), texte(plan + ' — ' + date() + ' — dimensions en ml', { size: 16, color: '666666' }), texte(''),
      new D.Table({ rows: lignes, width: { size: 100, type: D.WidthType.PERCENTAGE } }),
      texte((s.groupes || []).some(g => (g.verif || []).length) ? '* mesuré sur le dessin : à vérifier' : '', { size: 16, color: 'B45309' }), texte(''),
      new D.Paragraph({ children: [new D.ImageRun({ data: octets(qrPng(mailto(s, plan, true))), transformation: { width: 180, height: 180 } })] }),
      new D.Paragraph({ children: [new D.ExternalHyperlink({ link: lien, children: [new D.TextRun({ text: '✉ Envoyer la demande de prix à LC Coffrages', style: 'Hyperlink', bold: true })] })] }),
      texte('ou scannez le QR code avec votre téléphone', { italics: true, size: 16, color: '666666' }), texte(''),
      new D.Paragraph({ alignment: D.AlignmentType.RIGHT, children: [new D.TextRun({ text: 'By Sébastien REY', italics: true, color: '7B86A0', font: 'Garamond' })] }),
    ] }] });
    return telecharger(await D.Packer.toBlob(doc), propre(`${s.chantier || plan} - tableau des ouvertures`) + '.docx');
  }

  // ================= PDF ANNOTE =================
  async function pdfAnnote({ plan, annots, pdfData }) {
    const L = window.PDFLib, doc = await L.PDFDocument.load(pdfData.slice(0)), police = await doc.embedFont(L.StandardFonts.HelveticaBold);
    const rgb = h => L.rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
    for (const a of annots || []) {
      const p = doc.getPages()[a.page - 1]; if (!p) continue; const c = rgb(a.couleur || '#e4572e');
      if (a.traits) for (const t of a.traits) for (let i = 1; i < t.length; i++)
        p.drawLine({ start: { x: t[i - 1][0], y: t[i - 1][1] }, end: { x: t[i][0], y: t[i][1] }, thickness: a.type === 'surligneur' ? 14 : 2.5, color: c, opacity: a.type === 'surligneur' ? 0.35 : 1, lineCap: L.LineCapStyle.Round });
      if (a.type === 'nuage') p.drawRectangle({ x: Math.min(a.p1[0], a.p2[0]), y: Math.min(a.p1[1], a.p2[1]), width: Math.abs(a.p2[0] - a.p1[0]), height: Math.abs(a.p2[1] - a.p1[1]), borderColor: c, borderWidth: 3 });
      if (a.type === 'fleche') {
        p.drawLine({ start: { x: a.p1[0], y: a.p1[1] }, end: { x: a.p2[0], y: a.p2[1] }, thickness: 3, color: c });
        const ang = Math.atan2(a.p2[1] - a.p1[1], a.p2[0] - a.p1[0]), Lg = 16;
        for (const d of [-0.4, 0.4]) p.drawLine({ start: { x: a.p2[0], y: a.p2[1] }, end: { x: a.p2[0] - Lg * Math.cos(ang + d), y: a.p2[1] - Lg * Math.sin(ang + d) }, thickness: 3, color: c });
      }
      if (a.type === 'note' || a.type === 'tampon') p.drawText(a.texte || '', { x: a.p1[0] + 6, y: a.p1[1] + 6, size: a.type === 'note' ? 14 : 20, font: police, color: c });
    }
    return telecharger(new Blob([await doc.save()], { type: 'application/pdf' }), propre(plan.replace(/\.pdf$/i, '') + ' - annoté') + '.pdf');
  }

  window.Exports = { pdf, xlsx, docx: docxExport, 'pdf-annote': pdfAnnote, mailto };
})();
