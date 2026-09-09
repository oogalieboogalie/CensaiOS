export const postgresTools = [
  {
    meta: {
      scope: 'system',
      destructive: false,
      requires_approval_above: 'researcher',
      audit_log: true,
    },
    type: 'function',
    function: {
      name: 'db_inspect',
      description: 'Inspect the Homebase database schema. List all tables, describe columns and data types for a specific table, or view indexes and constraints. Essential for understanding what Nexus built.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list_tables', 'describe', 'constraints'],
            default: 'list_tables',
            description: 'Inspection action to perform (default: list_tables)',
          },
          table: {
            type: 'string',
            description: 'Table name — required when action is describe or constraints',
          },
        },
      },
    },
  },
  {
    meta: {
      scope: 'system',
      destructive: false,
      requires_approval_above: 'researcher',
      audit_log: true,
    },
    type: 'function',
    function: {
      name: 'postgres_tool_info',
      description: 'Show Nexus the available Postgres tools, safety flags, target database, and common duplicate-table audit workflow.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    meta: {
      scope: 'system',
      destructive: true,
      requires_approval_above: 'worker',
      audit_log: true,
    },
    type: 'function',
    function: {
      name: 'postgres_query',
      description: 'Run SQL against the Homebase Postgres database. SELECT/WITH/SHOW/EXPLAIN are read-only by default. Mutations require allow_write=true; DROP/TRUNCATE and other dangerous operations also require allow_unsafe=true.',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SQL statement to run.' },
          params: {
            type: 'array',
            description: 'Optional positional parameters for the SQL query.',
            items: {},
          },
          limit: {
            type: 'integer',
            default: 100,
            description: 'Maximum rows returned for row-producing statements. Defaults to 100, max 1000.',
          },
          allow_write: {
            type: 'boolean',
            default: false,
            description: 'Required for INSERT, UPDATE, DELETE, CREATE, ALTER, and other write statements.',
          },
          allow_unsafe: {
            type: 'boolean',
            default: false,
            description: 'Required in addition to allow_write for DROP, TRUNCATE, destructive DELETE without WHERE, or other high-risk SQL.',
          },
        },
        required: ['sql'],
      },
    },
  },
  {
    meta: {
      scope: 'system',
      destructive: true,
      requires_approval_above: 'worker',
      audit_log: true,
    },
    type: 'function',
    function: {
      name: 'postgres_exec_file',
      description: 'Execute a local .sql file from this repo against Homebase Postgres. Use dry_run=true to preview. Mutating files require allow_write=true; destructive files also require allow_unsafe=true.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Repo-relative or absolute path to a .sql file.' },
          dry_run: {
            type: 'boolean',
            default: false,
            description: 'When true, return a preview and classification without executing.',
          },
          allow_write: {
            type: 'boolean',
            default: false,
            description: 'Required for SQL files that mutate schema or data.',
          },
          allow_unsafe: {
            type: 'boolean',
            default: false,
            description: 'Required in addition to allow_write for destructive SQL files.',
          },
        },
        required: ['file_path'],
      },
    },
  },
  {
    meta: {
      scope: 'system',
      destructive: false,
      requires_approval_above: 'researcher',
      audit_log: true,
    },
    type: 'function',
    function: {
      name: 'postgres_schema_audit',
      description: 'Audit the live Postgres schema and repo SQL migrations for duplicate table names, duplicate migration numbers, missing live tables, and extra live tables.',
      parameters: {
        type: 'object',
        properties: {
          include_counts: {
            type: 'boolean',
            default: false,
            description: 'Include approximate live row counts for public tables.',
          },
        },
      },
    },
  },
  {
    meta: {
      scope: 'system',
      destructive: false,
      requires_approval_above: 'researcher',
      audit_log: true,
    },
    type: 'function',
    function: {
      name: 'postgres_table_sample',
      description: 'Inspect one Postgres table: columns, constraints, indexes, approximate row count, and a small sample of rows.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name, optionally schema-qualified. Defaults to public schema when omitted.' },
          limit: {
            type: 'integer',
            default: 5,
            description: 'Sample row limit. Defaults to 5, max 50.',
          },
        },
        required: ['table'],
      },
    },
  },
];
