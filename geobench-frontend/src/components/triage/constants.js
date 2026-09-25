export const LABEL_OPTIONS = [
    '',
    'Footstep / foot traffic',
    'Vehicle',
    'Seismic event / tremor',
    'Wind / environmental',
    'Equipment / machinery',
    'Sensor artifact',
    'False positive',
    'Unknown',
    'natural_rockfall',
    'block_removal',
    'residual_scaling',
    'crew_activity',
    'sluicing',
    'sensor_status'
];

export const DEFAULT_THRESHOLD = 5;

export const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000';
