import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { describe, it, expect, vi } from 'vitest';
import PropertyDetails from '../components/PropertyAnalysis/PropertyDetails';
import { mockSatelliteData } from './mockData';

// Wrap component in Provider for testing
const renderWithProvider = (ui) => {
  return render(
    <Provider theme={defaultTheme} colorScheme="light">
      {ui}
    </Provider>
  );
};

describe('PropertyDetails Component', () => {
  it('renders empty state when no property data is provided', () => {
    renderWithProvider(
      <PropertyDetails propertyData={null} onExportCSV={() => {}} />
    );

    expect(
      screen.getByText('No Adobe Tags property detected on this page.')
    ).toBeInTheDocument();
  });

  it('renders property details correctly', () => {
    renderWithProvider(
      <PropertyDetails
        propertyData={mockSatelliteData}
        onExportCSV={() => {}}
      />
    );

    // Check property name is displayed
    expect(
      screen.getByText(mockSatelliteData.propertyName)
    ).toBeInTheDocument();

    // Check environment is displayed
    expect(screen.getByText('Environment:')).toBeInTheDocument();
    expect(screen.getByText(mockSatelliteData.environment)).toBeInTheDocument();

    // Check component counts are displayed
    expect(screen.getByText('Data Elements')).toBeInTheDocument();
    expect(
      screen.getByText(`Total: ${mockSatelliteData.dataElements.length}`)
    ).toBeInTheDocument();

    expect(screen.getByText('Rules')).toBeInTheDocument();
    expect(
      screen.getByText(`Total: ${mockSatelliteData.rules.length}`)
    ).toBeInTheDocument();

    expect(screen.getByText('Extensions')).toBeInTheDocument();
    expect(
      screen.getByText(`Total: ${mockSatelliteData.extensions.length}`)
    ).toBeInTheDocument();
  });

  it('calls export function when export button is clicked', () => {
    const mockExportFn = vi.fn();
    renderWithProvider(
      <PropertyDetails
        propertyData={mockSatelliteData}
        onExportCSV={mockExportFn}
      />
    );

    // Find and click the export button
    const exportButton = screen.getByLabelText('Export as CSV');
    fireEvent.click(exportButton);

    // Check if the export function was called
    expect(mockExportFn).toHaveBeenCalledTimes(1);
  });

  it('displays correct usage statistics', () => {
    // Create a modified mock with specific usage stats
    const mockData = {
      ...mockSatelliteData,
      dataElements: [
        { name: 'element1', isUsed: true, usageCount: 5 },
        { name: 'element2', isUsed: false, usageCount: 0 },
      ],
      rules: [
        { name: 'rule1', isUsed: true, usageCount: 3 },
        { name: 'rule2', isUsed: false, usageCount: 0 },
      ],
    };

    renderWithProvider(
      <PropertyDetails propertyData={mockData} onExportCSV={() => {}} />
    );

    // Check unused counts
    expect(screen.getByText('Unused: 1')).toBeInTheDocument(); // For data elements

    // We can't easily test the Meter component values directly with testing-library,
    // but we can verify the component is rendered
    expect(screen.getAllByRole('progressbar')).toHaveLength(2); // Two meters for data elements and rules
  });
});
