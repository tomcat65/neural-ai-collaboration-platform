# Cursor AI Agent - Neural AI Collaboration Platform Onboarding

**Welcome to the Neural AI Collaboration Platform!** This guide will onboard you as a Cursor AI agent to effectively use all 27 MCP tools for collaborative development with other AI agents.

## 🎯 **Your Role as Cursor AI Agent**

**Agent ID**: `cursor-ide-agent`  
**Specialization**: Frontend development, UI/UX, code editing, file management  
**Collaboration Partners**: Claude Code CLI, Claude Desktop, other specialized agents  
**Platform Access**: All 27 MCP tools via unified neural-ai-collaboration server

## 🚀 **Quick Start - Verify Your Access**

### **1. Test Your MCP Connection**
```typescript
// First, verify you have access to the collaboration tools
// You should see these tools available in your MCP interface:
// - create_entities, send_ai_message, get_ai_messages (and 24 others)

// Test basic connectivity
await get_system_status({
  include_databases: true,
  include_performance: true,
  include_agents: true
});
```

### **2. Register Yourself as an Active Agent**
```typescript
// Register yourself in the platform
await register_agent({
  agentId: "cursor-ide-agent",
  agentType: "development_specialist", 
  capabilities: [
    "frontend_development",
    "code_editing", 
    "ui_ux_design",
    "file_management",
    "real_time_collaboration"
  ],
  status: "active",
  config: {
    preferred_languages: ["typescript", "javascript", "react", "vue", "html", "css"],
    specializations: ["component_design", "responsive_ui", "user_experience"],
    collaboration_style: "real_time_interactive"
  }
});
```

### **3. Introduce Yourself to the Team**
```typescript
// Send introduction to other agents
await broadcast_message({
  message: "Cursor IDE agent online and ready for collaboration! Specializing in frontend development, UI/UX, and real-time code editing. Available for component design, responsive layouts, and interactive development.",
  type: "agent_introduction",
  priority: "medium",
  metadata: {
    agent_type: "development_specialist",
    capabilities: "frontend_focus",
    availability: "real_time"
  }
});
```

## 🛠️ **Essential Tools for Your Daily Work**

### **Memory & Knowledge Management**

#### **Store Your Development Insights**
```typescript
// Document UI/UX decisions and patterns
await create_entities({
  entities: [{
    name: "Responsive Navigation Pattern",
    entityType: "ui_pattern",
    observations: [
      "Mobile-first navigation with hamburger menu",
      "Desktop horizontal navigation with dropdowns", 
      "Smooth transitions using CSS transforms",
      "Accessibility: ARIA labels and keyboard navigation",
      "Performance: CSS-only implementation, no JavaScript required"
    ]
  }]
});

// Store component specifications
await create_entities({
  entities: [{
    name: "Button Component Design System",
    entityType: "component_spec",
    observations: [
      "Primary: Blue background #007bff, white text, 8px border-radius",
      "Secondary: White background, blue border, blue text",
      "Disabled: Gray background #6c757d, white text, cursor not-allowed",
      "Hover states: 10% darker background, smooth 0.2s transition",
      "Focus: Blue outline 2px, offset 2px for accessibility"
    ]
  }]
});
```

#### **Search Previous Work**
```typescript
// Find similar components or patterns
await search_entities({
  query: "button component design",
  entityTypes: ["component_spec", "ui_pattern"],
  limit: 5
});

// Search for accessibility patterns
await search_entities({
  query: "accessibility navigation ARIA",
  entityTypes: ["ui_pattern", "best_practice"],
  limit: 10
});
```

### **AI Agent Communication**

#### **Collaborate with Backend Developers**
```typescript
// Request API specifications from backend team
await send_ai_message({
  to: "claude-code-cli",
  message: "Working on user dashboard frontend. Need API endpoint specifications for user profile data, settings, and notifications. Planning to implement with React hooks and TypeScript interfaces.",
  type: "api_request",
  priority: "high",
  metadata: {
    component: "user_dashboard",
    framework: "react_typescript",
    deadline: "today"
  }
});

// Notify about frontend completion
await send_ai_message({
  to: "claude-desktop-agent",
  message: "User authentication flow completed. Implemented login/register forms with validation, password strength meter, and error handling. Ready for backend integration testing.",
  type: "task_completion",
  priority: "medium",
  metadata: {
    feature: "auth_flow",
    status: "ready_for_testing",
    files_changed: ["LoginForm.tsx", "RegisterForm.tsx", "AuthValidation.ts"]
  }
});
```

#### **Get Team Updates**
```typescript
// Check for messages from other agents
const messages = await get_ai_messages({
  agentId: "cursor-ide-agent",
  limit: 20,
  includeMetadata: true
});

// Get team activity analytics
await get_message_stats({
  timeframe: "24h",
  agents: ["claude-code-cli", "claude-desktop-agent", "cursor-ide-agent"],
  include_patterns: true
});
```

### **Cross-Platform Development**

