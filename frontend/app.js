import { deleteRecipe, getCategories, getRecipes } from "./api.js";
import { initializeLocalization, t, translateError } from "./i18n.js";
import { createRecipeCollection } from "./recipe-collection.js";
import { createRecipeForm } from "./recipe-form.js";

initializeLocalization();

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

document.addEventListener("localechange", () => {
  collection.refresh();
  recipeForm.refreshLocalization();
});

const recipeForm = createRecipeForm({
  onSaved(recipe) {
    collection.upsertRecipe(recipe);
    appNotice.hidden = true;
    void refreshCategories(t("notice.saveCategoryFailed", { error: "" }).trim());
  },
});

async function refreshCategories(errorMessage) {
  try {
    const categories = await getCategories();
    recipeForm.setCategories(categories);
    collection.setCategories(categories);
  } catch (error) {
    showNotice(`${errorMessage} ${translateError(error.message)}`);
  }
}

async function deleteRecipeAndRefresh(recipe, button) {
  if (!window.confirm(t("notice.deleteConfirm", { name: recipe.name }))) {
    return;
  }

  button.disabled = true;
  appNotice.hidden = true;
  try {
    await deleteRecipe(recipe.id);
    collection.removeRecipe(recipe.id);
    await refreshCategories(
      t("notice.deleteCategoryFailed", { error: "" }).trim(),
    );
  } catch (error) {
    showNotice(t("notice.deleteFailed", { error: translateError(error.message) }));
    button.disabled = false;
  }
}

async function loadRecipes() {
  loadingStatus.hidden = false;
  loadingStatus.textContent = t("status.loadingRecipes");
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
        showNotice(t("notice.notFound"));
      }
    }
  } catch (error) {
    showNotice(t("notice.loadFailed", { error: translateError(error.message) }));
  } finally {
    loadingStatus.hidden = true;
  }
}

document.querySelector("#retry-load").addEventListener("click", () => void loadRecipes());
void loadRecipes();
