import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useSatelliteData from '../hooks/useSatelliteData';
import { mockSatelliteData } from './mockData';

// Import Chrome API mocks
import './chromeMocks';

describe('useSatelliteData Hook', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  it('initializes with loading state', () => {
    const { result } = renderHook(() => useSatelliteData());

    expect(result.current.loading).toBe(true);
    expect(result.current.satelliteData).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('fetches satellite data successfully', async () => {
    // Mock successful response
    chrome.tabs.sendMessage.mockResolvedValueOnce({
      satellite: mockSatelliteData,
      scriptURL: 'https://assets.adobedtm.com/launch-test.js',
    });

    const { result } = renderHook(() => useSatelliteData());

    // Initially in loading state
    expect(result.current.loading).toBe(true);

    // Wait for the hook to process the data
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify the data was processed correctly
    expect(result.current.satelliteData).not.toBe(null);
    expect(result.current.error).toBe(null);

    // Verify Chrome API calls
    expect(chrome.tabs.query).toHaveBeenCalledWith({
      active: true,
      currentWindow: true,
    });
    expect(chrome.scripting.executeScript).toHaveBeenCalled();
    expect(chrome.tabs.sendMessage).toHaveBeenCalled();
  });

  it('handles pending satellite data', async () => {
    // Mock pending response followed by message
    chrome.tabs.sendMessage.mockResolvedValueOnce({ pending: true });

    const { result } = renderHook(() => useSatelliteData());

    // Initially in loading state
    expect(result.current.loading).toBe(true);

    // Verify Chrome API calls
    expect(chrome.tabs.query).toHaveBeenCalledWith({
      active: true,
      currentWindow: true,
    });

    // Simulate message from content script
    const messageListener =
      chrome.runtime.onMessage.addListener.mock.calls[0][0];
    messageListener({
      satellite: mockSatelliteData,
      scriptURL: 'https://assets.adobedtm.com/launch-test.js',
    });

    // Wait for the hook to process the data
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify the data was processed correctly
    expect(result.current.satelliteData).not.toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('handles error when no active tab is found', async () => {
    // Mock no active tab
    chrome.tabs.query.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useSatelliteData());

    // Wait for the hook to process the error
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify error state
    expect(result.current.satelliteData).toBe(null);
    expect(result.current.error).toBe('No active tab found');
  });

  it('handles error when tab message fails', async () => {
    // Mock tab query success but message failure
    chrome.tabs.sendMessage.mockRejectedValueOnce(
      new Error('Failed to send message')
    );

    const { result } = renderHook(() => useSatelliteData());

    // Wait for the hook to process the error
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify error state
    expect(result.current.satelliteData).toBe(null);
    expect(result.current.error).toBe('Failed to get satellite data');
  });

  it('handles error response from content script', async () => {
    // Mock error response
    chrome.tabs.sendMessage.mockResolvedValueOnce({
      error: 'No Adobe Tags found on this page',
    });

    const { result } = renderHook(() => useSatelliteData());

    // Wait for the hook to process the error
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify error state
    expect(result.current.satelliteData).toBe(null);
    expect(result.current.error).toBe('No Adobe Tags found on this page');
  });

  it('processes data elements correctly', async () => {
    // Mock satellite data with specific data elements
    const mockData = {
      dataElements: {
        page_name: {
          settings: { type: 'JavaScript Variable' },
          defaultValue: '',
          forceLowerCase: true,
          cleanText: false,
          storageDuration: 'pageview',
        },
        user_id: {
          settings: {
            customCode: 'return document.cookie.match(/user=([^;]+)/)[1];',
          },
          defaultValue: 'anonymous',
          forceLowerCase: false,
          cleanText: true,
          storageDuration: 'visitor',
        },
      },
      rules: {},
      extensions: {},
    };

    chrome.tabs.sendMessage.mockResolvedValueOnce({
      satellite: mockData,
      scriptURL: 'https://assets.adobedtm.com/launch-test.js',
    });

    const { result } = renderHook(() => useSatelliteData());

    // Wait for the hook to process the data
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Verify data elements were processed correctly
    expect(result.current.satelliteData.dataElements).toHaveLength(2);
    expect(result.current.satelliteData.dataElements[0].name).toBe('page_name');
    expect(result.current.satelliteData.dataElements[0].type).toBe(
      'JavaScript Variable'
    );
    expect(result.current.satelliteData.dataElements[1].name).toBe('user_id');
    expect(result.current.satelliteData.dataElements[1].type).toBe(
      'Custom Code'
    );
  });
});
