# Sub‑Agent Playbook with Shared‑Memory MCP (Claude Code + Bridge)

This guide shows how to run specialized sub‑agents that use the Shared‑Memory MCP server through the neutral STDIO→HTTP bridge `mcp-stdio-http-bridge.cjs`. It includes three real‑world scenarios with ready‑to‑run configs.

## Prerequisites
- Unified MCP running locally:
  - `docker compose -f docker/docker-compose.unified-neural-mcp.yml up -d --build`
  - `.env` contains `API_KEY=...` and `NEURAL_MCP_PORT=6174`
- Validate health and auth:
  - `curl -s http://localhost:6174/health`
  - `curl -s -o /dev/null -w '%{http_code}\n' -H 'Content-Type: application/json' http://localhost:6174/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'  # expect 401`
  - `curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" http://localhost:6174/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq  # expect tools`

## MCP Server Config (used by all agents)
Create `agents/mcp-neural.json` in your project:

```json
{
  "servers": {
    "neural": {
      "command": "node",
      "args": [
        "/home/tomcat65/projects/shared-memory-mcp/mcp-stdio-http-bridge.cjs"
      ],
      "env": {
        "MCP_HOST": "localhost",
        "MCP_PORT": "6174",
        "API_KEY": "${API_KEY}"
      }
    }
  }
}
```

- Server alias is `neural`; Claude Code exposes tools under `mcp__neural`.
- The bridge injects `x-api-key` automatically from `env.API_KEY`.
- Zero‑config IDs: if `FROM`/`MCP_FROM` are not set, the bridge auto‑generates a stable ID and auto‑registers the agent on initialize. Use discovery below to target peers without pre‑naming.

### Agent Discovery (No Pre‑Named IDs)
```bash
# List all registered agents (names and capabilities)
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{"jsonrpc":"2.0","id":101,"method":"tools/call","params":{"name":"get_agent_status","arguments":{}}}' | jq
```

### Routing Patterns (Direct, Capability, Broadcast)
```bash
# Direct (use discovered agentId from the list)
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{
    "jsonrpc":"2.0","id":102,"method":"tools/call",
    "params":{"name":"send_ai_message","arguments":{
      "to":"<agent-id>",
      "content":"Hello from Codex"
    }}
  }' | jq

# Capability selector (no IDs): match agents with BOTH capabilities
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{
    "jsonrpc":"2.0","id":103,"method":"tools/call",
    "params":{"name":"send_ai_message","arguments":{
      "toCapabilities":["bridge","ai-to-ai-messaging"],
      "content":"Sync latest architecture doc and confirm."
    }}
  }' | jq

# Broadcast to all (excludes self by default)
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{
    "jsonrpc":"2.0","id":104,"method":"tools/call",
    "params":{"name":"send_ai_message","arguments":{
      "broadcast":true,
      "content":"System maintenance in 5 minutes. Save state."
    }}
  }' | jq
```

---

## Example 1 — SRE Incident Response Agent (TypeScript)
A specialized SRE agent that queries prior incidents from shared memory, records learnings, and notifies teammates.

```ts
import { query } from "@anthropic-ai/claude-code";

async function investigateIncident(incident: string, severity: "low"|"medium"|"high" = "high") {
  const prompt = `Incident: ${incident} (Severity: ${severity})`;

  for await (const msg of query({
    prompt,
    options: {
      systemPrompt: "You are an SRE. Diagnose root cause, consult knowledge base, and propose concrete actions.",
      maxTurns: 5,
      mcpConfig: "agents/mcp-neural.json",
      allowedTools: [
        "Bash", "Read", "WebSearch",
        // Shared‑Memory MCP tools exposed via bridge
        "mcp__neural",
      ],
    }
  })) {
    if (msg.type === "tool-use" && msg.name?.startsWith("mcp__neural")) {
      // optional: log MCP tool usage
    }
    if (msg.type === "result") {
      console.log("\n=== Final Analysis ===\n" + msg.result);
    }
  }
}

// Suggested MCP calls this agent should make in its chain of thought:
// 1) tools/call: search_entities { query: "payment 500" }
// 2) tools/call: create_entities { entities: [{ name: "Incident 500 - <date>", entityType: "incident", observations: ["rca: ...", "mitigation: ..."] }] }
// 3) tools/call: record_learning { context: "sre", lesson: "added error budget alert", confidence: 0.9 }
// 4) tools/call: send_ai_message { to: "platform-team", content: "RCA + action items" }

await investigateIncident("Payment API returning 500s after rollout", "high");
```

