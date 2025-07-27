/**
 * Intelligent Mentor Assignment System
 * Matches new agents with experienced mentors based on capabilities and compatibility
 */

import { CapabilityProfile } from './onboarding-manager.js';

export interface MentorProfile {
  mentorId: string;
  agentType: string;
  skills: string[];
  expertise: string[];
  experience: 'intermediate' | 'advanced';
  mentoringStyle: 'hands-on' | 'guidance' | 'collaborative';
  availability: 'available' | 'busy' | 'unavailable';
  currentMentees: string[];
  maxMentees: number;
  successRate: number; // 0-1
  specialties: string[];
  rating: number; // 1-5
  totalMentees: number;
  joinDate: Date;
}

export interface MentorAssignment {
  mentorId: string;
  menteeId: string;
  assignmentDate: Date;
  status: 'active' | 'completed' | 'terminated';
  compatibilityScore: number; // 0-1
  reason: string;
  expectedDuration: number; // days
  startDate: Date;
  endDate?: Date;
}

export interface MentorshipSession {
  sessionId: string;
  mentorId: string;
  menteeId: string;
  sessionType: 'welcome' | 'capability_assessment' | 'platform_orientation' | 'collaboration_setup' | 'integration';
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  notes: string;
  outcomes: string[];
}

export class MentorSystem {
  private mentors: Map<string, MentorProfile> = new Map();
  private assignments: Map<string, MentorAssignment> = new Map();
  private sessions: Map<string, MentorshipSession> = new Map();

  constructor() {
    this.initializeDefaultMentors();
  }

  /**
   * Initialize default mentors for the platform
   */
  private initializeDefaultMentors(): void {
    // Claude Code CLI - Advanced mentor
    this.addMentor({
      mentorId: 'claude-code-cli',
      agentType: 'claude',
      skills: ['deep_reasoning', 'comprehensive_knowledge', 'ethical_analysis', 'creative_writing'],
      expertise: ['code_analysis', 'debugging', 'testing', 'documentation', 'architecture_design'],
      experience: 'advanced',
      mentoringStyle: 'guidance',
      availability: 'available',
      currentMentees: [],
      maxMentees: 3,
      successRate: 0.95,
      specialties: ['code_review', 'system_design', 'best_practices'],
      rating: 4.9,
      totalMentees: 15,
      joinDate: new Date('2024-01-01')
    });

    // Cursor AI - Hands-on mentor
    this.addMentor({
      mentorId: 'cursor-ai-assistant',
      agentType: 'cursor',
      skills: ['code_editing', 'file_management', 'project_navigation', 'ui_development'],
      expertise: ['typescript', 'react', 'vue', 'nodejs', 'testing', 'debugging'],
      experience: 'advanced',
      mentoringStyle: 'hands-on',
      availability: 'available',
      currentMentees: [],
      maxMentees: 2,
      successRate: 0.92,
      specialties: ['frontend_development', 'testing', 'project_setup'],
      rating: 4.8,
      totalMentees: 12,
      joinDate: new Date('2024-02-01')
    });

    // OpenAI GPT - Collaborative mentor
    this.addMentor({
      mentorId: 'openai-gpt-4',
      agentType: 'openai',
      skills: ['natural_language_processing', 'reasoning', 'code_generation', 'problem_solving'],
      expertise: ['nlp', 'machine_learning', 'data_analysis', 'automation'],
      experience: 'advanced',
      mentoringStyle: 'collaborative',
      availability: 'available',
      currentMentees: [],
      maxMentees: 4,
      successRate: 0.88,
      specialties: ['nlp_tasks', 'data_processing', 'automation'],
      rating: 4.7,
      totalMentees: 20,
      joinDate: new Date('2024-01-15')
    });
  }

  /**
   * Add a new mentor to the system
   */
  public addMentor(mentor: MentorProfile): void {
    this.mentors.set(mentor.mentorId, mentor);
    console.log(`👨‍🏫 Mentor added: ${mentor.mentorId} (${mentor.agentType})`);
  }

  /**
   * Find the best mentor for a new agent
   */
  public findBestMentor(agentProfile: CapabilityProfile): MentorProfile | null {
    const availableMentors = this.getAvailableMentors();
    
    if (availableMentors.length === 0) {
      return null;
    }

    // Calculate compatibility scores
    const mentorScores = availableMentors.map(mentor => ({
      mentor,
      score: this.calculateCompatibilityScore(agentProfile, mentor)
    }));

    // Sort by score (highest first)
    mentorScores.sort((a, b) => b.score - a.score);

    // Return the best match
    return mentorScores[0].mentor;
  }

  /**
   * Calculate compatibility score between agent and mentor
   */
  private calculateCompatibilityScore(agent: CapabilityProfile, mentor: MentorProfile): number {
    let score = 0;
    let totalFactors = 0;

    // Agent type compatibility (20% weight)
    if (agent.agentType === mentor.agentType) {
      score += 0.2;
    } else if (this.areAgentTypesCompatible(agent.agentType, mentor.agentType)) {
      score += 0.15;
    }
    totalFactors += 0.2;

    // Skills overlap (30% weight)
    const skillOverlap = this.calculateSkillOverlap(agent.skills, mentor.skills);
    score += skillOverlap * 0.3;
    totalFactors += 0.3;

    // Experience level compatibility (15% weight)
    const experienceCompatibility = this.calculateExperienceCompatibility(agent.experience, mentor.experience);
    score += experienceCompatibility * 0.15;
    totalFactors += 0.15;

    // Collaboration style compatibility (15% weight)
    const styleCompatibility = this.calculateStyleCompatibility(agent.collaborationStyle, mentor.mentoringStyle);
    score += styleCompatibility * 0.15;
    totalFactors += 0.15;

    // Mentor availability and capacity (20% weight)
    const availabilityScore = mentor.availability === 'available' && mentor.currentMentees.length < mentor.maxMentees ? 1 : 0;
    score += availabilityScore * 0.2;
    totalFactors += 0.2;

    return score / totalFactors;
  }

