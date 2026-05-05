# AGENTS.md

## Project

AI Chat Collapser - Chrome extension (Manifest V3) that adds collapse/expand to AI messages on ChatGPT, Claude, and Gemini. Three files, no build system, no dependencies.

## Development

- **No build step** - edit files directly
- **Load**: `chrome://extensions/` → Developer mode → Load unpacked → project folder
- **Test changes**: refresh extension card in `chrome://extensions/` → reload the page

## Testing

- **No test suite** - manual testing only
- Must verify on all 3 platforms after changes:
  - ChatGPT (`chatgpt.com`, `chat.openai.com`)
  - Claude (`claude.ai`)
  - Gemini (`gemini.google.com`)

## Architecture

- `manifest.json` - extension config, content script injection at `document_idle`
- `content.js` - core logic (~1,450 lines): MutationObserver (debounced) for streaming, platform detection via hostname regex, message selectors with fallbacks per platform, chrome.storage.local persistence with content hashing, bookmarking feature with deep linking (URL hash `#acc_bookmark=...` encodes message hash, scroll position, message index, conversation ID for navigation), lazy-loading scroll handling per platform, TOC sidebar with tab navigation (TOC/Saved)
- `styles.css` - injected UI styles, glassmorphism theme, CSS custom properties for light/dark mode

## Critical Conventions

- Platform-specific selectors use multiple fallbacks per platform - preserve all fallbacks when editing
- MutationObserver is debounced to handle streaming responses - do not remove debounce
- State keys in chrome.storage.local are based on message content hashes - avoid changing hash logic without testing persistence across reloads
