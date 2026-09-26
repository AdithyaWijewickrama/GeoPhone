import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import TriageDashboard from './pages/TriageDashboard';
import TriageHeader from './components/triage/TriageHeader';
import { classifyKnn } from './pages/Forecasting';
import LocationModal from './components/LocationModal';
import LabeledData from './pages/LabeledData';
import Login from './pages/Login';
import Signup from './pages/Signup';
import GoogleAuthButton from './components/GoogleAuthButton';
import ChunkDetail from './components/triage/ChunkDetail';
import DefineEventModal from './components/triage/DefineEventModal';
import LabelEventModal from './components/triage/LabelEventModal';
import WaveformChart from './components/triage/WaveformChart';
import FlaggedEventsTable from './components/triage/FlaggedEventsTable';
import RawFilesList from './components/triage/RawFilesList';
import KnownEventsList from './components/triage/KnownEventsList';
import SpectrogramModal from './components/triage/SpectrogramModal';
import { formatDateTime, toDatetimeLocalString, parseFilenameDate, getFileDateMs, getWaveformWindow } from './utils';

/** Renders dashboard UI inside the router, authentication, and theme providers. */
const renderWithProviders = (ui) => {
    return render(
        <ThemeProvider>
            <AuthProvider>
                <Router>
                    {ui}
                </Router>
            </AuthProvider>
        </ThemeProvider>
    );
};

beforeEach(() => {
    global.fetch = jest.fn((url) => {
        if (typeof url === 'string' && url.includes('/api/known-events/')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve([
                    {
                        id: 1,
                        name: 'Footsteps',
                        start_time: new Date('2026-09-24T10:00:00').getTime(),
                        end_time: new Date('2026-09-24T10:00:10').getTime(),
                        duration: 10,
                        note: 'Light footsteps near geophone',
                        location_name: 'Site Alpha'
                    }
                ])
            });
        }
        if (typeof url === 'string' && url.includes('/api/auth/me/')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ authenticated: true, user: { id: 1, username: 'testuser' } })
            });
        }
        if (typeof url === 'string' && url.includes('/api/locations/')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve([
                    { id: 1, name: 'Site Alpha', latitude: 37.77, longitude: -122.41 },
                    { id: 2, name: 'Site Beta', latitude: 34.05, longitude: -118.24 }
                ])
            });
        }
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ok: true })
        });
    });
});

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
        expect(screen.getByPlaceholderText('demo.user.google@gmail.com')).toBeInTheDocument();
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

    test('renders all available locations including unassigned ones in LocationModal', () => {
        const testLocations = [
            { id: 101, name: 'Station Alpha (User 1)', latitude: 10, longitude: 20, user_name: 'user1' },
            { id: 102, name: 'Station Beta (User 2)', latitude: 30, longitude: 40, user_name: 'user2' },
            { id: 103, name: 'Public Station Gamma', latitude: 50, longitude: 60, user_name: null }
        ];

        renderWithProviders(
            <LocationModal
                show={true}
                onClose={jest.fn()}
                locations={testLocations}
                currentLocation={testLocations[0]}
                onSelectLocation={jest.fn()}
                onLocationCreated={jest.fn()}
            />
        );

        expect(screen.getByText('Station Alpha (User 1)')).toBeInTheDocument();
        expect(screen.getByText('Station Beta (User 2)')).toBeInTheDocument();
        expect(screen.getByText('Public Station Gamma')).toBeInTheDocument();
    });
});

