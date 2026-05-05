<p align="center">
  <img src="assets/header.png" alt="AI Chat Collapser Header" width="600">
</p>

# AI Chat Collapser 🤖💬

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/we-live-inside-a-dream/AI-Extension)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platforms-ChatGPT%20%7C%20Claude%20%7C%20Gemini-orange.svg)](#supported-platforms)

**AI Chat Collapser** is a sleek browser extension designed to declutter your AI conversations. It adds an intuitive "Collapse/Expand" button to AI-generated messages in ChatGPT, Claude, and Gemini, allowing you to focus on the content that matters most.

---

## ✨ Features

- **🎯 Smart Targeting:** Automatically detects AI responses while leaving user prompts visible for context.
- **🔄 Persistent State:** Your choice to collapse a message is saved! Reload the page or switch conversations, and your collapsed messages stay hidden until you expand them.
- **📋 Conversation TOC:** Sidebar showing a list of your user prompts. Click to jump to any message in the conversation.
- **📝 Intelligent Previews:** When a message is collapsed, it shows a subtle "AI" tag and a 120-character preview of the content, so you never lose track of where you are.
- **🎨 Premium Aesthetics:**
  - **Glassmorphism:** Modern blur effects and subtle borders that feel native to every platform.
  - **Dynamic Themes:** Full support for Light and Dark modes, automatically syncing with your system and platform preferences.
  - **Micro-Animations:** Smooth transitions and hover effects for a premium user experience.
- **⚡ Performance-First:** Uses a debounced `MutationObserver` to handle streaming responses without slowing down your browser.
- **🛡️ Framework Safe:** Built to play nice with React and other complex web frameworks used by OpenAI, Google, and Anthropic.

---

## 🚀 Supported Platforms

| Platform | URL |
| :--- | :--- |
| **ChatGPT** | `chatgpt.com`, `chat.openai.com` |
| **Claude** | `claude.ai` |
| **Gemini** | `gemini.google.com` |

## 🚀 Installation

Install the **AI Chat Collapser** directly from the [Chrome Web Store](https://chrome.google.com/webstore):

<a href="https://chrome.google.com/webstore">
  <img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/chrome/chrome_48x48.png" alt="Chrome Logo" width="24" align="center"> **Add to Chrome**
</a>

*(Coming soon to the Chrome Web Store!)*

---

## 📖 How to Use

1. Navigate to any supported AI chat platform.
2. Hover over any AI response. A collapse icon (minus) will appear in the top-right corner.
3. Click the icon to **collapse** the message. It will shrink to a slim preview bar.
4. Click the plus icon on the preview bar to **expand** the message back to full size.
5. Use the **TOC** sidebar to quickly navigate between your messages.

---

## 🗂️ TOC Sidebar

The TOC (Table of Contents) sidebar appears on the right side of the conversation and shows a list of your user prompts. Click any item to jump directly to that message in the conversation history.

- **Auto-generated:** The TOC populates automatically as you send new prompts.
- **Smart highlighting:** The current message you're viewing is highlighted in the TOC.
- **Collapsible:** Click "Hide" to hide the TOC sidebar, or use the "TOC" button to show it again.

---

## 🛠️ Tech Stack

- **JavaScript (ES6+):** Pure, framework-less logic for maximum performance.
- **Vanilla CSS:** Custom design system with CSS Variables and backdrop filters.
- **Chrome Extension API:** Using Manifest V3 and `chrome.storage.local` for persistence.

---

## 🤝 Contributing

Contributions are welcome! If you find a bug or have a feature request, please open an issue or submit a pull request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git checkout -b feature/AmazingFeature`)
5. Open a Pull Request

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 🛠️ Developer Setup

If you want to contribute or build the extension from source:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/we-live-inside-a-dream/collapsible-community-version.git
   ```
2. **Load in Chrome:**
   - Go to `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked** and select the project folder.

---

<p align="center">
  Built with ❤️ for the AI Community
</p>
