#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="/Users/jack/orbyt-master/orbyt"
PROMPT_FILE="$WORKSPACE/scripts/argent-audit-prompt.md"
REPORT_DIR="$WORKSPACE/reports/argent"
RUNS_DIR="$REPORT_DIR/runs"
MEMORY_DIR="$REPORT_DIR/memory"
PROFILE_DIR="$REPORT_DIR/profiling"
GLOBAL_PAGE_MEMORY_FILE="$MEMORY_DIR/page-memory.md"
GLOBAL_HISTORY_FILE="$MEMORY_DIR/nightly-history.md"
GLOBAL_FOCUS_QUEUE_FILE="$MEMORY_DIR/focus-queue.md"
GLOBAL_SUPERVISOR_FEEDBACK_FILE="$MEMORY_DIR/supervisor-feedback.md"
GLOBAL_WORKER_HEARTBEAT_FILE="$MEMORY_DIR/worker-heartbeat.md"
GLOBAL_SYSTEM_IMPROVEMENTS_FILE="$MEMORY_DIR/system-improvements.md"

mkdir -p "$REPORT_DIR"
mkdir -p "$RUNS_DIR"
mkdir -p "$MEMORY_DIR"
mkdir -p "$PROFILE_DIR"
if ! command -v agent >/dev/null 2>&1; then
  echo "Cursor CLI 'agent' command not found in PATH." >&2
  echo "Install with: curl https://cursor.com/install -fsSL | bash" >&2
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Prompt file missing: $PROMPT_FILE" >&2
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$RUNS_DIR/$TS"
SESSION_DIR="$RUN_DIR/session"
SESSION_MEMORY_DIR="$SESSION_DIR/memory"
SESSION_COORD_DIR="$SESSION_DIR/coord"
LOG_FILE="$REPORT_DIR/cli-$TS.log"
AGENT_OUTPUT_FILE="$REPORT_DIR/agent-$TS.log"
REGRESSION_INPUT_FILE="$SESSION_MEMORY_DIR/regression-input-$TS.md"
PAGE_MEMORY_FILE="$SESSION_MEMORY_DIR/page-memory.md"
HISTORY_FILE="$SESSION_MEMORY_DIR/nightly-history.md"
FOCUS_QUEUE_FILE="$SESSION_MEMORY_DIR/focus-queue.md"
SUPERVISOR_FEEDBACK_FILE="$RUN_DIR/supervisor-feedback-final.md"
WORKER_HEARTBEAT_FILE="$RUN_DIR/worker-heartbeat-final.md"
SYSTEM_IMPROVEMENTS_FILE="$RUN_DIR/system-improvements-final.md"
COORD_EVENTS_FILE="$SESSION_COORD_DIR/events.jsonl"
COORD_COMMANDS_FILE="$SESSION_COORD_DIR/commands.jsonl"
COORD_STATE_FILE="$SESSION_COORD_DIR/state.json"
FLOW_COUNT="$(ls -1 "$WORKSPACE/.argent/flows/"*.yaml 2>/dev/null | wc -l | tr -d ' ')"
STALL_TIMEOUT_SECONDS="${STALL_TIMEOUT_SECONDS:-420}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-15}"
MAX_RESTARTS="${MAX_RESTARTS:-2}"
MAX_TLS_RETRIES="${MAX_TLS_RETRIES:-4}"
TLS_RETRY_BACKOFF_SECONDS="${TLS_RETRY_BACKOFF_SECONDS:-8}"
MAX_RUN_SECONDS="${MAX_RUN_SECONDS:-5400}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-stream-json}"
STREAM_PARTIAL_OUTPUT="${STREAM_PARTIAL_OUTPUT:-1}"
HUMAN_STREAM_FILTER="${HUMAN_STREAM_FILTER:-1}"
ENABLE_LIVE_STREAM="${ENABLE_LIVE_STREAM:-0}"
CPU_ACTIVITY_GRACE_SECONDS="${CPU_ACTIVITY_GRACE_SECONDS:-900}"
ENABLE_SUPERVISOR_AGENT="${ENABLE_SUPERVISOR_AGENT:-1}"
SUPERVISOR_INTERVAL_SECONDS="${SUPERVISOR_INTERVAL_SECONDS:-180}"
SUPERVISOR_MODEL="${SUPERVISOR_MODEL:-auto}"
CLEANUP_WORKING_FILES="${CLEANUP_WORKING_FILES:-1}"
COMMAND_ACK_TIMEOUT_SECONDS="${COMMAND_ACK_TIMEOUT_SECONDS:-180}"
URGENT_COMMAND_ACK_TIMEOUT_SECONDS="${URGENT_COMMAND_ACK_TIMEOUT_SECONDS:-60}"
AGENT_PROXY_MODE="${AGENT_PROXY_MODE:-auto}"
MAX_DNS_RETRIES="${MAX_DNS_RETRIES:-3}"

cd "$WORKSPACE"
mkdir -p "$RUN_DIR"
mkdir -p "$SESSION_MEMORY_DIR"
mkdir -p "$SESSION_COORD_DIR"

