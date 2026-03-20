'use strict';

const MAP_UI_FONT = '"Segoe UI Variable Text", "Segoe UI", Tahoma, Arial, sans-serif';
const MAP_ICON_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

// ─── Visual style tables ────────────────────────────────────────────────────

const ROAD_STYLES = {
  highway:    { casing: '#c58d2f', fill: '#f6c55b', cw: 24, fw: 16, center: '#fff2bf' },
  arterial:   { casing: '#c2b7a5', fill: '#fff7ea', cw: 16, fw: 10, center: '#f2d68a' },
  street:     { casing: '#cfc5b7', fill: '#ffffff', cw: 10, fw:  6, center: null },
  alley:      { casing: '#d8d0c4', fill: '#fbfbfb', cw:  6, fw:  4, center: null },
  pedestrian: { casing: '#d3c8b2', fill: '#f4ead8', cw:  5, fw:  3, center: '#ead7af' },
};

const AREA_STYLES = {
  building:    { fill: '#ded6ca', stroke: '#c4b8a7' },
  park:        { fill: '#cfe5b2', stroke: '#a4c77a' },
  water:       { fill: '#a8d4f2', stroke: '#7fb8de' },
  forest:      { fill: '#b9d8a0', stroke: '#88b36e' },
  industrial:  { fill: '#d7d0c6', stroke: '#bbb19f' },
  residential: { fill: '#ece5db', stroke: '#d1c4b2' },
  commercial:  { fill: '#e8dfd5', stroke: '#cdbba7' },
  square:      { fill: '#e5ddd0', stroke: '#b8ae9e' },
  parking:     { fill: '#dce4ec', stroke: '#8fa8c0' },
  stadium:     { fill: '#cfdcb8', stroke: '#8ea06b' },
  concrete:    { fill: '#d7d7d2', stroke: '#ababaa' },
};

// ─── MapViewport ────────────────────────────────────────────────────────────

class MapViewport {
  constructor() {
    this.offsetX  = 0;
    this.offsetY  = 0;
    this.scale    = 0.8;    // pixels per world unit
    this.minScale = 0.02;
    this.maxScale = 20;
  }

  pan(dx, dy) { this.offsetX += dx; this.offsetY += dy; }

  zoom(factor, cx, cy) {
    const ns = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));
    const f  = ns / this.scale;
    this.offsetX = cx - (cx - this.offsetX) * f;
    this.offsetY = cy - (cy - this.offsetY) * f;
    this.scale   = ns;
  }

  /** World → Screen */
  w2s(wx, wy) {
    return { x: wx * this.scale + this.offsetX, y: wy * this.scale + this.offsetY };
  }

  /** Screen → World */
  s2w(sx, sy) {
    return { x: (sx - this.offsetX) / this.scale, y: (sy - this.offsetY) / this.scale };
  }

  fitBounds(canvas, bounds, padding = 80) {
    const w = canvas.width - padding * 2;
    const h = canvas.height - padding * 2;
    const s = Math.min(w / (bounds.width || 1000), h / (bounds.height || 1000));
    this.scale   = Math.max(this.minScale, Math.min(this.maxScale, s));
    this.offsetX = canvas.width  / 2 - bounds.centerX * this.scale;
    this.offsetY = canvas.height / 2 - bounds.centerY * this.scale;
  }

  zoomPct() { return Math.round(this.scale * 100); }
}

// ─── MapRenderer ────────────────────────────────────────────────────────────

