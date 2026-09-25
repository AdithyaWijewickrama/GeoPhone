"""Versioned, deterministic feature extraction for labeled geophone events."""
import numpy as np
from scipy import signal, stats

FEATURE_VERSION = "1.0"


def extract_event_features(times, volts, event_start_ms=None, event_end_ms=None):
    """Return a flat feature dictionary for samples inside an event interval."""
    t = np.asarray(times, dtype=float)
    x = np.asarray(volts, dtype=float)
    if t.size != x.size or not x.size:
        raise ValueError("times and volts must be non-empty arrays of equal length")
    valid = np.isfinite(t) & np.isfinite(x)
    t, x = t[valid], x[valid]
    if event_start_ms is not None:
        t, x = t[t >= float(event_start_ms)], x[t >= float(event_start_ms)]
    if event_end_ms is not None:
        # Apply both bounds against the same original interval.
        start_bound = float(event_start_ms) if event_start_ms is not None else -np.inf
        mask = valid & (np.asarray(times, dtype=float) >= start_bound) & (np.asarray(times, dtype=float) <= float(event_end_ms))
        t, x = np.asarray(times, dtype=float)[mask], np.asarray(volts, dtype=float)[mask]
    if not x.size:
        raise ValueError("no waveform samples fall inside the event interval")
    order = np.argsort(t)
    t, x = t[order], x[order]
    dt = np.diff(t)
    dt = dt[dt > 0]
    sample_dt = float(np.median(dt)) if dt.size else 1.0
    # API timestamps are epoch milliseconds; relative timestamp inputs are seconds.
    sample_rate = 1000.0 / sample_dt if t[0] > 1e11 else 1.0 / sample_dt
    duration = max(0.0, float(t[-1] - t[0]) / (1000.0 if t[0] > 1e11 else 1.0))
    abs_x = np.abs(x)
    peak_idx = int(np.argmax(abs_x))
    rms = float(np.sqrt(np.mean(x ** 2)))
    crossing = np.count_nonzero(np.diff(np.signbit(x))) / max(1, x.size - 1)
    rise_time = max(0.0, float(t[peak_idx] - t[0]) / (1000.0 if t[0] > 1e11 else 1.0))
    clean = x - np.mean(x)
    freqs, power = signal.periodogram(clean, fs=max(sample_rate, 1e-9))
    if power.size and np.sum(power) > 0:
        total = float(np.sum(power))
        dominant = float(freqs[int(np.argmax(power))])
        centroid = float(np.sum(freqs * power) / total)
        bandwidth = float(np.sqrt(np.sum(((freqs - centroid) ** 2) * power) / total))
        rolloff = float(freqs[min(np.searchsorted(np.cumsum(power), .85 * total), len(freqs) - 1)])
    else:
        dominant = centroid = bandwidth = rolloff = 0.0
    return {
        "peak_amplitude": float(np.max(abs_x)), "rms": rms, "energy": float(np.sum(x ** 2)),
        "rise_time_s": rise_time, "duration_s": duration, "zero_crossing_rate": float(crossing),
        "kurtosis": float(stats.kurtosis(x, fisher=True, bias=False)) if x.size > 3 else 0.0,
        "dominant_frequency_hz": dominant, "spectral_centroid_hz": centroid,
        "spectral_bandwidth_hz": bandwidth, "spectral_rolloff_85_hz": rolloff,
    }
