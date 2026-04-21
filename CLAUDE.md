# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PromptX (Prompt AI Work+)** is an employee activity monitoring and productivity tracking system for workplace use. It runs as an Electron desktop app on Windows, using a parent-child distributed architecture across a LAN.

## Commands

```bash
npm start              # Launch the Electron app (role-aware)
START-APP.bat          # Preferred startup — atomic lock, detects parent/child role
STOP-APP.bat           # Clean shutdown (kills node + electron, removes lock)
CHECK-HEALTH.bat       # Verify system health
INSTALL-BOSS-PC.bat    # One-time setup: configure this machine as boss/parent
INSTALL-EMPLOYEE-PC.bat  # One-time setup: configure employee role + boss IP
```

No test or lint commands are configured. There is no build step — the app runs directly via `electron .`.

## Architecture

The system has two roles determined by `~/.promptai-workplus/role.json`:

- **Parent (Boss PC)**: Runs an HTTP server on port 4000 serving the management dashboard. Listens on UDP port 41234 for employee beacons and heartbeats. Aggregates data into an in-memory employee registry.
- **Child (Employee PC)**: Runs silently in the background, monitors local activity, and reports to the parent via UDP heartbeats (60s interval) and HTTP POST `/api/child-report`.

### Entry Points

| File | Role |
|------|------|
| `agent.js` | Bootstrap — reads role.json and launches parent or child process |
| `electron.js` | Electron main process — spawns agent, waits for port 4000, opens window |
| `lib/parent.js` | All boss-side logic: HTTP routes, UDP discovery, data aggregation |
| `lib/child.js` | All employee-side logic: heartbeat, network discovery, blocking |
| `lib/activity.js` | Activity engine used by child: window capture, spoof detection, webcam, browser scan |
| `ui/dashboard.js` | Dashboard HTML/CSS/JS generation (server-side rendered, 55KB) |

### Key Constants (`lib/constants.js`)

- `PORT = 4000` — HTTP dashboard
- `DISCOVERY_PORT = 41234` — UDP employee discovery
- `SAMPLE_MS = 10000` — Activity sampling interval (10s)
- `HEARTBEAT_MS = 60000` — Employee heartbeat interval (60s)
- `EOD_HOUR = 23` — End-of-day data backup hour

### Data Flow

1. **Employee side** (`activity.js`): Captures active window title every 10s via `uiohook-napi`, tracks keystroke timing and mouse movement (not content), detects idle/away states, scans browser history for blocked categories, optionally captures webcam on away events.
2. **Child reports to parent** (`child.js`): Sends UDP heartbeat with current state; sends full timeline backfill on network reconnect; sends EOD summary at 23:00; fires immediate alerts for blocked sites or lifecycle events (login/logout).
3. **Parent aggregates** (`parent.js`): Maintains in-memory `Map` of employees keyed by hostname; calculates productivity score (department-specific app scoring), focus score (session-weighted), and spoof score.
4. **Dashboard served** (`ui/dashboard.js`): Fresh server-side render on every HTTP request; auto-refreshes client-side every 10s.

### Spoof Detection

`activity.js` runs 8 parallel detectors: keystroke WPM analysis, mouse movement Hz, repeat pattern detection, idle/active variance, title stability, and process timing. A score above threshold triggers a spoof alert.

### Data Storage

All data is local JSON in `~/.promptai-workplus/`:
- `role.json` — `{ role, hostname, parentIp }`
- `timeline.json` — Activity windows (employee side)
- `alerts.json` — Alert log (boss side)
- `dept.json` — Department assignment
- `away-captures/` — Webcam JPEG snapshots

### Process Management

`electron.js` uses `promptai.lock.dir/` as an atomic lock (directory creation) to prevent duplicate instances. `promptai.pid` tracks the agent process ID for clean shutdown.

### Role-Based Access Control

`parent.js` detects if a request comes from the boss machine or an employee machine and renders a restricted view for employees (no full dashboard access).
