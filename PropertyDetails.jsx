import React from 'react';
import {
  View,
  Flex,
  Heading,
  Divider,
  Text,
  Button,
  Well,
  Content,
  IllustratedMessage,
  Meter,
  ActionButton,
} from '@adobe/react-spectrum';
import Download from '@spectrum-icons/workflow/Download';
import Info from '@spectrum-icons/workflow/Info';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';

// This component displays the property details from the Adobe Tags implementation
const PropertyDetails = ({ propertyData, onExportCSV }) => {
  // If no property data is available yet
  if (!propertyData) {
    return (
      <View padding="size-250">
        <IllustratedMessage>
          <Content>No Adobe Tags property detected on this page.</Content>
        </IllustratedMessage>
      </View>
    );
  }

  const {
    propertyName,
    environment,
    buildDate,
    dataElements = [],
    rules = [],
    extensions = [],
  } = propertyData;

  // Calculate usage statistics
  const unusedDataElements = dataElements.filter((de) => !de.isUsed).length;
  const unusedRules = rules.filter((rule) => !rule.isUsed).length;
  const dataElementUsagePercent =
    dataElements.length > 0
      ? ((dataElements.length - unusedDataElements) / dataElements.length) * 100
      : 0;

  return (
    <View backgroundColor="gray-50" padding="size-250" borderRadius="medium">
      <Flex direction="row" justifyContent="space-between" alignItems="center">
        <Heading level={2}>{propertyName || 'Unknown Property'}</Heading>
        <ActionButton onPress={onExportCSV} aria-label="Export as CSV">
          <Download />
          <Text>Export CSV</Text>
        </ActionButton>
      </Flex>

      <Divider size="S" />

      <Flex direction="column" gap="size-100">
        <Flex direction="row" gap="size-100">
          <Text>Environment:</Text>
          <Text weight="bold">{environment || 'Unknown'}</Text>
        </Flex>

        <Flex direction="row" gap="size-100">
          <Text>Build Date:</Text>
          <Text weight="bold">{buildDate || 'Unknown'}</Text>
        </Flex>
      </Flex>

      <Divider size="S" marginY="size-150" />

      <Heading level={3}>Component Summary</Heading>

      <Flex direction="row" gap="size-300" marginY="size-150" wrap>
        <Well>
          <Heading level={4}>Data Elements</Heading>
          <Text>Total: {dataElements.length}</Text>
          <Text>Unused: {unusedDataElements}</Text>
          <Meter
            label="Usage"
            value={dataElementUsagePercent}
            variant={dataElementUsagePercent < 50 ? 'warning' : 'positive'}
            marginTop="size-100"
          />
        </Well>

        <Well>
          <Heading level={4}>Rules</Heading>
          <Text>Total: {rules.length}</Text>
          <Text>Unused: {unusedRules}</Text>
          <Meter
            label="Usage"
            value={
              rules.length > 0
                ? ((rules.length - unusedRules) / rules.length) * 100
                : 0
            }
            variant={unusedRules > rules.length / 2 ? 'warning' : 'positive'}
            marginTop="size-100"
          />
        </Well>

        <Well>
          <Heading level={4}>Extensions</Heading>
          <Text>Total: {extensions.length}</Text>
        </Well>
      </Flex>

      <Flex direction="row" gap="size-100" marginTop="size-300">
        <Button
          variant="primary"
          onPress={() => (window.location.href = 'summary.html')}
        >
          View Detailed Analysis
          <ChevronRight />
        </Button>

        <Button
          variant="secondary"
          onPress={() =>
            window.open(
              'https://experience.adobe.com/#/data-collection/',
              '_blank'
            )
          }
        >
          Open in Data Collection
          <Info />
        </Button>
      </Flex>
    </View>
  );
};

export default PropertyDetails;
