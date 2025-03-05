/**
 * Extract rules from sessionStorage
 * @returns {Object|null} The parsed rules object or null if not found
 */
function extractRulesFromSessionStorage() {
  try {
    const rulesValue = sessionStorage.getItem('_satellite._container.rules');

    if (!rulesValue) {
      console.error(
        'Rules data not found in sessionStorage. Please make sure you have loaded the TagScanner properly.'
      );
      return null;
    }

    return JSON.parse(rulesValue);
  } catch (error) {
    console.error('Error extracting rules from sessionStorage:', error);
    return null;
  }
}

const rules = extractRulesFromSessionStorage();

// Check if rules were successfully retrieved
if (rules) {
  // Do something with the rules object
  console.log('Rules found:', rules);

  // Example: Access specific rule properties
  if (rules.length > 0) {
    console.log('First rule name:', rules[0].name);
  }
} else {
  // Handle the case where rules couldn't be retrieved
  console.log('Unable to retrieve rules from sessionStorage');
}
