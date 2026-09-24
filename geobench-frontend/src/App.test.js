import {render, screen, waitFor} from '@testing-library/react';
import App from './App';

test('renders GeoPhone Platform brand', () => {
    render(<App/>);
    const linkElement = screen.getByText(/GeoPhone Platform/i);
    expect(linkElement).toBeInTheDocument();
});

test('redirects unauthenticated direct navigation to login page', async () => {
    window.history.pushState({}, 'Triage', '/triage');
    render(<App />);
    await waitFor(() => {
        expect(screen.getByText(/Sign in to ML Workbench & Seismic Analysis/i)).toBeInTheDocument();
    });
});
