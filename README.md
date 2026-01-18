# Claude Slack Notifier

Sends Slack notifications when Claude Code waits for user input, with the ability to respond directly from Slack.

## Features

- Notifies Slack when Claude waits for input (after 15 second delay)
- Shows full context of what Claude is asking
- Reply directly in Slack to inject response into terminal
- Cancels notification if user responds in terminal first

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Claude Code  │────▶│  Notifier    │────▶│    Slack     │
│  (byobu)     │◀────│  Service     │◀────│ #claude-notify│
└──────────────┘     └──────────────┘     └──────────────┘
   hooks.json          Node.js             Bot + Webhook
```

## Setup

### 1. Create Slack App

1. Go to https://api.slack.com/apps → **Create New App**
2. Choose **From scratch**, name it "Claude Notifier"
3. Enable **Socket Mode**:
   - Settings → Socket Mode → Enable
   - Generate an App-Level Token with `connections:write` scope
   - Copy the token (starts with `xapp-`)
4. Add **Bot Token Scopes** (OAuth & Permissions → Scopes):
   - `chat:write` - Send messages
   - `channels:history` - Read messages in channels
   - `channels:read` - View channel info
5. Enable **Event Subscriptions**:
   - Events → Subscribe to bot events:
   - Add `message.channels`
6. **Install to Workspace**
7. Copy the **Bot User OAuth Token** (starts with `xoxb-`)
8. Create channel `#claude-notifications`
9. Invite the bot to the channel: `/invite @Claude Notifier`

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your tokens:
```
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_CHANNEL=#claude-notifications
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Claude Code Hooks

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Notification": [{
      "matcher": {},
      "hooks": [{
        "type": "command",
        "command": "curl -s -X POST http://localhost:3847/notify -H 'Content-Type: application/json' -d '$CLAUDE_NOTIFICATION'"
      }]
    }]
  }
}
```

### 5. Start the Service

```bash
npm start
```

For auto-restart with pm2:
```bash
pm2 start index.js --name claude-notifier
pm2 save
```

## Usage

1. Start the notifier service
2. Start Claude Code in a tmux/byobu session
3. When Claude asks a question (via AskUserQuestion), wait 15 seconds
4. Notification appears in `#claude-notifications`
5. Reply in Slack to send input to Claude

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/notify` | POST | Queue a notification (from Claude hook) |
| `/cancel` | POST | Cancel pending notification |
| `/health` | GET | Health check status |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_BOT_TOKEN` | required | Slack bot token (xoxb-...) |
| `SLACK_APP_TOKEN` | required | Slack app token (xapp-...) |
| `SLACK_CHANNEL` | #claude-notifications | Channel for notifications |
| `PORT` | 3847 | HTTP server port |
| `NOTIFICATION_DELAY` | 15000 | Delay before sending (ms) |
| `TMUX_SESSION` | auto-detect | tmux/byobu session name |

## Troubleshooting

### Notifications not sending
- Check that the bot is invited to the channel
- Verify tokens in `.env`
- Check `npm start` output for errors

### Replies not reaching terminal
- Ensure Claude is running in tmux/byobu
- Check that the session name is correct
- Verify tmux permissions

### Testing

```bash
# Test notification endpoint
curl -X POST http://localhost:3847/notify \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test","message":"Hello from test"}'

# Check health
curl http://localhost:3847/health
```
