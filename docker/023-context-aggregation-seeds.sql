-- Unified Context Aggregation Seeds
-- Sample external artifacts for demonstration

-- A Slack message
INSERT INTO artifacts (workspace_id, owner_kind, owner_id, visibility, artifact_type, title, data, metadata, source_ref)
VALUES ('default', 'system', 'slack', 'workspace', 'external_message', 'Slack: #engineering-general',
        '{"text": "Hey team, the new API documentation is ready. Please review it by EOD.", "provider": "slack", "channel": "engineering-general", "user": "alice"}',
        '{"provider": "slack"}', '{"kind": "external", "provider": "slack", "externalId": "msg_123"}');

-- A Jira ticket
INSERT INTO artifacts (workspace_id, owner_kind, owner_id, visibility, artifact_type, title, data, metadata, source_ref)
VALUES ('default', 'system', 'jira', 'workspace', 'external_task', 'JIRA-402: Implement OAuth2 for Context Layer',
        '{"text": "Assignee: Atlas. Priority: High. Status: In Progress.", "provider": "jira", "key": "JIRA-402", "status": "In Progress"}',
        '{"provider": "jira"}', '{"kind": "external", "provider": "jira", "externalId": "jira_402"}');

-- An Asana task
INSERT INTO artifacts (workspace_id, owner_kind, owner_id, visibility, artifact_type, title, data, metadata, source_ref)
VALUES ('default', 'system', 'asana', 'workspace', 'external_task', 'Asana: Design Context Feed UI',
        '{"text": "Goal: Single pane of glass for all notifications. Due: June 20th.", "provider": "asana", "project": "Hub v2"}',
        '{"provider": "asana"}', '{"kind": "external", "provider": "asana", "externalId": "asana_789"}');

-- A generic notification
INSERT INTO artifacts (workspace_id, owner_kind, owner_id, visibility, artifact_type, title, data, metadata, source_ref)
VALUES ('default', 'system', 'teams', 'workspace', 'notification', 'Teams: Missed call from Nexus',
        '{"text": "Nexus tried to call you regarding the database migration.", "provider": "teams"}',
        '{"provider": "teams"}', '{"kind": "external", "provider": "teams", "externalId": "teams_call_456"}');
