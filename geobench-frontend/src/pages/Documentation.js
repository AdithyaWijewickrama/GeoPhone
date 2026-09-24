import React, { useState } from 'react';

export default function Documentation() {
    const [expanded, setExpanded] = useState({});

    const toggleSection = (section) => {
        setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
    };

    return (
        <div className="container-fluid py-4" style={{ maxWidth: '1000px' }}>
            <h2 className="text-warning mb-4">Platform Documentation</h2>
            <p className="text-muted mb-5" style={{ fontSize: '1.1rem' }}>
                Welcome to the GeoPhone Platform. This system is designed to process continuous geophone (seismic) data, automatically detect anomalies using unsupervised mathematical algorithms, and provide a workflow for humans to label those events to train a future Machine Learning model.
            </p>

            {/* Section 1: The Processing Pipeline */}
            <div className="card bg-dark border-secondary shadow mb-4">
                <div className="card-header border-secondary d-flex justify-content-between align-items-center">
                    <span className="text-light fs-5">1. The Unsupervised Detection Pipeline</span>
                </div>
                <div className="card-body">
                    <p className="text-light">
                        The current model does not "learn" from past data. It is an unsupervised mathematical pipeline that detects anomalies by calculating rolling statistics on raw voltage as it flows in.
                    </p>
                    <ul className="text-muted">
                        <li><strong>Voltage Spikes:</strong> Compares the amplitude of an event against the surrounding timeframe.</li>
                        <li><strong>Signal Variance:</strong> Detects sudden changes in waveform chaos.</li>
                        <li><strong>Baseline Normalization:</strong> Dynamically calculates "normal background noise" for every 10-minute chunk.</li>
                    </ul>

                    <button className="btn btn-outline-info btn-sm mt-2" onClick={() => toggleSection('pipeline')}>
                        {expanded['pipeline'] ? 'Collapse Content' : 'Dive Deeper: Energy Calculation'}
                    </button>

                    {expanded['pipeline'] && (
                        <div className="alert bg-dark border-info mt-3 mb-0 text-muted shadow-sm">
                            <h6 className="text-info">Signal Rectification</h6>
                            <p className="mb-0 small">
                                Raw geophone signals oscillate above and below zero (positive and negative voltage). To measure the physical energy of a tremor rather than its direction, the backend first rectifies the signal by calculating the absolute amplitude: <br/><br/>
                                <code className="bg-dark text-light p-1 rounded">E(t) = |x(t)|</code>
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Section 2: STA/LTA Ratio */}
            <div className="card bg-dark border-secondary shadow mb-4">
                <div className="card-header border-secondary d-flex justify-content-between align-items-center">
                    <span className="text-light fs-5">2. STA/LTA (Short-Time / Long-Time Average)</span>
                </div>
                <div className="card-body">
                    <p className="text-light">
                        This is the foundational algorithm used in traditional seismology to detect earthquakes. It calculates a continuous ratio between an immediate time window and a historical time window to identify sudden bursts of energy while ignoring gradual environmental changes (like temperature drift or wind).
                    </p>

                    <button className="btn btn-outline-warning btn-sm mt-2" onClick={() => toggleSection('stalta')}>
                        {expanded['stalta'] ? 'Collapse Content' : 'Dive Deeper: The STA/LTA Math'}
                    </button>

                    {expanded['stalta'] && (
                        <div className="alert bg-dark border-warning mt-3 mb-0 text-muted shadow-sm">
                            <h6 className="text-warning">How the Ratio Works</h6>
                            <ul className="small mb-3">
                                <li><strong>STA (Short-Time Average):</strong> Measures acoustic energy in a very narrow window (e.g., the last 0.1 to 0.5 seconds). It acts as the "trigger".</li>
                                <li><strong>LTA (Long-Time Average):</strong> Measures background noise over a much longer window (e.g., the last 10 to 60 seconds). It stabilizes the baseline.</li>
                            </ul>
                            <p className="small mb-0">
                                When the environment is quiet, STA ≈ LTA, so the ratio is ~1.0. When a footstep or vehicle occurs, the STA spikes immediately while the LTA remains stable, driving the ratio up drastically.<br/><br/>
                                <code className="bg-dark text-light p-1 rounded">Ratio(t) = STA(t) / LTA(t)</code>
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Section 3: Robust Z-Scores & The Dashboard Score */}
            <div className="card bg-dark border-secondary shadow mb-4">
                <div className="card-header border-secondary d-flex justify-content-between align-items-center">
                    <span className="text-light fs-5">3. The Dashboard "Score" (Robust Z-Score)</span>
                </div>
                <div className="card-body">
                    <p className="text-light">
                        A raw STA/LTA ratio of 5.0 might be meaningless in a noisy factory but highly significant in a quiet forest. To standardize this, we convert the ratio into an <strong>Anomaly Score</strong> plotted in orange on your dashboard.
                    </p>
                    <p className="text-muted small">
                        When you adjust the <strong>Threshold Slider</strong>, you are interacting directly with this score. A score of 8.0 mathematically guarantees the signal's energy is 8 deviations above the true median noise floor of that specific interval.
                    </p>

                    <button className="btn btn-outline-danger btn-sm mt-2" onClick={() => toggleSection('zscore')}>
                        {expanded['zscore'] ? 'Collapse Content' : 'Dive Deeper: Median Absolute Deviation (MAD)'}
                    </button>

                    {expanded['zscore'] && (
                        <div className="alert bg-dark border-danger mt-3 mb-0 text-muted shadow-sm">
                            <h6 className="text-danger">Why not standard deviation?</h6>
                            <p className="small mb-2">
                                Standard statistical normalization uses the mean and standard deviation. However, massive geophone anomalies (like a truck driving by) severely distort the mean, causing the algorithm to mask subsequent, quieter events (like footsteps).
                            </p>
                            <h6 className="text-danger mt-3">The MAD Solution</h6>
                            <p className="small mb-0">
                                Instead, the backend uses <strong>Median Absolute Deviation (MAD)</strong>, a highly robust statistic that ignores extreme outliers to find the true center of the noise floor. We scale MAD by ~1.4826 so it mimics standard deviation on a normal distribution, creating our final Z-Score limit.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Section 4: The Future of the Model */}
            <div className="card bg-dark border-secondary shadow mb-4">
                <div className="card-header border-secondary d-flex justify-content-between align-items-center">
                    <span className="text-light fs-5">4. Transitioning to Supervised ML</span>
                </div>
                <div className="card-body">
                    <p className="text-light mb-0">
                        The entire purpose of the Data Triage dashboard is to transition from this math-based guessing to true <strong>supervised machine learning</strong>. By manually labeling events, you are generating the dataset required to train a new model (like a Random Forest or Convolutional Neural Network).
                    </p>

                    <button className="btn btn-outline-success btn-sm mt-3" onClick={() => toggleSection('future')}>
                        {expanded['future'] ? 'Collapse Content' : 'Dive Deeper: Model Training Features'}
                    </button>

                    {expanded['future'] && (
                        <div className="alert bg-dark border-success mt-3 mb-0 text-muted shadow-sm">
                            <h6 className="text-success">What the AI will learn from:</h6>
                            <ul className="small mb-0">
                                <li className="mb-2"><strong>Raw Waveform Segments:</strong> The exact milliseconds of voltage spanning your labeled event bounds.</li>
                                <li className="mb-2"><strong>Frequency Features (Spectrograms):</strong> The STFT (Short-Time Fourier Transform) frequency distributions showing how much energy is at 20Hz vs 80Hz. This is the exact heatmap you see when clicking "View Plot".</li>
                                <li><strong>Your Human Labels:</strong> The categorical tags (e.g., "Footstep", "Vehicle") applied from the UI, allowing the AI to map specific frequency signatures to physical real-world events.</li>
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}