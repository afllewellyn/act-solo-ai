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
supabase secrets set ELEVENLABS_API_KEY=your-real-key
supabase secrets set ELEVENLABS_AGENT_ID=your-agent-id
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
supabase functions deploy eleven-agent-token
supabase functions deploy text-to-speech
supabase functions deploy get-voices
```

> `text-to-speech`, `get-voices` and `eleven-agent-token` verify a signed-in user
> in-function (`supabase/functions/_shared/auth.ts`) because they spend ElevenLabs
> credit. Anonymous curl returns 401. Deleting a function's source from the repo does
> **not** remove it from Supabase — run `supabase functions delete <name>` too.

---

## 🔹 6. Test Functions
### Curl from terminal:
```bash
curl https://<your-project-ref>.supabase.co/functions/v1/env-debug
```

### Test an auth-gated function (needs a signed-in user's access token):
```bash
curl -X POST https://<your-project-ref>.supabase.co/functions/v1/eleven-agent-token \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
Without the header you should get `401 Authentication required`.

---

## 🔹 7. Check Logs
View function logs from Supabase dashboard:
- Dashboard → Functions → Select Function → **Logs**

(The CLI has no `supabase functions logs` command in recent versions; use the dashboard.)

---

## 🔹 8. Debugging Pattern
1. Check `/env-debug` → confirm secrets are visible
2. Call `/eleven-agent-token` with a user token → confirm a `signed_url` comes back
3. Use logs to debug mismatches (`console.log` inside functions)

---

## 🔹 9. Cleanup (Optional)
Remove a secret:
```bash
supabase secrets unset SOME_OLD_SECRET
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
