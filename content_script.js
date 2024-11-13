class ModelSelector {
  constructor() {
    this.models = [
      { title: "Default", value: "turbo" },
      { title: "Claude 3.5 Sonnet", value: "claude2" },
      { title: "Sonar Large", value: "experimental" },
      { title: "GPT-4o", value: "gpt4o" },
      { title: "Sonar Huge", value: "llama_x_large" },
      { title: "Grok-2", value: "grok" },
      { title: "Claude 3.5 Haiku", value: "claude35haiku" },
    ];

    this.selectors = [
      "div.items-center.grid-rows-1fr-auto.grid.grid-cols-3.w-full div.bg-background.dark\\:bg-offsetDark.flex.items-center.space-x-2.justify-self-end.rounded-full.col-start-3.row-start-2.-mr-2",
      "div.items-center.flex.w-full div.bg-background.dark\\:bg-offsetDark.flex.items-center.space-x-2.justify-self-end.rounded-full.order-2",
      "div.fixed.bottom-0.left-0.right-0.top-0.overflow-y-auto div.items-center.grid-rows-1fr-auto.grid.grid-cols-3.w-full div.bg-background.dark\\:bg-offsetDark.flex.items-center.space-x-2.justify-self-end.rounded-full.col-start-3.row-start-2.-mr-2",
    ];

    this.currentModel = null;
    this.observer = null;
    this.initialized = false;

    // Initialize the extension
    this.init();
  }

  async init() {
    try {
      // Get the initial model setting before injecting dropdowns
      await this.getCurrentModel();
      this.initialized = true;
      this.initObserver();
      this.injectDropdowns();
    } catch (error) {
      console.error("Failed to initialize model selector:", error);
    }
  }

  createDropdown() {
    const container = document.createElement("div");
    container.className = "model-selector";

    const select = document.createElement("select");
    select.innerHTML = this.models
      .map((model) => `<option value="${model.value}">${model.title}</option>`)
      .join("");

    // Set the current model value
    if (this.currentModel) {
      select.value = this.currentModel;
    }

    select.addEventListener("change", async (e) => {
      e.preventDefault();
      await this.handleModelChange(e.target.value);
    });

    container.appendChild(select);
    return container;
  }

  async handleModelChange(modelValue) {
    try {
      const requestOptions = {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          updated_settings: {
            default_model: modelValue,
          },
        }),
        credentials: "include",
      };

      const response = await fetch(
        "https://www.perplexity.ai/rest/user/save-settings?version=2.13&source=default",
        requestOptions
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await response.json();

      // Update the current model and sync all dropdowns
      this.currentModel = modelValue;
      this.syncDropdowns();
    } catch (error) {
      console.error("Error updating model:", error);
      // Revert all dropdowns to the previous value
      this.syncDropdowns();
    }
  }

  syncDropdowns() {
    if (!this.currentModel) return;

    const dropdowns = document.querySelectorAll(".model-selector select");
    dropdowns.forEach((dropdown) => {
      dropdown.value = this.currentModel;
    });
  }

  injectDropdowns() {
    this.selectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        if (!element.querySelector(".model-selector")) {
          element.style.position = "relative"
          element.appendChild(this.createDropdown());
        }
      });
    });
  }

  initObserver() {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length && this.initialized) {
          this.injectDropdowns();
        }
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  async getCurrentModel() {
    try {
      const response = await fetch(
        "https://www.perplexity.ai/rest/user/settings?version=2.13&source=default",
        {
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data?.default_model) {
        this.currentModel = data.default_model;
      }
    } catch (error) {
      console.error("Error fetching current model:", error);
      throw error; // Re-throw to handle in init()
    }
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => new ModelSelector(), 500);
});
