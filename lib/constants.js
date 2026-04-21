'use strict';
const os   = require('os');
const path = require('path');

// ── Department profiles for Prompt AI Ethical Solutions USA ──────────────────
const DEPARTMENTS = {
  engineering: {
    name: 'Engineering', icon: '💻', color: '#2979ff',
    away_tolerance_min: 15,
    call_apps: ['zoom','teams','meet','webex','slack'],
    productive_apps: {
      // Code editors (window title detection)
      'code': 100, 'cursor': 100, 'pycharm': 100, 'intellij': 100,
      'webstorm': 100, 'sublime text': 100, 'vim': 100, 'nvim': 100,
      'notepad++': 90, 'visual studio': 95,
      // Dev tools
      'terminal': 95, 'powershell': 90, 'cmd': 80, 'iterm': 95,
      'docker': 92, 'postman': 88, 'insomnia': 88,
      'github desktop': 92,
      // Sites / domains
      'stackoverflow.com': 85, 'github.com': 92, 'gitlab.com': 90,
      'npmjs.com': 75, 'pypi.org': 75, 'docs.': 80, 'developer.': 80,
      'anthropic.com': 85, 'openai.com': 82, 'huggingface.co': 82,
      'claude.ai': 80, 'vercel.com': 78, 'netlify.com': 78,
      // Comms
      'slack': 70, 'teams': 68, 'zoom': 72, 'google meet': 72,
      'gmail': 45, 'outlook': 45, 'notion': 65, 'confluence': 65,
      'linear': 70, 'jira': 68,
      // Neutral browser
      'chrome': 55, 'firefox': 55, 'edge': 52,
      'youtube': 45, // devs watch tutorials
      // Unproductive
      'netflix': 5, 'hulu': 5, 'disney': 5,
      'facebook': 8, 'instagram': 5, 'tiktok': 0,
      'twitter': 12, 'reddit': 22, 'discord': 32,
    },
    metrics: ['code_time', 'focus_score', 'deep_work_pct', 'call_time'],
  },
  sales: {
    name: 'Sales', icon: '📈', color: '#00e676',
    away_tolerance_min: 45,
    call_apps: ['zoom','teams','meet','webex','whatsapp','dialpad','ringcentral','aircall','skype'],
    productive_apps: {
      'salesforce': 100, 'hubspot': 100, 'pipedrive': 98, 'zoho crm': 95,
      'linkedin': 95, 'sales navigator': 98,
      'apollo.io': 92, 'zoominfo': 90, 'clay': 88, 'outreach': 90,
      'gmail': 90, 'outlook': 88,
      'zoom': 90, 'teams': 85, 'google meet': 85,
      'calendly': 80, 'chilipiper': 80,
      'slack': 65, 'notion': 58, 'google docs': 65,
      'chrome': 58, 'firefox': 55,
      'youtube': 22, 'netflix': 5, 'tiktok': 0,
      'facebook': 12, 'instagram': 8,
    },
    metrics: ['crm_time', 'linkedin_time', 'call_time', 'outreach_score'],
  },
  operations: {
    name: 'Operations', icon: '⚙️', color: '#ffab00',
    away_tolerance_min: 20,
    call_apps: ['zoom','teams','meet','webex'],
    productive_apps: {
      'notion': 100, 'asana': 100, 'monday.com': 100, 'clickup': 100,
      'jira': 95, 'trello': 88, 'linear': 92,
      'google docs': 95, 'google sheets': 95, 'excel': 92, 'word': 88,
      'slack': 80, 'teams': 78, 'gmail': 78, 'outlook': 78,
      'zoom': 75, 'google meet': 75,
      'figma': 72, 'miro': 70, 'lucidchart': 68,
      'chrome': 52, 'youtube': 28,
      'netflix': 5, 'tiktok': 0, 'gaming': 0,
    },
    metrics: ['task_time', 'doc_time', 'meeting_time', 'focus_score'],
  },
  support: {
    name: 'Support', icon: '🎧', color: '#9c6dff',
    away_tolerance_min: 10,
    call_apps: ['zoom','teams','meet','webex','intercom','zendesk'],
    productive_apps: {
      'zendesk': 100, 'intercom': 100, 'freshdesk': 100, 'helpscout': 98,
      'zoom': 95, 'teams': 90, 'google meet': 90,
      'slack': 80, 'gmail': 80, 'outlook': 78,
      'notion': 72, 'confluence': 70,
      'chrome': 62, 'firefox': 60,
      'youtube': 22, 'netflix': 5, 'tiktok': 0,
    },
    metrics: ['ticket_time', 'call_time', 'focus_score', 'response_rate'],
  },
  executive: {
    name: 'Executive', icon: '👔', color: '#ff6d00',
    away_tolerance_min: 60,
    call_apps: ['zoom','teams','meet','webex','whatsapp','phone'],
    productive_apps: {
      'zoom': 92, 'teams': 90, 'google meet': 90,
      'gmail': 85, 'outlook': 85,
      'linkedin': 82, 'google docs': 80, 'google sheets': 78,
      'slack': 75, 'notion': 72,
      'salesforce': 75, 'hubspot': 70,
      'chrome': 58, 'firefox': 55,
      'youtube': 38, 'netflix': 10, 'tiktok': 0,
    },
    metrics: ['meeting_time', 'comms_time', 'linkedin_time', 'focus_score'],
  },
};

