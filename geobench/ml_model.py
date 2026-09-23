import pandas as pd
import numpy as np


def calculate_robust_z(series):
    median = series.median()
    mad = (series - median).abs().median()
    mad = mad if mad > 1e-9 else 1e-6
    return ((series - median) / (mad * 1.4826)).clip(lower=0)


def process_geophone_csv(file_obj):
    try:
        df = pd.read_csv(file_obj, usecols=['timestamp', 'voltage'])
        df['timestamp'] = pd.to_datetime(df['timestamp'])

        times_ms = df['timestamp'].astype('int64') // 10 ** 6
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


import io
import base64
import matplotlib

matplotlib.use('Agg')  # Use server-side rendering
import matplotlib.pyplot as plt
from scipy import signal

import io
import base64
import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy import signal
import pandas as pd
import numpy as np


def generate_event_plot(file_objs, event_start_ms, event_end_ms):
    try:
        # 1. Parse and stitch multiple files into a single continuous dataframe
        dataframes = []
        for f_obj in file_objs:
            try:
                df = pd.read_csv(f_obj, usecols=['timestamp', 'voltage'])
                if not df.empty:
                    df['timestamp'] = pd.to_datetime(df['timestamp'])
                    dataframes.append(df)
            except Exception:
                pass

        if not dataframes:
            return {'ok': False, 'reason': 'All files in this chunk were unreadable'}

        master_df = pd.concat(dataframes, ignore_index=True)
        master_df = master_df.sort_values('timestamp').reset_index(drop=True)

        times_s = (master_df['timestamp'].astype('int64') // 10 ** 6).values / 1000.0
        volts = master_df['voltage'].astype('float32').values

        start_s = times_s[0]
        times_rel = times_s - start_s

        ev_start_rel = (float(event_start_ms) / 1000.0) - start_s
        ev_end_rel = (float(event_end_ms) / 1000.0) - start_s

        # Add padding to the zoomed view (e.g., 2 seconds on each side)
        pad = 2.0
        zoom_mask = (times_rel >= (ev_start_rel - pad)) & (times_rel <= (ev_end_rel + pad))
        z_times = times_rel[zoom_mask]
        z_volts = volts[zoom_mask]

        # 2. Setup Plot Style
        plt.style.use('dark_background')
        fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(12, 9), gridspec_kw={'height_ratios': [1, 1, 1.2]})
        fig.patch.set_facecolor('#16120e')

        # Top Panel: Full Waveform
        ax1.set_facecolor('#1e1812')
        ax1.plot(times_rel, volts, color='#348abd', linewidth=0.5)
        ax1.axvspan(ev_start_rel, ev_end_rel, color='red', alpha=0.3, label='Zoom Window')
        ax1.set_title(f'[enhanced] Time-Domain Waveform | Window: 0.0s to {times_rel[-1]:.1f}s', color='white', pad=10)
        ax1.set_ylabel('Voltage (mV)')
        ax1.legend(loc='upper right', facecolor='#16120e', edgecolor='#372c20')
        ax1.grid(True, color='#372c20', linestyle='--', alpha=0.5)

        # Middle Panel: Zoomed Event
        ax2.set_facecolor('#1e1812')

        # Guard against empty zoom arrays if the event falls perfectly in a data gap
        if len(z_times) > 0 and len(z_volts) > 0:
            ax2.plot(z_times, z_volts, color='#d9604a', linewidth=1)
            # Mark Peak
            peak_idx = np.argmax(np.abs(z_volts))
            peak_t = z_times[peak_idx]
            peak_v = z_volts[peak_idx]
            ax2.plot(peak_t, peak_v, 'yo', label=f'Peak: {peak_v:.2f} mV')

        ax2.set_title(f'Zoomed Event View (t = {ev_start_rel:.1f}s to {ev_end_rel:.1f}s)', color='white', pad=10)
        ax2.set_ylabel('Voltage (mV)')
        ax2.legend(loc='upper right', facecolor='#16120e', edgecolor='#372c20')
        ax2.grid(True, color='#372c20', linestyle='--', alpha=0.5)

        # Bottom Panel: Spectrogram
        ax3.set_facecolor('#1e1812')

        # Safely calculate sampling frequency (prevent division by zero)
        dts = np.diff(times_rel)
        valid_dts = dts[dts > 0]
        fs = 1.0 / np.median(valid_dts) if len(valid_dts) > 0 else 100.0

        # Clean voltage array (prevent NaNs from breaking the Fourier Transform)
        clean_volts = np.nan_to_num(volts, nan=0.0, posinf=0.0, neginf=0.0)

        # Generate spectrogram
        f, t_spec, Sxx = signal.spectrogram(clean_volts, fs, nperseg=256, noverlap=128)

        # Convert to dB, handling zeros securely
        Sxx_db = 10 * np.log10(Sxx + 1e-10)

        pcm = ax3.pcolormesh(t_spec, f, Sxx_db, shading='gouraud', cmap='magma')
        ax3.set_title('STFT Spectrogram (Time vs Frequency Heatmap)', color='white', pad=10)
        ax3.set_ylabel('Frequency (Hz)')
        ax3.set_xlabel('Time (s)')

        # Add colorbar
        cbar = fig.colorbar(pcm, ax=ax3, orientation='horizontal', pad=0.2, aspect=50)
        cbar.set_label('Power Spectral Density (dB)', color='white')
        cbar.ax.xaxis.set_tick_params(color='white')
        plt.setp(plt.getp(cbar.ax.axes, 'xticklabels'), color='white')

        # Format borders
        for ax in [ax1, ax2, ax3]:
            for spine in ax.spines.values():
                spine.set_color('#372c20')
            ax.tick_params(colors='white')

        plt.tight_layout()

        # 3. Export to Base64
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100, facecolor=fig.get_facecolor(), bbox_inches='tight')
        plt.close(fig)
        buf.seek(0)
        image_base64 = base64.b64encode(buf.read()).decode('utf-8')

        return {'ok': True, 'image': image_base64}

    except Exception as e:
        return {'ok': False, 'reason': str(e)}


import pandas as pd
import numpy as np


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

            df['timestamp'] = pd.to_datetime(df['timestamp'])
            dataframes.append(df)
        except Exception:
            missing_data_reports.append(f"{fname}: Corrupted or unreadable")

    if not dataframes:
        return {'ok': False, 'reason': 'All files in this interval were empty or corrupted.',
                'missing': missing_data_reports}

    # 2. Stitch, sort, and clean the continuous timeline
    master_df = pd.concat(dataframes, ignore_index=True)
    master_df = master_df.sort_values('timestamp').reset_index(drop=True)

    times_ms = master_df['timestamp'].astype('int64') // 10 ** 6
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
