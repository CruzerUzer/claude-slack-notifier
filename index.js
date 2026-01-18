import 'dotenv/config';
import express from 'express';
import pkg from '@slack/bolt';
const { App } = pkg;
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
let lastSentQuestionHash = null;

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
        text: '🤖 Claude väntar på input',
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

  // Show options if available
  if (notification.options && Array.isArray(notification.options)) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Alternativ:*',
      },
    });

    // Add each option as a numbered item
    const optionsList = notification.options
      .map((opt, i) => {
        const label = typeof opt === 'string' ? opt : (opt.label || opt.name || JSON.stringify(opt));
        const desc = opt.description ? ` - ${opt.description}` : '';
        return `${i + 1}. ${label}${desc}`;
      })
      .join('\n');

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: optionsList,
      },
    });

    // Add buttons for quick selection (max 5 buttons per action block)
    const buttons = notification.options.slice(0, 5).map((opt, i) => {
      const label = typeof opt === 'string' ? opt : (opt.label || opt.name || `Option ${i + 1}`);
      return {
        type: 'button',
        text: {
          type: 'plain_text',
          text: label.substring(0, 75), // Slack limit
          emoji: true,
        },
        value: label,
        action_id: `option_${i}`,
      };
    });

    blocks.push({
      type: 'actions',
      elements: buttons,
    });
  }

  // Show raw data for debugging (truncated)
  const rawData = JSON.stringify(notification, null, 2);
  if (rawData.length > 100) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `\`\`\`${rawData.substring(0, 500)}${rawData.length > 500 ? '...' : ''}\`\`\``,
        },
      ],
    });
  }

  // Add instructions
  blocks.push({
    type: 'divider',
  });

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: '💬 Klicka på en knapp eller skriv ett svar i tråden',
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
    // Try to get the attached session first
    const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}:#{session_attached}" | grep ":1$" | cut -d: -f1 | head -1');
    if (stdout.trim()) {
      return stdout.trim();
    }
  } catch {
    // Ignore error
  }

  try {
    // Fallback: get any session
    const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}" | head -1');
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
  console.log(`Attempting to send to terminal. Session: ${session}, Text: ${text}`);

  if (!session) {
    console.error('No tmux/byobu session found');
    return false;
  }

  try {
    // Escape special characters for tmux
    const escapedText = text.replace(/'/g, "'\\''");

    // Send each character individually followed by Enter
    // This helps with readline-based inputs
    const command = `tmux send-keys -t "${session}" -l '${escapedText}' && tmux send-keys -t "${session}" Enter`;
    console.log(`Executing: ${command}`);
    await execAsync(command);
    console.log(`Successfully sent to session ${session}`);
    return true;
  } catch (error) {
    console.error('Failed to send to terminal:', error);
    return false;
  }
}

// Create hash of notification to detect duplicates
function getNotificationHash(notification) {
  // Hash based on message and options
  const hashData = JSON.stringify({
    message: notification.message,
    options: notification.options,
    question_data: notification.question_data
  });
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < hashData.length; i++) {
    const char = hashData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

// Send notification to Slack
async function sendSlackNotification(notification) {
  // Check if this is a duplicate notification
  const notificationHash = getNotificationHash(notification);
  if (notificationHash === lastSentQuestionHash) {
    console.log('Duplicate notification detected, skipping');
    return null;
  }

  try {
    const result = await slackApp.client.chat.postMessage({
      channel: SLACK_CHANNEL,
      text: notification.title || 'Claude is waiting for input',
      blocks: formatSlackMessage(notification),
    });

    console.log(`Notification sent to Slack: ${result.ts}`);
    lastSentQuestionHash = notificationHash;
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

// Handle button clicks from Slack
slackApp.action(/option_\d+/, async ({ action, ack, say, body }) => {
  await ack();

  const selectedValue = action.value;
  const optionIndex = action.action_id.replace('option_', '');
  // Claude expects the option number (1-indexed)
  const optionNumber = (parseInt(optionIndex) + 1).toString();

  console.log(`Button clicked: ${selectedValue} (option ${optionNumber})`);

  // Send the option number to the terminal
  const success = await sendToTerminal(optionNumber);

  if (success) {
    // Clear the last question hash since user answered
    lastSentQuestionHash = null;

    await say({
      text: `✅ Skickade till Claude: ${optionNumber} (${selectedValue})`,
      thread_ts: body.message.ts,
    });
  } else {
    await say({
      text: '❌ Kunde inte skicka till terminalen. Kör tmux/byobu?',
      thread_ts: body.message.ts,
    });
  }
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
    // Clear the last question hash since user answered
    lastSentQuestionHash = null;

    await say({
      text: `✅ Skickade till Claude: "${message.text}"`,
      thread_ts: message.ts,
    });
  } else {
    await say({
      text: '❌ Kunde inte skicka till terminalen. Kör tmux/byobu?',
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
