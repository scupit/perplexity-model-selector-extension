function isSearchPage() {
  const url = new URL(window.location.href);
  const sections = url.pathname.slice(1).split("/");
  return sections[0] === "search";
}

function checkIsHidden(isHidden) {
  const type = typeof isHidden;
  switch (type) {
    case "boolean":
      return isHidden;
    case "function":
      return isHidden();
    default:
      throw new TypeError(
        `Invalid type "${type}" passed to checkIsHidden(...).`
      );
  }
}

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
    this.responseModels = [
      { title: "Default", value: "turbo" },
      { title: "Claude 3.5 Sonnet", value: "claude2" },
      { title: "Sonar Large", value: "experimental" },
      { title: "GPT-4o", value: "gpt4o" },
      { title: "Sonar Huge", value: "llama_x_large" },
      { title: "Grok-2", value: "grok" },
      { title: "Claude 3.5 Haiku", value: "claude35haiku" },
    ];

    this.imageModels = [
      { title: "Playground v3", value: "default" },
      { title: "DALL-E 3", value: "dall-e-3" },
      { title: "Stable Diffusion XL", value: "sdxl" },
      { title: "FLUX.1", value: "flux" },
    ];

    this.selectors = [
      // Main bar in both the homepage and search page.
      {
        selector: "main span.grow.block > div > div > div > div:last-of-type",
        // This has to be a function so that it runs each time the selector is evaluated,
        // not just when this list is initialized.
        shouldShowResponseModels: () => !isSearchPage(),
        shouldShowImageModels: true,
        additionalClasses: () => {
          const result = [];
          if (!isSearchPage()) {
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

    this.currentResponseModel = null;
    this.currentImageModel = null;
    this.observer = null;
    this.initialized = false;

    this.init();
  }

  async init() {
    try {
      await Promise.all([
        this.getCurrentModel("default_model"),
        this.getCurrentModel("default_image_generation_model"),
      ]);
      this.initialized = true;
      this.initObserver();
      this.injectDropdowns();
    } catch (error) {
      console.error("Failed to initialize model selector:", error);
    }
  }

  createDropdown(models, currentValue, isHidden, onChange) {
    const container = document.createElement("span");
    container.classList.add("inner-container");

    if (isHidden) {
      container.classList.add("hidden");
    }

    const select = document.createElement("select");
    for (const model of models) {
      const option = document.createElement("option");
      option.value = model.value;
      option.textContent = model.title;
      select.appendChild(option);
    }

    if (currentValue) {
      select.value = currentValue;
    }

    select.addEventListener("change", async (e) => {
      await onChange(e.target.value);
    });

    select.addEventListener("click", () => {
      if (container.classList.contains("active")) {
        container.classList.remove("active");
      } else {
        container.classList.add("active");
      }
    });

    select.addEventListener("blur", () => {
      container.classList.remove("active");
    });

    container.appendChild(select);
    return container;
  }

  async handleModelChange(modelValue, modelType) {
    console.log(`Changing ${modelType} model to ${modelValue}`);
    const settingKey =
      modelType === "response"
        ? "default_model"
        : "default_image_generation_model";
    try {
      const requestOptions = {
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
      };

      const response = await fetch(
        "https://www.perplexity.ai/rest/user/save-settings?version=2.13&source=default",
        requestOptions
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

      this.syncDropdowns();
      // window.location.reload();
    } catch (error) {
      console.error("Error updating model:", error);
      this.syncDropdowns();
    }
  }

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

  injectDropdowns() {
    this.selectors.forEach(
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
                !checkIsHidden(shouldShowResponseModels),
                (value) => this.handleModelChange(value, "response")
              )
            );

            container.appendChild(
              this.createDropdown(
                this.imageModels,
                this.currentImageModel,
                !checkIsHidden(shouldShowImageModels),
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

  async getCurrentModel(settingKey) {
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
      if (data?.[settingKey]) {
        if (settingKey === "default_model") {
          this.currentResponseModel = data[settingKey];
        } else {
          this.currentImageModel = data[settingKey];
        }
      }
    } catch (error) {
      console.error(`Error fetching ${settingKey}:`, error);
      throw error;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => new ModelSelector(), 500);
});
