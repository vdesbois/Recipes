import {
  deleteRecipeImage,
  saveRecipe,
  uploadRecipeImage,
} from "./api.js";
import { createOrderedListEditor } from "./ordered-list-editor.js";

const MAX_RECIPE_IMAGES = 10;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function createRecipeForm({ onSaved }) {
  const dialog = document.querySelector("#recipe-dialog");
  const form = document.querySelector("#recipe-form");
  const nameInput = document.querySelector("#recipe-name");
  const ratingInput = document.querySelector("#recipe-rating");
  const notesInput = document.querySelector("#recipe-notes");
  const categoryInput = document.querySelector("#recipe-category");
  const cookingTimeInput = document.querySelector("#recipe-cooking-time");
  const cookingTemperatureInput = document.querySelector("#recipe-cooking-temperature");
  const servingsInput = document.querySelector("#recipe-servings");
  const categorySuggestions = document.querySelector("#category-suggestions");
  const imageInput = document.querySelector("#recipe-images");
  const imageEditor = document.querySelector("#recipe-image-editor");
  const dialogTitle = document.querySelector("#dialog-title");
  const formError = document.querySelector("#form-error");
  const stepEditor = createOrderedListEditor(
    document.querySelector("#recipe-step-editor"),
    document.querySelector("#add-recipe-step"),
    "step",
  );
  const ingredientEditor = createOrderedListEditor(
    document.querySelector("#recipe-ingredient-editor"),
    document.querySelector("#add-recipe-ingredient"),
    "ingredient",
  );
  let editingId = null;
  let currentRecipe = null;
  let pendingImages = [];
  let previewUrls = [];

  function renderImages() {
    for (const url of previewUrls) {
      URL.revokeObjectURL(url);
    }
    previewUrls = [];
    imageEditor.replaceChildren();

    for (const image of currentRecipe?.images ?? []) {
      imageEditor.append(createImagePreview(image.url, currentRecipe.name, (button) => {
        void removeExistingImage(image, button);
      }));
    }
    for (const [index, file] of pendingImages.entries()) {
      const url = URL.createObjectURL(file);
      previewUrls.push(url);
      imageEditor.append(createImagePreview(url, file.name, () => {
        pendingImages.splice(index, 1);
        renderImages();
      }));
    }
  }

  function createImagePreview(src, alt, onRemove) {
    const item = document.createElement("div");
    item.className = "recipe-image-preview";
    const image = document.createElement("img");
    image.src = src;
    image.alt = alt;
    const removeButton = document.createElement("button");
    removeButton.className = "step-remove-button";
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove picture ${alt}`);
    removeButton.addEventListener("click", () => onRemove(removeButton), { once: true });
    item.append(image, removeButton);
    return item;
  }

  async function removeExistingImage(image, removeButton) {
    removeButton.disabled = true;
    try {
      await deleteRecipeImage(currentRecipe.id, image.id);
      currentRecipe = {
        ...currentRecipe,
        images: currentRecipe.images.filter((item) => item.id !== image.id),
      };
      renderImages();
      onSaved(currentRecipe);
      formError.hidden = true;
    } catch (error) {
      formError.hidden = false;
      formError.textContent = `The picture could not be removed. ${error.message}`;
      removeButton.disabled = false;
    }
  }

  function open(recipe = null) {
    editingId = recipe?.id ?? null;
    currentRecipe = recipe;
    pendingImages = [];
    imageInput.value = "";
    dialogTitle.textContent = editingId ? "Edit recipe" : "Add a recipe";
    nameInput.value = recipe?.name ?? "";
    ratingInput.value = recipe?.rating === null || recipe?.rating === undefined
      ? ""
      : String(recipe.rating);
    notesInput.value = recipe?.notes ?? "";
    categoryInput.value = recipe?.category ?? "";
    cookingTimeInput.value = recipe?.cooking_time_minutes ?? "";
    cookingTemperatureInput.value = recipe?.cooking_temperature_f ?? "";
    servingsInput.value = recipe?.servings ?? "";
    renderImages();
    stepEditor.setValues(recipe?.steps ?? []);
    ingredientEditor.setValues(recipe?.ingredients ?? []);
    formError.hidden = true;
    formError.textContent = "";
    dialog.showModal();
    nameInput.focus();
  }

  document.querySelector("#add-recipe").addEventListener("click", () => open());
  document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
  document.querySelector("#cancel-dialog").addEventListener("click", () => dialog.close());
  nameInput.addEventListener("input", () => nameInput.setCustomValidity(""));
  imageInput.addEventListener("change", () => {
    const acceptedFiles = [];
    let error = "";
    for (const file of imageInput.files) {
      if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
        error = "Pictures must be JPEG, PNG, or WebP.";
      } else if (file.size > MAX_IMAGE_SIZE) {
        error = "Each picture must be 5 MB or smaller.";
      } else {
        acceptedFiles.push(file);
      }
    }

    const availableSlots = MAX_RECIPE_IMAGES
      - (currentRecipe?.images.length ?? 0)
      - pendingImages.length;
    pendingImages.push(...acceptedFiles.slice(0, Math.max(0, availableSlots)));
    if (acceptedFiles.length > availableSlots) {
      error = "A recipe can have at most 10 pictures.";
    }
    imageInput.value = "";
    renderImages();
    formError.hidden = !error;
    formError.textContent = error;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.hidden = true;

    const name = nameInput.value.trim();
    if (!name) {
      nameInput.setCustomValidity("Please enter a recipe name.");
      nameInput.reportValidity();
      return;
    }
    nameInput.setCustomValidity("");

    const saveButton = form.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    const values = {
      name,
      rating: ratingInput.value === "" ? null : Number(ratingInput.value),
      notes: notesInput.value.trim(),
      category: categoryInput.value.trim() || null,
      cooking_time_minutes: cookingTimeInput.value === ""
        ? null
        : Number(cookingTimeInput.value),
      cooking_temperature_f: cookingTemperatureInput.value === ""
        ? null
        : Number(cookingTemperatureInput.value),
      servings: servingsInput.value === "" ? null : Number(servingsInput.value),
      ingredients: ingredientEditor.getValues()
        .map((ingredient) => ingredient.trim())
        .filter(Boolean),
      steps: stepEditor.getValues().map((step) => step.trim()).filter(Boolean),
    };

    try {
      currentRecipe = await saveRecipe(values, editingId);
      editingId = currentRecipe.id;
      onSaved(currentRecipe);
      while (pendingImages.length > 0) {
        const [file] = pendingImages;
        const image = await uploadRecipeImage(currentRecipe.id, file);
        currentRecipe = {
          ...currentRecipe,
          images: [...currentRecipe.images, image],
        };
        pendingImages.shift();
        renderImages();
        onSaved(currentRecipe);
      }
      formError.hidden = true;
      dialog.close();
    } catch (error) {
      formError.hidden = false;
      formError.textContent = currentRecipe
        ? `Your recipe was saved, but a picture could not be uploaded. ${error.message}`
        : `Your recipe could not be saved. ${error.message}`;
      if (currentRecipe) {
        onSaved(currentRecipe);
      }
    } finally {
      saveButton.disabled = false;
    }
  });

  return {
    open,
    setCategories(categories) {
      categorySuggestions.replaceChildren(...categories.map((category) => {
        const option = document.createElement("option");
        option.value = category;
        return option;
      }));
    },
  };
}