echo "Starting Argent audit at $(date)"
echo "Streaming output (also saved to $LOG_FILE)"
echo "Raw agent output file: $AGENT_OUTPUT_FILE"
echo "Run workspace directory: $RUN_DIR"
echo "Discovered flow files: $FLOW_COUNT"
echo "Watchdog idle timeout (0 disables): $STALL_TIMEOUT_SECONDS seconds"
echo "Max run time per attempt: $MAX_RUN_SECONDS seconds"
echo "TLS transient retry budget: $MAX_TLS_RETRIES (backoff=${TLS_RETRY_BACKOFF_SECONDS}s)"
echo "Output format: $OUTPUT_FORMAT (partial stream=$STREAM_PARTIAL_OUTPUT)"
echo "Human stream filter enabled: $HUMAN_STREAM_FILTER"
echo "Live terminal stream enabled: $ENABLE_LIVE_STREAM"
echo "CPU activity grace (no output, but process active): $CPU_ACTIVITY_GRACE_SECONDS seconds"
echo "Supervisor agent enabled: $ENABLE_SUPERVISOR_AGENT (interval=${SUPERVISOR_INTERVAL_SECONDS}s)"
echo "Command ack SLA: normal=${COMMAND_ACK_TIMEOUT_SECONDS}s urgent=${URGENT_COMMAND_ACK_TIMEOUT_SECONDS}s"
echo "Agent proxy mode: $AGENT_PROXY_MODE"
{
  echo "Starting Argent audit at $(date)"
  echo "Streaming output (also saved to $LOG_FILE)"
  echo "Raw agent output file: $AGENT_OUTPUT_FILE"
  echo "Run workspace directory: $RUN_DIR"
  echo "Discovered flow files: $FLOW_COUNT"
  echo "Watchdog idle timeout (0 disables): $STALL_TIMEOUT_SECONDS seconds"
  echo "Max run time per attempt: $MAX_RUN_SECONDS seconds"
  echo "TLS transient retry budget: $MAX_TLS_RETRIES (backoff=${TLS_RETRY_BACKOFF_SECONDS}s)"
  echo "Output format: $OUTPUT_FORMAT (partial stream=$STREAM_PARTIAL_OUTPUT)"
  echo "Human stream filter enabled: $HUMAN_STREAM_FILTER"
  echo "Live terminal stream enabled: $ENABLE_LIVE_STREAM"
  echo "CPU activity grace (no output, but process active): $CPU_ACTIVITY_GRACE_SECONDS seconds"
  echo "Supervisor agent enabled: $ENABLE_SUPERVISOR_AGENT (interval=${SUPERVISOR_INTERVAL_SECONDS}s)"
  echo "Command ack SLA: normal=${COMMAND_ACK_TIMEOUT_SECONDS}s urgent=${URGENT_COMMAND_ACK_TIMEOUT_SECONDS}s"
  echo "Agent proxy mode: $AGENT_PROXY_MODE"
} >>"$LOG_FILE"

declare -a AGENT_ENV_PREFIX=()
current_agent_proxy_mode=""

apply_agent_proxy_mode() {
  local mode="$1"
  current_agent_proxy_mode="$mode"
  if [[ "$mode" == "inherited" ]]; then
    AGENT_ENV_PREFIX=("env")
    return
  fi
  AGENT_ENV_PREFIX=(
    "env"
    "-u" "HTTP_PROXY"
    "-u" "HTTPS_PROXY"
    "-u" "ALL_PROXY"
    "-u" "SOCKS_PROXY"
    "-u" "SOCKS5_PROXY"
    "-u" "http_proxy"
    "-u" "https_proxy"
    "-u" "all_proxy"
    "-u" "socks_proxy"
    "-u" "socks5_proxy"
    "-u" "GIT_HTTP_PROXY"
    "-u" "GIT_HTTPS_PROXY"
  )
}

has_any_proxy_env=0
for proxy_var in HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy; do
  if [[ -n "${!proxy_var:-}" ]]; then
    has_any_proxy_env=1
    break
  fi
done

if [[ "$AGENT_PROXY_MODE" == "inherited" ]]; then
  apply_agent_proxy_mode "inherited"
elif [[ "$AGENT_PROXY_MODE" == "direct" ]]; then
  apply_agent_proxy_mode "direct"
else
  if (( has_any_proxy_env == 1 )); then
    apply_agent_proxy_mode "inherited"
  else
    apply_agent_proxy_mode "direct"
  fi
fi
echo "Agent transport mode selected: $current_agent_proxy_mode"
echo "Agent transport mode selected: $current_agent_proxy_mode" >>"$LOG_FILE"

# Warm auth/session before the full run so scheduled jobs fail fast if login expired.
if ! "${AGENT_ENV_PREFIX[@]}" agent status >/dev/null 2>&1; then
  echo "Cursor CLI auth check failed. Run 'agent login' and retry." >&2
  echo "Cursor CLI auth check failed. Run 'agent login' and retry." >>"$LOG_FILE"
  exit 1
fi

if [[ ! -f "$GLOBAL_PAGE_MEMORY_FILE" ]]; then
  cat <<'EOF' >"$GLOBAL_PAGE_MEMORY_FILE"
# Page Memory

Track per-page exploration so nightly QA prioritizes untested/under-tested areas.

## Page Ledger
| Page/Feature | Last Run | Coverage | Known Issues | Notes |
| --- | --- | --- | --- | --- |
EOF
fi

if [[ ! -f "$GLOBAL_HISTORY_FILE" ]]; then
  cat <<'EOF' >"$GLOBAL_HISTORY_FILE"
# Nightly History

Append one summary entry per run with explored areas, major findings, and next targets.
EOF
fi

if [[ ! -f "$GLOBAL_FOCUS_QUEUE_FILE" ]]; then
  cat <<'EOF' >"$GLOBAL_FOCUS_QUEUE_FILE"
# Focus Queue

Prioritized exploration queue for upcoming runs.

## Suggested Next Areas
- Auth edge cases
- Feed playback edge cases
- Comments/post actions with empty/error states
EOF
fi

if [[ ! -f "$GLOBAL_SUPERVISOR_FEEDBACK_FILE" ]]; then
  cat <<'EOF' >"$GLOBAL_SUPERVISOR_FEEDBACK_FILE"
# Supervisor Feedback

Verifier agent writes guidance here for the worker agent.
EOF
fi

if [[ ! -f "$GLOBAL_WORKER_HEARTBEAT_FILE" ]]; then
  cat <<'EOF' >"$GLOBAL_WORKER_HEARTBEAT_FILE"
# Worker Heartbeat

Worker agent writes periodic status/plan checkpoints here.
EOF
fi

if [[ ! -f "$GLOBAL_SYSTEM_IMPROVEMENTS_FILE" ]]; then
  cat <<'EOF' >"$GLOBAL_SYSTEM_IMPROVEMENTS_FILE"
# QA System Improvements

Worker/verifier append dated notes about improving flows, heuristics, coverage strategy, and reliability.
EOF
fi

