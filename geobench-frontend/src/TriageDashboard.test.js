import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import TriageDashboard from './pages/TriageDashboard';
import LocationModal from './components/LocationModal';
import LabeledData from './pages/LabeledData';
import Login from './pages/Login';
import Signup from './pages/Signup';
import GoogleAuthButton from './components/GoogleAuthButton';

const renderWithProviders = (ui) => {
    return render(
        <AuthProvider>
            <Router>
                {ui}
            </Router>
        </AuthProvider>
    );
};

describe('Auth Components', () => {
    test('renders Login page with standard login and Google Sign-In', () => {
        renderWithProviders(<Login />);

        expect(screen.getByText('GeoPhone Access')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter username or email')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
        expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
        expect(screen.getByText('Sign up')).toBeInTheDocument();
    });

    test('renders Signup page with registration inputs and Google Sign-Up', () => {
        renderWithProviders(<Signup />);

        expect(screen.getByRole('heading', { name: /Create Account/i })).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Choose a username')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('name@example.com')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Create password')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Confirm password')).toBeInTheDocument();
        expect(screen.getByText('Sign up with Google')).toBeInTheDocument();
        expect(screen.getByText('Sign In')).toBeInTheDocument();
    });

    test('renders GoogleAuthButton and opens modal when clicked in dev environment', () => {
        renderWithProviders(<GoogleAuthButton text="Continue with Google" />);

        const googleBtn = screen.getByText('Continue with Google');
        expect(googleBtn).toBeInTheDocument();

        fireEvent.click(googleBtn);
        expect(screen.getByText('Google Account Sign-In')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('alex.seismic@gmail.com')).toBeInTheDocument();
    });
});

describe('LocationModal Component', () => {
    const mockLocations = [
        { id: 1, name: 'Site Alpha', latitude: 37.77, longitude: -122.41, description: 'Test site', user_name: 'alice' },
        { id: 2, name: 'Site Beta', latitude: 34.05, longitude: -118.24, description: 'LA site' }
    ];

    test('renders locations list and create form', () => {
        renderWithProviders(
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
        expect(screen.getByText('by @alice')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('e.g. North Ridge Station')).toBeInTheDocument();
    });

    test('calls onSelectLocation when a location is clicked', () => {
        const onSelectMock = jest.fn();
        renderWithProviders(
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
        renderWithProviders(<TriageDashboard {...mockProps} />);

        expect(screen.getByText('Geophone Batch Analyzer')).toBeInTheDocument();
        expect(screen.getByText('Site Alpha')).toBeInTheDocument();
        expect(screen.getByText('+ Define Event')).toBeInTheDocument();
        expect(screen.getByText(/Import Files/i)).toBeInTheDocument();
        expect(screen.getByText(/List 1: Raw Files/i)).toBeInTheDocument();
        expect(screen.getByText(/List 2: Chunks/i)).toBeInTheDocument();
    });

    test('opens Define Event modal when clicking + Define Event', () => {
        renderWithProviders(<TriageDashboard {...mockProps} />);

        const defineBtn = screen.getByText('+ Define Event');
        fireEvent.click(defineBtn);

        expect(screen.getByText('📌 Define Custom Known Event')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/e.g. "Controlled Blast"/i)).toBeInTheDocument();
    });

    test('supports selecting and deselecting raw files in List 1', () => {
        renderWithProviders(<TriageDashboard {...mockProps} />);

        const fileItem = screen.getByText('geophone_2026-09-24_10-00-00.csv');
        // Select by mouse down
        fireEvent.mouseDown(fileItem.closest('.selectable-item'), { button: 0 });
        expect(screen.getByText('1 selected')).toBeInTheDocument();

        // Deselect by clicking again
        fireEvent.mouseDown(fileItem.closest('.selectable-item'), { button: 0 });
        expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
    });

    test('supports selecting and deselecting chunks in List 2', () => {
        renderWithProviders(<TriageDashboard {...mockProps} />);

        const chunkItem = screen.getByText('10m Chunk: 09/24 10:00');
        // Select chunk
        fireEvent.mouseDown(chunkItem.closest('.selectable-item'), { button: 0 });
        expect(screen.getByText('1 selected')).toBeInTheDocument();
        expect(screen.getAllByText('Clear').length).toBeGreaterThan(0);

        // Deselect chunk via clicking again
        fireEvent.mouseDown(chunkItem.closest('.selectable-item'), { button: 0 });
        expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
    });
});

describe('LabeledData Component', () => {
    test('renders curated training data header and table headers', () => {
        renderWithProviders(
            <LabeledData
                currentLocation={{ id: 1, name: 'Site Alpha' }}
                locations={[{ id: 1, name: 'Site Alpha' }]}
            />
        );

        expect(screen.getByText('Curated Training Data')).toBeInTheDocument();
        expect(screen.getByText('Location:')).toBeInTheDocument();
    });
});
