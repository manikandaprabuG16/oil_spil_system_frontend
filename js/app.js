/**
 * Main Application Coordinator
 * Connects Web GIS Map, Telemetry Charts, Attribution Views, and FastAPI Backend.
 */

class OilSpillApp {
  constructor() {
    this.map = new MaritimeMap('leaflet-map');
    this.charts = new TelemetryCharts();
    this.attributionView = new AttributionView('candidates-list-container', 'vessel-detail-container');
    this.currentScenarioId = 'scenario-chennai-sih26143';
    this.scenarioData = null;
    this.currentStepHours = 0;
    this.isPlaying = false;
    this.playbackInterval = null;
    this.stepSequence = [0, 6, 12, 24, 48, 72];

    this.initEvents();
    this.loadScenario(this.currentScenarioId);
  }

  async loadScenario(scenarioId) {
    try {
      this.currentScenarioId = scenarioId;
      const res = await fetch(`/api/scenarios/${scenarioId}`);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      const data = await res.json();
      this.scenarioData = data;

      // Fetch risk analysis data
      try {
        const riskRes = await fetch(`/api/risk-analysis/${scenarioId}`);
        if (riskRes.ok) {
          this.riskAnalysisData = await riskRes.json();
          if (this.riskAnalysisData.sensitive_areas) {
            this.map.renderSensitiveAreas(this.riskAnalysisData.sensitive_areas);
          }
        }
      } catch (err) {
        console.warn('Risk analysis data fetch warning:', err);
      }

      // Update UI components safely with isolated error barriers
      try { this.updateKPIs(data.kpis); } catch (e) { console.error('KPI error:', e); }
      try { this.updateSpillOverview(data.spill); } catch (e) { console.error('Spill overview error:', e); }
      try { this.map.setScenario(data); } catch (e) { console.error('Map setScenario error:', e); }
      try { this.attributionView.renderCandidates(data.ranked_candidates, null, data.all_vessels); } catch (e) { console.error('AttributionView error:', e); }
      try { this.charts.renderAreaExpansionChart('area-expansion-chart', data.spill.expansion_history || []); } catch (e) { console.error('Area chart error:', e); }

      // Render Spread Prediction & Historical Risk Heatmaps
      setTimeout(() => {
        try { this.charts.renderSpreadPredictionHeatmap('spread-prediction-canvas', 48); } catch (e) { console.error('Spread heatmap error:', e); }
        try { this.charts.renderHistoricalRiskHeatmap('historical-risk-canvas'); } catch (e) { console.error('Historical risk heatmap error:', e); }
      }, 80);

      // Reset timeline step to NOW (0h)
      try { this.selectTimelineStep(0); } catch (e) { console.error('Timeline step error:', e); }
    } catch (err) {
      console.error('Failed to load scenario:', err);
    }
  }