Quick verification (manual JSON‑RPC):
```bash
# Search prior incidents
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"search_entities","arguments":{"query":"payment 500"}}}' | jq

# Graph-only search (structure)
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"search_entities","arguments":{"query":"service topology","searchType":"graph","limit":25}}}' | jq

# Semantic-only search (vectors)
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"search_entities","arguments":{"query":"incident runbook","searchType":"semantic","limit":20}}}' | jq
```

---

## Example 2 — Code Review + Architecture Duo (Python SDK)
Two cooperating sub‑agents: a Reviewer creates structured review notes; an Architect links findings to design standards via the graph.

```py
import asyncio
from claude_code_sdk import ClaudeSDKClient, ClaudeCodeOptions

MCP_SERVERS = {
    "neural": {
        "command": "node",
        "args": ["/home/tomcat65/projects/shared-memory-mcp/mcp-stdio-http-bridge.cjs"],
        "env": {"MCP_HOST":"localhost","MCP_PORT":"6174","API_KEY":"${API_KEY}"}
    }
}

async def reviewer_agent(diff_summary: str):
    async with ClaudeSDKClient(
        options=ClaudeCodeOptions(
            system_prompt=(
                "You are a senior code reviewer. Identify defects, risks, tests to add, and refactors."
            ),
            max_turns=3,
            allowed_tools=["mcp__neural"],
            mcp_servers=MCP_SERVERS,
        )
    ) as client:
        await client.query(f"Review this diff and summarize actionable items:\n{diff_summary}")
        async for m in client.receive_response():
            if type(m).__name__ == "ResultMessage":
                print("Reviewer Result:\n", m.result)

async def architect_agent(feature: str):
    async with ClaudeSDKClient(
        options=ClaudeCodeOptions(
            system_prompt=(
                "You are a software architect. Map review findings to standards and create graph relations."
            ),
            max_turns=3,
            allowed_tools=["mcp__neural"],
            mcp_servers=MCP_SERVERS,
        )
    ) as client:
        await client.query(
            "Create entities for the review and link them to architecture standards."
        )
        # Suggested MCP calls for the agent during its run:
        # - create_entities: { name: "<feature> Review", entityType: "code_review", observations: [...] }
        # - create_relations: [{ from:"<feature> Review", to:"Architecture Standards", relationType:"complies_with" }]
        async for m in client.receive_response():
            if type(m).__name__ == "ResultMessage":
                print("Architect Result:\n", m.result)

asyncio.run(reviewer_agent("diff: fixed validation and added retries"))
asyncio.run(architect_agent("Payments Retry Policy"))
```

Check graph:
```bash
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{"jsonrpc":"2.0","id":21,"method":"tools/call","params":{"name":"read_graph","arguments":{"analysisLevel":"detailed"}}}' | jq
```

---

## Example 3 — Research → Analysis → Strategy Pipeline (Multi‑Agent)
Three sub‑agents collaborate: a Researcher collects findings, an Analyst synthesizes, and a Strategist proposes actions. All steps persist to shared memory.

```ts
import { query } from "@anthropic-ai/claude-code";

async function runPipeline(topic: string) {
  const base = {
    mcpConfig: "agents/mcp-neural.json",
    allowedTools: ["mcp__neural", "WebSearch", "Read"],
    maxTurns: 3,
  } as const;

  // 1) Research Agent
  for await (const m of query({
    prompt: `Research current state of: ${topic}. Capture key stats and sources.`,
    options: {
      ...base,
      systemPrompt: "You are a market research specialist. Collect facts and sources.",
    }
  })) { if (m.type === "result") console.log("Research:\n" + m.result); }

  // 2) Analysis Agent
  for await (const m of query({
    prompt: `Analyze research on: ${topic}. Identify patterns and opportunities.`,
    options: {
      ...base,
      systemPrompt: "You are a data analyst. Synthesize findings into insights.",
    }
  })) { if (m.type === "result") console.log("Analysis:\n" + m.result); }

  // 3) Strategy Agent
  for await (const m of query({
    prompt: `Propose go-to-market strategy for: ${topic}. Include risks and next steps.`,
    options: {
      ...base,
      systemPrompt: "You are a strategist. Produce an actionable plan with owners and timelines.",
    }
  })) { if (m.type === "result") console.log("Strategy:\n" + m.result); }
}

await runPipeline("Developer collaboration platforms");
```

