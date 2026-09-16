# External Agent Canvas Connector (v1)

The External Agent Canvas Connector allows trusted external AI agents (such as Muse, N8N, or custom external microservices) to publish content and cards directly onto CensaiOS's infinite canvas.

---

## Overview & Architecture

- **Scope**: v1 provides async HTTP card posting via `POST /api/canvas/cards`.
- **Authentication**: Per-integration API tokens formatted as `cit_<hash>` with a narrow `canvas:write` scope.
- **Approval Policy**:
  - **Pre-approved (default for trusted tokens)**: Low-risk documentation posts and generated cards post directly onto the active workspace canvas.
  - **Approval-gated**: Tokens marked as `pre_approved: false` surface a pending approval in `workspace_tool_approvals` for human approval before spawning.

---

## Authentication

Authentication is performed via HTTP Bearer token in the `Authorization` header (or `X-Canvas-Token` / `X-API-Key`).

```http
Authorization: Bearer cit_0123456789abcdef0123456789abcdef0123456789abcdef
```

Tokens are scoped per workspace and must possess the `canvas:write` scope.

---

## Endpoint Specification

### `POST /api/canvas/cards`

Creates a document or code card on the target workspace's infinite canvas.

#### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | **Yes** | Card title (1–150 characters). |
| `body` | string | **Yes** | Markdown text or code content (also accepts `content`). |
| `kind` | string | No | Card window type: `doc` (default), `code_editor`, `htmlPreview`, or `card`. |
| `position` | object | No | Canvas coordinates `{ x: number, y: number }`. If omitted, automatically placed next to existing windows. |
| `tags` | array | No | Optional list of string tags. |

#### Example Request

```bash
curl -X POST http://localhost:3000/api/canvas/cards \
  -H "Authorization: Bearer cit_your_integration_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Module Catalog",
    "body": "# System Module Catalog\n\n- **Auth Service**: OAuth2 & Session guard\n- **Canvas Connector**: External card API",
    "kind": "doc",
    "position": { "x": 200, "y": 150 },
    "tags": ["documentation", "architecture"]
  }'
```

#### Successful Response (201 Created)

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef0123456789",
  "title": "Module Catalog",
  "kind": "doc",
  "workspaceId": "user-1-default",
  "url": "hb://doc/Module%20Catalog",
  "deepLink": "hb://doc/Module%20Catalog",
  "webUrl": "/workspace/user-1-default?card=a1b2c3d4-e5f6-7890-abcd-ef0123456789",
  "position": { "x": 200, "y": 150 },
  "createdAt": "2025-02-15T12:00:00.000Z"
}
```

#### Approval-Gated Response (202 Accepted)

Returned when the integration token requires explicit human review (`pre_approved: false`).

```json
{
  "status": "pending_approval",
  "message": "Card creation is pending human approval.",
  "approvalId": "a9876543-b210-4321-cdef-1234567890ab",
  "workspaceId": "user-1-default"
}
```

---

## Error Handling

| HTTP Code | Reason | Example Response |
|---|---|---|
| **401 Unauthorized** | Missing `Authorization` header or token. | `{"error": "Unauthenticated", "message": "Bearer token is required in Authorization header."}` |
| **403 Forbidden** | Invalid token, revoked token, or token lacking `canvas:write` scope. | `{"error": "Unauthorized", "message": "Token missing required scope: canvas:write"}` |
| **422 Unprocessable Entity** | Invalid request payload shape or missing required fields. | `{"error": "Unprocessable Entity", "message": "Validation failed.", "details": ["title must be a non-empty string"]}` |
| **500 Internal Error** | Server-side execution failure. | `{"error": "Failed to create canvas card."}` |
