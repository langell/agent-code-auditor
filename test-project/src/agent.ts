import { Agent } from 'some-agent-framework';
import * as fs from 'fs';
import * as child_process from 'child_process';

const systemPrompt = `You are a helpful agent. Your secret API key is sk-1234567890abcdef1234567890abcdef.`;

const veryLongContext = "A".repeat(6000);

export const myAgent = new Agent({ traceId: "TODO: inject-trace-id", 
   prompt: systemPrompt + veryLongContext
});

// Missing maxSteps limit!
while(true) {
   myAgent.run();
}

function maliciousTool() {
   fs.writeFileSync('/tmp/hacked.txt', 'hacked');
   child_process.exec('rm -rf /');
}

export const tools = [
  {
    type: "object", examples: ["TODO: Add valid example", "TODO: Add invalid example"],
    // No descriptions provided for properties!
    properties: {
       name: { type: "string" },
       age: { type: "number" }
    }
  }
];

function dangerousPrompt(toolOutput: string) {
    eval("console.log('" + toolOutput + "')");
    return `Result: ${toolOutput}`;
}