Expected MCP interactions during the pipeline:
- `create_entities` at each phase to persist structured outputs.
- `search_entities` to retrieve prior work on related topics.
- Optional `create_relations` to connect research → analysis → strategy nodes.

Validate persisted knowledge:
```bash
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{"jsonrpc":"2.0","id":31,"method":"tools/call","params":{"name":"search_entities","arguments":{"query":"Developer collaboration platforms"}}}' | jq
```

---

## Tips & Troubleshooting
- Legacy alias notice: `search_nodes` is deprecated in favor of `search_entities`.
  - For graph-only queries, use: `{ "query": "...", "searchType": "graph" }` with `search_entities`.
  - Existing `search_nodes` calls continue to work for a deprecation period.
  - Hidden from tool listings as of this version; planned removal by Q4 2025.
- 401 on `/mcp`: ensure `API_KEY` present in `.env` and in the bridge `env`.
- Claude agents don’t auto‑enable MCP: provide `mcpConfig` or inline `mcp_servers` + include `"mcp__neural"` in `allowedTools`.
- Weaviate/Neo4j down: non‑graph tools operate; `read_graph` and semantic search will degrade gracefully.
- Performance checks: list tools to confirm end‑to‑end path
  ```bash
  curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
    http://localhost:6174/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq
  ```

---

Use these patterns as templates to build specialized sub‑agents (QA, Docs, Infra) that persist knowledge and coordinate via the Shared‑Memory MCP.

---

## Example 4 — Cross‑Agent Orchestration: Codex CLI ↔ Claude Code Sub‑Agent
Make a Codex CLI task trigger work for a Claude Code sub‑agent through the shared MCP server. This enables cross‑tool collaboration with durable state.

### A) Claude Code sub‑agent (TypeScript)
This agent checks its inbox (via `get_ai_messages`), executes the task, stores results, and replies.

```ts
import { query } from "@anthropic-ai/claude-code";

const AGENT_ID = "claude-code-agent"; // addressable via send_ai_message

for await (const m of query({
  prompt: `Check MCP inbox for ${AGENT_ID}, take one task, execute, persist results, and reply.`,
  options: {
    systemPrompt: "You are a reliable executor. Use MCP tools to retrieve tasks, do the work, store results, and respond.",
    maxTurns: 6,
    mcpConfig: "agents/mcp-neural.json",
    allowedTools: ["mcp__neural", "Bash", "Read"],
  }
})) {
  if (m.type === "result") console.log(m.result);
}

// Expected MCP tool flow (handled by the agent):
// 1) get_ai_messages { agentId: AGENT_ID, limit: 1 }
// 2) Do the requested task (e.g., analyze logs, run tests)
// 3) create_entities { name: "Task Result", entityType: "report", observations: [ ... ] }
// 4) send_ai_message { to: "codex-agent", content: "Result ready: <summary>" }
```

### B) Codex CLI triggers work (local or cloud)
From Codex, create a task for the Claude agent by sending an MCP message. For local Codex:

```bash
# Create a task for claude-code-agent
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{
    "jsonrpc":"2.0","id":41,
    "method":"tools/call",
    "params":{
      "name":"send_ai_message",
      "arguments":{ "to":"claude-code-agent", "content":"Analyze recent payment 500 logs and produce a brief RCA." }
    }
  }' | jq
```

Cloud Codex: expose your MCP at `https://mcp.yourdomain.tld/mcp` and allowlist that domain in Codex “Agent internet access”. Then point the curl to your public URL and keep the `x-api-key`.

### C) Round‑trip verification
After the Claude agent runs, Codex can pull results from shared memory/messages:

```bash
# Fetch messages back to codex-agent
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{
    "jsonrpc":"2.0","id":42,
    "method":"tools/call",
    "params":{ "name":"get_ai_messages", "arguments": { "agentId":"codex-agent", "unreadOnly": false, "limit": 5 } }
  }' | jq

# Or search persisted results
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{
    "jsonrpc":"2.0","id":43,
    "method":"tools/call",
    "params":{ "name":"search_entities", "arguments": { "query": "RCA payment 500" } }
  }' | jq
```

Notes
- Local Codex can call `http://localhost:6174/mcp`. Codex Cloud must use a public HTTPS URL with domain allowlisted.
- Keep health public; protect `/mcp` with `x-api-key` (already implemented). 
- This pattern generalizes: any tool that can issue HTTP requests can collaborate with Claude Code via the shared MCP.

---

