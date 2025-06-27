# AEP Web SDK Demo Script

## 1. Introduction to AEP Web SDK

### What is AEP Web SDK?

- Adobe Experience Platform Web SDK (AEP Web SDK) is a JavaScript library that allows clients to interact with various Adobe Experience Cloud services through the Adobe Experience Platform Edge Network
- Single JavaScript library that replaces multiple legacy libraries (AppMeasurement, Visitor.js, AT.js, DIL.js, etc.)
- Designed for modern web applications with performance, privacy, and future-proofing in mind

### History of Data Collection

- **Early Days**: Individual solutions with separate JavaScript libraries
  - Adobe Analytics: s_code.js → AppMeasurement.js
  - Adobe Target: mbox.js → at.js
  - Adobe Audience Manager: DIL.js
  - Each requiring separate network calls and implementations
- **Visitor ID Service**: First attempt at unification (ECID)
  - Added visitor.js to synchronize identities
  - Still required multiple libraries and network calls
- **Launch/Tags**: Simplified deployment but still used multiple libraries
- **Need for a Fresh Start**: Why Adobe needed to build from scratch
  - Performance limitations with multiple libraries
  - Privacy regulations (GDPR, CCPA, etc.) requiring new approaches
  - Preparing for a cookieless future
  - Need for real-time data activation

## 2. Alloy.js vs. AEP Web SDK

### Clarifying the Terminology

- **Alloy.js**: The actual JavaScript file/code that gets implemented on websites
- **AEP Web SDK**: The complete solution including the Edge Network infrastructure
- Common misconception: These terms are often used interchangeably, but understanding the distinction is important

### Key Differences from Legacy Libraries

- Single library vs. multiple libraries
- Reduced network requests (one call instead of many)
- Server-side decisioning capabilities
- Built-in consent management
- Edge computing for faster processing
- Standardized data collection through XDM

## 3. Core Components of AEP Web SDK Implementation

### Component Overview

1. **Tags/Launch Extension**:

   - Adobe's tag management system for deploying client-side code
   - Provides a user-friendly interface to configure AEP Web SDK
   - Manages versioning, environments (dev/stage/prod), and publishing workflows
   - Includes built-in data elements and rule builder for event handling
   - Reduces implementation complexity through visual interface

2. **Datastreams**:

   - Configuration hub that determines where collected data flows
   - Created in the Adobe Experience Platform Data Collection UI
   - Controls which Adobe solutions receive data (Analytics, Target, Audience Manager, etc.)
   - Manages environment-specific settings (development, staging, production)
   - Enables server-side configuration changes without modifying client-side code

3. **Schema**:

   - XDM (Experience Data Model) defines the structure of collected data
   - Standardizes customer experience data across all Adobe solutions
   - Consists of core field groups (standard fields) and custom field groups
   - Enables real-time data activation through standardization
   - Critical for future-proofing implementations, even for non-AEP customers

4. **Edge Network**:

   - Distributed global network of servers that process data in real-time
   - Acts as the central hub for all Adobe Experience Cloud solutions
   - Key advantages:
     - **Proximity Processing**: Processes data at the edge server closest to the user
     - **Reduced Latency**: Minimizes data travel time for faster experiences
     - **Server-Side Processing**: Offloads computation from client browsers
     - **Single Network Call**: Consolidates multiple solution calls into one request
     - **Intelligent Routing**: Directs data to appropriate destinations based on datastream
     - **Real-Time Decisioning**: Enables personalization decisions at the edge
     - **Privacy Enforcement**: Centralizes consent and privacy controls
     - **Scalability**: Handles high traffic volumes with distributed architecture
   - Eliminates the need for multiple JavaScript libraries and network calls
   - Future-proofs implementations for cookieless tracking and privacy regulations

5. **Destinations**:
   - The Adobe solutions or external systems where data is ultimately sent
   - Can include:
     - Adobe Analytics for reporting and analysis
     - Adobe Target for personalization and testing
     - Adobe Audience Manager for audience management
     - Adobe Experience Platform for customer profiles and segmentation
     - Third-party destinations via Event Forwarding (requires additional license)
   - Configuration happens at the datastream level, not in client-side code

### How Components Work Together

- **Data Flow Diagram**: Visualize how data moves through the system

  1. User interacts with website → Alloy.js collects data
  2. Data sent to Edge Network via single call
  3. Edge Network processes and routes data based on Datastream configuration
  4. Data is sent to configured destinations in real-time
  5. Responses return to browser for personalization/etc.

- **Implementation Workflow**:

  1. Define business requirements and data collection needs
  2. Create XDM schema to structure the data
  3. Configure datastream to determine where data flows
  4. Implement AEP Web SDK via Tags extension
  5. Test and validate the implementation
  6. Deploy to production

