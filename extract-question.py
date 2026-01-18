#!/usr/bin/env python3
import json
import sys

def extract_last_question(transcript_path):
    """Extract the last unanswered AskUserQuestion from transcript"""
    try:
        with open(transcript_path, 'r') as f:
            lines = f.readlines()

        # Search backwards for the last AskUserQuestion
        for line in reversed(lines):
            try:
                entry = json.loads(line)
                if entry.get('type') == 'assistant':
                    content = entry.get('message', {}).get('content', [])
                    for item in content:
                        if item.get('type') == 'tool_use' and item.get('name') == 'AskUserQuestion':
                            return item.get('input', {})
            except json.JSONDecodeError:
                continue

        return None
    except Exception as e:
        print(f"Error reading transcript: {e}", file=sys.stderr)
        return None

if __name__ == '__main__':
    # Read notification data from stdin
    notification = json.load(sys.stdin)

    # Extract question from transcript if available
    transcript_path = notification.get('transcript_path')
    if transcript_path:
        question_data = extract_last_question(transcript_path)
        if question_data:
            # Merge question data into notification
            notification['question_data'] = question_data

            # Extract first question for title/message
            questions = question_data.get('questions', [])
            if questions:
                first_q = questions[0]
                notification['title'] = notification.get('message', 'Claude väntar på svar')
                notification['message'] = first_q.get('question', '')
                notification['options'] = [opt for opt in first_q.get('options', [])]

    # Output enhanced notification
    print(json.dumps(notification))
