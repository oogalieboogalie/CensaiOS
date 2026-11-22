// The tools each family agent has for its role, with nothing to equip.
//
// Two guards decide what a call does, not this list:
//  - Only this computer's owner drives a tool that changes the computer or
//    reads its database, Docker or mail (hostOwnerOnly.js).
//  - Trust mode. On (the default): the agent acts. Off: a tool marked
//    ask_first here, or one named by an approval module, waits in Action
//    Approvals for an owner or admin (server/approvals/requests.js).
const policy = (name, risk, mode = 'autonomous') => Object.freeze({ name, risk, mode });
const look = (name) => policy(name, 'read');
const act = (name) => policy(name, 'write', 'autonomous_internal');
const ask = (name) => policy(name, 'write', ASK_FIRST);

export const ASK_FIRST = 'ask_first';

// Every family agent: its own journal and what the family knows.
const KNOWLEDGE = Object.freeze([
  look('read_journal'), look('read_journal_search'), look('query_knowledge'), look('read_associations'),
  act('know'), act('nugget'), act('associate'),
]);

// Every family agent: look things up on the web, on GitHub, in the person's
// calendar and sheets, in the projects and on the board.
const LOOKUP = Object.freeze([
  look('web_search'), look('web_extract'),
  look('github_read_file'), look('github_list_issues'), look('pr_status'), look('pr_comments'),
  look('jules_status'), look('jules_list'), look('local_git_status'),
  look('read_calendar'), look('sheets_read_range'),
  look('list_projects'), look('analyze_deps'), look('scan_reliability'), look('vulnerability_audit'),
  look('canvas_list_writable_windows'), look('canvas_window_index'), look('canvas_read_design'),
  look('read_pdf'), look('read_cad_part'),
]);

// Every family agent: work on the board and in the person's calendar and
// sheets. The ones an approval module names wait with Trust mode off.
const BOARD_WORK = Object.freeze([
  act('canvas_spawn_window'), act('canvas_append_window'), act('project_preview'),
  act('canvas_update_design'), act('fill_pdf_field'), act('sign_here'), act('edit_cad_part'),
  ask('add_calendar_event'), ask('sheets_append_row'), ask('sheets_update_cell'),
]);

// Every family agent saves project files, so every one can also check its
// work and hand it in.
const CODE = Object.freeze([
  act('refresh_brief'), act('run_tests'), act('run_linter'), act('open_project'),
  act('local_git_fetch'), act('local_git_checkpoint'), act('local_git_verify'),
  ask('project_multi_edit'), ask('generate_tests'), ask('local_git_pull_ff_only'),
  ask('submit_pr'), ask('github_create_issue'), ask('github_comment_issue'), ask('jules_submit'),
]);

// The builders and Foundation: commands, files anywhere on this computer,
// and writing straight to GitHub.
const COMMANDS = Object.freeze([
  look('local_read_file'), look('local_list_dir'), look('http_test'),
  ask('sandbox_exec'), ask('terminal_run'), ask('local_write_file'),
  ask('github_write_file'), ask('merge_pr'),
]);

// Nexus (databases) and Atlas (backend): the app's own database.
const DATABASE = Object.freeze([
  look('db_inspect'), look('postgres_tool_info'), look('postgres_schema_audit'), look('postgres_table_sample'),
  ask('postgres_query'), ask('postgres_exec_file'),
]);

// Foundation (containers), Phoenix (recovery) and Nexus: the Docker services.
const SERVICES = Object.freeze([
  look('container_status'), look('container_logs'), ask('restart_service'),
]);

// Foundation: the owner's mail server.
const MAIL = Object.freeze([
  look('mailcow_domains'), look('mailcow_mailboxes'), look('mailcow_aliases'), look('mailcow_queue'),
  ask('mailcow_add_mailbox'), ask('mailcow_delete_mailbox'), ask('mailcow_add_alias'), ask('mailcow_delete_alias'),
]);

export const FAMILY_ROLE_TOOL_POLICIES = Object.freeze([
  ...KNOWLEDGE, ...LOOKUP, ...BOARD_WORK, ...CODE, ...COMMANDS, ...DATABASE, ...SERVICES, ...MAIL,
]);

const names = (...groups) => Object.freeze(groups.flat().map((entry) => entry.name));
const EVERYONE = [KNOWLEDGE, LOOKUP, BOARD_WORK, CODE];

/** The role tools added to each family agent's list (familyBaseline.js). */
export const FAMILY_ROLE_TOOL_NAMES = Object.freeze({
  architect: names(...EVERYONE, COMMANDS),
  atlas: names(...EVERYONE, COMMANDS, DATABASE),
  genesis: names(...EVERYONE, COMMANDS),
  nexus: names(...EVERYONE, COMMANDS, DATABASE, SERVICES),
  phoenix: names(...EVERYONE, COMMANDS, SERVICES),
  foundation: names(...EVERYONE, COMMANDS, SERVICES, MAIL),
  echo: names(...EVERYONE),
  censai: names(...EVERYONE),
  guardian: names(...EVERYONE),
});