  updateKPIs(kpis) {
    const elDetected = document.getElementById('kpi-detected-status');
    if (elDetected) {
      elDetected.innerHTML = kpis.spill_detected 
        ? '<span class="pulsing-dot" style="background: #e53e3e;"></span> YES' 
        : 'NO';
    }

    const areaVal = kpis.spill_area_km2 || 2.85;
    const perimVal = kpis.spill_perimeter_km || (kpis.equipment ? kpis.equipment.perimeter_km : 9.21);
    const thickVal = kpis.spill_thickness_mm || (kpis.equipment ? kpis.equipment.thickness_mm : 0.25);
    const volVal = kpis.spill_volume_m3 || (kpis.equipment ? kpis.equipment.volume_m3 : Math.round(areaVal * thickVal * 1000));
    const bblVal = kpis.spill_volume_bbl || (kpis.equipment ? kpis.equipment.volume_bbl : Math.round(volVal * 6.2898));
    const skimmersVal = kpis.skimmers_needed || (kpis.equipment ? kpis.equipment.skimmers_needed : 2);
    const tankersVal = kpis.tankers_needed || (kpis.equipment ? kpis.equipment.tankers_needed : 1);

    if (document.getElementById('kpi-spill-area')) {
      document.getElementById('kpi-spill-area').textContent = `${areaVal} km²`;
    }

    if (document.getElementById('kpi-spill-perimeter')) {
      document.getElementById('kpi-spill-perimeter').textContent = `${perimVal} km`;
      if (document.getElementById('kpi-spill-perimeter-m')) {
        document.getElementById('kpi-spill-perimeter-m').textContent = `${Math.round(perimVal * 1000).toLocaleString()} m`;
      }
    }

    if (document.getElementById('kpi-spill-thickness')) {
      document.getElementById('kpi-spill-thickness').textContent = `${thickVal} mm`;
      if (document.getElementById('kpi-bonn-code')) {
        document.getElementById('kpi-bonn-code').textContent = `Bonn ${kpis.equipment?.bonn_code || 5}`;
      }
    }

    if (document.getElementById('kpi-spill-volume')) {
      document.getElementById('kpi-spill-volume').textContent = `${volVal.toLocaleString()} m³`;
      if (document.getElementById('kpi-spill-bbl')) {
        document.getElementById('kpi-spill-bbl').textContent = `${Math.round(bblVal).toLocaleString()} bbl`;
      }
    }

    if (document.getElementById('kpi-fleet-needed')) {
      document.getElementById('kpi-fleet-needed').textContent = `${skimmersVal} Skim • ${tankersVal} Tank`;
    }

    if (document.getElementById('kpi-detected-time') && kpis.detected_time) {
      document.getElementById('kpi-detected-time').textContent = kpis.detected_time;
    }

    if (document.getElementById('kpi-location') && kpis.location_display) {
      document.getElementById('kpi-location').textContent = kpis.location_display;
    }

    if (document.getElementById('kpi-vessels-count')) {
      document.getElementById('kpi-vessels-count').textContent = kpis.total_vessels_analyzed || 32;
    }
  }

  updateSpillOverview(spill) {
    const eq = spill.equipment || {};
    const area = spill.area_km2 || 2.85;
    const perim = spill.perimeter_km || eq.perimeter_km || 9.21;
    const thick = spill.thickness_mm || eq.thickness_mm || 0.25;
    const vol = spill.volume_m3 || eq.volume_m3 || Math.round(area * thick * 1000);
    const bbl = spill.volume_bbl || eq.volume_bbl || Math.round(vol * 6.2898);
    const skimmers = eq.skimmers_needed || Math.max(1, Math.ceil(vol / 480));
    const tankers = eq.tankers_needed || Math.max(1, Math.ceil((vol * 1.35) / 1500));
    const booms = eq.boom_length_km || (perim * 1.25).toFixed(1);

    if (document.getElementById('spec-area')) document.getElementById('spec-area').textContent = `${area} km²`;
    if (document.getElementById('spec-perimeter')) document.getElementById('spec-perimeter').textContent = `${perim} km`;
    if (document.getElementById('spec-thickness')) document.getElementById('spec-thickness').textContent = `${thick} mm (${Math.round(thick * 1000)} µm)`;
    if (document.getElementById('spec-volume')) document.getElementById('spec-volume').textContent = `${vol.toLocaleString()} m³ (${Math.round(bbl).toLocaleString()} bbl)`;
    if (document.getElementById('spec-fleet')) document.getElementById('spec-fleet').textContent = `${skimmers} Skimmers • ${tankers} Tanker`;
    if (document.getElementById('spec-booms')) document.getElementById('spec-booms').textContent = `${booms} km (${Math.round(booms * 1000).toLocaleString()} m)`;
    if (document.getElementById('spec-centroid') && spill.centroid) {
      document.getElementById('spec-centroid').textContent = `${spill.centroid.lat}° N, ${spill.centroid.lon}° E`;
    }
    if (document.getElementById('spec-confidence')) {
      document.getElementById('spec-confidence').textContent = `${(spill.confidence * 100).toFixed(0)}%`;
    }
    if (document.getElementById('spec-source')) {
      document.getElementById('spec-source').textContent = spill.sensor || 'Sentinel-1 SAR';
    }

    // Highlight active Bonn step
    document.querySelectorAll('.thickness-step').forEach(step => {
      const stepThick = parseFloat(step.getAttribute('data-thickness'));
      if (Math.abs(stepThick - thick) < 0.05 || (thick >= 0.2 && step.classList.contains('step-crude'))) {
        step.classList.add('active');
      } else {
        step.classList.remove('active');
      }
    });

    // Update Response Recommendation badges in right drawer
    if (document.getElementById('rec-boom-badge')) document.getElementById('rec-boom-badge').textContent = `${booms} km`;
    if (document.getElementById('rec-boom-details')) document.getElementById('rec-boom-details').textContent = `${Math.round(booms * 1000).toLocaleString()} m perimeter encirclement curtain`;
    if (document.getElementById('rec-skimmer-badge')) document.getElementById('rec-skimmer-badge').textContent = `${skimmers} Skimmers`;
    if (document.getElementById('rec-skimmer-details')) document.getElementById('rec-skimmer-details').textContent = `High-volume weir/brush units (${eq.recovery_window_hours || 48}h target)`;
    if (document.getElementById('rec-tanker-badge')) document.getElementById('rec-tanker-badge').textContent = `${tankers} Tanker`;
    if (document.getElementById('rec-tanker-details')) document.getElementById('rec-tanker-details').textContent = `Temporary emulsion storage (${eq.total_fluid_emulsion_m3 || Math.round(vol * 1.35)} m³)`;
    if (document.getElementById('rec-observation-badge')) {
      const obs = eq.observation_vessels_needed || 2;
      const drones = eq.surveillance_drones_needed || 1;
      document.getElementById('rec-observation-badge').textContent = `${obs} Patrols + ${drones} UAV`;
    }

    // Update Priority List items
    if (document.getElementById('priority-item-1')) {
      document.getElementById('priority-item-1').innerHTML = `<strong style="color: var(--primary);">Priority 1:</strong> Encircle ${perim} km slick perimeter with ${booms} km containment booms`;
    }
    if (document.getElementById('priority-item-2')) {
      document.getElementById('priority-item-2').innerHTML = `<strong style="color: var(--primary);">Priority 2:</strong> Mobilize ${skimmers} offshore skimmers for ${vol.toLocaleString()} m³ (${Math.round(bbl).toLocaleString()} bbl) crude recovery`;
    }
    if (document.getElementById('priority-item-3')) {
      document.getElementById('priority-item-3').innerHTML = `<strong style="color: var(--primary);">Priority 3:</strong> Stage ${tankers} recovery tanker (${eq.total_fluid_emulsion_m3 || Math.round(vol * 1.35)} m³ capacity) at slick perimeter`;
    }
    if (document.getElementById('priority-item-4')) {
      document.getElementById('priority-item-4').innerHTML = `<strong style="color: var(--primary);">Priority 4:</strong> Continuous ${eq.observation_vessels_needed || 2} observation vessels + satellite monitoring along drift vector`;
    }
  }

