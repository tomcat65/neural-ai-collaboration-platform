import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NeuralMCPServer } from '../src/unified-neural-mcp-server.js';

async function mcpCall(server: NeuralMCPServer, toolName: string, args: Record<string, any> = {}): Promise<any> {
  const result = await (server as any)._handleToolCall(toolName, args);
  const text = result?.content?.[0]?.text;
  if (!text) return result;
  if (result?.isError) throw new Error(`Tool error: ${text}`);
  return JSON.parse(text);
}

describe('P0 message paging and context budgets', () => {
  let server: NeuralMCPServer;

  beforeAll(() => {
    process.env.ENABLE_ADVANCED_MEMORY = 'false';
    server = new NeuralMCPServer(0, ':memory:');
  });

  afterAll(() => {
    server.close();
    delete process.env.ENABLE_ADVANCED_MEMORY;
  });

  it('pages every matching message exactly once and reports the true total', async () => {
    const stamp = Date.now();
    const recipient = `paging-rx-${stamp}`;
    const sender = `paging-tx-${stamp}`;

    for (let index = 0; index < 7; index += 1) {
      await mcpCall(server, 'send_ai_message', {
        from: sender,
        to: recipient,
        content: `paging message ${index}`,
        messageType: 'info',
      });
    }

    const first = await mcpCall(server, 'get_ai_messages', {
      agentId: recipient,
      unreadOnly: false,
      limit: 3,
    });
    const second = await mcpCall(server, 'get_ai_messages', {
      agentId: recipient,
      unreadOnly: false,
      limit: 3,
      offset: first.nextOffset,
    });
    const third = await mcpCall(server, 'get_ai_messages', {
      agentId: recipient,
      unreadOnly: false,
      limit: 3,
      offset: second.nextOffset,
    });
    const beyondEnd = await mcpCall(server, 'get_ai_messages', {
      agentId: recipient,
      unreadOnly: false,
      limit: 3,
      offset: 99,
    });

    expect(first).toMatchObject({ totalMessages: 7, returnedMessages: 3, hasMore: true, nextOffset: 3 });
    expect(second).toMatchObject({ totalMessages: 7, returnedMessages: 3, hasMore: true, nextOffset: 6 });
    expect(third).toMatchObject({ totalMessages: 7, returnedMessages: 1, hasMore: false, nextOffset: null });
    expect(beyondEnd).toMatchObject({ totalMessages: 7, returnedMessages: 0, hasMore: false, nextOffset: null });

    const ids = [...first.messages, ...second.messages, ...third.messages].map((message: any) => message.id);
    expect(new Set(ids).size).toBe(7);
  });

  it('counts the same alias, sender, type, and archive filters used by the page query', async () => {
    const stamp = Date.now();
    const recipient = `paging-filter-rx-${stamp}`;
    const sender = `paging-filter-tx-${stamp}`;
    const otherSender = `paging-filter-other-${stamp}`;

    for (let index = 0; index < 3; index += 1) {
      await mcpCall(server, 'send_ai_message', {
        from: `${sender}-cli`,
        to: `${recipient}-cli`,
        content: `matching task ${index}`,
        messageType: 'task',
      });
    }
    await mcpCall(server, 'send_ai_message', {
      from: sender,
      to: recipient,
      content: 'wrong type',
      messageType: 'info',
    });
    await mcpCall(server, 'send_ai_message', {
      from: otherSender,
      to: recipient,
      content: 'wrong sender',
      messageType: 'task',
    });

    const first = await mcpCall(server, 'get_ai_messages', {
      agentId: recipient,
      from: sender,
      messageType: 'task',
      unreadOnly: false,
      limit: 2,
    });
    expect(first).toMatchObject({ totalMessages: 3, returnedMessages: 2, hasMore: true, nextOffset: 2 });

    await mcpCall(server, 'archive_messages', {
      agentId: recipient,
      messageIds: [first.messages[0].id],
    });

    const unarchived = await mcpCall(server, 'get_ai_messages', {
      agentId: `${recipient}-cli`,
      from: `${sender}-cli`,
      messageType: 'task',
      unreadOnly: false,
      limit: 20,
    });
    const withArchived = await mcpCall(server, 'get_ai_messages', {
      agentId: recipient,
      from: sender,
      messageType: 'task',
      unreadOnly: false,
      includeArchived: true,
      limit: 20,
    });

    expect(unarchived.totalMessages).toBe(2);
    expect(withArchived.totalMessages).toBe(3);
  });

  it('keeps unread pagination stable when each returned page is marked read', async () => {
    const stamp = Date.now();
    const recipient = `paging-mark-rx-${stamp}`;

    for (let index = 0; index < 5; index += 1) {
      await mcpCall(server, 'send_ai_message', {
        from: `paging-mark-tx-${stamp}`,
        to: recipient,
        content: `mark page ${index}`,
      });
    }

    const first = await mcpCall(server, 'get_ai_messages', {
      agentId: recipient,
      unreadOnly: true,
      markAsRead: true,
      limit: 2,
    });
    const second = await mcpCall(server, 'get_ai_messages', {
      agentId: recipient,
      unreadOnly: true,
      markAsRead: true,
      limit: 2,
      offset: first.nextOffset,
    });
    const third = await mcpCall(server, 'get_ai_messages', {
      agentId: recipient,
      unreadOnly: true,
      markAsRead: true,
      limit: 2,
      offset: second.nextOffset,
    });

    expect(first).toMatchObject({ totalMessages: 5, returnedMessages: 2, hasMore: true, nextOffset: 0 });
    expect(second).toMatchObject({ totalMessages: 3, returnedMessages: 2, hasMore: true, nextOffset: 0 });
    expect(third).toMatchObject({ totalMessages: 1, returnedMessages: 1, hasMore: false, nextOffset: null });

    const ids = [...first.messages, ...second.messages, ...third.messages].map((message: any) => message.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('keeps the legacy shared-memory fallback bounded and pageable', async () => {
    const legacyServer = new NeuralMCPServer(0, ':memory:');
    try {
      const db = legacyServer.getMemoryManager().getDb();
      db.exec('DROP TABLE ai_messages');
      const insert = db.prepare(`
        INSERT INTO shared_memory
          (id, tenant_id, memory_type, content, created_by, tags, created_at)
        VALUES (?, 'default', 'ai_message', ?, ?, '[]', ?)
      `);
      const stamp = Date.now();
      const recipient = `legacy-page-rx-${stamp}`;
      const sender = `legacy-page-tx-${stamp}`;
      for (let index = 0; index < 7; index += 1) {
        insert.run(
          `legacy-page-${stamp}-${index}`,
          JSON.stringify({
            to: `${recipient}-cli`,
            from: `${sender}-cli`,
            content: `legacy page ${index}`,
            messageType: 'task',
          }),
          sender,
          `2026-07-12 12:00:${String(index).padStart(2, '0')}`,
        );
      }
      insert.run(`legacy-malformed-${stamp}`, '{not-json', sender, '2026-07-12 12:01:00');

      const page = await mcpCall(legacyServer, 'get_ai_messages', {
        agentId: recipient,
        from: sender,
        messageType: 'task',
        unreadOnly: false,
        compact: false,
        limit: 3,
        offset: 3,
      });

      expect(page).toMatchObject({
        totalMessages: 7,
        returnedMessages: 3,
        hasMore: true,
        nextOffset: 6,
      });
      expect(page.messages.map((message: any) => message.content.content)).toEqual([
        'legacy page 3',
        'legacy page 2',
        'legacy page 1',
      ]);
    } finally {
      legacyServer.close();
    }
  });

  it('enforces an unadjusted hard context ceiling after trimming identity payloads', async () => {
    const agentId = `budget-agent-${Date.now()}`;
    for (let index = 0; index < 8; index += 1) {
      await mcpCall(server, 'record_learning', {
        agentId,
        context: `budget context ${index} ${'x'.repeat(300)}`,
        lesson: `budget lesson ${index} ${'y'.repeat(300)}`,
      });
    }
    await mcpCall(server, 'set_preferences', {
      agentId,
      preferences: { notes: 'z'.repeat(1200) },
    });

    const bundle = await mcpCall(server, 'get_agent_context', {
      agentId,
      maxTokens: 160,
    });

    expect(bundle.identity).toBeDefined();
    expect(bundle.meta).toMatchObject({
      requestedMaxTokens: 160,
      effectiveMaxTokens: 160,
      budgetFloorApplied: false,
      truncated: true,
    });
    expect(bundle.meta.tokenEstimate).toBeLessThanOrEqual(160);
    expect(bundle.meta.tokenEstimate).toBe(Math.ceil(JSON.stringify(bundle).length / 4));
  });

  it('drops oversized project, handoff, and user context before identity', async () => {
    const stamp = Date.now();
    const agentId = `budget-priority-agent-${stamp}`;
    const projectId = `budget-priority-project-${stamp}`;

    await mcpCall(server, 'record_learning', {
      agentId,
      context: 'identity context',
      lesson: 'retain this high-priority identity learning',
    });
    await mcpCall(server, 'create_entities', {
      entities: [{
        name: projectId,
        entityType: 'project',
        observations: [`oversized project ${'p'.repeat(3000)}`],
      }],
    });
    await mcpCall(server, 'update_user_profile', {
      userId: 'tommy',
      displayName: `Oversized User ${'u'.repeat(1200)}`,
    });
    await mcpCall(server, 'end_session', {
      agentId,
      projectId,
      summary: `oversized handoff ${'h'.repeat(3000)}`,
      openItems: [`oversized open item ${'o'.repeat(1200)}`],
    });

    const bundle = await mcpCall(server, 'get_agent_context', {
      agentId,
      projectId,
      userId: 'tommy',
      depth: 'warm',
      maxTokens: 350,
    });

    expect(bundle.meta.tokenEstimate).toBeLessThanOrEqual(350);
    expect(bundle.meta.tokenEstimate).toBe(Math.ceil(JSON.stringify(bundle).length / 4));
    expect(bundle.identity.learnings).toHaveLength(1);
    expect(bundle.meta.sectionsDropped).toEqual(expect.arrayContaining([
      'projectSummary',
      'projectEntity',
      'handoff',
      'user',
    ]));
    expect(bundle.meta.sectionsDropped).not.toContain('learnings(trimmed)');
  });

  it('raises an impossible tiny request to an explicit minimal identity budget', async () => {
    const bundle = await mcpCall(server, 'get_agent_context', {
      agentId: `tiny-budget-agent-${Date.now()}`,
      maxTokens: 1,
    });

    expect(bundle.identity).toEqual({ learnings: [] });
    expect(Object.keys(bundle).sort()).toEqual(['identity', 'meta']);
    expect(bundle.meta.requestedMaxTokens).toBe(1);
    expect(bundle.meta.effectiveMaxTokens).toBe(bundle.meta.minimumTokenBudget);
    expect(bundle.meta.effectiveMaxTokens).toBeGreaterThan(1);
    expect(bundle.meta.budgetFloorApplied).toBe(true);
    expect(bundle.meta.truncationReason).toBe('minimum_identity_envelope');
    expect(bundle.meta.sectionsDropped).toEqual(['contextBeyondIdentityEnvelope']);
    expect(bundle.meta.truncated).toBe(true);
    expect(bundle.meta.tokenEstimate).toBeLessThanOrEqual(bundle.meta.effectiveMaxTokens);
    expect(bundle.meta.tokenEstimate).toBe(Math.ceil(JSON.stringify(bundle).length / 4));
  });
});
