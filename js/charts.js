/**
 * Telemetry Charts Module (Chart.js)
 * Implements:
 * 1. Spill Area Expansion Over Time (Area km^2 vs Time)
 * 2. Attribution Breakdown Radar / Bar Chart for selected vessel
 */

class TelemetryCharts {
  constructor() {
    this.areaChart = null;
    this.breakdownChart = null;
  }

  renderAreaExpansionChart(canvasId, expansionHistory) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (typeof Chart === 'undefined') {
      this.drawCanvasAreaChart(canvas, expansionHistory);
      return;
    }

    const labels = (expansionHistory || []).map(item => item.time);
    const dataValues = (expansionHistory || []).map(item => item.area_km2);

    if (this.areaChart) {
      try { this.areaChart.destroy(); } catch (e) {}
    }

    try {
      const gradient = canvas.getContext('2d').createLinearGradient(0, 0, 0, 110);
      gradient.addColorStop(0, 'rgba(229, 62, 62, 0.45)');
      gradient.addColorStop(1, 'rgba(229, 62, 62, 0.02)');

      this.areaChart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Spill Area (km²)',
            data: dataValues,
            borderColor: '#e53e3e',
            borderWidth: 2.2,
            backgroundColor: gradient,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#e53e3e',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#011d35',
              titleFont: { family: 'Inter', size: 11 },
              bodyFont: { family: 'Inter', size: 12, weight: 'bold' },
              padding: 8,
              callbacks: {
                label: (context) => `Area: ${context.parsed.y} km²`
              }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(226, 232, 240, 0.6)' },
              ticks: {
                font: { family: 'Inter', size: 10, weight: '500' },
                color: '#627d98'
              }
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(226, 232, 240, 0.6)' },
              ticks: {
                font: { family: 'Inter', size: 10, weight: '500' },
                color: '#627d98',
                callback: (val) => `${val} km²`
              }
            }
          }
        }
      });
    } catch (err) {
      this.drawCanvasAreaChart(canvas, expansionHistory);
    }
  }

  drawCanvasAreaChart(canvas, expansionHistory) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width = canvas.parentElement ? (canvas.parentElement.clientWidth || 340) : 340;
    const h = canvas.height = canvas.parentElement ? (canvas.parentElement.clientHeight || 120) : 120;

    ctx.clearRect(0, 0, w, h);

    const history = expansionHistory && expansionHistory.length > 0 ? expansionHistory : [
      { time: '08:00', area_km2: 0.4 },
      { time: '08:30', area_km2: 0.75 },
      { time: '09:00', area_km2: 1.15 },
      { time: '09:30', area_km2: 1.7 },
      { time: '10:00', area_km2: 2.25 },
      { time: '10:30', area_km2: 2.85 },
      { time: '11:00', area_km2: 3.4 }
    ];

    const padding = { left: 45, right: 15, top: 12, bottom: 22 };
    const chartW = Math.max(w - padding.left - padding.right, 50);
    const chartH = Math.max(h - padding.top - padding.bottom, 40);

    const maxVal = Math.max(...history.map(p => p.area_km2), 4.0);

    // Axes lines
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, h - padding.bottom);
    ctx.lineTo(w - padding.right, h - padding.bottom);
    ctx.stroke();

    // Data points coordinates
    const pts = history.map((item, i) => {
      const x = padding.left + (i / Math.max(history.length - 1, 1)) * chartW;
      const y = h - padding.bottom - (item.area_km2 / maxVal) * chartH;
      return { x, y, time: item.time, val: item.area_km2 };
    });

    // Gradient fill under line
    const grad = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
    grad.addColorStop(0, 'rgba(229, 62, 62, 0.45)');
    grad.addColorStop(1, 'rgba(229, 62, 62, 0.02)');

    ctx.beginPath();
    ctx.moveTo(pts[0].x, h - padding.bottom);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, h - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = '#e53e3e';
    ctx.lineWidth = 2.5;
    pts.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // Dots and text
    ctx.font = '9.5px Inter, sans-serif';
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#e53e3e';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#627d98';
      ctx.textAlign = 'center';
      ctx.fillText(p.time, p.x, h - padding.bottom + 15);
    });

    ctx.textAlign = 'right';
    ctx.fillText(`${maxVal.toFixed(1)} km²`, padding.left - 5, padding.top + 8);
    ctx.fillText('0 km²', padding.left - 5, h - padding.bottom);
  }

  renderSpreadPredictionHeatmap(canvasId, hours = 48) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // 1. Dark oceanic satellite background
    ctx.fillStyle = '#061325';
    ctx.fillRect(0, 0, width, height);

    // Draw ocean texture / coastline shape on left
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(width * 0.15, height * 0.2, width * 0.1, height * 0.7, 0, height);
    ctx.fillStyle = '#1e3a29'; // Coast land green
    ctx.fill();
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Scale spread size based on selected forecast hours
    const scale = 0.7 + (hours / 72.0) * 0.45;

    // Center of release origin
    const originX = width * 0.38;
    const originY = height * 0.65;
    const angle = -Math.PI / 4; // Drifting North-East (45 deg)

    // Render multi-ring risk contours (Low -> Medium -> High -> Very High)
    const zones = [
      { rx: 110 * scale, ry: 60 * scale, colorStop0: 'rgba(2, 132, 199, 0.7)', colorStop1: 'rgba(6, 182, 212, 0.05)' },
      { rx: 85 * scale, ry: 45 * scale, colorStop0: 'rgba(234, 179, 8, 0.85)', colorStop1: 'rgba(217, 119, 6, 0.2)' },
      { rx: 60 * scale, ry: 32 * scale, colorStop0: 'rgba(249, 115, 22, 0.9)', colorStop1: 'rgba(234, 88, 12, 0.4)' },
      { rx: 35 * scale, ry: 20 * scale, colorStop0: 'rgba(229, 62, 62, 0.98)', colorStop1: 'rgba(185, 28, 28, 0.7)' }
    ];

    zones.forEach(z => {
      ctx.save();
      ctx.translate(originX + (z.rx * 0.45), originY - (z.ry * 0.65));
      ctx.rotate(angle);

      const rad = Math.max(z.rx, z.ry);
      const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, rad);
      grad.addColorStop(0, z.colorStop0);
      grad.addColorStop(1, z.colorStop1);

      ctx.beginPath();
      ctx.ellipse(0, 0, z.rx, z.ry, 0, 0, 2 * Math.PI);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    });

    // Surface drift streamlines (dashed arrows)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    const drawStreamline = (startX, startY, endX, endY) => {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo((startX + endX) / 2 - 15, (startY + endY) / 2 - 10, endX, endY);
      ctx.stroke();
    };

    drawStreamline(originX, originY, originX + 110 * scale, originY - 100 * scale);
    drawStreamline(originX - 30, originY - 10, originX + 70 * scale, originY - 110 * scale);
    ctx.setLineDash([]);

    // Markers: Coastline & Fishing Zone
    // Coastline Pin
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9.5px Inter, sans-serif';
    ctx.fillText('Coastline', width * 0.12, height * 0.72);
    ctx.beginPath();
    ctx.arc(width * 0.1, height * 0.72, 3, 0, 2 * Math.PI);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();

    // Fishing Zone Marker
    const fishX = width * 0.52;
    const fishY = height * 0.75;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Fishing Zone', fishX + 14, fishY + 4);

    ctx.beginPath();
    ctx.arc(fishX, fishY, 7, 0, 2 * Math.PI);
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Origin Pin
    ctx.beginPath();
    ctx.arc(originX, originY, 5, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#e53e3e';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  renderHistoricalRiskHeatmap(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#061325';
    ctx.fillRect(0, 0, width, height);

    // Draw regional bathymetric risk heatmap gradient
    const grad = ctx.createRadialGradient(width * 0.7, height * 0.5, 10, width * 0.5, height * 0.5, width * 0.6);
    grad.addColorStop(0, 'rgba(229, 62, 62, 0.85)');
    grad.addColorStop(0.35, 'rgba(234, 115, 22, 0.7)');
    grad.addColorStop(0.65, 'rgba(234, 179, 8, 0.5)');
    grad.addColorStop(1, 'rgba(2, 132, 199, 0.1)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Coastline contour lines
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width * 0.25, height * 0.4);
    ctx.lineTo(width * 0.45, 0);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
