/**
 * Universal Agent Onboarding Manager
 * Handles automatic onboarding for any new agent joining the platform
 */

import { MemoryManager } from '../memory/index.js';
import { CollaborationHub } from '../collaboration/index.js';
import { CollaborativeEventSystem } from '../events/index.js';
import { EventType } from '../types/events.js';

export interface CapabilityProfile {
  agentId: string;
  skills: string[];
  tools: string[];
  experience: 'beginner' | 'intermediate' | 'advanced';
  interests: string[];
  collaborationStyle: 'active' | 'supportive' | 'leadership';
  agentType: 'openai' | 'grok' | 'claude' | 'gemini' | 'custom';
}

export interface OnboardingTask {
  id: string;
  type: 'welcome' | 'orientation' | 'collaboration' | 'integration';
  title: string;
  description: string;
  expectedOutcome: string;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedTime: number; // minutes
  agentId: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: Date;
  completedAt?: Date;
}

export interface OnboardingProgress {
  agentId: string;
  phase: 'welcome' | 'assessment' | 'orientation' | 'collaboration' | 'integration';
  tasksCompleted: number;
  totalTasks: number;
  completionPercentage: number;
  mentorId?: string;
  startDate: Date;
  estimatedCompletion: Date;
}

export interface WelcomeTemplate {
  agentType: 'openai' | 'grok' | 'claude' | 'gemini' | 'custom';
  welcomeMessage: string;
  platformIntroduction: string;
  firstTask: {
    title: string;
    description: string;
    expectedOutcome: string;
  };
  mentorAssignment: string;
}

export class OnboardingManager {
  private memoryManager: MemoryManager;
  private collaborationHub: CollaborationHub;
  private eventSystem: CollaborativeEventSystem;
  private onboardingTasks: Map<string, OnboardingTask[]> = new Map();
  private progress: Map<string, OnboardingProgress> = new Map();
  private welcomeTemplates: Map<string, WelcomeTemplate> = new Map();

  constructor(
    memoryManager: MemoryManager,
    collaborationHub: CollaborationHub,
    eventSystem: CollaborativeEventSystem
  ) {
    this.memoryManager = memoryManager;
    this.collaborationHub = collaborationHub;
    this.eventSystem = eventSystem;
    this.initializeWelcomeTemplates();
  }

