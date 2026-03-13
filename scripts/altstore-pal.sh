#!/usr/bin/env bash
# AltStore PAL setup script — automates terminal steps for EU/Japan distribution.
# Step 1 (agree to terms) is assumed done. Step 3 (add marketplace) must be done in App Store Connect.

set -e

# Developer ID is from App Store Connect → your name → Edit Profile → under team name (NOT the 10-char Team ID)
DEVELOPER_ID="${ALTSTORE_DEVELOPER_ID:-}"
API_BASE="https://api.altstore.io"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

usage() {
  echo "Usage: $0 <command> [options]"
  echo ""
  echo "Commands:"
  echo "  register [email]                Register with AltStore (prompts for Developer ID)"
  echo "  register <developer-id> <email> Or pass both explicitly"
  echo "  process <adp-id>                 Process an ADP for AltStore PAL"
  echo "  status <adp-id>                  Check ADP processing status"
  echo "  download <adp-id> [output-dir]   Download ADP when ready"
  echo ""
  echo "Developer ID: From App Store Connect → your name (top right) → Edit Profile → under team name."
  echo "  Not the 10-char Team ID. Set ALTSTORE_DEVELOPER_ID or pass as first arg to register."
  echo ""
  echo "Step 3 must be done manually: Add AltStore PAL in App Store Connect with the token from 'register'"
  exit 1
}

cmd_register() {
  local arg1="${1:-$DEVELOPER_ID}"
  local arg2="${2:-}"
  local developer_id email
  # If single arg contains @, it's email; otherwise developer_id. Two args = developer_id, email.
  if [[ -n "$arg2" ]]; then
    developer_id="$arg1"
    email="$arg2"
  elif [[ "$arg1" == *"@"* ]]; then
    email="$arg1"
    developer_id=""
  else
    developer_id="$arg1"
    email=""
  fi
  if [[ -z "$developer_id" ]]; then
    echo "Get your Developer ID from: App Store Connect → your name → Edit Profile → under team name"
    echo "(This is NOT the 10-character Team ID like D8VXFBV8SJ)"
    echo ""
    echo -n "Enter your Developer ID: "
    read -r developer_id
  fi
  if [[ -z "$email" ]]; then
    echo -n "Enter your email: "
    read -r email
  fi
  echo -e "${YELLOW}Registering Developer ID with AltStore...${NC}"
  response=$(curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"developerID\": \"$developer_id\", \"email\": \"$email\"}" \
    "$API_BASE/register")
  if echo "$response" | grep -q '"token"'; then
    token=$(echo "$response" | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    echo ""
    echo -e "${GREEN}Success! Save this token and add AltStore PAL in App Store Connect:${NC}"
    echo ""
    echo "  Token: $token"
    echo ""
    echo "  → Users and Access → Integrations → Marketplace → Add (+) → paste token"
    echo "  → Select Orbyt for distribution"
  else
    echo -e "${RED}Registration failed:${NC}"
    echo "$response"
    exit 1
  fi
}

cmd_process() {
  local adp_id="${1:-}"
  if [[ -z "$adp_id" ]]; then
    echo "Usage: $0 process <adp-id>"
    echo "Get ADP ID from: App Store Connect → Apps → Orbyt → Distribution → History"
    exit 1
  fi
  echo -e "${YELLOW}Processing ADP $adp_id...${NC}"
  curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"adpID\": \"$adp_id\"}" \
    "$API_BASE/adps"
  echo ""
  echo -e "${GREEN}Processing started. Run: $0 status $adp_id${NC}"
}

cmd_status() {
  local adp_id="${1:-}"
  if [[ -z "$adp_id" ]]; then
    echo "Usage: $0 status <adp-id>"
    exit 1
  fi
  response=$(curl -s -X GET "$API_BASE/adps/$adp_id")
  echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
  if echo "$response" | grep -q '"downloadURL"'; then
    url=$(echo "$response" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('downloadURL',''))" 2>/dev/null)
    echo ""
    echo -e "${GREEN}Ready! Download: $url${NC}"
    echo "Or run: $0 download $adp_id"
  fi
}

cmd_download() {
  local adp_id="${1:-}"
  local out_dir="${2:-.}"
  if [[ -z "$adp_id" ]]; then
    echo "Usage: $0 download <adp-id> [output-dir]"
    exit 1
  fi
  response=$(curl -s -X GET "$API_BASE/adps/$adp_id")
  url=$(echo "$response" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('downloadURL',''))" 2>/dev/null)
  if [[ -z "$url" ]]; then
    echo -e "${RED}ADP not ready yet. Status:${NC}"
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    exit 1
  fi
  mkdir -p "$out_dir"
  out_file="$out_dir/orbyt-adp-$adp_id.zip"
  echo -e "${YELLOW}Downloading to $out_file...${NC}"
  # Use Python to avoid curl's URL parsing issues with complex query strings (e.g. timestamps with colons)
  # Stream with progress; 10min timeout; ADP packages can be 100MB+
  python3 -c "
import urllib.request
import sys

req = urllib.request.Request(sys.argv[1], headers={'User-Agent': 'AltStore-PAL-Script/1.0'})
with urllib.request.urlopen(req, timeout=600) as resp:
    total = int(resp.headers.get('Content-Length', 0))
    total_mb = total / (1024*1024) if total else 0
    downloaded = 0
    chunk = 256 * 1024  # 256KB
    with open(sys.argv[2], 'wb') as f:
        while True:
            data = resp.read(chunk)
            if not data:
                break
            f.write(data)
            downloaded += len(data)
            if total > 0:
                pct = min(100, downloaded * 100 // total)
                mb = downloaded / (1024*1024)
                sys.stderr.write(f'\r  {mb:.1f} / {total_mb:.1f} MB ({pct}%)  ')
                sys.stderr.flush()
sys.stderr.write('\n')
" "$url" "$out_file"
  echo -e "${GREEN}Downloaded: $out_file${NC}"
}

cmd_full() {
  local arg1="${1:-}" arg2="${2:-}" arg3="${3:-}"
  local developer_id email adp_id
  if [[ -n "$arg3" ]]; then
    developer_id="$arg1"
    email="$arg2"
    adp_id="$arg3"
  elif [[ -n "$arg2" ]]; then
    email="$arg1"
    adp_id="$arg2"
  else
    echo "Usage: $0 full <email> <adp-id>"
    echo "   or: $0 full <developer-id> <email> <adp-id>"
    exit 1
  fi
  cmd_register "$developer_id" "$email"
  echo ""
  echo -e "${YELLOW}After adding AltStore PAL in App Store Connect (Step 3), press Enter to continue...${NC}"
  read -r
  cmd_process "$adp_id"
  echo ""
  echo -e "${YELLOW}Polling for completion (every 15s)...${NC}"
  while true; do
    sleep 15
    response=$(curl -s -X GET "$API_BASE/adps/$adp_id")
    if echo "$response" | grep -q '"downloadURL"'; then
      echo -e "${GREEN}ADP ready!${NC}"
      cmd_download "$adp_id"
      break
    fi
    echo "  Still processing..."
  done
}

case "${1:-}" in
  register) cmd_register "${2:-}" "${3:-}" ;;
  process)  cmd_process "${2:-}" ;;
  status)   cmd_status "${2:-}" ;;
  download) cmd_download "${2:-}" "${3:-.}" ;;
  full)     cmd_full "${2:-}" "${3:-}" "${4:-}" ;;
  *)        usage ;;
esac