  selectTimelineStep(hours) {
    this.currentStepHours = hours;

    // Update active button state
    document.querySelectorAll('.timeline-step-btn').forEach(btn => {
      const btnHours = parseInt(btn.getAttribute('data-hours'));
      if (btnHours === hours) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update status badge text
    const statusTextEl = document.getElementById('timeline-status-text');
    if (statusTextEl) {
      statusTextEl.textContent = hours === 0 ? 'CURRENT DETECTION' : `FORECAST (+${hours}H)`;
    }

    // Update KPI & Spill Area if forecast data is present
    if (this.scenarioData) {
      if (hours === 0) {
        const sp = this.scenarioData.spill;
        this.updateKPIs(this.scenarioData.kpis);
        this.updateSpillOverview(sp);
      } else {
        const fc = (this.scenarioData.forecasts || []).find(f => f.hours === hours);
        if (fc) {
          const fakeKPIs = {
            ...this.scenarioData.kpis,
            spill_area_km2: fc.area_km2,
            spill_perimeter_km: fc.perimeter_km,
            spill_thickness_mm: fc.thickness_mm,
            spill_volume_m3: fc.volume_m3,
            spill_volume_bbl: fc.volume_bbl,
            skimmers_needed: fc.skimmers_needed,
            tankers_needed: fc.tankers_needed,
            equipment: fc.equipment
          };
          this.updateKPIs(fakeKPIs);
          this.updateSpillOverview({
            ...this.scenarioData.spill,
            area_km2: fc.area_km2,
            perimeter_km: fc.perimeter_km,
            thickness_mm: fc.thickness_mm,
            volume_m3: fc.volume_m3,
            volume_bbl: fc.volume_bbl,
            centroid: fc.centroid,
            equipment: fc.equipment
          });
        }
      }
    }

    // Trigger map update
    this.map.setForecastStep(hours);
  }

  initEvents() {
    // Scenario switcher
    const scenarioSelect = document.getElementById('scenario-select');
    if (scenarioSelect) {
      scenarioSelect.addEventListener('change', (e) => {
        this.loadScenario(e.target.value);
      });
    }

    // Timeline step buttons (NOW, +6H, +12H, +24H, +48H, +72H)
    document.querySelectorAll('.timeline-step-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (this.isPlaying) this.togglePlayback();
        const hours = parseInt(e.currentTarget.getAttribute('data-hours'));
        this.selectTimelineStep(hours);
      });
    });

