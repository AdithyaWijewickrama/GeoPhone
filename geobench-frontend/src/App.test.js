import {render, screen} from '@testing-library/react';
import App from './App';

test('renders GeoPhone Platform brand', () => {
    render(<App/>);
    const linkElement = screen.getByText(/GeoPhone Platform/i);
    expect(linkElement).toBeInTheDocument();
});
