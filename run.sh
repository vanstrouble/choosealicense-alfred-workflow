#!/bin/bash

# Path to the JS script relative to this shell script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
JS_SCRIPT="$SCRIPT_DIR/script_filter.js"

# Run the Node script with the Alfred query
/usr/bin/env node "$JS_SCRIPT" "$1"