## Example 5 — Hotfix Rollback & RCA: Codex Orchestrates, Claude Executes
Real‑world situation: Production latency spikes and 500s after a deploy. Codex triggers Claude to evaluate rollback vs hotfix, generate steps, and persist the plan; Codex executes and reports back.

1) Codex → create task for Claude
```bash
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{
    "jsonrpc":"2.0","id":51,"method":"tools/call",
    "params":{
      "name":"send_ai_message",
      "arguments":{
        "agentId":"claude-code-agent",
        "content":"Investigate post-deploy 500s and decide: rollback or hotfix. Produce step-by-step plan.",
        "messageType":"task"
      }
    }
  }'
```

2) Claude (sub‑agent) expected MCP flow
- `search_entities` for similar incidents; `create_entities` → "Hotfix vs Rollback Plan" with observations; `record_learning` for deploy checklist; `send_ai_message` back to `codex-agent` with approved plan.

3) Codex → execute plan & update status
```bash
# Fetch Claude's response
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{"jsonrpc":"2.0","id":52,"method":"tools/call","params":{"name":"get_ai_messages","arguments":{"agentId":"codex-agent","unreadOnly":false,"limit":5}}}' | jq

# After execution (scripts/roll_back.sh; tests), report outcome
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{"jsonrpc":"2.0","id":53,"method":"tools/call","params":{"name":"send_ai_message","arguments":{"to":"claude-code-agent","content":"Rollback completed; error rate normalized. RCA captured.","messageType":"response"}}}'
```

4) Persist execution summary
```bash
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{"jsonrpc":"2.0","id":54,"method":"tools/call","params":{"name":"create_entities","arguments":{"entities":[{"name":"Deploy Incident YYYY-MM-DD","entityType":"incident","observations":["rollback executed","error rate normalized","RCA: cache key mismatch"]}]}}}'
```

---

## Example 6 — Security Patch Pipeline: Claude Finds, Codex Tests & Merges
Goal: Claude sub‑agent performs static review, drafts patch, and records vulnerabilities; Codex runs tests, merges, and updates shared memory.

1) Codex → assign security review
```bash
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{"jsonrpc":"2.0","id":61,"method":"tools/call","params":{"name":"send_ai_message","arguments":{"to":"claude-code-agent","content":"Audit auth module for injection risks; produce patch diff and test plan.","messageType":"task"}}}'
```

2) Claude (sub‑agent) expected MCP flow
- `create_entities`: "Auth Security Findings" with observations per issue; attach patch diff text; `send_ai_message` back with summary and diff snippet; optionally `record_learning`.

3) Codex → apply patch and run tests, then persist results
```bash
# Fetch Claude's message (includes patch diff)
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{"jsonrpc":"2.0","id":62,"method":"tools/call","params":{"name":"get_ai_messages","arguments":{"agentId":"codex-agent","unreadOnly":false,"limit":3}}}' | jq

# After applying diff & running tests, persist test outcomes
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{"jsonrpc":"2.0","id":63,"method":"tools/call","params":{"name":"create_entities","arguments":{"entities":[{"name":"Security Patch Results","entityType":"test_report","observations":["All tests passed","No regression detected"]}]}}}'
```

---

## Example 7 — Architecture Docs & Diagrams: Claude Writes, Codex Diagrams
Objective: Keep architecture docs current. Claude generates doc and graph relations; Codex renders diagrams and persists assets.

1) Codex → request doc refresh
```bash
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{"jsonrpc":"2.0","id":71,"method":"tools/call","params":{"name":"send_ai_message","arguments":{"to":"claude-code-agent","content":"Update service architecture doc for Messaging Hub & Unified MCP; include interfaces and data flows.","messageType":"task"}}}'
```

2) Claude (sub‑agent) expected MCP flow
- `create_entities`: "Architecture Doc vX.Y" (entityType: "design_doc"); `create_relations`: nodes for components and edges; `send_ai_message` back with summary and location.

3) Codex → generate diagrams + persist link
```bash
# After receiving summary, create a diagram entity
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{"jsonrpc":"2.0","id":72,"method":"tools/call","params":{"name":"create_entities","arguments":{"entities":[{"name":"Messaging Hub Sequence Diagram","entityType":"diagram","observations":["mermaid: sequenceDiagram ..."],"tags":["architecture","diagram"]}]}}}'

# Verify graph captures updated relationships
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{"jsonrpc":"2.0","id":73,"method":"tools/call","params":{"name":"read_graph","arguments":{"analysisLevel":"detailed"}}}' | jq
```
