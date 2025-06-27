# TagScanner 1.6.4 Analysis

## Overview

TagScanner is a Chrome extension designed to analyze and optimize Adobe Tags (formerly Adobe Launch) implementations on websites. It helps users audit, analyze, and debug their Adobe Tags properties by extracting information about data elements, rules, and extensions.

## Architecture

The extension follows a standard Chrome extension architecture with:

1. **Content Scripts** - Inject into web pages to extract Adobe Tags data
2. **Popup Interface** - Provides the main user interface for interaction
3. **Background Service Worker** - Manages extension lifecycle and communication
4. **Sandbox Environment** - Safely processes and analyzes Adobe Tags scripts

## Key Components

### 1. Content Script (content_scripts.js)

- Injects into web pages to detect Adobe Tags implementations
- Extracts the `_satellite` object containing Adobe Tags configuration
- Communicates with the popup interface via message passing
- Identifies the Adobe Tags script URL for further analysis

### 2. Popup Interface (popup.js/popup.html)

- Main user interface for the extension
- Displays property information, component counts, and analysis
- Provides visualization and export functionality
- Processes and organizes the extracted Adobe Tags data

### 3. Service Worker (service_worker.js)

- Manages the extension's background processes
- Handles the extension icon click event to open the popup window
- Facilitates communication between content scripts and popup

### 4. Data Extraction (pass_satellite.js)

- Extracts the Adobe Tags `_satellite` object from the page context
- Serializes the object for transfer to the extension context
- Handles function serialization for proper data transfer

### 5. Sandbox Environment (satellite_sandbox.html/js)

- Provides an isolated environment for script analysis
- Processes unminified Adobe Tags scripts
- Extracts detailed configuration information

## Key Features

### 1. Property Analysis

- Identifies Adobe Tags properties on websites
- Extracts property details (name, environment, version)
- Provides component counts and usage statistics

### 2. Component Analysis

- Lists all data elements, rules, and extensions
- Identifies unused components for optimization
- Calculates size impact of each component

### 3. Export Functionality

- CSV export of property details and components
- PDF report generation for stakeholder sharing
- Clipboard copying for specific sections

### 4. User Experience

- Interactive interface with filtering and sorting
- Guided tours for first-time users
- Responsive design for different screen sizes

## Technical Implementation

- Uses Chrome's Manifest V3 architecture
- Employs message passing for secure communication between contexts
- Implements sandboxed script execution for security
- Utilizes libraries like jQuery, TableSorter, and HTML2Canvas

## Recent Updates (v1.6.4/1.6.5)

- Migration to Chrome Manifest V3
- Improved data processing directly from page context
- Enhanced export functionality
- UI improvements and visual changes
- Added sandbox framework for script analysis

## Limitations

- Some size calculations may be inaccurate due to the shift to Manifest V3
- Relies on the presence of the `_satellite` object in the page context
- Limited to analyzing Adobe Tags implementations (not other tag managers)

## Conclusion

TagScanner is a specialized tool for Adobe Tags users, providing valuable insights for optimization and debugging. It helps identify unused components, analyze implementation size, and document property configurations for stakeholders.