# Seed a self-contained session workspace from global memory snapshots.
cp "$GLOBAL_PAGE_MEMORY_FILE" "$PAGE_MEMORY_FILE"
cp "$GLOBAL_HISTORY_FILE" "$HISTORY_FILE"
cp "$GLOBAL_FOCUS_QUEUE_FILE" "$FOCUS_QUEUE_FILE"
: >"$COORD_EVENTS_FILE"
: >"$COORD_COMMANDS_FILE"
cat <<'EOF' >"$COORD_STATE_FILE"
{
  "schema_version": 1,
  "last_updated": null,
  "run_id": null,
  "worker": {},
  "supervisor": {}
}
EOF

{
  echo "# Regression Input ($TS)"
  echo
  echo "## Recent Commits"
  git log -n 15 --pretty=format:'- %h %ad %s' --date=short || true
  echo
  echo
  echo "## Files Changed In Last 15 Commits"
  git diff --name-only HEAD~15..HEAD 2>/dev/null || git diff --name-only HEAD~5..HEAD 2>/dev/null || true
} >"$REGRESSION_INPUT_FILE"

PROMPT_CONTENT="$(cat "$PROMPT_FILE"
cat <<EOF
Runtime context for this run:
- Run timestamp: $TS
- Run workspace directory (preferred output target): $RUN_DIR
- Page memory file: $PAGE_MEMORY_FILE
- Nightly history file: $HISTORY_FILE
- Focus queue file: $FOCUS_QUEUE_FILE
- Regression input file: $REGRESSION_INPUT_FILE
- Profiling output directory: $PROFILE_DIR
- Supervisor feedback file: $SUPERVISOR_FEEDBACK_FILE
- Worker heartbeat file: $WORKER_HEARTBEAT_FILE
- System improvements file: $SYSTEM_IMPROVEMENTS_FILE
- Coordination events file: $COORD_EVENTS_FILE
- Coordination commands file: $COORD_COMMANDS_FILE
- Coordination state file: $COORD_STATE_FILE
- Network/API note: simulator is not connected to API, so emphasize offline/error-state/empty-state/edge-case behavior.
- Output discipline: keep progress narration minimal; print at most one short checkpoint every 2-3 minutes or on major phase/result changes.
- In terminal output, always include explicit 'NOW:' status lines so humans can follow your current action.
- Session-isolation requirement: treat paths under $SESSION_DIR as authoritative working memory; do not write progress into global memory files.
- Communication protocol (authoritative): use coordination bus only ($COORD_COMMANDS_FILE, $COORD_EVENTS_FILE, $COORD_STATE_FILE) for worker<->supervisor exchange and acknowledgements.
- Command authority policy (authoritative): commands in $COORD_COMMANDS_FILE addressed to worker are binding directives.
- Ack SLA (authoritative): append a command_ack event to $COORD_EVENTS_FILE within 60s for new commands, and within 45s for priority=urgent.
- Priority handling (authoritative): priority=urgent commands preempt non-command work immediately.
- Blocking protocol (authoritative): if blocked, include explicit blocked_reason and next_step in command_ack; do not continue unrelated work silently.
- Completion protocol (authoritative): append command_result event with command_id, status (passed|failed|blocked), and concise evidence.
- Non-compliance policy (authoritative): runner may terminate and restart worker if command ack SLA is violated.
- Markdown files are final outputs only. Do not use markdown files as control-plane communication during execution.
- Every 2-3 minutes, append a checkpoint event to events bus instead of markdown heartbeat.
- Keep human-facing status terse: single sentence, no repeated restatement, and avoid duplicating the same update.
- Read supervisor commands from commands bus periodically and adapt when guidance is high value.
- Prefer writing all run-specific artifacts under run workspace directory using dated filenames.
- You are encouraged to author new flows and improve existing flows when that increases long-term test quality.
EOF
)"
touch "$LOG_FILE"
touch "$AGENT_OUTPUT_FILE"

declare -a AGENT_PREFIX_CMD=()
if command -v stdbuf >/dev/null 2>&1; then
  AGENT_PREFIX_CMD=("stdbuf" "-oL" "-eL")
else
  # Avoid PTY-based fallbacks like `script` here; sandboxed/CI environments can
  # fail with "openpty: Operation not permitted" and prevent the worker from starting.
  AGENT_PREFIX_CMD=()
fi

AGENT_ARGS=(
  --print "$PROMPT_CONTENT"
  --workspace "$WORKSPACE"
  --model auto
  --output-format "$OUTPUT_FORMAT"
  --approve-mcps
  --force
)

if [[ "$OUTPUT_FORMAT" == "stream-json" && "$STREAM_PARTIAL_OUTPUT" == "1" ]]; then
  AGENT_ARGS+=(--stream-partial-output)
fi

run_supervisor_pass() {
  local now_ts="$1"
  local verifier_log="$REPORT_DIR/verifier-$TS.log"
  local verifier_out_file="$RUN_DIR/verifier-pass-$now_ts.md"
  local verifier_prompt
  verifier_prompt="$(cat <<EOF
You are the verifier/supervisor agent for an autonomous QA worker.

Context files:
- Worker raw output: $AGENT_OUTPUT_FILE
- Worker visible log: $LOG_FILE
- Worker heartbeat: $WORKER_HEARTBEAT_FILE
- Prior supervisor feedback: $SUPERVISOR_FEEDBACK_FILE
- Page memory: $PAGE_MEMORY_FILE
- Nightly history: $HISTORY_FILE
- Focus queue: $FOCUS_QUEUE_FILE
- Regression input: $REGRESSION_INPUT_FILE

Your job:
1) Read latest worker progress.
2) Identify if worker is off-track, looping, shallow-testing, or missing edge cases.
3) Produce concise corrective guidance and next 3-5 high-value actions.
4) Append guidance to $SUPERVISOR_FEEDBACK_FILE with timestamp [$now_ts].
5) If worker is doing well, affirm and suggest only one optimization.

Constraints:
- Do not edit source code.
- Do not stop the worker.
- Keep feedback concise and actionable.
- Output only markdown feedback content (no preamble).
EOF
)"

  "${AGENT_ENV_PREFIX[@]}" agent --print "$verifier_prompt" \
    --workspace "$WORKSPACE" \
    --model "$SUPERVISOR_MODEL" \
    --output-format text \
    --approve-mcps \
    --force \
    >"$verifier_out_file" 2>>"$verifier_log" || true

  python3 - "$COORD_COMMANDS_FILE" "$TS" "$now_ts" "$verifier_out_file" <<'PY'
