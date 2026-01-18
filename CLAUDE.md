# Claude Slack Notifier

> Node.js service that sends Slack notifications when Claude Code waits for user input.

## Architecture Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Claude Code  │────▶│  Notifier    │────▶│    Slack     │
│  (byobu)     │◀────│  Service     │◀────│ #claude-notify│
└──────────────┘     └──────────────┘     └──────────────┘
   hooks.json          Port 3847           Socket Mode
```

## Tech Stack

- **Runtime**: Node.js with ES Modules
- **Slack SDK**: @slack/bolt (Socket Mode)
- **HTTP Server**: Express.js
- **Terminal Integration**: tmux/byobu send-keys

## Commands

### Development
```bash
npm install       # Install dependencies
npm start         # Start the service
npm run dev       # Start with file watching
```

### Testing
```bash
# Test notification endpoint
curl -X POST http://localhost:3847/notify \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test","message":"Hello"}'

# Check health
curl http://localhost:3847/health

# Cancel pending notification
curl -X POST http://localhost:3847/cancel
```

## Key Files

```
slack_connector/
├── index.js          # Main service (Express + Slack Bolt)
├── .env              # Configuration (tokens, channel)
├── .env.example      # Template for .env
└── package.json      # Dependencies
```

## Configuration

Required environment variables in `.env`:
- `SLACK_BOT_TOKEN` - Bot token from Slack app (xoxb-...)
- `SLACK_APP_TOKEN` - App token for Socket Mode (xapp-...)
- `SLACK_CHANNEL` - Channel for notifications

## Git Workflow

- **Always create a new branch** for new features: `git checkout -b feature/<feature-name>`
- Branch naming: `feature/<name>`, `fix/<name>`, `refactor/<name>`
- Push branch and let user test before merging to main
- Never commit directly to main

## Important Patterns

- **Socket Mode**: Uses Slack's Socket Mode for real-time message handling
- **Notification Delay**: 15 second delay before sending to allow terminal response
- **Terminal Injection**: Uses `tmux send-keys` to inject Slack replies

## Verification

Before committing changes:
1. Test notification endpoint manually
2. Verify Slack connection with `/health` endpoint
3. Test full flow: notification → Slack message → terminal injection
