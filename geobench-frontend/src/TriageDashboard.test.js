import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TriageDashboard from './pages/TriageDashboard';
import LocationModal from './components/LocationModal';
import LabeledData from './pages/LabeledData';

describe('LocationModal Component', () => {
    const mockLocations = [
        { id: 1, name: 'Site Alpha', latitude: 37.77, longitude: -122.41, description: 'Test site' },
        { id: 2, name: 'Site Beta', latitude: 34.05, longitude: -118.24, description: 'LA site' }
    ];

    test('renders locations list and create form', () => {
        render(
            <LocationModal
                show={true}
                onClose={jest.fn()}
                locations={mockLocations}
                currentLocation={mockLocations[0]}
                onSelectLocation={jest.fn()}
                onLocationCreated={jest.fn()}
            />
        );

        expect(screen.getByText('📍 Select or Create Location')).toBeInTheDocument();
        expect(screen.getByText('Site Alpha')).toBeInTheDocument();
        expect(screen.getByText('Site Beta')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('e.g. North Ridge Station')).toBeInTheDocument();
    });

    test('calls onSelectLocation when a location is clicked', () => {
        const onSelectMock = jest.fn();
        render(
            <LocationModal
                show={true}
                onClose={jest.fn()}
                locations={mockLocations}
                currentLocation={null}
                onSelectLocation={onSelectMock}
                onLocationCreated={jest.fn()}
            />
        );

        const selectButtons = screen.getAllByText('Select');
        fireEvent.click(selectButtons[0]);
        expect(onSelectMock).toHaveBeenCalledWith(mockLocations[0]);
    });
});

describe('TriageDashboard Component', () => {
    const mockProps = {
        rawFiles: [
            new File(['timestamp,voltage\n2026-09-24 10:00:00,0.5\n'], 'geophone_2026-09-24_10-00-00.csv', { type: 'text/csv' }),
            new File(['timestamp,voltage\n2026-09-24 10:00:10,0.6\n'], 'geophone_2026-09-24_10-00-10.csv', { type: 'text/csv' })
        ],
        setRawFiles: jest.fn(),
        chunks: [
            {
                key: 'chunk_1',
                name: '10m Chunk: 09/24 10:00',
                timeMs: 1727172000000,
                files: [],
                status: 'pending',
                isCustom: false
            }
        ],
        setChunks: jest.fn(),
        selectedKey: 'chunk_1',
        setSelectedKey: jest.fn(),
        labels: {},
        setLabels: jest.fn(),
        intervalMins: 10,
        setIntervalMins: jest.fn(),
        currentLocation: { id: 1, name: 'Site Alpha', latitude: 37.77, longitude: -122.41 },
        locations: [{ id: 1, name: 'Site Alpha' }],
        onOpenLocationModal: jest.fn(),
        onLocationCreated: jest.fn(),
        onSelectLocation: jest.fn()
    };

    test('renders dashboard headers, location badge, import files, and lists', () => {
        render(<TriageDashboard {...mockProps} />);

        expect(screen.getByText('Geophone Batch Analyzer')).toBeInTheDocument();
        expect(screen.getByText('Site Alpha')).toBeInTheDocument();
        expect(screen.getByText('+ Define Event')).toBeInTheDocument();
        expect(screen.getByText(/Import Files/i)).toBeInTheDocument();
        expect(screen.getByText(/List 1: Raw Files/i)).toBeInTheDocument();
        expect(screen.getByText(/List 2: Chunks/i)).toBeInTheDocument();
    });

    test('opens Define Event modal when clicking + Define Event', () => {
        render(<TriageDashboard {...mockProps} />);

        const defineBtn = screen.getByText('+ Define Event');
        fireEvent.click(defineBtn);

        expect(screen.getByText('📌 Define Custom Known Event')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/e.g. "Controlled Blast"/i)).toBeInTheDocument();
    });
});

describe('LabeledData Component', () => {
    test('renders curated training data header and table headers', () => {
        render(
            <LabeledData
                currentLocation={{ id: 1, name: 'Site Alpha' }}
                locations={[{ id: 1, name: 'Site Alpha' }]}
            />
        );

        expect(screen.getByText('Curated Training Data')).toBeInTheDocument();
        expect(screen.getByText('Filter Location:')).toBeInTheDocument();
    });
});