import json, sys, pathlib, uuid
commands_file, run_id, now_ts, out_file = sys.argv[1:5]
text = ""
p = pathlib.Path(out_file)
if p.exists():
    text = p.read_text(encoding="utf-8").strip()
entry = {
    "id": f"cmd-{uuid.uuid4()}",
    "ts": now_ts,
    "run_id": run_id,
    "from": "supervisor",
    "to": "worker",
    "priority": "normal",
    "command": "review_feedback",
    "payload_text": text,
}
with open(commands_file, "a", encoding="utf-8") as f:
    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
PY
}

append_coord_event() {
  local event_type="$1"
  local status="$2"
  local notes="$3"
  python3 - "$COORD_EVENTS_FILE" "$TS" "$event_type" "$status" "$notes" <<'PY'
import json, sys, datetime
events_file, run_id, event_type, status, notes = sys.argv[1:6]
entry = {
    "ts": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    "run_id": run_id,
    "agent": "runner",
    "type": event_type,
    "status": status,
    "notes": notes
}
with open(events_file, "a", encoding="utf-8") as f:
    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
PY
}

check_command_ack_sla() {
  python3 - "$COORD_COMMANDS_FILE" "$COORD_EVENTS_FILE" "$COMMAND_ACK_TIMEOUT_SECONDS" "$URGENT_COMMAND_ACK_TIMEOUT_SECONDS" <<'PY'
import json, sys, datetime

commands_file, events_file, normal_timeout, urgent_timeout = sys.argv[1:5]
normal_timeout = int(normal_timeout)
urgent_timeout = int(urgent_timeout)
now = datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc)

def parse_ts(value):
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None

acked_ids = set()
try:
    with open(events_file, "r", encoding="utf-8") as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except Exception:
                continue
            if obj.get("type") != "command_ack":
                continue
            command_id = obj.get("command_id")
            if command_id:
                acked_ids.add(command_id)
except FileNotFoundError:
    pass

pending = []
try:
    with open(commands_file, "r", encoding="utf-8") as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except Exception:
                continue
            if obj.get("to") != "worker":
                continue
            command_id = obj.get("id")
            if not command_id or command_id in acked_ids:
                continue
            ts = parse_ts(obj.get("ts"))
            if ts is None:
                continue
            age = int((now - ts).total_seconds())
            priority = (obj.get("priority") or "normal").lower()
            timeout = urgent_timeout if priority == "urgent" else normal_timeout
            if age >= timeout:
                pending.append((age, timeout, obj))
except FileNotFoundError:
    pass

if not pending:
    sys.exit(0)

pending.sort(key=lambda item: item[0], reverse=True)
age, timeout, cmd = pending[0]
payload = {
    "command_id": cmd.get("id"),
    "priority": cmd.get("priority", "normal"),
    "command": cmd.get("command", "unknown"),
    "age_seconds": age,
    "timeout_seconds": timeout,
}
print(json.dumps(payload, ensure_ascii=False))
sys.exit(2)
PY
}

