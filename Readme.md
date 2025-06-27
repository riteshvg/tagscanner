# TagScanner 1.6.5

Hi! Thank you for trying out TagScanner. TagScanner is an utility designed to scan your Adobe Tags' property in depth. There are three main uses of TagScanner -
--Auditing
--Analyzing
--Debugging

## Changelog 03/03/25

Added multiple features to the Extension.

#### Data Analysis

- Component Summary: Quick overview of all components in your Adobe Tags property

- Usage Analysis: Identifies unused data elements and rules to help optimize implementation

- Size Analysis: Shows the size contribution of each component

#### Detailed Views

- Data Elements: Complete list with filtering and sorting capabilities

- Rules: Overview of all rules with their triggers, conditions, and actions

- Extensions: List of installed extensions with usage details

#### Documentation Tools

- PDF Export: Download a complete summary of your implementation

- CSV Export: Export component details for further analysis

- Clipboard Copy: Easily copy tables and data for reports and presentations

#### User Experience

- Interactive Tours: Built-in tour functionality to help new users understand the interface

- Accordion Interfaces: Collapsible sections for better information organization

- Table Sorting: Sort any table by clicking column headers

## Libraries Used

- jQuery 3.2.1
- TableSorter
- Intro.js (for guided tours)
- HTML2Canvas (for PDF generation)
- Font Awesome (for icons)

## Changelog 07/31

- This version of the extension is now under Chrome Manifest v3! The data processing was shifted from remotely reading the tags script into loading the satellite object from the page context into the extension. As a side effect, some information, like the sizes in bytes, may be incorrect.
- Added a download button next to the tag property name that exports a CSV summary of the current property, including data elements, extensions, and rules, including custom code.
- Visually changed the extension from a popup window to a traditional extension view.
- Removed the login portal from the extension.
- Removed the three second loading timeout. Information to the extension is now created on page load and when the extension button is clicked.
- Added a framework for a sandbox file to be injected into the page where a script file can potentially be loaded without a CSP violation. Can be used in future development to gather full unminified code.

# About TagScanner

##### With TagScanner you can get more information about your active Adobe Tags Property and answers queries such as:

- How do I ascertain the size of my library impacting my website?
- Where can I get a list of elements that are significantly larger in size?
- How many data elements are active and not used even once in any of my rules, extensions or data elements?
- How are different data elements mapped to multiple rules?
- How can I determine the relationships between different elements of my library?
