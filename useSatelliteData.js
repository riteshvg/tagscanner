import { useState, useEffect } from 'react';

/**
 * Custom hook to extract and process Adobe Tags satellite data
 * @returns {Object} The satellite data and loading state
 */
const useSatelliteData = () => {
  const [satelliteData, setSatelliteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const extractSatelliteData = async () => {
      try {
        setLoading(true);

        // Get the active tab
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        if (!tab?.id) {
          throw new Error('No active tab found');
        }

        // Inject the content script if not already injected
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content_scripts.js'],
        });

        // Wait for satellite data to be available
        setTimeout(async () => {
          try {
            // Request satellite data from the content script
            const response = await chrome.tabs.sendMessage(tab.id, {
              greeting: 'hello',
            });

            if (response.error) {
              throw new Error(response.error);
            }

            if (response.pending) {
              // If data is pending, wait for the message from the content script
              chrome.runtime.onMessage.addListener(function listener(message) {
                if (message.satellite) {
                  processSatelliteData(message.satellite, message.scriptURL);
                  chrome.runtime.onMessage.removeListener(listener);
                }
              });
            } else if (response.satellite) {
              processSatelliteData(response.satellite, response.scriptURL);
            } else {
              throw new Error('No satellite data received');
            }
          } catch (innerError) {
            setError(innerError.message || 'Failed to get satellite data');
            setLoading(false);
          }
        }, 1000);
      } catch (err) {
        setError(err.message || 'Failed to extract satellite data');
        setLoading(false);
      }
    };

    const processSatelliteData = (satellite, scriptURL) => {
      try {
        // Process the raw satellite data
        const processedData = {
          propertyName: satellite.property?.name || 'Unknown Property',
          environment: satellite.environment || 'Unknown',
          buildDate: satellite.buildDate || new Date().toISOString(),
          scriptURL: scriptURL,

          // Process data elements
          dataElements: processDataElements(satellite),

          // Process rules
          rules: processRules(satellite),

          // Process extensions
          extensions: processExtensions(satellite),
        };

        setSatelliteData(processedData);
      } catch (err) {
        setError(err.message || 'Failed to process satellite data');
      } finally {
        setLoading(false);
      }
    };

    // Extract and process data elements
    const processDataElements = (satellite) => {
      if (!satellite.dataElements) return [];

      const elements = [];
      const usageMap = buildUsageMap(satellite);

      for (const [name, config] of Object.entries(satellite.dataElements)) {
        const usageInfo = usageMap.dataElements[name] || {
          count: 0,
          usedIn: [],
        };

        elements.push({
          name,
          type: config.settings?.type || getDataElementType(config),
          size: calculateSize(config),
          isUsed: usageInfo.count > 0,
          usageCount: usageInfo.count,
          usedIn: usageInfo.usedIn,
          settings: config.settings,
          defaultValue: config.defaultValue,
          forceLowerCase: config.forceLowerCase,
          cleanText: config.cleanText,
          storageDuration: config.storageDuration,
        });
      }

      return elements;
    };

    // Extract and process rules
    const processRules = (satellite) => {
      if (!satellite.rules) return [];

      const rules = [];
      const usageMap = buildUsageMap(satellite);

      for (const [id, config] of Object.entries(satellite.rules)) {
        const usageInfo = usageMap.rules[id] || { count: 0, usedIn: [] };

        rules.push({
          id,
          name: config.name,
          enabled: config.enabled !== false,
          conditions: config.conditions || [],
          actions: config.actions || [],
          events: config.events || [],
          size: calculateSize(config),
          isUsed: usageInfo.count > 0,
          usageCount: usageInfo.count,
          usedIn: usageInfo.usedIn,
        });
      }

      return rules;
    };

    // Extract and process extensions
    const processExtensions = (satellite) => {
      if (!satellite.extensions) return [];

      const extensions = [];

      for (const [id, config] of Object.entries(satellite.extensions)) {
        extensions.push({
          id,
          name: config.displayName || id,
          version: config.settings?.version || 'Unknown',
          size: calculateSize(config),
          settings: config.settings,
        });
      }

      return extensions;
    };

    // Helper to determine data element type
    const getDataElementType = (config) => {
      if (config.settings?.type) return config.settings.type;
      if (config.settings?.customCode) return 'Custom Code';
      if (config.settings?.elementSelector) return 'CSS Selector';
      if (config.settings?.path) return 'JavaScript Variable';
      return 'Unknown';
    };

    // Helper to calculate size of a component
    const calculateSize = (obj) => {
      try {
        return new TextEncoder().encode(JSON.stringify(obj)).length;
      } catch (e) {
        return 0;
      }
    };

    // Build a map of component usage
    const buildUsageMap = (satellite) => {
      const usageMap = {
        dataElements: {},
        rules: {},
        extensions: {},
      };

      // Initialize data elements
      if (satellite.dataElements) {
        Object.keys(satellite.dataElements).forEach((name) => {
          usageMap.dataElements[name] = { count: 0, usedIn: [] };
        });
      }

      // Initialize rules
      if (satellite.rules) {
        Object.keys(satellite.rules).forEach((id) => {
          usageMap.rules[id] = { count: 0, usedIn: [] };
        });
      }

      // Check data element usage in other data elements
      if (satellite.dataElements) {
        Object.entries(satellite.dataElements).forEach(([name, config]) => {
          const str = JSON.stringify(config);

          // Check for data element references like %data_element_name%
          const matches = str.match(/%([^%]+)%/g) || [];

          matches.forEach((match) => {
            const referencedName = match.replace(/%/g, '');
            if (usageMap.dataElements[referencedName]) {
              usageMap.dataElements[referencedName].count++;
              usageMap.dataElements[referencedName].usedIn.push({
                type: 'dataElement',
                name: name,
              });
            }
          });
        });
      }

      // Check data element and rule usage in rules
      if (satellite.rules) {
        Object.entries(satellite.rules).forEach(([ruleId, rule]) => {
          const str = JSON.stringify(rule);

          // Check for data element references
          const matches = str.match(/%([^%]+)%/g) || [];

          matches.forEach((match) => {
            const referencedName = match.replace(/%/g, '');
            if (usageMap.dataElements[referencedName]) {
              usageMap.dataElements[referencedName].count++;
              usageMap.dataElements[referencedName].usedIn.push({
                type: 'rule',
                name: rule.name || ruleId,
              });
            }
          });

          // Check for rule references (less common)
          if (rule.conditions) {
            rule.conditions.forEach((condition) => {
              if (
                condition.settings?.ruleId &&
                usageMap.rules[condition.settings.ruleId]
              ) {
                usageMap.rules[condition.settings.ruleId].count++;
                usageMap.rules[condition.settings.ruleId].usedIn.push({
                  type: 'rule',
                  name: rule.name || ruleId,
                });
              }
            });
          }
        });
      }

      return usageMap;
    };

    // Start the extraction process
    extractSatelliteData();

    // Cleanup function
    return () => {
      // Any cleanup if needed
    };
  }, []);

  return { satelliteData, loading, error };
};

export default useSatelliteData;
