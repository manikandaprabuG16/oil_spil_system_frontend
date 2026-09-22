# Oil Spill Intelligence System - Frontend Command Center

Tactical Web GIS command center for the **SIH26143 Maritime Oil Spill Attribution Intelligence System**.

## Features
- **Maritime Tactical Dashboard:** Interactive Leaflet GIS with Sentinel-1 SAR overlays, drift polygons, and AIS trajectories.
- **Dedicated Login Terminal:** Single operator identity protocol (`ICG-COMMAND-01`).
- **30-Minute Shift Security:** Real-time HUD countdown timer with automatic terminal lock upon expiration or operator inactivity.
- **Dynamic Attribution Views:** Multi-criteria vessel ranking, evidence breakdowns, and forensic PDF dossier exports.

---

## Deploy to Vercel

1. Log in to [Vercel](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Import your GitHub repository: `https://github.com/manikandaprabuG16/oil_spil_system_frontend.git`
4. In `vercel.json`, ensure the Render backend URL matches your active Render service:
   ```json
   {
     "rewrites": [
       {
         "source": "/api/:path*",
         "destination": "https://YOUR-RENDER-BACKEND-URL.onrender.com/api/:path*"
       }
     ]
   }
   ```
5. Click **Deploy**.