describe('TriageDashboard Main Component & Interactions', () => {
    const mockFiles = [
        new File(['timestamp,voltage\n2026-09-24 10:00:00,0.5\n'], '2026-09-24_10-00-00.csv', {
            type: 'text/csv',
            lastModified: new Date('2026-09-24T10:00:00').getTime()
        })
    ];

    const mockProps = {
        rawFiles: mockFiles,
        setRawFiles: jest.fn(),
        selectedKey: null,
        setSelectedKey: jest.fn(),
        labels: {},
        setLabels: jest.fn(),
        currentLocation: { id: 1, name: 'Site Alpha', latitude: 37.77, longitude: -122.41 },
        locations: [{ id: 1, name: 'Site Alpha', latitude: 37.77, longitude: -122.41 }],
        onOpenLocationModal: jest.fn(),
        onLocationCreated: jest.fn(),
        onSelectLocation: jest.fn()
    };

    test('renders TriageDashboard with header, List 1, List 2, and empty state prompt', () => {
        renderWithProviders(<TriageDashboard {...mockProps} />);

        expect(screen.getByText('Geophone Batch Analyzer')).toBeInTheDocument();
        expect(screen.getByText('Site Alpha')).toBeInTheDocument();
        expect(screen.getByText(/List 1: Raw Files/i)).toBeInTheDocument();
        expect(screen.getByText(/List 2: Known Events/i)).toBeInTheDocument();
        expect(screen.getByText(/No dataset or files selected/i)).toBeInTheDocument();
    });

    test('supports selecting raw files in List 1', () => {
        renderWithProviders(<TriageDashboard {...mockProps} />);

        const fileItem = screen.getByText('2026-09-24_10-00-00.csv');
        expect(fileItem).toBeInTheDocument();

        // Select file by clicking
        fireEvent.mouseDown(fileItem.closest('.selectable-item'), { button: 0 });
        expect(screen.getByText('1 selected')).toBeInTheDocument();

        // Deselect by clicking again
        fireEvent.mouseDown(fileItem.closest('.selectable-item'), { button: 0 });
        expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
    });

    test('locks import and clear controls after selecting a known event', async () => {
        renderWithProviders(<TriageDashboard {...mockProps} />);

        const selectEvent = await screen.findByText('Select in List 1 ➔');
        fireEvent.click(selectEvent.closest('.card'));

        await waitFor(() => {
            expect(screen.getByTitle('Import CSV Files')).toBeDisabled();
            expect(screen.getByTitle('Import Entire Folder')).toBeDisabled();
            expect(screen.getByTitle(/Exit the known-event selection/)).toBeDisabled();
        });
    });
});

