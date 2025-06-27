# Testing Setup for TagScanner React Components

## Install Testing Dependencies

```bash
# Install testing libraries
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom

# If using TypeScript, also install
npm install --save-dev @testing-library/react @types/testing-library__react
```

## Configure Vitest

Create a `vitest.config.js` file in your project root:

```javascript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
});
```

## Create Test Setup File

Create a setup file at `src/test/setup.js`:

```javascript
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect method with methods from react-testing-library
expect.extend(matchers);

// Run cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});
```

## Add Test Scripts to package.json

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

## Create Mock Data

Create a file for mock data at `src/test/mockData.js`:

```javascript
export const mockSatelliteData = {
  propertyName: 'Test Property',
  environment: 'development',
  buildDate: '2023-01-01T00:00:00.000Z',
  scriptURL: 'https://assets.adobedtm.com/launch-test.js',
  dataElements: [
    {
      name: 'page_name',
      type: 'JavaScript Variable',
      size: 120,
      isUsed: true,
      usageCount: 5,
      usedIn: [{ type: 'rule', name: 'Page Load Rule' }],
    },
    {
      name: 'unused_element',
      type: 'Custom Code',
      size: 250,
      isUsed: false,
      usageCount: 0,
      usedIn: [],
    },
  ],
  rules: [
    {
      id: 'RL1',
      name: 'Page Load Rule',
      enabled: true,
      size: 350,
      isUsed: true,
      usageCount: 2,
    },
  ],
  extensions: [
    {
      id: 'EXT1',
      name: 'Core',
      version: '1.0.0',
      size: 500,
    },
  ],
};

export const mockChromeTabs = {
  query: vi.fn().mockResolvedValue([{ id: 123 }]),
  sendMessage: vi.fn().mockResolvedValue({
    satellite: mockSatelliteData,
    scriptURL: 'https://example.com/script.js',
  }),
};

export const mockChromeRuntime = {
  getURL: vi.fn().mockReturnValue('chrome-extension://abcdef/index.html'),
  onMessage: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

export const mockChromeScripting = {
  executeScript: vi.fn().mockResolvedValue([{ result: true }]),
};
```

## Mock Chrome Extension API

Create a file for Chrome API mocks at `src/test/chromeMocks.js`:

```javascript
import { vi } from 'vitest';
import {
  mockChromeTabs,
  mockChromeRuntime,
  mockChromeScripting,
} from './mockData';

// Mock Chrome API
global.chrome = {
  tabs: mockChromeTabs,
  runtime: mockChromeRuntime,
  scripting: mockChromeScripting,
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
    session: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
};
```
