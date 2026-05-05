# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Chat Collapser is a Chrome browser extension that adds collapse/expand functionality to AI chat messages on ChatGPT, Claude, and Gemini platforms. It uses a content script to inject UI elements and persist state via Chrome storage API.

## Architecture

The extension consists of three main files:
- `manifest.json`: Chrome extension manifest v3 configuration
- `content.js`: Main content script that injects collapse/expand functionality (765 lines)
- `styles.css`: CSS styles for the injected UI elements with light/dark mode support (595 lines)

The content script uses a MutationObserver to detect new messages and platform-specific selectors to identify user vs AI messages across different chat platforms.

## Testing

There is no test suite in this project. When making changes, manually test on all supported platforms:
- ChatGPT (chatgpt.com, chat.openai.com)
- Claude (claude.ai)
- Gemini (gemini.google.com)

## Development

To load the extension for development:
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the project folder

To test changes:
1. Make code changes
2. Click the refresh button on the extension card in chrome://extensions/
3. Reload the target chat platform page

## Key Implementation Details

- Platform detection uses hostname matching via regex patterns
- Message identification uses multiple fallback selectors for each platform
- State persistence uses chrome.storage.local API with message content hashing
- The extension includes a TOC sidebar for navigating user prompts
- UI uses glassmorphism design with CSS custom properties for theming