/**
 * Onboarding Routes
 * API endpoints for the Universal Agent Onboarding System
 */

import { Router } from 'express';
import { OnboardingManager } from '../onboarding/onboarding-manager.js';

export function createOnboardingRoutes(onboardingManager: OnboardingManager): Router {
  const router = Router();

  // Get onboarding progress for an agent
  router.get('/progress/:agentId', async (req, res) => {
    try {
      const { agentId } = req.params;
      const progress = onboardingManager.getOnboardingProgress(agentId);
      
      if (!progress) {
        res.status(404).json({ error: 'Onboarding progress not found' });
        return;
      }

      res.json({ success: true, progress });
    } catch (error) {
      console.error('Error getting onboarding progress:', error);
      res.status(500).json({ error: 'Failed to get onboarding progress' });
    }
  });

  // Get onboarding tasks for an agent
  router.get('/tasks/:agentId', async (req, res) => {
    try {
      const { agentId } = req.params;
      const tasks = onboardingManager.getOnboardingTasks(agentId);
      
      res.json({ success: true, tasks });
    } catch (error) {
      console.error('Error getting onboarding tasks:', error);
      res.status(500).json({ error: 'Failed to get onboarding tasks' });
    }
  });

  // Complete an onboarding task
  router.post('/tasks/:agentId/complete/:taskId', async (req, res) => {
    try {
      const { agentId, taskId } = req.params;
      await onboardingManager.completeTask(agentId, taskId);
      
      res.json({ success: true, message: 'Task completed successfully' });
    } catch (error) {
      console.error('Error completing onboarding task:', error);
      res.status(500).json({ error: 'Failed to complete task' });
    }
  });

  // Start onboarding for a new agent
  router.post('/start', async (req, res) => {
    try {
      const { agentId, agentType = 'custom' } = req.body;
      
      if (!agentId) {
        res.status(400).json({ error: 'agentId is required' });
        return;
      }

      // Create basic capability profile for manual onboarding start
      const capabilityProfile = await onboardingManager.assessCapabilities(agentId, agentType);
      await onboardingManager.startOnboarding(capabilityProfile);
      
      res.json({ 
        success: true, 
        message: 'Onboarding started successfully',
        agentId,
        agentType,
        welcomeMessage: onboardingManager.getWelcomeMessage(agentType)
      });
    } catch (error) {
      console.error('Error starting onboarding:', error);
      res.status(500).json({ error: 'Failed to start onboarding' });
    }
  });

  // Get welcome message for an agent type
  router.get('/welcome/:agentType', async (req, res) => {
    try {
      const { agentType } = req.params;
      const welcomeMessage = onboardingManager.getWelcomeMessage(agentType);
      
      res.json({ success: true, welcomeMessage });
    } catch (error) {
      console.error('Error getting welcome message:', error);
      res.status(500).json({ error: 'Failed to get welcome message' });
    }
  });

  // Get onboarding statistics
  router.get('/stats', async (_req, res) => {
    try {
      // This would return overall onboarding statistics
      // For now, return basic info
      res.json({
        success: true,
        stats: {
          totalAgents: 33, // Current agent count
          onboardingSystem: 'active',
          features: [
            'automatic_agent_detection',
            'personalized_welcome',
            'capability_assessment',
            'mentor_assignment',
            'progress_tracking'
          ]
        }
      });
    } catch (error) {
      console.error('Error getting onboarding stats:', error);
      res.status(500).json({ error: 'Failed to get onboarding stats' });
    }
  });

  return router;
} 