import { deleteRecipe, getCategories, getRecipes } from "./api.js";
import { createRecipeCollection } from "./recipe-collection.js";
import { createRecipeForm } from "./recipe-form.js";

const appNotice = document.querySelector("#app-notice");
const noticeMessage = document.querySelector("#notice-message");
const loadingStatus = document.querySelector("#loading-status");
const recipeSection = document.querySelector("#recipe-section");

function showNotice(message) {
  appNotice.hidden = false;
  noticeMessage.textContent = message;
}

const collection = createRecipeCollection({
  root: document.querySelector("#recipe-list"),
  count: document.querySelector("#recipe-count"),
  searchInput: document.querySelector("#recipe-search"),
  categoryFilter: document.querySelector("#category-filter"),
  onEdit: (recipe) => recipeForm.open(recipe),
  onDelete: deleteRecipeAndRefresh,
});

const recipeForm = createRecipeForm({
  onSaved(recipe) {
    collection.upsertRecipe(recipe);
    appNotice.hidden = true;
    void refreshCategories("The recipe was saved, but category suggestions could not be refreshed.");
  },
});

async function refreshCategories(errorMessage) {
  try {
    const categories = await getCategories();
    recipeForm.setCategories(categories);
    collection.setCategories(categories);
  } catch (error) {
    showNotice(`${errorMessage} ${error.message}`);
  }
}

async function deleteRecipeAndRefresh(recipe, button) {
  if (!window.confirm(`Delete "${recipe.name}"? This cannot be undone.`)) {
    return;
  }

  button.disabled = true;
  appNotice.hidden = true;
  try {
    await deleteRecipe(recipe.id);
    collection.removeRecipe(recipe.id);
    await refreshCategories(
      "The recipe was deleted, but category suggestions could not be refreshed.",
    );
  } catch (error) {
    showNotice(`Your recipe could not be deleted. ${error.message}`);
    button.disabled = false;
  }
}

async function loadRecipes() {
  loadingStatus.hidden = false;
  loadingStatus.textContent = "Loading your recipes…";
  recipeSection.hidden = true;
  appNotice.hidden = true;

  try {
    const [recipes, categories] = await Promise.all([getRecipes(), getCategories()]);
    collection.setRecipes(recipes);
    recipeForm.setCategories(categories);
    collection.setCategories(categories);
    recipeSection.hidden = false;
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (editId) {
      const recipe = recipes.find((item) => item.id === editId);
      if (recipe) {
        recipeForm.open(recipe);
      } else {
        showNotice("That recipe could not be found.");
      }
    }
  } catch (error) {
    showNotice(`Your recipes could not be loaded. ${error.message}`);
  } finally {
    loadingStatus.hidden = true;
  }
}

document.querySelector("#retry-load").addEventListener("click", () => void loadRecipes());
void loadRecipes();