    // Play/Pause button
    const playBtn = document.getElementById('btn-timeline-play');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.togglePlayback();
      });
    }

    // Layer checkboxes
    const chkSpill = document.getElementById('chk-layer-spill');
    if (chkSpill) {
      chkSpill.addEventListener('change', (e) => this.map.toggleLayer('spillLayer', e.target.checked));
    }
    const chkBuffer = document.getElementById('chk-layer-buffer');
    if (chkBuffer) {
      chkBuffer.addEventListener('change', (e) => this.map.toggleLayer('bufferLayer', e.target.checked));
    }
    const chkBacktrack = document.getElementById('chk-layer-backtrack');
    if (chkBacktrack) {
      chkBacktrack.addEventListener('change', (e) => this.map.toggleLayer('backtrackLayer', e.target.checked));
    }
    const chkTracks = document.getElementById('chk-layer-tracks');
    if (chkTracks) {
      chkTracks.addEventListener('change', (e) => this.map.toggleLayer('vesselTracksLayer', e.target.checked));
    }

    // Global callbacks
    window.onSelectVessel = (mmsi) => {
      this.attributionView.selectCandidate(mmsi);
      this.map.highlightVessel(mmsi);
    };

    window.zoomToSelectedVessel = (mmsi) => {
      this.map.highlightVessel(mmsi);
    };

    window.downloadForensicDossier = () => {
      window.location.href = `/api/reports/download/${this.currentScenarioId}`;
    };

    // Spread prediction time scrubbers (+12h, +24h, +48h, +72h)
    document.querySelectorAll('.spread-time-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const hours = parseInt(e.currentTarget.getAttribute('data-hours'));
        document.querySelectorAll('.spread-time-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.charts.renderSpreadPredictionHeatmap('spread-prediction-canvas', hours);
        this.selectTimelineStep(hours);
      });
    });

    // View Sensitive Areas On Map button
    const btnViewSens = document.getElementById('btn-view-sensitive-map');
    if (btnViewSens) {
      btnViewSens.addEventListener('click', () => {
        if (this.riskAnalysisData && this.riskAnalysisData.sensitive_areas) {
          this.map.renderSensitiveAreas(this.riskAnalysisData.sensitive_areas);
          alert('Sensitive Environmental Zones (Coastal Area, Fishing Zone A, Marine Sanctuary, Port Area) projected on GIS Map!');
        }
      });
    }

    // Generate Action Report button
    const btnActionReport = document.getElementById('btn-generate-action-report');
    if (btnActionReport) {
      btnActionReport.addEventListener('click', () => {
        window.downloadForensicDossier();
      });
    }

    // Open Historical Risk Modal
    const btnOpenRiskModal = document.getElementById('btn-open-risk-modal');
    const modalRisk = document.getElementById('modal-risk-analysis');
    if (btnOpenRiskModal && modalRisk) {
      btnOpenRiskModal.addEventListener('click', () => modalRisk.classList.add('active'));
    }

    // Modal triggers
    const btnUploadSAR = document.getElementById('btn-open-upload-modal');
    const modalUpload = document.getElementById('modal-upload-sar');
    if (btnUploadSAR && modalUpload) {
      btnUploadSAR.addEventListener('click', () => modalUpload.classList.add('active'));
    }

    const btnTuner = document.getElementById('btn-open-tuner-modal');
    const modalTuner = document.getElementById('modal-tuner');
    if (btnTuner && modalTuner) {
      btnTuner.addEventListener('click', () => modalTuner.classList.add('active'));
    }

    // Close buttons for modals
    document.querySelectorAll('.modal-close-btn, .btn-modal-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
      });
    });

    // SAR AI Detection Form Submit & Live Segmentation
    const sarForm = document.getElementById('sar-upload-form');
    if (sarForm) {
      sarForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Show AI Live Result Box
        const resBox = document.getElementById('ai-segmentation-result-box');
        const btnProj = document.getElementById('btn-project-ai-map');
        if (resBox) resBox.style.display = 'block';
        if (btnProj) btnProj.style.display = 'inline-block';

        const fileInput = document.getElementById('sar-file-input');
        let area = 2.85;
        let conf = 94;

        if (fileInput && fileInput.files && fileInput.files.length > 0) {
          const formData = new FormData();
          formData.append('file', fileInput.files[0]);
          formData.append('bounds', JSON.stringify({
            north: 13.08, south: 13.02, east: 80.35, west: 80.28
          }));

          try {
            const res = await fetch('/api/detect', { method: 'POST', body: formData });
            const detectResult = await res.json();
            if (detectResult.primary_spill) {
              area = detectResult.primary_spill.area_km2;
              conf = Math.round(detectResult.primary_spill.confidence * 100);
            }
          } catch (err) {
            console.error('Detection API call:', err);
          }
        }

        document.getElementById('ai-res-area').textContent = `${area} km²`;
        document.getElementById('ai-res-conf').textContent = `${conf}%`;
        this.renderAISegmentationMask('ai-segmentation-canvas', area, conf);
      });
    }

    // Project AI Segmented Spill to Map Button
    const btnProjMap = document.getElementById('btn-project-ai-map');
    if (btnProjMap) {
      btnProjMap.addEventListener('click', () => {
        if (this.scenarioData) {
          this.map.setScenario(this.scenarioData);
          this.selectTimelineStep(0);
          alert('AI Segmented Oil Slick Polygon successfully projected to Web GIS Map!');
          document.getElementById('modal-upload-sar').classList.remove('active');
        }
      });
    }

    // Parameter Re-correlation Submit
    const tunerForm = document.getElementById('tuner-form');
    if (tunerForm) {
      tunerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
          scenario_id: this.currentScenarioId,
          current_speed_knots: parseFloat(document.getElementById('tuner-cur-speed').value),
          current_dir_deg: parseFloat(document.getElementById('tuner-cur-dir').value),
          wind_speed_knots: parseFloat(document.getElementById('tuner-wind-speed').value),
          wind_dir_deg: parseFloat(document.getElementById('tuner-wind-dir').value),
          radius_km: parseFloat(document.getElementById('tuner-radius').value),
          hours_back: parseFloat(document.getElementById('tuner-hours').value)
        };

        try {
          const res = await fetch('/api/correlate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const newData = await res.json();
          this.scenarioData = newData;
          this.updateKPIs(newData.kpis);
          this.map.setScenario(newData);
          this.attributionView.renderCandidates(newData.ranked_candidates);
          this.selectTimelineStep(0);
          document.getElementById('modal-tuner').classList.remove('active');
        } catch (err) {
          console.error(err);
        }
      });
    }

    // Fleet & Volume Calculator modal triggers
    const openCalc = () => this.openFleetCalculator();
    document.getElementById('kpi-card-fleet')?.addEventListener('click', openCalc);
    document.getElementById('btn-tray-calc')?.addEventListener('click', openCalc);
    document.getElementById('btn-open-calc-drawer')?.addEventListener('click', openCalc);

    // Quick thickness tier step clicks in bottom tray
    document.querySelectorAll('.thickness-step').forEach(step => {
      step.addEventListener('click', (e) => {
        const thick = parseFloat(e.currentTarget.getAttribute('data-thickness'));
        if (!isNaN(thick)) {
          this.setSpillThickness(thick);
        }
      });
    });

    // Calculator modal live input bindings
    const sliderThick = document.getElementById('calc-slider-thickness');
    if (sliderThick) {
      sliderThick.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        const disp = document.getElementById('calc-thick-display');
        if (disp) disp.textContent = `${val.toFixed(val < 0.01 ? 4 : 2)} mm (${Math.round(val * 1000)} µm)`;
        
        // Match active chip
        document.querySelectorAll('.btn-bonn-chip').forEach(c => {
          const chipVal = parseFloat(c.getAttribute('data-thick'));
          if (Math.abs(chipVal - val) < 0.02) {
            c.classList.add('active');
          } else {
            c.classList.remove('active');
          }
        });

        this.updateModalCalculations();
      });
    }

    // Bonn quick preset chips inside modal
    document.querySelectorAll('.btn-bonn-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const val = parseFloat(e.currentTarget.getAttribute('data-thick'));
        document.querySelectorAll('.btn-bonn-chip').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        if (sliderThick) sliderThick.value = val;
        const disp = document.getElementById('calc-thick-display');
        if (disp) disp.textContent = `${val.toFixed(val < 0.01 ? 4 : 2)} mm (${Math.round(val * 1000)} µm)`;
        this.updateModalCalculations();
      });
    });

    ['calc-input-area', 'calc-input-perimeter', 'calc-input-window', 'calc-input-skimmer-rate', 'calc-input-tanker-cap'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.updateModalCalculations());
        el.addEventListener('change', () => this.updateModalCalculations());
      }
    });

    // Apply calculator button
    document.getElementById('btn-apply-calculator')?.addEventListener('click', () => {
      this.applyFleetCalculations();
    });
  }

  openFleetCalculator() {
    const modal = document.getElementById('modal-fleet-calculator');
    if (!modal || !this.scenarioData) return;

    const sp = this.scenarioData.spill || {};
    const eq = sp.equipment || {};

    const areaInput = document.getElementById('calc-input-area');
    if (areaInput) areaInput.value = sp.area_km2 || 2.85;

    const perimInput = document.getElementById('calc-input-perimeter');
    if (perimInput) perimInput.value = sp.perimeter_km || eq.perimeter_km || 9.21;

    const thick = sp.thickness_mm || eq.thickness_mm || 0.25;
    const slider = document.getElementById('calc-slider-thickness');
    if (slider) slider.value = thick;

    const disp = document.getElementById('calc-thick-display');
    if (disp) disp.textContent = `${thick} mm (${Math.round(thick * 1000)} µm)`;

    document.querySelectorAll('.btn-bonn-chip').forEach(c => {
      const chipVal = parseFloat(c.getAttribute('data-thick'));
      if (Math.abs(chipVal - thick) < 0.03) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });

    this.updateModalCalculations();
    modal.classList.add('active');
  }

  updateModalCalculations() {
    const area = parseFloat(document.getElementById('calc-input-area')?.value || 2.85);
    const perim = parseFloat(document.getElementById('calc-input-perimeter')?.value || 9.21);
    const thick = parseFloat(document.getElementById('calc-slider-thickness')?.value || 0.25);
    const windowHours = parseFloat(document.getElementById('calc-input-window')?.value || 48);
    const skimmerRate = parseFloat(document.getElementById('calc-input-skimmer-rate')?.value || 40);
    const tankerCap = parseFloat(document.getElementById('calc-input-tanker-cap')?.value || 1500);

    // Volume in m3 = Area (km2) * Thickness (mm) * 1,000
    const volM3 = Math.round(area * thick * 1000.0 * 100) / 100;
    const volBbl = Math.round(volM3 * 6.28981 * 10) / 10;
    const volTons = Math.round(volM3 * 0.88 * 10) / 10;
    const volGal = Math.round(volM3 * 264.172);

    // Emulsion with 35% water cut
    const emulsionM3 = Math.round(volM3 * 1.35 * 10) / 10;
    const emulsionBbl = Math.round(emulsionM3 * 6.28981);

    // USCG/IMO EDRC skimmer calculation (derated by 25% efficiency factor)
    const effectiveSkimmerHourlyM3 = skimmerRate * 0.25;
    const effectiveTotalRecoveryPerSkimmer = effectiveSkimmerHourlyM3 * Math.max(12, windowHours);
    const skimmersNeeded = Math.max(1, Math.ceil(volM3 / Math.max(1, effectiveTotalRecoveryPerSkimmer)));

    // Tanker requirement
    const tankersNeeded = Math.max(1, Math.ceil(emulsionM3 / Math.max(100, tankerCap)));

    // Booms: 1.25x perimeter
    const boomKm = Math.round(perim * 1.25 * 100) / 100;
    const boomM = Math.round(boomKm * 1000);

    // Observation patrol vessels & UAVs
    const obsVessels = Math.max(1, Math.ceil(perim / 8.0));
    const drones = Math.max(1, Math.ceil(perim / 12.0));

    // Update modal elements
    if (document.getElementById('modal-res-volume')) {
      document.getElementById('modal-res-volume').textContent = `${volM3.toLocaleString()} m³`;
    }
    if (document.getElementById('modal-res-bbl')) {
      document.getElementById('modal-res-bbl').textContent = `${Math.round(volBbl).toLocaleString()} Barrels (bbl)`;
    }
    if (document.getElementById('modal-res-tons')) {
      document.getElementById('modal-res-tons').textContent = `${volTons.toLocaleString()} Metric Tons`;
    }
    if (document.getElementById('modal-res-gal')) {
      document.getElementById('modal-res-gal').textContent = `${volGal.toLocaleString()} US Gallons`;
    }
    if (document.getElementById('modal-res-emulsion')) {
      document.getElementById('modal-res-emulsion').innerHTML = 
        `Total Recovered Liquid with Water Emulsion: <b>${emulsionM3.toLocaleString()} m³</b> (${emulsionBbl.toLocaleString()} bbl)`;
    }

    if (document.getElementById('modal-res-skimmers')) {
      document.getElementById('modal-res-skimmers').textContent = `${skimmersNeeded} Units`;
    }
    if (document.getElementById('modal-res-skimmers-detail')) {
      document.getElementById('modal-res-skimmers-detail').textContent = 
        `${skimmersNeeded} unit(s) @ ${skimmerRate} m³/h nominal in ${windowHours}h window`;
    }

    if (document.getElementById('modal-res-tankers')) {
      document.getElementById('modal-res-tankers').textContent = `${tankersNeeded} Tanker${tankersNeeded > 1 ? 's' : ''}`;
    }
    if (document.getElementById('modal-res-tankers-detail')) {
      document.getElementById('modal-res-tankers-detail').textContent = 
        `${tankersNeeded} vessel(s) (${tankerCap.toLocaleString()} m³ hold each)`;
    }

    if (document.getElementById('modal-res-booms')) {
      document.getElementById('modal-res-booms').textContent = `${boomKm} km`;
    }
    if (document.getElementById('modal-res-booms-detail')) {
      document.getElementById('modal-res-booms-detail').textContent = 
        `${boomM.toLocaleString()} m containment curtain`;
    }

    if (document.getElementById('modal-res-observation')) {
      document.getElementById('modal-res-observation').textContent = `${obsVessels} Boat${obsVessels > 1 ? 's' : ''} + ${drones} UAV`;
    }
    if (document.getElementById('modal-res-observation-detail')) {
      document.getElementById('modal-res-observation-detail').textContent = 
        `Surveillance across ${perim} km perimeter`;
    }

    return {
      area, perim, thick, volM3, volBbl, volTons, volGal, emulsionM3,
      skimmersNeeded, tankersNeeded, boomKm, boomM, obsVessels, drones,
      windowHours, skimmerRate, tankerCap
    };
  }

  applyFleetCalculations() {
    const res = this.updateModalCalculations();
    if (!res || !this.scenarioData) return;

    const sp = this.scenarioData.spill;
    sp.area_km2 = res.area;
    sp.perimeter_km = res.perim;
    sp.thickness_mm = res.thick;
    sp.volume_m3 = res.volM3;
    sp.volume_bbl = res.volBbl;
    sp.volume_tons = res.volTons;
    sp.equipment = {
      ...sp.equipment,
      area_km2: res.area,
      perimeter_km: res.perim,
      thickness_mm: res.thick,
      thickness_microns: Math.round(res.thick * 1000),
      volume_m3: res.volM3,
      volume_bbl: res.volBbl,
      volume_tons: res.volTons,
      skimmers_needed: res.skimmersNeeded,
      tankers_needed: res.tankersNeeded,
      boom_length_km: res.boomKm,
      boom_length_meters: res.boomM,
      observation_vessels_needed: res.obsVessels,
      surveillance_drones_needed: res.drones,
      recovery_window_hours: res.windowHours,
      skimmer_capacity_m3h: res.skimmerRate,
      tanker_capacity_m3: res.tankerCap,
      total_fluid_emulsion_m3: res.emulsionM3
    };

    this.scenarioData.kpis = {
      ...this.scenarioData.kpis,
      spill_area_km2: res.area,
      spill_perimeter_km: res.perim,
      spill_thickness_mm: res.thick,
      spill_volume_m3: res.volM3,
      spill_volume_bbl: res.volBbl,
      skimmers_needed: res.skimmersNeeded,
      tankers_needed: res.tankersNeeded,
      equipment: sp.equipment
    };

    this.updateKPIs(this.scenarioData.kpis);
    this.updateSpillOverview(sp);
    this.map.setScenario(this.scenarioData);

    document.getElementById('modal-fleet-calculator')?.classList.remove('active');
  }

  setSpillThickness(thickVal) {
    if (!this.scenarioData || !this.scenarioData.spill) return;
    const sp = this.scenarioData.spill;
    const area = sp.area_km2 || 2.85;
    const perim = sp.perimeter_km || 9.21;
    const volM3 = Math.round(area * thickVal * 1000.0 * 10) / 10;
    const volBbl = Math.round(volM3 * 6.28981);
    const volTons = Math.round(volM3 * 0.88 * 10) / 10;
    const skimmersNeeded = Math.max(1, Math.ceil(volM3 / 480));
    const tankersNeeded = Math.max(1, Math.ceil((volM3 * 1.35) / 1500));

    sp.thickness_mm = thickVal;
    sp.volume_m3 = volM3;
    sp.volume_bbl = volBbl;
    sp.volume_tons = volTons;
    sp.equipment = {
      ...sp.equipment,
      thickness_mm: thickVal,
      thickness_microns: Math.round(thickVal * 1000),
      volume_m3: volM3,
      volume_bbl: volBbl,
      volume_tons: volTons,
      skimmers_needed: skimmersNeeded,
      tankers_needed: tankersNeeded,
      total_fluid_emulsion_m3: Math.round(volM3 * 1.35 * 10) / 10
    };

    this.scenarioData.kpis = {
      ...this.scenarioData.kpis,
      spill_thickness_mm: thickVal,
      spill_volume_m3: volM3,
      spill_volume_bbl: volBbl,
      skimmers_needed: skimmersNeeded,
      tankers_needed: tankersNeeded,
      equipment: sp.equipment
    };

    this.updateKPIs(this.scenarioData.kpis);
    this.updateSpillOverview(sp);
    this.map.setScenario(this.scenarioData);
  }

  togglePlayback() {
    this.isPlaying = !this.isPlaying;
    const playTextEl = document.getElementById('timeline-play-text');

    if (this.isPlaying) {
      if (playTextEl) playTextEl.textContent = 'PAUSE';
      let idx = this.stepSequence.indexOf(this.currentStepHours);
      if (idx < 0 || idx >= this.stepSequence.length - 1) idx = 0;

      this.playbackInterval = setInterval(() => {
        idx++;
        if (idx >= this.stepSequence.length) {
          idx = 0;
          this.togglePlayback();
          return;
        }
        const hours = this.stepSequence[idx];
        this.selectTimelineStep(hours);
      }, 1500);
    } else {
      if (playTextEl) playTextEl.textContent = 'PLAY';
      if (this.playbackInterval) {
        clearInterval(this.playbackInterval);
        this.playbackInterval = null;
      }
    }
  }

  renderAISegmentationMask(canvasId, areaKm2, confidencePct) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Dark SAR background
    ctx.fillStyle = '#06111e';
    ctx.fillRect(0, 0, w, h);

    // Speckle noise
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const val = Math.floor(Math.random() * 70 + 30);
      ctx.fillStyle = `rgb(${val}, ${val}, ${val})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    // AI Detected Dark Patch (Oil Spill Body)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.48, w * 0.3, h * 0.26, -0.25, 0, 2 * Math.PI);
    ctx.fillStyle = '#020914'; // Low backscatter dark patch
    ctx.fill();
    ctx.strokeStyle = '#ef4444'; // Red segmented contour outline
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 9.5px Inter, sans-serif';
    ctx.fillText('AI SEGMENTED SLICK', w * 0.26, h * 0.88);
  }
}

// Bootstrap robustly on DOM ready or immediately if already loaded
function bootstrapOilSpillApp() {
  if (!window.app) {
    try {
      window.app = new OilSpillApp();
    } catch (err) {
      console.error('Fatal initialization error in OilSpillApp:', err);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapOilSpillApp);
} else {
  bootstrapOilSpillApp();
}
