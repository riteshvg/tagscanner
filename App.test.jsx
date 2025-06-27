import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';
import { mockSatelliteData } from './mockData';

// Mock the useSatelliteData hook
vi.mock('../hooks/useSatelliteData', () => ({
  default: vi.fn(),
}));

// Import the hook after mocking
import useSatelliteData from '../hooks/useSatelliteData';

describe('App Component', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  it('renders loading state correctly', () => {
    // Mock the hook to return loading state
    useSatelliteData.mockReturnValue({
      satelliteData: null,
      loading: true,
      error: null,
    });

    render(<App />);

    expect(screen.getByText('Loading Adobe Tags Data')).toBeInTheDocument();
    expect(
      screen.getByText('Scanning the page for Adobe Tags implementation...')
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Loading Adobe Tags data')
    ).toBeInTheDocument();
  });

  it('renders error state correctly', () => {
    // Mock the hook to return error state
    useSatelliteData.mockReturnValue({
      satelliteData: null,
      loading: false,
      error: 'Failed to load Adobe Tags data',
    });

    render(<App />);

    expect(screen.getByText('Error Loading Data')).toBeInTheDocument();
    expect(
      screen.getByText('Failed to load Adobe Tags data')
    ).toBeInTheDocument();
  });

  it('renders no data state correctly', () => {
    // Mock the hook to return no data state
    useSatelliteData.mockReturnValue({
      satelliteData: null,
      loading: false,
      error: null,
    });

    render(<App />);

    expect(screen.getByText('No Adobe Tags Found')).toBeInTheDocument();
    expect(
      screen.getByText(
        'No Adobe Tags implementation was detected on this page. Please navigate to a page with Adobe Tags installed and try again.'
      )
    ).toBeInTheDocument();
  });

  it('renders main application with data correctly', () => {
    // Mock the hook to return data
    useSatelliteData.mockReturnValue({
      satelliteData: mockSatelliteData,
      loading: false,
      error: null,
    });

    // Mock document.createElement and other DOM methods used in CSV export
    const mockLink = {
      setAttribute: vi.fn(),
      click: vi.fn(),
    };
    const originalCreateElement = document.createElement;
    document.createElement = vi.fn().mockImplementation((tag) => {
      if (tag === 'a') return mockLink;
      return originalCreateElement(tag);
    });
    const originalAppendChild = document.body.appendChild;
    document.body.appendChild = vi.fn();
    const originalRemoveChild = document.body.removeChild;
    document.body.removeChild = vi.fn();

    render(<App />);

    // Check header is rendered
    expect(screen.getByText('TagScanner')).toBeInTheDocument();

    // Check PropertyDetails component is rendered
    expect(
      screen.getByText(mockSatelliteData.propertyName)
    ).toBeInTheDocument();

    // Check tabs are rendered
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Data Elements')).toBeInTheDocument();
    expect(screen.getByText('Rules')).toBeInTheDocument();
    expect(screen.getByText('Extensions')).toBeInTheDocument();

    // Initially Overview tab should be selected
    expect(
      screen.getByText('This is an overview of your Adobe Tags implementation.')
    ).toBeInTheDocument();

    // Switch to Data Elements tab
    fireEvent.click(screen.getByText('Data Elements'));

    // Now DataElementsList component should be rendered
    expect(
      screen.getByText(
        `Data Elements (${mockSatelliteData.dataElements.length})`
      )
    ).toBeInTheDocument();

    // Test CSV export
    const exportButton = screen.getByLabelText('Export as CSV');
    fireEvent.click(exportButton);

    // Check if link was created and clicked
    expect(mockLink.setAttribute).toHaveBeenCalledWith(
      'href',
      expect.any(String)
    );
    expect(mockLink.setAttribute).toHaveBeenCalledWith(
      'download',
      expect.stringContaining(mockSatelliteData.propertyName)
    );
    expect(mockLink.click).toHaveBeenCalled();

    // Restore original methods
    document.createElement = originalCreateElement;
    document.body.appendChild = originalAppendChild;
    document.body.removeChild = originalRemoveChild;
  });

  it('switches between tabs correctly', () => {
    // Mock the hook to return data
    useSatelliteData.mockReturnValue({
      satelliteData: mockSatelliteData,
      loading: false,
      error: null,
    });

    render(<App />);

    // Initially Overview tab should be selected
    expect(
      screen.getByText('This is an overview of your Adobe Tags implementation.')
    ).toBeInTheDocument();

    // Switch to Rules tab
    fireEvent.click(screen.getByText('Rules'));

    // Now Rules heading should be visible
    expect(screen.getByText('Rules')).toBeInTheDocument();

    // Switch to Extensions tab
    fireEvent.click(screen.getByText('Extensions'));

    // Now Extensions heading should be visible
    expect(screen.getByText('Extensions')).toBeInTheDocument();

    // Switch back to Data Elements tab
    fireEvent.click(screen.getByText('Data Elements'));

    // Now DataElementsList component should be rendered
    expect(
      screen.getByText(
        `Data Elements (${mockSatelliteData.dataElements.length})`
      )
    ).toBeInTheDocument();
  });
});
