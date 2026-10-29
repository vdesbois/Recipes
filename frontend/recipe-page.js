import { getRecipe } from "./api.js";

const loadingStatus = document.querySelector("#loading-status");
const errorNotice = document.querySelector("#recipe-error");
const errorMessage = document.querySelector("#recipe-error-message");
const detail = document.querySelector("#recipe-detail");

function renderList(root, items) {
  root.replaceChildren(...items.map((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    return item;
  }));
}

function renderRecipe(recipe) {
  document.title = `${recipe.name} | My Recipes`;
  document.querySelector("#detail-name").textContent = recipe.name;
  document.querySelector("#detail-rating").textContent = recipe.rating === null
    ? "Not rated"
    : `${"★".repeat(recipe.rating)}${"☆".repeat(5 - recipe.rating)} — ${recipe.rating} out of 5`;

  const category = document.querySelector("#detail-category");
  category.textContent = recipe.category ?? "";
  category.hidden = recipe.category === null;

  const editLink = document.querySelector("#edit-recipe");
  editLink.href = `/?edit=${encodeURIComponent(recipe.id)}`;

  const gallery = document.querySelector("#detail-gallery");
  gallery.replaceChildren(...recipe.images.map((image, index) => {
    const picture = document.createElement("img");
    picture.src = image.url;
    picture.alt = `${recipe.name} picture ${index + 1}`;
    picture.loading = index === 0 ? "eager" : "lazy";
    return picture;
  }));
  gallery.hidden = recipe.images.length === 0;

  const notesSection = document.querySelector("#detail-notes-section");
  document.querySelector("#detail-notes").textContent = recipe.notes;
  notesSection.hidden = recipe.notes.length === 0;

  const ingredientsSection = document.querySelector("#detail-ingredients-section");
  renderList(document.querySelector("#detail-ingredients"), recipe.ingredients);
  ingredientsSection.hidden = recipe.ingredients.length === 0;

  const stepsSection = document.querySelector("#detail-steps-section");
  renderList(document.querySelector("#detail-steps"), recipe.steps);
  stepsSection.hidden = recipe.steps.length === 0;
}

async function loadRecipe() {
  const recipeId = new URLSearchParams(window.location.search).get("id");
  if (!recipeId) {
    loadingStatus.hidden = true;
    errorNotice.hidden = false;
    errorMessage.textContent = "No recipe was specified.";
    return;
  }

  try {
    const recipe = await getRecipe(recipeId);
    renderRecipe(recipe);
    detail.hidden = false;
  } catch (error) {
    errorNotice.hidden = false;
    errorMessage.textContent = `This recipe could not be loaded. ${error.message}`;
  } finally {
    loadingStatus.hidden = true;
  }
}

void loadRecipe();
