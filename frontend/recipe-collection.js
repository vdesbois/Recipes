import { createRecipeCard } from "./recipe-card.js";
import { t } from "./i18n.js";

export function createRecipeCollection({
  root,
  count,
  searchInput,
  categoryFilter,
  onEdit,
  onDelete,
}) {
  let recipes = [];
  let categories = [];
  let selectedCategory = "";
  let searchText = "";

  function render() {
    root.replaceChildren();

    const normalizedSearch = searchText.toLowerCase();
    const visibleRecipes = recipes.filter((recipe) => {
      const matchesSearch = normalizedSearch === ""
        || recipe.name.toLowerCase().includes(normalizedSearch)
        || recipe.notes.toLowerCase().includes(normalizedSearch);
      const matchesCategory = selectedCategory === "uncategorized"
        ? recipe.category === null
        : selectedCategory.startsWith("category:")
          ? recipe.category === selectedCategory.slice("category:".length)
          : true;
      return matchesSearch && matchesCategory;
    });
    count.textContent = String(visibleRecipes.length);

    if (visibleRecipes.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "empty-state";

      const icon = document.createElement("span");
      icon.className = "empty-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "✳";

      const heading = document.createElement("h3");
      heading.textContent = recipes.length === 0
        ? t("empty.readyTitle")
        : searchText
          ? t("empty.searchTitle")
          : t("empty.categoryTitle");
      const description = document.createElement("p");
      description.textContent = recipes.length === 0
        ? t("empty.readyDescription")
        : searchText
          ? t("empty.searchDescription")
          : t("empty.categoryDescription");
      emptyState.append(icon, heading, description);
      root.append(emptyState);
      return;
    }

    root.append(...visibleRecipes.map(createRecipeCard));
  }

  function setCategories(newCategories) {
    categories = newCategories;
    const removedSelectedCategory = selectedCategory.startsWith("category:")
      && !categories.includes(selectedCategory.slice("category:".length));
    if (removedSelectedCategory) {
      selectedCategory = "";
    }

    categoryFilter.replaceChildren(
      new Option(t("category.all"), ""),
      new Option(t("category.uncategorized"), "uncategorized"),
      ...categories.map((category) => new Option(category, `category:${category}`)),
    );
    categoryFilter.value = selectedCategory;
    if (removedSelectedCategory) {
      render();
    }
  }

  searchInput.addEventListener("input", () => {
    searchText = searchInput.value.trim();
    render();
  });
  categoryFilter.addEventListener("change", () => {
    selectedCategory = categoryFilter.value;
    render();
  });
  root.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-id]");
    if (deleteButton) {
      const recipe = recipes.find((item) => item.id === deleteButton.dataset.deleteId);
      if (recipe) {
        void onDelete(recipe, deleteButton);
      }
      return;
    }

    const editButton = event.target.closest("[data-edit-id]");
    if (editButton) {
      const recipe = recipes.find((item) => item.id === editButton.dataset.editId);
      if (recipe) {
        onEdit(recipe);
      }
    }
  });

  return {
    setRecipes(newRecipes) {
      recipes = newRecipes;
      render();
    },
    setCategories,
    refresh() {
      setCategories(categories);
      render();
    },
    upsertRecipe(recipe) {
      const exists = recipes.some((item) => item.id === recipe.id);
      recipes = exists
        ? recipes.map((item) => item.id === recipe.id ? recipe : item)
        : [recipe, ...recipes];
      render();
    },
    removeRecipe(recipeId) {
      recipes = recipes.filter((recipe) => recipe.id !== recipeId);
      render();
    },
  };
}
