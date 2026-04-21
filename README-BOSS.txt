╔══════════════════════════════════════════════════════════════════╗
║           PROMPT AI WORK+ v14 — BOSS PC QUICK GUIDE             ║
╚══════════════════════════════════════════════════════════════════╝

🖥️  THIS MACHINE: Boss PC (Parent)
🌐  DASHBOARD:    http://localhost:4000
📡  NETWORK:      http://192.168.12.93:4000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ✅ HEALTHY STATE — exactly this, nothing more:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1 × node.exe     → agent.js (the server)
  4 × electron.exe → dashboard window (normal, Electron is multi-process)

  Port 4000 → LISTENING on 0.0.0.0 (all interfaces)
  Port 41234 → UDP open (employee discovery)
  Role file → {"role":"parent"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 🚀 START / STOP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Start:   C:\PromptX\START-APP.bat
  Stop:    C:\PromptX\STOP-APP.bat
  Restart: Run STOP then START

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 🔍 QUICK HEALTH CHECK (PowerShell)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  # Should return 1
  (Get-WmiObject Win32_Process | Where-Object {$_.Name -eq "node.exe" -and $_.CommandLine -match "agent\.js"}).Count

  # Should show 0.0.0.0:4000 LISTENING
  netstat -ano | findstr ":4000 " | findstr "LISTENING"

  # Should show {"role":"parent"}
  type C:\Users\%USERNAME%\.promptai-workplus\role.json

  # Should show employee list (not [])
  curl http://localhost:4000/api/children -UseBasicParsing

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ⚠️  IF SOMETHING GOES WRONG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Blank dashboard?
  → Open browser: http://localhost:4000

  Too many node processes?
  → Run STOP-APP.bat then START-APP.bat

  Role changed to child?
  → Run INSTALL-BOSS-PC.bat (locks role back to parent)

  Employee not showing?
  → Check firewall: netsh advfirewall firewall show rule name="PromptAI-BlockBoss"
  → Delete if exists: netsh advfirewall firewall delete rule name="PromptAI-BlockBoss"

  Dashboard shows no data?
  → Check node is running: tasklist | findstr node
  → Check port: netstat -ano | findstr ":4000"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 📁 KEY FILES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  C:\PromptX\START-APP.bat         → Start (atomic lock, 1 instance only)
  C:\PromptX\STOP-APP.bat          → Clean shutdown
  C:\PromptX\INSTALL-BOSS-PC.bat   → First time setup / role reset
  C:\PromptX\CHECK-HEALTH.bat      → Full health check
  C:\PromptX\ui\dashboard.js       → Boss dashboard UI
  C:\PromptX\electron.js           → Electron wrapper (fixed no-duplicate)
  C:\PromptX\agent.js              → Main agent entry point
  C:\PromptX\lib\parent.js         → Boss server logic
  C:\Users\%USERNAME%\.promptai-workplus\role.json → Role config

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 🏢 Prompt AI Ethical Solutions USA
 💻 Built with Claude — Anthropic
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
