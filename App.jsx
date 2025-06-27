import React, { useState } from 'react';
import {
  Provider,
  defaultTheme,
  View,
  Flex,
  Tabs,
  TabList,
  Item,
  TabPanels,
  Header,
  Heading,
  Divider,
  Content,
  IllustratedMessage,
  ProgressCircle,
  Text,
} from '@adobe/react-spectrum';
import Error from '@spectrum-icons/illustrations/Error';
import NotFound from '@spectrum-icons/illustrations/NotFound';

// Import custom components
import PropertyDetails from './components/PropertyAnalysis/PropertyDetails';
import DataElementsList from './components/DataElements/DataElementsList';
// Import other components as needed

// Import custom hooks
import useSatelliteData from './hooks/useSatelliteData';

const App = () => {
  const { satelliteData, loading, error } = useSatelliteData();
  const [selectedTab, setSelectedTab] = useState('overview');

  // Handle CSV export
  const handleExportCSV = () => {
    if (!satelliteData) return;

    // Create CSV content
    let csvContent = 'data:text/csv;charset=utf-8,';

    // Add property info
    csvContent += `Property Name,${satelliteData.propertyName}\n`;
    csvContent += `Environment,${satelliteData.environment}\n`;
    csvContent += `Build Date,${satelliteData.buildDate}\n\n`;

    // Add data elements section
    csvContent += 'DATA ELEMENTS\n';
    csvContent += 'Name,Type,Size (bytes),Status,Usage Count\n';

    satelliteData.dataElements.forEach((element) => {
      csvContent += `${element.name},${element.type},${element.size},${
        element.isUsed ? 'Used' : 'Unused'
      },${element.usageCount}\n`;
    });

    csvContent += '\n';

    // Add rules section
    csvContent += 'RULES\n';
    csvContent += 'Name,Enabled,Size (bytes),Status,Usage Count\n';

    satelliteData.rules.forEach((rule) => {
      csvContent += `${rule.name},${rule.enabled ? 'Yes' : 'No'},${rule.size},${
        rule.isUsed ? 'Used' : 'Unused'
      },${rule.usageCount}\n`;
    });

    csvContent += '\n';

    // Add extensions section
    csvContent += 'EXTENSIONS\n';
    csvContent += 'Name,Version,Size (bytes)\n';

    satelliteData.extensions.forEach((extension) => {
      csvContent += `${extension.name},${extension.version},${extension.size}\n`;
    });

    // Create download link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `${satelliteData.propertyName}_TagScanner_Export.csv`
    );
    document.body.appendChild(link);

    // Trigger download
    link.click();

    // Clean up
    document.body.removeChild(link);
  };

  // Render loading state
  if (loading) {
    return (
      <Provider theme={defaultTheme} colorScheme="light">
        <View padding="size-250" minHeight="100vh">
          <Flex
            direction="column"
            alignItems="center"
            justifyContent="center"
            gap="size-200"
            height="100%"
          >
            <ProgressCircle
              size="L"
              aria-label="Loading Adobe Tags data"
              isIndeterminate
            />
            <Heading level={3}>Loading Adobe Tags Data</Heading>
            <Text>Scanning the page for Adobe Tags implementation...</Text>
          </Flex>
        </View>
      </Provider>
    );
  }

  // Render error state
  if (error) {
    return (
      <Provider theme={defaultTheme} colorScheme="light">
        <View padding="size-250" minHeight="100vh">
          <Flex
            direction="column"
            alignItems="center"
            justifyContent="center"
            gap="size-200"
            height="100%"
          >
            <IllustratedMessage>
              <Error />
              <Heading>Error Loading Data</Heading>
              <Content>{error}</Content>
            </IllustratedMessage>
          </Flex>
        </View>
      </Provider>
    );
  }

  // Render no data state
  if (!satelliteData) {
    return (
      <Provider theme={defaultTheme} colorScheme="light">
        <View padding="size-250" minHeight="100vh">
          <Flex
            direction="column"
            alignItems="center"
            justifyContent="center"
            gap="size-200"
            height="100%"
          >
            <IllustratedMessage>
              <NotFound />
              <Heading>No Adobe Tags Found</Heading>
              <Content>
                No Adobe Tags implementation was detected on this page. Please
                navigate to a page with Adobe Tags installed and try again.
              </Content>
            </IllustratedMessage>
          </Flex>
        </View>
      </Provider>
    );
  }

  // Main application render
  return (
    <Provider theme={defaultTheme} colorScheme="light">
      <View minHeight="100vh" backgroundColor="gray-75">
        <Header>
          <Flex direction="row" alignItems="center" gap="size-100">
            <img
              src="images/tagscanner_32x32.png"
              alt="TagScanner Logo"
              width="32"
              height="32"
            />
            <Heading level={1}>TagScanner</Heading>
          </Flex>
        </Header>

        <Divider />

        <View padding="size-200">
          <PropertyDetails
            propertyData={satelliteData}
            onExportCSV={handleExportCSV}
          />

          <Tabs
            aria-label="Adobe Tags Analysis"
            selectedKey={selectedTab}
            onSelectionChange={setSelectedTab}
            marginTop="size-300"
          >
            <TabList>
              <Item key="overview">Overview</Item>
              <Item key="dataElements">Data Elements</Item>
              <Item key="rules">Rules</Item>
              <Item key="extensions">Extensions</Item>
            </TabList>

            <TabPanels>
              <Item key="overview">
                <View padding="size-200">
                  <Heading level={2}>Overview</Heading>
                  <Text>
                    This is an overview of your Adobe Tags implementation. Use
                    the tabs above to explore detailed information about data
                    elements, rules, and extensions.
                  </Text>

                  {/* Add overview charts and statistics here */}
                </View>
              </Item>

              <Item key="dataElements">
                <View padding="size-200">
                  <DataElementsList
                    dataElements={satelliteData.dataElements}
                    loading={false}
                    onViewDetails={(element) =>
                      console.log('View details for', element)
                    }
                  />
                </View>
              </Item>

              <Item key="rules">
                <View padding="size-200">
                  <Heading level={2}>Rules</Heading>
                  {/* Add RulesList component here */}
                </View>
              </Item>

              <Item key="extensions">
                <View padding="size-200">
                  <Heading level={2}>Extensions</Heading>
                  {/* Add ExtensionsList component here */}
                </View>
              </Item>
            </TabPanels>
          </Tabs>
        </View>
      </View>
    </Provider>
  );
};

export default App;