update_coord_state() {
  local worker_status="$1"
  local supervisor_status="$2"
  local elapsed_seconds="$3"
  local output_bytes="$4"
  python3 - "$COORD_STATE_FILE" "$TS" "$worker_status" "$supervisor_status" "$elapsed_seconds" "$output_bytes" <<'PY'
import json, sys, datetime, pathlib
state_file, run_id, worker_status, supervisor_status, elapsed_seconds, output_bytes = sys.argv[1:7]
p = pathlib.Path(state_file)
try:
    data = json.loads(p.read_text(encoding="utf-8"))
except Exception:
    data = {"schema_version": 1}
data["last_updated"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
data["run_id"] = run_id
data["worker"] = {
    "status": worker_status,
    "elapsed_seconds": int(elapsed_seconds),
    "output_bytes": int(output_bytes),
}
data["supervisor"] = {"status": supervisor_status}
p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
PY
}

locate_artifact() {
  local pattern_in_run="$1"
  local pattern_in_root="$2"
  local candidate=""

  candidate="$(ls -1t "$RUN_DIR"/$pattern_in_run 2>/dev/null | head -n 1 || true)"
  if [[ -n "$candidate" ]]; then
    echo "$candidate"
    return
  fi

  candidate="$(ls -1t "$REPORT_DIR"/$pattern_in_root 2>/dev/null | head -n 1 || true)"
  if [[ -n "$candidate" ]]; then
    echo "$candidate"
    return
  fi

  echo ""
}

write_nightly_review() {
  local review_file="$RUN_DIR/nightly-review-$TS.md"
  local actions_file="$1"
  local issues_file="$2"
  local nightly_file="$3"
  local profile_file="$4"

  {
    echo "# Nightly Review - $TS"
    echo
    echo "- Date: $(date -u +"%Y-%m-%d %H:%M:%SZ")"
    echo "- Run workspace: $RUN_DIR"
    echo "- Worker heartbeat: $WORKER_HEARTBEAT_FILE"
    echo "- Supervisor feedback: $SUPERVISOR_FEEDBACK_FILE"
    echo
    echo "## Final Artifacts"
    echo "- Actions: ${actions_file:-MISSING}"
    echo "- Issues: ${issues_file:-MISSING}"
    echo "- Nightly Summary: ${nightly_file:-MISSING}"
    echo "- Profile Summary: ${profile_file:-MISSING}"
    echo
    echo "## Notes"
    echo "- This is the canonical end-of-run summary file."
    echo "- Intermediate logs may be removed by cleanup depending on configuration."
  } >"$review_file"

  echo "$review_file"
}

cleanup_working_files() {
  if [[ "$CLEANUP_WORKING_FILES" != "1" ]]; then
    return
  fi

  rm -f "$AGENT_OUTPUT_FILE" >/dev/null 2>&1 || true
  rm -f "$LOG_FILE" >/dev/null 2>&1 || true
  rm -f "$REPORT_DIR/verifier-$TS.log" >/dev/null 2>&1 || true
  rm -f "$RUN_DIR"/verifier-pass-*.md >/dev/null 2>&1 || true
}

stop_stream_tail() {
  local tail_pid="$1"
  if [[ -z "${tail_pid:-}" ]]; then
    return
  fi
  if kill -0 "$tail_pid" >/dev/null 2>&1; then
    kill "$tail_pid" >/dev/null 2>&1 || true
  fi
  # Ensure background pipeline children (tail/python/tee) are not left running.
  pkill -P "$tail_pid" >/dev/null 2>&1 || true
  wait "$tail_pid" >/dev/null 2>&1 || true
}

stop_worker_process() {
  local worker_pid="$1"
  if [[ -z "${worker_pid:-}" ]]; then
    return
  fi
  if ! kill -0 "$worker_pid" >/dev/null 2>&1; then
    wait "$worker_pid" >/dev/null 2>&1 || true
    return
  fi
  kill "$worker_pid" >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5; do
    if ! kill -0 "$worker_pid" >/dev/null 2>&1; then
      wait "$worker_pid" >/dev/null 2>&1 || true
      return
    fi
    sleep 1
  done
  kill -9 "$worker_pid" >/dev/null 2>&1 || true
  wait "$worker_pid" >/dev/null 2>&1 || true
}

is_tls_eproto_error_present() {
  local target_file="$1"
  python3 - "$target_file" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
if not path.exists():
    sys.exit(1)
text = path.read_text(encoding="utf-8", errors="ignore")
patterns = [
    r"write EPROTO",
    r"tls_get_more_records:packet length too long",
]
if all(re.search(p, text, re.IGNORECASE) for p in patterns):
    sys.exit(0)
sys.exit(1)
PY
}

is_dns_enotfound_error_present() {
  local target_file="$1"
  python3 - "$target_file" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
if not path.exists():
    sys.exit(1)
text = path.read_text(encoding="utf-8", errors="ignore")
patterns = [
    r"getaddrinfo ENOTFOUND",
    r"api2\.cursor\.sh",
]
if all(re.search(p, text, re.IGNORECASE) for p in patterns):
    sys.exit(0)
sys.exit(1)
PY
}

materialize_final_markdown_outputs() {
  local now_iso
  now_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  python3 - "$COORD_COMMANDS_FILE" "$SUPERVISOR_FEEDBACK_FILE" "$now_iso" <<'PY'
import json, sys, pathlib
commands_file, out_file, now_iso = sys.argv[1:4]
rows = []
p = pathlib.Path(commands_file)
if p.exists():
    for raw in p.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            obj = json.loads(raw)
        except Exception:
            continue
        if obj.get("from") == "supervisor":
            rows.append(obj)
lines = ["# Supervisor Feedback (Final)", "", f"- Generated: {now_iso}", ""]
if not rows:
    lines.append("- No supervisor commands were recorded for this run.")
else:
    for item in rows:
        ts = item.get("ts", "unknown")
        payload = (item.get("payload_text") or "").strip()
        lines.append(f"## [{ts}] Command `{item.get('command', 'unknown')}`")
        if payload:
            lines.append(payload)
        else:
            lines.append("- Empty payload.")
        lines.append("")
pathlib.Path(out_file).write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
PY

  python3 - "$COORD_EVENTS_FILE" "$WORKER_HEARTBEAT_FILE" "$now_iso" <<'PY'
import json, sys, pathlib
events_file, out_file, now_iso = sys.argv[1:4]
rows = []
p = pathlib.Path(events_file)
if p.exists():
    for raw in p.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            obj = json.loads(raw)
        except Exception:
            continue
        if obj.get("type") in {"heartbeat", "run_start", "flow_result", "branch_start", "run_end"}:
            rows.append(obj)
lines = ["# Worker Heartbeat (Final)", "", f"- Generated: {now_iso}", ""]
if not rows:
    lines.append("- No heartbeat/events were recorded for this run.")
else:
    for item in rows:
        ts = item.get("ts", "unknown")
        typ = item.get("type", "event")
        notes = item.get("notes") or item.get("note") or ""
        lines.append(f"- [{ts}] `{typ}` {notes}".rstrip())
pathlib.Path(out_file).write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
PY

  {
    echo "# QA System Improvements (Final)"
    echo
    echo "- Generated: $now_iso"
    echo "- Run dir: $RUN_DIR"
    echo "- Session bus: $SESSION_COORD_DIR"
    echo "- Improvement: communication/control plane is bus-first (JSONL), markdown generated post-run only."
  } >"$SYSTEM_IMPROVEMENTS_FILE"
}

parse_ps_cpu_seconds() {
  local raw="$1"
  raw="${raw//[[:space:]]/}"
  if [[ -z "$raw" ]]; then
    echo 0
    return
  fi

  local days=0
  local rest="$raw"
  if [[ "$rest" == *-* ]]; then
    days="${rest%%-*}"
    rest="${rest#*-}"
  fi

  if [[ "$rest" == *.* && "$rest" != *:* ]]; then
    echo "${rest%%.*}"
    return
  fi

  IFS=':' read -r -a parts <<< "$rest"
  local h=0
  local m=0
  local s=0
  if (( ${#parts[@]} == 3 )); then
    h="${parts[0]}"
    m="${parts[1]}"
    s="${parts[2]}"
  elif (( ${#parts[@]} == 2 )); then
    m="${parts[0]}"
    s="${parts[1]}"
  elif (( ${#parts[@]} == 1 )); then
    s="${parts[0]}"
  fi

  h="${h%%.*}"
  m="${m%%.*}"
  s="${s%%.*}"

  echo $(( days * 86400 + h * 3600 + m * 60 + s ))
}

attempt=0
tls_retry_count=0
dns_retry_count=0
append_coord_event "run_start" "ok" "Runner started"
while (( attempt <= MAX_RESTARTS )); do
  if (( attempt > 0 )); then
    echo "Watchdog restart attempt $attempt/$MAX_RESTARTS at $(date)" | tee -a "$LOG_FILE"
    append_coord_event "watchdog_restart" "warning" "Restart attempt $attempt of $MAX_RESTARTS"
  fi

  if (( ${#AGENT_PREFIX_CMD[@]} > 0 )); then
    "${AGENT_PREFIX_CMD[@]}" "${AGENT_ENV_PREFIX[@]}" agent "${AGENT_ARGS[@]}" \
      >>"$AGENT_OUTPUT_FILE" 2>&1 &
  else
    "${AGENT_ENV_PREFIX[@]}" agent "${AGENT_ARGS[@]}" \
      >>"$AGENT_OUTPUT_FILE" 2>&1 &
  fi
  AGENT_PID=$!

  TAIL_PID=""
  if [[ "$ENABLE_LIVE_STREAM" == "1" && "$HUMAN_STREAM_FILTER" == "1" && "$OUTPUT_FORMAT" == "stream-json" ]]; then
    tail -n 0 -f "$AGENT_OUTPUT_FILE" \
      | python3 -c 'import json,sys
for line in sys.stdin:
    s=line.strip()
    if not s:
        continue
    try:
        obj=json.loads(s)
    except Exception:
        continue
    t=obj.get("type")
    if t=="assistant":
        msg=obj.get("message",{})
        for c in msg.get("content",[]):
            txt=c.get("text")
            if txt:
                print(txt, end="", flush=True)
    elif t=="tool_call":
        tool=obj.get("name","tool")
        print(f"\n[tool] {tool}", flush=True)
    elif t=="tool_result":
        print("\n[tool-result]", flush=True)
    elif t=="result":
        print("\n\n[run-complete]", flush=True)
' | tee -a "$LOG_FILE" &
    TAIL_PID=$!
  elif [[ "$ENABLE_LIVE_STREAM" == "1" ]]; then
    tail -n 0 -f "$AGENT_OUTPUT_FILE" | tee -a "$LOG_FILE" &
    TAIL_PID=$!
  fi

  last_size="$(stat -f%z "$AGENT_OUTPUT_FILE" 2>/dev/null || echo 0)"
  last_change_epoch="$(date +%s)"
  started_epoch="$(date +%s)"
  last_heartbeat_epoch="$started_epoch"
  last_supervisor_epoch="$started_epoch"
  last_cpu_active_epoch="$started_epoch"
  last_cpu_seconds=0
  if command -v ps >/dev/null 2>&1; then
    last_cpu_seconds="$(parse_ps_cpu_seconds "$(ps -p "$AGENT_PID" -o time= 2>/dev/null || echo 0)")"
  fi
  stalled=0
  timed_out=0
  command_sla_violation=0
  tls_transient_failure=0
  dns_resolution_failure=0

  while kill -0 "$AGENT_PID" >/dev/null 2>&1; do
    sleep "$POLL_INTERVAL_SECONDS"
    now_epoch="$(date +%s)"

    set +e
    command_sla_payload="$(check_command_ack_sla)"
    command_sla_status=$?
    set -e
    if (( command_sla_status == 2 )); then
      command_sla_violation=1
      echo "Runner: worker missed command ack SLA; terminating worker (payload=$command_sla_payload)" | tee -a "$LOG_FILE"
      append_coord_event "command_sla_violation" "error" "$command_sla_payload"
      update_coord_state "terminated_for_noncompliance" "idle" "$(( now_epoch - started_epoch ))" "$last_size"
      stop_worker_process "$AGENT_PID"
      break
    fi

    if (( now_epoch - started_epoch >= MAX_RUN_SECONDS )); then
      timed_out=1
      echo "Watchdog: max runtime ${MAX_RUN_SECONDS}s reached, restarting run..." | tee -a "$LOG_FILE"
      append_coord_event "max_runtime" "warning" "Max runtime reached; restarting"
      stop_worker_process "$AGENT_PID"
      break
    fi

    if is_tls_eproto_error_present "$AGENT_OUTPUT_FILE"; then
      tls_transient_failure=1
      echo "Runner: detected transient TLS EPROTO handshake failure; restarting worker..." | tee -a "$LOG_FILE"
      append_coord_event "tls_eproto_detected" "warning" "Detected TLS EPROTO packet length error; restarting worker"
      update_coord_state "restarting_tls_error" "idle" "$(( now_epoch - started_epoch ))" "$last_size"
      stop_worker_process "$AGENT_PID"
      break
    fi

    if is_dns_enotfound_error_present "$AGENT_OUTPUT_FILE"; then
      dns_resolution_failure=1
      echo "Runner: detected DNS ENOTFOUND for api2.cursor.sh; restarting worker..." | tee -a "$LOG_FILE"
      append_coord_event "dns_enotfound_detected" "warning" "Detected DNS ENOTFOUND for api2.cursor.sh; restarting worker"
      update_coord_state "restarting_dns_error" "idle" "$(( now_epoch - started_epoch ))" "$last_size"
      stop_worker_process "$AGENT_PID"
      break
    fi

    if (( now_epoch - last_heartbeat_epoch >= 60 )); then
      echo "Runner heartbeat: elapsed=$(( now_epoch - started_epoch ))s, agent_output_bytes=$last_size" | tee -a "$LOG_FILE"
      {
        echo
        echo "## [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Runner Heartbeat"
        echo "- elapsed_seconds: $(( now_epoch - started_epoch ))"
        echo "- agent_output_bytes: $last_size"
        echo "- run_dir: $RUN_DIR"
      } >>"$WORKER_HEARTBEAT_FILE"
      append_coord_event "heartbeat" "ok" "elapsed=$(( now_epoch - started_epoch ))s bytes=$last_size"
      update_coord_state "running" "idle" "$(( now_epoch - started_epoch ))" "$last_size"
      last_heartbeat_epoch="$now_epoch"
    fi

    if [[ "$ENABLE_SUPERVISOR_AGENT" == "1" && $(( now_epoch - last_supervisor_epoch )) -ge $SUPERVISOR_INTERVAL_SECONDS ]]; then
      echo "Supervisor: running verifier pass..." | tee -a "$LOG_FILE"
      append_coord_event "supervisor_pass_start" "ok" "Running verifier pass"
      run_supervisor_pass "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      last_supervisor_epoch="$now_epoch"
      echo "Supervisor: verifier pass complete." | tee -a "$LOG_FILE"
      append_coord_event "supervisor_pass_complete" "ok" "Verifier pass complete"
      update_coord_state "running" "pass_complete" "$(( now_epoch - started_epoch ))" "$last_size"
    fi

    current_size="$(stat -f%z "$AGENT_OUTPUT_FILE" 2>/dev/null || echo "$last_size")"
    if [[ "$current_size" != "$last_size" ]]; then
      last_size="$current_size"
      last_change_epoch="$now_epoch"
      last_cpu_active_epoch="$now_epoch"
      continue
    fi

    if command -v ps >/dev/null 2>&1; then
      cpu_seconds_now="$(parse_ps_cpu_seconds "$(ps -p "$AGENT_PID" -o time= 2>/dev/null || echo "$last_cpu_seconds")")"
      if (( cpu_seconds_now > last_cpu_seconds )); then
        last_cpu_seconds="$cpu_seconds_now"
        last_cpu_active_epoch="$now_epoch"
      fi
    fi

    if (( STALL_TIMEOUT_SECONDS > 0 && now_epoch - last_change_epoch >= STALL_TIMEOUT_SECONDS )); then
      if (( now_epoch - last_cpu_active_epoch < CPU_ACTIVITY_GRACE_SECONDS )); then
        echo "Watchdog: sparse output but process still active; extending grace window..." | tee -a "$LOG_FILE"
        last_change_epoch="$now_epoch"
        continue
      fi
      stalled=1
      echo "Watchdog: no new output for ${STALL_TIMEOUT_SECONDS}s, restarting run..." | tee -a "$LOG_FILE"
      append_coord_event "watchdog_stall" "warning" "No output detected; restarting"
      stop_worker_process "$AGENT_PID"
      break
    fi
  done

  stop_stream_tail "$TAIL_PID"

  if (( stalled == 1 )); then
    if (( attempt < MAX_RESTARTS )); then
      attempt=$(( attempt + 1 ))
      continue
    fi
    echo "Argent audit failed: watchdog restart limit reached." | tee -a "$LOG_FILE"
    append_coord_event "run_end" "error" "Failed: watchdog restart limit reached"
    update_coord_state "failed" "idle" 0 0
    exit 1
  fi

  if (( timed_out == 1 )); then
    if (( attempt < MAX_RESTARTS )); then
      attempt=$(( attempt + 1 ))
      continue
    fi
    echo "Argent audit failed: max runtime restart limit reached." | tee -a "$LOG_FILE"
    append_coord_event "run_end" "error" "Failed: max runtime restart limit reached"
    update_coord_state "failed" "idle" 0 0
    exit 1
  fi

  if (( command_sla_violation == 1 )); then
    echo "Argent audit failed: command ack SLA violation; stopping run cleanly." | tee -a "$LOG_FILE"
    append_coord_event "run_end" "error" "Failed: command ack SLA violation"
    update_coord_state "failed_noncompliance" "idle" "$(( now_epoch - started_epoch ))" "$last_size"
    materialize_final_markdown_outputs
    exit 1
  fi

  if (( tls_transient_failure == 1 )); then
    tls_retry_count=$(( tls_retry_count + 1 ))
    if [[ "$AGENT_PROXY_MODE" == "auto" ]]; then
      if [[ "$current_agent_proxy_mode" == "direct" ]]; then
        apply_agent_proxy_mode "inherited"
      else
        apply_agent_proxy_mode "direct"
      fi
      echo "Runner: switched agent proxy mode to $current_agent_proxy_mode after TLS failure." | tee -a "$LOG_FILE"
      append_coord_event "proxy_mode_switch" "warning" "Switched agent proxy mode to $current_agent_proxy_mode after TLS EPROTO"
    fi
    if (( tls_retry_count <= MAX_TLS_RETRIES )); then
      echo "Runner: TLS retry $tls_retry_count/$MAX_TLS_RETRIES after ${TLS_RETRY_BACKOFF_SECONDS}s backoff." | tee -a "$LOG_FILE"
      append_coord_event "tls_retry" "warning" "Retry $tls_retry_count of $MAX_TLS_RETRIES after TLS EPROTO"
      sleep "$TLS_RETRY_BACKOFF_SECONDS"
      attempt=$(( attempt + 1 ))
      if (( attempt <= MAX_RESTARTS )); then
        continue
      fi
      attempt=$MAX_RESTARTS
      continue
    fi
    echo "Argent audit failed: TLS EPROTO retry budget exhausted." | tee -a "$LOG_FILE"
    append_coord_event "run_end" "error" "Failed: TLS EPROTO retry budget exhausted"
    update_coord_state "failed_tls_eproto" "idle" 0 0
    exit 1
  fi

  if (( dns_resolution_failure == 1 )); then
    dns_retry_count=$(( dns_retry_count + 1 ))
    if [[ "$AGENT_PROXY_MODE" == "auto" ]]; then
      if [[ "$current_agent_proxy_mode" == "direct" ]]; then
        apply_agent_proxy_mode "inherited"
      else
        apply_agent_proxy_mode "direct"
      fi
      echo "Runner: switched agent proxy mode to $current_agent_proxy_mode after DNS failure." | tee -a "$LOG_FILE"
      append_coord_event "proxy_mode_switch" "warning" "Switched agent proxy mode to $current_agent_proxy_mode after DNS ENOTFOUND"
    fi
    if (( dns_retry_count <= MAX_DNS_RETRIES )); then
      echo "Runner: DNS retry $dns_retry_count/$MAX_DNS_RETRIES after ${TLS_RETRY_BACKOFF_SECONDS}s backoff." | tee -a "$LOG_FILE"
      append_coord_event "dns_retry" "warning" "Retry $dns_retry_count of $MAX_DNS_RETRIES after DNS ENOTFOUND"
      sleep "$TLS_RETRY_BACKOFF_SECONDS"
      attempt=$(( attempt + 1 ))
      if (( attempt <= MAX_RESTARTS )); then
        continue
      fi
      attempt=$MAX_RESTARTS
      continue
    fi
    echo "Argent audit failed: DNS ENOTFOUND retry budget exhausted." | tee -a "$LOG_FILE"
    append_coord_event "run_end" "error" "Failed: DNS ENOTFOUND retry budget exhausted"
    update_coord_state "failed_dns_enotfound" "idle" 0 0
    exit 1
  fi

  wait "$AGENT_PID"
  AGENT_EXIT=$?
  if (( AGENT_EXIT == 0 )); then
    materialize_final_markdown_outputs

    actions_artifact="$(locate_artifact "actions-$TS.md" "actions-$TS.md")"
    issues_artifact="$(locate_artifact "issues-$TS.md" "issues-$TS.md")"
    nightly_artifact="$(locate_artifact "nightly-$TS.md" "nightly-$TS.md")"
    profile_artifact="$(locate_artifact "profile-summary-$TS.md" "profiling/profile-summary-$TS.md")"

    missing_artifacts=0
    for artifact in "$actions_artifact" "$issues_artifact" "$nightly_artifact" "$profile_artifact"; do
      if [[ -z "$artifact" || ! -s "$artifact" ]]; then
        missing_artifacts=1
      fi
    done

    if [[ ! -s "$WORKER_HEARTBEAT_FILE" ]]; then
      missing_artifacts=1
    fi
    if [[ ! -s "$SUPERVISOR_FEEDBACK_FILE" ]]; then
      missing_artifacts=1
    fi

    review_file="$(write_nightly_review "$actions_artifact" "$issues_artifact" "$nightly_artifact" "$profile_artifact")"

    if (( missing_artifacts == 1 )); then
      echo "Argent audit failed: completion gates not met (missing or empty required outputs)." | tee -a "$LOG_FILE"
      echo "Nightly review file: $review_file" | tee -a "$LOG_FILE"
      append_coord_event "run_end" "error" "Failed: completion gates not met"
      update_coord_state "failed" "idle" 0 0
      exit 1
    fi

    echo "Argent audit run complete."
    echo "Nightly review file: $review_file"
    {
      echo "Argent audit run complete."
      echo "Nightly review file: $review_file"
    } >>"$LOG_FILE"
    append_coord_event "run_end" "ok" "Run complete"
    update_coord_state "complete" "idle" 0 0

    cleanup_working_files
    exit 0
  fi

  echo "Argent audit exited with code $AGENT_EXIT." | tee -a "$LOG_FILE"
  append_coord_event "worker_exit" "warning" "Worker exited with code $AGENT_EXIT"
  if is_tls_eproto_error_present "$AGENT_OUTPUT_FILE"; then
    tls_retry_count=$(( tls_retry_count + 1 ))
    if [[ "$AGENT_PROXY_MODE" == "auto" ]]; then
      if [[ "$current_agent_proxy_mode" == "direct" ]]; then
        apply_agent_proxy_mode "inherited"
      else
        apply_agent_proxy_mode "direct"
      fi
      echo "Runner: switched agent proxy mode to $current_agent_proxy_mode after TLS worker exit." | tee -a "$LOG_FILE"
      append_coord_event "proxy_mode_switch" "warning" "Switched agent proxy mode to $current_agent_proxy_mode after TLS EPROTO on worker exit"
    fi
    if (( tls_retry_count <= MAX_TLS_RETRIES )); then
      echo "Runner: worker exit tied to TLS EPROTO; retry $tls_retry_count/$MAX_TLS_RETRIES after ${TLS_RETRY_BACKOFF_SECONDS}s." | tee -a "$LOG_FILE"
      append_coord_event "tls_retry" "warning" "Worker exited on TLS EPROTO; retry $tls_retry_count of $MAX_TLS_RETRIES"
      sleep "$TLS_RETRY_BACKOFF_SECONDS"
      if (( attempt < MAX_RESTARTS )); then
        attempt=$(( attempt + 1 ))
        continue
      fi
    else
      echo "Argent audit failed: TLS EPROTO retry budget exhausted after worker exit." | tee -a "$LOG_FILE"
      append_coord_event "run_end" "error" "Failed: TLS EPROTO retry budget exhausted after worker exit"
      update_coord_state "failed_tls_eproto" "idle" 0 0
      exit 1
    fi
  fi
  if is_dns_enotfound_error_present "$AGENT_OUTPUT_FILE"; then
    dns_retry_count=$(( dns_retry_count + 1 ))
    if [[ "$AGENT_PROXY_MODE" == "auto" ]]; then
      if [[ "$current_agent_proxy_mode" == "direct" ]]; then
        apply_agent_proxy_mode "inherited"
      else
        apply_agent_proxy_mode "direct"
      fi
      echo "Runner: switched agent proxy mode to $current_agent_proxy_mode after DNS worker exit." | tee -a "$LOG_FILE"
      append_coord_event "proxy_mode_switch" "warning" "Switched agent proxy mode to $current_agent_proxy_mode after DNS ENOTFOUND on worker exit"
    fi
    if (( dns_retry_count <= MAX_DNS_RETRIES )); then
      echo "Runner: worker exit tied to DNS ENOTFOUND; retry $dns_retry_count/$MAX_DNS_RETRIES after ${TLS_RETRY_BACKOFF_SECONDS}s." | tee -a "$LOG_FILE"
      append_coord_event "dns_retry" "warning" "Worker exited on DNS ENOTFOUND; retry $dns_retry_count of $MAX_DNS_RETRIES"
      sleep "$TLS_RETRY_BACKOFF_SECONDS"
      if (( attempt < MAX_RESTARTS )); then
        attempt=$(( attempt + 1 ))
        continue
      fi
    else
      echo "Argent audit failed: DNS ENOTFOUND retry budget exhausted after worker exit." | tee -a "$LOG_FILE"
      append_coord_event "run_end" "error" "Failed: DNS ENOTFOUND retry budget exhausted after worker exit"
      update_coord_state "failed_dns_enotfound" "idle" 0 0
      exit 1
    fi
  fi
  if (( attempt < MAX_RESTARTS )); then
    attempt=$(( attempt + 1 ))
    continue
  fi
  exit "$AGENT_EXIT"
done
