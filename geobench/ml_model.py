import io
import re
import base64
from datetime import datetime

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')  # Use server-side rendering
import matplotlib.pyplot as plt
from scipy import signal


def _attach_block_suggestions(times, volts, blocks):
    """Attach latest-run predictions to detected blocks when a model is available."""
    if not blocks:
        return blocks
    from .ml_classifier import get_latest_classifier_run, suggest_label
    from .ml_features import extract_event_features

    classifier_run = get_latest_classifier_run()
    if not classifier_run:
        return blocks
    times = np.asarray(times, dtype=float)
    volts = np.asarray(volts, dtype=float)
    def annotate_group(group):
        if not group:
            return
        start_idx = max(0, int(group[0]['s']))
        end_idx = min(len(times), int(group[-1]['e']) + 1)
        try:
            features = extract_event_features(times[start_idx:end_idx], volts[start_idx:end_idx])
            prediction = suggest_label(features, classifier_run)
        except (ValueError, TypeError):
            prediction = None
        if prediction:
            suggestion = {
                'suggested_label': prediction['category'],
                'suggested_confidence': prediction['confidence'],
                'classifier_run_id': prediction['classifier_run_id'],
            }
            for item in group:
                item.update(suggestion)

    # Match the frontend's default event grouping so blocks in one merged
    # event carry the same interval-level suggestion; skip background blocks.
    group = []
    for block in blocks:
        if float(block.get('score', 0)) >= 5:
            group.append(block)
        else:
            annotate_group(group)
            group = []
    annotate_group(group)
    return blocks


def parse_filename_datetime(filename):
    """Extracts a datetime from a filename pattern (e.g. 2026-07-29_21-58-26.csv or epoch timestamp)."""
    if not filename:
        return None
    # match patterns like 2026-09-24_10-00-00, 2026-09-24 10:00:00, 2026-09-24-10-00-00, 2026_09_24_10_00_00, 20260924_100000
    m = re.search(r'(\d{4})[-_]?(\d{2})[-_]?(\d{2})[_T\s-](\d{2})[-:]?(\d{2})[-:]?(\d{2})', str(filename))
    if m:
        try:
            year, month, day, hour, minute, second = map(int, m.groups())
            return pd.Timestamp(year=year, month=month, day=day, hour=hour, minute=minute, second=second)
        except Exception as e:
            print(e)
    # check for epoch timestamp in filename (10 or 13 digits)
    epoch_m = re.search(r'(\d{10,13})', str(filename))
    if epoch_m:
        try:
            val = int(epoch_m.group(1))
            unit = 'ms' if val >= 1e11 else 's'
            return pd.to_datetime(val, unit=unit)
        except Exception as e:
            print(e)
    return None


def parse_timestamp_series(series, filename=None):
    """Parses a pandas Series of timestamps into valid datetime64[ns]"""
    if pd.api.types.is_datetime64_any_dtype(series):
        return series

    # Try numeric conversion
    numeric_s = pd.to_numeric(series, errors='coerce')
    if numeric_s.notna().all():
        sample_val = float(numeric_s.iloc[0])
        if sample_val >= 1e16:
            parsed = pd.to_datetime(numeric_s, unit='ns')
        elif sample_val >= 1e13:
            parsed = pd.to_datetime(numeric_s, unit='us')
        elif sample_val >= 1e11:
            parsed = pd.to_datetime(numeric_s, unit='ms')
        elif sample_val >= 1e8:
            parsed = pd.to_datetime(numeric_s, unit='s')
        else:
            # Small relative numbers (e.g. 0.0 to 60.0 or 0 to 60000)
            base_dt = parse_filename_datetime(filename)
            if base_dt is not None:
                if numeric_s.max() > 1000:
                    parsed = base_dt + pd.to_timedelta(numeric_s, unit='ms')
                else:
                    parsed = base_dt + pd.to_timedelta(numeric_s, unit='s')
            else:
                base_2026 = pd.Timestamp('2026-01-01 00:00:00')
                if numeric_s.max() > 1000:
                    parsed = base_2026 + pd.to_timedelta(numeric_s, unit='ms')
                else:
                    parsed = base_2026 + pd.to_timedelta(numeric_s, unit='s')

        # Check if resulting year is < 2000 (e.g. 1970)
        if parsed.notna().any() and parsed.dropna().iloc[0].year < 2000:
            base_dt = parse_filename_datetime(filename)
            if base_dt is not None:
                first_ts = parsed.dropna().iloc[0]
                delta = parsed - first_ts
                parsed = base_dt + delta
            else:
                first_ts = parsed.dropna().iloc[0]
                delta = parsed - first_ts
                parsed = pd.Timestamp('2026-01-01 00:00:00') + delta
        return parsed
    else:
        parsed = pd.to_datetime(series, errors='coerce')
        if parsed.notna().any() and parsed.dropna().iloc[0].year < 2000:
            base_dt = parse_filename_datetime(filename)
            if base_dt is not None:
                first_ts = parsed.dropna().iloc[0]
                delta = parsed - first_ts
                parsed = base_dt + delta
            else:
                first_ts = parsed.dropna().iloc[0]
                delta = parsed - first_ts
                parsed = pd.Timestamp('2026-01-01 00:00:00') + delta
        return parsed