- **Key Integration Points**:
  - Alloy.js communicates directly with Edge Network
  - Edge Network references datastream configuration
  - Datastream configuration references schema for validation
  - Edge Network routes data to destinations
  - Responses from destinations return through Edge Network

## 4. AEP Web SDK Without Experience Platform

### Independent Usage

- AEP Web SDK can be used without an Adobe Experience Platform license
- Benefits even without AEP:
  - Performance improvements
  - Simplified implementation
  - Future-proofing your implementation
  - Easier migration path when ready for AEP

### Configuration for Analytics-Only

- Setting up datastreams for Adobe Analytics
- Mapping to Analytics variables without XDM
- Best practices for non-AEP implementations

## 5. Planning for AEP: XDM Schema Design

### What is XDM?

- Experience Data Model: Standardized data schema for customer experience data
- Benefits of standardized data structure
- Core components vs. custom fields

### Schema Design Best Practices

- Start with business requirements
- Map existing data collection to XDM fields
- Use field groups effectively
- Plan for future expansion
- Documentation importance

### Migrating from Custom Props/eVars to XDM

- Mapping strategy
- Maintaining backward compatibility
- Testing and validation approach

## 6. Implementation Use Case: E-commerce Website

### Business Requirements

- Page view tracking
- Product views and purchases
- User authentication
- Cart interactions
- Personalization needs

### Implementation Plan

- **Phase 1: Discovery and Planning**

  - Audit current implementation
  - Define XDM schema
  - Create migration roadmap
  - Set up testing environment

- **Phase 2: Configuration**

  - Create datastreams
  - Configure Tags extension
  - Set up data elements
  - Create rules for different events

- **Phase 3: Implementation**

  - Base code implementation
  - E-commerce event tracking
  - Identity handling
  - Consent management
  - A/B testing configuration

- **Phase 4: Validation**

  - Testing methodology
  - Comparing data between implementations
  - Browser/device testing
  - Performance benchmarking

- **Phase 5: Optimization**
  - Performance tuning
  - Removing deprecated code
  - Documentation
  - Team training

## 7. Live Demo Components

### Basic Implementation

```javascript
// Initialize AEP Web SDK
alloy('configure', {
  defaultConsent: 'pending',
  edgeConfigId: 'ebebf826-a01f-4458-8cec-ef61de241c93',
  orgId: 'ADB3LETTERSANDNUMBERS@AdobeOrg',
});

// Send page view event
alloy('sendEvent', {
  xdm: {
    web: {
      webPageDetails: {
        name: 'Home Page',
        pageViews: {
          value: 1,
        },
      },
    },
  },
});
```

### E-commerce Product View

```javascript
alloy('sendEvent', {
  xdm: {
    commerce: {
      productViews: {
        value: 1,
      },
    },
    productListItems: [
      {
        SKU: 'PRODUCT123',
        name: 'Premium Headphones',
        priceTotal: 129.99,
        quantity: 1,
      },
    ],
  },
});
```

### Debugging Tools

- Browser developer tools
- Experience Platform Debugger
- Monitoring network requests
- Validating data in Analytics/other solutions

## 8. Validation Techniques

### Technical Validation

- Comparing data between old and new implementations
- Validating XDM structure
- Checking identity propagation
- Verifying consent handling

### Business Validation

- Key metrics comparison
- Segment qualification
- Personalization delivery
- Marketing campaign attribution

### Common Issues and Troubleshooting

- Network call failures
- Data mapping problems
- Identity resolution issues
- Performance concerns

## 9. Migration Strategies

### Phased Approach

1. **Parallel Implementation**: Run both implementations side-by-side
2. **Gradual Migration**: Move one solution at a time
3. **Complete Cutover**: Full migration after thorough testing

### Migration Checklist

- Data validation plan
- Rollback strategy
- Stakeholder communication
- Training plan
- Documentation requirements

## 10. Future Capabilities and Roadmap

### Upcoming Features

- Enhanced server-side capabilities
- Hybrid deployment models
- Advanced identity resolution
- Cookieless tracking solutions

### Preparing for the Future

- Flexible implementation approaches
- Staying current with updates
- Community resources
- Continuous learning

## 11. Resources and Next Steps

### Documentation

- [AEP Web SDK Documentation](https://experienceleague.adobe.com/docs/experience-platform/edge/home.html)
- [XDM Schema Documentation](https://experienceleague.adobe.com/docs/experience-platform/xdm/home.html)
- [Tags/Launch Documentation](https://experienceleague.adobe.com/docs/experience-platform/tags/home.html)

### Learning Resources

- Experience League courses
- Adobe Summit sessions
- Community forums
- GitHub repositories

### Support Channels

- Adobe Customer Care
- Adobe Community
- Partner network
- Stack Overflow

## 12. Q&A Session

- Prepare for common questions about:
  - Migration complexity
  - Performance impacts
  - Privacy considerations
  - Implementation timelines
  - Cost implications
  - Technical requirements
