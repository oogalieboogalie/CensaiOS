import { handleCalendarTool } from './calendar.js';
import { handleMemoryTool } from './memory.js';
import { 
  githubReadFile, githubWriteFile, githubListIssues, githubCreateIssue, githubCommentIssue,
  prStatus, prComments, mergePr,
  localGitStatus, localGitFetch, localGitPullFfOnly, localGitCheckpoint, localGitVerify
} from './git/index.js';
import { handleLocalTool } from './local.js';
import { handleSubagentTool } from './subagents.js';
import { handleStartHelper } from './nanoHelper.js';
import { handleProjectsTool } from './projects.js';
import { handleJulesTool } from './jules.js';
import { dbInspect, postgresToolInfo, postgresTableSample } from './database/inspect.js';
import { postgresQuery, postgresExecFile } from './database/query.js';
import { postgresSchemaAudit } from './database/audit.js';
import { handleContainerTool } from './container.js';
import { handleHttpTool } from './http.js';
import { handleAnalyzeDeps } from './deps/index.js';
import { handleVulnerabilityAudit } from './deps/vulnerability.js';
import { handleRunnerTool } from './runner.js';
import { handleSandboxTool } from './sandbox.js';
import { handleTerminalTool } from './terminal.js';
import { handleDispatchTool } from './dispatch.js';
import { handleSheetsTool } from './sheets.js';
import { handleMailcowTool } from './mailcow.js';
import { handleVexTool } from './vex.js';
import { handlePolicyTool } from './policy.js';
import { handleToolDiscovery } from './discovery.js';
import { handleReliabilityTool } from './reliability.js';
import { handleDeepMemoryTool } from './deepMemory.js';
import { handleCanvasCollaborationTool } from './canvas.js';
import { handleProjectWindowTool } from './projectWindow.js';
import { handlePdfTool } from './pdf.js';
import { handleCadTool } from './cad.js';
import { handleScoutTool } from './scout.js';
import { handleModuleTool } from './modules.js';
import { handleResearchTool } from './research.js';
import { handleAgentNetworkTool } from './agentNetwork.js';
import { handleWeewooTool } from './weewoo.js';
import { handleSpeakUp } from './speakUp.js';
import { handleReadAppLog } from './appLog.js';
import { handleWakeUpTool } from './wakeUps.js';
import { handleVideoTool } from './video.js';
import { handleRealEstateTool } from './realEstate.js';
import { handleSkillSetTool } from './skillSets.js';
import { handleBlueprintTool } from './blueprints.js';
import { PLAN_TOOL_HANDLERS } from './censaiOrchestrator.js';

