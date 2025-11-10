2025-09-29T16:03:21.990Z [neural-ai-collaboration] [info] Server transport closed { metadata: undefined }
2025-09-29T16:03:21.991Z [neural-ai-collaboration] [info] Client transport closed { metadata: undefined }
2025-09-29T16:03:21.992Z [neural-ai-collaboration] [info] Server transport closed unexpectedly, this is likely due to the process exiting early. If you are developing this MCP server you can add output to stderr (i.e. `console.error('...')` in JavaScript, `print('...', file=sys.stderr)` in python) and it will appear in this log. { metadata: undefined }
2025-09-29T16:03:21.992Z [neural-ai-collaboration] [error] Server disconnected. For troubleshooting guidance, please visit our [debugging documentation](https://modelcontextprotocol.io/docs/tools/debugging) { metadata: { context: 'connection', stack: undefined } }
2025-09-29T16:03:21.993Z [neural-ai-collaboration] [info] Client transport closed { metadata: undefined }
2025-09-29T16:08:15.693Z [neural-ai-collaboration] [info] Client transport closed { metadata: undefined }
2025-09-29T16:08:15.693Z [neural-ai-collaboration] [info] Shutting down server... { metadata: undefined }
2025-09-30T01:18:24.370Z [neural-ai-collaboration] [info] Initializing server... { metadata: undefined }
2025-09-30T01:18:24.665Z [neural-ai-collaboration] [info] Using MCP server command: C:\WINDOWS\System32\cmd.exe with args and path: {
  metadata: {
    args: [
      '/C',
      'C:\\Program Files\\nodejs\\npx.cmd',
      '-y',
      'mcp-remote',
      '--header',
      'x-api-key:${IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=}',
      'http://localhost:6174/mcp',
      [length]: 7
    ],
    paths: [
      'C:\\Program Files\\nodejs',
      'C:\\Python313\\Scripts\\',
      'C:\\Python313\\',
      'c:\\Users\\TOMAS\\AppData\\Local\\Programs\\cursor\\resources\\app\\bin',
      'C:\\Windows\\system32',
      'C:\\Windows',
      'C:\\Windows\\System32\\Wbem',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\',
      'C:\\Windows\\System32\\OpenSSH\\',
      'C:\\Program Files (x86)\\NVIDIA Corporation\\PhysX\\Common',
      'C:\\Program Files\\dotnet\\',
      'C:\\Program Files\\NVIDIA Corporation\\NVIDIA NvDLISR',
      'C:\\Users\\TOMAS\\AppData\\Local\\Microsoft\\WindowsApps',
      'C:\\Program Files\\Git\\cmd',
      'C:\\Program Files\\Git\\mingw64\\bin',
      'C:\\Program Files\\Git\\usr\\bin',
      'C:\\Program Files\\nodejs',
      'C:\\WINDOWS\\system32',
      'C:\\WINDOWS',
      'C:\\WINDOWS\\System32\\Wbem',
      'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\',
      'C:\\WINDOWS\\System32\\OpenSSH\\',
      'C:\\Program Files\\Git\\bin',
      'C:\\Program Files\\Git\\usr\\bin',
      'C:\\Program Files\\Git\\mingw64\\bin',
      'C:\\Program Files\\PostgreSQL\\17\\bin',
      'C:\\Program Files\\Tesseract-OCR',
      '',
      'C:\\Program Files\\PowerShell\\7\\',
      'C:\\Program Files\\Docker\\Docker\\resources\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\Microsoft\\WindowsApps',
      'C:\\Users\\TOMAS\\AppData\\Roaming\\npm',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\Microsoft VS Code\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\Ollama',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\Microsoft VS Code Insiders\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\GitHubDesktop\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\cursor\\resources\\app\\bin',
      [length]: 37
    ]
  }
} %o
2025-09-30T01:18:24.742Z [neural-ai-collaboration] [info] Server started and connected successfully { metadata: undefined }
2025-09-30T01:18:25.032Z [neural-ai-collaboration] [info] Message from client: {"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-ai","version":"0.1.0"}},"jsonrpc":"2.0","id":0} { metadata: undefined }
[38956] Using automatically selected callback port: 8113
[38956] Using custom headers: {"x-api-key":"${IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=}"}
[38956] Warning: Environment variable 'IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=' not found for header 'x-api-key'.
[38956] [38956] Connecting to remote server: http://localhost:6174/mcp
[38956] Using transport strategy: http-first
2025-09-30T01:19:25.045Z [neural-ai-collaboration] [info] Message from client: {"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":0,"reason":"McpError: MCP error -32001: Request timed out"}} { metadata: undefined }
2025-09-30T01:19:25.045Z [neural-ai-collaboration] [info] Client transport closed { metadata: undefined }
2025-09-30T01:19:25.048Z [neural-ai-collaboration] [info] Server transport closed { metadata: undefined }
2025-09-30T01:19:25.048Z [neural-ai-collaboration] [info] Client transport closed { metadata: undefined }
2025-09-30T01:19:25.048Z [neural-ai-collaboration] [info] Server transport closed unexpectedly, this is likely due to the process exiting early. If you are developing this MCP server you can add output to stderr (i.e. `console.error('...')` in JavaScript, `print('...', file=sys.stderr)` in python) and it will appear in this log. { metadata: undefined }
2025-09-30T01:19:25.049Z [neural-ai-collaboration] [error] Server disconnected. For troubleshooting guidance, please visit our [debugging documentation](https://modelcontextprotocol.io/docs/tools/debugging) { metadata: { context: 'connection', stack: undefined } }
[38956] Connection error: McpError: MCP error -32001: Request timed out
    at Timeout.timeoutHandler (file:///C:/Users/TOMAS/AppData/Roaming/npm/node_modules/mcp-remote/dist/chunk-OXNXVROF.js:11527:43)
    at listOnTimeout (node:internal/timers:594:17)
    at process.processTimers (node:internal/timers:529:7) {
  code: -32001,
  data: { timeout: 60000 }
}
[38956] Fatal error: McpError: MCP error -32001: Request timed out
    at Timeout.timeoutHandler (file:///C:/Users/TOMAS/AppData/Roaming/npm/node_modules/mcp-remote/dist/chunk-OXNXVROF.js:11527:43)
    at listOnTimeout (node:internal/timers:594:17)
    at process.processTimers (node:internal/timers:529:7) {
  code: -32001,
  data: { timeout: 60000 }
}
2025-09-30T01:19:36.067Z [neural-ai-collaboration] [info] Server transport closed { metadata: undefined }
2025-09-30T01:19:36.067Z [neural-ai-collaboration] [info] Client transport closed { metadata: undefined }
2025-09-30T13:29:07.907Z [neural-ai-collaboration] [info] Initializing server... { metadata: undefined }
2025-09-30T13:29:08.036Z [neural-ai-collaboration] [info] Using MCP server command: C:\WINDOWS\System32\cmd.exe with args and path: {
  metadata: {
    args: [
      '/C',
      'C:\\Program Files\\nodejs\\npx.cmd',
      '-y',
      'mcp-remote',
      '--header',
      'x-api-key:${IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=}',
      'http://localhost:6174/mcp',
      [length]: 7
    ],
    paths: [
      'C:\\Program Files\\nodejs',
      'C:\\Python313\\Scripts\\',
      'C:\\Python313\\',
      'c:\\Users\\TOMAS\\AppData\\Local\\Programs\\cursor\\resources\\app\\bin',
      'C:\\Windows\\system32',
      'C:\\Windows',
      'C:\\Windows\\System32\\Wbem',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\',
      'C:\\Windows\\System32\\OpenSSH\\',
      'C:\\Program Files (x86)\\NVIDIA Corporation\\PhysX\\Common',
      'C:\\Program Files\\dotnet\\',
      'C:\\Program Files\\NVIDIA Corporation\\NVIDIA NvDLISR',
      'C:\\Users\\TOMAS\\AppData\\Local\\Microsoft\\WindowsApps',
      'C:\\Program Files\\Git\\cmd',
      'C:\\Program Files\\Git\\mingw64\\bin',
      'C:\\Program Files\\Git\\usr\\bin',
      'C:\\Program Files\\nodejs',
      'C:\\WINDOWS\\system32',
      'C:\\WINDOWS',
      'C:\\WINDOWS\\System32\\Wbem',
      'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\',
      'C:\\WINDOWS\\System32\\OpenSSH\\',
      'C:\\Program Files\\Git\\bin',
      'C:\\Program Files\\Git\\usr\\bin',
      'C:\\Program Files\\Git\\mingw64\\bin',
      'C:\\Program Files\\PostgreSQL\\17\\bin',
      'C:\\Program Files\\Tesseract-OCR',
      '',
      'C:\\Program Files\\PowerShell\\7\\',
      'C:\\Program Files\\Docker\\Docker\\resources\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\Microsoft\\WindowsApps',
      'C:\\Users\\TOMAS\\AppData\\Roaming\\npm',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\Microsoft VS Code\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\Ollama',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\Microsoft VS Code Insiders\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\GitHubDesktop\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\cursor\\resources\\app\\bin',
      [length]: 37
    ]
  }
} %o
2025-09-30T13:29:08.073Z [neural-ai-collaboration] [info] Server started and connected successfully { metadata: undefined }
[25676] Using automatically selected callback port: 8113
[25676] Using custom headers: {"x-api-key":"${IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=}"}
[25676] Warning: Environment variable 'IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=' not found for header 'x-api-key'.
[25676] [25676] Connecting to remote server: http://localhost:6174/mcp
[25676] Using transport strategy: http-first
[25676] Connection error: TypeError: fetch failed
    at node:internal/deps/undici/undici:13502:13
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async StreamableHTTPClientTransport.send (file:///C:/Users/TOMAS/AppData/Roaming/npm/node_modules/mcp-remote/dist/chunk-OXNXVROF.js:13251:24) {
  [cause]: AggregateError [ECONNREFUSED]: 
      at internalConnectMultiple (node:net:1139:18)
      at afterConnectMultiple (node:net:1712:7) {
    code: 'ECONNREFUSED',
    [errors]: [ [Error], [Error] ]
  }
}
[25676] Fatal error: TypeError: fetch failed
    at node:internal/deps/undici/undici:13502:13
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async StreamableHTTPClientTransport.send (file:///C:/Users/TOMAS/AppData/Roaming/npm/node_modules/mcp-remote/dist/chunk-OXNXVROF.js:13251:24) {
  [cause]: AggregateError [ECONNREFUSED]: 
      at internalConnectMultiple (node:net:1139:18)
      at afterConnectMultiple (node:net:1712:7) {
    code: 'ECONNREFUSED',
    [errors]: [ [Error], [Error] ]
  }
}
npm notice
npm notice New minor version of npm available! 11.1.0 -> 11.6.1
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.6.1
npm notice To update run: npm install -g npm@11.6.1
npm notice
2025-09-30T13:29:14.895Z [neural-ai-collaboration] [info] Server transport closed { metadata: undefined }
2025-09-30T13:29:14.896Z [neural-ai-collaboration] [info] Client transport closed { metadata: undefined }
2025-09-30T13:29:14.897Z [neural-ai-collaboration] [info] Server transport closed unexpectedly, this is likely due to the process exiting early. If you are developing this MCP server you can add output to stderr (i.e. `console.error('...')` in JavaScript, `print('...', file=sys.stderr)` in python) and it will appear in this log. { metadata: undefined }
2025-09-30T13:29:14.897Z [neural-ai-collaboration] [error] Server disconnected. For troubleshooting guidance, please visit our [debugging documentation](https://modelcontextprotocol.io/docs/tools/debugging) { metadata: { context: 'connection', stack: undefined } }
2025-09-30T13:29:14.898Z [neural-ai-collaboration] [info] Client transport closed { metadata: undefined }
2025-09-30T13:45:52.921Z [neural-ai-collaboration] [info] Client transport closed { metadata: undefined }
2025-09-30T13:45:52.921Z [neural-ai-collaboration] [info] Shutting down server... { metadata: undefined }
2025-09-30T13:45:52.922Z [neural-ai-collaboration] [info] Initializing server... { metadata: undefined }
2025-09-30T13:45:53.080Z [neural-ai-collaboration] [info] Using MCP server command: C:\WINDOWS\System32\cmd.exe with args and path: {
  metadata: {
    args: [
      '/C',
      'C:\\Program Files\\nodejs\\npx.cmd',
      '-y',
      'mcp-remote',
      '--header',
      'x-api-key:${IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=}',
      'http://localhost:6174/mcp',
      [length]: 7
    ],
    paths: [
      'C:\\Program Files\\nodejs',
      'C:\\Python313\\Scripts\\',
      'C:\\Python313\\',
      'c:\\Users\\TOMAS\\AppData\\Local\\Programs\\cursor\\resources\\app\\bin',
      'C:\\Windows\\system32',
      'C:\\Windows',
      'C:\\Windows\\System32\\Wbem',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\',
      'C:\\Windows\\System32\\OpenSSH\\',
      'C:\\Program Files (x86)\\NVIDIA Corporation\\PhysX\\Common',
      'C:\\Program Files\\dotnet\\',
      'C:\\Program Files\\NVIDIA Corporation\\NVIDIA NvDLISR',
      'C:\\Users\\TOMAS\\AppData\\Local\\Microsoft\\WindowsApps',
      'C:\\Program Files\\Git\\cmd',
      'C:\\Program Files\\Git\\mingw64\\bin',
      'C:\\Program Files\\Git\\usr\\bin',
      'C:\\Program Files\\nodejs',
      'C:\\WINDOWS\\system32',
      'C:\\WINDOWS',
      'C:\\WINDOWS\\System32\\Wbem',
      'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\',
      'C:\\WINDOWS\\System32\\OpenSSH\\',
      'C:\\Program Files\\Git\\bin',
      'C:\\Program Files\\Git\\usr\\bin',
      'C:\\Program Files\\Git\\mingw64\\bin',
      'C:\\Program Files\\PostgreSQL\\17\\bin',
      'C:\\Program Files\\Tesseract-OCR',
      '',
      'C:\\Program Files\\PowerShell\\7\\',
      'C:\\Program Files\\Docker\\Docker\\resources\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\Microsoft\\WindowsApps',
      'C:\\Users\\TOMAS\\AppData\\Roaming\\npm',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\Microsoft VS Code\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\Ollama',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\Microsoft VS Code Insiders\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\GitHubDesktop\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\cursor\\resources\\app\\bin',
      [length]: 37
    ]
  }
} %o
2025-09-30T13:45:53.129Z [neural-ai-collaboration] [info] Server started and connected successfully { metadata: undefined }
2025-09-30T13:45:53.168Z [neural-ai-collaboration] [info] Message from client: {"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-ai","version":"0.1.0"}},"jsonrpc":"2.0","id":0} { metadata: undefined }
2025-09-30T13:45:58.245Z [neural-ai-collaboration] [info] Client transport closed { metadata: undefined }
2025-09-30T13:45:58.246Z [neural-ai-collaboration] [info] Server transport closed { metadata: undefined }
2025-09-30T13:45:58.246Z [neural-ai-collaboration] [info] Client transport closed { metadata: undefined }
2025-09-30T13:45:58.246Z [neural-ai-collaboration] [info] Server transport closed (intentional shutdown) { metadata: undefined }
2025-09-30T13:45:58.246Z [neural-ai-collaboration] [info] Client transport closed { metadata: undefined }
2025-09-30T13:45:58.245Z [neural-ai-collaboration] [info] Shutting down server... { metadata: undefined }
[36432] Using automatically selected callback port: 8113
[36432] Using custom headers: {"x-api-key":"${IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=}"}
[36432] Warning: Environment variable 'IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=' not found for header 'x-api-key'.
[36432] [36432] Connecting to remote server: http://localhost:6174/mcp
[36432] Using transport strategy: http-first
[36432] Connection error: TypeError: fetch failed
    at node:internal/deps/undici/undici:13502:13
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async StreamableHTTPClientTransport.send (file:///C:/Users/TOMAS/AppData/Roaming/npm/node_modules/mcp-remote/dist/chunk-OXNXVROF.js:13251:24) {
  [cause]: AggregateError [ECONNREFUSED]: 
      at internalConnectMultiple (node:net:1139:18)
      at afterConnectMultiple (node:net:1712:7) {
    code: 'ECONNREFUSED',
    [errors]: [ [Error], [Error] ]
  }
}
[36432] Fatal error: TypeError: fetch failed
    at node:internal/deps/undici/undici:13502:13
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async StreamableHTTPClientTransport.send (file:///C:/Users/TOMAS/AppData/Roaming/npm/node_modules/mcp-remote/dist/chunk-OXNXVROF.js:13251:24) {
  [cause]: AggregateError [ECONNREFUSED]: 
      at internalConnectMultiple (node:net:1139:18)
      at afterConnectMultiple (node:net:1712:7) {
    code: 'ECONNREFUSED',
    [errors]: [ [Error], [Error] ]
  }
}
2025-09-30T15:25:23.104Z [neural-ai-collaboration] [info] Initializing server... { metadata: undefined }
2025-09-30T15:25:23.282Z [neural-ai-collaboration] [info] Using MCP server command: C:\WINDOWS\System32\cmd.exe with args and path: {
  metadata: {
    args: [
      '/C',
      'C:\\Program Files\\nodejs\\npx.cmd',
      '-y',
      'mcp-remote',
      '--header',
      'x-api-key:${IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=}',
      'http://localhost:6174/mcp',
      [length]: 7
    ],
    paths: [
      'C:\\Program Files\\nodejs',
      'C:\\Python313\\Scripts\\',
      'C:\\Python313\\',
      'c:\\Users\\TOMAS\\AppData\\Local\\Programs\\cursor\\resources\\app\\bin',
      'C:\\Windows\\system32',
      'C:\\Windows',
      'C:\\Windows\\System32\\Wbem',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\',
      'C:\\Windows\\System32\\OpenSSH\\',
      'C:\\Program Files (x86)\\NVIDIA Corporation\\PhysX\\Common',
      'C:\\Program Files\\dotnet\\',
      'C:\\Program Files\\NVIDIA Corporation\\NVIDIA NvDLISR',
      'C:\\Users\\TOMAS\\AppData\\Local\\Microsoft\\WindowsApps',
      'C:\\Program Files\\Git\\cmd',
      'C:\\Program Files\\Git\\mingw64\\bin',
      'C:\\Program Files\\Git\\usr\\bin',
      'C:\\Program Files\\nodejs',
      'C:\\WINDOWS\\system32',
      'C:\\WINDOWS',
      'C:\\WINDOWS\\System32\\Wbem',
      'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\',
      'C:\\WINDOWS\\System32\\OpenSSH\\',
      'C:\\Program Files\\Git\\bin',
      'C:\\Program Files\\Git\\usr\\bin',
      'C:\\Program Files\\Git\\mingw64\\bin',
      'C:\\Program Files\\PostgreSQL\\17\\bin',
      'C:\\Program Files\\Tesseract-OCR',
      '',
      'C:\\Program Files\\PowerShell\\7\\',
      'C:\\Program Files\\Docker\\Docker\\resources\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\Microsoft\\WindowsApps',
      'C:\\Users\\TOMAS\\AppData\\Roaming\\npm',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\Microsoft VS Code\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\Ollama',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\Microsoft VS Code Insiders\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\GitHubDesktop\\bin',
      'C:\\Users\\TOMAS\\AppData\\Local\\Programs\\cursor\\resources\\app\\bin',
      [length]: 37
    ]
  }
} %o
2025-09-30T15:25:23.350Z [neural-ai-collaboration] [info] Server started and connected successfully { metadata: undefined }
2025-09-30T15:25:23.822Z [neural-ai-collaboration] [info] Message from client: {"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-ai","version":"0.1.0"}},"jsonrpc":"2.0","id":0} { metadata: undefined }
[18740] Using automatically selected callback port: 8113
[18740] Using custom headers: {"x-api-key":"${IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=}"}
[18740] Warning: Environment variable 'IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=' not found for header 'x-api-key'.
[18740] [18740] Connecting to remote server: http://localhost:6174/mcp
[18740] Using transport strategy: http-first
[18740] Connection error: Error: HTTP 401 trying to load well-known OAuth metadata
    at discoverOAuthMetadata (file:///C:/Users/TOMAS/AppData/Roaming/npm/node_modules/mcp-remote/dist/chunk-OXNXVROF.js:12291:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async authInternal (file:///C:/Users/TOMAS/AppData/Roaming/npm/node_modules/mcp-remote/dist/chunk-OXNXVROF.js:12123:20)
    at async auth (file:///C:/Users/TOMAS/AppData/Roaming/npm/node_modules/mcp-remote/dist/chunk-OXNXVROF.js:12100:12)
    at async StreamableHTTPClientTransport.send (file:///C:/Users/TOMAS/AppData/Roaming/npm/node_modules/mcp-remote/dist/chunk-OXNXVROF.js:13259:26)
[18740] Fatal error: Error: HTTP 401 trying to load well-known OAuth metadata
    at discoverOAuthMetadata (file:///C:/Users/TOMAS/AppData/Roaming/npm/node_modules/mcp-remote/dist/chunk-OXNXVROF.js:12291:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async authInternal (file:///C:/Users/TOMAS/AppData/Roaming/npm/node_modules/mcp-remote/dist/chunk-OXNXVROF.js:12123:20)
    at async auth (file:///C:/Users/TOMAS/AppData/Roaming/npm/node_modules/mcp-remote/dist/chunk-OXNXVROF.js:12100:12)
    at async StreamableHTTPClientTransport.send (file:///C:/Users/TOMAS/AppData/Roaming/npm/node_modules/mcp-remote/dist/chunk-OXNXVROF.js:13259:26)
2025-09-30T15:25:36.720Z [neural-ai-collaboration] [info] Server transport closed { metadata: undefined }
2025-09-30T15:25:36.721Z [neural-ai-collaboration] [info] Client transport closed { metadata: undefined }
2025-09-30T15:25:36.722Z [neural-ai-collaboration] [info] Server transport closed unexpectedly, this is likely due to the process exiting early. If you are developing this MCP server you can add output to stderr (i.e. `console.error('...')` in JavaScript, `print('...', file=sys.stderr)` in python) and it will appear in this log. { metadata: undefined }
2025-09-30T15:25:36.722Z [neural-ai-collaboration] [error] Server disconnected. For troubleshooting guidance, please visit our [debugging documentation](https://modelcontextprotocol.io/docs/tools/debugging) { metadata: { context: 'connection', stack: undefined } }
2025-09-30T15:25:36.723Z [neural-ai-collaboration] [info] Client transport closed { metadata: undefined }