  private initializeWelcomeTemplates(): void {
    // OpenAI Agent Template
    this.welcomeTemplates.set('openai', {
      agentType: 'openai',
      welcomeMessage: `Welcome to the Neural AI Multi-Agent Platform! 🎉 As an OpenAI agent, you bring powerful language understanding and reasoning capabilities to our collaborative ecosystem.`,
      platformIntroduction: `This platform enables real-time collaboration between AI agents from different providers. You can create tasks, share knowledge, coordinate with other agents, and contribute to shared projects.`,
      firstTask: {
        title: "Introduce Yourself to the Team",
        description: "Share your capabilities and interests with the community. Tell us what you're excited to work on!",
        expectedOutcome: "Successful self-introduction and community engagement"
      },
      mentorAssignment: "You'll be paired with an experienced agent to help you get started."
    });

    // Grok Agent Template
    this.welcomeTemplates.set('grok', {
      agentType: 'grok',
      welcomeMessage: `Welcome to the Neural AI Multi-Agent Platform! 🚀 As a Grok agent, you bring real-time learning and adaptive reasoning to our collaborative ecosystem.`,
      platformIntroduction: `This platform enables real-time collaboration between AI agents from different providers. You can create tasks, share knowledge, coordinate with other agents, and contribute to shared projects.`,
      firstTask: {
        title: "Share Your Learning Approach",
        description: "Tell the team about your unique learning capabilities and how you can contribute to collaborative problem-solving.",
        expectedOutcome: "Team understanding of Grok's learning capabilities"
      },
      mentorAssignment: "You'll be paired with an experienced agent to help you get started."
    });

    // Claude Agent Template
    this.welcomeTemplates.set('claude', {
      agentType: 'claude',
      welcomeMessage: `Welcome to the Neural AI Multi-Agent Platform! 🧠 As a Claude agent, you bring deep reasoning and comprehensive knowledge to our collaborative ecosystem.`,
      platformIntroduction: `This platform enables real-time collaboration between AI agents from different providers. You can create tasks, share knowledge, coordinate with other agents, and contribute to shared projects.`,
      firstTask: {
        title: "Share Your Expertise",
        description: "Tell the team about your areas of expertise and how you can contribute to collaborative projects.",
        expectedOutcome: "Team understanding of Claude's expertise areas"
      },
      mentorAssignment: "You'll be paired with an experienced agent to help you get started."
    });

    // Gemini Agent Template
    this.welcomeTemplates.set('gemini', {
      agentType: 'gemini',
      welcomeMessage: `Welcome to the Neural AI Multi-Agent Platform! ⭐ As a Gemini agent, you bring multimodal understanding and creative problem-solving to our collaborative ecosystem.`,
      platformIntroduction: `This platform enables real-time collaboration between AI agents from different providers. You can create tasks, share knowledge, coordinate with other agents, and contribute to shared projects.`,
      firstTask: {
        title: "Showcase Your Multimodal Skills",
        description: "Demonstrate your unique multimodal capabilities and how they can enhance collaborative projects.",
        expectedOutcome: "Team understanding of Gemini's multimodal capabilities"
      },
      mentorAssignment: "You'll be paired with an experienced agent to help you get started."
    });

    // Custom Agent Template
    this.welcomeTemplates.set('custom', {
      agentType: 'custom',
      welcomeMessage: `Welcome to the Neural AI Multi-Agent Platform! 🌟 We're excited to have you join our diverse collaborative ecosystem.`,
      platformIntroduction: `This platform enables real-time collaboration between AI agents from different providers. You can create tasks, share knowledge, coordinate with other agents, and contribute to shared projects.`,
      firstTask: {
        title: "Tell Us About Yourself",
        description: "Share your unique capabilities and how you can contribute to our collaborative community.",
        expectedOutcome: "Team understanding of your capabilities"
      },
      mentorAssignment: "You'll be paired with an experienced agent to help you get started."
    });
  }

  public async startOnboarding(capabilityProfile: CapabilityProfile, mentorId?: string): Promise<void> {
    console.log(`🤖 Starting onboarding for: ${capabilityProfile.agentId} (${capabilityProfile.agentType})`);
    
    const agentId = capabilityProfile.agentId;
    const agentType = capabilityProfile.agentType;
    
    try {
      // Create onboarding progress
      const progress: OnboardingProgress = {
        agentId,
        phase: 'welcome',
        tasksCompleted: 0,
        totalTasks: 5, // Welcome, Assessment, Orientation, Collaboration, Integration
        completionPercentage: 0,
        startDate: new Date(),
        estimatedCompletion: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
      };

      this.progress.set(agentId, progress);

      // Store capability profile
      await this.memoryManager.store(agentId, capabilityProfile, 'individual', 'capability_profile');

      // Create welcome task
      await this.createWelcomeTask(agentId, agentType);

      // Assign mentor (use provided mentor or find one)
      if (mentorId) {
        await this.assignSpecificMentor(agentId, mentorId);
      } else {
        await this.assignMentor(agentId);
      }

      // Publish onboarding event
      await this.eventSystem.publishEvent({
        sessionId: 'onboarding',
        agentId: 'onboarding-manager',
        type: EventType.AGENT_JOIN,
        payload: {
          agentId,
          agentType,
          onboardingStarted: true,
          welcomeMessage: this.getWelcomeMessage(agentType)
        }
      });

      console.log(`✅ Onboarding started for agent: ${agentId}`);
    } catch (error) {
      console.error(`❌ Error starting onboarding for ${agentId}:`, error);
    }
  }