def calculate_robust_z(series):
    """Calculates a nonnegative robust deviation score using the median and median absolute deviation."""
    median = series.median()
    mad = (series - median).abs().median()
    mad = mad if mad > 1e-9 else 1e-6
    return ((series - median) / (mad * 1.4826)).clip(lower=0)


def process_geophone_csv(file_obj, filename=None):
    """Reads one CSV's timestamp and voltage columns, normalizes timestamps, calculates rolling anomaly features/scores, and returns samples, detected blocks, and timing statistics. Errors are returned as `{ok: False, reason: ...}`."""
    try:
        fname = filename or getattr(file_obj, 'name', None)
        df = pd.read_csv(file_obj, usecols=['timestamp', 'voltage'])
        df['timestamp'] = parse_timestamp_series(df['timestamp'], filename=fname)

        times_ms = df['timestamp'].astype('datetime64[ms]').astype('int64')
        df['voltage'] = df['voltage'].astype('float32')

        dts = np.diff(times_ms.values)
        valid_dts = dts[(dts > 0) & (dts < 2000)]
        median_dt = float(np.median(valid_dts)) if len(valid_dts) > 0 else 10.0
        jitter_pct = float(((valid_dts.max() - valid_dts.min()) / median_dt) * 100) if len(valid_dts) > 0 else 0.0

        win_size = int(max(16, min(200, round(300 / median_dt))))
        step = max(1, win_size // 2)

        df['abs_v'] = df['voltage'].abs()
        df['ema'] = df['abs_v'].ewm(span=win_size * 20, adjust=False).mean()
        df['sta'] = df['abs_v'].rolling(window=win_size, min_periods=1).mean()
        df['sta_lta'] = df['sta'] / (df['ema'] + 1e-9)

        df_blocks = df.iloc[::step].copy()
        df_blocks['variance'] = df['voltage'].rolling(window=win_size).var().iloc[::step]
        df_blocks['max_amp'] = df['abs_v'].rolling(window=win_size).max().iloc[::step]
        df_blocks['sta_lta_peak'] = df['sta_lta'].rolling(window=win_size).max().iloc[::step]

        df_blocks = df_blocks.dropna()

        df_blocks['score'] = (
                calculate_robust_z(df_blocks['variance']) +
                calculate_robust_z(df_blocks['max_amp']) +
                calculate_robust_z(df_blocks['sta_lta_peak'])
        )

        blocks = []
        for i, row in df_blocks.iterrows():
            blocks.append({
                's': max(0, i - win_size),
                'e': i,
                'time': float(times_ms.iloc[i]),
                'score': float(row['score'])
            })

        _attach_block_suggestions(times_ms.tolist(), df['voltage'].tolist(), blocks)

        return {
            'ok': True,
            'times': times_ms.tolist(),
            'volts': df['voltage'].tolist(),
            'blocks': blocks,
            'medianDt': median_dt,
            'jitterPct': jitter_pct,
            'maxScore': float(df_blocks['score'].max()) if not df_blocks.empty else 0,
            'sampleCount': len(df),
            'startTime': float(times_ms.iloc[0]),
            'endTime': float(times_ms.iloc[-1])
        }

    except Exception as e:
        return {'ok': False, 'reason': str(e)}


def generate_event_plot_from_data(times_input, volts_input, event_start_ms=None, event_end_ms=None):
    """Generates an enhanced 3-panel Matplotlib analysis plot (waveform, zoom, spectrogram) directly from arrays."""
    try:
        times_arr = np.array(times_input, dtype=np.float64)
        volts_arr = np.array(volts_input, dtype=np.float32)

        if len(times_arr) == 0 or len(volts_arr) == 0:
            return {'ok': False, 'reason': 'Empty data provided'}

        # Sort if timestamps are out of order
        if np.any(np.diff(times_arr) < 0):
            sort_idx = np.argsort(times_arr)
            times_arr = times_arr[sort_idx]
            volts_arr = volts_arr[sort_idx]

        first_t = float(times_arr[0])
        if first_t >= 1e11:
            times_s = times_arr / 1000.0
            start_s = first_t / 1000.0
        elif first_t >= 1e8:
            times_s = times_arr
            start_s = first_t
        else:
            times_s = times_arr
            start_s = 0.0

        times_rel = times_s - times_s[0]
        total_duration = float(times_rel[-1]) if len(times_rel) > 0 else 1.0

        # Parse event start and end
        if event_start_ms is not None and str(event_start_ms).strip() != '':
            s_val = float(event_start_ms)
            ev_start_s = s_val / 1000.0 if s_val >= 1e11 else s_val
            ev_start_rel = max(0.0, ev_start_s - start_s)
        else:
            ev_start_rel = 0.0

        if event_end_ms is not None and str(event_end_ms).strip() != '':
            e_val = float(event_end_ms)
            ev_end_s = e_val / 1000.0 if e_val >= 1e11 else e_val
            ev_end_rel = min(total_duration, ev_end_s - start_s)
        else:
            ev_end_rel = total_duration

        if ev_end_rel <= ev_start_rel:
            ev_end_rel = min(total_duration, ev_start_rel + 1.0)

        # Padding for zoomed view
        pad = max(0.5, (ev_end_rel - ev_start_rel) * 0.1)
        zoom_mask = (times_rel >= (ev_start_rel - pad)) & (times_rel <= (ev_end_rel + pad))
        z_times = times_rel[zoom_mask]
        z_volts = volts_arr[zoom_mask]

        if len(z_times) == 0:
            z_times = times_rel
            z_volts = volts_arr

        # Setup Plot Style
        plt.style.use('dark_background')
        fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(12, 9), gridspec_kw={'height_ratios': [1, 1, 1.2]})
        fig.patch.set_facecolor('#16120e')

        # Top Panel: Full Waveform
        ax1.set_facecolor('#1e1812')
        ax1.plot(times_rel, volts_arr, color='#348abd', linewidth=0.6)
        ax1.axvspan(ev_start_rel, ev_end_rel, color='#e74c3c', alpha=0.35, label=f'Event Window ({ev_start_rel:.1f}s – {ev_end_rel:.1f}s)')
        ax1.set_title(f'Time-Domain Waveform | Window: 0.0s to {times_rel[-1]:.1f}s', color='white', pad=8, fontsize=11, fontweight='bold')
        ax1.set_ylabel('Voltage (mV)', color='white')
        ax1.legend(loc='upper right', facecolor='#16120e', edgecolor='#372c20')
        ax1.grid(True, color='#372c20', linestyle='--', alpha=0.5)

        # Middle Panel: Zoomed Event
        ax2.set_facecolor('#1e1812')
        if len(z_times) > 0 and len(z_volts) > 0:
            ax2.plot(z_times, z_volts, color='#d9604a', linewidth=1.0)
            peak_idx = int(np.argmax(np.abs(z_volts)))
            peak_t = float(z_times[peak_idx])
            peak_v = float(z_volts[peak_idx])
            ax2.plot(peak_t, peak_v, 'yo', markersize=6, label=f'Peak: {peak_v:.2f} mV at {peak_t:.2f}s')

        ax2.set_title(f'Zoomed View (t = {ev_start_rel:.1f}s to {ev_end_rel:.1f}s, duration: {(ev_end_rel - ev_start_rel):.2f}s)', color='white', pad=8, fontsize=11, fontweight='bold')
        ax2.set_ylabel('Voltage (mV)', color='white')
        ax2.legend(loc='upper right', facecolor='#16120e', edgecolor='#372c20')
        ax2.grid(True, color='#372c20', linestyle='--', alpha=0.5)

        # Bottom Panel: Spectrogram
        ax3.set_facecolor('#1e1812')
        dts = np.diff(times_rel)
        valid_dts = dts[dts > 0]
        fs = 1.0 / float(np.median(valid_dts)) if len(valid_dts) > 0 else 100.0

        clean_volts = np.nan_to_num(volts_arr, nan=0.0, posinf=0.0, neginf=0.0)
        nperseg = min(256, len(clean_volts))
        if nperseg < 2:
            nperseg = max(1, len(clean_volts))
        noverlap = nperseg // 2 if nperseg > 1 else 0
        f, t_spec, Sxx = signal.spectrogram(clean_volts, fs, nperseg=nperseg, noverlap=noverlap)
        Sxx_db = 10 * np.log10(Sxx + 1e-10)

        shading_mode = 'gouraud' if (len(t_spec) > 1 and len(f) > 1) else 'auto'
        pcm = ax3.pcolormesh(t_spec, f, Sxx_db, shading=shading_mode, cmap='magma')
        ax3.set_title('STFT Spectrogram (Time vs Frequency Heatmap)', color='white', pad=8, fontsize=11, fontweight='bold')
        ax3.set_ylabel('Frequency (Hz)', color='white')
        ax3.set_xlabel('Time (s)', color='white')

        cbar = fig.colorbar(pcm, ax=ax3, orientation='horizontal', pad=0.2, aspect=50)
        cbar.set_label('Power Spectral Density (dB)', color='white')
        cbar.ax.xaxis.set_tick_params(color='white')
        plt.setp(plt.getp(cbar.ax.axes, 'xticklabels'), color='white')

        for ax in [ax1, ax2, ax3]:
            for spine in ax.spines.values():
                spine.set_color('#372c20')
            ax.tick_params(colors='white')

        plt.tight_layout()

        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100, facecolor=fig.get_facecolor(), bbox_inches='tight')
        plt.close(fig)
        buf.seek(0)
        image_base64 = base64.b64encode(buf.read()).decode('utf-8')

        return {'ok': True, 'image': image_base64, 'image_base64': image_base64}

    except Exception as e:
        plt.close('all')
        return {'ok': False, 'reason': str(e)}


