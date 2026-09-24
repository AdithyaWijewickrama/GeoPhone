# GeoPhone Batch Analyzer

A full-stack geophone data triage and machine learning platform designed to process, visualize, and label large volumes
of continuous ADC time-series data.

This tool serves as an interactive pipeline for converting raw, continuous seismic/geophone CSV files into a curated,
labeled dataset for training supervised machine learning models.

## 🚀 Features

* **Interval Chunking & Gap Detection:** Automatically stitches thousands of 1-minute CSV files into continuous
  overarching chunks (e.g., 10m, 30m, 1h). It actively detects and reports missing time gaps or corrupted (0 KB) files.
* **Unsupervised Anomaly Detection:** Uses a robust mathematical pipeline to flag micro-events:
    * Rolling Variance & Peak Absolute Amplitude
    * STA/LTA (Short-Time Average / Long-Time Average) Seismic Triggers
    * Robust Z-Scores using Median Absolute Deviation (MAD)
* **Interactive Triage Dashboard:** Built with React and Chart.js, featuring a dark-mode interface with dynamic
  threshold sliders to filter out background noise instantly.
* **Deep Event Analysis:** Generates high-resolution, server-rendered STFT (Short-Time Fourier Transform) Spectrograms
  and zoomed time-domain waveforms for precise event inspection using SciPy and Matplotlib.
* **Bulk Labeling System:** Select single or multiple flagged micro-events and apply categorical labels (e.g.,
  *Footstep, Vehicle, Seismic tremor*) and custom notes.
* **Database Ready:** Labels are pushed directly to the backend to build a curated training dataset for future
  supervised ML classification.

## 🛠️ Tech Stack

**Frontend:**

* React.js
* Bootstrap 5 (Dark Theme)
* Chart.js (Interactive time-series plotting)

**Backend:**

* Django (REST API routing & database ORM)
* Pandas & NumPy (High-speed interval stitching and rolling statistics)
* SciPy & Matplotlib (Signal processing and server-side spectrogram rendering)

## 📁 Data Schema

The platform expects a directory of timestamped CSV files (e.g., `2026-07-29_21-58-26.csv`). Each file should contain
roughly 1-minute of continuous hardware readings with the following columns:

* `timestamp`: Precise hardware timestamp.
* `voltage`: Geophone analog-to-digital converter (ADC) reading (mV).

## 💻 Local Development Setup

### 1. Backend (Django)

Navigate to the root directory and set up the Python virtual environment:

```bash
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Mac/Linux:
source .venv/bin/activate

pip install -r requirements.txt

# Run migrations:
python manage.py migrate

# Start backend server:
python manage.py runserver
```

### 2. Frontend (React)

Navigate to `geobench-frontend` and start the React development server:

```bash
cd geobench-frontend
npm install
npm start
```