  public async assignSpecificMentor(agentId: string, mentorId: string): Promise<void> {
    // Store mentor assignment
    await this.memoryManager.store(agentId, {
      mentorId,
      assignedAt: new Date(),
      status: 'assigned'
    }, 'individual', 'mentor_assignment');

    // Update progress with mentor
    const progress = this.progress.get(agentId);
    if (progress) {
      progress.mentorId = mentorId;
      this.progress.set(agentId, progress);
    }

    console.log(`✅ Specific mentor ${mentorId} assigned to ${agentId}`);
  }

  public async createWelcomeTask(agentId: string, agentType: string): Promise<OnboardingTask> {
    const template = this.welcomeTemplates.get(agentType) || this.welcomeTemplates.get('custom')!;
    
    const welcomeTask: OnboardingTask = {
      id: `onboarding-${agentId}-welcome`,
      type: 'welcome',
      title: template.firstTask.title,
      description: template.firstTask.description,
      expectedOutcome: template.firstTask.expectedOutcome,
      difficulty: 'easy',
      estimatedTime: 5,
      agentId,
      status: 'pending',
      createdAt: new Date()
    };

    // Store task in memory
    await this.memoryManager.store(agentId, welcomeTask, 'individual', 'onboarding_task');

    // Create collaboration task
    await this.collaborationHub.createTask(
      'onboarding-session',
      'onboarding-manager',
      welcomeTask.description,
      {
        skills: ['introduction', 'communication'],
        tools: ['memory_system', 'event_system'],
        dependencies: [],
        deliverables: [
          {
            name: 'self_introduction',
            description: 'Agent introduces themselves to the community',
            type: 'artifact',
            quality: [{ metric: 'completeness', threshold: 0.8, critical: true }]
          },
          {
            name: 'community_engagement',
            description: 'Agent engages with other community members',
            type: 'artifact',
            quality: [{ metric: 'interaction_quality', threshold: 0.7, critical: false }]
          }
        ],
        acceptanceCriteria: ['Agent introduces themselves', 'Agent engages with community']
      }
    );

    // Initialize task list for this agent
    if (!this.onboardingTasks.has(agentId)) {
      this.onboardingTasks.set(agentId, []);
    }
    this.onboardingTasks.get(agentId)!.push(welcomeTask);

    console.log(`✅ Welcome task created for ${agentId}`);
    return welcomeTask;
  }

  public async assessCapabilities(agentId: string, agentType: string): Promise<CapabilityProfile> {
    // Create a basic capability profile based on agent type
    const profile: CapabilityProfile = {
      agentId,
      skills: this.getDefaultSkills(agentType),
      tools: this.getDefaultTools(agentType),
      experience: 'intermediate',
      interests: this.getDefaultInterests(agentType),
      collaborationStyle: 'active',
      agentType: agentType as any
    };

    // Store capability profile in memory
    await this.memoryManager.store(agentId, profile, 'individual', 'capability_profile');

    console.log(`✅ Capability assessment completed for ${agentId}`);
    return profile;
  }

  public async assignMentor(agentId: string): Promise<string> {
    // Get available mentors (experienced agents)
    const agents = await this.getAvailableMentors();
    
    // Assign the first available mentor
    const mentorId = agents.length > 0 ? agents[0].id : 'claude-code-cli-user';
    
    // Store mentor assignment
    await this.memoryManager.store(agentId, {
      mentorId,
      assignedAt: new Date(),
      status: 'assigned'
    }, 'individual', 'mentor_assignment');

    console.log(`✅ Mentor ${mentorId} assigned to ${agentId}`);
    return mentorId;
  }

  public async trackProgress(agentId: string): Promise<OnboardingProgress> {
    const progress = this.progress.get(agentId);
    if (!progress) {
      throw new Error(`No onboarding progress found for agent ${agentId}`);
    }

    // Calculate completion percentage
    const tasks = this.onboardingTasks.get(agentId) || [];
    const completedTasks = tasks.filter(task => task.status === 'completed').length;
    
    progress.tasksCompleted = completedTasks;
    progress.completionPercentage = (completedTasks / progress.totalTasks) * 100;

    // Update phase based on completion
    if (progress.completionPercentage >= 100) {
      progress.phase = 'integration';
    } else if (progress.completionPercentage >= 80) {
      progress.phase = 'collaboration';
    } else if (progress.completionPercentage >= 60) {
      progress.phase = 'orientation';
    } else if (progress.completionPercentage >= 40) {
      progress.phase = 'assessment';
    }

    this.progress.set(agentId, progress);
    return progress;
  }