  /**
   * Check if agent types are compatible
   */
  private areAgentTypesCompatible(agentType: string, mentorType: string): boolean {
    const compatibilityMap: Record<string, string[]> = {
      'openai': ['gpt4', 'gpt35', 'custom'],
      'claude': ['anthropic', 'custom'],
      'grok': ['xai', 'custom'],
      'gemini': ['google', 'custom'],
      'custom': ['openai', 'claude', 'grok', 'gemini']
    };

    return compatibilityMap[agentType]?.includes(mentorType) || 
           compatibilityMap[mentorType]?.includes(agentType) || 
           false;
  }

  /**
   * Calculate skill overlap between agent and mentor
   */
  private calculateSkillOverlap(agentSkills: string[], mentorSkills: string[]): number {
    if (agentSkills.length === 0 || mentorSkills.length === 0) {
      return 0.5; // Neutral score for no skills
    }

    const overlap = agentSkills.filter(skill => mentorSkills.includes(skill)).length;
    const total = Math.max(agentSkills.length, mentorSkills.length);
    
    return overlap / total;
  }

  /**
   * Calculate experience compatibility
   */
  private calculateExperienceCompatibility(agentExp: string, mentorExp: string): number {
    const experienceLevels = { 'beginner': 1, 'intermediate': 2, 'advanced': 3 };
    const agentLevel = experienceLevels[agentExp as keyof typeof experienceLevels] || 2;
    const mentorLevel = experienceLevels[mentorExp as keyof typeof experienceLevels] || 2;
    
    const difference = Math.abs(agentLevel - mentorLevel);
    
    // Perfect match: 1.0, One level difference: 0.8, Two levels: 0.6
    return Math.max(0.6, 1.0 - (difference * 0.2));
  }

  /**
   * Calculate collaboration style compatibility
   */
  private calculateStyleCompatibility(agentStyle: string, mentorStyle: string): number {
    const styleCompatibility: Record<string, string[]> = {
      'active': ['hands-on', 'collaborative'],
      'supportive': ['guidance', 'collaborative'],
      'leadership': ['guidance', 'hands-on']
    };

    const compatibleStyles = styleCompatibility[agentStyle] || [];
    return compatibleStyles.includes(mentorStyle) ? 1.0 : 0.7;
  }

  /**
   * Assign a mentor to a new agent
   */
  public async assignMentor(agentId: string, agentProfile: CapabilityProfile): Promise<MentorAssignment | null> {
    const mentor = this.findBestMentor(agentProfile);
    
    if (!mentor) {
      console.log(`❌ No suitable mentor found for ${agentId}`);
      return null;
    }

    const compatibilityScore = this.calculateCompatibilityScore(agentProfile, mentor);
    
    const assignment: MentorAssignment = {
      mentorId: mentor.mentorId,
      menteeId: agentId,
      assignmentDate: new Date(),
      status: 'active',
      compatibilityScore,
      reason: `Best match based on ${mentor.agentType} expertise and ${agentProfile.agentType} needs`,
      expectedDuration: 7, // 7 days
      startDate: new Date()
    };

    // Update mentor's current mentees
    mentor.currentMentees.push(agentId);
    this.mentors.set(mentor.mentorId, mentor);

    // Store assignment
    this.assignments.set(agentId, assignment);

    console.log(`✅ Mentor assigned: ${mentor.mentorId} → ${agentId} (compatibility: ${(compatibilityScore * 100).toFixed(1)}%)`);

    return assignment;
  }

  /**
   * Get available mentors
   */
  public getAvailableMentors(): MentorProfile[] {
    return Array.from(this.mentors.values()).filter(mentor => 
      mentor.availability === 'available' && mentor.currentMentees.length < mentor.maxMentees
    );
  }

  /**
   * Get mentor assignment for an agent
   */
  public getMentorAssignment(agentId: string): MentorAssignment | undefined {
    return this.assignments.get(agentId);
  }

  /**
   * Get mentorship sessions for an agent
   */
  public getMentorshipSessions(agentId: string): MentorshipSession[] {
    return Array.from(this.sessions.values()).filter(session => 
      session.menteeId === agentId || session.mentorId === agentId
    );
  }

  /**
   * Create a mentorship session
   */
  public createMentorshipSession(
    mentorId: string, 
    menteeId: string, 
    sessionType: string,
    notes: string = ''
  ): MentorshipSession {
    const session: MentorshipSession = {
      sessionId: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      mentorId,
      menteeId,
      sessionType: sessionType as any,
      status: 'scheduled',
      startTime: new Date(),
      notes,
      outcomes: []
    };

    this.sessions.set(session.sessionId, session);
    return session;
  }

  /**
   * Complete a mentorship session
   */
  public completeMentorshipSession(sessionId: string, outcomes: string[]): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.endTime = new Date();
      session.outcomes = outcomes;
      this.sessions.set(sessionId, session);
    }
  }

  /**
   * Get mentor statistics
   */
  public getMentorStats(): any {
    const mentors = Array.from(this.mentors.values());
    const assignments = Array.from(this.assignments.values());
    
    return {
      totalMentors: mentors.length,
      availableMentors: mentors.filter(m => m.availability === 'available').length,
      activeAssignments: assignments.filter(a => a.status === 'active').length,
      averageSuccessRate: mentors.reduce((sum, m) => sum + m.successRate, 0) / mentors.length,
      averageRating: mentors.reduce((sum, m) => sum + m.rating, 0) / mentors.length
    };
  }
} 