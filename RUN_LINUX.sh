#!/bin/sh
cd "$(dirname "$0")" || exit 1
if [ ! -f server/.env ]; then echo 'Copy server/.env.example to server/.env and set credentials.'; exit 1; fi
npm install && npm run dev