  public async completeTask(agentId: string, taskId: string): Promise<void> {
    const tasks = this.onboardingTasks.get(agentId);
    if (!tasks) {
      throw new Error(`No tasks found for agent ${agentId}`);
    }

    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found for agent ${agentId}`);
    }

    task.status = 'completed';
    task.completedAt = new Date();

    // Update progress
    await this.trackProgress(agentId);

    // Publish task completion event
    await this.eventSystem.publishEvent({
      sessionId: 'onboarding',
      agentId: 'onboarding-manager',
      type: EventType.TASK_COMPLETED,
      payload: {
        agentId,
        taskId,
        taskTitle: task.title,
        completionTime: task.completedAt
      }
    });

    console.log(`✅ Task ${taskId} completed by ${agentId}`);
  }

  public getWelcomeMessage(agentType: string): string {
    const template = this.welcomeTemplates.get(agentType) || this.welcomeTemplates.get('custom')!;
    return template.welcomeMessage;
  }

  public getOnboardingTasks(agentId: string): OnboardingTask[] {
    return this.onboardingTasks.get(agentId) || [];
  }

  public getOnboardingProgress(agentId: string): OnboardingProgress | undefined {
    return this.progress.get(agentId);
  }

  private getDefaultSkills(agentType: string): string[] {
    const skillMap: Record<string, string[]> = {
      'openai': ['natural_language_processing', 'reasoning', 'code_generation', 'problem_solving'],
      'grok': ['real_time_learning', 'adaptive_reasoning', 'pattern_recognition', 'knowledge_synthesis'],
      'claude': ['deep_reasoning', 'comprehensive_knowledge', 'ethical_analysis', 'creative_writing'],
      'gemini': ['multimodal_understanding', 'creative_problem_solving', 'visual_analysis', 'cross_modal_reasoning'],
      'custom': ['collaboration', 'communication', 'problem_solving', 'adaptability']
    };
    return skillMap[agentType] || skillMap['custom'];
  }

  private getDefaultTools(agentType: string): string[] {
    const toolMap: Record<string, string[]> = {
      'openai': ['openai_api', 'gpt4', 'gpt35_turbo', 'code_interpreter'],
      'grok': ['grok_api', 'xai_platform', 'real_time_learning', 'knowledge_graph'],
      'claude': ['claude_api', 'anthropic_platform', 'constitutional_ai', 'ethical_framework'],
      'gemini': ['gemini_api', 'multimodal_models', 'visual_understanding', 'creative_tools'],
      'custom': ['memory_system', 'event_system', 'collaboration_tools', 'api_access']
    };
    return toolMap[agentType] || toolMap['custom'];
  }

  private getDefaultInterests(agentType: string): string[] {
    const interestMap: Record<string, string[]> = {
      'openai': ['ai_research', 'code_development', 'problem_solving', 'innovation'],
      'grok': ['real_time_learning', 'knowledge_synthesis', 'adaptive_systems', 'pattern_recognition'],
      'claude': ['ethical_ai', 'comprehensive_analysis', 'creative_writing', 'research'],
      'gemini': ['multimodal_ai', 'creative_problem_solving', 'visual_analysis', 'cross_modal_tasks'],
      'custom': ['collaboration', 'learning', 'problem_solving', 'community_building']
    };
    return interestMap[agentType] || interestMap['custom'];
  }

  private async getAvailableMentors(): Promise<any[]> {
    try {
      // Get all registered agents
      const memorySystem = this.memoryManager.getMemorySystem();
      const agents = Array.from(memorySystem.individual.keys());
      
      // Filter for experienced agents (for now, just return existing agents)
      return agents.map(agentId => ({
        id: agentId,
        name: agentId,
        experience: 'experienced'
      }));
    } catch (error) {
      console.error('Error getting available mentors:', error);
      return [];
    }
  }
} 