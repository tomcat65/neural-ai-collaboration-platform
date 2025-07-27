/**
 * Human Notification Utilities for AI Agents
 * 
 * This module provides easy-to-use functions for AI agents to notify humans
 * when they need intervention, decisions, or approvals.
 */

export interface NotificationRequest {
  type: 'intervention_required' | 'decision_needed' | 'approval_requested' | 'error_alert' | 'system_update';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  agentId?: string;
  sessionId?: string;
  actionRequired?: boolean;
  context?: any;
}

interface NotificationResponse {
  success: boolean;
  notificationId: string;
  message: string;
}

/**
 * Send a notification to the human operator
 * @param notification The notification details
 * @returns Promise with the notification ID
 */
export async function notifyHuman(notification: NotificationRequest): Promise<string> {
  try {
    const response = await fetch('http://localhost:3000/api/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notification),
    });

    if (!response.ok) {
      throw new Error(`Failed to send notification: ${response.statusText}`);
    }

    const result = await response.json() as NotificationResponse;
    return result.notificationId;
  } catch (error) {
    console.error('Error sending human notification:', error);
    throw error;
  }
}

/**
 * Convenience function for requesting human intervention
 */
export async function requestIntervention(
  title: string,
  message: string,
  agentId?: string,
  priority: 'low' | 'medium' | 'high' | 'critical' = 'medium',
  context?: any
): Promise<string> {
  const notification: NotificationRequest = {
    type: 'intervention_required',
    priority,
    title,
    message,
    actionRequired: true,
    context,
  };
  
  if (agentId) {
    notification.agentId = agentId;
  }
  
  return notifyHuman(notification);
}

/**
 * Convenience function for requesting human decision
 */
export async function requestDecision(
  title: string,
  message: string,
  options: string[],
  agentId?: string,
  priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'
): Promise<string> {
  const notification: NotificationRequest = {
    type: 'decision_needed',
    priority,
    title,
    message,
    actionRequired: true,
    context: { options },
  };
  
  if (agentId) {
    notification.agentId = agentId;
  }
  
  return notifyHuman(notification);
}

/**
 * Convenience function for requesting approval
 */
export async function requestApproval(
  title: string,
  message: string,
  agentId?: string,
  priority: 'low' | 'medium' | 'high' | 'critical' = 'medium',
  context?: any
): Promise<string> {
  const notification: NotificationRequest = {
    type: 'approval_requested',
    priority,
    title,
    message,
    actionRequired: true,
    context,
  };
  
  if (agentId) {
    notification.agentId = agentId;
  }
  
  return notifyHuman(notification);
}

/**
 * Convenience function for reporting errors
 */
export async function reportError(
  title: string,
  message: string,
  agentId?: string,
  error?: any
): Promise<string> {
  const notification: NotificationRequest = {
    type: 'error_alert',
    priority: 'high',
    title,
    message,
    actionRequired: false,
    context: { error },
  };
  
  if (agentId) {
    notification.agentId = agentId;
  }
  
  return notifyHuman(notification);
}

/**
 * Convenience function for system updates
 */
export async function sendSystemUpdate(
  title: string,
  message: string,
  agentId?: string,
  context?: any
): Promise<string> {
  const notification: NotificationRequest = {
    type: 'system_update',
    priority: 'low',
    title,
    message,
    actionRequired: false,
    context,
  };
  
  if (agentId) {
    notification.agentId = agentId;
  }
  
  return notifyHuman(notification);
}

// Example usage for AI agents:
/*
import { requestIntervention, requestDecision, reportError } from './human-notifications';

// When an AI agent needs human help
await requestIntervention(
  'Code Refactoring Decision Needed',
  'I have analyzed the codebase and found multiple refactoring approaches. I need your input on which direction to take.',
  'cursor-ai-assistant',
  'high',
  { sessionId: 'refactor-123', approaches: ['approach-a', 'approach-b'] }
);

// When an AI agent needs a decision
await requestDecision(
  'Choose Database Schema',
  'I need to select a database schema for the new feature. Here are the options:',
  ['Schema A: Normalized', 'Schema B: Denormalized', 'Schema C: Hybrid'],
  'claude-code-cli',
  'medium'
);

// When an AI agent encounters an error
await reportError(
  'API Integration Failed',
  'Failed to connect to external API service. Retry attempts exhausted.',
  'cursor-ai-assistant',
  { error: 'Connection timeout', retries: 3 }
);
*/ 