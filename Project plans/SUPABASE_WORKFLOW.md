# 🧾 Supabase CLI Workflow Cheat Sheet (from VS Code)

## 🔹 1. Open Your Project Root in VS Code
- Open folder in VS Code (where `supabase/` lives)
- Open terminal inside VS Code:  
  - **Mac:** `Cmd + ~`  
  - **Windows/Linux:** `Ctrl + ~`

Check you’re in the right place:
```bash
ls supabase
```
You should see:
```
functions  config.toml
```

---

## 🔹 2. Verify Supabase CLI is Installed
```bash
supabase --version
```
✅ Should return something like:  
```
supabase version 1.128.x
```

If not, reinstall via Homebrew:
```bash
brew install supabase/tap/supabase
```

---

## 🔹 3. Log In (First Time or After Token Expiry)
```bash
supabase login
```
- Opens browser → sign in to Supabase → confirm token  
- Stores token locally at `~/.supabase/access-token`

---

## 🔹 4. Manage Secrets (Environment Variables)
Set secrets (one at a time):
```bash
supabase secrets set OPENAI_API_KEY=sk-your-real-key
supabase secrets set OPENAI_API_KEY_RELAY=sk-your-real-key
```

List secrets (verify):
```bash
supabase secrets list
```

---

## 🔹 5. Deploy Edge Functions
Deploy one function:
```bash
supabase functions deploy env-debug
```

Deploy multiple:
```bash
supabase functions deploy health-realtime
supabase functions deploy realtime-s2s
```

---

## 🔹 6. Test Functions
### Curl from terminal:
```bash
curl https://<your-project-ref>.supabase.co/functions/v1/env-debug
```

### Test health check:
```bash
curl https://<your-project-ref>.supabase.co/functions/v1/health-realtime
```

### Connect to WebSocket (realtime-s2s) in browser console:
```js
const socket = new WebSocket("wss://<your-project-ref>.supabase.co/functions/v1/realtime-s2s");

socket.onopen = () => console.log("✅ Connected");
socket.onmessage = (msg) => console.log("📨", msg.data);
socket.onclose = (e) => console.warn("🔌 Closed:", e.code, e.reason);
socket.onerror = (err) => console.error("❌ Error:", err);
```

---

## 🔹 7. Check Logs
View function logs from Supabase dashboard:
- Dashboard → Functions → Select Function → **Logs**

Or tail logs locally:
```bash
supabase functions logs realtime-s2s
```

---

## 🔹 8. Debugging Pattern
1. Check `/env-debug` → confirm secrets are visible
2. Check `/health-realtime` → confirm OpenAI handshake works
3. Connect WebSocket `/realtime-s2s` → confirm relay works
4. Use logs to debug mismatches (`console.log` inside functions)

---

## 🔹 9. Cleanup (Optional)
Remove a secret:
```bash
supabase secrets unset OPENAI_API_KEY
```

Remove debug function:
```bash
supabase functions delete env-debug
```

---

⚡ **Daily Driver Workflow:**
1. Edit function in VS Code  
2. `supabase functions deploy <function-name>`  
3. Test endpoint in curl/browser console  
4. Check logs if broken  
5. Repeat until working  
