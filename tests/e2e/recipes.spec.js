import { expect, test } from "@playwright/test";

test.describe("recipe collection", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ request }) => {
    const response = await request.get("/api/recipes");
    expect(response.ok()).toBeTruthy();
    const recipes = await response.json();

    for (const recipe of recipes) {
      const deleteResponse = await request.delete(`/api/recipes/${recipe.id}`);
      expect(deleteResponse.status()).toBe(204);
    }
  });

  test("starts empty and creates a recipe with empty optional fields", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Your recipe box is ready" })).toBeVisible();
    await expect(page.locator("#recipe-count")).toHaveText("0");

    await page.getByRole("button", { name: "Add a recipe" }).click();
    const name = page.getByLabel("Recipe name");
    const rating = page.getByLabel("Your rating");
    const notes = page.getByLabel("Notes OPTIONAL");
    const category = page.getByLabel("Category OPTIONAL");
    const cookingTime = page.getByLabel("Cooking time in minutes OPTIONAL");
    const cookingTemperature = page.getByLabel("Cooking temperature in °F OPTIONAL");
    const servings = page.getByLabel("Servings OPTIONAL");

    await expect(name).toHaveValue("");
    await expect(name).toHaveAttribute("required", "");
    await expect(rating).toHaveValue("");
    await expect(notes).toHaveValue("");
    await expect(category).toHaveValue("");
    await expect(cookingTime).toHaveValue("");
    await expect(cookingTemperature).toHaveValue("");
    await expect(servings).toHaveValue("");
    await expect(page.locator("#recipe-ingredient-editor li")).toHaveCount(0);

    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(name).toBeFocused();
    await expect(page.locator("#recipe-dialog")).toBeVisible();

    await name.fill("Sunday tomato pasta");
    await page.getByRole("button", { name: "Save recipe" }).click();

    const recipeCard = page.getByRole("article").filter({ hasText: "Sunday tomato pasta" });
    await expect(recipeCard).toBeVisible();
    await expect(recipeCard.getByText("Not rated")).toBeVisible();
    await expect(recipeCard.locator(".recipe-notes")).toHaveCount(0);
    await expect(recipeCard.locator(".recipe-steps")).toHaveCount(0);
    await expect(page.locator("#recipe-count")).toHaveText("1");
  });

  test("fits mobile, tablet, and desktop viewports without horizontal overflow", async ({ page, request }) => {
    for (const name of ["Tomato soup", "Lemon tart", "Herb rice"]) {
      const response = await request.post("/api/recipes", { data: { name } });
      expect(response.status()).toBe(201);
    }

    await page.goto("/");
    for (const [width, height, expectedColumns] of [
      [375, 812, 1],
      [768, 1024, 2],
      [1280, 900, 3],
    ]) {
      await page.setViewportSize({ width, height });
      const layout = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        columns: getComputedStyle(document.querySelector("#recipe-list"))
          .gridTemplateColumns.split(" ").length,
      }));
      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.columns).toBe(expectedColumns);
    }

    await page.setViewportSize({ width: 375, height: 667 });
    await page.getByRole("button", { name: "Add a recipe" }).click();
    const dialog = page.locator("#recipe-dialog");
    await expect(dialog).toBeVisible();
    const dialogBounds = await dialog.boundingBox();
    expect(dialogBounds.width).toBeLessThanOrEqual(375);
    expect(dialogBounds.height).toBeLessThanOrEqual(667);
  });

  test("switches between Canadian English and Quebec French without translating recipe content", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Add a recipe" }).click();
    await page.getByLabel("Recipe name").fill("Tourtière");
    await page.getByLabel("Notes OPTIONAL").fill("Family recipe notes.");
    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByRole("textbox", { name: "Step 1" }).fill("Bake until golden.");

    await page.locator(".locale-switch-dialog .locale-trigger").click();
    await page.getByRole("button", { name: "Français (Québec)" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr-CA");
    await expect(page.getByRole("button", { name: "Ajouter une recette" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ajouter une recette" })).toBeVisible();
    await expect(page.getByLabel("Nom de la recette")).toHaveValue("Tourtière");
    await expect(page.getByLabel("Notes FACULTATIF")).toHaveValue("Family recipe notes.");
    await expect(page.getByRole("textbox", { name: "Étape 1" })).toHaveValue("Bake until golden.");

    await page.getByRole("button", { name: "Enregistrer la recette" }).click();
    await page.getByRole("link", { name: "Voir Tourtière" }).click();
    await expect(page).toHaveTitle("Tourtière | Mes recettes");
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
    await expect(page.locator("#detail-notes")).toHaveText("Family recipe notes.");
    await expect(page.getByRole("heading", { name: "Préparation" })).toBeVisible();
    await expect(page.locator("#detail-steps li")).toHaveText(["Bake until golden."]);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Préparation" })).toBeVisible();

    await page.locator(".locale-switch:not(.locale-switch-dialog) .locale-trigger").click();
    await page.getByRole("button", { name: "English (Canada)" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en-CA");
    await expect(page.getByRole("heading", { name: "Instructions" })).toBeVisible();
    await expect(page.locator("#detail-steps li")).toHaveText(["Bake until golden."]);
  });

  test("uploads, displays the first picture, and removes recipe pictures", async ({ page, request }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Add a recipe" }).click();
    await page.getByLabel("Recipe name").fill("Berry tart");
    await page.locator("#recipe-images").setInputFiles([
      {
        name: "first.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
          "base64",
        ),
      },
      {
        name: "second.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
          "base64",
        ),
      },
    ]);
    await expect(page.locator("#recipe-image-editor img")).toHaveCount(2);
    await page.getByRole("button", { name: "Save recipe" }).click();

    const card = page.getByRole("article").filter({ hasText: "Berry tart" });
    await expect(card.locator(".recipe-picture")).toHaveCount(1);
    await expect.poll(() => card.locator(".recipe-picture").evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);
    const savedRecipe = (await (await request.get("/api/recipes")).json())
      .find((recipe) => recipe.name === "Berry tart");
    await expect(card.locator(".recipe-picture")).toHaveAttribute("src", savedRecipe.images[0].url);
    await card.getByRole("link", { name: "View Berry tart" }).click();
    await expect(page).toHaveURL(/recipe\.html\?id=/);
    await expect(page.getByRole("heading", { name: "Berry tart" })).toBeVisible();
    await expect(page.locator("#detail-gallery img")).toHaveCount(2);
    await page.getByRole("link", { name: "All recipes" }).click();
    await page.reload();
    const reloadedCard = page.getByRole("article").filter({ hasText: "Berry tart" });
    await expect(reloadedCard.locator(".recipe-picture")).toHaveCount(1);
    await reloadedCard.getByRole("button", { name: "Edit Berry tart" }).click();
    await expect(page.locator("#recipe-image-editor img")).toHaveCount(2);
    await page.getByRole("button", { name: "Remove picture Berry tart", exact: true }).nth(1).click();
    await expect(page.locator("#recipe-image-editor img")).toHaveCount(1);
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(reloadedCard.locator(".recipe-picture")).toHaveCount(1);

    await reloadedCard.getByRole("button", { name: "Edit Berry tart" }).click();
    await page.getByRole("button", { name: "Remove picture Berry tart", exact: true }).click();
    await expect(page.locator("#recipe-image-editor img")).toHaveCount(0);
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.locator("#recipe-dialog")).toBeHidden();
    await expect(reloadedCard.locator(".recipe-picture")).toHaveCount(0);
    await expect(page.locator("#recipe-image-editor img")).toHaveCount(0);
  });

  test("edits recipe details and retains them after reload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Add a recipe" }).click();
    await page.getByLabel("Recipe name").fill("Herb rice");
    await page.getByLabel("Your rating").selectOption("4");
    await page.getByLabel("Notes OPTIONAL").fill("Add fresh parsley.");
    await page.getByRole("button", { name: "Save recipe" }).click();

    await expect(page.getByRole("article").filter({ hasText: "Herb rice" })).toContainText("Add fresh parsley.");
    await page.reload();
    await expect(page.getByRole("article").filter({ hasText: "Herb rice" })).toContainText("★★★★☆");

    await page.getByRole("button", { name: "Edit Herb rice" }).click();
    await expect(page.getByLabel("Your rating")).toHaveValue("4");
    await page.getByLabel("Recipe name").fill("Parsley rice");
    await page.getByLabel("Your rating").selectOption("");
    await page.getByLabel("Notes OPTIONAL").fill("Finish with lemon.");
    await page.getByRole("button", { name: "Save recipe" }).click();

    const updatedCard = page.getByRole("article").filter({ hasText: "Parsley rice" });
    await expect(updatedCard).toContainText("Not rated");
    await expect(updatedCard).toContainText("Finish with lemon.");
    await page.reload();
    await expect(page.getByRole("article").filter({ hasText: "Parsley rice" })).toContainText("Finish with lemon.");
  });

  test("opens the recipe detail view from the card and shows its full recipe", async ({ page, request }) => {
    const response = await request.post("/api/recipes", {
      data: {
        name: "Roasted tomato soup",
        rating: 5,
        notes: "Serve warm.\nAdd fresh basil.",
        category: "Dinner",
        ingredients: ["Tomatoes", "Fresh basil"],
        steps: ["Roast the tomatoes.", "Blend until smooth."],
      },
    });
    expect(response.status()).toBe(201);
    const recipe = await response.json();

    await page.goto("/");
    const card = page.getByRole("article").filter({ hasText: "Roasted tomato soup" });
    await expect(card.getByRole("link", { name: "View Roasted tomato soup" })).toBeVisible();
    await expect(card).toContainText("★★★★★");
    await expect(card).toContainText("Serve warm.");
    await expect(card.locator(".recipe-ingredients, .recipe-steps")).toHaveCount(0);

    await card.click();
    await expect(page).toHaveURL(new RegExp(`/recipe\\.html\\?id=${recipe.id}$`));
    await expect(page.getByRole("heading", { name: "Roasted tomato soup" })).toBeVisible();
    await expect(page.locator("#detail-rating")).toContainText("5 out of 5");
    await expect(page.locator("#detail-category")).toHaveText("Dinner");
    await expect(page.locator("#detail-notes")).toHaveText("Serve warm.\nAdd fresh basil.");
    await expect(page.locator("#detail-ingredients li")).toHaveText(["Tomatoes", "Fresh basil"]);
    await expect(page.locator("#detail-steps li")).toHaveText([
      "Roast the tomatoes.",
      "Blend until smooth.",
    ]);
    await page.getByRole("link", { name: "Edit recipe" }).click();
    await expect(page).toHaveURL(new RegExp(`/\\?edit=${recipe.id}$`));
    await expect(page.locator("#recipe-dialog")).toBeVisible();
  });

  test("adds, edits, displays, and removes cooking details", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Add a recipe" }).click();
    await page.getByLabel("Recipe name").fill("Roast chicken");
    await page.getByLabel("Cooking time in minutes OPTIONAL").fill("90");
    await page.getByLabel("Cooking temperature in °F OPTIONAL").fill("375.5");
    await page.getByLabel("Servings OPTIONAL").fill("4");
    await page.getByRole("button", { name: "Save recipe" }).click();

    await page.getByRole("link", { name: "View Roast chicken" }).click();
    await expect(page.locator("#detail-cooking-time")).toHaveText("90 minutes");
    await expect(page.locator("#detail-cooking-temperature")).toHaveText("375.5 °F");
    await expect(page.locator("#detail-servings")).toHaveText("4");
    await page.reload();
    await expect(page.locator("#detail-cooking-section")).toBeVisible();

    await page.getByRole("link", { name: "Edit recipe" }).click();
    await expect(page.getByLabel("Cooking time in minutes OPTIONAL")).toHaveValue("90");
    await expect(page.getByLabel("Cooking temperature in °F OPTIONAL")).toHaveValue("375.5");
    await expect(page.getByLabel("Servings OPTIONAL")).toHaveValue("4");
    await page.getByLabel("Cooking time in minutes OPTIONAL").fill("75");
    await page.getByLabel("Cooking temperature in °F OPTIONAL").fill("400");
    await page.getByLabel("Servings OPTIONAL").fill("6");
    await page.getByRole("button", { name: "Save recipe" }).click();

    await page.getByRole("link", { name: "View Roast chicken" }).click();
    await expect(page.locator("#detail-cooking-time")).toHaveText("75 minutes");
    await expect(page.locator("#detail-cooking-temperature")).toHaveText("400 °F");
    await expect(page.locator("#detail-servings")).toHaveText("6");

    await page.getByRole("link", { name: "Edit recipe" }).click();
    await page.getByLabel("Cooking time in minutes OPTIONAL").fill("");
    await page.getByLabel("Cooking temperature in °F OPTIONAL").fill("");
    await page.getByLabel("Servings OPTIONAL").fill("");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await page.getByRole("link", { name: "View Roast chicken" }).click();
    await expect(page.locator("#detail-cooking-section")).toBeHidden();
  });

  test("adds, edits, removes, and reorders numbered recipe steps", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Add a recipe" }).click();
    await page.getByLabel("Recipe name").fill("Vegetable soup");
    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByRole("textbox", { name: "Step 1", exact: true }).fill("Chop the vegetables.");
    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByRole("textbox", { name: "Step 2", exact: true }).fill("Simmer until tender.");
    await page.getByRole("button", { name: "Save recipe" }).click();

    await page.getByRole("link", { name: "View Vegetable soup" }).click();
    await expect(page.locator("#detail-steps li")).toHaveText([
      "Chop the vegetables.",
      "Simmer until tender.",
    ]);

    await page.goto("/");
    await page.getByRole("button", { name: "Edit Vegetable soup" }).click();
    await page.getByRole("button", { name: "Move step 2 up" }).click();
    await page.getByRole("textbox", { name: "Step 1", exact: true }).fill("Simmer until soft.");
    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByRole("textbox", { name: "Step 3", exact: true }).fill("Season and serve.");
    await page.getByRole("button", { name: "Remove step 2", exact: true }).click();
    await page.getByRole("button", { name: "Save recipe" }).click();

    await page.getByRole("link", { name: "View Vegetable soup" }).click();
    await expect(page.locator("#detail-steps li")).toHaveText([
      "Simmer until soft.",
      "Season and serve.",
    ]);
    await page.reload();
    await expect(page.locator("#detail-steps li")).toHaveText([
      "Simmer until soft.",
      "Season and serve.",
    ]);

    await page.getByRole("link", { name: "Edit recipe" }).click();
    await expect(page).toHaveURL(/\/\?edit=/);
    await page.getByRole("button", { name: "Remove step 2", exact: true }).click();
    await page.getByRole("button", { name: "Remove step 1", exact: true }).click();
    await page.getByRole("button", { name: "Save recipe" }).click();
    await page.getByRole("link", { name: "View Vegetable soup" }).click();
    await expect(page.locator("#detail-steps-section")).toBeHidden();
  });

  test("adds, edits, removes, and reorders bulleted recipe ingredients", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Add a recipe" }).click();
    await page.getByLabel("Recipe name").fill("Garden salad");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient 1", exact: true }).fill("Lettuce");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient 2", exact: true }).fill("Tomatoes");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient 3", exact: true }).fill("Cucumber");
    await page.getByRole("button", { name: "Save recipe" }).click();

    await page.getByRole("link", { name: "View Garden salad" }).click();
    await expect(page.locator("#detail-ingredients li")).toHaveText([
      "Lettuce",
      "Tomatoes",
      "Cucumber",
    ]);

    await page.goto("/");
    await page.getByRole("button", { name: "Edit Garden salad" }).click();
    await page.getByRole("button", { name: "Move ingredient 3 up" }).click();
    await page.getByRole("button", { name: "Move ingredient 2 up" }).click();
    await page.getByRole("textbox", { name: "Ingredient 3", exact: true }).fill("Cherry tomatoes");
    await page.getByRole("button", { name: "Remove ingredient 2", exact: true }).click();
    await page.getByRole("button", { name: "Save recipe" }).click();

    await page.getByRole("link", { name: "View Garden salad" }).click();
    await expect(page.locator("#detail-ingredients li")).toHaveText([
      "Cucumber",
      "Cherry tomatoes",
    ]);
    await page.reload();
    await expect(page.locator("#detail-ingredients li")).toHaveText([
      "Cucumber",
      "Cherry tomatoes",
    ]);

    await page.getByRole("link", { name: "Edit recipe" }).click();
    await page.getByRole("button", { name: "Remove ingredient 2", exact: true }).click();
    await page.getByRole("button", { name: "Remove ingredient 1", exact: true }).click();
    await page.getByRole("button", { name: "Save recipe" }).click();
    await page.getByRole("link", { name: "View Garden salad" }).click();
    await expect(page.locator("#detail-ingredients-section")).toBeHidden();
  });

  test("shows a clear error and keeps the form open when saving fails", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Add a recipe" }).click();
    await page.getByLabel("Recipe name").fill("Unsaved soup");
    await page.route("**/api/recipes", (route) => route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Database unavailable." }),
    }));

    await page.getByRole("button", { name: "Save recipe" }).click();

    await expect(page.getByRole("alert")).toContainText("Your recipe could not be saved.");
    await expect(page.getByRole("alert")).toContainText("Database unavailable.");
    await expect(page.locator("#recipe-dialog")).toBeVisible();
    await expect(page.getByLabel("Recipe name")).toHaveValue("Unsaved soup");
  });

  test("requires confirmation before deleting a recipe", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Add a recipe" }).click();
    await page.getByLabel("Recipe name").fill("Delete me");
    await page.getByRole("button", { name: "Save recipe" }).click();

    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Delete Delete me" }).click();
    await expect(page.getByRole("article").filter({ hasText: "Delete me" })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete Delete me" }).click();
    await expect(page.getByRole("heading", { name: "Your recipe box is ready" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your recipe box is ready" })).toBeVisible();
  });

  test("shares categories and removes suggestions when their last recipe is uncategorized", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Add a recipe" }).click();
    await page.getByLabel("Recipe name").fill("Dinner soup");
    await page.getByLabel("Category OPTIONAL").fill("Dinner");
    await page.getByRole("button", { name: "Save recipe" }).click();

    await page.getByRole("button", { name: "Add a recipe" }).click();
    await expect(page.locator("#category-suggestions option")).toHaveAttribute("value", "Dinner");
    await page.getByLabel("Recipe name").fill("Dinner pasta");
    await page.getByLabel("Category OPTIONAL").fill("Dinner");
    await page.getByRole("button", { name: "Save recipe" }).click();

    await page.getByRole("button", { name: "Edit Dinner soup" }).click();
    await page.getByLabel("Category OPTIONAL").fill("");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.locator("#category-suggestions option")).toHaveCount(1);

    await page.getByRole("button", { name: "Edit Dinner pasta" }).click();
    await page.getByLabel("Category OPTIONAL").fill("");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.locator("#category-suggestions option")).toHaveCount(0);
  });

  test("filters by one category, uncategorized recipes, or all recipes", async ({ page, request }) => {
    for (const recipe of [
      { name: "Tomato soup", category: "Dinner" },
      { name: "Lemon tart", category: "Dessert" },
      { name: "Plain rice", category: null },
    ]) {
      const response = await request.post("/api/recipes", { data: recipe });
      expect(response.status()).toBe(201);
    }

    await page.goto("/");
    const filter = page.getByRole("combobox", { name: "Filter recipes by category" });
    await expect(filter.locator("option")).toHaveCount(4);
    await filter.selectOption("category:Dinner");
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.locator("#recipe-count")).toHaveText("1");
    await expect(page.getByRole("heading", { name: "Tomato soup" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lemon tart" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Plain rice" })).toHaveCount(0);

    await filter.selectOption("uncategorized");
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Plain rice" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tomato soup" })).toHaveCount(0);

    await filter.selectOption("");
    await expect(page.getByRole("article")).toHaveCount(3);
    await expect(page.locator("#recipe-count")).toHaveText("3");
  });

  test("sorts recipes by title and shows 20 recipes per page", async ({ page, request }) => {
    for (let index = 25; index > 0; index -= 1) {
      const response = await request.post("/api/recipes", {
        data: { name: `Recipe ${index}` },
      });
      expect(response.status()).toBe(201);
    }

    await page.goto("/");
    const recipeTitles = page.locator(".recipe-card h3");
    const pagination = page.locator("#recipe-pagination");
    const expectedTitles = (start, end) => Array.from(
      { length: end - start + 1 },
      (_, index) => `Recipe ${start + index}`,
    );

    await expect(recipeTitles).toHaveText(expectedTitles(1, 20));
    await expect(page.locator("#recipe-count")).toHaveText("25");
    await expect(pagination).toBeVisible();
    await expect(page.locator("#recipe-page-status")).toHaveText("Page 1 of 2");
    await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();

    await page.getByRole("button", { name: "Next" }).click();
    await expect(recipeTitles).toHaveText(expectedTitles(21, 25));
    await expect(page.locator("#recipe-page-status")).toHaveText("Page 2 of 2");
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

    await page.getByRole("button", { name: "Previous" }).click();
    await expect(recipeTitles).toHaveText(expectedTitles(1, 20));
    await page.getByRole("searchbox", { name: "Search recipes" }).fill("Recipe 25");
    await expect(recipeTitles).toHaveText(["Recipe 25"]);
    await expect(pagination).toBeHidden();

    await page.getByRole("searchbox", { name: "Search recipes" }).fill("");
    await page.locator(".topbar .locale-trigger").click();
    await page.getByRole("button", { name: "Français (Québec)" }).click();
    await expect(pagination).toHaveAttribute("aria-label", "Pages de recettes");
    await expect(page.getByRole("button", { name: "Suivant" })).toBeVisible();
    await expect(page.locator("#recipe-page-status")).toHaveText("Page 1 sur 2");
  });

  test("searches contiguous text in titles and notes without case sensitivity", async ({ page, request }) => {
    for (const recipe of [
      { name: "Roasted Tomato Soup", notes: "Serve with crusty bread.", category: "Dinner" },
      { name: "Sunday Pasta", notes: "Finish with FRESH BASIL leaves.", category: "Dinner" },
      { name: "Lemon Tart", notes: "Chill before serving.", category: "Dessert" },
    ]) {
      const response = await request.post("/api/recipes", { data: recipe });
      expect(response.status()).toBe(201);
    }

    await page.goto("/");
    const search = page.getByRole("searchbox", { name: "Search recipes" });
    const categoryFilter = page.getByRole("combobox", { name: "Filter recipes by category" });

    await search.fill("TOMATO soup");
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Roasted Tomato Soup" })).toBeVisible();
    await expect(page.locator("#recipe-count")).toHaveText("1");

    await search.fill("fresh basil");
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Sunday Pasta" })).toBeVisible();

    await search.fill("fresh basil leaves");
    await expect(page.getByRole("article")).toHaveCount(1);
    await search.fill("basil fresh");
    await expect(page.getByRole("heading", { name: "No matching recipes" })).toBeVisible();
    await expect(page.locator("#recipe-count")).toHaveText("0");

    await search.fill("soup");
    await categoryFilter.selectOption("category:Dessert");
    await expect(page.getByRole("heading", { name: "No matching recipes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lemon Tart" })).toHaveCount(0);
    await expect(page.locator("#recipe-count")).toHaveText("0");
    await categoryFilter.selectOption("category:Dinner");
    await expect(page.getByRole("heading", { name: "Roasted Tomato Soup" })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.locator("#recipe-count")).toHaveText("1");

    await search.fill("");
    await expect(page.getByRole("article")).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "Sunday Pasta" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lemon Tart" })).toHaveCount(0);
  });
});