module.exports = {
  VERSION          : '15.0.0',
  COMPANY          : 'Prompt AI Ethical Solutions USA',
  DATA_DIR         : path.join(os.homedir(), '.promptai-workplus'),
  ROLE_FILE        : path.join(os.homedir(), '.promptai-workplus', 'role.json'),
  LOG_FILE         : path.join(os.homedir(), '.promptai-workplus', 'agent.log'),
  DEPT_FILE        : path.join(os.homedir(), '.promptai-workplus', 'dept.json'),

  DISCOVERY_PORT   : 41234,
  DISCOVERY_MSG    : 'PROMPTAI_DISCOVER_V4',
  DISCOVERY_ACK    : 'PROMPTAI_PARENT_V4',
  DASHBOARD_PORT   : 4000,

  SAMPLE_MS        : 10_000,
  HEARTBEAT_MS     : 60_000,
  EOD_HOUR         : 23,
  DISCOVER_MS      : 4_000,
  DISCOVER_WAIT_MS : 2_500,

  IDLE_S           : 60,
  AWAY_S           : 180,
  MAX_TL           : 8640,

  ALERT_AWAY_MIN   : 10,
  ALERT_LOCKED_MIN : 60,
  ALERT_PROD_PCT   : 50,

  SPOOF_MIN        : 8,
  SPOOF_VAR        : 45,
  SPOOF_REPEAT     : 0.80,
  SPOOF_WPM        : 200,
  SPOOF_MOUSE_HZ   : 50,
  SPOOF_FLAG       : 65,

  ANTHROPIC_KEY    : process.env.ANTHROPIC_KEY || '',

  SHIFT_START_H    : 0,
  SHIFT_END_H      : 24,

  SHIFTS: [
    { name: 'Day',   start: 9,  end: 21, color: '#00e676' },
    { name: 'Night', start: 21, end: 9,  color: '#9c6dff' },
  ],

  DEPARTMENTS,

  BLOCKED_CATEGORIES: {
    adult: [
      'porn','xxx','adult','nude','naked','sex','onlyfans','xvideos',
      'pornhub','xhamster','redtube','youporn','brazzers','playboy',
      'escort','cam4','chaturbate','stripchat','livejasmin'
    ],
    gambling: [
      'casino','poker','bet365','betway','draftkings','fanduel',
      'sportsbet','gambling','slots','roulette','blackjack'
    ],
    // These are blocked for all departments during work hours
    streaming: [
      'netflix.com','hulu.com','disneyplus.com','hbomax.com',
      'primevideo.com','peacocktv.com','paramountplus.com',
    ],
    gaming: [
      'steampowered.com','epicgames.com','roblox.com','minecraft.net',
      'battle.net','ea.com/games','twitch.tv',
    ],
    social_excessive: [
      // Only blocked if NOT in sales/executive dept (handled in activity.js whitelist)
      'tiktok.com',
    ],
  },

  // Sites always allowed regardless of department
  ALWAYS_ALLOWED: [
    'google.com','google.co','bing.com','duckduckgo.com',
    'wikipedia.org','linkedin.com','zoom.us','meet.google.com',
    'teams.microsoft.com','slack.com','gmail.com','outlook.com',
    'promptai','anthropic.com','claude.ai',
  ],
};