def generate_event_plot(file_objs, event_start_ms, event_end_ms):
    """Reads and combines readable CSV files, sorts their samples, then delegates plotting to `generate_event_plot_from_data()`."""
    try:
        # 1. Parse and stitch multiple files into a single continuous dataframe
        dataframes = []
        for f_obj in file_objs:
            try:
                if hasattr(f_obj, 'seek'):
                    f_obj.seek(0)
                fname = getattr(f_obj, 'name', None)
                df = pd.read_csv(f_obj, usecols=['timestamp', 'voltage'])
                if not df.empty:
                    df['timestamp'] = parse_timestamp_series(df['timestamp'], filename=fname)
                    dataframes.append(df)
            except Exception:
                pass

        if not dataframes:
            return {'ok': False, 'reason': 'All files in this chunk were unreadable'}

        master_df = pd.concat(dataframes, ignore_index=True)
        master_df = master_df.sort_values('timestamp').reset_index(drop=True)

        times_ms = master_df['timestamp'].astype('datetime64[ms]').astype('int64').values
        volts = master_df['voltage'].astype('float32').values

        return generate_event_plot_from_data(times_ms, volts, event_start_ms, event_end_ms)

    except Exception as e:
        return {'ok': False, 'reason': str(e)}


def process_geophone_chunk(file_objs, filenames):
    """Processes an array of uploaded CSV files as a single continuous time chunk."""
    dataframes = []
    missing_data_reports = []

    # 1. Parse and validate each file in the chunk
    for f_obj, fname in zip(file_objs, filenames):
        try:
            # Catch those 0 KB files or corrupted headers
            df = pd.read_csv(f_obj, usecols=['timestamp', 'voltage'])
            if df.empty:
                missing_data_reports.append(f"{fname}: Empty file (0 KB)")
                continue

            df['timestamp'] = parse_timestamp_series(df['timestamp'], filename=fname)
            dataframes.append(df)
        except Exception:
            missing_data_reports.append(f"{fname}: Corrupted or unreadable")

    if not dataframes:
        return {'ok': False, 'reason': 'All files in this interval were empty or corrupted.',
                'missing': missing_data_reports}

    # 2. Stitch, sort, and clean the continuous timeline
    master_df = pd.concat(dataframes, ignore_index=True)
    master_df = master_df.sort_values('timestamp').reset_index(drop=True)

    times_ms = master_df['timestamp'].astype('datetime64[ms]').astype('int64')
    master_df['voltage'] = master_df['voltage'].astype('float32')

    # 3. Detect Missing Time Gaps (> 65 seconds)
    dts = np.diff(times_ms.values)
    gap_indices = np.where(dts > 65000)[0]  # 65,000 milliseconds
    for idx in gap_indices:
        gap_start = pd.to_datetime(times_ms.iloc[idx], unit='ms').strftime('%H:%M:%S')
        gap_end = pd.to_datetime(times_ms.iloc[idx + 1], unit='ms').strftime('%H:%M:%S')
        gap_mins = dts[idx] / 60000
        missing_data_reports.append(f"Signal lost for {gap_mins:.1f} mins between {gap_start} and {gap_end}")

    # 4. Standard Anomaly Math (using your existing logic)
    valid_dts = dts[(dts > 0) & (dts < 2000)]
    median_dt = float(np.median(valid_dts)) if len(valid_dts) > 0 else 10.0
    win_size = int(max(16, min(200, round(300 / median_dt))))
    step = max(1, win_size // 2)

    master_df['abs_v'] = master_df['voltage'].abs()
    master_df['ema'] = master_df['abs_v'].ewm(span=win_size * 20, adjust=False).mean()
    master_df['sta'] = master_df['abs_v'].rolling(window=win_size, min_periods=1).mean()
    master_df['sta_lta'] = master_df['sta'] / (master_df['ema'] + 1e-9)

    df_blocks = master_df.iloc[::step].copy()
    df_blocks['variance'] = master_df['voltage'].rolling(window=win_size).var().iloc[::step]
    df_blocks['max_amp'] = master_df['abs_v'].rolling(window=win_size).max().iloc[::step]
    df_blocks['sta_lta_peak'] = master_df['sta_lta'].rolling(window=win_size).max().iloc[::step]
    df_blocks = df_blocks.dropna()

    df_blocks['score'] = (
            calculate_robust_z(df_blocks['variance']) +
            calculate_robust_z(df_blocks['max_amp']) +
            calculate_robust_z(df_blocks['sta_lta_peak'])
    )

    blocks = []
    for i, row in df_blocks.iterrows():
        blocks.append(
            {'s': max(0, i - win_size), 'e': i, 'time': float(times_ms.iloc[i]), 'score': float(row['score'])})

    _attach_block_suggestions(times_ms.tolist(), master_df['voltage'].tolist(), blocks)

    return {
        'ok': True,
        'times': times_ms.tolist(),
        'volts': master_df['voltage'].tolist(),
        'blocks': blocks,
        'missing_reports': missing_data_reports,
        'medianDt': median_dt,
        'sampleCount': len(master_df),
        'startTime': float(times_ms.iloc[0]),
        'endTime': float(times_ms.iloc[-1])
    }
