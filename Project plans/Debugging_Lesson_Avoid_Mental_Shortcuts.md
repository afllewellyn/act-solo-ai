\# 🧠 Debugging Lesson: How to Avoid Mental Shortcuts When Working with External APIs

\#\# 1\. Why Mental Shortcuts Happen  
\- APIs can be opaque; when something fails, the temptation is to blame:  
  \- “It must be the API key.”  
  \- “It must be CORS.”  
  \- “It must be a bug on their side.”  
\- These are \*\*mental shortcuts\*\* — quick guesses without proof.  
\- They waste time and often lead to adding hacks instead of solving the root issue.

\---

\#\# 2\. The Anti-Pattern  
\*\*Jumping to conclusions without validating assumptions.\*\*

Examples:  
\- Assuming the OpenAI key is invalid when logs show the runtime never passed it.  
\- Rewriting code because of a “connection closed” error without confirming handshake headers.  
\- Copying a fix from StackOverflow without matching the exact error in your environment.

\---

\#\# 3\. Correct Approach: Slow Down & Prove It  
\#\#\# Always Validate Each Layer  
1\. \*\*Environment\*\*    
   \- Confirm the key/secret is present in runtime (\`env-debug\`).  
2\. \*\*Request Construction\*\*    
   \- Log the request you send (method, headers, URL).  
   \- Compare against the API docs and a working curl/wscat example.  
3\. \*\*API Response\*\*    
   \- Inspect the \*actual\* error payload, not just “400” or “401.”  
   \- APIs usually tell you exactly what’s wrong.  
4\. \*\*Assumptions\*\*    
   \- Don’t assume the runtime supports a feature (e.g., multiple subprotocols).    
   \- Log what it actually negotiated (\`socket.protocol\`).

\---

\#\# 4\. Tools to Break the Shortcut  
\- \*\*Minimal Reproduction\*\*    
  \- Use \`curl\` or \`wscat\` to replicate the exact failing call outside your app.  
\- \*\*Instrumentation\*\*    
  \- Add logs for env keys, headers, subprotocols, selected protocol, request body.  
\- \*\*Cross-checks\*\*    
  \- Verify model versions are identical between token mint and WS URL.  
  \- Compare known-good function (e.g., \`health-realtime\`) with failing one (\`realtime-s2s\`).

\---

\#\# 5\. Rules of Thumb  
\- If you think it’s “the key,” prove it by listing env vars.    
\- If you think it’s “CORS,” prove it by curl from the server.    
\- If you think it’s “the API,” prove it by reproducing with docs’ example call.    
\- If you think it’s “the runtime,” prove it by logging what the runtime actually negotiates.

\---

\#\# 6\. Practical Example  
\*\*Bad Shortcut:\*\*    
\> “The WebSocket error means OpenAI rejected my API key.”

\*\*Validated Approach:\*\*    
\- Log showed the env var was missing a newline trim.    
\- Fixing \`.trim()\` resolved the issue — the key itself was fine.

\---

\#\# 7\. The Debugging Mindset  
\- Debugging is detective work, not guessing.    
\- Every hypothesis should have a test.    
\- Never patch code until you’ve proved the \*exact\* failure mode.    
\- Follow the loop: \*\*Observe → Hypothesize → Instrument → Validate → Patch → Clean up\*\*.

\---

\#\# 8\. Closing Reminder  
External APIs are strict but predictable.    
If you \*match their expected request format exactly\*, they will respond correctly.    
If they don’t, the error message is usually telling you the truth.  

\*\*Your job is to slow down and confirm what you’re \*really\* sending.\*\*

