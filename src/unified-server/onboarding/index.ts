/**
 * Onboarding Module Index
 * Exports all onboarding-related components
 */

export { OnboardingManager } from './onboarding-manager.js';
export { AutoDiscoverySystem } from './auto-discovery.js';
export { MentorSystem } from './mentor-system.js';

export type { 
  CapabilityProfile, 
  OnboardingTask, 
  OnboardingProgress, 
  WelcomeTemplate 
} from './onboarding-manager.js';

export type {
  AgentAnnouncement,
  DiscoveryConfig,
  CapabilityNegotiation
} from './auto-discovery.js';

export type {
  MentorProfile,
  MentorAssignment,
  MentorshipSession
} from './mentor-system.js'; 