export const LABEL_OPTIONS = [
    '',
    'Footstep / foot traffic',
    'Vehicle',
    'Seismic event / tremor',
    'Wind / environmental',
    'Equipment / machinery',
    'Sensor artifact',
    'False positive',
    'Natural Rockfall',
    'Block Removal',
    'Residual Scaling',
    'Crew Activity',
    'Sluicing',
    'Sensor Status',
    'Unknown',
];

export const DEFAULT_THRESHOLD = 5;

export const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000';
