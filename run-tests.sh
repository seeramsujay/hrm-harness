#!/usr/bin/env bash
node --experimental-strip-types --test \
  packages/tree-sitter/test/tree-sitter.test.ts \
  packages/hrm-validator/test/validator.test.ts \
  packages/acp-bridge/test/acp-bridge.test.ts \
  packages/mcp-docstuff/test/docstuff.test.ts \
  packages/hrm-cli/test/cli.test.ts \
  tests/integration.test.ts "$@"
