import React, { useState, useEffect } from 'react';
import {
  View,
  Flex,
  Heading,
  Divider,
  Text,
  ActionButton,
  SearchField,
  Picker,
  Item,
  Content,
  IllustratedMessage,
  ProgressCircle,
  Well,
} from '@adobe/react-spectrum';
import {
  TableView,
  TableHeader,
  Column,
  TableBody,
  Row,
  Cell,
} from '@react-spectrum/table';
import Filter from '@spectrum-icons/workflow/Filter';
import Copy from '@spectrum-icons/workflow/Copy';
import ViewDetail from '@spectrum-icons/workflow/ViewDetail';
import NotFound from '@spectrum-icons/illustrations/NotFound';

const DataElementsList = ({ dataElements, loading, onViewDetails }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [filteredElements, setFilteredElements] = useState([]);

  // Apply filters when search term or type filter changes
  useEffect(() => {
    if (!dataElements) return;

    let filtered = [...dataElements];

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (element) =>
          element.name.toLowerCase().includes(term) ||
          (element.type && element.type.toLowerCase().includes(term))
      );
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter((element) => element.type === typeFilter);
    }

    setFilteredElements(filtered);
  }, [dataElements, searchTerm, typeFilter]);

  // Get unique data element types for the filter dropdown
  const getUniqueTypes = () => {
    if (!dataElements) return [];
    const types = new Set(
      dataElements.map((element) => element.type).filter(Boolean)
    );
    return Array.from(types);
  };

  // Handle copying data element name to clipboard
  const handleCopy = (name) => {
    navigator.clipboard.writeText(name);
    // Could add a toast notification here
  };

  if (loading) {
    return (
      <View padding="size-250">
        <Flex direction="column" alignItems="center" gap="size-100">
          <ProgressCircle aria-label="Loading data elements" isIndeterminate />
          <Text>Loading data elements...</Text>
        </Flex>
      </View>
    );
  }

  if (!dataElements || dataElements.length === 0) {
    return (
      <View padding="size-250">
        <IllustratedMessage>
          <NotFound />
          <Heading>No Data Elements Found</Heading>
          <Content>
            No data elements were detected in this Adobe Tags property.
          </Content>
        </IllustratedMessage>
      </View>
    );
  }

  return (
    <View backgroundColor="gray-50" padding="size-250" borderRadius="medium">
      <Heading level={2}>Data Elements ({dataElements.length})</Heading>

      <Flex direction="row" gap="size-200" marginY="size-200" wrap>
        <SearchField
          label="Search data elements"
          value={searchTerm}
          onChange={setSearchTerm}
          width="size-3600"
        />

        <Picker
          label="Filter by type"
          selectedKey={typeFilter}
          onSelectionChange={setTypeFilter}
          width="size-2400"
        >
          <Item key="all">All Types</Item>
          {getUniqueTypes().map((type) => (
            <Item key={type}>{type}</Item>
          ))}
        </Picker>
      </Flex>

      <Well>
        <Flex direction="row" gap="size-100" marginBottom="size-100">
          <Text>
            Showing {filteredElements.length} of {dataElements.length} data
            elements
          </Text>
          {typeFilter !== 'all' && (
            <ActionButton
              isQuiet
              onPress={() => setTypeFilter('all')}
              aria-label="Clear filter"
            >
              <Filter />
              <Text>Clear Filter</Text>
            </ActionButton>
          )}
        </Flex>
      </Well>

      <TableView
        aria-label="Data Elements Table"
        overflowMode="wrap"
        selectionMode="none"
        density="compact"
      >
        <TableHeader>
          <Column width="25%">Name</Column>
          <Column width="15%">Type</Column>
          <Column width="15%">Size (bytes)</Column>
          <Column width="15%">Status</Column>
          <Column width="15%">Usage Count</Column>
          <Column width="15%">Actions</Column>
        </TableHeader>
        <TableBody>
          {filteredElements.map((element) => (
            <Row key={element.id || element.name}>
              <Cell>{element.name}</Cell>
              <Cell>{element.type || 'Unknown'}</Cell>
              <Cell>{element.size || 0}</Cell>
              <Cell>
                <Text
                  UNSAFE_style={{
                    color: element.isUsed ? 'green' : 'red',
                  }}
                >
                  {element.isUsed ? 'Used' : 'Unused'}
                </Text>
              </Cell>
              <Cell>{element.usageCount || 0}</Cell>
              <Cell>
                <Flex direction="row" gap="size-100">
                  <ActionButton
                    isQuiet
                    onPress={() => handleCopy(element.name)}
                    aria-label={`Copy ${element.name}`}
                  >
                    <Copy />
                  </ActionButton>
                  <ActionButton
                    isQuiet
                    onPress={() => onViewDetails(element)}
                    aria-label={`View details for ${element.name}`}
                  >
                    <ViewDetail />
                  </ActionButton>
                </Flex>
              </Cell>
            </Row>
          ))}
        </TableBody>
      </TableView>
    </View>
  );
};

export default DataElementsList;
