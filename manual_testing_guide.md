# Manual Testing Guide for TagScanner React Components

This guide outlines how to manually test your TagScanner React components in a browser extension context.

## Building for Testing

1. **Build the React application:**

```bash
# Build the React application
npm run build
```

2. **Create a test extension directory:**

```bash
# Create a directory for the test extension
mkdir -p test-extension
cp -r dist/* test-extension/
cp manifest_react.json test-extension/manifest.json
cp background.js test-extension/
cp content_scripts.js test-extension/
cp pass_satellite.js test-extension/
```

## Loading the Test Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" using the toggle in the top-right corner
3. Click "Load unpacked" and select the `test-extension` directory
4. The TagScanner extension should now be installed

## Testing on Adobe Tags Websites

### Basic Functionality Test

1. **Navigate to a website with Adobe Tags implemented:**

   - Adobe.com
   - Any website you know uses Adobe Tags/Launch

2. **Click the TagScanner extension icon**

   - The extension popup should open
   - It should display "Loading Adobe Tags Data"
   - After a few seconds, it should display property information

3. **Verify Property Details:**
   - Check that the property name is displayed correctly
   - Verify environment information is shown
   - Confirm component counts are accurate

### Data Elements Tab Test

1. **Click on the "Data Elements" tab**

   - The table of data elements should load
   - Verify the count matches what's shown in the summary

2. **Test Search Functionality:**

   - Type in the search box to filter data elements
   - Verify that only matching elements are displayed

3. **Test Type Filtering:**

   - Use the type dropdown to filter by element type
   - Verify that only elements of the selected type are shown

4. **Test Copy Functionality:**
   - Click the copy icon next to a data element
   - Paste into a text editor to verify it copied correctly

### Rules Tab Test

1. **Click on the "Rules" tab**

   - The table of rules should load
   - Verify the count matches what's shown in the summary

2. **Test Filtering and Sorting:**
   - Use any available filters to narrow down rules
   - Verify sorting works if implemented

### Export Functionality Test

1. **Click the "Export CSV" button**
   - A CSV file should download
   - Open the file to verify it contains the correct data
   - Check that property information, data elements, rules, and extensions are included

## Testing Edge Cases

### No Adobe Tags Present

1. **Navigate to a website without Adobe Tags (e.g., example.com)**
2. **Click the TagScanner extension icon**
   - It should show a "No Adobe Tags Found" message
   - Verify the error handling UI is displayed correctly

### Slow Connection Simulation

1. **Use Chrome DevTools to simulate a slow connection:**

   - Open DevTools (F12)
   - Go to Network tab
   - Set throttling to "Slow 3G"

2. **Click the TagScanner extension icon**
   - Verify the loading state is displayed correctly
   - Check that the UI eventually loads or shows an appropriate timeout message

### Large Property Test

1. **Find a website with a large Adobe Tags implementation (many data elements and rules)**
2. **Click the TagScanner extension icon**
   - Verify the UI handles large data sets properly
   - Check that tables paginate or virtualize if necessary
   - Ensure performance remains acceptable

## Visual and Accessibility Testing

1. **Check Responsive Layout:**

   - Resize the popup window to different dimensions
   - Verify the UI adapts appropriately

2. **Test Keyboard Navigation:**

   - Navigate through the UI using only the keyboard
   - Verify all interactive elements are accessible

3. **Test with Screen Reader:**
   - Enable a screen reader (e.g., VoiceOver on Mac, NVDA on Windows)
   - Navigate through the UI and verify announcements are clear and helpful

## Reporting Issues

When you encounter issues during manual testing, document them with:

1. **Steps to reproduce**
2. **Expected behavior**
3. **Actual behavior**
4. **Screenshots or recordings** if applicable
5. **Browser and extension version**

## Testing Checklist

- [ ] Extension loads successfully
- [ ] Property details display correctly
- [ ] Data Elements tab functions properly
- [ ] Rules tab functions properly
- [ ] Extensions tab functions properly
- [ ] Search and filtering work as expected
- [ ] CSV export generates correct data
- [ ] Error states display appropriately
- [ ] Loading states display correctly
- [ ] UI is responsive and adapts to different sizes
- [ ] Keyboard navigation works throughout the UI
- [ ] Screen reader can access all important information
