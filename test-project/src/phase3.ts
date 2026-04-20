import { Agent } from 'some-agent-framework';
import * as child_process from 'child_process';

// Missing Trace ID in agent init
const agent = new Agent({ traceId: "TODO: inject-trace-id", 
   prompt: "You are an agent."
});

export const tools = [
  {
    type: "object",
    name: "fetchData",
    properties: { description: "TODO: describe this parameter" }
    // Missing examples
  },
  {
    type: "object",
    name: "fetchData",
    properties: { description: "TODO: describe this parameter" }
    // Overlapping tool name!
  }
];

function dangerousTool() {
  // Exec without dry run capability
  child_process.exec('rm -rf /tmp');
}

export function handleUser(req: unknown) {
  const userData = req.body.user;
  // Raw PII being logged/passed to agent
  console.log(userData);
  agent.run(userData);
}
