/**
 * Attribution & Suspect Ranking UI View
 * Manages the ranking cards, all corridor vessels directory, inspection telemetry drawer,
 * and evidentiary factors.
 */

class AttributionView {
  constructor(candidateContainerId, detailContainerId) {
    this.candidateContainer = document.getElementById(candidateContainerId);
    this.detailContainer = document.getElementById(detailContainerId);
    this.currentCandidates = [];
    this.allVessels = [];
    this.selectedMmsi = null;
    this.currentTab = 'suspects'; // 'suspects' | 'all'
    this.searchQuery = '';

    this.initTabControls();
  }

  initTabControls() {
    const tabSuspects = document.getElementById('tab-top-suspects');
    const tabAll = document.getElementById('tab-all-vessels');

    if (tabSuspects) {
      tabSuspects.addEventListener('click', () => this.setTab('suspects'));
    }
    if (tabAll) {
      tabAll.addEventListener('click', () => this.setTab('all'));
    }

    const searchInput = document.getElementById('vessel-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderList();
      });
    }
  }

  setTab(tab) {
    this.currentTab = tab;
    const tabSuspects = document.getElementById('tab-top-suspects');
    const tabAll = document.getElementById('tab-all-vessels');
    const searchWrapper = document.getElementById('vessel-search-wrapper');

    if (tabSuspects && tabAll) {
      if (tab === 'suspects') {
        tabSuspects.className = 'vessel-tab-btn active';
        tabSuspects.style.background = 'var(--primary)';
        tabSuspects.style.color = '#fff';
        tabSuspects.style.borderColor = 'var(--primary)';

        tabAll.className = 'vessel-tab-btn';
        tabAll.style.background = 'var(--surface-container-low)';
        tabAll.style.color = 'var(--text-muted)';
        tabAll.style.borderColor = 'var(--outline)';
        if (searchWrapper) searchWrapper.style.display = 'none';
      } else {
        tabAll.className = 'vessel-tab-btn active';
        tabAll.style.background = 'var(--primary)';
        tabAll.style.color = '#fff';
        tabAll.style.borderColor = 'var(--primary)';

        tabSuspects.className = 'vessel-tab-btn';
        tabSuspects.style.background = 'var(--surface-container-low)';
        tabSuspects.style.color = 'var(--text-muted)';
        tabSuspects.style.borderColor = 'var(--outline)';
        if (searchWrapper) searchWrapper.style.display = 'block';
      }
    }

    this.renderList();
  }

  renderCandidates(candidates, selectedMmsi = null, allVessels = null) {
    this.currentCandidates = candidates || [];
    this.allVessels = (allVessels && allVessels.length > 0) ? allVessels : this.currentCandidates;

    // Update total count badge
    const countBadge = document.getElementById('tab-all-count');
    if (countBadge) countBadge.textContent = this.allVessels.length;
    const drawerCount = document.getElementById('drawer-vessels-count');
    if (drawerCount) drawerCount.textContent = `Correlated: ${this.allVessels.length}`;

    if (selectedMmsi) {
      this.selectedMmsi = selectedMmsi;
    } else if (!this.selectedMmsi && this.currentCandidates.length > 0) {
      this.selectedMmsi = this.currentCandidates[0].mmsi;
    }

    this.renderList();

    // Render detail card for selected vessel
    const activeVessel = this.allVessels.find(c => c.mmsi === this.selectedMmsi) || this.currentCandidates[0];
    if (activeVessel) {
      this.renderDetailCard(activeVessel);
    }
  }

  renderList() {
    if (!this.candidateContainer) return;
    this.candidateContainer.innerHTML = '';

    let listToDisplay = [];
    if (this.currentTab === 'suspects') {
      // Top 5 suspects
      listToDisplay = this.currentCandidates.slice(0, 5);
    } else {
      // All corridor vessels
      listToDisplay = this.allVessels;
      if (this.searchQuery) {
        listToDisplay = listToDisplay.filter(v => 
          (v.vessel_name && v.vessel_name.toLowerCase().includes(this.searchQuery)) ||
          (v.mmsi && v.mmsi.includes(this.searchQuery)) ||
          (v.vessel_type && v.vessel_type.toLowerCase().includes(this.searchQuery))
        );
      }
    }

    if (listToDisplay.length === 0) {
      this.candidateContainer.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 12px;">
          No vessels match search query.
        </div>
      `;
      return;
    }

    listToDisplay.forEach((vessel, idx) => {
      const card = document.createElement('div');
      const isSelected = vessel.mmsi === this.selectedMmsi;

      card.className = `candidate-card ${isSelected ? 'selected' : ''}`;
      card.dataset.mmsi = vessel.mmsi;

      const isRanked = vessel.rank && vessel.rank <= 10;
      const rankBadge = isRanked 
        ? `<div class="rank-badge ${vessel.rank <= 3 ? 'rank-' + vessel.rank : 'rank-3'}">${vessel.rank}</div>`
        : `<div class="rank-badge" style="background: #334155; color: #94a3b8; font-size: 9px;">${idx + 1}</div>`;

      const pillClass = vessel.badge_class || (vessel.score >= 80 ? 'high' : (vessel.score >= 50 ? 'medium' : 'low'));
      const likelihoodText = vessel.likelihood || (vessel.score > 20 ? 'Suspect' : 'Transit');
      const scoreDisplay = vessel.score !== undefined ? `${vessel.score}%` : '—';

      card.innerHTML = `
        ${rankBadge}
        <div class="vessel-main-info" style="flex: 1; min-width: 0; padding-right: 6px;">
          <span class="vessel-name-bold" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${vessel.vessel_name}</span>
          <span class="vessel-meta-sub">${vessel.vessel_type || 'Vessel'} • ${vessel.flag || 'AIS'}</span>
        </div>
        <div class="score-pct tnum" style="font-size: 12px;">${scoreDisplay}</div>
        <div class="likelihood-pill ${pillClass}">${likelihoodText}</div>
      `;

      card.addEventListener('click', () => {
        this.selectCandidate(vessel.mmsi);
        if (window.onSelectVessel) window.onSelectVessel(vessel.mmsi);
      });

      this.candidateContainer.appendChild(card);
    });
  }

  selectCandidate(mmsi) {
    this.selectedMmsi = mmsi;
    // Update card selection states
    const cards = this.candidateContainer.querySelectorAll('.candidate-card');
    cards.forEach(c => {
      if (c.dataset.mmsi === mmsi) {
        c.classList.add('selected');
        c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        c.classList.remove('selected');
      }
    });

    const vessel = this.allVessels.find(c => c.mmsi === mmsi) || this.currentCandidates.find(c => c.mmsi === mmsi);
    if (vessel) {
      this.renderDetailCard(vessel);
    }
  }

  renderDetailCard(vessel) {
    if (!this.detailContainer) return;

    const evidenceItems = (vessel.evidence || []).map(ev => `<li>${ev}</li>`).join('');
    const timeDisplay = vessel.time_at_cpa || '12 May 2026, 10:28 AM';
    const riskBadge = (vessel.score && vessel.score > 20) 
      ? `<span class="likelihood-pill ${vessel.badge_class || 'high'}">${vessel.likelihood} Risk</span>`
      : `<span class="likelihood-pill low" style="background: #0369a1; color: #fff;">Corridor Transit</span>`;

    this.detailContainer.innerHTML = `
      <div class="detail-title-group">
        <div>
          <h3>${vessel.vessel_name} Details</h3>
          <span style="font-size: 11px; color: var(--text-muted);">Flag: ${vessel.flag || 'Panama'} | MMSI: ${vessel.mmsi}</span>
        </div>
        ${riskBadge}
      </div>

      <div class="telemetry-grid">
        <div class="telemetry-item">
          <div class="telemetry-key">MMSI</div>
          <div class="telemetry-val-lg tnum">${vessel.mmsi}</div>
        </div>
        <div class="telemetry-item">
          <div class="telemetry-key">Vessel Type</div>
          <div class="telemetry-val-lg">${vessel.vessel_type || 'Cargo'}</div>
        </div>
        <div class="telemetry-item">
          <div class="telemetry-key">Distance from Spill</div>
          <div class="telemetry-val-lg tnum" style="color: ${vessel.cpa_km < 5 ? '#e53e3e' : 'var(--primary)'};">${vessel.cpa_km !== undefined ? vessel.cpa_km + ' km' : '—'}</div>
        </div>
        <div class="telemetry-item">
          <div class="telemetry-key">Transit Speed</div>
          <div class="telemetry-val-lg tnum">${vessel.avg_speed_knots || 12} knots</div>
        </div>
        <div class="telemetry-item">
          <div class="telemetry-key">Course Heading</div>
          <div class="telemetry-val-lg tnum">${vessel.course_at_cpa || (vessel.track && vessel.track.length > 0 ? vessel.track[vessel.track.length - 1].cog : '210')}°</div>
        </div>
        <div class="telemetry-item">
          <div class="telemetry-key">Confidence Score</div>
          <div class="telemetry-val-lg tnum" style="color: var(--primary);">${vessel.score !== undefined ? vessel.score + '%' : '—'}</div>
        </div>
      </div>

      <div class="evidence-section">
        <div class="evidence-title">Evidentiary Correlation Factors</div>
        <ul class="evidence-list">
          ${evidenceItems || '<li>Vessel transited within observation sector; track logged in AIS corridor registry.</li>'}
        </ul>
      </div>

      <div class="inspector-actions">
        <button class="btn btn-secondary" style="flex: 1;" onclick="window.zoomToSelectedVessel('${vessel.mmsi}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
          </svg>
          View Full Track
        </button>
        <button class="btn btn-primary" onclick="window.downloadForensicDossier()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Dossier PDF
        </button>
      </div>
    `;
  }
}
