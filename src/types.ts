import { z } from 'zod';

// Entity schemas
export const AuditLogEntrySchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  targetType: z.enum(['entity', 'relation']),
  targetId: z.string().uuid(),
  agent: z.string(),
  timestamp: z.date(),
  details: z.string().optional(),
});

// Observation schema with privacy
export const ObservationSchema = z.object({
  content: z.string(),
  privacy: z.enum(['private', 'shared']).default('shared'),
});

// Add privacy field to Entity schema
export const EntitySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: z.string().min(1),
  observations: z.array(ObservationSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().default(1),
  privacy: z.enum(['private', 'shared']).default('shared'),
});

export const RelationSchema = z.object({
  id: z.string().uuid(),
  fromEntityId: z.string().uuid(),
  toEntityId: z.string().uuid(),
  relationType: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().default(1),
});

// MCP request/response schemas
export const CreateEntitiesRequestSchema = z.object({
  entities: z.array(z.object({
    name: z.string(),
    entityType: z.string(),
    observations: z.array(z.string()),
  })),
});

export const CreateRelationsRequestSchema = z.object({
  relations: z.array(z.object({
    from: z.string(),
    to: z.string(),
    relationType: z.string(),
  })),
});

export const AddObservationsRequestSchema = z.object({
  observations: z.array(z.object({
    entityName: z.string(),
    contents: z.array(z.string()),
  })),
});

export const SearchNodesRequestSchema = z.object({
  query: z.string(),
});

export const OpenNodesRequestSchema = z.object({
  names: z.array(z.string()),
});

// Type exports
export type Entity = z.infer<typeof EntitySchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type CreateEntitiesRequest = z.infer<typeof CreateEntitiesRequestSchema>;
export type CreateRelationsRequest = z.infer<typeof CreateRelationsRequestSchema>;
export type AddObservationsRequest = z.infer<typeof AddObservationsRequestSchema>;
export type SearchNodesRequest = z.infer<typeof SearchNodesRequestSchema>;
export type OpenNodesRequest = z.infer<typeof OpenNodesRequestSchema>;
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
export type Observation = z.infer<typeof ObservationSchema>;

// Memory graph interface
export interface MemoryGraph {
  entities: Entity[];
  relations: Relation[];
}