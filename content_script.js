const ACTIVE_DROPDOWN_CLASS = "active";

/**
 * This helps differentiate between search box types. For example, we shouldn't show the
 * general AI model selector when on a running thread because changing the model from there
 * won't have any effect.
 *
 * @returns {boolean} True if the current page is a search page.
 */
function currentlyOnSearchPage() {
  const url = new URL(window.location.href);
  const sections = url.pathname.slice(1).split("/");
  return sections[0] === "search";
}

/**
 * Used to determine whether a dropdown should be hidden.
 *
 * @param {boolean|function(): boolean} shouldHide - A boolean or a function that returns a boolean.
 * @returns {boolean} - The hidden state.
 * @throws {TypeError} If `isHidden` is neither a boolean nor a function.
 */
function checkShouldHide(shouldHide) {
  const type = typeof shouldHide;
  switch (type) {
    case "boolean":
      return shouldHide;
    case "function":
      return shouldHide();
    default:
      throw new TypeError(
        `Invalid type "${type}" passed to checkIsHidden(...).`
      );
  }
}

/**
 * Used for configuration - returns a list of additional CSS classes to apply to a dropdown container.
 *
 * @param {string[]|function(): string[]} additionalClasses - An array of class names or a function that returns an array of class names.
 * @returns {string[]} - The array of class names.
 * @throws {TypeError} If `additionalClasses` is neither an array nor a function.
 */
function resolveAdditionalClasses(additionalClasses) {
  if (Array.isArray(additionalClasses)) {
    return additionalClasses;
  }

  if (typeof additionalClasses !== "function") {
    throw new TypeError(
      `Invalid type ${typeof additionalClasses} passed to resolveAdditionalClasses(...).`
    );
  }

  return additionalClasses();
}

class ModelSelector {
  constructor() {
    /**
     * Array of available response models.
     * @type {Array<{title: string, value: string}>}
     */
    this.responseModels = [
      { title: "Default/Auto", value: "turbo" },
      { title: "Claude 3.5 Sonnet", value: "claude2" },
      { title: "Sonar", value: "experimental" },
      { title: "GPT-4o", value: "gpt4o" },
      { title: "Grok-2", value: "grok" },
      { title: "Claude 3.5 Haiku", value: "claude35haiku" },
      { title: "Gemini 2.0 Flash", value: "gemini2flash" }
    ];

    /**
     * Array of available image models.
     * @type {Array<{title: string, value: string}>}
     */
    this.imageModels = [
      { title: "Playground v3", value: "default" },
      { title: "DALL-E 3", value: "dall-e-3" },
      { title: "FLUX.1", value: "flux" },
    ];

    /**
     * Array of selector configurations. These are used to apply specific settings to different
     * search bars.
     *
     * @type {Array<{
     *   selector: string,
     *   shouldShowResponseModels: boolean|function(): boolean,
     *   shouldShowImageModels: boolean|function(): boolean,
     *   additionalClasses: string[]|function(): string[]
     * }>}
     */
    this.selectorConfigs = [
      // Main bar in both the homepage and search page.
      {
        selector: "main span.grow.block > div > div > div > div:last-of-type",
        // This has to be a function so that it runs each time the selector is evaluated,
        // not just when this list is initialized.
        shouldShowResponseModels: () => !currentlyOnSearchPage(),
        shouldShowImageModels: true,
        additionalClasses: () => {
          const result = [];
          if (!currentlyOnSearchPage()) {
            result.push("space-bottom");
          }
          return result;
        },
      },
      // "New Thread" bar
      {
        selector:
          "body > div:last-of-type span.grow.block > div > div > div > div:last-of-type",
        shouldShowResponseModels: true,
        shouldShowImageModels: true,
        additionalClasses: ["space-bottom"],
      },
    ];

    /**
     * Currently selected response model value.
     * @type {string|null}
     */
    this.currentResponseModel = null;

    /**
     * Currently selected image model value.
     * @type {string|null}
     */
    this.currentImageModel = null;

    /**
     * MutationObserver instance.
     * @type {MutationObserver|null}
     */
    this.observer = null;

    /**
     * Indicates if the initialization (retrieving the currently selected settings and AI models)
     * is complete.
     *
     * @type {boolean}
     */
    this.areSettingsInitialized = false;

    this.init();
  }

  /**
   * Initializes the ModelSelector by fetching current models and setting up observers.
   *
   * @async
   * @returns {Promise<void>}
   */
  async init() {
    try {
      const { generalModel, imageModel } = await this.getCurrentSettings();
      this.currentResponseModel = generalModel;
      this.currentImageModel = imageModel;
      this.areSettingsInitialized = true;
      this.initObserver();
      this.injectDropdowns();
    } catch (error) {
      console.error("Failed to initialize model selector:", error);
    }
  }

