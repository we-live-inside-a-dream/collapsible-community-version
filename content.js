/**
 * AI Chat Collapser — Content Script
 *
 * This script uses a MutationObserver to watch the DOM for new message
 * bubbles on ChatGPT, Claude, and Gemini. When a new message is detected,
 * it injects a collapse/expand button into the message container.
 *
 * HOW THE MUTATIONOBSERVER WORKS:
 * ───────────────────────────────
 * 1. We observe the entire <body> (or a tighter container once found)
 *    for `childList` changes with `subtree: true`.
 * 2. Every time nodes are added (new messages, streamed tokens, page
 *    navigation), the observer fires and we scan for un-processed
 *    message elements using a data-attribute flag (`data-acc-processed`).
 * 3. This means buttons appear on:
 *    - Messages already in the DOM when the page loads
 *    - Messages added during streaming (long responses)
 *    - Messages revealed by scrolling / navigation in conversation history
 * 4. We debounce processing to avoid hammering the DOM during rapid
 *    streaming (tokens arriving every ~50ms).
 */

(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────
  // PLATFORM SELECTORS
  //
  // Each platform uses different DOM structures. Update these
  // selectors if the site UI changes. The extension will auto-
  // detect which platform you're on and use the right config.
  //
  // Structure of each config:
  //   messageSelector — CSS selector that matches each message turn/bubble.
  //   roleDetector(el) — returns "user" | "assistant" | "unknown".
  //   bodySelector — selector for the inner content area (what gets collapsed).
  //                  If null, we wrap all child nodes automatically.
  // ─────────────────────────────────────────────────────────
  const PLATFORM_CONFIGS = {
    chatgpt: {
      hostPattern: /chat\.openai\.com|chatgpt\.com/,
      // Each conversation turn is wrapped in an article or a div with data-testid
      messageSelector: [
        'article[data-testid^="conversation-turn"]',  // common structure
        '[data-message-author-role]',                  // per-message role attr
        'div.group\\/conversation-turn',               // newer class-based layout
      ].join(", "),
      roleDetector(el) {
        // Check data attributes first
        const role = el.getAttribute("data-message-author-role");
        if (role === "user") return "user";
        if (role === "assistant") return "assistant";
        // Fallback: check for "user" or "assistant" in data-testid
        const testId = el.getAttribute("data-testid") || "";
        if (testId.includes("user")) return "user";
        if (testId.includes("assistant")) return "assistant";
        // Fallback: scan inner text of role label
        const label = el.querySelector('[data-message-author-role]');
        if (label) return label.getAttribute("data-message-author-role") === "user" ? "user" : "assistant";
        return "unknown";
      },
      // The prose/markdown content area inside each message
      bodySelector: ".markdown, .whitespace-pre-wrap, .message-content",
      // Best-effort selector for user prompt text (used for TOC label)
      promptBodySelector: '[data-testid="user-prompt-text"], .whitespace-pre-wrap, .markdown, .prose',
    },

    claude: {
      hostPattern: /claude\.ai/,
      // Claude uses data-testid hooks for message roles (has changed over time).
      // We include multiple fallbacks to keep this resilient.
      messageSelector: [
        '[data-testid="human-message"]',
        '[data-testid="message-human"]',
        '[data-testid="user-message"]',
        '.user-message',
        '.font-user-message',
        '[data-testid="ai-message"]',
        '[data-testid="message-assistant"]',
        '.assistant-message',
        '.font-claude-response',
        // Older layout fallback
        'div[class*="grid-rows-[auto_auto]"]',
      ].join(", "),
      roleDetector(el) {
        // Prefer explicit role hooks or classes on the element or its children
        if (
          el.matches('[data-testid*="user"], [data-testid*="human"], .user-message, .font-user-message') ||
          el.querySelector('[data-testid*="user"], [data-testid*="human"], .user-message, .font-user-message')
        ) {
          return "user";
        }
        if (
          el.matches('[data-testid*="ai"], [data-testid*="assistant"], .assistant-message, .font-claude-response') ||
          el.querySelector('[data-testid*="ai"], [data-testid*="assistant"], .assistant-message, .font-claude-response') ||
          el.querySelector('.font-claude-response-body') ||
          el.querySelector('[class*="claude-response"]')
        ) {
          return "assistant";
        }

        // Heuristic fallback: assistant turns usually contain Claude progressive markdown.
        // Avoid generic .standard-markdown which might be used in user messages.
        if (el.querySelector(".progressive-markdown")) {
          return "assistant";
        }

        // Default to user
        return "user";
      },
      // Hide all direct children of the message wrapper when collapsed
      bodySelector: null,
      // Claude user prompts often render in prose/markdown-like blocks
      promptBodySelector: ".prose, [class*='prose'], [class*='markdown'], textarea",
    },

    gemini: {
      hostPattern: /gemini\.google\.com/,
      messageSelector: [
        'model-response',
        'user-query',
        'message-content',
        'div[class*="query-content"]',
        'div[class*="response-container"]',
        'div[class*="model-response"]',
        '.conversation-container > div',
      ].join(", "),
      roleDetector(el) {
        const tag = el.tagName?.toLowerCase() || "";
        const cls = el.className || "";
        const testId = el.getAttribute("data-testid") || "";
        const combined = cls + " " + testId + " " + tag;

        if (/query|user|human/i.test(combined)) return "user";
        if (/response|model|assistant/i.test(combined)) return "assistant";

        if (tag === "message-content") {
          if (el.closest('user-query, [class*="query"]')) return "user";
          return "assistant";
        }

        return "unknown";
      },
      bodySelector: '.markdown-main-panel, [class*="response-content"], .query-text',
      promptBodySelector: '.query-text, [class*="query-content"], textarea, .prose',
    },
  };

  // ─────────────────────────────────────────────────────────


  // ─────────────────────────────────────────────────────────
  // Detect which platform we're on
  // ─────────────────────────────────────────────────────────
  function detectPlatform() {
    const host = window.location.hostname;
    for (const [name, config] of Object.entries(PLATFORM_CONFIGS)) {
      if (config.hostPattern.test(host)) {
        return config;
      }
    }
    console.warn("[AI Chat Collapser] Unknown platform — using broad fallbacks.");
    // Broad fallback: tries to match any common chat container
    return {
      messageSelector:
        '[role="presentation"], [data-testid*="message"], [class*="message"], [class*="turn"]',
      roleDetector: () => "unknown",
      bodySelector: null,
    };
  }

  const platform = detectPlatform();

  // ─────────────────────────────────────────────────────────
  // State persistence via chrome.storage
  //
  // We store which messages are collapsed by a hash of their
  // text content, so state persists across page reloads.
  // ─────────────────────────────────────────────────────────
  const STORAGE_KEY = "acc_collapsed_messages";
  let collapsedSet = new Set();

  function loadState() {
    if (chrome?.storage?.local) {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        const arr = result[STORAGE_KEY] || [];
        collapsedSet = new Set(arr);
      });
    }
  }

  function saveState() {
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: [...collapsedSet] });
    }
  }

  /**
   * Scroll a message into view with smooth behavior.
   */
  function scrollToMessage(messageEl) {
    const host = window.location.hostname;

    // Gemini needs offset-based scrolling with container detection
    if (host.includes("gemini.google.com")) {
      // Find the scrollable container
      let container = document.documentElement;
      for (const el of document.querySelectorAll('div')) {
        const style = window.getComputedStyle(el);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          if (el.contains(messageEl)) {
            container = el;
            break;
          }
        }
      }

      const targetTop = messageEl.offsetTop - 100;
      container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
      return;
    }

    // ChatGPT and Claude: use scrollIntoView
    messageEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /**
   * Simple delay utility
   */
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }



  // ─────────────────────────────────────────────────────────
  // TOC (Table of Contents) — User Prompt Sidebar
  // ─────────────────────────────────────────────────────────
  const TOC_VISIBLE_KEY = "acc_toc_visible";
  const TOC_MAX_LABEL_CHARS = 50;
  let tocVisible = true;

  /** @type {HTMLElement | null} */
  let tocRoot = null;
  /** @type {HTMLButtonElement | null} */
  let tocToggleBtn = null;

  /** Ordered list of user prompt elements */
  const tocPromptEls = [];
  const tocIdByEl = new WeakMap();
  const tocItemById = new Map();
  let tocIdCounter = 0;

  /** @type {IntersectionObserver | null} */
  let tocIntersectionObserver = null;
  let tocActiveId = null;

  function loadTocVisibility() {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.get(TOC_VISIBLE_KEY, (result) => {
      const raw = result?.[TOC_VISIBLE_KEY];
      tocVisible = raw !== false; // default true
      applyTocVisibility();
    });
  }

  function saveTocVisibility() {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.set({ [TOC_VISIBLE_KEY]: tocVisible });
  }

  function applyTocVisibility() {
    if (!tocRoot || !tocToggleBtn) return;
    tocRoot.classList.toggle("acc-toc--hidden", !tocVisible);
    tocToggleBtn.classList.toggle("acc-toc-toggle--hidden", tocVisible);
  }

  // ─────────────────────────────────────────────────────────
  // TOC List Container
  // ─────────────────────────────────────────────────────────
  let tocList = null;      // TOC list container

  function ensureTocUI() {
    if (tocRoot && tocList && tocToggleBtn) return;

    tocRoot = document.createElement("aside");
    tocRoot.className = "acc-toc";
    tocRoot.setAttribute("aria-label", "Conversation table of contents");

    const header = document.createElement("div");
    header.className = "acc-toc__header";

    // Create tab navigation
    const tabsContainer = document.createElement("div");
    tabsContainer.className = "acc-toc__tabs";

    const tocTab = document.createElement("button");
    tocTab.className = "acc-toc__tab acc-toc__tab--active";
    tocTab.type = "button";
    tocTab.textContent = "TOC";

    tabsContainer.appendChild(tocTab);

    const closeBtn = document.createElement("button");
    closeBtn.className = "acc-toc__close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Hide table of contents");
    closeBtn.title = "Hide";
    closeBtn.textContent = "Hide";
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      tocVisible = false;
      saveTocVisibility();
      applyTocVisibility();
    });

    header.appendChild(tabsContainer);
    header.appendChild(closeBtn);

    // Create TOC list container
    tocList = document.createElement("div");
    tocList.className = "acc-toc__list acc-toc__list--visible";
    tocList.setAttribute("role", "list");
    tocList.dataset.list = "toc";

    tocRoot.appendChild(header);
    tocRoot.appendChild(tocList);

    document.body.appendChild(tocRoot);

    tocToggleBtn = document.createElement("button");
    tocToggleBtn.className = "acc-toc-toggle";
    tocToggleBtn.type = "button";
    tocToggleBtn.setAttribute("aria-label", "Show table of contents");
    tocToggleBtn.title = "Show TOC";
    tocToggleBtn.textContent = "TOC";
    tocToggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      tocVisible = true;
      saveTocVisibility();
      applyTocVisibility();
    });

    document.body.appendChild(tocToggleBtn);
    applyTocVisibility();

    // Create observer lazily; we’ll attach elements as they are discovered.
    if (!tocIntersectionObserver && "IntersectionObserver" in window) {
      tocIntersectionObserver = new IntersectionObserver(
        (entries) => {
          let best = null;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            if (!best) {
              best = entry;
              continue;
            }
            if (entry.intersectionRatio > best.intersectionRatio) best = entry;
          }
          if (!best) return;

          const id = tocIdByEl.get(best.target);
          if (!id) return;
          setActiveTocId(id);
        },
        {
          root: null,
          rootMargin: "-20% 0px -65% 0px",
          threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
        }
      );
    }
  }

  function setActiveTocId(id) {
    if (tocActiveId === id) return;
    if (tocActiveId && tocItemById.has(tocActiveId)) {
      tocItemById.get(tocActiveId).classList.remove("acc-toc-item--active");
    }
    tocActiveId = id;
    const btn = tocItemById.get(id);
    if (btn) btn.classList.add("acc-toc-item--active");
  }

  function getUserPromptText(messageEl) {
    const sel = platform?.promptBodySelector;
    if (sel) {
      const node = messageEl.querySelector(sel);
      const txt = (node?.textContent || "").trim();
      if (txt) return txt;
    }
    return (messageEl.textContent || "").trim();
  }

  function truncateLabel(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length <= TOC_MAX_LABEL_CHARS) return clean;
    return clean.slice(0, TOC_MAX_LABEL_CHARS).trimEnd() + "…";
  }

  function flashPrompt(el) {
    el.classList.add("acc-toc-flash");
    window.setTimeout(() => el.classList.remove("acc-toc-flash"), 650);
  }

  function addPromptToToc(messageEl) {
    if (tocIdByEl.has(messageEl)) return;

    const text = getUserPromptText(messageEl);
    if (!text) return;

    const id = `u-${++tocIdCounter}`;
    tocIdByEl.set(messageEl, id);
    tocPromptEls.push(messageEl);

    messageEl.setAttribute("data-acc-toc-id", id);
    if (!messageEl.id) messageEl.id = `acc-toc-${id}`;

    if (!tocList) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "acc-toc-item";
    btn.setAttribute("role", "listitem");
    btn.setAttribute("data-acc-toc-target", id);
    btn.title = text;
    btn.innerHTML = `<span class="acc-toc-item__label">${escapeHtml(truncateLabel(text))}</span>`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      messageEl.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveTocId(id);
      flashPrompt(messageEl);
    });

    tocItemById.set(id, btn);

    // Insert in correct position based on DOM order
    insertTocItem(btn, messageEl);

    if (tocIntersectionObserver) {
      tocIntersectionObserver.observe(messageEl);
    }
  }

  function resetTocForNewConversation() {
    tocPromptEls.length = 0;
    tocItemById.clear();
    tocIdCounter = 0;
    tocActiveId = null;

    if (tocIntersectionObserver) {
      tocIntersectionObserver.disconnect();
    }

    if (tocList) tocList.innerHTML = "";
  }

  /** Insert a TOC item in the correct position (descending order by DOM position, most recent first) */
  function insertTocItem(newBtn, newMessageEl) {
    if (!tocList) return;

    const existingButtons = tocList.querySelectorAll(".acc-toc-item");
    const newOffsetTop = newMessageEl.offsetTop;

    // DOM has oldest messages first (smaller offsetTop)
    // TOC should have most recent first, so we reverse the order
    // Insert before the first item that is OLDER (has smaller offsetTop)
    for (const btn of existingButtons) {
      const targetId = btn.getAttribute("data-acc-toc-target");
      const targetEl = document.getElementById(`acc-toc-${targetId}`);
      if (targetEl && targetEl.offsetTop < newOffsetTop) {
        tocList.insertBefore(newBtn, btn);
        return;
      }
    }

    // If not inserted before any item, this is the oldest message so far, append to end
    tocList.appendChild(newBtn);
  }

  /** Re-sort the entire TOC to ensure correct order after bulk changes */
  function resortToc() {
    if (!tocList || tocPromptEls.length === 0) return;

    // Sort messages by DOM position (offsetTop)
    const sortedMessages = [...tocPromptEls].sort((a, b) => b.offsetTop - a.offsetTop);

    // Rebuild TOC in correct order
    const fragment = document.createDocumentFragment();
    sortedMessages.forEach(msgEl => {
      const id = tocIdByEl.get(msgEl);
      if (id) {
        const btn = tocItemById.get(id);
        if (btn) {
          fragment.appendChild(btn);
        }
      }
    });

    // Clear and rebuild
    tocList.innerHTML = "";
    tocList.appendChild(fragment);
  }

  // ─────────────────────────────────────────────────────────
  // Continue on [AI] Feature
  // ─────────────────────────────────────────────────────────

  function getCurrentPlatformKey() {
    const host = window.location.hostname;
    if (/chat\.openai\.com|chatgpt\.com/.test(host)) return "chatgpt";
    if (/claude\.ai/.test(host)) return "claude";
    if (/gemini\.google\.com/.test(host)) return "gemini";
    return null;
  }

  function showToast(message, type = "success") {
    const existing = document.querySelector(".acc-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = `acc-toast acc-toast--${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("acc-toast--hiding");
      setTimeout(() => toast.remove(), 300);
}, 4000);
  }

  /** Simple hash of a string for storage keys */
  function hashText(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return "msg_" + Math.abs(hash).toString(36);
  }

  // ─────────────────────────────────────────────────────────
  // Inject collapse button into a message element
  // ─────────────────────────────────────────────────────────
  function processMessage(el) {
    // Skip if already processed
    if (el.hasAttribute("data-acc-processed")) return;

    // Prevent duplicate nested buttons: if a parent element is already a message wrapper, skip this one.
    if (el.parentElement && el.parentElement.closest('.acc-message-wrapper')) {
      el.setAttribute("data-acc-processed", "true"); // mark as processed to skip future checks
      return;
    }

    el.setAttribute("data-acc-processed", "true");

    try {
      // Detect role early
      const role = platform.roleDetector(el);

      // Add wrapper class for positioning
      el.classList.add("acc-message-wrapper");

      const roleLabel = role === "assistant" ? "AI" : "Message";

      // Find the body content area via platform-specific selector.
      // We do NOT restructure/move any existing DOM nodes — React and other
      // frameworks will throw errors if we reparent nodes they manage.
      // Instead, we just add a CSS class to the found element.
      let body = null;
      if (platform.bodySelector) {
        body = el.querySelector(platform.bodySelector);
      }

      if (body) {
        body.classList.add("acc-message-body");
      } else {
        // No specific body found — treat the whole element as the body.
        // We add a marker class so CSS can target it, but we don't move nodes.
        el.classList.add("acc-message-body-self");
      }

      // Extract preview text (first ~120 characters of visible text)
      const rawText = ((body || el).textContent || "").trim();
      const previewText = rawText.slice(0, 120) + (rawText.length > 120 ? "…" : "");

      // Build a self-contained controls container.
      // Using only appendChild (never insertBefore/prepend) for maximum
      // compatibility with framework-managed DOM trees.
      const controls = document.createElement("div");
      controls.className = "acc-controls";

      // Preview bar (shown only when collapsed)
      const preview = document.createElement("div");
      preview.className = "acc-preview";
      preview.innerHTML = `
        <span class="acc-preview-role">${roleLabel}</span>
        <span class="acc-preview-text">${escapeHtml(previewText)}</span>
      `;
      controls.appendChild(preview);

      // Collapse button
      const btn = document.createElement("button");
      btn.className = "acc-collapse-btn";
      btn.setAttribute("aria-label", "Collapse");
      btn.setAttribute("title", "Collapse message");
      btn.type = "button";
      btn.innerHTML = '<span class="acc-collapse-icon"></span>';
      controls.appendChild(btn);

      // Toggle handler
      const msgHash = hashText(rawText);

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const isCollapsed = el.classList.toggle("acc-collapsed");

        btn.setAttribute("aria-label", isCollapsed ? "Expand" : "Collapse");
        btn.setAttribute("title", isCollapsed ? "Expand message" : "Collapse message");

        if (isCollapsed) {
          collapsedSet.add(msgHash);
        } else {
          collapsedSet.delete(msgHash);
        }
        saveState();
      });

      // Controls row: keeps `.acc-controls` as a sibling.
      const controlsRow = document.createElement("div");
      controlsRow.className = "acc-controls-row";
      controlsRow.appendChild(controls);

      // Insert at the start of the message so buttons appear at the top.
      // prepend is safe here because controlsRow is a newly created element
      // (not a framework-managed node).
      el.prepend(controlsRow);

      // Restore collapsed state if previously collapsed
      if (collapsedSet.has(msgHash)) {
        el.classList.add("acc-collapsed");
        btn.setAttribute("aria-label", "Expand");
        btn.setAttribute("title", "Expand message");
      }

      
    } catch (err) {
      console.warn("[AI Chat Collapser] Failed to process message:", err);
      // Remove the processed flag so we can retry on the next scan
      el.removeAttribute("data-acc-processed");
    }
  }

  /** Escape HTML to prevent XSS in preview text */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ─────────────────────────────────────────────────────────
  // Scan the DOM for any unprocessed messages
  // ─────────────────────────────────────────────────────────
  function scanForMessages() {
    ensureTocUI();
    let newMessagesFound = false;

    const messages = document.querySelectorAll(platform.messageSelector);
    messages.forEach((el) => {
      // Skip empty elements that are likely not real messages
      if (el.textContent && el.textContent.trim().length > 0) {
        const role = platform.roleDetector(el);
        if (role === "assistant") {
          const isNew = !el.hasAttribute("data-acc-processed");
          processMessage(el);
          if (isNew) newMessagesFound = true;
        } else if (role === "user") {
          if (!tocIdByEl.has(el)) {
            addPromptToToc(el);
            newMessagesFound = true;
          }
        }
      }
    });

    // If we found new messages, do a full resort to ensure correct order
    // This handles cases where older messages are loaded out of order
    if (newMessagesFound) {
      resortToc();
    }
  }

  // ─────────────────────────────────────────────────────────
  // MutationObserver Setup
  //
  // We debounce the scan to avoid excessive processing during
  // streaming. The observer watches for ANY childList change
  // in the subtree, which catches:
  //  - New message bubbles being appended
  //  - Streamed tokens being added to existing messages
  //  - DOM restructuring (e.g., React re-renders)
  //  - Navigation between conversations
  // ─────────────────────────────────────────────────────────
  let debounceTimer = null;

  function debouncedScan() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanForMessages, 150);
  }

  const observer = new MutationObserver((mutations) => {
    // Quick check: did any mutation actually add nodes?
    let hasNewNodes = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        hasNewNodes = true;
        break;
      }
    }
    if (hasNewNodes) {
      debouncedScan();
    }
  });

  // ─────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────
  function init() {
    loadState();
    ensureTocUI();
    loadTocVisibility();

    // Initial scan for messages already in the DOM
    scanForMessages();

    // Start observing the body for new messages
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Also re-scan on URL changes (SPA navigation in these apps)
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        resetTocForNewConversation();
        // Small delay for new page content to load
        setTimeout(scanForMessages, 500);
      }
    });
    urlObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Wait for DOM to be ready (content_scripts run at document_idle, but just in case)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
