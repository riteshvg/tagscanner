import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { describe, it, expect, vi } from 'vitest';
import DataElementsList from '../components/DataElements/DataElementsList';
import { mockSatelliteData } from './mockData';

// Wrap component in Provider for testing
const renderWithProvider = (ui) => {
  return render(
    <Provider theme={defaultTheme} colorScheme="light">
      {ui}
    </Provider>
  );
};

describe('DataElementsList Component', () => {
  it('renders loading state correctly', () => {
    renderWithProvider(
      <DataElementsList
        dataElements={[]}
        loading={true}
        onViewDetails={() => {}}
      />
    );

    expect(screen.getByText('Loading data elements...')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading data elements')).toBeInTheDocument();
  });

  it('renders empty state when no data elements are provided', () => {
    renderWithProvider(
      <DataElementsList
        dataElements={[]}
        loading={false}
        onViewDetails={() => {}}
      />
    );

    expect(screen.getByText('No Data Elements Found')).toBeInTheDocument();
    expect(
      screen.getByText(
        'No data elements were detected in this Adobe Tags property.'
      )
    ).toBeInTheDocument();
  });

  it('renders data elements table correctly', () => {
    renderWithProvider(
      <DataElementsList
        dataElements={mockSatelliteData.dataElements}
        loading={false}
        onViewDetails={() => {}}
      />
    );

    // Check heading with count
    expect(
      screen.getByText(
        `Data Elements (${mockSatelliteData.dataElements.length})`
      )
    ).toBeInTheDocument();

    // Check table headers
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Size (bytes)')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Usage Count')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();

    // Check data element rows
    mockSatelliteData.dataElements.forEach((element) => {
      expect(screen.getByText(element.name)).toBeInTheDocument();
      expect(screen.getByText(element.type)).toBeInTheDocument();
      expect(screen.getByText(element.size.toString())).toBeInTheDocument();
      expect(
        screen.getByText(element.isUsed ? 'Used' : 'Unused')
      ).toBeInTheDocument();
      expect(
        screen.getByText(element.usageCount.toString())
      ).toBeInTheDocument();
    });
  });

  it('filters data elements by search term', () => {
    const dataElements = [
      {
        name: 'page_name',
        type: 'JavaScript Variable',
        size: 100,
        isUsed: true,
        usageCount: 5,
      },
      {
        name: 'user_id',
        type: 'Custom Code',
        size: 200,
        isUsed: true,
        usageCount: 3,
      },
      {
        name: 'product_id',
        type: 'Data Layer',
        size: 150,
        isUsed: false,
        usageCount: 0,
      },
    ];

    renderWithProvider(
      <DataElementsList
        dataElements={dataElements}
        loading={false}
        onViewDetails={() => {}}
      />
    );

    // Initially all elements should be visible
    expect(screen.getByText('page_name')).toBeInTheDocument();
    expect(screen.getByText('user_id')).toBeInTheDocument();
    expect(screen.getByText('product_id')).toBeInTheDocument();

    // Filter by name
    const searchField = screen.getByLabelText('Search data elements');
    fireEvent.change(searchField, { target: { value: 'page' } });

    // Now only page_name should be visible
    expect(screen.getByText('page_name')).toBeInTheDocument();
    expect(screen.queryByText('user_id')).not.toBeInTheDocument();
    expect(screen.queryByText('product_id')).not.toBeInTheDocument();

    // Check the showing count text
    expect(
      screen.getByText('Showing 1 of 3 data elements')
    ).toBeInTheDocument();
  });

  it('filters data elements by type', () => {
    const dataElements = [
      {
        name: 'element1',
        type: 'JavaScript Variable',
        size: 100,
        isUsed: true,
        usageCount: 5,
      },
      {
        name: 'element2',
        type: 'Custom Code',
        size: 200,
        isUsed: true,
        usageCount: 3,
      },
      {
        name: 'element3',
        type: 'JavaScript Variable',
        size: 150,
        isUsed: false,
        usageCount: 0,
      },
    ];

    renderWithProvider(
      <DataElementsList
        dataElements={dataElements}
        loading={false}
        onViewDetails={() => {}}
      />
    );

    // Open the type filter dropdown
    const typeFilter = screen.getByLabelText('Filter by type');
    fireEvent.click(typeFilter);

    // Select "JavaScript Variable" from the dropdown
    const jsVarOption = screen.getByText('JavaScript Variable');
    fireEvent.click(jsVarOption);

    // Now only JavaScript Variable elements should be visible
    expect(screen.getByText('element1')).toBeInTheDocument();
    expect(screen.getByText('element3')).toBeInTheDocument();
    expect(screen.queryByText('element2')).not.toBeInTheDocument();

    // Check the showing count text
    expect(
      screen.getByText('Showing 2 of 3 data elements')
    ).toBeInTheDocument();
  });

  it('calls onViewDetails when view details button is clicked', () => {
    const mockViewDetailsFn = vi.fn();

    renderWithProvider(
      <DataElementsList
        dataElements={mockSatelliteData.dataElements}
        loading={false}
        onViewDetails={mockViewDetailsFn}
      />
    );

    // Find and click the view details button for the first data element
    const viewDetailsButtons = screen.getAllByLabelText(/View details for/);
    fireEvent.click(viewDetailsButtons[0]);

    // Check if the onViewDetails function was called with the correct data element
    expect(mockViewDetailsFn).toHaveBeenCalledTimes(1);
    expect(mockViewDetailsFn).toHaveBeenCalledWith(
      mockSatelliteData.dataElements[0]
    );
  });

  it('calls navigator.clipboard.writeText when copy button is clicked', () => {
    // Mock the clipboard API
    const originalClipboard = navigator.clipboard;
    navigator.clipboard = { writeText: vi.fn() };

    renderWithProvider(
      <DataElementsList
        dataElements={mockSatelliteData.dataElements}
        loading={false}
        onViewDetails={() => {}}
      />
    );

    // Find and click the copy button for the first data element
    const copyButtons = screen.getAllByLabelText(/Copy /);
    fireEvent.click(copyButtons[0]);

    // Check if clipboard.writeText was called with the correct data element name
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      mockSatelliteData.dataElements[0].name
    );

    // Restore the original clipboard
    navigator.clipboard = originalClipboard;
  });
});
