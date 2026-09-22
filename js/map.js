/**
 * Maritime Web GIS Leaflet Engine
 * Handles nautical mapping, SAR spill polygons, vessel trajectory rendering,
 * directional ship markers, and dynamic time-scrubbing playback.
 */

class MaritimeMap {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.layers = {
      baseTiles: null,
      spillLayer: null,
      bufferLayer: null,
      backtrackLayer: null,
      vesselTracksLayer: null,
      vesselMarkersLayer: null,
      sensitiveLayer: null
    };
    this.currentScenarioData = null;
    this.vesselMarkerMap = new Map(); // mmsi -> L.Marker
    this.selectedVesselMmsi = null;

    // Realistic Black Flowing Oil Simulation properties
    this.oilCanvas = null;
    this.oilCanvasCtx = null;
    this.oilParticles = [];
    this.maxOilParticles = 60;
    this.activeSpillData = null;
    this.oilAnimFrame = null;

    this.initMap();
  }

  initMap() {
    // Initialize map with dark maritime aesthetic
    this.map = L.map(this.containerId, {
      zoomControl: false,
      attributionControl: false
    }).setView([13.052, 80.318], 11);

    // Zoom control on top right
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    const googleApiKey = 'AIzaSyDDAnEjkGBNL9hpnwT8Fy_LSDJ8_JDHboA';

    // Base Tile Layers powered by Google Maps API
    this.baseLayers = {
      'Google Satellite (Hybrid)': L.tileLayer(
        `https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${googleApiKey}`,
        {
          maxZoom: 20,
          subdomains: '0123',
          attribution: '&copy; Google Maps Satellite'
        }
      ),
      'Google Roadmap': L.tileLayer(
        `https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${googleApiKey}`,
        {
          maxZoom: 20,
          subdomains: '0123',
          attribution: '&copy; Google Maps'
        }
      ),
      'Google Terrain': L.tileLayer(
        `https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&key=${googleApiKey}`,
        {
          maxZoom: 20,
          subdomains: '0123',
          attribution: '&copy; Google Maps'
        }
      ),
      'CartoDB Voyager': L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          maxZoom: 18,
          subdomains: 'abcd'
        }
      )
    };

    // Default to Google Satellite Hybrid
    this.baseLayers['Google Satellite (Hybrid)'].addTo(this.map);
    this.layers.baseTiles = this.baseLayers['Google Satellite (Hybrid)'];

    // Layer switcher control on top right
    L.control.layers(this.baseLayers, null, { position: 'topright' }).addTo(this.map);

    // Layer groups
    this.layers.bufferLayer = L.layerGroup().addTo(this.map);
    this.layers.backtrackLayer = L.layerGroup().addTo(this.map);
    this.layers.spillLayer = L.layerGroup().addTo(this.map);
    this.layers.vesselTracksLayer = L.layerGroup().addTo(this.map);
    this.layers.vesselMarkersLayer = L.layerGroup().addTo(this.map);
    this.layers.sensitiveLayer = L.layerGroup().addTo(this.map);

    // Initialize Realistic Black Flowing Oil Simulation
    this.initOilDefs();
    this.initOilFlowCanvas();
  }

  initOilDefs() {
    if (document.getElementById('oil-svg-defs')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'oil-svg-defs';
    svg.setAttribute('style', 'position:absolute; width:0; height:0; pointer-events:none;');
    svg.innerHTML = `
      <defs>
        <filter id="oil-liquid-ripple" x="-25%" y="-25%" width="150%" height="150%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035 0.025" numOctaves="3" result="noise" seed="4">
            <animate attributeName="baseFrequency" dur="12s" values="0.025 0.02;0.045 0.035;0.025 0.02" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="8" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    `;
    document.body.appendChild(svg);
  }

  initOilFlowCanvas() {
    this.oilCanvas = document.createElement('canvas');
    this.oilCanvas.className = 'oil-flow-canvas';
    this.oilCanvasCtx = this.oilCanvas.getContext('2d');

    const pane = this.map.getPanes().overlayPane;
    pane.appendChild(this.oilCanvas);

    const updateCanvasPos = () => {
      if (!this.oilCanvas) return;
      const size = this.map.getSize();
      const topLeft = this.map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this.oilCanvas, topLeft);
      this.oilCanvas.width = size.x;
      this.oilCanvas.height = size.y;
    };

    this.map.on('move moveend zoomend resize', updateCanvasPos);
    updateCanvasPos();

    this.startOilFlowAnimation();
  }

  startOilFlowAnimation() {
    const loop = (time) => {
      this.drawOilFlowAnimation(time);
      this.oilAnimFrame = requestAnimationFrame(loop);
    };
    this.oilAnimFrame = requestAnimationFrame(loop);
  }

  createOilParticle(scaleFactor = 1) {
    const p = {};
    this.resetOilParticle(p, scaleFactor);
    p.dist = Math.random() * (135 * scaleFactor);
    return p;
  }

  resetOilParticle(p, scaleFactor = 1) {
    p.dist = Math.random() * (10 * scaleFactor);
    p.lateral = (Math.random() - 0.5) * 32; // Lateral offset from centerline
    p.speed = 0.38 + Math.random() * 0.48;
    p.phase = Math.random() * Math.PI * 2;
    p.baseRadius = 3.5 + Math.random() * 3.5; // Small size bubble (3.5px to 7px)
    p.maxGrow = 4.0 + Math.random() * 5.0; // Grows moderately (max ~8px to 12px)
    p.alpha = 0.70 + Math.random() * 0.25;
    p.rimColor = Math.random() > 0.35 ? 'rgba(90, 125, 165, 0.55)' : 'rgba(56, 189, 248, 0.48)';
  }

  drawOilFlowAnimation(time) {
    if (!this.oilCanvas || !this.oilCanvasCtx || !this.activeSpillData) return;
    const ctx = this.oilCanvasCtx;
    ctx.clearRect(0, 0, this.oilCanvas.width, this.oilCanvas.height);

    if (!this.map.hasLayer(this.layers.spillLayer)) return;

    const data = this.activeSpillData;
    const centerPoint = this.map.latLngToContainerPoint([data.centroid.lat, data.centroid.lon]);

    // Nautical heading: 0° is North (-Y), 90° is East (+X)
    const flowDir = data.current_dir_deg || 52.0;
    const flowRad = (flowDir - 90) * (Math.PI / 180.0);
    const flowDx = Math.cos(flowRad);
    const flowDy = Math.sin(flowRad);
    const perpDx = -flowDy;
    const perpDy = flowDx;

    const zoom = this.map.getZoom();
    const scaleFactor = Math.pow(2, zoom - 11);

    // 1. Underlying Dark Heavy Oil Plume Envelope (Elongated deep slick body)
    ctx.save();
    const envelopeLen = 140 * scaleFactor;
    const halfWidth = 32 * scaleFactor;

    ctx.beginPath();
    ctx.moveTo(centerPoint.x - perpDx * (14 * scaleFactor), centerPoint.y - perpDy * (14 * scaleFactor));
    ctx.bezierCurveTo(
      centerPoint.x + flowDx * (envelopeLen * 0.38) - perpDx * halfWidth,
      centerPoint.y + flowDy * (envelopeLen * 0.38) - perpDy * halfWidth,
      centerPoint.x + flowDx * (envelopeLen * 0.78) - perpDx * (halfWidth * 0.75),
      centerPoint.y + flowDy * (envelopeLen * 0.78) - perpDy * (halfWidth * 0.75),
      centerPoint.x + flowDx * envelopeLen,
      centerPoint.y + flowDy * envelopeLen
    );
    ctx.bezierCurveTo(
      centerPoint.x + flowDx * (envelopeLen * 0.78) + perpDx * (halfWidth * 0.75),
      centerPoint.y + flowDy * (envelopeLen * 0.78) + perpDy * (halfWidth * 0.75),
      centerPoint.x + flowDx * (envelopeLen * 0.38) + perpDx * halfWidth,
      centerPoint.y + flowDy * (envelopeLen * 0.38) + perpDy * halfWidth,
      centerPoint.x + perpDx * (14 * scaleFactor),
      centerPoint.y + perpDy * (14 * scaleFactor)
    );
    ctx.closePath();

    const envGrad = ctx.createLinearGradient(
      centerPoint.x, centerPoint.y,
      centerPoint.x + flowDx * envelopeLen, centerPoint.y + flowDy * envelopeLen
    );
    envGrad.addColorStop(0, 'rgba(6, 9, 15, 0.95)');
    envGrad.addColorStop(0.5, 'rgba(10, 16, 26, 0.85)');
    envGrad.addColorStop(0.85, 'rgba(15, 24, 38, 0.55)');
    envGrad.addColorStop(1, 'rgba(15, 24, 38, 0.10)');

    ctx.fillStyle = envGrad;
    ctx.fill();
    ctx.restore();

    // 2. Small Size Bubbling Oil Plume Droplets / Bubbles
    const maxSmallBubbles = 48;
    if (this.oilParticles.length < maxSmallBubbles) {
      this.oilParticles.push(this.createOilParticle(scaleFactor));
    }

    ctx.save();
    for (let i = 0; i < this.oilParticles.length; i++) {
      const p = this.oilParticles[i];
      p.dist += p.speed * scaleFactor;
      p.phase += 0.032;

      const maxDist = (130 + (p.lateral % 24)) * scaleFactor;
      if (p.dist > maxDist) {
        this.resetOilParticle(p, scaleFactor);
        continue;
      }

      const progress = p.dist / maxDist;
      const wave = Math.sin(p.phase + time * 0.0025) * (5 * scaleFactor);
      const px = centerPoint.x + flowDx * p.dist + perpDx * (p.lateral * scaleFactor + wave);
      const py = centerPoint.y + flowDy * p.dist + perpDy * (p.lateral * scaleFactor + wave);

      const radius = Math.max(2.5, (p.baseRadius + progress * p.maxGrow) * scaleFactor);
      const alpha = p.alpha * Math.sin(progress * Math.PI * 0.88 + 0.12);

      // Radial gradient for 3D small spherical oil bubble
      const puffGrad = ctx.createRadialGradient(
        px - radius * 0.28, py - radius * 0.28, radius * 0.05,
        px, py, radius
      );
      puffGrad.addColorStop(0, `rgba(28, 40, 56, ${alpha})`);
      puffGrad.addColorStop(0.45, `rgba(12, 17, 26, ${alpha * 0.96})`);
      puffGrad.addColorStop(0.82, `rgba(5, 8, 14, ${alpha * 0.92})`);
      puffGrad.addColorStop(1, `rgba(38, 56, 78, 0)`);

      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = puffGrad;
      ctx.fill();

      // Subtle bubble rim highlight
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.strokeStyle = p.rimColor;
      ctx.lineWidth = Math.max(0.8, 1.0 * scaleFactor);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Tactical Water Flow Direction Arrow
    ctx.save();
    const arrowDist = 135 * scaleFactor;
    const ax = centerPoint.x + flowDx * arrowDist;
    const ay = centerPoint.y + flowDy * arrowDist;

    const speedKnots = (data.current_speed_knots || 0.8).toFixed(1);
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 3.5;
    const label = `WATER FLOW ${speedKnots} kts →`;
    ctx.strokeText(label, ax + 8, ay + 4);
    ctx.fillText(label, ax + 8, ay + 4);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(ax - flowDx * 12 - perpDx * 5, ay - flowDy * 12 - perpDy * 5);
    ctx.lineTo(ax, ay);
    ctx.lineTo(ax - flowDx * 12 + perpDx * 5, ay - flowDy * 12 + perpDy * 5);
    ctx.stroke();
    ctx.restore();
  }

  getDilatedPolygon(coords, centroid, scale) {
    return coords.map(([lat, lon]) => [
      centroid.lat + (lat - centroid.lat) * scale,
      centroid.lon + (lon - centroid.lon) * scale
    ]);
  }

  getFlowSidePlume(coords, centroid, flowDirDeg, flowStretch) {
    const rad = (flowDirDeg - 90) * (Math.PI / 180.0);
    const flowDx = Math.cos(rad);
    const flowDy = Math.sin(rad);

    return coords.map(([lat, lon]) => {
      const dLat = lat - centroid.lat;
      const dLon = lon - centroid.lon;
      const dot = (dLon * flowDx) + (dLat * (-flowDy));
      const stretch = dot > 0 ? (1 + (flowStretch - 1) * 1.6) : 1.05;

      return [
        centroid.lat + dLat * stretch,
        centroid.lon + dLon * stretch
      ];
    });
  }

  setScenario(scenarioData) {
    this.currentScenarioData = scenarioData;
    this.clearAllLayers();

    const centroid = scenarioData.spill.centroid;
    this.map.setView([centroid.lat, centroid.lon], 11);

    this.renderSpill(scenarioData.spill);
    this.renderBacktrack(scenarioData.backtrack_trajectory);
    this.renderVessels(scenarioData.all_vessels || scenarioData.ranked_candidates);
  }

  clearAllLayers() {
    this.layers.spillLayer.clearLayers();
    this.layers.bufferLayer.clearLayers();
    this.layers.backtrackLayer.clearLayers();
    this.layers.vesselTracksLayer.clearLayers();
    this.layers.vesselMarkersLayer.clearLayers();
    if (this.layers.sensitiveLayer) this.layers.sensitiveLayer.clearLayers();
    this.vesselMarkerMap.clear();
    this.activeSpillData = null;
    this.oilParticles = [];
    if (this.oilCanvasCtx && this.oilCanvas) {
      this.oilCanvasCtx.clearRect(0, 0, this.oilCanvas.width, this.oilCanvas.height);
    }
  }

  renderSensitiveAreas(sensitiveAreas) {
    if (!this.layers.sensitiveLayer) {
      this.layers.sensitiveLayer = L.layerGroup().addTo(this.map);
    }
    this.layers.sensitiveLayer.clearLayers();

    sensitiveAreas.forEach(area => {
      const circle = L.circle([area.center.lat, area.center.lon], {
        radius: area.radius_m || 4000,
        color: area.badge_color || '#e53e3e',
        weight: 2,
        dashArray: '4, 6',
        fillColor: area.badge_color || '#e53e3e',
        fillOpacity: 0.18
      }).bindPopup(`
        <div style="font-family: Inter, sans-serif; font-size: 12px;">
          <strong style="color: ${area.badge_color}; font-size: 13px;">${area.name}</strong><br/>
          <b>Threat Level:</b> ${area.risk_level}<br/>
          <b>Distance from Spill:</b> ${area.distance_km} km
        </div>
      `);
      this.layers.sensitiveLayer.addLayer(circle);

      const marker = L.circleMarker([area.center.lat, area.center.lon], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: area.badge_color || '#e53e3e',
        fillOpacity: 0.95
      }).bindPopup(`<b>${area.name}</b> (${area.risk_level})`);
      this.layers.sensitiveLayer.addLayer(marker);
    });
  }

  renderSpill(spill) {
    const coords = spill.polygon.map(pt => [pt[1], pt[0]]); // [lat, lon]

    const driftParams = this.currentScenarioData?.drift_parameters_used ||
                        this.currentScenarioData?.drift_params || {};
    const flowDirDeg = parseFloat(driftParams.current_dir_deg) || 52.0;
    const flowSpeedKnots = parseFloat(driftParams.current_speed_knots) || 0.8;

    // Set active spill data for the billowing circular plume canvas simulation
    this.activeSpillData = {
      centroid: spill.centroid,
      polygon: coords,
      current_dir_deg: flowDirDeg,
      current_speed_knots: flowSpeedKnots,
      area_km2: spill.area_km2 || 2.85
    };

    const eq = spill.equipment || {};

    // 1. Concentric Surveillance Range Rings (Matching user screenshot)
    // Outer dashed surveillance ring (~2.2 km)
    const outerRing = L.circle([spill.centroid.lat, spill.centroid.lon], {
      radius: 2200,
      color: '#38bdf8',
      weight: 1.8,
      dashArray: '8, 8',
      fill: false,
      opacity: 0.75,
      className: 'oil-spill-monitoring-buffer'
    }).bindPopup(`<b>Spill Monitoring Buffer Zone</b><br/>Search Radius: 2.2 km`);
    this.layers.bufferLayer.addLayer(outerRing);

    // Inner range ring (~1.2 km)
    const innerRing = L.circle([spill.centroid.lat, spill.centroid.lon], {
      radius: 1200,
      color: '#0284c7',
      weight: 1.5,
      fill: false,
      opacity: 0.65
    });
    this.layers.spillLayer.addLayer(innerRing);

    // 2. Base Heavy Crude Oil Slick Polygon (Dark tar/crude body)
    const slickPolygon = L.polygon(coords, {
      color: '#090d16',
      weight: 2,
      fillColor: '#070a10',
      fillOpacity: 0.88,
      className: 'oil-slick-plume-base'
    }).bindPopup(`
      <div style="font-family: Inter, sans-serif; font-size: 12px; color: #0f172a; min-width: 230px; line-height: 1.45;">
        <strong style="color: #0284c7; font-size: 13px;">ACTIVE OIL SPILL (HEAVY CRUDE)</strong><br/>
        <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #cbd5e1;">
          <b>Slick Area:</b> ${spill.area_km2} km²<br/>
          <b>Perimeter:</b> <span style="color: #0284c7; font-weight: 700;">${spill.perimeter_km || eq.perimeter_km || '9.21'} km</span><br/>
          <b>Avg Thickness:</b> <span style="color: #b45309; font-weight: 700;">${spill.thickness_mm || eq.thickness_mm || 0.25} mm (${eq.thickness_microns || 250} µm)</span><br/>
          <b>Total Spill Volume:</b> <span style="color: #ea580c; font-weight: 700;">${spill.volume_m3 || eq.volume_m3 || 712.5} m³ (${spill.volume_bbl || eq.volume_bbl || 4481} bbl)</span><br/>
        </div>
        <div style="margin-top: 4px; padding: 5px 8px; background: #f0f9ff; border-radius: 4px; border: 1px solid #bae6fd;">
          <strong style="color: #0369a1; font-size: 11px;">Clean-Up Fleet Requirements:</strong><br/>
          • <b>Skimmers:</b> ${eq.skimmers_needed || 2} High-Capacity Units<br/>
          • <b>Oil Storage Tankers:</b> ${eq.tankers_needed || 1} Vessel (${eq.total_fluid_emulsion_m3 || 962} m³ hold)<br/>
          • <b>Containment Booms:</b> ${eq.boom_length_km || 11.5} km curtain<br/>
          • <b>Observation Patrols:</b> ${eq.observation_vessels_needed || 2} Patrol Craft + ${eq.surveillance_drones_needed || 1} Drone
        </div>
        <div style="margin-top: 4px; font-size: 11px; color: #64748b;">
          <b>Sensor:</b> ${spill.sensor || 'Sentinel-1 SAR'}<br/>
          <b>Centroid:</b> ${spill.centroid.lat}° N, ${spill.centroid.lon}° E<br/>
          <b>Active Flow:</b> ${flowSpeedKnots.toFixed(1)} kts @ ${flowDirDeg.toFixed(0)}°
        </div>
      </div>
    `);
    this.layers.spillLayer.addLayer(slickPolygon);

    // 3. Central Release Origin Hollow Ring Marker 'O' (Matching exact screenshot)
    const centerOriginMarker = L.circleMarker([spill.centroid.lat, spill.centroid.lon], {
      radius: 8,
      color: '#ffffff',
      weight: 3,
      fillColor: '#070a10',
      fillOpacity: 0.90
    }).bindPopup(`<b>Discharge Locus / Centroid</b><br/>${spill.centroid.lat}° N, ${spill.centroid.lon}° E`);
    this.layers.spillLayer.addLayer(centerOriginMarker);
  }

  renderBacktrack(backtrackTrajectory) {
    if (!backtrackTrajectory || backtrackTrajectory.length < 2) return;

    const latlngs = backtrackTrajectory.map(pt => [pt.lat, pt.lon]);

    // Backtrack drift line
    const driftLine = L.polyline(latlngs, {
      color: '#0284c7',
      weight: 2,
      dashArray: '4, 6',
      opacity: 0.85
    }).bindPopup('<b>Hydrodynamic Slick Drift Path</b><br/>Backtracking origin under wind & surface current.');
    this.layers.backtrackLayer.addLayer(driftLine);

    // Estimated origin point (earliest backtrack point)
    const originPoint = backtrackTrajectory[backtrackTrajectory.length - 1];
    const originMarker = L.circleMarker([originPoint.lat, originPoint.lon], {
      radius: 6,
      color: '#0284c7',
      weight: 2,
      fillColor: '#38bdf8',
      fillOpacity: 0.9
    }).bindPopup(`<b>Suspected Release Origin</b><br/>Est. Time: ${originPoint.hours_before_detect}h before detection`);
    this.layers.backtrackLayer.addLayer(originMarker);
  }

  renderVessels(vesselsList) {
    // Distinct vibrant color palette for candidate vessels
    const colorMap = {
      '123456789': '#16a34a', // Vessel A: Vibrant Green
      '412893210': '#d97706', // Vessel B: Amber/Orange
      '636015482': '#8b5cf6', // Vessel C: Violet
      '538007192': '#0ea5e9', // Vessel D: Sky Blue
      '355912401': '#16a34a', // Mumbai Tanker
      '419001844': '#d97706'
    };

    const vessels = vesselsList || [];

    vessels.forEach((vessel, idx) => {
      const isTopSuspect = (vessel.rank === 1) || (idx === 0 && (!vessel.rank || vessel.rank === 1));
      const isCandidate = (vessel.rank && vessel.rank <= 4) || (idx < 4 && vessel.score > 20);
      const track = vessel.track || [];
      if (track.length < 2) return;

      const trackColor = colorMap[vessel.mmsi] || (isCandidate ? '#f59e0b' : '#38bdf8');
      const trackWeight = isTopSuspect ? 3.5 : (isCandidate ? 2.5 : 1.4);
      const trackOpacity = isTopSuspect ? 0.95 : (isCandidate ? 0.85 : 0.65);
      const isDashed = !isTopSuspect;

      const latlngs = track.map(p => [p.lat, p.lon]);

      // 1. Polyline trail
      const poly = L.polyline(latlngs, {
        color: trackColor,
        weight: trackWeight,
        opacity: trackOpacity,
        dashArray: isDashed ? (isCandidate ? '6, 6' : '4, 4') : null
      });

      poly.on('click', () => {
        if (window.onSelectVessel) window.onSelectVessel(vessel.mmsi);
      });

      this.layers.vesselTracksLayer.addLayer(poly);

      // 2. Ship marker at latest known position
      const latestPing = track[track.length - 1];
      const heading = latestPing.cog || 0;

      const iconBorderColor = isTopSuspect ? '#ef4444' : trackColor;
      const shipIcon = L.divIcon({
        className: 'vessel-map-icon-container',
        html: `
          <div class="ship-marker-wrapper" style="transform: rotate(${heading}deg);">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="${trackColor}" stroke="#ffffff" stroke-width="1.3">
              <path d="M12 2L4 20L12 17L20 20L12 2Z" />
            </svg>
          </div>
          <div class="vessel-label-floating" style="border-color: ${iconBorderColor};">${vessel.vessel_name}</div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([latestPing.lat, latestPing.lon], { icon: shipIcon });
      
      const statusBadge = (vessel.score && vessel.score > 20)
        ? `<span style="color:${trackColor}; font-weight:700;">Score: ${vessel.score}% (${vessel.likelihood})</span>`
        : `<span style="color:#0284c7; font-weight:600;">Corridor Transit (Non-Suspect)</span>`;

      marker.bindPopup(`
        <div style="font-family: Inter, sans-serif; font-size: 12px; min-width: 175px;">
          <b style="font-size: 13px; color: ${trackColor};">${vessel.vessel_name}</b> (${vessel.vessel_type})<br/>
          <b>MMSI:</b> ${vessel.mmsi}<br/>
          <b>Flag:</b> ${vessel.flag || 'Unknown'}<br/>
          <b>Distance to Spill:</b> ${vessel.cpa_km !== undefined ? vessel.cpa_km + ' km' : '—'}<br/>
          <b>Status:</b> ${statusBadge}<br/>
          <b>Speed:</b> ${latestPing.sog || vessel.avg_speed_knots || 12} knots<br/>
          <b>Heading:</b> ${heading}°
        </div>
      `);

      marker.on('click', () => {
        if (window.onSelectVessel) window.onSelectVessel(vessel.mmsi);
      });

      this.layers.vesselMarkersLayer.addLayer(marker);
      this.vesselMarkerMap.set(vessel.mmsi, marker);
    });
  }

  highlightVessel(mmsi) {
    this.selectedVesselMmsi = mmsi;
    const marker = this.vesselMarkerMap.get(mmsi);
    if (marker) {
      this.map.panTo(marker.getLatLng(), { animate: true, duration: 0.5 });
      marker.openPopup();
    }
  }

  updateTimePlayback(progressPercent) {
    if (!this.currentScenarioData) return;
    const vessels = this.currentScenarioData.all_vessels || this.currentScenarioData.ranked_candidates || [];

    vessels.forEach(vessel => {
      const track = vessel.track || [];
      if (track.length === 0) return;

      const idx = Math.min(track.length - 1, Math.floor((progressPercent / 100.0) * (track.length - 1)));
      const ping = track[idx];
      const marker = this.vesselMarkerMap.get(vessel.mmsi);
      if (marker && ping) {
        marker.setLatLng([ping.lat, ping.lon]);
        const heading = ping.cog || 0;
        const el = marker.getElement();
        if (el) {
          const arrow = el.querySelector('.ship-marker-wrapper');
          if (arrow) {
            arrow.style.transform = `rotate(${heading}deg)`;
          }
        }
      }
    });
  }

  toggleLayer(layerName, visible) {
    if (!this.layers[layerName]) return;
    if (visible) {
      this.map.addLayer(this.layers[layerName]);
      if (layerName === 'spillLayer' && this.oilCanvas) {
        this.oilCanvas.style.display = 'block';
      }
    } else {
      this.map.removeLayer(this.layers[layerName]);
      if (layerName === 'spillLayer' && this.oilCanvas) {
        this.oilCanvas.style.display = 'none';
      }
    }
  }

  setForecastStep(stepHours) {
    if (!this.currentScenarioData) return;
    
    // 1. Reset or clear spill layer
    this.layers.spillLayer.clearLayers();
    this.layers.bufferLayer.clearLayers();

    if (stepHours === 0) {
      // "NOW" - Render original detected spill
      this.renderSpill(this.currentScenarioData.spill);
      this.updateTimePlayback(100);
      return;
    }

    // Forward forecast step (+6h, +12h, +24h, +48h, +72h)
    const forecasts = this.currentScenarioData.forecasts || [];
    const fc = forecasts.find(f => f.hours === stepHours);
    if (!fc) return;

    const coords = fc.polygon.map(pt => [pt[1], pt[0]]);
    const initialCentroid = this.currentScenarioData.spill.centroid;

    // Update active spill data so canvas flow animation tracks forecast centroid
    const fcFlowDir = parseFloat(fc.drift_heading_deg) || 52.0;
    this.activeSpillData = {
      centroid: fc.centroid,
      polygon: coords,
      current_dir_deg: fcFlowDir,
      current_speed_knots: parseFloat(this.currentScenarioData?.drift_params?.current_speed_knots) || 1.1,
      area_km2: fc.area_km2
    };

    // Forward drift path line
    const driftPathLine = L.polyline([[initialCentroid.lat, initialCentroid.lon], [fc.centroid.lat, fc.centroid.lon]], {
      color: '#00d2ff',
      weight: 2.5,
      dashArray: '6, 6',
      opacity: 0.9
    }).bindPopup(`<b>Forward Hydrodynamic Drift Path</b><br/>Projected shift: ${fc.drift_dist_km} km over ${fc.hours} hours.`);
    this.layers.spillLayer.addLayer(driftPathLine);

    // Buffer zone around forecast centroid
    const bufferCircle = L.circle([fc.centroid.lat, fc.centroid.lon], {
      radius: 2200 + stepHours * 50,
      color: '#38bdf8',
      dashArray: '5, 8',
      weight: 1.5,
      fillColor: '#0f172a',
      fillOpacity: 0.08,
      className: 'oil-spill-monitoring-buffer'
    });
    this.layers.bufferLayer.addLayer(bufferCircle);

    // Forecast Slick Polygon (Heavy Crude Oil Drift & Spreading)
    const slickPolygon = L.polygon(coords, {
      color: '#334155',
      weight: 2.2,
      fillColor: '#07080a',
      fillOpacity: 0.88,
      dashArray: '5, 5',
      className: 'oil-slick-black-core'
    }).bindPopup(`
      <div style="font-family: Inter, sans-serif; font-size: 12px; color: #0f172a; min-width: 220px; line-height: 1.45;">
        <strong style="color: #0f172a; font-size: 13px;">FORECAST (+${fc.hours}H) DRIFT & SPREADING</strong><br/>
        <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #cbd5e1;">
          <b>Projected Area:</b> ${fc.area_km2} km²<br/>
          <b>Perimeter:</b> <span style="color: #0284c7; font-weight: 700;">${fc.perimeter_km || 'N/A'} km</span><br/>
          <b>Thickness:</b> <span style="color: #b45309; font-weight: 700;">${fc.thickness_mm || '0.25'} mm</span><br/>
          <b>Projected Volume:</b> <span style="color: #ea580c; font-weight: 700;">${fc.volume_m3 || 'N/A'} m³ (${fc.volume_bbl || 'N/A'} bbl)</span><br/>
          <b>Drift Distance:</b> ${fc.drift_dist_km} km @ ${fc.drift_heading_deg}°<br/>
        </div>
        <div style="margin-top: 4px; padding: 4px 6px; background: #f0f9ff; border-radius: 4px; border: 1px solid #bae6fd;">
          <strong style="color: #0369a1; font-size: 11px;">Projected Equipment Need:</strong><br/>
          • <b>Skimmers:</b> ${fc.skimmers_needed || 2} Units<br/>
          • <b>Storage Tankers:</b> ${fc.tankers_needed || 1} Vessel<br/>
          • <b>Containment Booms:</b> ${fc.boom_length_km || '11.5'} km
        </div>
        <div style="margin-top: 4px; font-size: 11px; color: #64748b;">
          <b>Centroid:</b> ${fc.centroid.lat}° N, ${fc.centroid.lon}° E<br/>
          <b>Estimated Time:</b> ${fc.time_display}
        </div>
      </div>
    `);
    this.layers.spillLayer.addLayer(slickPolygon);

    // Forecast Centroid marker
    const centroidMarker = L.circleMarker([fc.centroid.lat, fc.centroid.lon], {
      radius: 6,
      color: '#38bdf8',
      weight: 2.5,
      fillColor: '#07080a',
      fillOpacity: 1
    }).bindPopup(`<b>Forecast Centroid (+${fc.hours}H)</b><br/>${fc.centroid.lat}° N, ${fc.centroid.lon}° E`);
    this.layers.spillLayer.addLayer(centroidMarker);

    // Extrapolate vessel positions forward along speed/heading
    const candidates = this.currentScenarioData.ranked_candidates || [];
    candidates.forEach(vessel => {
      const track = vessel.track || [];
      if (track.length === 0) return;
      const lastPing = track[track.length - 1];
      const marker = this.vesselMarkerMap.get(vessel.mmsi);
      if (!marker || !lastPing) return;

      const speedKnots = lastPing.sog || vessel.avg_speed_knots || 12.0;
      const headingDeg = lastPing.cog || 0.0;
      const headingRad = headingDeg * (Math.PI / 180.0);
      const distKm = speedKnots * 1.852 * stepHours;

      const kmPerDegLat = 111.32;
      const kmPerDegLon = 111.32 * Math.cos(lastPing.lat * (Math.PI / 180.0));

      const fLat = lastPing.lat + (distKm * Math.cos(headingRad)) / kmPerDegLat;
      const fLon = lastPing.lon + (distKm * Math.sin(headingRad)) / kmPerDegLon;

      marker.setLatLng([fLat, fLon]);
    });
  }
}