class MapRenderer {
  constructor(canvas, data, viewport) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.data     = data;
    this.vp       = viewport;
    this.layers   = { grid: true, areas: true, roads: true, pois: true, labels: true };
    this.selection = new Set();   // selected obj IDs
    this.hoveredId = null;
    this.drawState = null;        // current tool preview
    this.showNodes = false;       // show road nodes (active in road tool)
    this.snapPoint = null;        // snap indicator { x, y }
  }

  render() {
    const { canvas, ctx, vp } = this;
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Ground
    ctx.fillStyle = '#ebe6d8';
    ctx.fillRect(0, 0, W, H);
    this._landTexture();

    if (this.layers.grid)  this._grid();
    if (this.layers.areas) this._areas();
    if (this.layers.roads) { this._roadCasings(); this._roadFills(); }
    if (this.showNodes)    this._nodes();
    if (this.layers.pois)  this._pois();
    if (this.layers.labels && vp.scale > 0.15) this._labels();

    if (this.drawState) this._drawPreview();
    this._selectionGlow();
    if (this.snapPoint) this._snapIndicator();
  }

  // ── Grid ──────────────────────────────────────────────────────────────────
  _grid() {
    const { ctx, canvas, vp } = this;
    let gs = 50;
    while (gs * vp.scale < 25) gs *= 5;
    while (gs * vp.scale > 200) gs /= 5;
    const ss = gs * vp.scale;
    const ox = vp.offsetX % ss;
    const oy = vp.offsetY % ss;

    ctx.save();
    ctx.strokeStyle = 'rgba(102, 112, 121, 0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox; x < canvas.width; x += ss) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
    for (let y = oy; y < canvas.height; y += ss) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
    ctx.stroke();

    // Major grid
    const ms = ss * 5;
    const mox = vp.offsetX % ms;
    const moy = vp.offsetY % ms;
    ctx.strokeStyle = 'rgba(102, 112, 121, 0.18)';
    ctx.beginPath();
    for (let x = mox; x < canvas.width; x += ms) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
    for (let y = moy; y < canvas.height; y += ms) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
    ctx.stroke();
    ctx.restore();
  }

  // ── Areas ─────────────────────────────────────────────────────────────────
  _areas() {
    const { ctx, vp } = this;
    const view = this._worldViewBounds();
    const showTextures = vp.scale > 0.12;
    const showShadow   = vp.scale > 0.25;
    for (const area of this.data.areas) {
      if (!area.points || area.points.length < 3) continue;
      const b = this._pointsBounds(area.points);
      if (!this._boundsInView(b.minX, b.minY, b.maxX, b.maxY, view)) continue;

      const st = AREA_STYLES[area.type] || AREA_STYLES.building;
      const sel = this.selection.has(area.id);
      const hov = this.hoveredId === area.id;

      ctx.save();
      if (showShadow && area.type === 'building') {
        ctx.shadowColor = 'rgba(110, 95, 75, 0.18)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 2;
      }
      ctx.beginPath();
      this._polyPath(ctx, area.points);
      ctx.fillStyle = sel ? this._brighten(st.fill, 20) : hov ? this._brighten(st.fill, 10) : st.fill;
      ctx.fill();
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = sel ? '#d94b88' : st.stroke;
      ctx.lineWidth = sel ? 2 : 1;
      ctx.stroke();
      if (showTextures) {
        if (area.type === 'park' || area.type === 'forest') {
          this._areaDots(area.points, area.type === 'forest' ? '#88b36e' : '#9ac16d', 16);
        }
        if (area.type === 'water') {
          this._areaLines(area.points, '#cbe8fb', 12);
        }
        if (area.type === 'square') {
          this._areaPaving(area.points);
        }
        if (area.type === 'parking') {
          this._areaParkingMarks(area.points);
        }
        if (area.type === 'stadium') {
          this._areaStadiumMarks(area.points);
        }
        if (area.type === 'concrete') {
          this._areaConcreteMarks(area.points);
        }
      }
      ctx.restore();
    }
  }

  // ── Road casings ──────────────────────────────────────────────────────────
  _roadCasings() {
    this._drawRoads(true);
  }

  _roadFills() {
    this._drawRoads(false);
  }

  _drawRoads(casing) {
    const { ctx, vp, data } = this;
    const order = ['pedestrian','alley','street','arterial','highway'];
    const sorted = [...data.roads].sort((a,b) => order.indexOf(a.type)-order.indexOf(b.type));
    const view = this._worldViewBounds();

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const road of sorted) {
      const st = this._roadStyle(road);
      const nodes = road.nodes.map(id => data.getNode(id)).filter(Boolean);
      if (nodes.length < 2) continue;

      // Viewport culling via node AABB
      let minX = nodes[0].x, minY = nodes[0].y, maxX = minX, maxY = minY;
      for (let i = 1; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.x < minX) minX = n.x; else if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y; else if (n.y > maxY) maxY = n.y;
      }
      if (!this._boundsInView(minX, minY, maxX, maxY, view)) continue;

      ctx.strokeStyle = casing ? st.casing : st.fill;
      ctx.lineWidth   = Math.max(casing ? 1.8 : 1.1, (casing ? st.cw : st.fw) * vp.scale);

      ctx.beginPath();
      const p0 = vp.w2s(nodes[0].x, nodes[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < nodes.length; i++) {
        const p = vp.w2s(nodes[i].x, nodes[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();

    if (!casing) {
      this._roadCenterLines();
      this._roadLaneSeparators();
      this._roadTramLines();
    }
  }

  _roadTramLines() {
    const { ctx, vp, data } = this;
    const view = this._worldViewBounds();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const road of data.roads) {
      if (!road.tram) continue;
      const st = this._roadStyle(road);
      const nodes = road.nodes.map(id => data.getNode(id)).filter(Boolean);
      if (nodes.length < 2) continue;
      let minX = nodes[0].x, minY = nodes[0].y, maxX = minX, maxY = minY;
      for (let i = 1; i < nodes.length; i++) { const n = nodes[i]; if (n.x < minX) minX = n.x; else if (n.x > maxX) maxX = n.x; if (n.y < minY) minY = n.y; else if (n.y > maxY) maxY = n.y; }
      if (!this._boundsInView(minX, minY, maxX, maxY, view)) continue;

      const points = nodes.map(node => vp.w2s(node.x, node.y));
      const railOffset = Math.max(2.5, st.fw * vp.scale * 0.14);
      const railWidth = Math.max(1.4, st.fw * vp.scale * 0.09);

      this._strokeOffsetPolyline(points, railOffset, '#6a5d55', railWidth);
      this._strokeOffsetPolyline(points, -railOffset, '#6a5d55', railWidth);
      this._strokeOffsetPolyline(points, railOffset * 0.92, 'rgba(255,255,255,0.55)', Math.max(0.7, railWidth * 0.35));
      this._strokeOffsetPolyline(points, -railOffset * 0.92, 'rgba(255,255,255,0.55)', Math.max(0.7, railWidth * 0.35));
      this._drawTramSleepers(points, Math.max(14, st.fw * vp.scale * 1.1), railOffset);
    }
    ctx.restore();
  }

  _roadCenterLines() {
    const { ctx, vp, data } = this;
    const view = this._worldViewBounds();
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const road of data.roads) {
      const st = this._roadStyle(road);
      if (!st.center || road.type === 'street' || road.type === 'alley') continue;
      const nodes = road.nodes.map(id => data.getNode(id)).filter(Boolean);
      if (nodes.length < 2) continue;
      let minX = nodes[0].x, minY = nodes[0].y, maxX = minX, maxY = minY;
      for (let i = 1; i < nodes.length; i++) { const n = nodes[i]; if (n.x < minX) minX = n.x; else if (n.x > maxX) maxX = n.x; if (n.y < minY) minY = n.y; else if (n.y > maxY) maxY = n.y; }
      if (!this._boundsInView(minX, minY, maxX, maxY, view)) continue;
      ctx.strokeStyle = st.center;
      ctx.lineWidth = Math.max(1, st.fw * vp.scale * 0.12);
      ctx.beginPath();
      const p0 = vp.w2s(nodes[0].x, nodes[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < nodes.length; i++) {
        const p = vp.w2s(nodes[i].x, nodes[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _roadLaneSeparators() {
    const { ctx, vp, data } = this;
    const view = this._worldViewBounds();
    ctx.save();
    ctx.setLineDash([8, 10]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const road of data.roads) {
      const laneCount = Math.max(1, Number(road.laneCount) || 1);
      if (laneCount < 3) continue;
      const st = this._roadStyle(road);
      const nodes = road.nodes.map(id => data.getNode(id)).filter(Boolean);
      if (nodes.length < 2) continue;
      let minX = nodes[0].x, minY = nodes[0].y, maxX = minX, maxY = minY;
      for (let i = 1; i < nodes.length; i++) { const n = nodes[i]; if (n.x < minX) minX = n.x; else if (n.x > maxX) maxX = n.x; if (n.y < minY) minY = n.y; else if (n.y > maxY) maxY = n.y; }
      if (!this._boundsInView(minX, minY, maxX, maxY, view)) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, st.fw * vp.scale * 0.08);
      ctx.beginPath();
      const p0 = vp.w2s(nodes[0].x, nodes[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < nodes.length; i++) {
        const p = vp.w2s(nodes[i].x, nodes[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────
  _nodes() {
    const { ctx, vp, data } = this;
    const view = this._worldViewBounds();
    for (const n of data.nodes) {
      if (!this._boundsInView(n.x, n.y, n.x, n.y, view)) continue;
      const p = vp.w2s(n.x, n.y);
      const sel = this.selection.has(n.id);
      const hov = this.hoveredId === n.id;
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, sel ? 7 : hov ? 6 : 4, 0, Math.PI*2);
      ctx.fillStyle = sel ? '#d94b88' : hov ? '#ff85c8' : '#8899aa';
      ctx.fill();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── POIs ──────────────────────────────────────────────────────────────────
  _pois() {
    const { ctx, vp, data } = this;
    const view = this._worldViewBounds();
    for (const poi of data.pois) {
      if (!this._boundsInView(poi.x, poi.y, poi.x, poi.y, view)) continue;
      const p   = vp.w2s(poi.x, poi.y);
      const cat = PLACES_CATEGORIES[poi.type] || PLACES_CATEGORIES.other;
      const sel = this.selection.has(poi.id);
      const r   = sel ? 11 : 9;

      ctx.save();
      ctx.shadowColor  = 'rgba(78,63,43,0.22)';
      ctx.shadowBlur   = 8;
      ctx.shadowOffsetY = 2;

      // Badge circle
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI*2);
      ctx.fillStyle   = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = sel ? '#d94b88' : 'rgba(120,105,84,0.35)';
      ctx.lineWidth   = sel ? 2.5 : 1.2;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, r - 3, 0, Math.PI*2);
      ctx.fillStyle = sel ? '#d94b88' : cat.color;
      ctx.fill();

      // Icon
      ctx.font = `${Math.round(r * 0.95)}px ${MAP_ICON_FONT}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cat.icon, p.x, p.y + 0.5);

      ctx.restore();
    }
  }

  // ── Labels ────────────────────────────────────────────────────────────────
  _labels() {
    const { ctx, vp, data } = this;

    // Road names
    for (const road of data.roads) {
      if (!road.name) continue;
      const nodes = road.nodes.map(id => data.getNode(id)).filter(Boolean);
      if (nodes.length < 2) continue;

      const screenPoints = nodes.map(node => vp.w2s(node.x, node.y));
      const totalLen = this._polylineScreenLength(screenPoints);
      if (totalLen < 80) continue;

      const fs = this._roadLabelFontSize(road, vp.scale);
      const maxLabels = road.type === 'highway' ? 6 : road.type === 'arterial' ? 5 : 4;
      const labelCount = Math.min(maxLabels, Math.max(1, Math.floor(totalLen / 240)));
      const spacing = totalLen / (labelCount + 1);
      const usedSpots = [];

      ctx.save();
      ctx.font = `600 ${fs}px ${MAP_UI_FONT}`;
      const textWidth = ctx.measureText(road.name).width;
      ctx.restore();

      for (let i = 1; i <= labelCount; i++) {
        const sample = this._pointAlongScreenPolyline(screenPoints, spacing * i);
        if (!sample) continue;
        if (usedSpots.some(pos => Math.abs(pos - sample.distance) < textWidth + 60)) continue;
        usedSpots.push(sample.distance);

        let angle = sample.angle;
        if (angle > Math.PI/2)  angle -= Math.PI;
        if (angle < -Math.PI/2) angle += Math.PI;

        ctx.save();
        ctx.translate(sample.x, sample.y);
        ctx.rotate(angle);
        ctx.font = `600 ${fs}px ${MAP_UI_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.strokeText(road.name, 0, 0);
        ctx.fillStyle = '#5f5548';
        ctx.fillText(road.name, 0, 0);
        ctx.restore();
      }
    }

    // Area labels
    const areaView = this._worldViewBounds();
    for (const area of data.areas) {
      const label = [area.name, area.number].filter(Boolean).join(' ');
      if (!label || !area.points || area.points.length < 3) continue;
      // Centroid
      let cx=0, cy=0;
      for (const pt of area.points) { cx += pt[0]; cy += pt[1]; }
      cx /= area.points.length; cy /= area.points.length;
      if (!this._boundsInView(cx, cy, cx, cy, areaView)) continue;
      const sp = vp.w2s(cx, cy);
      const fs = Math.round(Math.max(8, Math.min(13, 9 * vp.scale)));
      ctx.save();
      ctx.font = `600 ${fs}px ${MAP_UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.88)';
      ctx.strokeText(label, sp.x, sp.y);
      ctx.fillStyle = '#5d5346';
      ctx.fillText(label, sp.x, sp.y);
      ctx.restore();
    }

    // POI names (only when zoomed in enough)
    if (vp.scale > 0.5) {
      const poiView = this._worldViewBounds();
      for (const poi of data.pois) {
        if (!poi.name) continue;
        if (!this._boundsInView(poi.x, poi.y, poi.x, poi.y, poiView)) continue;
        const p = vp.w2s(poi.x, poi.y);
        const fs = Math.round(Math.max(8, Math.min(11, 9 * vp.scale)));
        const textY = p.y + 18;
        ctx.save();
        ctx.font = `500 ${fs}px ${MAP_UI_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.strokeText(poi.name, p.x, textY);
        ctx.fillStyle = '#4d4337';
        ctx.fillText(poi.name, p.x, textY);
        ctx.restore();
      }
    }
  }

  // ── Draw preview (tool feedback) ──────────────────────────────────────────
  _drawPreview() {
    const { ctx, vp } = this;
    const state = this.drawState;
    if (!state) return;

    if (state.tool === 'road') {
      if (!state.points.length) return;
      const st = this._roadStyle({
        type: state.roadType,
        laneCount: state.laneCount,
        widthScale: state.widthScale,
      });
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.lineCap = 'round';

      const drawPoly = (color, lw) => {
        ctx.strokeStyle = color;
        ctx.lineWidth   = lw;
        ctx.beginPath();
        const p0 = vp.w2s(state.points[0].x, state.points[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < state.points.length; i++) {
          const p = vp.w2s(state.points[i].x, state.points[i].y);
          ctx.lineTo(p.x, p.y);
        }
        if (state.cursor) {
          const cp = vp.w2s(state.cursor.x, state.cursor.y);
          ctx.lineTo(cp.x, cp.y);
        }
        ctx.stroke();
      };
      drawPoly(st.casing, st.cw * vp.scale);
      drawPoly(st.fill, st.fw * vp.scale);

      // Placed nodes
      for (const pt of state.points) {
        const sp = vp.w2s(pt.x, pt.y);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 5, 0, Math.PI*2);
        ctx.fillStyle = '#d94b88';
        ctx.fill();
      }
      ctx.restore();
    }

    if (state.tool === 'area') {
      if (!state.points.length) return;
      const aStyle = AREA_STYLES[state.areaType] || AREA_STYLES.building;
      ctx.save();
      ctx.beginPath();
      this._polyPath(ctx, state.points, false);
      if (state.cursor) {
        const cp = vp.w2s(state.cursor.x, state.cursor.y);
        ctx.lineTo(cp.x, cp.y);
      }
      if (state.points.length > 2) {
        ctx.fillStyle = aStyle.fill + '88';
        ctx.closePath();
        ctx.fill();
      }
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = '#d94b88';
      ctx.lineWidth = 2;
      ctx.stroke();

      for (const pt of state.points) {
        const sp = vp.w2s(pt[0], pt[1]);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 5, 0, Math.PI*2);
        ctx.fillStyle = '#d94b88';
        ctx.fill();
      }
      ctx.restore();
    }

    if (state.tool === 'poi' && state.cursor) {
      const p = vp.w2s(state.cursor.x, state.cursor.y);
      const cat = PLACES_CATEGORIES[state.poiType] || PLACES_CATEGORIES.other;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI*2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI*2);
      ctx.fillStyle = cat.color;
      ctx.fill();
      ctx.font = `10px ${MAP_ICON_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 1;
      ctx.fillText(cat.icon, p.x, p.y + 0.5);
      ctx.restore();
    }

    if (state.tool === 'eraser' && state.rect) {
      ctx.save();
      ctx.fillStyle = 'rgba(217, 75, 136, 0.12)';
      ctx.strokeStyle = 'rgba(217, 75, 136, 0.95)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.fillRect(state.rect.x, state.rect.y, state.rect.w, state.rect.h);
      ctx.strokeRect(state.rect.x, state.rect.y, state.rect.w, state.rect.h);
      ctx.restore();
    }
  }

  // ── Selection glow ────────────────────────────────────────────────────────
  _selectionGlow() {
    const { ctx, vp, data } = this;
    if (!this.selection.size) return;
    ctx.save();
    ctx.shadowColor = '#d94b88';
    ctx.shadowBlur  = 15;
    ctx.globalAlpha = 0.45;

    for (const id of this.selection) {
      const road = data.getRoad(id);
      if (road) {
        const ns = road.nodes.map(nid => data.getNode(nid)).filter(Boolean);
        if (ns.length < 2) continue;
        const st = this._roadStyle(road);
        ctx.strokeStyle = '#d94b88';
        ctx.lineWidth   = (st.cw + 6) * vp.scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const p0 = vp.w2s(ns[0].x, ns[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < ns.length; i++) {
          const p = vp.w2s(ns[i].x, ns[i].y);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Snap indicator ────────────────────────────────────────────────────────
  _snapIndicator() {
    const { ctx, vp } = this;
    const sp = vp.w2s(this.snapPoint.x, this.snapPoint.y);
    ctx.save();
    ctx.strokeStyle = '#ff69b4';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 8, 0, Math.PI*2);
    ctx.stroke();
    // crosshair
    ctx.beginPath();
    ctx.moveTo(sp.x-12, sp.y); ctx.lineTo(sp.x+12, sp.y);
    ctx.moveTo(sp.x, sp.y-12); ctx.lineTo(sp.x, sp.y+12);
    ctx.stroke();
    ctx.restore();
  }

  _landTexture() {
    const { ctx, canvas } = this;
    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(223,214,197,0.1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  _areaDots(points, color, step) {
    const { ctx } = this;
    const bounds = this._pointsBounds(points);
    ctx.save();
    ctx.beginPath();
    this._polyPath(ctx, points);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    for (let x = bounds.minX; x <= bounds.maxX; x += step) {
      for (let y = bounds.minY; y <= bounds.maxY; y += step) {
        const p = this.vp.w2s(x, y);
        ctx.moveTo(p.x + 1.5, p.y);
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    ctx.restore();
  }

  _areaParkingMarks(points) {
    const { ctx } = this;
    const bounds = this._pointsBounds(points);
    const slotW = 12; // world units wide
    const slotH = 24; // world units deep
    ctx.save();
    ctx.beginPath();
    this._polyPath(ctx, points);
    ctx.clip();
    ctx.strokeStyle = '#8fa8c0';
    ctx.globalAlpha = 0.30;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // vertical slot dividers
    for (let x = bounds.minX; x <= bounds.maxX; x += slotW) {
      const p1 = this.vp.w2s(x, bounds.minY);
      const p2 = this.vp.w2s(x, bounds.maxY);
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    }
    // horizontal aisle lines
    for (let y = bounds.minY; y <= bounds.maxY; y += slotH) {
      const p1 = this.vp.w2s(bounds.minX, y);
      const p2 = this.vp.w2s(bounds.maxX, y);
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();
    // "P" label in center if large enough
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const cp = this.vp.w2s(cx, cy);
    const areaW = (bounds.maxX - bounds.minX) * this.vp.scale;
    if (areaW > 40) {
      const fs = Math.max(11, Math.min(28, areaW * 0.18));
      ctx.globalAlpha = 0.45;
      ctx.font = `bold ${fs}px ${MAP_UI_FONT}`;
      ctx.fillStyle = '#4a7aaa';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('P', cp.x, cp.y);
    }
    ctx.restore();
  }

  _areaPaving(points) {
    const { ctx } = this;
    const bounds = this._pointsBounds(points);
    const step = 20; // world units per tile
    ctx.save();
    ctx.beginPath();
    this._polyPath(ctx, points);
    ctx.clip();
    ctx.strokeStyle = '#b0a898';
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = bounds.minX; x <= bounds.maxX; x += step) {
      const p1 = this.vp.w2s(x, bounds.minY);
      const p2 = this.vp.w2s(x, bounds.maxY);
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    }
    for (let y = bounds.minY; y <= bounds.maxY; y += step) {
      const p1 = this.vp.w2s(bounds.minX, y);
      const p2 = this.vp.w2s(bounds.maxX, y);
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  _areaStadiumMarks(points) {
    const { ctx } = this;
    const bounds = this._pointsBounds(points);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    ctx.save();
    ctx.beginPath();
    this._polyPath(ctx, points);
    ctx.clip();

    const stripeStep = Math.max(18, width / 8);
    for (let x = bounds.minX; x <= bounds.maxX; x += stripeStep) {
      const p1 = this.vp.w2s(x, bounds.minY);
      const p2 = this.vp.w2s(Math.min(bounds.maxX, x + stripeStep * 0.5), bounds.maxY);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = Math.max(1, this.vp.scale * 8);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    const cp = this.vp.w2s(centerX, centerY);
    const rx = Math.max(16, width * this.vp.scale * 0.32);
    const ry = Math.max(10, height * this.vp.scale * 0.24);
    ctx.strokeStyle = 'rgba(164,74,56,0.55)';
    ctx.lineWidth = Math.max(2, this.vp.scale * 10);
    ctx.beginPath();
    ctx.ellipse(cp.x, cp.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = Math.max(1, this.vp.scale * 2);
    ctx.strokeRect(cp.x - rx * 0.45, cp.y - ry * 0.28, rx * 0.9, ry * 0.56);
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, Math.max(6, Math.min(rx, ry) * 0.22), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _areaConcreteMarks(points) {
    const { ctx } = this;
    const bounds = this._pointsBounds(points);
    const step = 22;
    ctx.save();
    ctx.beginPath();
    this._polyPath(ctx, points);
    ctx.clip();
    ctx.strokeStyle = 'rgba(138,138,138,0.26)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = bounds.minX - step; x <= bounds.maxX + step; x += step) {
      const p1 = this.vp.w2s(x, bounds.minY);
      const p2 = this.vp.w2s(x + (bounds.maxY - bounds.minY), bounds.maxY);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    for (let y = bounds.minY; y <= bounds.maxY; y += step * 0.9) {
      const p1 = this.vp.w2s(bounds.minX, y);
      const p2 = this.vp.w2s(bounds.maxX, y);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  _areaLines(points, color, step) {
    const { ctx } = this;
    const bounds = this._pointsBounds(points);
    ctx.save();
    ctx.beginPath();
    this._polyPath(ctx, points);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = bounds.minY; y <= bounds.maxY; y += step) {
      const p1 = this.vp.w2s(bounds.minX, y);
      const p2 = this.vp.w2s(bounds.maxX, y + step * 0.5);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  _pointsBounds(points) {
    const xs = points.map(point => point[0]);
    const ys = points.map(point => point[1]);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  _polyPath(ctx, points, close = true) {
    const p0 = this.vp.w2s(points[0][0], points[0][1]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < points.length; i++) {
      const p = this.vp.w2s(points[i][0], points[i][1]);
      ctx.lineTo(p.x, p.y);
    }
    if (close) ctx.closePath();
  }

  _brighten(hex, amt) {
    const n = parseInt(hex.replace('#',''), 16);
    const r = Math.min(255, (n>>16) + amt);
    const g = Math.min(255, ((n>>8)&0xff) + amt);
    const b = Math.min(255, (n&0xff) + amt);
    return `rgb(${r},${g},${b})`;
  }

  _strokeOffsetPolyline(points, offset, color, width) {
    const { ctx } = this;
    if (points.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.001) continue;
      const nx = -dy / len;
      const ny = dx / len;
      ctx.beginPath();
      ctx.moveTo(a.x + nx * offset, a.y + ny * offset);
      ctx.lineTo(b.x + nx * offset, b.y + ny * offset);
      ctx.stroke();
    }
  }

  _drawTramSleepers(points, step, railOffset) {
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(116,95,84,0.45)';
    ctx.lineWidth = 1;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < step * 0.8) continue;
      const tx = dx / len;
      const ty = dy / len;
      const nx = -ty;
      const ny = tx;
      const sleeperHalf = Math.max(3, Math.abs(railOffset) * 1.35);
      for (let d = step * 0.5; d < len; d += step) {
        const px = a.x + tx * d;
        const py = a.y + ty * d;
        ctx.beginPath();
        ctx.moveTo(px - nx * sleeperHalf, py - ny * sleeperHalf);
        ctx.lineTo(px + nx * sleeperHalf, py + ny * sleeperHalf);
        ctx.stroke();
      }
    }
  }

  _roadStyle(road) {
    const base = ROAD_STYLES[road.type] || ROAD_STYLES.street;
    const baseLanes = { highway: 4, arterial: 4, street: 2, alley: 1, pedestrian: 1 }[road.type] || 2;
    const laneCount = Math.max(1, Number(road.laneCount) || baseLanes);
    const widthScale = Math.max(0.5, Number(road.widthScale) || 1);
    const factor = Math.max(0.7, laneCount / baseLanes) * widthScale;
    return {
      ...base,
      cw: base.cw * factor,
      fw: base.fw * factor,
    };
  }

  _roadLabelFontSize(road, scale) {
    const typeSize = {
      highway: 13,
      arterial: 12,
      street: 11,
      alley: 10,
      pedestrian: 10,
    }[road.type] || 11;
    return Math.round(Math.max(9, Math.min(typeSize + 3, typeSize * Math.max(0.9, scale * 1.05))));
  }

  _polylineScreenLength(points) {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    }
    return total;
  }

  _pointAlongScreenPolyline(points, targetDistance) {
    let traversed = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const segmentLength = Math.hypot(b.x - a.x, b.y - a.y);
      if (segmentLength <= 0.001) continue;
      if (traversed + segmentLength >= targetDistance) {
        const t = (targetDistance - traversed) / segmentLength;
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          angle: Math.atan2(b.y - a.y, b.x - a.x),
          distance: targetDistance,
        };
      }
      traversed += segmentLength;
    }
    return null;
  }

  // ── Viewport culling helpers ──────────────────────────────────────────────
  /** Returns the visible world-space bounding box for the current canvas/viewport. */
  _worldViewBounds() {
    const { canvas, vp } = this;
    const tl = vp.s2w(0, 0);
    const br = vp.s2w(canvas.width, canvas.height);
    // Add a small margin so objects right at the edge aren't popped out
    const mx = 200 / vp.scale;
    return {
      minX: Math.min(tl.x, br.x) - mx,
      minY: Math.min(tl.y, br.y) - mx,
      maxX: Math.max(tl.x, br.x) + mx,
      maxY: Math.max(tl.y, br.y) + mx,
    };
  }

  /** Returns true if world-space AABB [minX,minY,maxX,maxY] overlaps the view. */
  _boundsInView(minX, minY, maxX, maxY, view) {
    return maxX >= view.minX && minX <= view.maxX &&
           maxY >= view.minY && minY <= view.maxY;
  }

  // Resize canvas to container
  resize() {
    const c = this.canvas;
    const container = c.parentElement;
    c.width  = container.clientWidth;
    c.height = container.clientHeight;
  }
}