export const TOOL_REGISTRY = {
  // Tool discovery
  'search_tools': handleToolDiscovery,
  'get_tool': handleToolDiscovery,
  'get_toolkit': handleToolDiscovery,

  // Calendar
  'read_calendar': handleCalendarTool,
  'add_calendar_event': handleCalendarTool,

  // Google Sheets
  'sheets_read_range': handleSheetsTool,
  'sheets_append_row': handleSheetsTool,
  'sheets_update_cell': handleSheetsTool,

  // Memory
  'remember': handleMemoryTool,
  'remember_important': handleMemoryTool,
  'journal': handleMemoryTool,
  'know': handleMemoryTool,
  'nugget': handleMemoryTool,
  'associate': handleMemoryTool,
  'read_associations': handleMemoryTool,
  'feeling': handleMemoryTool,
  'message_to': handleMemoryTool,
  'reply_to': handleMemoryTool,
  'broadcast': handleMemoryTool,
  'recall': handleMemoryTool,
  'deep_memory': handleDeepMemoryTool,  'read_journal': handleMemoryTool,
  'read_journal_search': handleMemoryTool,
  'query_knowledge': handleMemoryTool,
  'read_messages': handleMemoryTool,

  // Git / GitHub
  'github_read_file': (agentId, name, args) => githubReadFile(args),
  'github_write_file': (agentId, name, args) => githubWriteFile(args),
  'github_list_issues': (agentId, name, args) => githubListIssues(args),
  'github_create_issue': (agentId, name, args) => githubCreateIssue(args),
  'github_comment_issue': (agentId, name, args) => githubCommentIssue(args),
  'pr_status': (agentId, name, args, context) => prStatus(agentId, args, context),
  'pr_comments': (agentId, name, args, context) => prComments(agentId, args, context),
  'merge_pr': (agentId, name, args, context) => mergePr(agentId, args, context),
  'local_git_status': (agentId, name, args, context) => localGitStatus(agentId, args, context),
  'local_git_fetch': (agentId, name, args, context) => localGitFetch(agentId, args, context),
  'local_git_pull_ff_only': (agentId, name, args, context) => localGitPullFfOnly(agentId, args, context),
  'local_git_checkpoint': (agentId, name, args, context) => localGitCheckpoint(agentId, args, context),
  'local_git_verify': (agentId, name, args, context) => localGitVerify(agentId, args, context),

  // Local
  'local_list_dir': handleLocalTool,
  'local_read_file': handleLocalTool,
  'local_write_file': handleLocalTool,
  'web_search': handleLocalTool,
  'web_extract': handleLocalTool,

  // Subagents
  'create_sub_agent': handleSubagentTool,
  'list_sub_agents': handleSubagentTool,
  'remove_sub_agent': handleSubagentTool,
  'submit_agent_task': handleSubagentTool,
  'scratchpad_write': handleSubagentTool,
  'scratchpad_read': handleSubagentTool,
  'scratchpad_clear': handleSubagentTool,
  'start_helper': (agentId, _name, args, context) => handleStartHelper(agentId, args, context),

  // Projects
  'open_project': handleProjectsTool,
  'list_projects': handleProjectsTool,
  'read_brief': handleProjectsTool,
  'refresh_brief': handleProjectsTool,
  'project_read': handleProjectsTool,
  'project_file_outline': handleProjectsTool,
  'project_write': handleProjectsTool,
  'project_edit': handleProjectsTool,
  'project_multi_edit': handleProjectsTool,
  'project_list': handleProjectsTool,
  'report': handleProjectsTool,
  'submit_pr': handleProjectsTool,

  // Jules
  'jules_submit': handleJulesTool,
  'jules_status': handleJulesTool,
  'jules_list': handleJulesTool,

  // Sales research (Search & Rescue lead store)
  'lead_save': handleResearchTool,
  'lead_list': handleResearchTool,
  'lead_status': handleResearchTool,

  // Database
  'db_inspect': (agentId, name, args) => dbInspect(args),
  'postgres_tool_info': (agentId, name, args) => postgresToolInfo(),
  'postgres_query': (agentId, name, args) => postgresQuery(args),
  'postgres_exec_file': (agentId, name, args) => postgresExecFile(args),
  'postgres_schema_audit': (agentId, name, args) => postgresSchemaAudit(args),
  'postgres_table_sample': (agentId, name, args) => postgresTableSample(args),

  // Container
  'container_status': handleContainerTool,
  'container_logs': handleContainerTool,
  'restart_service': handleContainerTool,

  // Http
  'http_test': handleHttpTool,

  // Deps
  'analyze_deps': (agentId, name, args) => handleAnalyzeDeps(agentId, args),

  // Runner
  'run_tests': handleRunnerTool,
  'run_linter': handleRunnerTool,

  // Sandbox (Docker exec)
  'sandbox_exec': handleSandboxTool,

  // Shared terminal (live, human + agent)
  'terminal_run': handleTerminalTool,

  // Dispatch
  'dispatch_squad': handleDispatchTool,
  'squad_status': handleDispatchTool,
  'task_done': handleDispatchTool,

  // Real Estate Team board (spec 7)
  'fair_housing_check': handleRealEstateTool,
  'post_team_chat': handleRealEstateTool,
  'draft_client_message': handleRealEstateTool,
  'deal_deadlines': handleRealEstateTool,

  // Shared canvas collaboration
  'canvas_list_writable_windows': handleCanvasCollaborationTool,
  'canvas_append_window': handleCanvasCollaborationTool,
  'canvas_spawn_window': handleCanvasCollaborationTool,
  'project_preview': handleCanvasCollaborationTool,
  'project_window': handleProjectWindowTool,
  'canvas_window_index': handleCanvasCollaborationTool,
  'canvas_read_design': handleCanvasCollaborationTool,
  'canvas_update_design': handleCanvasCollaborationTool,
  // YorWare PDF (spec 13)
  'read_pdf': handlePdfTool,
  'fill_pdf_field': handlePdfTool,
  'sign_here': handlePdfTool,
  // YorWare CAD (spec 13)
  'read_cad_part': handleCadTool,
  'edit_cad_part': handleCadTool,
  // Scout agents: the core agent's eyes and ears on a project's code
  'scout_map': handleScoutTool,
  'skill_set_log': handleSkillSetTool,
  'browser_go': handleSkillSetTool,
  // Blueprints shelf (Alex's diagram 08)
  'find_blueprints': handleBlueprintTool,
  'save_blueprint': handleBlueprintTool,
  'scout_find': handleScoutTool,

  // Modules on demand (spec 6)
  'make_module': handleModuleTool,
  'read_module': handleModuleTool,
  'use_module': handleModuleTool,

  // Agent network (discovery + help requests)
  'discover_agents': handleAgentNetworkTool,
  'request_agent_help': handleAgentNetworkTool,
  'agent_help_status': handleAgentNetworkTool,
  // WeeWoo office avatars
  'choose_avatar': handleWeewooTool,
  // Speak up: one short note to the Inbox, on the agent's own (diagram 17)
  'speak_up': (agentId, _name, args, context) => handleSpeakUp(agentId, args, context),
  'read_app_log': (_agentId, _name, args, context) => handleReadAppLog(args, context),
  // Wake-ups: Censai schedules himself or wakes a family agent
  'wake_me_up': handleWakeUpTool,
  'my_wake_ups': handleWakeUpTool,
  'cancel_wake_up': handleWakeUpTool,
  ...PLAN_TOOL_HANDLERS, // Censai the orchestrator: hand_off_jobs, jobs_status, stop_jobs
  // Video (Google Veo, BYOK)
  'make_video': handleVideoTool,
  'video_status': handleVideoTool,
  // Mailcow
  'mailcow_domains': handleMailcowTool,
  'mailcow_mailboxes': handleMailcowTool,
  'mailcow_aliases': handleMailcowTool,
  'mailcow_queue': handleMailcowTool,
  'mailcow_add_mailbox': handleMailcowTool,
  'mailcow_delete_mailbox': handleMailcowTool,
  'mailcow_add_alias': handleMailcowTool,
  'mailcow_delete_alias': handleMailcowTool,

  // Vex
  'vex_run': handleVexTool,
  'vex_status': handleVexTool,
  'vex_list_agents': handleVexTool,

  // Vulnerability
  'vulnerability_audit': handleVulnerabilityAudit,

  // Policy
  'policy_evaluate': handlePolicyTool,
  'policy_record_evidence': handlePolicyTool,

  // Reliability
  'scan_reliability': handleReliabilityTool,
  'generate_tests': handleReliabilityTool,
};
