\# Comprehensive Debugging Manual  
   
\#\# 1\. Core Philosophy  
\- Debugging is not guessing.   
\- Always prove where the problem is \*before\* applying a fix.   
\- Use instrumentation (logs, env listings, curl tests) to validate each layer.   
   
Workflow: \*\*Observe → Hypothesize → Instrument → Validate → Patch → Clean Up\*\*  
   
\---  
   
\#\# 2\. Environment & Secrets  
   
\#\#\# Verify Environment Variables  
\- Write a temporary Edge Function (\`env-debug\`) to list \*\*env variable NAMES only\*\*.  
\- Confirm key names are present: \`OPENAI\_API\_KEY\`, \`OPENAI\_API\_KEY\_RELAY\`, etc.  
\- Watch out for:  
  \- Trailing spaces  
  \- Hidden newlines  
  \- Typos in secret names  
   
\#\#\# Normalize Secrets  
\- Use CLI: \`supabase secrets set OPENAI\_API\_KEY=sk-xxxx\`  
\- Add a fallback alias: \`OPENAI\_API\_KEY\_RELAY\`  
\- Always \`.trim()\` values when reading them in code.  
   
\---  
   
\#\# 3\. Edge Functions Isolation  
\- Each folder in \`supabase/functions/\*\` is bundled independently.  
\- No code is shared unless explicitly imported.  
\- Helpers like \`readOpenAIKey()\` must exist in each function or be imported properly.  
\- Never assume definitions cross function boundaries.  
   
\---  
   
\#\# 4\. Logging Best Practices  
\- Never log secret values.  
\- Log:  
  \- Which key name was used  
  \- Length of the key  
  \- Whether fallback was triggered  
\- Example:  
  \`\`\`ts  
  console.log("\[Health\] Using key:", keyName, \`(len=${OPENAI\_API\_KEY.length})\`);  
5\. WebSocket / API Debugging  
Step-by-step:  
Confirm token mint endpoint (/v1/realtime/sessions) works with curl.  
   
Confirm WS handshake with wscat:  
   
nginx  
Copy code  
wscat \-c "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17" \\  
  \-H "Authorization: Bearer $EPHEMERAL\_KEY" \\  
  \-H "OpenAI-Beta: realtime=v1"  
Compare against what Edge Function is actually sending.  
   
Log subprotocol negotiation: openAISocket.protocol  
   
If the error is “missing parameter,” confirm both protocols are sent.  
   
6\. Event Guards  
Maintain a strict allowlist for client events.  
   
Block:  
   
session.created  
   
response.output\_text.delta  
   
response.completed  
   
Only allow valid client-side events:  
   
input\_audio\_buffer.append  
   
input\_audio\_buffer.commit  
   
response.create  
   
7\. Session Bootstrap  
Always send session.update before flushing buffer.  
   
Minimal example:  
   
json  
Copy code  
{  
  "type": "session.update",  
  "session": {  
	"modalities": \["text"\],  
	"turn\_detection": { "type": "server\_vad" },  
	"input\_audio\_format": "wav"  
  }  
}  
8\. Error Handling  
Log full upstream error payloads.  
   
Close client with 1011 and pass along reason.  
   
Differentiate between:  
   
Auth error: invalid/missing key  
   
Protocol error: subprotocol negotiation  
   
Missing parameter: bad session update  
   
9\. Cleanup  
Remove temporary debug functions once validated.  
   
Keep boot logs minimal (key name \+ length).  
   
Ensure no secrets ever leave the server.  
   
10\. Mental Guardrails  
Don’t assume the issue is “bad key” without env-debug.  
   
Don’t assume “client bug” without isolating with curl/wscat.  
   
Don’t fix by hunch → validate first.  