describe('KnownEventsList Component (List 2)', () => {
    const mockEvents = [
        {
            id: 1,
            name: 'Footsteps',
            start_time: new Date('2026-04-16T23:00:00').getTime(),
            end_time: new Date('2026-04-16T23:00:15').getTime(),
            duration: 15,
            note: 'Approaching sensor',
            location_name: 'Site Alpha'
        },
        {
            id: 2,
            name: 'Controlled Blast',
            start_time: new Date('2026-04-16T22:00:00').getTime(),
            end_time: new Date('2026-04-16T22:00:05').getTime(),
            duration: 5,
            note: 'Quarry detonation',
            location_name: 'Site Alpha'
        }
    ];

    test('renders known events with name, date/time, duration, and notes in small text', () => {
        const onSelectMock = jest.fn();
        renderWithProviders(
            <KnownEventsList
                knownEvents={mockEvents}
                selectedKnownEventId={null}
                onSelectKnownEvent={onSelectMock}
                onOpenDefineEventModal={jest.fn()}
                onRefreshKnownEvents={jest.fn()}
                rawFiles={[]}
                loading={false}
            />
        );

        expect(screen.getByText('List 2: Known Events (2)')).toBeInTheDocument();
        expect(screen.getByText('📌 Footsteps')).toBeInTheDocument();
        expect(screen.getByText('📌 Controlled Blast')).toBeInTheDocument();
        expect(screen.getByText(/Approaching sensor/i)).toBeInTheDocument();
        expect(screen.getByText(/Quarry detonation/i)).toBeInTheDocument();
        expect(screen.getByText('⏱️ 15.00s')).toBeInTheDocument();
        expect(screen.getByText('⏱️ 5.00s')).toBeInTheDocument();

        // Click event card
        const footstepsCard = screen.getByText('📌 Footsteps');
        fireEvent.click(footstepsCard.closest('.card'));
        expect(onSelectMock).toHaveBeenCalledWith(mockEvents[0]);
    });

    test('filters known events using search input', () => {
        renderWithProviders(
            <KnownEventsList
                knownEvents={mockEvents}
                selectedKnownEventId={null}
                onSelectKnownEvent={jest.fn()}
                onOpenDefineEventModal={jest.fn()}
                onRefreshKnownEvents={jest.fn()}
                rawFiles={[]}
                loading={false}
            />
        );

        const searchInput = screen.getByPlaceholderText(/Filter known events/i);
        fireEvent.change(searchInput, { target: { value: 'Blast' } });

        expect(screen.getByText('📌 Controlled Blast')).toBeInTheDocument();
        expect(screen.queryByText('📌 Footsteps')).not.toBeInTheDocument();
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

describe('ChunkDetail Component', () => {
    const mockChunk = {
        key: 'chunk_1',
        name: 'Dataset: Test',
        startTime: 1727172000000,
        endTime: 1727172600000,
        status: 'flagged',
        raw: {
            volts: [0.1, 0.2, 0.5, 0.1],
            times: [1727172000000, 1727172001000, 1727172002000, 1727172003000],
            blocks: [
                { time: 1727172000000, score: 6.2 },
                { time: 1727172001000, score: 7.1 }
            ]
        }
    };

    test('renders waveform chart card with analyzed range and flagged events table with view plot', () => {
        renderWithProviders(
            <ChunkDetail
                chunk={mockChunk}
                labels={{}}
                onSaveLabel={jest.fn()}
                setLabels={jest.fn()}
                currentLocation={{ id: 1, name: 'Site Alpha' }}
                onRefreshKnownEvents={jest.fn()}
            />
        );

        expect(screen.getByText('Combined Signal Waveform & Detection Anomaly Score')).toBeInTheDocument();
        expect(screen.getByText(/Analyzed Range:/i)).toBeInTheDocument();
        expect(screen.getByText(/Flagged Events/i)).toBeInTheDocument();
        expect(screen.getAllByText(/View Plot/i).length).toBeGreaterThan(0);
    });

    test('shows selected known-event details above chart analysis', () => {
        renderWithProviders(
            <ChunkDetail
                chunk={mockChunk}
                knownEvent={{
                    name: 'Footsteps',
                    start_time: mockChunk.startTime,
                    end_time: mockChunk.startTime + 10000,
                    duration: 10,
                    trust_score: 82,
                    note: 'Near the north sensor'
                }}
                labels={{}}
                onSaveLabel={jest.fn()}
                setLabels={jest.fn()}
                currentLocation={null}
            />
        );

        expect(screen.getByLabelText('Selected known event details')).toBeInTheDocument();
        expect(screen.getByText('Footsteps')).toBeInTheDocument();
        expect(screen.getByText('Trust 82/100')).toBeInTheDocument();
        expect(screen.getByText('Near the north sensor')).toBeInTheDocument();
    });

    test('displays analysis failed message for corrupted chunk', () => {
        renderWithProviders(
            <ChunkDetail
                chunk={{ key: 'c_err', name: 'Error chunk', status: 'corrupted', missing_reports: ['Corrupted headers'] }}
                labels={{}}
                onSaveLabel={jest.fn()}
                setLabels={jest.fn()}
                currentLocation={null}
                onRefreshKnownEvents={jest.fn()}
            />
        );

        expect(screen.getByText('Analysis Failed')).toBeInTheDocument();
        expect(screen.getByText('• Corrupted headers')).toBeInTheDocument();
    });
});

describe('TriageHeader known-event selection lock', () => {
    test('disables import, scan-all, and clear controls while a known event is selected', () => {
        render(
            <TriageHeader
                onOpenDefineModal={jest.fn()}
                onFilesSelected={jest.fn()}
                fileInputRef={{ current: null }}
                folderInputRef={{ current: null }}
                onScanAll={jest.fn()}
                scanning={false}
                fileCount={2}
                onClear={jest.fn()}
                knownEventSelected
            />
        );

        expect(screen.getByTitle('Import CSV Files')).toBeDisabled();
        expect(screen.getByTitle('Import Entire Folder')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Scan All' })).toBeDisabled();
        expect(screen.getByTitle(/Exit the known-event selection/)).toBeDisabled();
    });
});

describe('DefineEventModal Component', () => {
    test('renders form fields and handles event name input', () => {
        renderWithProviders(
            <DefineEventModal
                show={true}
                onClose={jest.fn()}
                currentLocation={{ id: 1, name: 'Site Alpha' }}
                locations={[{ id: 1, name: 'Site Alpha' }]}
                onOpenLocationModal={jest.fn()}
                user={{ id: 1, username: 'tester' }}
                onEventCreated={jest.fn()}
            />
        );

        expect(screen.getByText('📌 Define Custom Known Event')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Controlled Blast/i)).toBeInTheDocument();
        expect(screen.getByText('Save Known Event Rule')).toBeInTheDocument();
        expect(screen.getByText('Site Alpha')).toBeInTheDocument();
    });

    test('loads and displays available locations in select dropdown', () => {
        const mockAvailableLocations = [
            { id: 10, name: 'Base Station 1' },
            { id: 11, name: 'Base Station 2' }
        ];

        renderWithProviders(
            <DefineEventModal
                show={true}
                onClose={jest.fn()}
                currentLocation={mockAvailableLocations[0]}
                locations={mockAvailableLocations}
                onOpenLocationModal={jest.fn()}
                user={{ id: 1, username: 'tester' }}
                onEventCreated={jest.fn()}
            />
        );

        expect(screen.getByText('Base Station 1')).toBeInTheDocument();
        expect(screen.getByText('Base Station 2')).toBeInTheDocument();
    });
});

describe('FlaggedEventsTable Component', () => {
    const mockEvents = [
        { startTime: 1727172000000, endTime: 1727172010000, peakScore: 8.5 },
        { startTime: 1727172015000, endTime: 1727172025000, peakScore: 7.2 }
    ];

    test('renders table header with View Plot and Label Event actions', () => {
        const onOpenLabelMock = jest.fn();
        const onViewPlotMock = jest.fn();

        renderWithProviders(
            <FlaggedEventsTable
                currentEvents={mockEvents}
                chunk={{ key: 'c1', name: 'chunk1' }}
                labels={{}}
                onSaveLabel={jest.fn()}
                setLabels={jest.fn()}
                selectedTableEvents={new Set([0])}
                setSelectedTableEvents={jest.fn()}
                onOpenLabelModal={onOpenLabelMock}
                onViewPlot={onViewPlotMock}
                isDraggingTable={false}
                setIsDraggingTable={jest.fn()}
                dragTableStart={null}
                setDragTableStart={jest.fn()}
                dragTableDeselect={false}
                setDragTableDeselect={jest.fn()}
            />
        );

        const viewPlotBtn = screen.getByRole('button', { name: /View Plot/i });
        expect(viewPlotBtn).toBeInTheDocument();
        expect(viewPlotBtn).not.toBeDisabled();

        fireEvent.click(viewPlotBtn);
        expect(onViewPlotMock).toHaveBeenCalledWith(expect.objectContaining({
            startTime: 1727172000000,
            endTime: 1727172010000
        }));

        const labelBtn = screen.getByRole('button', { name: /Label Event/i });
        expect(labelBtn).toBeInTheDocument();
        expect(labelBtn).not.toBeDisabled();

        fireEvent.click(labelBtn);
        expect(onOpenLabelMock).toHaveBeenCalled();
    });

    test('renders filter badge when table is filtered by waveform zoom', () => {
        const onResetMock = jest.fn();
        renderWithProviders(
            <FlaggedEventsTable
                currentEvents={[mockEvents[0]]}
                chunk={{ key: 'c1', name: 'chunk1' }}
                labels={{}}
                onSaveLabel={jest.fn()}
                setLabels={jest.fn()}
                selectedTableEvents={new Set()}
                setSelectedTableEvents={jest.fn()}
                onOpenLabelModal={jest.fn()}
                onViewPlot={jest.fn()}
                isFilteredByWaveform={true}
                totalUnfilteredCount={5}
                onResetWaveformFilter={onResetMock}
            />
        );

        expect(screen.getByText(/Zoom Filtered \(1 of 5\)/i)).toBeInTheDocument();
        const resetBtn = screen.getByText(/Show All/i);
        fireEvent.click(resetBtn);
        expect(onResetMock).toHaveBeenCalled();
    });

    test('loads saved labels using the chunk name and rounded event timestamps', () => {
        const event = mockEvents[0];
        renderWithProviders(
            <FlaggedEventsTable
                currentEvents={[event]}
                chunk={{ key: 'scanned_1', name: 'chunk1' }}
                labels={{ [`chunk1_${Math.round(event.startTime)}_${Math.round(event.endTime)}`]: { label: 'Vehicle' } }}
                onSaveLabel={jest.fn()}
                setLabels={jest.fn()}
                selectedTableEvents={new Set()}
                setSelectedTableEvents={jest.fn()}
            />
        );

        expect(screen.getByDisplayValue('Vehicle')).toBeInTheDocument();
    });
});

describe('LabelEventModal persistence', () => {
    const bounds = {
        count: 1,
        minStart: 1727172000000,
        maxEnd: 1727172010000,
        startFormatted: '2024-09-24 10:00:00',
        endFormatted: '2024-09-24 10:00:10',
        durationFormatted: '10s',
        events: []
    };

    test('saves the chosen label without checking for collisions', async () => {
        const onSave = jest.fn().mockResolvedValue(undefined);
        render(
            <LabelEventModal
                show
                onClose={jest.fn()}
                bounds={bounds}
                onSave={onSave}
                waveform={{ times: [], volts: [] }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Save Label' }));

        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
            finalLabel: expect.any(String),
            bounds
        })));
        expect(global.fetch).not.toHaveBeenCalledWith(
            expect.stringContaining('/api/known-events/check-collision/'),
            expect.anything()
        );
    });

    test('keeps the modal open and displays database save errors', async () => {
        const onSave = jest.fn().mockRejectedValue(new Error('Database unavailable'));
        render(
            <LabelEventModal
                show
                onClose={jest.fn()}
                bounds={bounds}
                onSave={onSave}
                waveform={{ times: [], volts: [] }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Save Label' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
        expect(screen.getByRole('button', { name: 'Save Label' })).toBeInTheDocument();
    });
});

describe('WaveformChart Component', () => {
    const mockChunk = {
        key: 'c1',
        name: 'test_chunk',
        startTime: 1727172000000,
        endTime: 1727172060000,
        raw: {
            volts: [0.1, 0.2, 0.5, 0.1, 0.3],
            times: [1727172000000, 1727172001000, 1727172002000, 1727172003000, 1727172004000],
            blocks: [{ time: 1727172000000, score: 6.2 }]
        }
    };

    test('renders analyzed date/time near threshold and View Waveform Plot button', () => {
        const onViewPlotMock = jest.fn();
        renderWithProviders(
            <WaveformChart
                chunk={mockChunk}
                threshold={5.0}
                setThreshold={jest.fn()}
                onViewPlot={onViewPlotMock}
            />
        );

        expect(screen.getByText(/Analyzed Range:/i)).toBeInTheDocument();
        expect(screen.getByText('Threshold:')).toBeInTheDocument();
        const viewWaveformPlotBtn = screen.getByText('View Waveform Plot');
        expect(viewWaveformPlotBtn).toBeInTheDocument();

        fireEvent.click(viewWaveformPlotBtn);
        expect(onViewPlotMock).toHaveBeenCalled();
    });

    test('renders dynamic time frame presets and zoom toolbar', () => {
        renderWithProviders(
            <WaveformChart
                chunk={mockChunk}
                threshold={5.0}
                setThreshold={jest.fn()}
            />
        );

        expect(screen.getByText(/Time Frame:/i)).toBeInTheDocument();
        expect(screen.getByText(/Full/i)).toBeInTheDocument();
        expect(screen.getByText('10s')).toBeInTheDocument();
        expect(screen.getByText('30s')).toBeInTheDocument();
        expect(screen.getByText('1m')).toBeInTheDocument();
        expect(screen.getByTitle('Zoom In (+)')).toBeInTheDocument();
        expect(screen.getByTitle('Zoom Out (-)')).toBeInTheDocument();
        expect(screen.getByTitle('Reset Zoom to 100%')).toBeInTheDocument();
        expect(screen.getByTitle('Pan Left (Shift view earlier)')).toBeInTheDocument();
        expect(screen.getByTitle('Pan Right (Shift view later)')).toBeInTheDocument();
    });

    test('focuses the analyzed range on selected known-event timestamps', () => {
        const focusStartTime = mockChunk.startTime + 2000;
        const focusEndTime = mockChunk.startTime + 4000;
        renderWithProviders(
            <WaveformChart
                chunk={{ ...mockChunk, focusStartTime, focusEndTime }}
                threshold={5}
                setThreshold={jest.fn()}
            />
        );

        expect(screen.getByText(formatDateTime(focusStartTime))).toBeInTheDocument();
        expect(screen.getByText(formatDateTime(focusEndTime))).toBeInTheDocument();
    });
});

describe('SpectrogramModal Component', () => {
    test('renders spectrogram modal with image and download button', () => {
        const onCloseMock = jest.fn();
        renderWithProviders(
            <SpectrogramModal
                plotModal={{
                    visible: true,
                    loading: false,
                    image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                    error: null,
                    title: 'Test Spectrogram'
                }}
                onClose={onCloseMock}
            />
        );

        expect(screen.getByText('Event Analysis & Spectrogram')).toBeInTheDocument();
        expect(screen.getByText('Test Spectrogram')).toBeInTheDocument();
        expect(screen.getByAltText('Event Spectrogram')).toBeInTheDocument();
        expect(screen.getByText('💾 Download Plot')).toBeInTheDocument();
    });
});

describe('Known Events Edit & Delete in Dashboard and Modals', () => {
    test('renders KnownEventsList with Edit and Delete buttons and fires handlers', () => {
        const onEditMock = jest.fn();
        const onDeleteMock = jest.fn();
        const onSelectMock = jest.fn();

        const mockEvents = [
            {
                id: 101,
                name: 'Explosion Blast',
                start_time: new Date('2026-09-24T12:00:00').getTime(),
                end_time: new Date('2026-09-24T12:00:15').getTime(),
                duration: 15,
                note: 'Quarry detonation',
                location_name: 'Site Alpha'
            }
        ];

        renderWithProviders(
            <KnownEventsList
                knownEvents={mockEvents}
                selectedKnownEventId={null}
                onSelectKnownEvent={onSelectMock}
                onOpenDefineEventModal={jest.fn()}
                onEditKnownEvent={onEditMock}
                onDeleteKnownEvent={onDeleteMock}
                onRefreshKnownEvents={jest.fn()}
                rawFiles={[]}
                loading={false}
            />
        );

        expect(screen.getByText(/Explosion Blast/i)).toBeInTheDocument();
        expect(screen.getByText('Site Alpha')).toBeInTheDocument();
        expect(screen.getByText(/Quarry detonation/i)).toBeInTheDocument();

        // Edit button
        const editBtn = screen.getByRole('button', { name: /Edit/i });
        expect(editBtn).toBeInTheDocument();
        fireEvent.click(editBtn);
        expect(onEditMock).toHaveBeenCalledWith(mockEvents[0]);

        // Delete button
        const deleteBtn = screen.getByRole('button', { name: /🗑️/i });
        expect(deleteBtn).toBeInTheDocument();
        fireEvent.click(deleteBtn);
        expect(onDeleteMock).toHaveBeenCalledWith(mockEvents[0]);
    });

    test('renders DefineEventModal in Edit mode with pre-filled fields, Save Changes and Delete button', () => {
        const onCloseMock = jest.fn();
        const onEventCreatedMock = jest.fn();
        const onDeleteEventMock = jest.fn();

        const eventToEdit = {
            id: 202,
            name: 'P-Wave Arrival',
            start_time: new Date('2026-09-24T14:30:00').getTime(),
            end_time: new Date('2026-09-24T14:30:20').getTime(),
            duration: 20,
            note: 'Initial tremor',
            location_id: 1
        };

        renderWithProviders(
            <DefineEventModal
                show={true}
                onClose={onCloseMock}
                currentLocation={{ id: 1, name: 'Site Alpha' }}
                locations={[{ id: 1, name: 'Site Alpha' }]}
                onOpenLocationModal={jest.fn()}
                user={{ id: 1, username: 'testuser', display_name: 'Demo user google' }}
                onEventCreated={onEventCreatedMock}
                eventToEdit={eventToEdit}
                onDeleteEvent={onDeleteEventMock}
            />
        );

        expect(screen.getByText('Edit Known Event')).toBeInTheDocument();
        expect(screen.getByDisplayValue('P-Wave Arrival')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Initial tremor')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
    });
});

describe('RawFilesList Days, Hours & Minutes Layout', () => {
    const mockFiles = [
        new File([''], '2026-04-23_10-00-00.csv', { lastModified: new Date('2026-04-23T10:00:00').getTime() }),
        new File([''], '2026-04-17_15-00-00.csv', { lastModified: new Date('2026-04-17T15:00:00').getTime() }),
        new File([''], '2026-04-16_23-59-00.csv', { lastModified: new Date('2026-04-16T23:59:00').getTime() }),
        new File([''], '2026-04-16_23-00-00.csv', { lastModified: new Date('2026-04-16T23:00:00').getTime() }),
        new File([''], '2026-04-16_22-00-00.csv', { lastModified: new Date('2026-04-16T22:00:00').getTime() }),
        new File([''], '2026-04-16_21-00-00.csv', { lastModified: new Date('2026-04-16T21:00:00').getTime() })
    ];

    const mockKnownEvents = [
        {
            id: 1,
            name: 'Blast A',
            start_time: new Date('2026-04-16T23:59:00').getTime(),
            end_time: new Date('2026-04-16T23:59:30').getTime()
        }
    ];

    test('renders Days, Hours, and Minutes columns with counts and known event indicators', () => {
        const setSelectedMock = jest.fn();
        renderWithProviders(
            <RawFilesList
                rawFiles={mockFiles}
                showList1={true}
                setShowList1={jest.fn()}
                selectedRawIndices={new Set()}
                setSelectedRawIndices={setSelectedMock}
                rawSelectionInfo={null}
                analyzingSelection={false}
                onAnalyzeRawSelection={jest.fn()}
                isDraggingRaw={false}
                setIsDraggingRaw={jest.fn()}
                dragRawStart={null}
                setDragRawStart={jest.fn()}
                dragRawDeselect={false}
                setDragRawDeselect={jest.fn()}
                knownEvents={mockKnownEvents}
            />
        );

        // Days header & count
        expect(screen.getByText('Days')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('2026-04-23')).toBeInTheDocument();
        expect(screen.getByText('2026-04-17')).toBeInTheDocument();
        expect(screen.getByText('2026-04-16')).toBeInTheDocument();
        expect(screen.getByText('Newest day top')).toBeInTheDocument();

        // Hours header
        expect(screen.getByText('Hours')).toBeInTheDocument();

        // Minutes header
        expect(screen.getByText('Minutes')).toBeInTheDocument();

        // Click Day 2026-04-16
        const day16 = screen.getByText('2026-04-16');
        fireEvent.click(day16);

        expect(screen.getAllByText('23:00').length).toBeGreaterThan(0);
        expect(screen.getByText('22:00')).toBeInTheDocument();
        expect(screen.getByText('21:00')).toBeInTheDocument();

        // Click Hour 23:00 to see minutes
        const hour23 = screen.getAllByText('23:00')[0];
        fireEvent.click(hour23);

        expect(screen.getByText('23:59')).toBeInTheDocument();
        expect(screen.getAllByText('23:00').length).toBeGreaterThan(0);

        // Click Minute 23:59 to toggle selection
        const min59 = screen.getByText('23:59');
        fireEvent.click(min59);
        expect(setSelectedMock).toHaveBeenCalled();
    });
});

describe('Timestamp Parsing & Formatting (2026 Dates)', () => {
    test('extracts only waveform samples inside the requested interval', () => {
        expect(getWaveformWindow(
            [1000, 2000, 3000, 4000, 5000],
            [10, 20, 30, 40, 50],
            2000,
            4000
        )).toEqual({
            times: [2000, 3000, 4000],
            volts: [20, 30, 40]
        });
    });

    test('parseFilenameDate extracts correct 2026 dates from various filename patterns', () => {
        const d1 = parseFilenameDate('geophone_2026-07-29_21-58-26.csv');
        expect(d1.getFullYear()).toBe(2026);
        expect(d1.getMonth() + 1).toBe(7);
        expect(d1.getDate()).toBe(29);
        expect(d1.getHours()).toBe(21);
        expect(d1.getMinutes()).toBe(58);
        expect(d1.getSeconds()).toBe(26);

        const d2 = parseFilenameDate('data_20260924_100000.csv');
        expect(d2.getFullYear()).toBe(2026);
        expect(d2.getMonth() + 1).toBe(9);
        expect(d2.getDate()).toBe(24);
    });

    test('formatDateTime and toDatetimeLocalString never format as 1970 for 2026 epoch inputs', () => {
        const epochMs2026 = 1787600000000;
        const formatted = formatDateTime(epochMs2026);
        expect(formatted).toMatch(/^2026-/);

        const epochSec2026 = 1787600000;
        const formattedSec = formatDateTime(epochSec2026);
        expect(formattedSec).toMatch(/^2026-/);

        const localStr = toDatetimeLocalString(epochMs2026);
        expect(localStr).toMatch(/^2026-/);
    });
});

describe('Forecasting KNN classifier', () => {
    test('predicts a label from the majority class among normalized nearest neighbors', () => {
        const result = classifyKnn([
            { label: 'Footstep', duration: 1, peakScore: 4 },
            { label: 'Footstep', duration: 2, peakScore: 5 },
            { label: 'Vehicle', duration: 9, peakScore: 10 }
        ], 1.5, 4.5, 3);

        expect(result.label).toBe('Footstep');
        expect(result.k).toBe(3);
        expect(result.confidence).toBeCloseTo(2 / 3);
        expect(result.neighbors).toHaveLength(3);
    });

    test('limits K to the available labeled samples', () => {
        const result = classifyKnn([
            { label: 'Rockfall', duration: 3, peakScore: 8 }
        ], 3, 8, 5);

        expect(result.label).toBe('Rockfall');
        expect(result.k).toBe(1);
        expect(result.confidence).toBe(1);
    });
});
