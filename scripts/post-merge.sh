#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Schema changes must be reviewed and applied separately to an explicit database.
# A merge must never implicitly modify the database selected by DATABASE_URL.
