#!/usr/bin/env tsx
import fs from 'fs';

const checks: { file: string; requiredSnippets: string[] }[] = [
  {
    file: 'src/unified-neural-mcp-server.ts',
    requiredSnippets: [
      'import { UnifiedToolSchemas } from',
      'inputSchema: UnifiedToolSchemas.send_ai_message.inputSchema',
      'inputSchema: UnifiedToolSchemas.get_ai_messages.inputSchema',
      'inputSchema: UnifiedToolSchemas.register_agent.inputSchema',
      'inputSchema: UnifiedToolSchemas.get_agent_status.inputSchema',
    ],
  },
  {
    file: 'src/mcp-http-server.ts',
    requiredSnippets: [
      'import { UnifiedToolSchemas } from',
      'inputSchema: UnifiedToolSchemas.send_ai_message.inputSchema',
    ],
  },
];

let ok = true;
for (const c of checks) {
  if (!fs.existsSync(c.file)) {
    console.error(`Missing file: ${c.file}`);
    ok = false;
    continue;
  }
  const text = fs.readFileSync(c.file, 'utf8');
  for (const snip of c.requiredSnippets) {
    if (!text.includes(snip)) {
      console.error(`Schema unification check failed: '${snip}' not found in ${c.file}`);
      ok = false;
    }
  }
}

if (!ok) process.exit(1);
console.log('Servers use unified tool schemas.');

