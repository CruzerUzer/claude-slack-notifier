import 'dotenv/config';
import express from 'express';
import { App } from '@slack/bolt';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Configuration
const PORT = process.env.PORT || 3847;
const NOTIFICATION_DELAY = parseInt(process.env.NOTIFICATION_DELAY) || 15000;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || '#claude-notifications';

// Pending notification timer
let pendingNotification = null;
let currentNotificationData = null;

// Initialize Slack app with Socket Mode
const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Express server for receiving hooks from Claude Code
const server = express();
server.use(express.json());
server.use(express.text());

// Parse notification data from Claude
function parseNotification(data) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return { message: data };
    }
  }
  return data;
}

// Format message for Slack
function formatSlackMessage(notification) {
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Claude is waiting for input',
        emoji: true,
      },
    },
  ];

  // Add the notification content
  if (notification.title) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${notification.title}*`,
      },
    });
  }

  if (notification.message) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: notification.message,
      },
    });
  }

  if (notification.body) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: notification.body,
      },
    });
  }

  // Add instructions
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: 'Reply in this thread to send input to Claude',
      },
    ],
  });

  return blocks;
}

// Get tmux session name
async function getTmuxSession() {
  if (process.env.TMUX_SESSION) {
    return process.env.TMUX_SESSION;
  }

  try {
    const { stdout } = await execAsync('tmux display-message -p "#S"');
    return stdout.trim();
  } catch {
    // Try byobu
    try {
      const { stdout } = await execAsync('byobu list-sessions -F "#{session_name}" | head -1');
      return stdout.trim();
    } catch {
      return null;
    }
  }
}

// Send keys to tmux/byobu
async function sendToTerminal(text) {
  const session = await getTmuxSession();
  if (!session) {
    console.error('No tmux/byobu session found');
    return false;
  }

  try {
    // Escape special characters for tmux
    const escapedText = text.replace(/'/g, "'\\''");
    await execAsync(`tmux send-keys -t "${session}" '${escapedText}' Enter`);
    return true;
  } catch (error) {
    console.error('Failed to send to terminal:', error);
    return false;
  }
}

// Send notification to Slack
async function sendSlackNotification(notification) {
  try {
    const result = await slackApp.client.chat.postMessage({
      channel: SLACK_CHANNEL,
      text: notification.title || 'Claude is waiting for input',
      blocks: formatSlackMessage(notification),
    });

    console.log(`Notification sent to Slack: ${result.ts}`);
    return result;
  } catch (error) {
    console.error('Failed to send Slack notification:', error);
    return null;
  }
}

// Handle incoming notifications from Claude Code hook
server.post('/notify', (req, res) => {
  const notification = parseNotification(req.body);
  console.log('Received notification:', notification);

  // Clear any pending notification
  if (pendingNotification) {
    clearTimeout(pendingNotification);
  }

  // Store current notification data
  currentNotificationData = notification;

  // Set timer to send notification after delay
  pendingNotification = setTimeout(async () => {
    await sendSlackNotification(notification);
    pendingNotification = null;
  }, NOTIFICATION_DELAY);

  res.json({ status: 'queued', delay: NOTIFICATION_DELAY });
});

// Cancel pending notification (user responded in terminal)
server.post('/cancel', (req, res) => {
  if (pendingNotification) {
    clearTimeout(pendingNotification);
    pendingNotification = null;
    currentNotificationData = null;
    console.log('Notification cancelled');
    res.json({ status: 'cancelled' });
  } else {
    res.json({ status: 'no_pending_notification' });
  }
});

// Health check endpoint
server.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    pending: pendingNotification !== null,
    slackConnected: slackApp.receiver?.client?.socket?.readyState === 1,
  });
});

// Handle messages from Slack (replies in thread)
slackApp.message(async ({ message, say }) => {
  // Only process messages in the notification channel
  if (message.channel_type !== 'channel') return;

  // Skip bot messages
  if (message.bot_id) return;

  console.log('Received Slack message:', message.text);

  // Send the message to the terminal
  const success = await sendToTerminal(message.text);

  if (success) {
    await say({
      text: `Sent to Claude: "${message.text}"`,
      thread_ts: message.ts,
    });
  } else {
    await say({
      text: 'Failed to send to terminal. Is tmux/byobu running?',
      thread_ts: message.ts,
    });
  }
});

// Start the services
async function start() {
  // Start Slack app
  await slackApp.start();
  console.log('Slack app started in Socket Mode');

  // Start Express server
  server.listen(PORT, () => {
    console.log(`Notification server listening on port ${PORT}`);
    console.log(`Notification delay: ${NOTIFICATION_DELAY}ms`);
    console.log(`Slack channel: ${SLACK_CHANNEL}`);
  });
}

start().catch(console.error);
