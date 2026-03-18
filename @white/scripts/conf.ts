#!/usr/bin/env bun

import * as config from '../../src/config'

const arg = process.argv[2]

if (!arg) {
  console.log('Usage: bun scripts/config.ts <config_key>')
  console.log('Available config keys:')
  Object.keys(config).forEach((key) => {
    console.log(`  ${key}`)
  })
  process.exit(1)
}

if (arg in config) {
  // Use process.stdout.write to avoid color formatting when used in command substitution
  process.stdout.write(String(config[arg as keyof typeof config]))
} else {
  console.error(`Config key "${arg}" not found`)
  console.log('Available config keys:')
  Object.keys(config).forEach((key) => {
    console.log(`  ${key}`)
  })
  process.exit(1)
}