  /**
   * Creates a dropdown element for selecting models. This should be reused for both the general
   * AI model selector and the image generation model selector.
   *
   * @param {Array<{title: string, value: string}>} models - Array of model objects.
   * @param {string|null} currentValue - The current selected model value.
   * @param {boolean} isHidden - Whether the dropdown should be hidden.
   * @param {function(string): Promise<void>} onChange - Callback function when the selected model changes.
   * @returns {HTMLSpanElement} - The container element with the dropdown.
   */
  createDropdown(models, currentValue, isHidden, onChange) {
    const container = document.createElement("span");
    container.classList.add("inner-container");

    if (isHidden) {
      container.classList.add("hidden");
    }

    const select = document.createElement("select");
    for (const { value, title } of models) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = title;
      select.appendChild(option);
    }

    if (currentValue) {
      select.value = currentValue;
    }

    select.addEventListener("change", async (e) => {
      await onChange(e.target.value);
    });

    select.addEventListener("click", () => {
      if (container.classList.contains(ACTIVE_DROPDOWN_CLASS)) {
        container.classList.remove(ACTIVE_DROPDOWN_CLASS);
      } else {
        container.classList.add(ACTIVE_DROPDOWN_CLASS);
      }
    });

    select.addEventListener("blur", () => {
      container.classList.remove(ACTIVE_DROPDOWN_CLASS);
    });

    container.appendChild(select);
    return container;
  }

  /**
   * Handles the model change event and updates the user's settings.
   *
   * @async
   * @param {string} modelValue - The new model value selected.
   * @param {"response"|"image"} modelType - The type of model being changed.
   * @returns {Promise<void>}
   */
  async handleModelChange(modelValue, modelType) {
    console.log(`Changing ${modelType} model to ${modelValue}`);
    const settingKey =
      modelType === "response"
        ? "default_model"
        : "default_image_generation_model";
    try {
      const response = await fetch(
        "https://www.perplexity.ai/rest/user/save-settings?version=2.13&source=default",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            updated_settings: {
              [settingKey]: modelValue,
            },
          }),
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await response.json();

      if (modelType === "response") {
        this.currentResponseModel = modelValue;
      } else {
        this.currentImageModel = modelValue;
      }
    } catch (error) {
      console.error("Error updating model:", error);
    } finally {
      this.syncDropdowns();
    }
  }

  /**
   * Synchronizes all dropdowns with the current model selections.
   */
  syncDropdowns() {
    const containers = document.querySelectorAll(".model-selector");
    containers.forEach((container) => {
      const [responseSelect, imageSelect] =
        container.querySelectorAll("select");
      if (this.currentResponseModel && responseSelect) {
        responseSelect.value = this.currentResponseModel;
      }
      if (this.currentImageModel && imageSelect) {
        imageSelect.value = this.currentImageModel;
      }
    });
  }

  /**
   * Injects the model selection dropdowns into the specified DOM elements.
   */
  injectDropdowns() {
    this.selectorConfigs.forEach(
      ({
        selector,
        shouldShowImageModels,
        shouldShowResponseModels,
        additionalClasses,
      }) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((element) => {
          if (!element.querySelector(".model-selector")) {
            const container = document.createElement("div");
            container.classList.add("model-selector");

            for (const className of resolveAdditionalClasses(
              additionalClasses
            )) {
              container.classList.add(className);
            }

            container.appendChild(
              this.createDropdown(
                this.responseModels,
                this.currentResponseModel,
                !checkShouldHide(shouldShowResponseModels),
                (value) => this.handleModelChange(value, "response")
              )
            );

            container.appendChild(
              this.createDropdown(
                this.imageModels,
                this.currentImageModel,
                !checkShouldHide(shouldShowImageModels),
                (value) => this.handleModelChange(value, "image")
              )
            );

            element.style.position = "relative";
            element.appendChild(container);
          }
        });
      }
    );
  }

  /**
   * Initializes a MutationObserver to watch for DOM changes and reinject dropdowns.
   */
  initObserver() {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length && this.areSettingsInitialized) {
          this.injectDropdowns();
        }
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Fetches the current model setting from the server.
   *
   * @async
   * @returns {Promise<{
   *    generalModel: string,
   *    imageModel: string
   * }>}
   * @throws {Error} If the fetch operation fails.
   */
  async getCurrentSettings() {
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
      return {
        generalModel: data.default_model,
        imageModel: data.default_image_generation_model,
      };
    } catch (error) {
      console.error(`Error fetching current settings:`, error);
      throw error;
    }
  }
}

// Initialize the extension.
document.addEventListener("DOMContentLoaded", () => {
  new ModelSelector();
});