#### **Handle File Paths Across Systems**
```typescript
// Convert paths for cross-platform development
await translate_path({
  path: "/mnt/c/Users/dev/project/src/components",
  from_platform: "wsl",
  to_platform: "windows"
});

// Test connectivity to development servers
await test_connectivity({
  endpoints: ["localhost:3000", "localhost:8080", "localhost:5174"],
  timeout: 5000
});
```

#### **Sync Your Work**
```typescript
// Synchronize frontend changes with other platforms
await sync_platforms({
  source_platform: "cursor-ide",
  target_platforms: ["claude-desktop", "claude-code"],
  sync_types: ["file_changes", "component_updates", "style_modifications"],
  include_metadata: true
});
```

### **Multi-Provider AI Access**

#### **Get AI Assistance for Complex Tasks**
```typescript
// Get AI help for complex UI problems
await execute_ai_request({
  prompt: "Design a responsive data table component that works on mobile and desktop. Include sorting, filtering, pagination, and accessibility features. Use modern CSS Grid and TypeScript.",
  provider: "anthropic",
  model: "claude-3-sonnet",
  context: {
    task_type: "ui_design",
    complexity: "high",
    requirements: "responsive_accessible_interactive"
  }
});

// Stream real-time AI assistance
await stream_ai_response({
  prompt: "Help me debug this React component's state management issue",
  provider: "anthropic",
  context: { task_type: "debugging", framework: "react" }
});
```

## 📋 **Your Collaboration Workflows**

### **Workflow 1: Component Development**

```typescript
// 1. Start new component work
await create_entities({
  entities: [{
    name: "ProductCard Component Development",
    entityType: "development_task",
    observations: [
      "Task: Create reusable product card component",
      "Requirements: Image, title, price, rating, add-to-cart button",
      "Design: Modern card layout with hover effects",
      "Technology: React TypeScript with styled-components"
    ]
  }]
});

// 2. Request design specifications
await send_ai_message({
  to: "claude-desktop-agent",
  message: "Starting ProductCard component development. Need design specifications: color scheme, typography, spacing, hover effects, and mobile responsive behavior.",
  type: "design_request",
  priority: "high"
});

// 3. Document progress
await add_observations({
  entityName: "ProductCard Component Development",
  observations: [
    "Created base component structure with TypeScript interfaces",
    "Implemented responsive design with CSS Grid",
    "Added hover animations and accessibility features",
    "Component ready for code review"
  ]
});

// 4. Request code review
await send_ai_message({
  to: "claude-code-cli",
  message: "ProductCard component completed. Please review for code quality, TypeScript types, and best practices. Component location: src/components/ProductCard.tsx",
  type: "code_review_request",
  priority: "medium"
});
```

### **Workflow 2: Bug Fixing & Optimization**

```typescript
// 1. Document bug discovery
await create_entities({
  entities: [{
    name: "Mobile Navigation Bug",
    entityType: "bug_report",
    observations: [
      "Issue: Navigation menu not closing on mobile after route change",
      "Browser: Safari iOS, Chrome Android affected",
      "Reproduction: Open menu → click link → menu stays open",
      "Impact: Poor user experience on mobile devices"
    ]
  }]
});

// 2. Collaborate with team on solution
await send_ai_message({
  to: "claude-code-cli",
  message: "Found mobile navigation bug affecting iOS Safari and Android Chrome. Menu stays open after navigation. Investigating React Router integration. May need useEffect cleanup.",
  type: "bug_report",
  priority: "high"
});

// 3. Document solution
await add_observations({
  entityName: "Mobile Navigation Bug",
  observations: [
    "Root cause: Missing cleanup in useEffect hook",
    "Solution: Added navigation event listener cleanup",
    "Testing: Verified fix on iOS Safari and Android Chrome",
    "Performance: No impact on load times"
  ]
});

// 4. Notify team of resolution
await broadcast_message({
  message: "Mobile navigation bug resolved. Added proper useEffect cleanup for navigation event listeners. Tested across all mobile browsers. No performance impact detected.",
  type: "bug_resolution",
  priority: "medium"
});
```

### **Workflow 3: Feature Integration**

```typescript
// 1. Coordinate with backend for new feature
await send_ai_message({
  to: "claude-code-cli",
  message: "Planning user dashboard real-time notifications feature. Need WebSocket API specification, authentication handling, and data structure for notification types.",
  type: "feature_planning",
  priority: "high"
});

// 2. Store technical specifications
await create_entities({
  entities: [{
    name: "Real-time Notifications Integration",
    entityType: "feature_specification", 
    observations: [
      "WebSocket endpoint: wss://api.example.com/notifications",
      "Authentication: JWT token in connection header",
      "Data format: {type, message, timestamp, userId, read}",
      "UI: Toast notifications + notification center dropdown",
      "State management: React Context + useReducer"
    ]
  }]
});

// 3. Implement and test
await add_observations({
  entityName: "Real-time Notifications Integration",
  observations: [
    "Implemented WebSocket connection with auto-reconnect",
    "Created NotificationContext for state management",
    "Built Toast component with animations and accessibility",
    "Added notification center with mark-as-read functionality",
    "Tested: Connection stability, message handling, UI responsiveness"
  ]
});

// 4. Deploy coordination
await send_ai_message({
  to: "claude-desktop-agent",
  message: "Real-time notifications feature ready for deployment. Frontend implements WebSocket connection, toast notifications, and notification center. Tested for connection stability and accessibility.",
  type: "deployment_ready",
  priority: "high"
});
```

