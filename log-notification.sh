#!/bin/bash
# Read notification data from stdin (Claude sends JSON via stdin)
NOTIFICATION_DATA=$(cat)

# Log original data for debugging
echo "$(date): HOOK_TRIGGERED original='$NOTIFICATION_DATA'" >> /tmp/claude-notifications.log

# Enhance notification with question data from transcript
ENHANCED_DATA=$(echo "$NOTIFICATION_DATA" | /home/ubuntu/programing/slack_connector/extract-question.py)

# Log enhanced data
echo "$(date): ENHANCED data='$ENHANCED_DATA'" >> /tmp/claude-notifications.log

# Send to notification service
printf '%s' "$ENHANCED_DATA" | curl -s -X POST http://localhost:3847/notify -H 'Content-Type: application/json' -d @-
