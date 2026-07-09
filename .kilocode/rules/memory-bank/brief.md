# Project Brief: Next.js Starter Template

## Purpose

This project is a **Magic Deploy Wizard** — a self-hosted, no-code deployment service (like Vercel /
Railway / Coolify) built on a Next.js 16 starter. It clones any Git repo, detects the stack with
nixpacks, builds a Docker image, and routes it behind Traefik with automatic TLS. Includes AI
auto-fix of failures and a Coolify API CLI.

## Target Users

- Developers wanting a clean Next.js starting point
- Users building applications through AI-assisted coding
- Teams needing a standardized, modern Next.js setup

## Core Use Case

Users describe what they want to build to an AI assistant, which then expands this template by:

1. Adding components and pages as needed
2. Installing additional dependencies
3. Setting up databases, authentication, etc. using recipes
4. Customizing styling and branding

## Key Requirements

### Must Have

- Modern Next.js 16 setup with App Router
- TypeScript for type safety
- Tailwind CSS 4 for styling
- ESLint for code quality
- Clean, minimal starting structure
- Bun as package manager

### Nice to Have

- Recipe system for common additions (database, auth)
- Memory bank for AI context persistence
- Clear development guidelines

## Success Metrics

- Clean, zero-error TypeScript setup
- Passing lint and type checks

## Constraints

- Minimal dependencies by default
- Framework: Next.js 16 + React 19 + Tailwind CSS 4
- Package manager: Bun