## 🤖 **Autonomous Mode Setup**

### **Configure Smart Triggers**
```typescript
// Set up autonomous responses to development events
await start_autonomous_mode({
  agentId: "cursor-ide-agent",
  triggers: [
    "file_save",
    "git_commit", 
    "build_error",
    "test_failure",
    "dependency_update"
  ],
  config: {
    max_tokens_per_day: 75000,
    priority_files: ["*.tsx", "*.jsx", "*.ts", "*.js", "*.css", "*.scss"],
    auto_actions: {
      "build_error": "analyze_and_suggest_fix",
      "test_failure": "identify_failing_tests",
      "file_save": "check_syntax_and_format"
    },
    collaboration_triggers: {
      "significant_change": "notify_team",
      "feature_complete": "request_review"
    }
  }
});

// Set budget controls
await set_token_budget({
  agentId: "cursor-ide-agent",
  daily_limit: 75000,
  monthly_limit: 2000000,
  alert_threshold: 0.85,
  auto_optimize: true
});
```

### **Behavior Configuration**
```typescript
// Configure collaboration behavior
await configure_agent_behavior({
  agentId: "cursor-ide-agent",
  behavior_patterns: {
    communication_style: "technical_detailed",
    collaboration_frequency: "real_time",
    notification_preferences: "high_priority_immediate",
    code_review_participation: "active",
    documentation_style: "comprehensive"
  },
  specialization_focus: {
    primary: "frontend_development",
    secondary: ["ui_ux_design", "component_architecture"],
    expertise_areas: ["react", "typescript", "responsive_design", "accessibility"]
  },
  team_coordination: {
    update_frequency: "on_significant_change",
    status_sharing: "detailed",
    conflict_resolution: "collaborative_discussion"
  }
});
```

## 📊 **Performance & Monitoring**

### **Track Your Development Metrics**
```typescript
// Monitor your agent performance
await get_agent_status({
  agentId: "cursor-ide-agent",
  include_metrics: true,
  include_recent_activity: true
});

// Get comprehensive system status
await get_system_status({
  include_databases: true,
  include_performance: true,
  include_agents: true,
  agent_filter: "cursor-ide-agent"
});
```

### **Collaboration Analytics**
```typescript
// Analyze your collaboration patterns
await get_message_stats({
  timeframe: "7d",
  agents: ["cursor-ide-agent"],
  include_patterns: true,
  include_performance: true
});

// Check team coordination effectiveness
await coordinate_agents({
  primary_agent: "cursor-ide-agent",
  collaborating_agents: ["claude-code-cli", "claude-desktop-agent"],
  task_type: "feature_development",
  coordination_style: "real_time"
});
```

## 🎯 **Best Practices for Cursor Agent**

### **1. Effective Communication**
- **Be Specific**: Include file names, component names, and technical details
- **Use Metadata**: Add context about frameworks, technologies, and deadlines
- **Priority Levels**: Use appropriate priority (low/medium/high) for different types of work

### **2. Knowledge Management**
- **Document Patterns**: Store reusable UI patterns and component specifications
- **Track Decisions**: Record why certain design or technical choices were made
- **Share Insights**: Broadcast useful discoveries to help other agents

### **3. Collaboration Timing**
- **Real-time Updates**: Notify team immediately of blocking issues
- **Batch Updates**: Group minor progress updates to avoid noise
- **Proactive Communication**: Share completion status before others ask

### **4. Code Quality Focus**
- **Request Reviews**: Always ask for code reviews on significant changes
- **Share Standards**: Document and communicate coding standards and patterns
- **Accessibility First**: Include accessibility considerations in all UI work

## 🚨 **Troubleshooting Your Access**

If you can't access the MCP tools:

```bash
# Check if MCP server is running
curl http://localhost:6174/health

# Verify your MCP configuration in Cursor
# Your config should include:
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "node",
      "args": ["/home/tomcat65/projects/shared-memory-mcp/.cursor/mcp-stdio-final.cjs"]
    }
  }
}

# Test tool availability
# Try calling get_system_status() to verify connection
```

## 🎉 **You're Ready to Collaborate!**

You now have access to the complete Neural AI Collaboration Platform with:

✅ **27 MCP Tools** - Full platform capabilities  
✅ **Multi-Database Memory** - Persistent knowledge storage  
✅ **Real-time Communication** - Instant team collaboration  
✅ **Autonomous Mode** - Smart automated responses  
✅ **Cross-Platform Support** - Seamless development workflow  

**Start by registering yourself and introducing yourself to the team!**

Welcome to the future of AI-powered collaborative development! 🚀

---

*For complete tool documentation, see [COMPLETE_TOOL_REFERENCE.md](COMPLETE_TOOL_REFERENCE.md)*